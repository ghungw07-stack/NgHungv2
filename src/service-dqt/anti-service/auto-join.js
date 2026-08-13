import schedule from "node-schedule";
import { sendMessageStateQuote, sendMessageCompleteRequest } from "../chat-zalo/chat-style/chat-style.js";
import { isInWhiteList } from "./white-list.js";
import { scanQRCode } from "../utilities/qr-scan.js";
import { getDataAllGroup } from "../info-service/group-info.js";
import { getGlobalPrefix } from "../../service-dqt/service.js";
import fs from "fs";
import path from "path";

function getQRContent(data) {
  if (!data) return null;
  if (typeof data === "string") return data;
  if (typeof data.content === "string") return data.content;
  if (typeof data.url === "string") return data.url;
  if (typeof data.text === "string") return data.text;
  return null;
}

const requestAutoJoinMap = new Map();
const WAITING_ACTION_JOIN_GROUP = 30000;
const AUTO_JOIN_INTERVAL = 2 * 60 * 1000;
const AUTO_JOIN_QUEUE_PATH = path.join(process.cwd(), "assets", "data", "autojoin-queue.json");
const autoJoinApis = new Map();
let isProcessingQueue = false;

function readAutoJoinQueue() {
  try {
    const value = JSON.parse(fs.readFileSync(AUTO_JOIN_QUEUE_PATH, "utf8"));
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

let autoJoinQueue = readAutoJoinQueue();

function saveAutoJoinQueue() {
  fs.mkdirSync(path.dirname(AUTO_JOIN_QUEUE_PATH), { recursive: true });
  fs.writeFileSync(AUTO_JOIN_QUEUE_PATH, `${JSON.stringify(autoJoinQueue, null, 2)}\n`, "utf8");
}

function queueJoinLink(api, link) {
  const botId = String(api.getBotId());
  const normalizedLink = normalizeLink(link);
  if (!normalizedLink) return { queued: false, reason: "invalid" };

  const queue = Array.isArray(autoJoinQueue[botId]) ? autoJoinQueue[botId] : [];
  if (queue.some((item) => item.link === normalizedLink)) {
    return { queued: false, reason: "duplicate" };
  }

  const now = Date.now();
  const lastRunAt = queue.reduce((max, item) => Math.max(max, Number(item.runAt) || 0), 0);
  const runAt = Math.max(now + AUTO_JOIN_INTERVAL, lastRunAt + AUTO_JOIN_INTERVAL);
  queue.push({ link: normalizedLink, queuedAt: now, runAt });
  autoJoinQueue[botId] = queue;
  saveAutoJoinQueue();
  return { queued: true, runAt, position: queue.length };
}

function isGroupChatLocked(groupInfo) {
  const value = groupInfo?.setting?.lockSendMsg ?? groupInfo?.lockSendMsg;
  return value === true || Number(value) === 1;
}

async function processAutoJoinQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;
  try {
    const now = Date.now();
    for (const [botId, queueValue] of Object.entries(autoJoinQueue)) {
      const api = autoJoinApis.get(String(botId));
      const queue = Array.isArray(queueValue) ? queueValue : [];
      if (!api || !queue.length || Number(queue[0].runAt) > now) continue;

      // Mỗi bot chỉ xử lý đúng một nhóm trong một lượt 2 phút.
      const item = queue.shift();
      if (queue.length) {
        queue[0].runAt = Math.max(Number(queue[0].runAt) || 0, now + AUTO_JOIN_INTERVAL);
      }
      if (queue.length) autoJoinQueue[botId] = queue;
      else delete autoJoinQueue[botId];
      saveAutoJoinQueue();

      try {
        const groupInfo = await api.getGroupInfoByLink(item.link);
        if (isGroupChatLocked(groupInfo)) {
          continue;
        }
        await api.joinGroup(item.link);
      } catch (error) {
        console.warn("[AutoJoin] Xử lý link trong hàng đợi thất bại:", error?.message || error);
      }
    }
  } finally {
    isProcessingQueue = false;
  }
}

// Kiểm tra thường xuyên nhưng runAt đảm bảo mỗi nhóm cách nhau tối thiểu 2 phút.
const autoJoinQueueTimer = setInterval(processAutoJoinQueue, 15 * 1000);
autoJoinQueueTimer.unref?.();

schedule.scheduleJob("*/5 * * * * *", () => {
  const currentTime = Date.now();
  for (const [msgId, data] of requestAutoJoinMap.entries()) {
    if (currentTime - data.timestamp > WAITING_ACTION_JOIN_GROUP) {
      requestAutoJoinMap.delete(msgId);
    }
  }
});

function normalizeLink(link) {
  if (!link || typeof link !== "string") return null;

  let trimmed = link.replace(/[\s\u200B-\u200D\uFEFF]/g, "");
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();

    if ((host === "zaloapp.com" || host === "www.zaloapp.com") && path.startsWith("/qr/g/")) {
      const groupId = path.match(/\/qr\/g\/([a-z0-9]+)/i)?.[1];
      return groupId ? `https://zalo.me/g/${groupId}` : null;
    }

    if (host === "zalo.me" || host === "www.zalo.me") {
      const groupId = path.match(/\/g\/([a-z0-9]+)/i)?.[1];
      return groupId ? `https://zalo.me/g/${groupId}` : null;
    }

    return null;
  } catch {
    const sanitized = trimmed.replace(/[^\w\-.:\/?=&]/g, "").toLowerCase();
    const zaloAppGroupId = sanitized.match(
      /^(?:https?:\/\/)?(?:www\.)?zaloapp\.com\/qr\/g\/([a-z0-9]+)/
    )?.[1];
    if (zaloAppGroupId) return `https://zalo.me/g/${zaloAppGroupId}`;

    const zaloGroupId = sanitized.match(
      /^(?:https?:\/\/)?(?:www\.)?zalo\.me\/g\/([a-z0-9]+)/
    )?.[1];
    if (zaloGroupId) return `https://zalo.me/g/${zaloGroupId}`;

    return null;
  }
}

function extractLinkFromMessage(message) {
  const msgType = message.data.msgType;
  const content = message.data.content;

  if (msgType === "chat.recommended") {
    return content?.href || null;
  }

  if (msgType === "chat.photo") {
    return content?.href || null;
  }

  if (typeof content === 'string') {
    const trimmed = content.trim();
    const links = trimmed.match(/(?:https?:\/\/|www\.)[^\s/$.?#].[^\s]*|\b[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?/gi) || [];
    return links.find(l => l.includes('zalo.me/g/') || l.includes('zaloapp.com/qr/g/')) || null;
  }

  return null;
}

export async function autoJoinGroup(api, message, groupSettings, botIsAdminBox, isSelf) {
  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  autoJoinApis.set(String(api.getBotId()), api);

  // Do not react to a link emitted by the bot itself.
  if (isSelf) {
    return false;
  }

  if (isInWhiteList(groupSettings, threadId, senderId)) {
    return false;
  }

  if (!groupSettings[threadId]?.autoJoinGroup) {
    return false;
  }

  let link = extractLinkFromMessage(message);

  if (message.data.msgType === "chat.photo" && link) {
    try {
      const result = await scanQRCode(link, { silent: true });
      if (result.success) {
        const qrContent = getQRContent(result.data);
        if (qrContent) {
          link = qrContent;
        }
      }
    } catch (error) {
      // Ignore QR scan errors
    }
  }

  if (link) {
    const result = queueJoinLink(api, link);
    return result.queued;
  }

  return false;
}

export async function handleAutoJoinCommand(api, message, groupSettings) {
  const { threadId } = message;
  autoJoinApis.set(String(api.getBotId()), api);
  const args = message.data.content.trim().split(/\s+/);
  const subCommand = args[1]?.toLowerCase();
  const target = args[2]?.toLowerCase();

  const prefix = getGlobalPrefix(api.getBotId());
  const usageText =
    `⚠️ Vui lòng dùng:\n` +
    `${prefix}autojoin on - Bật AutoJoin cho nhóm hiện tại\n` +
    `${prefix}autojoin off - Tắt AutoJoin cho nhóm hiện tại\n` +
    `${prefix}autojoin add all - Bật AutoJoin cho tất cả nhóm\n` +
    `${prefix}autojoin off all - Tắt AutoJoin cho tất cả nhóm`;

  if (!subCommand) {
    await sendMessageStateQuote(api, message, usageText, false, 60000);
    return true;
  }

  if (subCommand === "add" && target === "all") {
    const groups = await getDataAllGroup(api);
    for (const group of groups) {
      if (!groupSettings[group.groupId]) {
        groupSettings[group.groupId] = {};
      }
      groupSettings[group.groupId].autoJoinGroup = true;
    }
    await sendMessageCompleteRequest(api, message, { caption: `✅ Đã bật AutoJoin cho tất cả nhóm!` }, 30000);
    return true;
  }

  if (subCommand === "off" && target === "all") {
    const groups = await getDataAllGroup(api);
    for (const group of groups) {
      if (!groupSettings[group.groupId]) continue;
      groupSettings[group.groupId].autoJoinGroup = false;
    }
    await sendMessageCompleteRequest(api, message, { caption: `❌ Đã tắt AutoJoin cho tất cả nhóm!` }, 30000);
    return true;
  }

  if (subCommand === "on") {
    if (!groupSettings[threadId]) {
      groupSettings[threadId] = {};
    }
    if (groupSettings[threadId].autoJoinGroup) {
      await sendMessageStateQuote(api, message, "⚠️ AutoJoin đã bật từ trước!", false, 30000);
      return true;
    }
    groupSettings[threadId].autoJoinGroup = true;
    await sendMessageStateQuote(api, message, "✅ AutoJoin đã được bật cho nhóm này!", true, 30000);
    return true;
  }

  if (subCommand === "off") {
    if (!groupSettings[threadId]) {
      groupSettings[threadId] = {};
    }
    groupSettings[threadId].autoJoinGroup = false;
    await sendMessageStateQuote(api, message, "❌ Chức năng AutoJoin đã được tắt cho nhóm này!", false, 30000);
    return true;
  }

  await sendMessageStateQuote(api, message, usageText, false, 60000);
  return true;
}

export async function handleReactionConfirmAutoJoin(api, reaction) {
  const msgId = reaction.data.content.rMsg[0].gMsgID.toString();
  const data = requestAutoJoinMap.get(msgId);
  if (!data) return false;

  const senderId = reaction.data.uidFrom;
  if (senderId !== data.message.data.uidFrom) return false;

  const rType = reaction.data.content.rType;
  if (rType !== 5) return false;

  const message = data.message;
  const threadId = message.threadId;
  requestAutoJoinMap.delete(msgId);

  if (data.action === "enable") {
    if (!message.groupSettings) {
      message.groupSettings = {};
    }
    if (!message.groupSettings[threadId]) {
      message.groupSettings[threadId] = {};
    }
    message.groupSettings[threadId].autoJoinGroup = true;
    await sendMessageStateQuote(api, message, "Chức năng tự động tham gia đã được bật!", true, 30000);
    return true;
  }

  return false;
}
