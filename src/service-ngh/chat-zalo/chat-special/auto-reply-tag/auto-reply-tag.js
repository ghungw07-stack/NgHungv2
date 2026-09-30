import fs from "node:fs";
import path from "node:path";
import { JSON_DATA_PATH } from "../../../../utils/io-json.js";
import { MessageMention } from "../../../../api-zalo/index.js";
import { getGlobalPrefix } from "../../../service.js";
import { removeMention } from "../../../../utils/format-util.js";
import {
  sendMessageComplete,
  sendMessageWarning,
  sendMessageWarningRequest,
} from "../../chat-style/chat-style.js";

const CONFIG_FILE = path.join(JSON_DATA_PATH, "auto-reply-tag.json");

const DEFAULT_DELAY = 60_000;      // 1 phút
const DEFAULT_TIMERESET = 300_000; // 5 phút

const DELAY_MIN = 5_000;            // 5 giây
const DELAY_MAX = 60_000;           // 1 phút
const TIMERESET_MIN = 60_000;       // 1 phút
const TIMERESET_MAX = 1_800_000;    // 30 phút

function fmtMs(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}p ${sec}s`;
}

function parseDuration(str) {
  if (str == null) return null;
  const s = String(str).trim().toLowerCase();
  if (!s) return null;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const re = /(\d+)\s*(ms|d|h|p|m|s)/g;
  let total = 0;
  let matched = false;
  let lastIndex = 0;
  let m;
  while ((m = re.exec(s)) !== null) {
    matched = true;
    const n = parseInt(m[1], 10);
    const unit = m[2];
    let mult;
    switch (unit) {
      case "d": mult = 86_400_000; break;
      case "h": mult = 3_600_000; break;
      case "p":
      case "m": mult = 60_000; break;
      case "s": mult = 1_000; break;
      case "ms": mult = 1; break;
      default: return null;
    }
    total += n * mult;
    lastIndex = re.lastIndex;
  }
  if (!matched) return null;
  // Có ký tự dư sau cuối hợp lệ -> reject
  if (s.slice(lastIndex).replace(/\s+/g, "")) return null;
  return total;
}

function loadAll() {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8")) || {};
  } catch {
    return {};
  }
}

function saveAll(data) {
  fs.mkdirSync(JSON_DATA_PATH, { recursive: true });
  const temporaryFile = `${CONFIG_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryFile, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
  fs.renameSync(temporaryFile, CONFIG_FILE);
}

function getBotConfig(botId) {
  const all = loadAll();
  if (!all[botId]) {
    all[botId] = {
      settings: { delay: DEFAULT_DELAY, timereset: DEFAULT_TIMERESET },
      messages: [],
      threads: {},
    };
  }
  const cfg = all[botId];
  if (!cfg.settings) cfg.settings = { delay: DEFAULT_DELAY, timereset: DEFAULT_TIMERESET };
  if (typeof cfg.settings.delay !== "number") cfg.settings.delay = DEFAULT_DELAY;
  if (typeof cfg.settings.timereset !== "number") cfg.settings.timereset = DEFAULT_TIMERESET;
  if (!Array.isArray(cfg.messages)) cfg.messages = [];
  if (!cfg.threads || typeof cfg.threads !== "object") cfg.threads = {};
  return { all, cfg };
}

function pad2(n) {
  return n.toString().padStart(2, "0");
}

function applyPlaceholders(template, ctx) {
  const now = new Date();
  const t = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const d = `${pad2(now.getDate())}/${pad2(now.getMonth() + 1)}/${now.getFullYear()}`;
  const td = `${d} ${t}`;
  return String(template)
    .replace(/\{s\}/g, ctx.senderName || "")
    .replace(/\{td\}/g, td)
    .replace(/\{t\}/g, t)
    .replace(/\{d\}/g, d);
}

function parseIndexRange(str, maxLen) {
  const parts = String(str || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const set = new Set();
  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      set.add(parseInt(part, 10) - 1);
    } else if (/^\d+\s*-\s*\d+$/.test(part)) {
      const [a, b] = part.split("-").map((n) => parseInt(n.trim(), 10));
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      for (let i = lo; i <= hi; i++) set.add(i - 1);
    } else {
      return null;
    }
  }
  const arr = [...set].filter((i) => i >= 0 && i < maxLen).sort((x, y) => x - y);
  if (arr.length === 0) return null;
  return arr;
}

const cooldownMap = new Map();

function buildHelp(prefix, alias) {
  const cmd = `${prefix}${alias}`;
  return (
    `📖 Hướng dẫn sử dụng lệnh ${cmd}:\n\n` +
    `🔹 ${cmd} detail\n   → Xem chi tiết tác dụng của lệnh\n\n` +
    `🔹 ${cmd} config\n   → Cấu hình delay và timereset\n\n` +
    `🔹 ${cmd} list\n   → Xem danh sách nội dung trả lời tự động chung\n\n` +
    `🔹 ${cmd} add (nội dung)\n   → Thêm nội dung trả lời tự động chung\n\n` +
    `🔹 ${cmd} edit (index) (nội dung)\n   → Sửa nội dung trả lời tự động chung theo số thứ tự\n\n` +
    `🔹 ${cmd} remove (index)\n   → Xóa nội dung trả lời tự động chung theo số thứ tự\n\n` +
    `🔹 ${cmd} clear\n   → Xóa toàn bộ nội dung trả lời tự động chung\n\n` +
    `🔹 ${cmd} thread list/add/edit/remove/clear\n   → Quản lý nội dung theo từng threadId (nhóm)\n\n` +
    `🔹 ${cmd} thread delete (threadId)\n   → Xóa cấu hình threadId hiện tại (sẽ dùng messages chung)\n\n` +
    `📝 Placeholder:\n   • {s}: tên gửi\n   • {t}: giờ | {d}: ngày | {td}: ngày giờ đầy đủ\n\n` +
    `💡 Nếu threadId chưa cấu hình riêng sẽ dùng tin nhắn chung. Nếu có thì ưu tiên tin nhắn riêng.`
  );
}

const DETAIL_TEXT =
  `📝 Chi tiết lệnh Auto Reply Tag:\n` +
  `Tự động trả lời tin nhắn khi được tag @mention trong nhóm khi chủ tài khoản bận không tiện trả lời\n` +
  `   > Khi người dùng tag bot trong nhóm và chủ tài khoản không trả lời trong thời gian delay, bot sẽ tự động gửi thông điệp ngẫu nhiên từ danh sách setup.\n` +
  `   > Mỗi threadId (nhóm) có thể có cấu hình riêng, nếu không có sẽ dùng messages chung.`;

export async function handleAutoReplyTagCommand(api, message, aliasCommand) {
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const content = removeMention(message);
  const query = content.replace(`${prefix}${aliasCommand}`, "").trim();
  const tokens = query.length > 0 ? query.split(/\s+/) : [];

  if (tokens.length === 0) {
    await sendMessageComplete(api, message, buildHelp(prefix, aliasCommand), false, 300000);
    return;
  }

  const sub = tokens[0].toLowerCase();
  const { all, cfg } = getBotConfig(botId);

  if (sub === "detail") {
    await sendMessageComplete(api, message, DETAIL_TEXT, false, 300000);
    return;
  }

  if (sub === "config") {
    if (tokens.length < 2) {
      const text =
        `Cấu hình auto-reply tag hiện tại:\n` +
        `   > delay: ${fmtMs(cfg.settings.delay)}\n` +
        `   > timereset: ${fmtMs(cfg.settings.timereset)}\n\n` +
        `📝 Lưu ý:\n` +
        `   > delay: thời gian chờ chủ thể nhắn tin (tối thiểu 5s|tối đa 1 phút)\n` +
        `   > timereset: thời gian reset khoảng lặng của phiên chat (tối thiểu 1p|tối đa 30 phút)`;
      await sendMessageComplete(api, message, text, false, 180000);
      return;
    }
    const key = tokens[1].toLowerCase();
    const rawValue = tokens.slice(2).join("").trim();
    if (!["delay", "timereset"].includes(key)) {
      await sendMessageWarning(api, message, `Key không hợp lệ. Dùng: delay hoặc timereset.`, true, 30000);
      return;
    }
    const value = parseDuration(rawValue);
    if (value == null || value < 0) {
      await sendMessageWarning(
        api,
        message,
        `Vui lòng nhập giá trị thời gian, ví dụ: 1p, 5p, 1h, 1d`,
        true,
        30000
      );
      return;
    }
    const min = key === "delay" ? DELAY_MIN : TIMERESET_MIN;
    const max = key === "delay" ? DELAY_MAX : TIMERESET_MAX;
    if (value < min || value > max) {
      await sendMessageWarning(
        api,
        message,
        `Giá trị ${key} phải trong khoảng ${fmtMs(min)} – ${fmtMs(max)}.`,
        true,
        30000
      );
      return;
    }
    cfg.settings[key] = value;
    saveAll(all);
    await sendMessageComplete(api, message, `Đã cập nhật ${key} = ${fmtMs(value)}`, true, 60000);
    return;
  }

  if (sub === "thread") {
    return handleThreadSub(api, message, tokens.slice(1), prefix, aliasCommand, all, cfg);
  }

  if (sub === "list") {
    if (cfg.messages.length === 0) {
      await sendMessageComplete(
        api,
        message,
        `📭 Danh sách rỗng. Dùng "${prefix}${aliasCommand} add <nội dung>" để thêm.`,
        false,
        180000
      );
      return;
    }
    const lines = cfg.messages.map((m, i) => `${i + 1}. ${m}`).join("\n");
    await sendMessageComplete(
      api,
      message,
      `Danh sách tin nhắn chung (${cfg.messages.length}):\n${lines}`,
      false,
      300000
    );
    return;
  }

  if (sub === "add") {
    const body = tokens.slice(1).join(" ").trim();
    if (!body) {
      await sendMessageWarningRequest(
        api,
        message,
        { caption: `Nội dung rỗng. Dùng: ${prefix}${aliasCommand} add <nội dung>` },
        30000
      );
      return;
    }
    cfg.messages.push(body);
    saveAll(all);
    await sendMessageComplete(
      api,
      message,
      `Đã thêm auto-reply tag chung:\n   > ${body}\n📊 Tổng: ${cfg.messages.length} tin nhắn.`,
      true,
      60000
    );
    return;
  }

  if (sub === "edit") {
    const idx = parseInt(tokens[1], 10) - 1;
    const body = tokens.slice(2).join(" ").trim();
    if (isNaN(idx) || idx < 0 || idx >= cfg.messages.length) {
      await sendMessageWarning(api, message, `Index không tồn tại trong danh sách!`, true, 30000);
      return;
    }
    if (!body) {
      await sendMessageWarningRequest(api, message, { caption: `Nội dung mới rỗng.` }, 30000);
      return;
    }
    const oldBody = cfg.messages[idx];
    cfg.messages[idx] = body;
    saveAll(all);
    await sendMessageComplete(
      api,
      message,
      `Đã sửa [${idx + 1}]\nTừ: ${oldBody}\nThành: ${body}`,
      true,
      60000
    );
    return;
  }

  if (sub === "remove") {
    const rangeStr = tokens.slice(1).join("").trim();
    if (!rangeStr) {
      await sendMessageWarning(
        api,
        message,
        `Vui lòng nhập index cần xóa!\nVí dụ: ${prefix}${aliasCommand} remove 1-5,7,10`,
        true,
        30000
      );
      return;
    }
    const indices = parseIndexRange(rangeStr, cfg.messages.length);
    if (!indices || indices.length === 0) {
      await sendMessageWarning(api, message, `Index không tồn tại trong danh sách!`, true, 30000);
      return;
    }
    const removed = [];
    for (let i = indices.length - 1; i >= 0; i--) {
      const idx = indices[i];
      const body = cfg.messages.splice(idx, 1)[0];
      removed.unshift({ idx: idx + 1, body });
    }
    saveAll(all);
    const lines = removed.map((r) => `   > [${r.idx}] ${r.body}`).join("\n");
    await sendMessageComplete(
      api,
      message,
      `Đã xóa ${removed.length} auto-reply tag chung:\n${lines}`,
      true,
      60000
    );
    return;
  }

  if (sub === "clear") {
    const count = cfg.messages.length;
    cfg.messages = [];
    saveAll(all);
    await sendMessageComplete(
      api,
      message,
      `Đã xóa toàn bộ ${count} auto-reply tag chung.`,
      true,
      60000
    );
    return;
  }

  await sendMessageComplete(api, message, buildHelp(prefix, aliasCommand), false, 180000);
}

async function handleThreadSub(api, message, tokens, prefix, aliasCommand, all, cfg) {
  const threadId = message.threadId;

  // Không có subcommand → tự thêm group hiện tại vào danh sách thread riêng
  if (tokens.length === 0) {
    if (!cfg.threads[threadId]) {
      cfg.threads[threadId] = { messages: [] };
      saveAll(all);
      await sendMessageComplete(
        api,
        message,
        `Đã thêm group ${threadId} vào danh sách thread riêng.\n` +
          `Dùng ${prefix}${aliasCommand} thread add <nội dung> để thêm tin nhắn riêng cho group.`,
        true,
        60000
      );
    } else {
      const count = (cfg.threads[threadId].messages || []).length;
      await sendMessageComplete(
        api,
        message,
        `Group ${threadId} đã có cấu hình riêng (${count} tin nhắn).\n` +
          `Dùng ${prefix}${aliasCommand} thread list/add/edit/remove/clear/delete để quản lý.`,
        false,
        60000
      );
    }
    return;
  }
  const op = tokens[0].toLowerCase();

  if (op === "delete") {
    const targetThreadId = tokens[1] || threadId;
    if (cfg.threads[targetThreadId]) {
      delete cfg.threads[targetThreadId];
      saveAll(all);
      await sendMessageComplete(
        api,
        message,
        `🗑️ Đã xóa cấu hình thread ${targetThreadId}. Nhóm sẽ dùng tin nhắn chung.`,
        true,
        60000
      );
    } else {
      await sendMessageComplete(
        api,
        message,
        `⚠️ Thread ${targetThreadId} chưa có cấu hình riêng.`,
        false,
        60000
      );
    }
    return;
  }

  if (!cfg.threads[threadId]) cfg.threads[threadId] = { messages: [] };
  const threadCfg = cfg.threads[threadId];
  if (!Array.isArray(threadCfg.messages)) threadCfg.messages = [];

  if (op === "list") {
    if (threadCfg.messages.length === 0) {
      await sendMessageComplete(
        api,
        message,
        `📭 Thread chưa có tin nhắn riêng. Dùng "${prefix}${aliasCommand} thread add <nội dung>" để thêm.`,
        false,
        180000
      );
      return;
    }
    const lines = threadCfg.messages.map((m, i) => `${i + 1}. ${m}`).join("\n");
    await sendMessageComplete(
      api,
      message,
      `📋 Tin nhắn riêng thread (${threadCfg.messages.length}):\n${lines}`,
      false,
      300000
    );
    return;
  }

  if (op === "add") {
    const body = tokens.slice(1).join(" ").trim();
    if (!body) {
      await sendMessageWarningRequest(api, message, { caption: `Nội dung rỗng.` }, 30000);
      return;
    }
    threadCfg.messages.push(body);
    saveAll(all);
    await sendMessageComplete(
      api,
      message,
      `Đã thêm auto-reply tag thread:\n   > ${body}\n📊 Tổng: ${threadCfg.messages.length} tin nhắn.`,
      true,
      60000
    );
    return;
  }

  if (op === "edit") {
    const idx = parseInt(tokens[1], 10) - 1;
    const body = tokens.slice(2).join(" ").trim();
    if (isNaN(idx) || idx < 0 || idx >= threadCfg.messages.length) {
      await sendMessageWarning(api, message, `Index không tồn tại trong danh sách!`, true, 30000);
      return;
    }
    if (!body) {
      await sendMessageWarningRequest(api, message, { caption: `Nội dung mới rỗng.` }, 30000);
      return;
    }
    const oldBody = threadCfg.messages[idx];
    threadCfg.messages[idx] = body;
    saveAll(all);
    await sendMessageComplete(
      api,
      message,
      `Đã sửa [${idx + 1}]\nTừ: ${oldBody}\nThành: ${body}`,
      true,
      60000
    );
    return;
  }

  if (op === "remove") {
    const rangeStr = tokens.slice(1).join("").trim();
    if (!rangeStr) {
      await sendMessageWarning(
        api,
        message,
        `Vui lòng nhập index cần xóa!\nVí dụ: ${prefix}${aliasCommand} thread remove 1-5,7,10`,
        true,
        30000
      );
      return;
    }
    const indices = parseIndexRange(rangeStr, threadCfg.messages.length);
    if (!indices || indices.length === 0) {
      await sendMessageWarning(api, message, `Index không tồn tại trong danh sách!`, true, 30000);
      return;
    }
    const removed = [];
    for (let i = indices.length - 1; i >= 0; i--) {
      const idx = indices[i];
      const body = threadCfg.messages.splice(idx, 1)[0];
      removed.unshift({ idx: idx + 1, body });
    }
    saveAll(all);
    const lines = removed.map((r) => `   > [${r.idx}] ${r.body}`).join("\n");
    await sendMessageComplete(
      api,
      message,
      `Đã xóa ${removed.length} auto-reply tag thread:\n${lines}`,
      true,
      60000
    );
    return;
  }

  if (op === "clear") {
    const count = threadCfg.messages.length;
    threadCfg.messages = [];
    saveAll(all);
    await sendMessageComplete(
      api,
      message,
      `Đã xóa toàn bộ ${count} auto-reply tag thread.`,
      true,
      60000
    );
    return;
  }

  await sendMessageWarningRequest(api, message, { caption: `Subcommand không hợp lệ: ${op}` }, 30000);
}
const pendingTimers = new Map(); // botId:threadId -> { timer }

export async function handleAutoReplyTag(api, message, isSelf) {
  const botId = api.getBotId();
  const threadId = message.threadId;

  if (isSelf) return false;

  const mentions = message.data?.mentions;
  if (!Array.isArray(mentions) || mentions.length === 0) return false;
  const botMentioned = mentions.some((m) => String(m.uid) === String(botId));
  if (!botMentioned) return false;

  const { cfg } = getBotConfig(botId);
  const threadCfg = cfg.threads[threadId];
  const list =
    threadCfg && Array.isArray(threadCfg.messages) && threadCfg.messages.length > 0
      ? threadCfg.messages
      : cfg.messages;
  if (!list || list.length === 0) {
    console.warn(`[autoreplytag] bot ${botId} thread ${threadId} bị tag nhưng danh sách tin nhắn rỗng`);
    return false;
  }

  const cooldownKey = `${botId}:${threadId}`;
  const last = cooldownMap.get(cooldownKey) || 0;
  const now = Date.now();
  if (now - last < cfg.settings.timereset) return false;

  if (pendingTimers.has(cooldownKey)) return false;

  const senderId = message.data.uidFrom;
  const senderName = message.data.dName || "bạn";
  const threadType = message.type;
  const quotedMsg = message; // giữ reference để reply quote tin tag

  const timer = setTimeout(async () => {
    pendingTimers.delete(cooldownKey);
    cooldownMap.set(cooldownKey, Date.now());

    const template = list[Math.floor(Math.random() * list.length)];
    const reply = applyPlaceholders(template, { senderName });

    try {
      await api.sendMessage(
        {
          msg: `@${senderName} ${reply}`,
          mentions: [MessageMention(senderId, senderName.length + 1, 0)],
          quote: quotedMsg,
          ttl: 0,
        },
        threadId,
        threadType
      );
    } catch (e) {
      console.error("[autoreplytag] sendMessage error:", e?.message || e);
    }
  }, cfg.settings.delay);

  timer.unref?.();
  pendingTimers.set(cooldownKey, { timer });
  return true;
}
