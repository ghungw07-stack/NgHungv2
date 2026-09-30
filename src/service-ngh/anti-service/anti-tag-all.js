import { MessageMention, MessageType } from "../../api-zalo/index.js";
import { removeMention } from "../../utils/format-util.js";
import { sendMessageStateQuote } from "../chat-zalo/chat-style/chat-style.js";

const WARNING_LIMIT = 3;
const WARNING_RESET_MS = 30 * 60 * 1000;
const warningState = new Map();
const blockingUsers = new Set();

function stateKey(api, threadId, senderId) {
  return `${api.getBotId()}:${threadId}:${senderId}`;
}

function isWhitelisted(groupSettings, threadId, senderId) {
  return Boolean(groupSettings[threadId]?.whiteList?.[senderId]);
}

export function isTagAllMessage(message) {
  const mentions = message?.data?.mentions;
  return Array.isArray(mentions) && mentions.some((mention) => String(mention?.uid) === "-1");
}

function nextWarning(api, threadId, senderId, now = Date.now()) {
  const key = stateKey(api, threadId, senderId);
  const previous = warningState.get(key);
  const count = previous && now - previous.updatedAt < WARNING_RESET_MS ? previous.count + 1 : 1;
  if (count >= WARNING_LIMIT) warningState.delete(key);
  else warningState.set(key, { count, updatedAt: now });
  return count;
}

export function clearAntiTagAllState() {
  warningState.clear();
  blockingUsers.clear();
}

export async function handleAntiTagAllCommand(api, message, groupSettings) {
  const threadId = message.threadId;
  const status = removeMention(message).trim().split(/\s+/)[1]?.toLowerCase();
  if (!groupSettings[threadId]) groupSettings[threadId] = {};

  const enabled = status === "on"
    ? true
    : status === "off"
      ? false
      : !groupSettings[threadId].antiTagAll;
  groupSettings[threadId].antiTagAll = enabled;

  await sendMessageStateQuote(
    api,
    message,
    `Chức năng chống Tag All đã được ${enabled ? "bật" : "tắt"}!`,
    enabled,
    300000
  );
  return true;
}

export async function antiTagAll(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName || "Thành viên";

  if (
    isSelf ||
    isAdminBox ||
    !botIsAdminBox ||
    !groupSettings[threadId]?.antiTagAll ||
    isWhitelisted(groupSettings, threadId, senderId) ||
    !isTagAllMessage(message)
  ) {
    return false;
  }

  const count = nextWarning(api, threadId, senderId);
  if (count < WARNING_LIMIT) {
    const prefix = `⚠️ Cảnh cáo lần ${count}: `;
    const detail = count === 1
      ? "Không được dùng Tag All trong nhóm này."
      : "Nếu còn Tag All lần nữa, bot sẽ chặn bạn khỏi nhóm.";
    await api.sendMessage(
      {
        msg: `${prefix}@${senderName}\n${detail}`,
        mentions: [MessageMention(senderId, senderName.length + 1, prefix.length)],
        ttl: 30000,
      },
      threadId,
      MessageType.GroupMessage
    );
    return true;
  }

  const key = stateKey(api, threadId, senderId);
  if (blockingUsers.has(key)) return true;
  blockingUsers.add(key);
  try {
    await api.blockUsers(threadId, [senderId]);
    try { await api.deleteMessage(message, false); } catch {}
    await api.sendMessage(
      { msg: `🚫 Đã chặn ${senderName} khỏi nhóm vì Tag All sau 2 lần cảnh cáo.`, ttl: 300000 },
      threadId,
      MessageType.GroupMessage
    );
  } catch (error) {
    console.error("Lỗi khi xử lý Anti Tag All:", error?.message || error);
    await api.sendMessage(
      { msg: `Không thể chặn ${senderName}; hãy kiểm tra quyền quản trị của bot.`, quote: message, ttl: 30000 },
      threadId,
      MessageType.GroupMessage
    );
  } finally {
    const timer = setTimeout(() => blockingUsers.delete(key), 5000);
    timer.unref?.();
  }
  return true;
}
