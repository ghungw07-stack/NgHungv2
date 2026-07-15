import schedule from "node-schedule";
import {
  sendMessageComplete,
  sendMessageState,
  sendMessageStateQuote,
  sendMessageWarning,
  sendMessageQuery,
} from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import natural from "natural";
import { removeMention } from "../../../utils/format-util.js";
import { chatGeneralTypeContent } from "../../chat-zalo/chat-general/chat-general.js";
import { handleYoutubeCommand } from "../../api-crawl/youtube/youtube-service.js";
import { handleZingMp3Command } from "../../api-crawl/music-content/zingmp3.js";
import { handleMusicCommand } from "../../api-crawl/music-content/soundcloud.js";
import { handleNhacCuaTuiCommand } from "../../api-crawl/music-content/nhaccuatui.js";
import { handleTikTokCommand } from "../../api-crawl/tiktok/tiktok-service.js";
import { searchImagePinterest } from "../../api-crawl/image-content/pinterest-service.js";
import {
  checkCommandCountdown,
  checkSpecialCommand,
  getLastCommandUsage,
  sendReactionConfirmReceive,
} from "../../../commands/command.js";
import { isAdmin } from "../../../index.js";
import { trainingDataJsonPath } from "../../../utils/io-json.js";
import { readFileSync, writeFileSync } from "../../../utils/util.js";
import { chatWithGeminiAssistant, detectIntentSmart } from "../../api-crawl/assistant-ai/gemini-ai-chat-bot.js";
import { MessageType } from "../../../api-zalo/index.js";
import {
  handleCheckLinkFromImageLocal,
  handleCheckLinkFromVideoLocal,
  handleCheckLinkFromVoicesLocal,
  handleCheckLinkFromFilesLocal,
} from "../../../utils/local-upload-cache.js";

const conversationState = new Map();
const recentMessages = new Map();
const mutedUsers = new Map();
const DEFAULT_MUTE_TIME = 180 * 1000;
const SPAM_THRESHOLD = 5;
const SPAM_TIME_WINDOW = 10 * 1000;
const messageHistory = new Map();
const CONVERSATION_TIMEOUT = 30 * 1000;
const KEEP_TIME_MESSAGE = 60 * 60 * 1000;

let trainingDataCache = {};
let hasChanges = {};

export const getTrainingDataCache = (idBot) =>
  trainingDataCache[idBot] || {
    groups: {},
  };

function loadTrainingDataCache(idBot) {
  trainingDataCache[idBot] = readTrainingData(idBot);
}

export function setHasChange(idBot) {
  hasChanges[idBot] = true;
}

function saveTrainingDataCache(idBot) {
  if (hasChanges[idBot]) {
    writeTrainingData(idBot, getTrainingDataCache(idBot));
    hasChanges[idBot] = false;
  }
}

function readTrainingData(idBot) {
  try {
    const data = readFileSync(trainingDataJsonPath(idBot));
    return JSON.parse(data);
  } catch (error) {
    console.error("Lỗi khi đọc file data-training.json:", error);
    return { groups: {} };
  }
}

function writeTrainingData(idBot, data) {
  try {
    writeFileSync(trainingDataJsonPath(idBot), JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Lỗi khi ghi file data-training.json:", error);
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [key, state] of conversationState.entries()) {
    if (now - state.timestamp > CONVERSATION_TIMEOUT) {
      conversationState.delete(key);
    }
  }

  for (const [key, data] of recentMessages.entries()) {
    if (now - data.timestamp > KEEP_TIME_MESSAGE) {
      recentMessages.delete(key);
    }
  }

  for (const [userId, messages] of messageHistory.entries()) {
    if (messages.length === 0 || now - messages[messages.length - 1].timestamp > 5 * 60 * 1000) {
      messageHistory.delete(userId);
    }
  }
}, 30 * 1000);

async function handleCommandFromRequest(api, message, fcn, aliasCommand) {
  if (!api || !message) return;
  let content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const senderId = message.data.uidFrom;

  let commandParts;
  let command;

  if (checkSpecialCommand(content, prefix)) {
    commandParts = content.split("_");
    command = commandParts[0].slice(prefix.length).toLowerCase();
  } else {
    commandParts = content.slice(prefix.length).trim().split(/\s+/);
    command = commandParts[0].toLowerCase();
  }

  const isAdminLevelHighest = isAdmin(api.getBotId(), senderId);
  if (!isAdminLevelHighest && !(await checkCommandCountdown(api, message, senderId, command, getLastCommandUsage()))) {
    return;
  }

  await sendReactionConfirmReceive(api, message, 1);
  return await fcn(api, message, aliasCommand);
}

const supportedPlatforms = {
  youtube: {
    handler: async (api, message, query) => {
      const ytMessage = {
        ...message,
        data: { ...message.data, content: `${getGlobalPrefix(api.getBotId())}youtube ${query}` },
      };
      return await handleCommandFromRequest(api, ytMessage, handleYoutubeCommand, "youtube");
    },
    names: ["youtube", "yt", "video", "bài hát", "ca khúc", "mv"],
  },
  soundcloud: {
    handler: async (api, message, query) => {
      const scMessage = {
        ...message,
        data: { ...message.data, content: `${getGlobalPrefix(api.getBotId())}soundcloud ${query}` },
      };
      return await handleCommandFromRequest(api, scMessage, handleMusicCommand, "soundcloud");
    },
    names: ["soundcloud", "sc", "nhạc soundcloud", "sound", "nhạc"],
  },
  nhaccuatui: {
    handler: async (api, message, query) => {
      const nctMessage = {
        ...message,
        data: { ...message.data, content: `${getGlobalPrefix(api.getBotId())}nhaccuatui ${query}` },
      };
      return await handleCommandFromRequest(api, nctMessage, handleNhacCuaTuiCommand, "nhaccuatui");
    },
    names: ["nhaccuatui", "nc", "nct", "nhạc của tui"],
  },
  zingmp3: {
    handler: async (api, message, query) => {
      const zingMessage = {
        ...message,
        data: { ...message.data, content: `${getGlobalPrefix(api.getBotId())}zingmp3 ${query}` },
      };
      return await handleCommandFromRequest(api, zingMessage, handleZingMp3Command, "zingmp3");
    },
    names: ["zingmp3", "zing", "nhạc zing", "mp3"],
  },
  tiktok: {
    handler: async (api, message, query) => {
      const tiktokMessage = {
        ...message,
        data: { ...message.data, content: `${getGlobalPrefix(api.getBotId())}tiktok ${query}` },
      };
      return await handleCommandFromRequest(api, tiktokMessage, handleTikTokCommand, "tiktok");
    },
    names: ["tiktok", "tt", "nhạc tiktok", "tik"],
  },
  pinterest: {
    handler: async (api, message, query) => {
      const pinterestMessage = {
        ...message,
        data: { ...message.data, content: `${getGlobalPrefix(api.getBotId())}pinterest ${query}` },
      };
      return await handleCommandFromRequest(api, pinterestMessage, searchImagePinterest, "pinterest");
    },
    names: ["pinterest", "pin", "ảnh"],
  },
};

async function detectIntentImproved(content) {
  const platforms = [
    ...Object.entries(supportedPlatforms).map(([key, value]) => ({ name: key, keywords: value.names })),
  ];

  const actions = [
    {
      name: "search",
      keywords: ["tìm", "kiếm", "tìm kiếm", "tìm giúp", "tìm cho", "tìm hộ", "tìm bài", "search", "play", "phát", "mở"],
    },
  ];

  let detectedPlatform = null;
  let detectedAction = null;
  let contentLower = content.toLowerCase();

  for (const platform of platforms) {
    if (platform.keywords.some((keyword) => contentLower.includes(keyword))) {
      detectedPlatform = platform.name;
      break;
    }
  }

  for (const action of actions) {
    if (action.keywords.some((keyword) => contentLower.includes(keyword))) {
      detectedAction = action.name;
      break;
    }
  }

  if (detectedAction === "search" && detectedPlatform) {
    try {
      const flatActionKeywords = actions.flatMap((a) => a.keywords);
      const smart = await detectIntentSmart(content, flatActionKeywords);

      if (smart?.shouldAnalyze) {
        if (smart.action) detectedAction = smart.action;
        if (smart.query) content = smart.query;
        if (smart.platform) {
          const p = String(smart.platform).toLowerCase();
          const known = Object.keys(supportedPlatforms);
          const matched = known.find((k) => p.includes(k));
          detectedPlatform = matched || detectedPlatform;
        }

        return {
          action: detectedAction,
          platform: detectedPlatform,
          query: content,
        };
      }
    } catch (error) {
      console.warn("detectIntentSmart failed, falling back to basic detection:", error);
    }
  }

  return null;
}

async function askForPlatform(api, message, query) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;

  const platformOptions = Object.keys(supportedPlatforms)
    .map((key, index) => `${index + 1}. ${key.charAt(0).toUpperCase() + key.slice(1)}`)
    .join("\n");

  conversationState.set(`${threadId}_${senderId}`, {
    state: "waiting_platform",
    query: query,
    timestamp: Date.now(),
  });

  await api.sendMessage(
    {
      msg: `Bạn muốn tìm "${query}" trên nền tảng nào?\n${platformOptions}\n\nVui lòng trả lời với số thứ tự hoặc tên nền tảng.`,
      quote: message,
      ttl: 30000,
    },
    threadId,
    message.type
  );

  return true;
}

async function handlePlatformResponse(api, message, threadId, senderId) {
  const state = conversationState.get(`${threadId}_${senderId}`);
  if (!state || state.state !== "waiting_platform") return false;

  const content = removeMention(message).toLowerCase().trim();
  let selectedPlatform = null;

  if (/^\d+$/.test(content)) {
    const index = parseInt(content) - 1;
    const platforms = Object.keys(supportedPlatforms);
    if (index >= 0 && index < platforms.length) {
      selectedPlatform = platforms[index];
    }
  } else {
    for (const [key, value] of Object.entries(supportedPlatforms)) {
      if (value.names.some((name) => content.includes(name)) || content.includes(key)) {
        selectedPlatform = key;
        break;
      }
    }
  }

  conversationState.delete(`${threadId}_${senderId}`);

  if (selectedPlatform && supportedPlatforms[selectedPlatform]) {
    await chatGeneralTypeContent(api, message, {
      message: `Đang tìm kiếm "${state.query}" trên ${selectedPlatform}...`,
      ttl: 5000,
    });

    try {
      await supportedPlatforms[selectedPlatform].handler(api, message, state.query);
      return true;
    } catch (error) {
      await chatGeneralTypeContent(api, message, {
        message: `Có lỗi xảy ra khi tìm kiếm trên ${selectedPlatform}. Vui lòng thử lại sau.`,
      });
      return true;
    }
  } else {
    await chatGeneralTypeContent(api, message, {
      message: `Xin lỗi, hiện tại tôi chưa hỗ trợ tìm kiếm trên nền tảng "${content}". Các nền tảng hiện hỗ trợ:\n${Object.keys(
        supportedPlatforms
      ).join(", ")}`,
    });
    return true;
  }
}

export async function handleChatBot(api, message, threadId, groupSettings, nameGroup, isHandleCommand) {
  if (isHandleCommand) return;
  const idBot = api.getBotId();
  const managerData = api.apiManager.getDataManager();

  let content = message.data.content;
  const senderId = message.data.uidFrom;
  let response = null;

  if (
    groupSettings[threadId].replyEnabled &&
    !content.startsWith(`${getGlobalPrefix(api.getBotId())}`) &&
    !content.startsWith(`!`) &&
    !content.startsWith(`.`)
  ) {
    if (isUserMuted(senderId)) {
      return;
    }

    if (checkAndUpdateSpamDetection(senderId, content)) {
      muteUser(senderId, "spam_detection", DEFAULT_MUTE_TIME);

      await chatGeneralTypeContent(api, message, {
        message: `Bạn đã gửi tin nhắn yêu cầu quá nhanh. 
          Sẽ chặn phản hồi tính năng trả lời với bạn trong thời gian ngắn.`,
      });

      return;
    }

    if (isDuplicateQuestion(senderId, threadId, content)) {
      return;
    }

    if (conversationState.has(`${threadId}_${senderId}`)) {
      const handled = await handlePlatformResponse(api, message, threadId, senderId);
      if (handled) return;
    }

    if (groupSettings[threadId]?.activeBot && managerData?.replyUser) {
      const intent = await detectIntentImproved(content);
      if (intent && intent.action === "search") {
        if (intent.platform && intent.query) {
          if (supportedPlatforms[intent.platform]) {
            await supportedPlatforms[intent.platform].handler(api, message, intent.query);
          } else {
            await chatGeneralTypeContent(api, message, {
              message: `Xin lỗi, hiện tại tôi chưa hỗ trợ tìm kiếm trên nền tảng "${
                intent.platform
              }". Các nền tảng hiện hỗ trợ:\n${Object.keys(supportedPlatforms).join(", ")}`,
            });
          }
          return;
        }
        // else if (intent.query) {
        //   // Nếu chỉ có nội dung tìm kiếm mà không có nền tảng, hỏi người dùng muốn tìm trên nền tảng nào
        //   await askForPlatform(api, message, intent.query);
        //   return;
        // }
      }
    }

    const mentions = message.data.mentions || null;
    if (content && mentions && managerData?.replyUser) {
      const tagMe = mentions.find((mention) => mention.uid === idBot);
      if (tagMe) {
        for (const mention of mentions) {
          const targetId = mention.uid;
          if (targetId === idBot) {
            message.data.content = message.data.content
              .replace(message.data.content.substring(mention.pos, mention.pos + mention.len), "")
              .replace("@", "")
              .trim();
          }
        }
        try {
          await api.addReaction("CLOCK", message);
          const jsonStr = await chatWithGeminiAssistant(message);
          let replyOut = "Xin lỗi, tôi chưa thể trả lời lúc này.";
          try {
            const obj = JSON.parse(jsonStr);
            replyOut = obj?.content || replyOut;
          } catch {}
          await chatGeneralTypeContent(api, message, { message: replyOut });
          await api.addReaction("UNDO", message);
          await api.addReaction("LIKE", message);
        } catch {
          await api.addReaction("UNDO", message);
          await api.addReaction("TIEUTAN", message);
        }
        return;
      }
    }

    response = findResponse(idBot, content, threadId);
  }

  if (response) {
    if (typeof response === "object" && response.type === "card") {
      try {
        if (response.text) {
          await chatGeneralTypeContent(api, message, { message: response.text });
        }
        await api.sendBusinessCard(
          null,
          response.cardUserId,
          response.cardContent,
          message.type,
          threadId,
          86400000
        );
        if (response.isTemporary === true) {
          trackResponseUsage(idBot, threadId, response.question, `card:${response.cardUserId}`);
        }
      } catch (error) {
        console.error("Lỗi khi gửi card:", error);
        await chatGeneralTypeContent(api, message, {
          message: "Xin lỗi, không thể gửi card lúc này.",
        });
      }
    } 
    else if (typeof response === "object" && (response.type === "image" || response.type === "video" || response.type === "voice" || response.type === "file")) {
      try {
        let fileLocal = null;
        
        if (response.type === "image") {
          fileLocal = await handleCheckLinkFromImageLocal(response.fileName, api);
          if (fileLocal) {
            if (response.text) {
              await chatGeneralTypeContent(api, message, { message: response.text });
            }
            await api.sendImage(fileLocal.fileUrl, message, "", 86400000);
          }
        } else if (response.type === "video") {
          fileLocal = await handleCheckLinkFromVideoLocal(response.fileName, api);
          if (fileLocal) {
            if (response.text) {
              await chatGeneralTypeContent(api, message, { message: response.text });
            }
            await api.sendVideo({
              videoUrl: fileLocal.fileUrl,
              thumbnail: fileLocal.thumbUrl || "",
              threadId: threadId,
              threadType: message.type,
              message: { text: "" },
              ttl: 86400000,
            });
          }
        } else if (response.type === "voice") {
          fileLocal = await handleCheckLinkFromVoicesLocal(response.fileName, api);
          if (fileLocal) {
            if (response.text) {
              await chatGeneralTypeContent(api, message, { message: response.text });
            }
            await api.sendVoice(message, fileLocal.fileUrl, 86400000);
          }
        } else if (response.type === "file") {
          fileLocal = await handleCheckLinkFromFilesLocal(response.fileName, api);
          if (fileLocal) {
            if (response.text) {
              await chatGeneralTypeContent(api, message, { message: response.text });
            }
            await api.sendFile(message, fileLocal.fileUrl, 86400000);
          }
        }
        
        if (!fileLocal) {
          await chatGeneralTypeContent(api, message, {
            message: `Xin lỗi, không tìm thấy file ${response.type} "${response.fileName}" trong resource.`,
          });
        } else {
          if (response.isTemporary === true) {
            trackResponseUsage(idBot, threadId, response.question, `${response.type}:${response.fileName}`);
          }
        }
      } catch (error) {
        console.error(`Lỗi khi gửi ${response.type}:`, error);
        await chatGeneralTypeContent(api, message, {
          message: `Xin lỗi, không thể gửi ${response.type} lúc này.`,
        });
      }
    }
    else if (typeof response === "object" && response.text && response.card) {
      await chatGeneralTypeContent(api, message, { message: response.text });
      try {
        await api.sendBusinessCard(
          null,
          response.card.cardUserId,
          response.card.cardContent,
          message.type,
          threadId,
          86400000
        );
      } catch (error) {
        console.error("Lỗi khi gửi card:", error);
      }
    } 
    else {
      await chatGeneralTypeContent(api, message, { message: response });
    }
  } else {
    if (groupSettings[threadId].learnEnabled) {
      if (message.data.quote) {
        const nameQuote = message.data.quote.fromD;
        const botResponse = message.data.quote.msg;
        content = content.replace(nameQuote, "").replace("@", "").trim();
        if (content !== "" && content.length > 6) {
          learnFromChat(idBot, botResponse, threadId, content, nameGroup);
        }
      }
    }
  }
}

export function learnFromChat(idBot, message, threadId, response, groupName) {
  const data = getTrainingDataCache(idBot);

  if (!data[threadId]) {
    data[threadId] = {
      nameGroup: groupName,
      listTrain: {},
    };
  }

  if (data[threadId].listTrain[message]) {
    const existingData = data[threadId].listTrain[message];
    let responses = [];

    if (Array.isArray(existingData)) {
      responses = existingData;
    } else if (typeof existingData === "string") {
      responses = [{ response: existingData, isTemporary: true }];
    } else {
      responses = [existingData];
    }

    responses.push({
      response: response,
      isTemporary: true,
    });

    data[threadId].listTrain[message] = responses;
  } else {
    data[threadId].listTrain[message] = [
      {
        response: response,
        isTemporary: true,
      },
    ];
  }

  setHasChange(idBot);
}

function calculateSimilarity(str1, str2) {
  const tokenizer = new natural.WordTokenizer();
  const words1 = tokenizer.tokenize(str1.toLowerCase());
  const words2 = tokenizer.tokenize(str2.toLowerCase());

  const distance = natural.JaroWinklerDistance(words1.join(" "), words2.join(" "));
  return distance;
}

function isInvalidResponse(response) {
  if (!response || typeof response !== "string") {
    return false;
  }
  
  const responseLower = response.toLowerCase();

  const linkPatterns = ["http://", "https://", ".com", ".net", ".org", "www.", ".vn", "bit.ly"];

  const invalidKeywords = [
    "lệnh",
    "tồn tại",
    "prefix",
    "admin",
    "bot",
    "help",
    "hướng dẫn",
    "command",
    "!",
    ".",
    "không thể",
    "không tìm thấy",
    "không tồn tại",
  ];

  if (linkPatterns.some((pattern) => responseLower.includes(pattern))) {
    return true;
  }

  if (invalidKeywords.some((keyword) => responseLower.includes(keyword))) {
    return true;
  }

  return false;
}

function removeSpecificResponse(idBot, threadId, question, responseToRemove) {
  const data = getTrainingDataCache(idBot);
  let removed = false;

  if (data[threadId]?.listTrain?.[question]) {
    const responses = data[threadId].listTrain[question];

    if (Array.isArray(responses)) {
      const filteredResponses = responses.filter((item) => {
        const response = typeof item === "string" ? item : item.response;
        return response.trim() !== responseToRemove.trim();
      });

      if (filteredResponses.length < responses.length) {
        removed = true;

        if (filteredResponses.length === 0) {
          delete data[threadId].listTrain[question];
        } else {
          data[threadId].listTrain[question] = filteredResponses;
        }

        setHasChange(idBot);
        console.log(`Đã xóa câu trả lời "${responseToRemove}" của câu hỏi "${question}"`);
      }
    } else {
      const response = typeof responses === "string" ? responses : responses.response;
      if (response.trim() === responseToRemove.trim()) {
        delete data[threadId].listTrain[question];
        removed = true;
        setHasChange(idBot);
        console.log(`Đã xóa câu trả lời "${responseToRemove}" của câu hỏi "${question}"`);
      }
    }
  }

  return removed;
}

function trackResponseUsage(idBot, threadId, question, response) {
  removeSpecificResponse(idBot, threadId, question, response);
  return true;
}

function normalizeText(text) {
  return text
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function countMatchingWords(message, key) {
  const normalizedMessage = normalizeText(message);
  const normalizedKey = normalizeText(key);

  const messageChars = normalizedMessage.toLowerCase().split("");
  const keyChars = normalizedKey.toLowerCase().split("");

  let matchCount = 0;
  let i = 0;
  let j = 0;

  while (i < messageChars.length && j < keyChars.length) {
    if (messageChars[i] === " ") {
      i++;
      continue;
    }
    if (keyChars[j] === " ") {
      j++;
      continue;
    }

    if (messageChars[i] === keyChars[j]) {
      matchCount++;
      i++;
      j++;
    } else {
      if (i > 0 && messageChars[i] === messageChars[i - 1]) {
        i++;
        continue;
      }
      if (j > 0 && keyChars[j] === keyChars[j - 1]) {
        j++;
        continue;
      }
      i++;
      j++;
    }
  }

  return matchCount;
}

export function findResponse(idBot, message, threadId) {
  const data = getTrainingDataCache(idBot);
  const SIMILARITY_THRESHOLD = 0.85;
  const WORD_MATCH_THRESHOLD = 0.4;

  if (data[threadId] && data[threadId].listTrain) {
    const messageLower = message.toLowerCase();
    const messageWords = messageLower.split(/\s+/).filter((word) => word.length > 1);
    const matchedQuestions = [];

    for (const [key, value] of Object.entries(data[threadId].listTrain)) {
      const responses = Array.isArray(value) ? value : [value];
      const permanentResponses = responses.filter((r) => typeof r !== "string" && r.isTemporary === false);

      if (permanentResponses.length > 0) {
        const normalizedMessage = normalizeText(messageLower);
        const normalizedKey = normalizeText(key.toLowerCase());

        const messageWordsNormalized = normalizedMessage.split(/\s+/).filter(w => w.length > 0);
        const keyWordsNormalized = normalizedKey.split(/\s+/).filter(w => w.length > 0);

        const allKeyWordsMatch = keyWordsNormalized.every((keyWord) => {
          if (keyWord.length < 2) return true;
          
          return messageWordsNormalized.some((msgWord) => {
            const normalizedMsgWord = normalizeText(msgWord);
            const normalizedKeyWord = normalizeText(keyWord);

            if (normalizedMsgWord === normalizedKeyWord) return true;

            if (normalizedKeyWord.match(/[A-Z]/)) {
              const abbreviation = normalizedKeyWord
                .split(/(?=[A-Z])/)
                .map((word) => word.charAt(0).toLowerCase())
                .join("");

              if (abbreviation.length === normalizedMsgWord.length) {
                if (normalizedMsgWord === abbreviation) return true;

                const lastChar = abbreviation.charAt(abbreviation.length - 1);
                const baseWord = normalizedMsgWord.replace(new RegExp(lastChar + "+$"), "");

                if (
                  baseWord === abbreviation.slice(0, -1) &&
                  normalizedMsgWord
                    .slice(baseWord.length)
                    .split("")
                    .every((c) => c === lastChar)
                ) {
                  return true;
                }
              }
            }

            const lastCharFull = normalizedKeyWord.charAt(normalizedKeyWord.length - 1);
            const baseWordFull = normalizedMsgWord.replace(new RegExp(lastCharFull + "+$"), "");

            if (
              baseWordFull === normalizedKeyWord.slice(0, -1) &&
              normalizedMsgWord
                .slice(baseWordFull.length)
                .split("")
                .every((c) => c === lastCharFull)
            ) {
              return true;
            }

            return false;
          });
        });

        if (allKeyWordsMatch) {
          matchedQuestions.push({
            question: key,
            responses: permanentResponses,
            similarity: 1,
            isPermanent: true,
            isPartialMatch: true,
          });
        }
      }
    }

    if (data[threadId].listTrain[message]) {
      const responses = data[threadId].listTrain[message];
      const validResponses = Array.isArray(responses)
        ? responses.filter((r) => {
            if (typeof r === "object" && (r.type === "card" || r.type === "image" || r.type === "video" || r.type === "voice" || r.type === "file")) return true;
            return !isInvalidResponse(typeof r === "string" ? r : r.response);
          })
        : (typeof responses === "object" && (responses.type === "card" || responses.type === "image" || responses.type === "video" || responses.type === "voice" || responses.type === "file")) ||
          !isInvalidResponse(typeof responses === "string" ? responses : responses.response)
        ? [responses]
        : [];

      if (validResponses.length > 0) {
        matchedQuestions.push({
          question: message,
          responses: validResponses,
          similarity: 1,
          isPermanent: validResponses.some((r) => typeof r !== "string" && r.isTemporary === false),
          isExactMatch: true,
        });
      }
    }

    for (const [key, value] of Object.entries(data[threadId].listTrain)) {
      const keyLower = key.toLowerCase();
      const keyWords = keyLower.split(/\s+/).filter((word) => word.length > 1);
      
      const allKeyWordsInMessage = keyWords.every((keyWord) => {
        return messageWords.some((msgWord) => {
          const normalizedMsgWord = normalizeText(msgWord);
          const normalizedKeyWord = normalizeText(keyWord);
          return normalizedMsgWord === normalizedKeyWord;
        });
      });

      if (allKeyWordsInMessage && keyWords.length > 0) {
        const matchedWords = messageWords.filter((word) => keyWords.includes(word));
        const matchRatio = matchedWords.length / Math.max(messageWords.length, keyWords.length);

        if (matchRatio >= WORD_MATCH_THRESHOLD) {
          const similarity = calculateSimilarity(messageLower, keyLower);
          if (similarity >= SIMILARITY_THRESHOLD) {
            const responses = Array.isArray(value) ? value : [value];
            const validResponses = responses.filter((r) => {
              if (typeof r === "object" && (r.type === "card" || r.type === "image" || r.type === "video" || r.type === "voice" || r.type === "file")) return true;
              return !isInvalidResponse(typeof r === "string" ? r : r.response);
            });

            if (validResponses.length > 0) {
              matchedQuestions.push({
                question: key,
                responses: validResponses,
                similarity: similarity,
                isPermanent: validResponses.some((r) => typeof r !== "string" && r.isTemporary === false),
                isSimilarMatch: true,
              });
            }
          }
        }
      }
    }

    for (const [key, value] of Object.entries(data[threadId].listTrain)) {
      const keyWords = key.toLowerCase().split(/\s+/).filter((word) => word.length > 1);
      const messageWordsLower = messageLower.split(/\s+/).filter((word) => word.length > 1);

      const allKeyWordsInMessage = keyWords.every((keyWord) => {
        return messageWordsLower.some((msgWord) => {
          const normalizedMsgWord = normalizeText(msgWord);
          const normalizedKeyWord = normalizeText(keyWord);
          return normalizedMsgWord === normalizedKeyWord;
        });
      });

      if (allKeyWordsInMessage && keyWords.length > 0) {
        let isMatch = false;
        for (let i = 0; i <= keyWords.length - messageWordsLower.length; i++) {
          const subWords = keyWords.slice(i, i + messageWordsLower.length);
          if (messageWordsLower.every((word, index) => {
            const normalizedMsgWord = normalizeText(word);
            const normalizedKeyWord = normalizeText(subWords[index]);
            return normalizedMsgWord === normalizedKeyWord;
          })) {
            isMatch = true;
            break;
          }
        }

        if (isMatch) {
          const responses = Array.isArray(value) ? value : [value];
          const validResponses = responses.filter((r) => {
            if (typeof r === "object" && (r.type === "card" || r.type === "image" || r.type === "video" || r.type === "voice" || r.type === "file")) return true;
            return !isInvalidResponse(typeof r === "string" ? r : r.response);
          });

          if (validResponses.length > 0) {
            matchedQuestions.push({
              question: key,
              responses: validResponses,
              similarity: 0.8,
              isPermanent: validResponses.some((r) => typeof r !== "string" && r.isTemporary === false),
              isPartialMatch: true,
            });
          }
        }
      }
    }

    matchedQuestions.sort((a, b) => {
      if (a.isPermanent !== b.isPermanent) {
        return a.isPermanent ? -1 : 1;
      }

      if (Math.abs(a.similarity - b.similarity) < 0.1) {
        const aMatchCount = countMatchingWords(messageLower, a.question);
        const bMatchCount = countMatchingWords(messageLower, b.question);
        if (aMatchCount !== bMatchCount) {
          return bMatchCount - aMatchCount;
        }
      }

      return b.similarity - a.similarity;
    });

    if (matchedQuestions.length > 0) {
      const bestMatch = matchedQuestions[0];
      const selectedResponse = bestMatch.responses[Math.floor(Math.random() * bestMatch.responses.length)];
      
      if (typeof selectedResponse === "object" && selectedResponse.type === "card") {
        return {
          type: "card",
          cardUserId: selectedResponse.cardUserId,
          cardContent: selectedResponse.response || "Danh Thiếp Liên Hệ",
          text: selectedResponse.text || null,
          isTemporary: selectedResponse.isTemporary || false,
          question: bestMatch.question,
        };
      }
      
      if (typeof selectedResponse === "object" && (selectedResponse.type === "image" || selectedResponse.type === "video" || selectedResponse.type === "voice" || selectedResponse.type === "file")) {
        return {
          type: selectedResponse.type,
          fileName: selectedResponse.fileName,
          text: selectedResponse.text || null,
          isTemporary: selectedResponse.isTemporary || false,
          question: bestMatch.question,
        };
      }
      
      const response = typeof selectedResponse === "string" ? selectedResponse : selectedResponse.response;
      const isTemp = typeof selectedResponse === "string" ? true : selectedResponse.isTemporary;

      if (isTemp === true) {
        trackResponseUsage(idBot, threadId, bestMatch.question, response);
      }
      
      const cardInfo = getCardForQuestion(idBot, threadId, bestMatch.question);
      if (cardInfo) {
        return {
          text: response,
          card: cardInfo,
        };
      }
      
      return response;
    }
  }
  return null;
}

function getCardForQuestion(idBot, threadId, question) {
  const data = getTrainingDataCache(idBot);
  if (data[threadId]?.listTrain?.[question]) {
    const responses = data[threadId].listTrain[question];
    const responseArray = Array.isArray(responses) ? responses : [responses];
    
    const cardResponse = responseArray.find((r) => typeof r === "object" && r.type === "card");
    if (cardResponse) {
      return {
        cardUserId: cardResponse.cardUserId,
        cardContent: cardResponse.response || "Danh Thiếp Liên Hệ",
      };
    }
  }
  return null;
}

export async function handleLearnCommand(api, message, groupSettings) {
  const threadId = message.threadId;
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());

  if (content.startsWith(`${prefix}learnnow_`)) {
    const parts = content.split("_");
    if (parts.length >= 3) {
      const question = parts[1];
      const secondPart = parts[2];
      
      if (secondPart.toLowerCase() === "card" && parts.length >= 4) {
        let cardUserId = parts[3];
        const remainingParts = parts.slice(4).join("_");
        const senderId = message.data.uidFrom;
        
        if (cardUserId.toLowerCase() === "me") {
          cardUserId = senderId;
        }
        
        let cardContent = "Danh Thiếp Liên Hệ";
        let text = null;
        
        if (remainingParts.includes(">")) {
          const splitParts = remainingParts.split(">");
          cardContent = splitParts[0] || "Danh Thiếp Liên Hệ";
          text = splitParts.slice(1).join(">").trim() || null;
        } else if (remainingParts) {
          cardContent = remainingParts;
        }

        if (!/^\d+$/.test(cardUserId)) {
          const caption = "❌ Zalo ID không hợp lệ. Vui lòng nhập số Zalo ID hoặc 'me' để dùng card của bạn.";
          await sendMessageWarning(api, message, caption);
          return true;
        }

        const success = await learnNewCardResponse(api, threadId, question, cardUserId, cardContent, text);

        if (success) {
          let caption = `✅ Đã thêm card thành công. Khi người dùng nhắc đến "${question}", tôi sẽ gửi card của Zalo ID: ${cardUserId}`;
          if (parts[3].toLowerCase() === "me") {
            caption = `✅ Đã thêm card thành công. Khi người dùng nhắc đến "${question}", tôi sẽ gửi card của bạn (Zalo ID: ${cardUserId})`;
          }
          if (text) {
            caption += `\nText: "${text}"`;
          }
          await sendMessageComplete(api, message, caption);
        } else {
          const caption = `❌ Card với Zalo ID "${cardUserId}" đã tồn tại cho câu hỏi "${question}"`;
          await sendMessageWarning(api, message, caption);
        }
      } 
      else if (secondPart.toLowerCase() === "image" && parts.length >= 4) {
        const fileName = parts.slice(3).join("_");
        const success = await learnNewMediaResponse(api, threadId, question, "image", fileName);

        if (success) {
          const caption = `✅ Đã thêm ảnh thành công. Khi người dùng nhắc đến "${question}", tôi sẽ gửi ảnh: ${fileName}`;
          await sendMessageComplete(api, message, caption);
        } else {
          const caption = `❌ Không tìm thấy file ảnh "${fileName}" trong resource hoặc đã tồn tại cho câu hỏi "${question}"`;
          await sendMessageWarning(api, message, caption);
        }
      }
      else if (secondPart.toLowerCase() === "video" && parts.length >= 4) {
        const fileName = parts.slice(3).join("_");
        const success = await learnNewMediaResponse(api, threadId, question, "video", fileName);

        if (success) {
          const caption = `✅ Đã thêm video thành công. Khi người dùng nhắc đến "${question}", tôi sẽ gửi video: ${fileName}`;
          await sendMessageComplete(api, message, caption);
        } else {
          const caption = `❌ Không tìm thấy file video "${fileName}" trong resource hoặc đã tồn tại cho câu hỏi "${question}"`;
          await sendMessageWarning(api, message, caption);
        }
      }
      else if (secondPart.toLowerCase() === "voice" && parts.length >= 4) {
        const fileName = parts.slice(3).join("_");
        const success = await learnNewMediaResponse(api, threadId, question, "voice", fileName);

        if (success) {
          const caption = `✅ Đã thêm voice thành công. Khi người dùng nhắc đến "${question}", tôi sẽ gửi voice: ${fileName}`;
          await sendMessageComplete(api, message, caption);
        } else {
          const caption = `❌ Không tìm thấy file voice "${fileName}" trong resource hoặc đã tồn tại cho câu hỏi "${question}"`;
          await sendMessageWarning(api, message, caption);
        }
      } else {
        const answer = parts.slice(2).join("_");
        
        const extensionMatch = answer.match(/\.\w+(_|$)/);
        const hasExtension = extensionMatch !== null;
        
        if (hasExtension) {
          const ext = extensionMatch[0].replace(/[._]/g, '').toLowerCase();
          let mediaType = null;
          
          if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(ext)) {
            mediaType = "image";
          }
          else if (["mp4", "mov", "avi", "mkv", "webm", "flv", "wmv"].includes(ext)) {
            mediaType = "video";
          }
          else if (["mp3", "wav", "aac", "m4a", "ogg", "flac", "wma"].includes(ext)) {
            mediaType = "voice";
          }
          else {
            mediaType = "file";
          }
          
          const extensionIndex = extensionMatch.index;
          const extensionEndIndex = extensionIndex + extensionMatch[0].length;
          let fileName = answer;
          let text = null;
          
          if (extensionEndIndex < answer.length && answer[extensionEndIndex - 1] === '_') {
            fileName = answer.substring(0, extensionIndex + extensionMatch[0].length - 1);
            text = answer.substring(extensionEndIndex).trim();
          } else if (extensionEndIndex < answer.length) {
            fileName = answer.substring(0, extensionIndex + extensionMatch[0].length - 1);
            text = answer.substring(extensionEndIndex).trim();
          } else {
            fileName = answer.substring(0, extensionIndex + extensionMatch[0].length);
          }
          
          const success = await learnNewMediaResponse(api, threadId, question, mediaType, fileName, text);
          
          if (success) {
            const mediaTypeName = mediaType === "image" ? "ảnh" : mediaType === "video" ? "video" : mediaType === "voice" ? "voice" : "file";
            let caption = `✅ Đã thêm ${mediaTypeName} thành công. Khi người dùng nhắc đến "${question}", tôi sẽ gửi ${mediaTypeName}: ${fileName}`;
            if (text) {
              caption += `\nText: "${text}"`;
            }
            await sendMessageComplete(api, message, caption);
          } else {
            const successText = await learnNewResponse(api, threadId, question, answer);
            if (successText) {
              const caption = `Đã thêm câu trả lời mới thành công. Khi người dùng nhắc đến "${question}", tôi có thể trả lời: "${answer}"`;
              await sendMessageComplete(api, message, caption);
            } else {
              const caption = `Câu trả lời "${answer}" đã tồn tại cho câu hỏi "${question}"`;
              await sendMessageWarning(api, message, caption);
            }
          }
        } else {
          const success = await learnNewResponse(api, threadId, question, answer);

          if (success) {
            const caption = `Đã thêm câu trả lời mới thành công. Khi người dùng nhắc đến "${question}", tôi có thể trả lời: "${answer}"`;
            await sendMessageComplete(api, message, caption);
          } else {
            const caption = `Câu trả lời "${answer}" đã tồn tại cho câu hỏi "${question}"`;
            await sendMessageWarning(api, message, caption);
          }
        }
      }
    } else {
      const caption =
        "Cú pháp không hợp lệ.\n" +
        "• Thêm text: !learnnow_[Câu Hỏi]_[Câu Trả Lời]\n" +
        "• Thêm card: !learnnow_[Câu Hỏi]_card_[Zalo ID hoặc 'me']_[Nội dung card (tùy chọn)]_[Text (tùy chọn)]\n" +
        "  (Dùng 'me' để tự động lấy card của người dùng lệnh)\n" +
        "• Thêm ảnh: !learnnow_[Câu Hỏi]_image_[tên file]\n" +
        "• Thêm video: !learnnow_[Câu Hỏi]_video_[tên file]\n" +
        "• Thêm voice: !learnnow_[Câu Hỏi]_voice_[tên file]\n" +
        "• Thêm file: !learnnow_[Câu Hỏi]_file_[tên file]";
      await sendMessageWarning(api, message, caption);
    }
    return true;
  } else if (content.startsWith(`${prefix}learnlist`)) {
    await handleLearnListCommand(api, message);
    return true;
  } else if (content.startsWith(`${prefix}learn`)) {
    const parts = content.split(" ");
    if (parts.length === 1) {
      groupSettings[threadId].learnEnabled = !groupSettings[threadId].learnEnabled;
      const caption = `Chế độ học tập đã được ${groupSettings[threadId].learnEnabled ? "bật" : "tắt"}!`;
      await sendMessageStateQuote(api, message, caption, groupSettings[threadId].learnEnabled, 30000, false);
    } else if (parts[1] === "on" || parts[1] === "off") {
      groupSettings[threadId].learnEnabled = parts[1] === "on";
      const caption = `Chế độ học tập đã được ${parts[1] === "on" ? "bật" : "tắt"}!`;
      await sendMessageStateQuote(api, message, caption, groupSettings[threadId].learnEnabled, 30000, false);
    } else {
      await sendMessageWarning(
        api,
        message,
        "❌ Cú pháp không hợp lệ. Sử dụng !learn, !learn on/off để bật tắt chế độ học tập"
      );
    }
    return true;
  } else if (content.startsWith(`${prefix}unlearn`)) {
    await handleUnlearnCommand(api, message);
    return true;
  }
  return false;
}

export async function handleReplyCommand(api, message, groupSettings) {
  const threadId = message.threadId;
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());

  if (content.startsWith(`${prefix}reply`)) {
    const parts = content.split(" ");
    if (parts.length === 1) {
      groupSettings[threadId].replyEnabled = !groupSettings[threadId].replyEnabled;
      const caption = `Chế độ trả lời đã được ${groupSettings[threadId].replyEnabled ? "bật" : "tắt"}!`;
      await sendMessageStateQuote(api, message, caption, groupSettings[threadId].replyEnabled, 30000, false);
    } else if (parts[1] === "on" || parts[1] === "off") {
      groupSettings[threadId].replyEnabled = parts[1] === "on";
      const caption = `Chế độ trả lời đã được ${parts[1] === "on" ? "bật" : "tắt"}!`;
      await sendMessageStateQuote(api, message, caption, groupSettings[threadId].replyEnabled, 30000, false);
    } else {
      await sendMessageWarning(
        api,
        message,
        "Cú pháp không hợp lệ. Sử dụng !reply hoặc !reply on/off để bật tắt chế độ trả lời"
      );
    }
    return true;
  }
  return false;
}

export async function learnNewResponse(api, threadId, question, answer) {
  const idBot = api.getBotId();
  const data = getTrainingDataCache(idBot);

  if (!data[threadId]) {
    data[threadId] = {
      listTrain: {},
    };
  }

  if (data[threadId].listTrain[question]) {
    const existingData = data[threadId].listTrain[question];
    let responses = [];

    if (Array.isArray(existingData)) {
      responses = existingData;
    } else if (typeof existingData === "string") {
      responses = [{ response: existingData, isTemporary: false }];
    } else {
      responses = [existingData];
    }

    const isDuplicate = responses.some((r) => r.response === answer);
    if (!isDuplicate) {
      responses.push({
        response: answer,
        isTemporary: false,
      });
      data[threadId].listTrain[question] = responses;
      setHasChange(idBot);
      return true;
    } else {
      return false;
    }
  } else {
    data[threadId].listTrain[question] = [
      {
        response: answer,
        isTemporary: false,
      },
    ];
    setHasChange(idBot);
    return true;
  }
}

export async function learnNewCardResponse(api, threadId, question, cardUserId, cardContent, text = null) {
  const idBot = api.getBotId();
  const data = getTrainingDataCache(idBot);

  if (!data[threadId]) {
    data[threadId] = {
      listTrain: {},
    };
  }

  if (data[threadId].listTrain[question]) {
    const existingData = data[threadId].listTrain[question];
    let responses = [];

    if (Array.isArray(existingData)) {
      responses = existingData;
    } else if (typeof existingData === "string") {
      responses = [{ response: existingData, isTemporary: false }];
    } else {
      responses = [existingData];
    }

    const isDuplicate = responses.some(
      (r) => typeof r === "object" && r.type === "card" && r.cardUserId === cardUserId && r.response === cardContent
    );
    if (!isDuplicate) {
      responses.push({
        type: "card",
        response: cardContent,
        cardUserId: cardUserId,
        text: text,
        isTemporary: false,
      });
      data[threadId].listTrain[question] = responses;
      setHasChange(idBot);
      return true;
    } else {
      return false;
    }
  } else {
    data[threadId].listTrain[question] = [
      {
        type: "card",
        response: cardContent,
        cardUserId: cardUserId,
        text: text,
        isTemporary: false,
      },
    ];
    setHasChange(idBot);
    return true;
  }
}

export async function learnNewMediaResponse(api, threadId, question, mediaType, fileName, text = null) {
  const idBot = api.getBotId();
  const data = getTrainingDataCache(idBot);

  let fileExists = false;
  let actualFileName = fileName;
  
  if (mediaType === "image") {
    let fileLocal = await handleCheckLinkFromImageLocal(fileName, api);
    if (!fileLocal && fileName.includes('_')) {
      const fileNameWithSpace = fileName.replace(/_/g, ' ');
      fileLocal = await handleCheckLinkFromImageLocal(fileNameWithSpace, api);
      if (fileLocal) {
        actualFileName = fileNameWithSpace;
      }
    }
    fileExists = fileLocal !== null;
  } else if (mediaType === "video") {
    let fileLocal = await handleCheckLinkFromVideoLocal(fileName, api);
    if (!fileLocal && fileName.includes('_')) {
      const fileNameWithSpace = fileName.replace(/_/g, ' ');
      fileLocal = await handleCheckLinkFromVideoLocal(fileNameWithSpace, api);
      if (fileLocal) {
        actualFileName = fileNameWithSpace;
      }
    }
    fileExists = fileLocal !== null;
  } else if (mediaType === "voice") {
    let fileLocal = await handleCheckLinkFromVoicesLocal(fileName, api);
    if (!fileLocal && fileName.includes('_')) {
      const fileNameWithSpace = fileName.replace(/_/g, ' ');
      fileLocal = await handleCheckLinkFromVoicesLocal(fileNameWithSpace, api);
      if (fileLocal) {
        actualFileName = fileNameWithSpace;
      }
    }
    fileExists = fileLocal !== null;
  } else if (mediaType === "file") {
    let fileLocal = await handleCheckLinkFromFilesLocal(fileName, api);
    if (!fileLocal && fileName.includes('_')) {
      const fileNameWithSpace = fileName.replace(/_/g, ' ');
      fileLocal = await handleCheckLinkFromFilesLocal(fileNameWithSpace, api);
      if (fileLocal) {
        actualFileName = fileNameWithSpace;
      }
    }
    fileExists = fileLocal !== null;
  }

  if (!fileExists) {
    return false;
  }
  
  fileName = actualFileName;

  if (!data[threadId]) {
    data[threadId] = {
      listTrain: {},
    };
  }

  if (data[threadId].listTrain[question]) {
    const existingData = data[threadId].listTrain[question];
    let responses = [];

    if (Array.isArray(existingData)) {
      responses = existingData;
    } else if (typeof existingData === "string") {
      responses = [{ response: existingData, isTemporary: false }];
    } else {
      responses = [existingData];
    }

    const isDuplicate = responses.some(
      (r) => typeof r === "object" && r.type === mediaType && r.fileName === fileName
    );
    if (!isDuplicate) {
      responses.push({
        type: mediaType,
        fileName: fileName,
        text: text,
        isTemporary: false,
      });
      data[threadId].listTrain[question] = responses;
      setHasChange(idBot);
      return true;
    } else {
      return false;
    }
  } else {
    data[threadId].listTrain[question] = [
      {
        type: mediaType,
        fileName: fileName,
        text: text,
        isTemporary: false,
      },
    ];
    setHasChange(idBot);
    return true;
  }
}

export async function handleLearnListCommand(api, message) {
  const botId = api.getBotId();
  const threadId = message.threadId;
  const data = getTrainingDataCache(botId);

  if (!data[threadId] || !data[threadId].listTrain || Object.keys(data[threadId].listTrain).length === 0) {
    await sendMessageQuery(api, message, "📝 Chưa có câu hỏi nào được học trong nhóm này.");
    return;
  }

  const listTrain = data[threadId].listTrain;
  const questions = Object.keys(listTrain);
  const totalQuestions = questions.length;
  let totalResponses = 0;

  for (const question of questions) {
    const responses = listTrain[question];
    if (Array.isArray(responses)) {
      totalResponses += responses.length;
    } else {
      totalResponses += 1;
    }
  }

  let listText = `📚 Danh sách câu hỏi đã học (${totalQuestions} câu hỏi, ${totalResponses} câu trả lời):\n\n`;
  
  questions.forEach((question, index) => {
    const responses = listTrain[question];
    const responseArray = Array.isArray(responses) ? responses : [responses];
    
    listText += `${index + 1}. ❓ "${question}"\n`;
    
    responseArray.forEach((response, respIndex) => {
      let responseText = "";
      let responseType = "";
      
      if (typeof response === "string") {
        responseText = response;
        responseType = "📝 Text";
      } else if (response.type === "card") {
        responseText = `Card: ${response.cardUserId}`;
        responseType = "💳 Card";
        if (response.response && response.response !== "Danh Thiếp Liên Hệ") {
          responseText += ` - ${response.response}`;
        }
      } else if (response.type === "image") {
        responseText = response.fileName || "";
        if (response.text) {
          responseText += ` (Text: ${response.text})`;
        }
        responseType = "🖼️ Image";
      } else if (response.type === "video") {
        responseText = response.fileName || "";
        if (response.text) {
          responseText += ` (Text: ${response.text})`;
        }
        responseType = "🎥 Video";
      } else if (response.type === "voice") {
        responseText = response.fileName || "";
        if (response.text) {
          responseText += ` (Text: ${response.text})`;
        }
        responseType = "🎤 Voice";
      } else if (response.type === "file") {
        responseText = response.fileName || "";
        if (response.text) {
          responseText += ` (Text: ${response.text})`;
        }
        responseType = "📄 File";
      } else {
        responseText = response.response || "";
        responseType = response.isTemporary ? "⏱️ Temporary" : "📝 Permanent";
      }
      
      const displayText = responseText.length > 50 
        ? responseText.substring(0, 50) + "..." 
        : responseText;
      
      listText += `   ${respIndex + 1}. ${responseType}: ${displayText}\n`;
    });
    
    listText += "\n";
  });

  const maxLength = 2800;
  if (listText.length <= maxLength) {
    await sendMessageQuery(api, message, listText.trim());
  } else {
    const lines = listText.split("\n");
    let currentChunk = `📚 Danh sách câu hỏi đã học (${totalQuestions} câu hỏi, ${totalResponses} câu trả lời):\n\n`;
    let chunkIndex = 1;
    const totalChunks = Math.ceil(listText.length / maxLength);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if ((currentChunk + line + "\n").length > maxLength && currentChunk.length > 100) {
        await sendMessageQuery(
          api,
          message,
          `${currentChunk.trim()}\n\n[Phần ${chunkIndex}/${totalChunks}]`
        );
        currentChunk = "";
        chunkIndex++;
      }
      currentChunk += line + "\n";
    }

    if (currentChunk.trim().length > 0) {
      await sendMessageQuery(
        api,
        message,
        `${currentChunk.trim()}\n\n[Phần ${chunkIndex}/${totalChunks}]`
      );
    }
  }
}

export async function handleUnlearnCommand(api, message) {
  const botId = api.getBotId();
  const threadId = message.threadId;
  const content = removeMention(message);
  const prefix = getGlobalPrefix(botId);

  if (content.startsWith(`${prefix}unlearn`)) {
    const parts = content.split(" ");
    if (parts.length >= 2) {
      const mediaType = parts[1].toLowerCase();
      
      if (mediaType === "all") {
        const removed = await removeAllLearnedData(botId, threadId);
        if (removed) {
          await api.sendMessage(
            {
              msg: `✅ Đã xóa thành công tất cả dữ liệu học tập trong nhóm này!`,
              quote: message,
              ttl: 30000,
            },
            threadId,
            message.type
          );
        } else {
          await api.sendMessage(
            {
              msg: `❌ Không có dữ liệu học tập nào để xóa trong nhóm này.`,
              quote: message,
              ttl: 30000,
            },
            threadId,
            message.type
          );
        }
        return true;
      }
      
      if (mediaType === "card" && parts.length >= 3) {
        const cardUserId = parts[2];
        
        if (!/^\d+$/.test(cardUserId)) {
          await api.sendMessage(
            {
              msg: "❌ Zalo ID không hợp lệ. Vui lòng nhập số Zalo ID.",
              quote: message,
              ttl: 30000,
            },
            threadId,
            message.type
          );
          return true;
        }

        const removed = await removeLearnedCardResponse(botId, threadId, cardUserId);
        if (removed) {
          await api.sendMessage(
            {
              msg: `✅ Đã xóa thành công tất cả card có Zalo ID "${cardUserId}"`,
              quote: message,
              ttl: 30000,
            },
            threadId,
            message.type
          );
        } else {
          await api.sendMessage(
            {
              msg: `❌ Không tìm thấy card nào có Zalo ID "${cardUserId}"`,
              quote: message,
              ttl: 30000,
            },
            threadId,
            message.type
          );
        }
      }
      else if ((mediaType === "image" || mediaType === "video" || mediaType === "voice" || mediaType === "file") && parts.length >= 3) {
        const fileName = parts.slice(2).join(" ");
        const removed = await removeLearnedMediaResponse(botId, threadId, mediaType, fileName);
        
        if (removed) {
          const mediaTypeName = mediaType === "image" ? "ảnh" : mediaType === "video" ? "video" : mediaType === "voice" ? "voice" : "file";
          await api.sendMessage(
            {
              msg: `✅ Đã xóa thành công tất cả ${mediaTypeName} có tên "${fileName}"`,
              quote: message,
              ttl: 30000,
            },
            threadId,
            message.type
          );
        } else {
          const mediaTypeName = mediaType === "image" ? "ảnh" : mediaType === "video" ? "video" : mediaType === "voice" ? "voice" : "file";
          await api.sendMessage(
            {
              msg: `❌ Không tìm thấy ${mediaTypeName} nào có tên "${fileName}"`,
              quote: message,
              ttl: 30000,
            },
            threadId,
            message.type
          );
        }
      } else {
        const valueToRemove = parts.slice(1).join(" ");
        const removed = await removeLearnedResponse(botId, threadId, valueToRemove);
        if (removed) {
          await api.sendMessage(
            {
              msg: `✅ Đã xóa thành công câu hỏi có câu trả lời "${valueToRemove}"`,
              quote: message,
              ttl: 30000,
            },
            threadId,
            message.type
          );
        } else {
          await api.sendMessage(
            {
              msg: `❌ Không tìm thấy câu hỏi nào có câu trả lời "${valueToRemove}"`,
              quote: message,
              ttl: 30000,
            },
            threadId,
            message.type
          );
        }
      }
    } else {
      await api.sendMessage(
        {
          msg: "❌ Cú pháp không hợp lệ.\n" +
               "• Xóa tất cả: !unlearn all\n" +
               "• Xóa text: !unlearn [Câu Trả Lời]\n" +
               "• Xóa card: !unlearn card [Zalo ID]\n" +
               "• Xóa ảnh: !unlearn image [tên file]\n" +
               "• Xóa video: !unlearn video [tên file]\n" +
               "• Xóa voice: !unlearn voice [tên file]\n" +
               "• Xóa file: !unlearn file [tên file]",
          quote: message,
          ttl: 30000,
        },
        threadId,
        message.type
      );
    }
    return true;
  }
  return false;
}

export async function removeLearnedResponse(idBot, threadId, value) {
  const data = getTrainingDataCache(idBot);
  let removed = false;

  if (data[threadId] && data[threadId].listTrain) {
    const entries = Object.entries(data[threadId].listTrain);

    for (const [key, val] of entries) {
      if (Array.isArray(val)) {
        const filteredResponses = val.filter((item) => {
          if (typeof item === "object" && (item.type === "card" || item.type === "image" || item.type === "video" || item.type === "voice" || item.type === "file")) {
            return true;
          }
          const response = typeof item === "string" ? item : item.response;
          if (!response) return true;
          return response.trim() !== value.trim();
        });

        if (filteredResponses.length < val.length) {
          removed = true;
          console.log(`Đã xóa - Câu hỏi: "${key}" - Câu trả lời: "${value}"`);

          if (filteredResponses.length === 0) {
            delete data[threadId].listTrain[key];
          } else {
            data[threadId].listTrain[key] = filteredResponses;
          }
        }
      } else {
        if (typeof val === "object" && (val.type === "card" || val.type === "image" || val.type === "video" || val.type === "voice" || val.type === "file")) {
          continue;
        }
        const response = typeof val === "string" ? val : val.response;
        if (response && response.trim() === value.trim()) {
          delete data[threadId].listTrain[key];
          removed = true;
          console.log(`Đã xóa - Câu hỏi: "${key}" - Câu trả lời: "${value}"`);
        }
      }
    }

    if (removed) {
      setHasChange(idBot);
    }
  }

  return removed;
}

export async function removeLearnedCardResponse(idBot, threadId, cardUserId) {
  const data = getTrainingDataCache(idBot);
  let removed = false;

  if (data[threadId] && data[threadId].listTrain) {
    const entries = Object.entries(data[threadId].listTrain);

    for (const [key, val] of entries) {
      if (Array.isArray(val)) {
        const filteredResponses = val.filter((item) => {
          if (typeof item === "object" && item.type === "card") {
            return item.cardUserId !== cardUserId;
          }
          return true;
        });

        if (filteredResponses.length < val.length) {
          removed = true;
          console.log(`Đã xóa card - Câu hỏi: "${key}" - Zalo ID: "${cardUserId}"`);

          if (filteredResponses.length === 0) {
            delete data[threadId].listTrain[key];
          } else {
            data[threadId].listTrain[key] = filteredResponses;
          }
        }
      } else {
        if (typeof val === "object" && val.type === "card" && val.cardUserId === cardUserId) {
          delete data[threadId].listTrain[key];
          removed = true;
          console.log(`Đã xóa card - Câu hỏi: "${key}" - Zalo ID: "${cardUserId}"`);
        }
      }
    }

    if (removed) {
      setHasChange(idBot);
    }
  }

  return removed;
}

export async function removeLearnedMediaResponse(idBot, threadId, mediaType, fileName) {
  const data = getTrainingDataCache(idBot);
  let removed = false;

  if (data[threadId] && data[threadId].listTrain) {
    const entries = Object.entries(data[threadId].listTrain);

    for (const [key, val] of entries) {
      if (Array.isArray(val)) {
        const filteredResponses = val.filter((item) => {
          if (typeof item === "object" && item.type === mediaType) {
            return item.fileName !== fileName;
          }
          return true;
        });

        if (filteredResponses.length < val.length) {
          removed = true;
          const mediaTypeName = mediaType === "image" ? "ảnh" : mediaType === "video" ? "video" : mediaType === "voice" ? "voice" : "file";
          console.log(`Đã xóa ${mediaTypeName} - Câu hỏi: "${key}" - File: "${fileName}"`);

          if (filteredResponses.length === 0) {
            delete data[threadId].listTrain[key];
          } else {
            data[threadId].listTrain[key] = filteredResponses;
          }
        }
      } else {
        if (typeof val === "object" && val.type === mediaType && val.fileName === fileName) {
          delete data[threadId].listTrain[key];
          removed = true;
          const mediaTypeName = mediaType === "image" ? "ảnh" : mediaType === "video" ? "video" : mediaType === "voice" ? "voice" : "file";
          console.log(`Đã xóa ${mediaTypeName} - Câu hỏi: "${key}" - File: "${fileName}"`);
        }
      }
    }

    if (removed) {
      setHasChange(idBot);
    }
  }

  return removed;
}

export async function removeAllLearnedData(idBot, threadId) {
  const data = getTrainingDataCache(idBot);
  let removed = false;

  if (data[threadId] && data[threadId].listTrain) {
    const questionCount = Object.keys(data[threadId].listTrain).length;
    
    if (questionCount > 0) {
      data[threadId].listTrain = {};
      removed = true;
      setHasChange(idBot);
      console.log(`Đã xóa tất cả dữ liệu học tập trong nhóm ${threadId} (${questionCount} câu hỏi)`);
    }
  }

  return removed;
}


function isUserMuted(userId) {
  if (!mutedUsers.has(userId)) return false;

  const muteInfo = mutedUsers.get(userId);
  const now = Date.now();

  if (now > muteInfo.until) {
    mutedUsers.delete(userId);
    return false;
  }

  return true;
}

function muteUser(userId, reason, duration = DEFAULT_MUTE_TIME) {
  const until = Date.now() + duration;
  mutedUsers.set(userId, { until, reason });

  setTimeout(() => {
    if (mutedUsers.has(userId) && mutedUsers.get(userId).until <= Date.now()) {
      mutedUsers.delete(userId);
    }
  }, duration);

  return until;
}

function checkAndUpdateSpamDetection(userId, content) {
  const now = Date.now();

  if (!messageHistory.has(userId)) {
    messageHistory.set(userId, []);
  }

  const userHistory = messageHistory.get(userId);

  userHistory.push({
    timestamp: now,
    content: content,
  });

  const recentMessages = userHistory.filter((msg) => now - msg.timestamp <= SPAM_TIME_WINDOW);
  messageHistory.set(userId, recentMessages);

  if (recentMessages.length >= SPAM_THRESHOLD) {
    const uniqueContents = new Set(recentMessages.map((msg) => msg.content));

    if (uniqueContents.size <= 2 || recentMessages.length > SPAM_THRESHOLD + 2) {
      return true;
    }
  }

  return false;
}

function isDuplicateQuestion(userId, threadId, content) {
  const key = `${threadId}_${userId}`;

  if (!recentMessages.has(key)) {
    recentMessages.set(key, { content, timestamp: Date.now() });
    return false;
  }

  const lastMessage = recentMessages.get(key);
  const isDuplicate = content.toLowerCase().trim() === lastMessage.content.toLowerCase().trim();

  if (!isDuplicate) {
    recentMessages.set(key, { content, timestamp: Date.now() });
  }

  return isDuplicate;
}

export async function initTrainingSystem(api) {
  const idBot = api.getBotId();
  loadTrainingDataCache(idBot);

  api.apiInstance.schedule.saveTrainingSystem = schedule.scheduleJob("*/10 * * * * *", async () => {
    saveTrainingDataCache(idBot);
  });
}
