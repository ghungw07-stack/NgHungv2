import { MessageType } from "zlbotdqt";
import schedule from "node-schedule";
import { sendMessageStateQuote } from "../chat-zalo/chat-style/chat-style.js";
import { isInWhiteList } from "./white-list.js";
import { removeMention } from "../../utils/format-util.js";
import { getMessageCache } from "../../utils/message-cache.js";
import { deleteMessageCustomer } from "../../commands/bot-manager/utilities.js";

const MESSAGE_THRESHOLD_FORWARD = 3;
const TIME_WINDOW_FORWARD = 10000;
const WARNING_RESET_TIME = 1800000;
const SPAM_PATTERNS = {
  FORWARDED_MESSAGES: "FORWARDED_MESSAGES",
};

const forwardMessageTimestamps = new Map();
const userWarnings = new Map();
const kickedUsers = new Set();

function isForwardedMessage(message) {
  try {
    const msgType = message.data?.msgType || (message.msgInfo ? JSON.parse(message.msgInfo)?.msgType : null);
    const referenceStr = message.data?.reference?.data || message.data?.reference || "{}";
    const reference = typeof referenceStr === 'string' ? JSON.parse(referenceStr) : referenceStr;
    const fwLvl = reference.fwLvl || 0;
    const isForwardType = ["chat.forward"].includes(msgType);
    const isForwardReference = fwLvl > 0;
    const isForwardMedia = ["chat.photo", "chat.video.msg", "chat.sticker"].includes(msgType) && fwLvl > 0;
    return isForwardType || isForwardReference || isForwardMedia;
  } catch (error) {
    return false;
  }
}

export async function antiForward(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf) {
  const senderId = message.data?.uidFrom;
  const senderName = message.data?.dName;
  const threadId = message.threadId;
  const timestamp = Number(message.data?.ts || Date.now());
  if (!groupSettings || typeof groupSettings !== "object") {
    return false;
  }

  if (!groupSettings[threadId]) {
    groupSettings[threadId] = { antiforward: false };
  }

  const isAdmin = typeof isAdminBox === "boolean" ? isAdminBox : false;
  const antiforward = groupSettings[threadId].antiforward ?? false;

  if (
    message.type !== MessageType.GroupMessage ||
    isSelf ||
    isAdmin ||
    !botIsAdminBox ||
    !antiforward ||
    !senderId ||
    !senderName ||
    isInWhiteList(groupSettings, threadId, senderId) ||
    kickedUsers.has(senderId)
  ) {
    return false;
  }

  const isForward = isForwardedMessage(message);
  if (!isForward) {
    return false;
  }

  if (!forwardMessageTimestamps.has(threadId)) {
    forwardMessageTimestamps.set(threadId, new Map());
  }
  const threadMessages = forwardMessageTimestamps.get(threadId);

  if (!threadMessages.has(senderId)) {
    threadMessages.set(senderId, []);
  }
  const timestamps = threadMessages.get(senderId);
  timestamps.push({
    time: timestamp,
    content: message.data?.content || "",
  });

  const currentTime = Date.now();
  const recentForwards = timestamps.filter((msg) => currentTime - msg.time <= TIME_WINDOW_FORWARD);
  threadMessages.set(senderId, recentForwards);
  const spamAnalysis = analyzeForwardBehavior(recentForwards);

  if (spamAnalysis.isSpam) {
    const warningResult = await handleWarning(api, message, threadId, senderId, senderName, spamAnalysis.type);
    if (warningResult.shouldBlock) {
      await handleSpamDetected(api, message, threadId, senderId, senderName);
      return true;
    }
    return true;
  }
  const deleteResult = await deleteAllForwardMessages(api, message, threadId, senderId);
  if (deleteResult && deleteResult.deletedCount > 0) {
    await sendWarningMessage(api, message, senderId, senderName, threadId);
    return true;
  } else {
    await api.sendMessage({
      msg: `Không thể xóa tin nhắn chuyển tiếp của ${senderName} (có thể bot cần quyền admin).`,
      quote: message,
      ttl: 300000,
    }, threadId, MessageType.GroupMessage);
    return false;
  }
}

function analyzeForwardBehavior(recentForwards) {
  if (recentForwards.length >= MESSAGE_THRESHOLD_FORWARD) {
    const timeSpan = recentForwards[recentForwards.length - 1].time - recentForwards[0].time;
    if (timeSpan < TIME_WINDOW_FORWARD) {
      return { isSpam: true, type: SPAM_PATTERNS.FORWARDED_MESSAGES };
    }
  }
  return { isSpam: false };
}

async function handleWarning(api, message, threadId, senderId, senderName, spamType) {
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

    return { shouldBlock: warning.count >= 3 };
  } catch (error) {
    console.error("Lỗi khi xử lý cảnh báo:", error);
    return { shouldBlock: false };
  }
}

async function deleteAllForwardMessages(api, message, threadId, senderId) {
  try {
    const idBot = api.getBotId();
    const messageCache = await getMessageCache(idBot, threadId);
    
    if (!messageCache || Object.keys(messageCache).length === 0) {
      const deleteResult = await api.deleteMessage(message, false).catch(() => null);
      return deleteResult && deleteResult.status === 0 ? { deletedCount: 1 } : { deletedCount: 0 };
    }

    const messagesInThread = Object.values(messageCache);
    const currentTime = Date.now();
    const TIME_RANGE = 30000; 
    const globalDelMsgIds = new Set();
    for (const msg of messagesInThread) {
      if (msg.msgType === "chat.delete") {
        for (const item of msg.content || []) {
          if (item.globalDelMsgId) {
            globalDelMsgIds.add(item.globalDelMsgId.toString());
          }
        }
      }
    }

    let userRecentMessages = messagesInThread.filter((msg) => {
      if (msg.uidFrom !== senderId) return false;
      if (globalDelMsgIds.has(msg.msgId)) return false;
      const msgTimestamp = msg.timestamp || msg.ts || 0;
      const timeDiff = Math.abs(currentTime - msgTimestamp);
      return timeDiff <= TIME_RANGE;
    });

    if (userRecentMessages.length === 0) {
      const LONG_TIME_RANGE = 300000; // 5 phút
      userRecentMessages = messagesInThread.filter((msg) => {
        if (msg.uidFrom !== senderId) return false;
        if (globalDelMsgIds.has(msg.msgId)) return false;
        
        try {
          const msgType = msg.msgType || (msg.msgInfo ? JSON.parse(msg.msgInfo)?.msgType : null);
          let fwLvl = 0;
          if (msg.reference?.data) {
            try {
              const refData = typeof msg.reference.data === 'string' ? JSON.parse(msg.reference.data) : msg.reference.data;
              fwLvl = refData.fwLvl || 0;
            } catch (e) {}
          }
          
          if (fwLvl === 0 && msg.reference) {
            try {
              const refData = typeof msg.reference === 'string' ? JSON.parse(msg.reference) : msg.reference;
              fwLvl = refData.fwLvl || 0;
            } catch (e) {}
          }
          
          const msgTimestamp = msg.timestamp || msg.ts || 0;
          const timeDiff = Math.abs(currentTime - msgTimestamp);
          
          const isForwardType = ["chat.forward"].includes(msgType);
          const isForwardReference = fwLvl > 0;
          const isForwardMedia = ["chat.photo", "chat.video.msg", "chat.sticker", "chat.gif"].includes(msgType) && fwLvl > 0;
          
          return (isForwardType || isForwardReference || isForwardMedia) && timeDiff <= LONG_TIME_RANGE;
        } catch (error) {
          const msgType = msg.msgType;
          if (["chat.forward"].includes(msgType)) {
            const msgTimestamp = msg.timestamp || msg.ts || 0;
            const timeDiff = Math.abs(currentTime - msgTimestamp);
            return timeDiff <= LONG_TIME_RANGE;
          }
          return false;
        }
      });
    }

    const currentMsgId = message.data?.msgId;
    const hasCurrentMsg = userRecentMessages.some(msg => msg.msgId === currentMsgId);
    if (!hasCurrentMsg) {
      userRecentMessages.push({
        ...message.data,
        msgId: currentMsgId,
        threadId: threadId,
        uidFrom: senderId,
        timestamp: message.data?.ts || Date.now(),
      });
    }

    if (userRecentMessages.length === 0) {
      const deleteResult = await api.deleteMessage(message, false).catch(() => null);
      return deleteResult && deleteResult.status === 0 ? { deletedCount: 1 } : { deletedCount: 0 };
    }

    userRecentMessages.sort((a, b) => (a.timestamp || a.ts || 0) - (b.timestamp || b.ts || 0));
    
    let deletedCount = 0;
    for (const msg of userRecentMessages) {
      try {
        const msgObj = {
          type: MessageType.GroupMessage,
          threadId: threadId,
        };
        msgObj.data = { ...msg };
        
        const deleteResult = await api.deleteMessage(msgObj, false).catch((err) => {
          console.error(`❌ Lỗi API khi xóa tin nhắn ${msg.msgId}:`, err.message);
          return null;
        });
        
        if (deleteResult && deleteResult.status === 0) {
          deletedCount++;
        } else {
          const errorMsg = deleteResult?.error?.message || deleteResult?.message || 'Unknown error';
          const statusCode = deleteResult?.status || deleteResult?.error?.code || 'N/A';
          console.log(`❌ Không thể xóa tin nhắn ${msg.msgId} (type: ${msg.msgType}, status: ${statusCode}): ${errorMsg}`);
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`❌ Lỗi khi xóa tin nhắn ${msg.msgId}:`, error.message);
      }
    }

    if (deletedCount === 0) {
      const deleteResult = await api.deleteMessage(message, false).catch(() => null);
      if (deleteResult && deleteResult.status === 0) {
        deletedCount = 1;
      }
    }

    return { deletedCount };
  } catch (error) {
    console.error("Lỗi khi xóa tin nhắn chuyển tiếp:", error);
    const deleteResult = await api.deleteMessage(message, false).catch(() => null);
    return deleteResult && deleteResult.status === 0 ? { deletedCount: 1 } : { deletedCount: 0 };
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
      warning.lastWarningTime = currentTime;
    }

    warning.count++;
    warning.lastWarningTime = currentTime;

    const caption = warning.count === 2
      ? `⚠️ Cảnh cáo ${senderName}!\nNgừng chuyển tiếp tin nhắn, trước khi bị chặn khỏi nhóm!`
      : `⚠️ Cảnh cáo ${senderName}!\nNhóm này không cho phép chuyển tiếp tin nhắn.`;
    await api.sendMessage(
      { msg: caption, ttl: 300000 },
      threadId,
      MessageType.GroupMessage
    );

    return warning.count;
  } catch (error) {
    return 0;
  }
}

async function handleSpamDetected(api, message, threadId, senderId, senderName) {
  try {
    if (kickedUsers.has(senderId)) {
      return;
    }
    kickedUsers.add(senderId);
    await api.blockUsers(threadId, [senderId]);

    const idBot = api.getBotId();
    const messageCache = await getMessageCache(idBot, threadId);
    const messagesInThread = Object.values(messageCache);
    let userMessages = messagesInThread.filter((msg) => msg.uidFrom === senderId);

    if (userMessages.length > 0) {
      const globalDelMsgIds = new Set();
      for (const msg of messagesInThread) {
        if (msg.msgType === "chat.delete") {
          for (const item of msg.content || []) {
            if (item.globalDelMsgId) {
              globalDelMsgIds.add(item.globalDelMsgId.toString());
            }
          }
        }
      }

      userMessages = userMessages.filter((msg) => !globalDelMsgIds.has(msg.msgId));

      await Promise.all(
        userMessages.map((msgId) => {
          msgId.data = { ...msgId };
          return api.deleteMessage(msgId, false).catch(() => {});
        })
      );

      await deleteMessageCustomer(api, message);
    }

    userWarnings.delete(senderId);
  } catch (error) {
  }

  setTimeout(() => {
    kickedUsers.delete(senderId);
  }, 5000);

  const threadMessages = forwardMessageTimestamps.get(threadId);
  if (threadMessages) {
    threadMessages.delete(senderId);
    if (threadMessages.size === 0) {
      forwardMessageTimestamps.delete(threadId);
    }
  }
}

export async function handleAntiForwardCommand(api, message, groupSettings) {
  const threadId = message.threadId;
  const content = removeMention(message);
  const parts = content.split(" ");
  const subcommand = parts[1]?.toLowerCase();

  if (!groupSettings || typeof groupSettings !== "object") {
    return false;
  }

  if (!groupSettings[threadId]) {
    groupSettings[threadId] = { antiforward: false };
  }

  let newStatus;
  if (subcommand === "on") {
    groupSettings[threadId].antiforward = true;
    newStatus = "bật";
  } else if (subcommand === "off") {
    groupSettings[threadId].antiforward = false;
    newStatus = "tắt";
  } else {
    groupSettings[threadId].antiforward = !groupSettings[threadId].antiforward;
    newStatus = groupSettings[threadId].antiforward ? "bật" : "tắt";
  }

  const caption = `Chức năng chặn chuyển tiếp tin nhắn đã được ${newStatus}!`;
  await sendMessageStateQuote(api, message, caption, groupSettings[threadId].antiforward, 300000);
  return true;
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

  for (const [threadId, threadMessages] of forwardMessageTimestamps.entries()) {
    for (const [userId, messages] of threadMessages.entries()) {
      const recentMessages = messages.filter((msg) => currentTime - msg.time <= TIME_WINDOW_FORWARD);
      if (recentMessages.length === 0) {
        threadMessages.delete(userId);
      } else {
        threadMessages.set(userId, recentMessages);
      }
    }
    if (threadMessages.size === 0) {
      forwardMessageTimestamps.delete(threadId);
    }
  }
});
