import { MessageMention, MessageType } from "zlbotdqt";
import schedule from "node-schedule";
import { sendMessageStateQuote } from "../chat-zalo/chat-style/chat-style.js";
import { isInWhiteList } from "./white-list.js";
import { removeMention } from "../../utils/format-util.js";

const userWarnings = new Map();
const kickedUsers = new Set();
const WARNING_RESET_TIME = 1800000; // 30 minutes

export async function handleAntiPhotoVideo(api, message, groupSettings, aliasCommand) {
  const threadId = message.threadId;
  const content = removeMention(message);
  const parts = content.split(" ");

  if (!groupSettings[threadId]) {
    groupSettings[threadId] = {};
  }

  if (parts.length === 1) {
    groupSettings[threadId].antiPhotoVideo = !groupSettings[threadId].antiPhotoVideo;
  } else if (parts[1] === "on") {
    groupSettings[threadId].antiPhotoVideo = true;
  } else if (parts[1] === "off") {
    groupSettings[threadId].antiPhotoVideo = false;
  }

  const status = groupSettings[threadId].antiPhotoVideo ? "bật" : "tắt";
  const caption = `Chế độ chống photo đã được ${status}!`;
  await sendMessageStateQuote(api, message, caption, groupSettings[threadId].antiPhotoVideo, 300000);

  return true;
}

export async function antiPhotoVideo(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf) {
  const threadId = message.threadId;
  const msgType = message.data.msgType;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;

  if (
    !botIsAdminBox ||
    isAdminBox ||
    isSelf ||
    kickedUsers.has(senderId) ||
    isInWhiteList(groupSettings, threadId, senderId) ||
    !groupSettings[threadId]?.antiPhotoVideo ||
    (msgType !== "chat.photo" && msgType !== "chat.video.msg")
  ) {
    return false;
  }

  try {
      const deleteResult = await api.deleteMessage(message, false);
      if (deleteResult && deleteResult.status === 0) {
        const warningCount = await sendWarningMessage(api, message, senderId, senderName, threadId);
        if (warningCount >= 3) {
          await handleViolationDetected(api, message, threadId, senderId, senderName);
        }
        return true;
      } else {
        await api.sendMessage(
          {
            msg: `Không thể xóa ảnh/video của ${senderName} (có thể bot cần quyền admin).`,
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

async function sendWarningMessage(api, message, senderId, senderName, threadId) {
  try {
    if (!userWarnings.has(senderId)) {
      userWarnings.set(senderId, {
        count: 0,
        lastWarningTime: Date.now(),
      });
    }

    const warning = userWarnings.get(senderId);
    const currentTime = Date.now();

    const warningReductions = Math.floor((currentTime - warning.lastWarningTime) / WARNING_RESET_TIME);
    if (warningReductions > 0) {
      warning.count = Math.max(0, warning.count - warningReductions);
    }

    warning.count++;
    warning.lastWarningTime = currentTime;

    let caption = `⚠️ Cảnh cáo ${senderName}!\nỞ đây cấm gửi ảnh/video`;
    if (warning.count === 2) {
      caption = `⚠️ Cảnh cáo ${senderName}!\nNgừng gửi ảnh/video, trước khi bị chặn khỏi nhóm!`;
    }

    await api.sendMessage(
      {
        msg: caption,
        mentions: [MessageMention(senderId, senderName.length, "⚠️ Cảnh cáo ".length)],
        ttl: 300000,
      },
      threadId,
      MessageType.GroupMessage
    );

    return warning.count;
  } catch (error) {
    return 0;
  }
}

async function handleViolationDetected(api, message, threadId, senderId, senderName) {
  try {
    if (kickedUsers.has(senderId)) {
      return;
    }
    kickedUsers.add(senderId);
    await api.blockUsers(threadId, [senderId]);
    userWarnings.delete(senderId);
  } catch (error) {
  }

  setTimeout(() => {
    kickedUsers.delete(senderId);
  }, 5000);
}

schedule.scheduleJob("*/1 * * * *", () => {
  const currentTime = Date.now();
  for (const [senderId, warning] of userWarnings.entries()) {
    const warningReductions = Math.floor((currentTime - warning.lastWarningTime) / WARNING_RESET_TIME);
    if (warningReductions > 0) {
      warning.count = Math.max(0, warning.count - warningReductions);
      warning.lastWarningTime = currentTime;

      if (warning.count === 0) {
        userWarnings.delete(senderId);
      }
    }
  }
});
