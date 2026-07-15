import { MessageMention, MessageType } from "zlbotdqt";
import { sendMessageStateQuote } from "../chat-zalo/chat-style/chat-style.js";
import { removeMention } from "../../utils/format-util.js";

let gifWarnings = {};
let gifCooldown = {};

export async function antiAllEffectGif(
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
  const msgType = message.data.msgType;

  if (
    isSelf ||
    isAdminBox ||
    !botIsAdminBox ||
    !groupSettings[threadId]?.antigif
  ) {
    return false;
  }

  const currentTime = Date.now();
  if (gifCooldown[senderId] && currentTime - gifCooldown[senderId] < 1000) {
    return false;
  }
  gifCooldown[senderId] = currentTime;

  let isGif = false;

  if (content && typeof content === "object" && content.action === "recommend.gif") {
    isGif = true;
  }
  else if (msgType === "chat.gif" || msgType === "chat.recommended") {
    if (typeof content === "object" && content.href) {
      const link = content.href.toLowerCase();
      if (link.includes("dlfl.vn") || link.includes("giphy.com") || link.includes("tenor.com") || 
          link.includes(".gif") || link.includes("/gif/")) {
        isGif = true;
      }
    }
    else if (typeof content === "string") {
      const link = content.toLowerCase();
      if (link.includes("dlfl.vn") || link.includes("giphy.com") || link.includes("tenor.com") || 
          link.includes(".gif") || link.includes("/gif/")) {
        isGif = true;
      }
    }
  }
  else if (content && typeof content === "object") {
    const checkUrl = (url) => {
      if (!url) return false;
      const link = String(url).toLowerCase();
      return link.includes("dlfl.vn") || link.includes("giphy.com") || link.includes("tenor.com") || 
             link.includes(".gif") || link.includes("/gif/");
    };
    
    if (checkUrl(content.href) || checkUrl(content.oriUrl) || checkUrl(content.normalUrl)) {
      isGif = true;
    }
  }

  if (!isGif) {
    return false;
  }

  const threshold = groupSettings[threadId]?.rules?.rule_giflag?.threshold || 3;
  let isDeleteGif = false;

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

    isDeleteGif = true;
    await updateAllGifWarnings(
      api,
      message,
      threadId,
      senderId,
      senderName,
      threshold
    );
  } catch (error) {
    await api.sendMessage(
      {
        msg: `Lỗi khi xóa gif.`,
        ttl: 300000,
      },
      threadId,
      MessageType.GroupMessage
    );
    return false;
  }

  return isDeleteGif;
}

export async function handleAntiAllEffectGifCommand(api, message, groupSettings) {
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
        : !groupSettings[threadId].antigif;
  groupSettings[threadId].antigif = newStatus;
  const statusText = newStatus ? "bật" : "tắt";
  const caption = `Chức năng xóa gif đã được ${statusText}!`;
  await sendMessageStateQuote(api, message, caption, newStatus, 300000);
  return true;
}

async function blockAllUser(api, message, threadId, senderId, senderName) {
  try {
    await api.blockUsers(threadId, [senderId]);
    await api.sendMessage(
      {
        msg: ``,
        quote: message,
      },
      threadId,
      MessageType.GroupMessage
    );

    await api.sendMessage(
      {
        msg: ``,
      },
      senderId,
      MessageType.DirectMessage
    );
  } catch (error) {
  }
}

async function updateAllGifWarnings(
  api,
  message,
  threadId,
  senderId,
  senderName,
  threshold
) {
  const currentTime = Date.now();
  if (!gifWarnings[senderId]) {
    gifWarnings[senderId] = [];
  }

  gifWarnings[senderId] = gifWarnings[senderId].filter(
    (time) => currentTime - time < 20 * 60 * 1000
  );
  gifWarnings[senderId].push(currentTime);

  const warnCount = gifWarnings[senderId].length;

  if (warnCount >= threshold) {
    try {
      await blockAllUser(api, message, threadId, senderId, senderName);
      gifWarnings[senderId] = [];
    } catch (error) {
    }
  } else {
    let caption = `⚠️ Cảnh cáo ${senderName}!\nỞ đây cấm gửi gif`;
    if (warnCount === threshold - 1) {
      caption = `⚠️ Cảnh cáo ${senderName}!\nNgừng gửi gif, trước khi bị chặn khỏi nhóm!`;
    }

    await api.sendMessage(
      {
        msg: caption,
        mentions: [
          MessageMention(senderId, senderName.length, "⚠️ Cảnh cáo ".length),
        ],
        quote: message,
        ttl: 300000,
      },
      threadId,
      MessageType.GroupMessage
    );
  }
}