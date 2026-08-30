import { MessageMention, MessageType } from "zlbotngh";
import schedule from "node-schedule";
import { sendMessageStateQuote, sendMessageWarning } from "../chat-zalo/chat-style/chat-style.js";
import { isInWhiteList } from "./white-list.js";
import { removeMention } from "../../utils/format-util.js";

const userWarnings = new Map();
const kickedUsers = new Set();
const WARNING_RESET_TIME = 1800000; // 30 minutes

export async function handleAntiFile(api, message, groupSettings) {
  const threadId = message.threadId;
  const content = removeMention(message);
  const parts = content.split(" ");

  if (!groupSettings[threadId]) {
    groupSettings[threadId] = {};
  }

  if (parts.length === 1) {
    groupSettings[threadId].antiFile = !groupSettings[threadId].antiFile;
  } else if (parts[1] === "on") {
    groupSettings[threadId].antiFile = true;
  } else if (parts[1] === "off") {
    groupSettings[threadId].antiFile = false;
  } else {
    const caption = `Cú pháp không hợp lệ. Sử dụng ${prefix}antifile hoặc ${prefix}antifile on/off`;
    await sendMessageWarning(api, message, caption);
    return false;
  }

  const status = groupSettings[threadId].antiFile ? "bật" : "tắt";
  const caption = `Chế độ chống gửi file đã được ${status}!`;
  await sendMessageStateQuote(api, message, caption, groupSettings[threadId].antiFile, 300000);

  return true;
}

export async function antiFile(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf) {
  const threadId = message.threadId;
  const msgType = message.data.msgType;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;

  if (
    !botIsAdminBox ||
    isAdminBox ||
    isSelf ||
    kickedUsers.has(senderId) ||
    isInWhiteList(groupSettings, threadId, senderId)
  ) {
    return false;
  }

  const fileMessageTypes = ["chat.file", "file", "chat.attachment", "share.file"];
  if (groupSettings[threadId]?.antiFile && fileMessageTypes.includes(msgType)) {
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
            msg: `Không thể xóa file của ${senderName} (có thể bot cần quyền admin).`,
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

  return false;
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
      warning.lastWarningTime = currentTime;
    }

    warning.count++;
    warning.lastWarningTime = currentTime;

    let caption = `⚠️ Cảnh cáo ${senderName}!\nỞ đây cấm gửi file`;
    if (warning.count === 2) {
      caption = `⚠️ Cảnh cáo ${senderName}!\nNgừng gửi file, trước khi bị chặn khỏi nhóm!`;
    }

    await api.sendMessage(
      {
        msg: caption,
        quote: message,
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

    await api.sendMessage(
      // {
      //   msg: `🚫 Thành viên [ ${senderName} ] đã bị chặn do gửi file quá nhiều!`,
      //   quote: message,
      // },
      threadId,
      MessageType.GroupMessage
    );

    await api.sendMessage(
      // {
      //   msg: `🚫 Bạn đã bị chặn do gửi file quá nhiều!\nVui lòng không lặp lại hành vi này.`,
      // },
      senderId,
      MessageType.DirectMessage
    );

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
