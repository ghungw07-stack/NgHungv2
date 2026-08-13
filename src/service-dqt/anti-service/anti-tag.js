import { MessageType } from "zlbotdqt";
import { sendMessageStateQuote } from "../chat-zalo/chat-style/chat-style.js";
import { isInWhiteList } from "./white-list.js";
import { removeMention } from "../../utils/format-util.js";

function checkTag(message) {
  const hasMentions = message.data.mentions && Array.isArray(message.data.mentions) && message.data.mentions.length > 0;
  const mentionCount = message.data.mentions ? message.data.mentions.length : 0;

  const content = message.data.content;
  if (typeof content !== 'string') {
    return { hasMentions, mentionCount, isHiddenTag: false };
  }

  const trimmedContent = content.trim();
  const isHiddenTag = hasMentions && trimmedContent.length === 0;

  return { hasMentions, mentionCount, isHiddenTag };
}

export async function antiTag(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf) {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const threadId = message.threadId;

  if (
    isSelf ||
    isAdminBox ||
    !botIsAdminBox ||
    isInWhiteList(groupSettings, threadId, senderId) ||
    !groupSettings[threadId]?.antiTag
  ) {
    return false;
  }

  const { hasMentions } = checkTag(message);

  if (!hasMentions) {
    return false;
  }

  try {
    const deleteResult = await api.deleteMessage(message, false);
    if (deleteResult && deleteResult.status === 0) {
      await api.sendMessage(
        { msg: `⚠️ Cảnh cáo ${senderName}!\nNhóm này không cho phép tag thành viên.`, ttl: 300000 },
        threadId,
        MessageType.GroupMessage
      );
      return true;
    } else {
      await api.sendMessage(
        {
          msg: `Không thể xóa tin nhắn tag của ${senderName} (có thể bot cần quyền admin).`,
          quote: message,
          ttl: 300000,
        },
        threadId,
        MessageType.GroupMessage
      );
      return false;
    }
  } catch (error) {
    return false;
  }
}

export async function handleAntiTagCommand(api, message, groupSettings) {
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
        : !groupSettings[threadId].antiTag;
  
  groupSettings[threadId].antiTag = newStatus;
  const statusText = newStatus ? "bật" : "tắt";
  const caption = `Chức năng chống tag đã được ${statusText}!`;
  await sendMessageStateQuote(api, message, caption, newStatus, 300000);
  
  return true;
}
