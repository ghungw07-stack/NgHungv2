import { sendMessageFromSQL } from "../../service-ngh/chat-zalo/chat-style/chat-style.js";
import { groupSettingsAll } from "../../automations/event-send-msg.js";
import { isAdmin } from "../../index.js";

export async function handleTagReactionCommand(api, message, groupSettings) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const botId = api.getBotId();

  // Kiểm tra quyền admin bot
  const isAdminBot = isAdmin(botId, senderId, threadId);
  if (!isAdminBot) {
    const result = {
      success: false,
      message: "❌ Chỉ quản trị viên bot mới có thể sử dụng lệnh này!",
    };
    await sendMessageFromSQL(api, message, result, true, 10000);
    return false;
  }

  // Khởi tạo setting nếu chưa có
  if (!groupSettings[threadId]) {
    groupSettings[threadId] = {};
  }

  // Parse sub-command theo kiểu parts[1] như anti-all.js
  const rawText = (message?.data?.content || "").toString().trim();
  const parts = rawText.split(/\s+/);
  const arg = (parts[1] || "").toLowerCase();

  const currentSetting = groupSettings[threadId].tagReaction || false;
  let newStatus;
  if (["on", "bật", "bat", "enable", "enabled"].includes(arg)) {
    newStatus = true;
  } else if (["off", "tắt", "tat", "disable", "disabled"].includes(arg)) {
    newStatus = false;
  } else {
    // Không có tham số hợp lệ -> toggle
    newStatus = !currentSetting;
  }

  groupSettings[threadId].tagReaction = newStatus;
  groupSettingsAll.setChanged();

  const statusText = groupSettings[threadId].tagReaction ? "Bật" : "Tắt";
  const statusEmoji = groupSettings[threadId].tagReaction ? "✅" : "❌";

  const result = {
    success: true,
    message: `${statusEmoji} Đã ${statusText} thả reaction khi được tag!`,
  };

  await sendMessageFromSQL(api, message, result, true, 10000);
  return true;
}
