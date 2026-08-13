import { MessageMention, MessageType } from "zlbotngh";
import schedule from "node-schedule";
import { getGroupInfoData } from "../../service-ngh/info-service/group-info.js";
import { getUserInfoData } from "../../service-ngh/info-service/user-info.js";
import { createBlockSpamImage } from "../../utils/canvas/event-image.js";
import { clearImagePath } from "../../utils/canvas/index.js";
import { sendMessageStateQuote } from "../chat-zalo/chat-style/chat-style.js";
import { isInWhiteList } from "./white-list.js";
import { removeMention } from "../../utils/format-util.js";
import { deleteFile } from "../../utils/util.js";
import { getMessageCache } from "../../utils/message-cache.js";
import { deleteMessageCustomer } from "../../commands/bot-manager/utilities.js";

const kickedUsers = new Set();
const userMessageTimestamps = new Map();
const userWarnings = new Map();
const MESSAGE_THRESHOLD = 5;
const TIME_WINDOW = 3000;
const MESSAGE_THRESHOLD_REPEATED = 5;
const TIME_WINDOW_REPEATED = 15000;
const WARNING_RESET_TIME = 1800000;
const SPAM_PATTERNS = {
  RAPID_MESSAGES: "RAPID_MESSAGES",
  REPEATED_CONTENT: "REPEATED_CONTENT",
};

const historyBugOrUsers = new Map();

export async function antiSpam(api, message, groupInfo, isAdminBox, groupSettings, botIsAdminBox, isSelf) {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const threadId = message.threadId;
  const timestamp = Number(message.data.ts);

  if (
    isAdminBox ||
    kickedUsers.has(senderId) ||
    isSelf ||
    !botIsAdminBox ||
    isInWhiteList(groupSettings, threadId, senderId)
  )
    return false;

  if (groupSettings[threadId]?.antiSpam ?? false) {
    // if (!groupInfo.memVerList.includes(senderId + "_0")) {
    //   if (!historyBugOrUsers.has(threadId)) {
    //     historyBugOrUsers.set(threadId, new Map());
    //   }

    //   const historyBugInThread = historyBugOrUsers.get(threadId);
    //   if (!historyBugInThread.has(senderId)) {
    //     historyBugInThread.set(senderId, []);
    //   }

    //   historyBugInThread.get(senderId).push(Date.now());
    //   if (historyBugInThread.get(senderId).length > 2) {
    //     const endTimeProcess = Date.now() + 10000;
    //     const isBlockCompleted = false;

    //     const approveTask = async () => {
    //       while (Date.now() < endTimeProcess && !isBlockCompleted) {
    //         try {
    //           await api.handleGroupPendingMembers(threadId, true, {
    //             users: [{ uid: senderId }],
    //           });
    //         } catch {}
    //       }
    //     };

    //     const blockTask = async () => {
    //       while (Date.now() < endTimeProcess && !isBlockCompleted) {
    //         try {
    //           await api.blockUsers(threadId, [senderId]);
    //           await api.sendMessage(
    //             {
    //               msg: `${senderName} bị sút khỏi nhóm vì dám bug spam nhóm trước mặt N D Q.`,
    //               mentions: [MessageMention(senderId, senderName.length, 0)],
    //             },
    //             threadId,
    //             message.type
    //           );
    //           isBlockCompleted = true;
    //         } catch {}
    //       }
    //     };

    //     await Promise.all([approveTask(), blockTask()]);
    //     historyBugInThread.delete(senderId);
    //     return true;
    //   }
    // }

    if (!userMessageTimestamps.has(threadId)) {
      userMessageTimestamps.set(threadId, new Map());
    }
    const threadMessages = userMessageTimestamps.get(threadId);

    if (!threadMessages.has(senderId)) {
      threadMessages.set(senderId, []);
    }

    const timestamps = threadMessages.get(senderId);
    timestamps.push({
      time: timestamp,
      content: message.data.content,
      length: message.data.content?.length || 0,
    });

    const currentTime = Date.now();
    const recentTimestamps = timestamps.filter((msg) => currentTime - msg.time <= TIME_WINDOW_REPEATED);
    const recentSpam = timestamps.filter((msg) => currentTime - msg.time <= TIME_WINDOW);
    threadMessages.set(senderId, recentTimestamps);

    const spamAnalysis = analyzeSpamBehavior(recentSpam, recentTimestamps);

    if (spamAnalysis.isSpam) {
      try {
        const warningResult = await handleWarning(api, message, threadId, senderId, senderName, spamAnalysis.type);

        if (warningResult.shouldBlock) {
          await handleSpamDetected(api, message, spamAnalysis.type);
          return true;
        }
      } catch (error) {
        console.error("Lỗi khi xử lý spam:", error);
      }
    }
  }

  return false;
}

function analyzeSpamBehavior(messages, recentMessages) {
  if (messages.length >= MESSAGE_THRESHOLD) {
    const timeSpan = messages[messages.length - 1].time - messages[0].time;
    if (timeSpan < TIME_WINDOW) {
      return { isSpam: true, type: SPAM_PATTERNS.RAPID_MESSAGES };
    }
  }

  const contentMap = new Map();
  for (const msg of recentMessages) {
    let normalizedContent = "";

    if (typeof msg.content === "object") {
      normalizedContent = normalizeObjectContent(msg.content);
    } else {
      normalizedContent = String(msg.content || "").trim();
    }

    if (normalizedContent) {
      let isContentSimilar = false;
      for (const [existingContent] of contentMap) {
        const similarity = calculateContentSimilarity(normalizedContent, existingContent);
        if (similarity > 0.8) {
          const count = contentMap.get(existingContent) + 1;
          contentMap.set(existingContent, count);
          if (count >= MESSAGE_THRESHOLD_REPEATED) {
            return { isSpam: true, type: SPAM_PATTERNS.REPEATED_CONTENT };
          }
          isContentSimilar = true;
          break;
        }
      }

      if (!isContentSimilar) {
        contentMap.set(normalizedContent, 1);
      }
    }
  }

  return { isSpam: false };
}

function normalizeObjectContent(content) {
  try {
    if (!content) return "";

    if (content.title) return content.title;
    if (content.text) return content.text;
    if (content.caption) return content.caption;
    if (content.description) return content.description;
    if (content.message) return content.message;

    const contentCopy = { ...content };
    delete contentCopy.timestamp;
    delete contentCopy.id;
    delete contentCopy.time;
    delete contentCopy.date;

    return JSON.stringify(contentCopy);
  } catch (error) {
    console.error("Lỗi khi chuẩn hóa content:", error);
    return "";
  }
}

function calculateContentSimilarity(str1, str2) {
  if (typeof str1 !== "string" || typeof str2 !== "string") {
    return 0;
  }

  str1 = str1.toLowerCase().trim();
  str2 = str2.toLowerCase().trim();

  if (str1 === str2) return 1;

  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) return 1;

  const distance = levenshteinDistance(str1, str2);
  return 1 - distance / maxLength;
}

function levenshteinDistance(str1, str2) {
  const m = str1.length;
  const n = str2.length;
  const dp = Array(m + 1)
    .fill()
    .map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(dp[i - 1][j - 1] + 1, dp[i - 1][j] + 1, dp[i][j - 1] + 1);
      }
    }
  }

  return dp[m][n];
}

async function handleSpamDetected(api, message, spamType) {
  const idBot = api.getBotId();
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  let imagePath = null;
  try {
    if (kickedUsers.has(senderId)) return;
    kickedUsers.add(senderId);
    await api.blockUsers(threadId, [senderId]);

    const groupInfo = await getGroupInfoData(api, threadId);
    const userInfo = await getUserInfoData(api, senderId);
    const botId = api.getBotId();
    const botInfo = await getUserInfoData(api, botId);
    const botName = botInfo?.name || botInfo?.zaloName || api.accountInfo?.name || "Bot";
    imagePath = await createBlockSpamImage(userInfo, groupInfo.name, groupInfo.groupType, userInfo.gender, botName);

    await api.sendMessage(
      {
        msg: "",
        attachments: imagePath ? [imagePath] : [],
        quote: message,
        ttl: 86400000,
        isUseProphylactic: true,
      },
      threadId,
      MessageType.GroupMessage
    );

    await clearImagePath(imagePath);
  } catch (error) {
    console.error(`Không thể chặn người dùng ${senderName}:`, error);
  }

  const messageCache = await getMessageCache(idBot, threadId);
  const messagesInThread = Object.values(messageCache);
  let userMessageInThread = messagesInThread.filter((msg) => msg.uidFrom === senderId) || [];

  if (userMessageInThread.length > 0) {
    const globalDelMsgIds = new Set();
    for (const msg of messagesInThread) {
      if (msg.msgType === "chat.delete") {
        for (const item of msg.content) {
          if (item.globalDelMsgId) {
            globalDelMsgIds.add(item.globalDelMsgId.toString());
          }
        }
      }
    }

    userMessageInThread = userMessageInThread.filter((msg) => {
      return !globalDelMsgIds.has(msg.msgId);
    });

    await Promise.all(
      userMessageInThread.map((msgId) => {
        msgId.data = { ...msgId };
        return api.deleteMessage(msgId, false).catch(console.error);
      })
    );

    await deleteMessageCustomer(api, message);
  }

  setTimeout(() => {
    kickedUsers.delete(senderId);
    console.log(`Đã xóa ${senderId} khỏi danh sách kickedUsers.`);
  }, 5000);

  userMessageTimestamps.delete(senderId);
}

async function handleWarning(api, message, threadId, senderId, senderName, spamType) {
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

  if (warning.count < 3) {
    let caption = `⚠️ Cảnh cáo ${senderName}!\nChậm cái tay lại bạn êy, tay hơi nhanh rồi đấy!`;
    if (spamType === SPAM_PATTERNS.REPEATED_CONTENT) {
      caption = `⚠️ Cảnh cáo ${senderName}!\nMuốn spam à?!`;
    }
    if (warning.count === 2) {
      caption = `⚠️ Cảnh cáo ${senderName}!\nNhắn chậm lại, tao xút mày ra khỏi box bây giờ!`;
      if (spamType === SPAM_PATTERNS.REPEATED_CONTENT) {
        caption = `⚠️ Cảnh cáo ${senderName}!\nDừng hành động này lại trước khi tao cho mày bay màu khỏi nhóm...!`;
      }
    }
    await api.sendMessage(
      {
        msg: caption,
        mentions: [MessageMention(senderId, senderName.length, "⚠️ Cảnh cáo ".length)],
        ttl: 8000,
      },
      threadId,
      MessageType.GroupMessage
    );
    return { shouldBlock: false };
  } else {
    userWarnings.delete(senderId);
    return { shouldBlock: true };
  }
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

  for (const [threadId, threadMessages] of userMessageTimestamps.entries()) {
    for (const [userId, messages] of threadMessages.entries()) {
      const recentMessages = messages.filter((msg) => currentTime - msg.time <= TIME_WINDOW);
      if (recentMessages.length === 0) {
        threadMessages.delete(userId);
      } else {
        threadMessages.set(userId, recentMessages);
      }
    }
    if (threadMessages.size === 0) {
      userMessageTimestamps.delete(threadId);
    }
  }
});

export async function handleAntiSpamCommand(api, message, groupSettings) {
  const threadId = message.threadId;
  const content = removeMention(message);
  const status = content.split(" ")[1];

  if (!groupSettings[threadId]) {
    groupSettings[threadId] = {};
  }

  let newStatus;
  if (status === "on") {
    groupSettings[threadId].antiSpam = true;
    newStatus = "bật";
  } else if (status === "off") {
    groupSettings[threadId].antiSpam = false;
    newStatus = "tắt";
  } else {
    groupSettings[threadId].antiSpam = !groupSettings[threadId].antiSpam;
    newStatus = groupSettings[threadId].antiSpam ? "bật" : "tắt";
  }
  const caption = `Chức năng chống spam đã được ${newStatus}!`;
  await sendMessageStateQuote(api, message, caption, groupSettings[threadId].antiSpam, 300000);

  return true;
}

const TIMEWINDOW = 10 * 1000;
const MAX_UNDO_IN_TIMEWINDOW = 50;
const MAX_BUG_UNDO = 5;
const undoHistory = {};

/**
 * Kiểm tra spam undo
 * @param {string} senderId - ID người dùng thực hiện undo
 * @param {string} messageId - ID tin nhắn bị undo
 * @returns {boolean} - true nếu là spam undo, false nếu không phải
 */
export function isUndoSpam(senderId, messageId) {
  const currentTime = Date.now();

  if (!undoHistory[senderId]) undoHistory[senderId] = [];
  undoHistory[senderId].push({ timestamp: currentTime, messageId });
  const recentUndos = undoHistory[senderId].filter((undo) => currentTime - undo.timestamp <= TIMEWINDOW);
  undoHistory[senderId] = recentUndos;
  const messageUndoCount = recentUndos.filter((undo) => undo.messageId === messageId).length;

  // Kiểm tra điều kiện spam:
  // 1. Nếu có hơn MAX_UNDO_IN_TIMEWINDOW undo trong TIMEWINDOW giây gần nhất
  // 2. Nếu cùng một messageId bị undo hơn 3 lần
  if (recentUndos.length > MAX_UNDO_IN_TIMEWINDOW) {
    return {
      isSpam: true,
      reason: "Thu hồi tin nhắn quá nhiều trong thời gian ngắn",
    };
  } else if (messageUndoCount > MAX_BUG_UNDO) {
    return {
      isSpam: true,
      reason: "Lợi dụng lỗ hổng để spam undo",
    };
  } else {
    return {
      isSpam: false,
    };
  }
}

export async function antiSpamUndoGroup(api, undoEvent, isAdminBox, groupSettings, groupInfo, botIsAdminBox, isSelf) {
  const threadId = undoEvent.data.idTo;
  const senderId = undoEvent.data.uidFrom;
  const senderName = undoEvent.data.dName;

  if (
    isSelf ||
    !botIsAdminBox ||
    isAdminBox ||
    // isInWhiteList(groupSettings, threadId, senderId) ||
    !groupSettings[threadId]?.antiSpam
  ) {
    return;
  }

  const messageId = undoEvent.data?.content?.globalMsgId.toString();
  if (messageId) {
    const checkSpamUndo = isUndoSpam(senderId, messageId);
    if (checkSpamUndo.isSpam) {
      if (kickedUsers.has(senderId)) return;
      kickedUsers.add(senderId);
      await api.blockUsers(threadId, [senderId]);
      const userInfo = await getUserInfoData(api, senderId);
      const botId = api.getBotId();
      const botInfo = await getUserInfoData(api, botId);
      const botName = botInfo?.name || botInfo?.zaloName || api.accountInfo?.name || "Bot";
      const imagePath = await createBlockSpamImage(userInfo, groupInfo.name, groupInfo.groupType, userInfo.gender, botName);

      try {
        await api.sendMessage(
          {
            msg: "",
            attachments: imagePath ? [imagePath] : [],
            quote: undoEvent,
            ttl: 86400000,
          },
          threadId,
          MessageType.GroupMessage
        );
        await clearImagePath(imagePath);
      } catch (error) {
        console.error("Lỗi khi tạo và gửi ảnh block spam:", error);
      }
      delete undoHistory[senderId];

      setTimeout(() => {
        kickedUsers.delete(senderId);
        console.log(`Đã xóa ${senderId} khỏi danh sách kickedUsers.`);
      }, 5000);
    }
  }
}
