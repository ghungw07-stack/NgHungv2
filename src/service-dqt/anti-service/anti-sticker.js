import { MessageMention, MessageType } from "zlbotdqt";
import { sendMessageStateQuote } from "../chat-zalo/chat-style/chat-style.js";
import { removeMention } from "../../utils/format-util.js";

let stickerWarnings = {};
let stickerCooldown = {};

export async function antiAllEffectSticker(
  api,
  message,
  isAdminBox,
  groupSettings,
  botIsAdminBox,
  isSelf
) {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const threadId = message.threadId;
  const content = message.data.content;

  if (
    isSelf ||
    isAdminBox ||
    !botIsAdminBox ||
    !groupSettings[threadId]?.antiSticker
  ) {
    return false;
  }

  const currentTime = Date.now();
  if (stickerCooldown[senderId] && currentTime - stickerCooldown[senderId] < 1000) {
    return false;
  }
  stickerCooldown[senderId] = currentTime;

  if (!content || typeof content !== "object") {
    return false;
  }

  const stickerId = content.id;
  const cateId = content.catId;
  if (!stickerId || !cateId) {
    return false;
  }

  const threshold = groupSettings[threadId]?.rules?.rule_stklag?.threshold || 3;

  try {
    const result = await api.deleteMessage(message, false);
    
    if (!result || result.status !== 0) {
      await api.sendMessage(
        {
          msg: `Nhờn với bố mày à ;!`,
          quote: message,
          ttl: 300000,
        },
        threadId,
        MessageType.GroupMessage
      );
      await blockAllUser(api, message, threadId, senderId, senderName);
      return true;
    }

    await updateAllStickerWarnings(
      api,
      message,
      threadId,
      senderId,
      senderName,
      threshold
    );
    return true;
  } catch (error) {
    await api.sendMessage(
      {
        msg: `Lỗi khi xóa sticker.`,
        ttl: 300000,
      },
      threadId,
      MessageType.GroupMessage
    );
    return false;
  }
}

export async function handleAntiAllEffectStickerCommand(api, message, groupSettings) {
  const threadId = message.threadId;
  const content = removeMention(message);
  const status = content.split(" ")[1]?.toLowerCase();
  if (!groupSettings[threadId]) {
    groupSettings[threadId] = {};
  }

  const newStatus =
    status === "on"
      ? true
      : status === "off"
        ? false
        : !groupSettings[threadId].antiSticker;
  groupSettings[threadId].antiSticker = newStatus;
  const statusText = newStatus ? "bật" : "tắt";
  const caption = `Chức năng xóa sticker đã được ${statusText}!`;
  await sendMessageStateQuote(api, message, caption, newStatus, 300000);
  return true;
}

async function blockAllUser(api, message, threadId, senderId, senderName) {
  try {
    await api.blockUsers(threadId, [senderId]);
  } catch (error) {
  }
}

async function updateAllStickerWarnings(
  api,
  message,
  threadId,
  senderId,
  senderName,
  threshold
) {
  const currentTime = Date.now();
  if (!stickerWarnings[senderId]) {
    stickerWarnings[senderId] = [];
  }

  const WARNING_WINDOW = 20 * 60 * 1000;
  stickerWarnings[senderId] = stickerWarnings[senderId]
    .filter((time) => currentTime - time < WARNING_WINDOW)
    .concat(currentTime);

  const warnCount = stickerWarnings[senderId].length;

  if (warnCount >= threshold) {
    try {
      await blockAllUser(api, message, threadId, senderId, senderName);
      stickerWarnings[senderId] = [];
    } catch (error) {
    }
  } else {
    const caption = warnCount === threshold - 1
      ? `⚠️ Cảnh cáo ${senderName}!\nNgừng gửi sticker, trước khi bị chặn khỏi nhóm!`
      : `⚠️ Cảnh cáo ${senderName}!\nỞ đây cấm gửi sticker`;

    await api.sendMessage(
      {
        msg: caption,
        mentions: [MessageMention(senderId, senderName.length, "⚠️ Cảnh cáo ".length)],
        quote: message,
        ttl: 300000,
      },
      threadId,
      MessageType.GroupMessage
    );
  }
}