import { deleteMessageCustomer } from "../../commands/bot-manager/utilities.js";
import { removeMention } from "../../utils/format-util.js";
import { sendMessageStateQuote, sendMessageWarning } from "../chat-zalo/chat-style/chat-style.js";

export async function handleOnlyText(api, message, groupSettings) {
  const threadId = message.threadId;
  const content = removeMention(message);
  const parts = content.split(" ");

  if (parts.length === 1) {
    // Chuyển đổi trạng thái nếu không có đối số
    groupSettings[threadId].onlyText = !groupSettings[threadId].onlyText;
  } else if (parts[1] === "on") {
    groupSettings[threadId].onlyText = true;
  } else if (parts[1] === "off") {
    groupSettings[threadId].onlyText = false;
  } else {
    const caption = "Cú pháp không hợp lệ. Sử dụng !onlytext hoặc !onlytext on/off";
    await sendMessageWarning(api, message, caption);
    return false;
  }

  const status = groupSettings[threadId].onlyText ? "bật" : "tắt";
  const caption = `Chế độ chỉ cho phép tin nhắn văn bản đã được ${status}!`;
  await sendMessageStateQuote(api, message, caption, groupSettings[threadId].onlyText, 300000);

  return true;
}

export async function antiNotText(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf) {
  const threadId = message.threadId;
  const isPlainText = typeof message.data.content === "string";
  if (!botIsAdminBox || isAdminBox || isPlainText || isSelf) return false;

  if (groupSettings[threadId]?.onlyText && message.data.msgType !== "webchat") {
    try {
      await deleteMessageCustomer(api, message);
      return true;
    } catch (error) {
      console.error("Lỗi khi xóa tin nhắn không phải văn bản:", error);
      return false;
    }
  }

  //webchat - tin nhắn
  //chat.recommended - tin nhắn được gợi ý
  //chat.photo - hình ảnh
  //chat.video.msg - video
  //chat.sticker - sticker
  //chat.voice - voice
}
