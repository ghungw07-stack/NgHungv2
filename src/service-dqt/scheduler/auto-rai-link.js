import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import schedule from "node-schedule";
import { MessageType } from "zlbotdqt";
import { getGlobalPrefix } from "../service.js";
import { getGroupInfoData } from "../info-service/group-info.js";
import { removeMention } from "../../utils/format-util.js";
import {
  sendMessageComplete,
  sendMessageFailed,
  sendMessageWarning,
} from "../chat-zalo/chat-style/chat-style.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(MODULE_DIR, "../../..");
const DEFAULT_INTERVAL_MINUTES = 30;
const MIN_INTERVAL_MINUTES = 5;
const MAX_INTERVAL_MINUTES = 24 * 60;
const CROSS_COOLDOWN_MS = 5 * 60 * 1000;
const CROSS_CONFIRM_TIMEOUT_MS = 5 * 60 * 1000;
const MESSAGE_TTL = 10 * 60 * 1000;
const broadcastLocks = new Set();
const pendingCrossConfirmations = new Map();

function getConfigPath(botId) {
  return path.join(PROJECT_ROOT, "logs", String(botId), "autorailink.json");
}

function getDefaultConfig() {
  return {
    enabled: false,
    homeGroupId: "",
    homeGroupLink: "",
    content: "",
    replyContent: "✅ Đã chéo thành công! Bạn vào nhóm mình xem nha.",
    returnContent: "🔁 Link trả từ nhóm {group}:",
    intervalMinutes: DEFAULT_INTERVAL_MINUTES,
    whitelist: [],
    advertisedGroups: [],
    lastBroadcastAt: 0,
    lastCrossedAt: {},
  };
}

function normalizeConfig(rawConfig = {}) {
  const config = { ...getDefaultConfig(), ...rawConfig };
  config.homeGroupId = String(config.homeGroupId || "");
  config.homeGroupLink = String(config.homeGroupLink || "");
  config.content = String(config.content || "");
  config.replyContent = String(config.replyContent || getDefaultConfig().replyContent);
  config.returnContent = String(config.returnContent || getDefaultConfig().returnContent);
  config.intervalMinutes = Number(config.intervalMinutes) || DEFAULT_INTERVAL_MINUTES;
  config.whitelist = [...new Set((config.whitelist || []).map(String))];
  config.advertisedGroups = [...new Set((config.advertisedGroups || []).map(String))];
  config.lastCrossedAt = config.lastCrossedAt && typeof config.lastCrossedAt === "object"
    ? config.lastCrossedAt
    : {};
  return config;
}

function readConfig(botId) {
  try {
    return normalizeConfig(JSON.parse(fs.readFileSync(getConfigPath(botId), "utf8")));
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.error(`[AutoRaiLink] Không thể đọc cấu hình bot ${botId}:`, error);
    }
    return getDefaultConfig();
  }
}

function writeConfig(botId, config) {
  const filePath = getConfigPath(botId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(normalizeConfig(config), null, 2)}\n`);
}

async function resolveGroupId(api, input, fallbackGroupId = "") {
  const value = String(input || fallbackGroupId || "").trim();
  if (!value) return "";
  if (!/zalo\.me\/g\//i.test(value)) return value;

  let link = value;
  if (!/^https?:\/\//i.test(link)) link = `https://${link}`;
  const groupInfo = await api.getGroupInfoByLink(link);
  if (!groupInfo?.groupId) throw new Error(`Không lấy được ID từ link ${value}`);
  return String(groupInfo.groupId);
}

async function getGroupLink(api, groupId) {
  const result = await api.getLinkGroupByID(String(groupId));
  const link = result?.link;
  if (!link) throw new Error("Nhóm chưa bật link hoặc bot không lấy được link nhóm");
  return String(link).startsWith("http") ? String(link) : `https://${link}`;
}

async function getGroupName(api, groupId) {
  try {
    return (await getGroupInfoData(api, String(groupId)))?.name || String(groupId);
  } catch {
    return String(groupId);
  }
}

function formatTemplate(template, values) {
  return String(template || "").replace(/\{(name|group|link|home)\}/gi, (_, key) => values[key.toLowerCase()] || "");
}

function validateReady(config) {
  if (!config.homeGroupId) return "Chưa đặt nhóm nhận link. Hãy dùng `autorailink home` trong nhóm của bạn.";
  if (!config.content.trim()) return "Chưa đặt nội dung rải. Hãy dùng `autorailink content <nội dung>`.";
  return "";
}

function getBroadcastContent(config) {
  const content = config.content.trim();
  const homeGroupLink = config.homeGroupLink.trim();
  if (!homeGroupLink || content.includes(homeGroupLink)) return content;
  return `${content}\n${homeGroupLink}`;
}

async function getAllGroupIds(api) {
  const result = await api.getAllGroups();
  return Object.keys(result?.gridVerMap || {}).map(String);
}

export async function broadcastAutoRaiLink(api, { force = false } = {}) {
  const botId = String(api.getBotId());
  if (broadcastLocks.has(botId)) {
    return { skipped: true, reason: "Một lượt rải khác đang chạy." };
  }

  const config = readConfig(botId);
  if (!force && !config.enabled) return { skipped: true, reason: "AutoRaiLink đang tắt." };

  const notReadyReason = validateReady(config);
  if (notReadyReason) return { skipped: true, reason: notReadyReason };

  broadcastLocks.add(botId);
  try {
    const excluded = new Set([...config.whitelist, config.homeGroupId].filter(Boolean).map(String));
    const targetGroupIds = (await getAllGroupIds(api)).filter((groupId) => !excluded.has(groupId));
    if (!config.homeGroupLink) {
      try {
        config.homeGroupLink = await getGroupLink(api, config.homeGroupId);
      } catch {
      }
    }
    const broadcastContent = getBroadcastContent(config);
    const sent = [];
    const failed = [];

    for (const groupId of targetGroupIds) {
      try {
        await api.sendMessage({ msg: broadcastContent }, groupId, MessageType.GroupMessage);
        sent.push(groupId);
      } catch (error) {
        failed.push({ groupId, error: error?.message || String(error) });
      }
      await new Promise((resolve) => setTimeout(resolve, 700));
    }

    config.advertisedGroups = [...new Set([...config.advertisedGroups, ...sent])];
    config.lastBroadcastAt = Date.now();
    writeConfig(botId, config);
    return { skipped: false, sent, failed, totalTargets: targetGroupIds.length };
  } finally {
    broadcastLocks.delete(botId);
  }
}

function getUsage(prefix, aliasCommand) {
  const command = `${prefix}${aliasCommand}`;
  return (
    "🔗 AUTORAILINK - Tự động rải và chéo link\n\n" +
    `${command} home [ID/link] - Đặt nhóm nhận link (bỏ trống để lấy nhóm hiện tại)\n` +
    `${command} content <nội dung> - Đặt nội dung rải\n` +
    `${command} reply <nội dung> - Đặt câu trả lời người tag bot\n` +
    `${command} return <nội dung> - Đặt lời kèm link gửi về nhóm nhà\n` +
    `${command} interval <phút> - Đặt chu kỳ rải (tối thiểu ${MIN_INTERVAL_MINUTES} phút)\n` +
    `${command} wl add [ID/link...] - Thêm nhóm không rải\n` +
    `${command} wl remove [ID/link...] - Xóa nhóm khỏi WL\n` +
    `${command} wl list - Xem WL\n` +
    `${command} send - Rải ngay một lượt\n` +
    `${command} on|off - Bật/tắt tự động rải\n` +
    `${command} status - Xem cấu hình\n\n` +
    "Có thể dùng {name}, {group}, {link}, {home} trong nội dung reply/return."
  );
}

export async function handleAutoRaiLinkCommand(api, message, aliasCommand) {
  const botId = String(api.getBotId());
  const prefix = getGlobalPrefix(botId);
  const rawContent = removeMention(message);
  const invokedCommand = `${prefix}${aliasCommand}`;
  const commandIndex = rawContent.toLowerCase().indexOf(invokedCommand.toLowerCase());
  const input = commandIndex === -1
    ? ""
    : rawContent.slice(commandIndex + invokedCommand.length).trim();
  const [subCommandRaw, ...restArgs] = input.split(/\s+/).filter(Boolean);
  const subCommand = (subCommandRaw || "help").toLowerCase();
  const config = readConfig(botId);

  if (["help", "menu", "hdsd"].includes(subCommand)) {
    await sendMessageComplete(api, message, getUsage(prefix, aliasCommand), false, MESSAGE_TTL);
    return true;
  }

  if (["home", "nhom", "group"].includes(subCommand)) {
    if (message.type !== MessageType.GroupMessage && restArgs.length === 0) {
      await sendMessageFailed(api, message, "Hãy dùng lệnh trong nhóm hoặc nhập ID/link nhóm.", false, MESSAGE_TTL);
      return true;
    }
    try {
      const groupId = await resolveGroupId(api, restArgs[0], message.threadId);
      config.homeGroupId = groupId;
      if (!config.whitelist.includes(groupId)) config.whitelist.push(groupId);
      try {
        config.homeGroupLink = await getGroupLink(api, groupId);
      } catch {
        config.homeGroupLink = "";
      }
      writeConfig(botId, config);
      await sendMessageComplete(
        api,
        message,
        `✅ Đã đặt nhóm nhận link: ${await getGroupName(api, groupId)} (${groupId})\nNhóm này cũng đã được thêm vào WL.`,
        true,
        MESSAGE_TTL
      );
    } catch (error) {
      await sendMessageFailed(api, message, `Không đặt được nhóm nhận link: ${error.message}`, false, MESSAGE_TTL);
    }
    return true;
  }

  if (["content", "noidung"].includes(subCommand)) {
    const value = input.slice(subCommandRaw.length).trim();
    if (!value) {
      await sendMessageFailed(api, message, "Vui lòng nhập nội dung cần rải.", false, MESSAGE_TTL);
      return true;
    }
    config.content = value;
    writeConfig(botId, config);
    await sendMessageComplete(api, message, "✅ Đã cập nhật nội dung rải.", true, MESSAGE_TTL);
    return true;
  }

  if (["reply", "traloi"].includes(subCommand)) {
    const value = input.slice(subCommandRaw.length).trim();
    if (!value) {
      await sendMessageFailed(api, message, "Vui lòng nhập nội dung trả lời người tag bot.", false, MESSAGE_TTL);
      return true;
    }
    config.replyContent = value;
    writeConfig(botId, config);
    await sendMessageComplete(api, message, "✅ Đã cập nhật câu trả lời khi được tag.", true, MESSAGE_TTL);
    return true;
  }

  if (["return", "tra", "guilink"].includes(subCommand)) {
    const value = input.slice(subCommandRaw.length).trim();
    if (!value) {
      await sendMessageFailed(api, message, "Vui lòng nhập nội dung kèm link gửi về nhóm nhà.", false, MESSAGE_TTL);
      return true;
    }
    config.returnContent = value;
    writeConfig(botId, config);
    await sendMessageComplete(api, message, "✅ Đã cập nhật nội dung trả link.", true, MESSAGE_TTL);
    return true;
  }

  if (["interval", "time", "delay"].includes(subCommand)) {
    const minutes = Number(restArgs[0]);
    if (!Number.isInteger(minutes) || minutes < MIN_INTERVAL_MINUTES || minutes > MAX_INTERVAL_MINUTES) {
      await sendMessageFailed(
        api,
        message,
        `Số phút phải là số nguyên từ ${MIN_INTERVAL_MINUTES} đến ${MAX_INTERVAL_MINUTES}.`,
        false,
        MESSAGE_TTL
      );
      return true;
    }
    config.intervalMinutes = minutes;
    writeConfig(botId, config);
    await sendMessageComplete(api, message, `✅ Đã đặt chu kỳ rải mỗi ${minutes} phút.`, true, MESSAGE_TTL);
    return true;
  }

  if (["wl", "whitelist"].includes(subCommand)) {
    const action = (restArgs.shift() || "list").toLowerCase();
    if (["list", "show"].includes(action)) {
      if (config.whitelist.length === 0) {
        await sendMessageComplete(api, message, "📋 WL hiện đang trống.", false, MESSAGE_TTL);
        return true;
      }
      const lines = await Promise.all(
        config.whitelist.map(async (groupId, index) => `${index + 1}. ${await getGroupName(api, groupId)} (${groupId})`)
      );
      await sendMessageComplete(api, message, `📋 Nhóm không rải:\n${lines.join("\n")}`, false, MESSAGE_TTL);
      return true;
    }

    if (!["add", "remove", "del"].includes(action)) {
      await sendMessageFailed(api, message, "Dùng: wl add, wl remove hoặc wl list.", false, MESSAGE_TTL);
      return true;
    }

    const inputs = restArgs.length > 0 ? restArgs : [message.threadId];
    const resolvedIds = [];
    const errors = [];
    for (const value of inputs) {
      try {
        resolvedIds.push(await resolveGroupId(api, value, message.threadId));
      } catch (error) {
        errors.push(error.message);
      }
    }

    const changed = [];
    if (action === "add") {
      for (const groupId of resolvedIds) {
        if (groupId && !config.whitelist.includes(groupId)) {
          config.whitelist.push(groupId);
          changed.push(groupId);
        }
      }
    } else {
      for (const value of resolvedIds) {
        let groupId = value;
        const indexValue = Number(value);
        if (Number.isInteger(indexValue) && indexValue >= 1 && indexValue <= config.whitelist.length) {
          groupId = config.whitelist[indexValue - 1];
        }
        const index = config.whitelist.indexOf(groupId);
        if (index !== -1) {
          config.whitelist.splice(index, 1);
          changed.push(groupId);
        }
      }
      if (config.homeGroupId && !config.whitelist.includes(config.homeGroupId)) {
        config.whitelist.push(config.homeGroupId);
      }
    }

    writeConfig(botId, config);
    const verb = action === "add" ? "thêm vào" : "xóa khỏi";
    const errorText = errors.length ? `\n⚠️ Lỗi: ${errors.join("; ")}` : "";
    await sendMessageComplete(
      api,
      message,
      changed.length ? `✅ Đã ${verb} WL ${changed.length} nhóm.${errorText}` : `ℹ️ Không có thay đổi.${errorText}`,
      true,
      MESSAGE_TTL
    );
    return true;
  }

  if (["send", "rai", "run"].includes(subCommand)) {
    const result = await broadcastAutoRaiLink(api, { force: true });
    if (result.skipped) {
      await sendMessageFailed(api, message, result.reason, false, MESSAGE_TTL);
    } else {
      await sendMessageComplete(
        api,
        message,
        `✅ Rải xong: ${result.sent.length}/${result.totalTargets} nhóm.${result.failed.length ? `\n⚠️ Lỗi ${result.failed.length} nhóm.` : ""}`,
        true,
        MESSAGE_TTL
      );
    }
    return true;
  }

  if (["on", "bat"].includes(subCommand)) {
    const notReadyReason = validateReady(config);
    if (notReadyReason) {
      await sendMessageFailed(api, message, notReadyReason, false, MESSAGE_TTL);
      return true;
    }
    config.enabled = true;
    config.lastBroadcastAt = 0;
    writeConfig(botId, config);
    await sendMessageComplete(api, message, `✅ Đã bật AutoRaiLink, chu kỳ ${config.intervalMinutes} phút.`, true, MESSAGE_TTL);
    return true;
  }

  if (["off", "tat"].includes(subCommand)) {
    config.enabled = false;
    writeConfig(botId, config);
    await sendMessageWarning(api, message, "❌ Đã tắt AutoRaiLink.", false, MESSAGE_TTL);
    return true;
  }

  if (["status", "show", "info"].includes(subCommand)) {
    const homeName = config.homeGroupId ? await getGroupName(api, config.homeGroupId) : "Chưa đặt";
    await sendMessageComplete(
      api,
      message,
      `🔗 Trạng thái AutoRaiLink\n` +
        `• Hoạt động: ${config.enabled ? "✅ Bật" : "❌ Tắt"}\n` +
        `• Nhóm nhận link: ${homeName}${config.homeGroupId ? ` (${config.homeGroupId})` : ""}\n` +
        `• Chu kỳ: ${config.intervalMinutes} phút\n` +
        `• Nhóm WL: ${config.whitelist.length}\n` +
        `• Nhóm đã rải: ${config.advertisedGroups.length}\n` +
        `• Nội dung: ${config.content || "Chưa đặt"}`,
      false,
      MESSAGE_TTL
    );
    return true;
  }

  await sendMessageFailed(api, message, getUsage(prefix, aliasCommand), false, MESSAGE_TTL);
  return true;
}

export async function handleAutoRaiLinkMention(api, message, groupInfo = {}) {
  if (message.type !== MessageType.GroupMessage) return false;

  const botId = String(api.getBotId());
  const senderId = String(message.data?.uidFrom || "");
  const threadId = String(message.threadId || "");
  if (!senderId || senderId === botId || !threadId) return false;

  const mentions = Array.isArray(message.data?.mentions) ? message.data.mentions : [];
  if (!mentions.some((mention) => String(mention?.uid) === botId)) return false;

  const prefix = getGlobalPrefix(botId);
  const content = typeof message.data?.content === "string" ? message.data.content.trim() : "";
  if (prefix && content.startsWith(prefix)) return false;

  const config = readConfig(botId);
  if (!config.enabled || !config.homeGroupId) return false;
  if (threadId === config.homeGroupId || config.whitelist.includes(threadId)) return false;
  if (!config.advertisedGroups.includes(threadId)) return false;

  const now = Date.now();
  const lastCrossedAt = Number(config.lastCrossedAt[threadId] || 0);
  const groupName = groupInfo?.name || await getGroupName(api, threadId);
  const senderName = String(message.data?.dName || "bạn");

  if (now - lastCrossedAt < CROSS_COOLDOWN_MS) {
    await api.sendMessage(
      {
        msg: `✅ Nhóm này vừa chéo link thành công rồi, bạn vào nhóm mình xem nha.${
          config.homeGroupLink ? `\n${config.homeGroupLink}` : ""
        }`,
        quote: message,
      },
      threadId,
      MessageType.GroupMessage
    );
    return true;
  }

  const confirmationKey = `${botId}:${threadId}:${senderId}`;
  const pendingAt = Number(pendingCrossConfirmations.get(confirmationKey) || 0);
  if (!pendingAt || now - pendingAt > CROSS_CONFIRM_TIMEOUT_MS) {
    pendingCrossConfirmations.set(confirmationKey, now);
    await api.sendMessage(
      {
        msg: "🔁 Vui lòng tag bot thêm 1 lần nữa trong 5 phút để xác nhận chéo link.",
        quote: message,
      },
      threadId,
      MessageType.GroupMessage
    );
    return true;
  }
  pendingCrossConfirmations.delete(confirmationKey);

  try {
    const groupLink = await getGroupLink(api, threadId);
    if (!config.homeGroupLink) {
      try {
        config.homeGroupLink = await getGroupLink(api, config.homeGroupId);
      } catch {
      }
    }

    const values = {
      name: senderName,
      group: groupName,
      link: groupLink,
      home: config.homeGroupLink,
    };
    const returnText = formatTemplate(config.returnContent, values);
    const returnLink = /\{link\}/i.test(config.returnContent) ? "" : `\n${groupLink}`;
    await api.sendMessage(
      { msg: `${returnText}${returnLink}\n👤 Người chéo: ${senderName}`.trim() },
      config.homeGroupId,
      MessageType.GroupMessage
    );

    config.lastCrossedAt[threadId] = now;
    writeConfig(botId, config);

    const replyText = formatTemplate(config.replyContent, values);
    const replyHomeLink = config.homeGroupLink && !/\{home\}/i.test(config.replyContent)
      ? `\n${config.homeGroupLink}`
      : "";
    await api.sendMessage(
      { msg: `${replyText}${replyHomeLink}`.trim(), quote: message },
      threadId,
      MessageType.GroupMessage
    );
    return true;
  } catch (error) {
    console.error(`[AutoRaiLink] Không thể chéo link nhóm ${threadId}:`, error);
    await api.sendMessage(
      { msg: `⚠️ Chưa lấy được link nhóm này: ${error.message}`, quote: message },
      threadId,
      MessageType.GroupMessage
    );
    return true;
  }
}

export async function initAutoRaiLinkService(api) {
  const botId = String(api.getBotId());
  const scheduleKey = "autoRaiLinkService";
  if (api.apiInstance?.schedule?.[scheduleKey]) return;

  const job = schedule.scheduleJob("*/1 * * * *", async () => {
    try {
      const config = readConfig(botId);
      if (!config.enabled) return;
      const intervalMs = config.intervalMinutes * 60 * 1000;
      if (Date.now() - Number(config.lastBroadcastAt || 0) < intervalMs) return;
      const result = await broadcastAutoRaiLink(api);
      if (!result.skipped) {
        console.log(`[AutoRaiLink] Bot ${botId}: đã gửi ${result.sent.length}/${result.totalTargets} nhóm.`);
      }
    } catch (error) {
      console.error(`[AutoRaiLink] Lỗi lịch chạy bot ${botId}:`, error);
    }
  });

  if (api.apiInstance?.schedule) api.apiInstance.schedule[scheduleKey] = job;
  console.log(`[AutoRaiLink] Đã khởi tạo cho bot ${botId}.`);
}
