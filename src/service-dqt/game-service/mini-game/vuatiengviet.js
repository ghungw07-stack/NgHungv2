import axios from "axios";
import { getActiveGames, addGame, removeGame, addPlayer } from "./index.js";
import { isAdmin } from "../../../index.js";
import { sendReactionWaitingCountdown } from "../../../commands/manager-command/check-countdown.js";
import { sendMessageCompleteRequest, sendMessageFromSQL } from "../../chat-zalo/chat-style/chat-style.js";
import { normalizeSymbolName, removeMention } from "../../../utils/format-util.js";
import { getRankMiniGameInfo, updateRankMiniGame, usePointMiniGame } from "../../info-service/rank-chat.js";
import { getDescriptionKeyword, getWordFromAPI } from "../../api-crawl/content/vietnam-word/vietnam-word.js";

export const gameTypeVuaTiengViet = "Vua Tiếng Việt";
const COOLDOWN_DURATION = 3000;
const playerCooldowns = new Map();
const isCheckWinner = {};
const POINT_USE_MULTI = 5;
const TIME_TO_LIVE = 86400000;

function areAnagrams(str1, str2) {
  return str1.split("").sort().join("") === str2.split("").sort().join("");
}

function scrambleWord(word) {
  const characters = word.replace(/\s/g, "").split("");
  for (let i = characters.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [characters[i], characters[j]] = [characters[j], characters[i]];
  }
  return characters.join(" | ");
}

export async function startVuaTiengVietGame(api, message, threadId) {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const wordData = await getWordFromAPI();
  if (!wordData) {
    const result = {
      success: false,
      message: `🔴 Có lỗi xảy ra khi khởi tạo trò chơi. Vui lòng thử lại sau.`,
    };
    await sendMessageFromSQL(api, message, result, true, 30000);
    return;
  }

  const scrambledWord = scrambleWord(wordData.text);
  const gameInstance = {
    type: gameTypeVuaTiengViet,
    originalWord: wordData.text,
    scrambledWord: scrambledWord,
    guesses: 0,
    players: new Map(),
  };

  addGame(threadId, gameTypeVuaTiengViet, gameInstance);
  addPlayer(threadId, gameTypeVuaTiengViet, senderId, senderName);

  const result = {
    caption:
      `📝 Trò chơi Vua Tiếng Việt đã bắt đầu!` + `\n\n🤖 Hãy đoán từ sau khi được xáo trộn:` + `\n🎯 ${scrambledWord}`,
  };
  await sendMessageCompleteRequest(api, message, result, TIME_TO_LIVE);
}

export async function checkIsWinVuaTiengViet(api, message, botId, threadId) {
  isCheckWinner[botId] ??= {};
  isCheckWinner[botId][threadId] ??= null;

  if (isCheckWinner[botId][threadId]) {
    if (isCheckWinner[botId][threadId].type === "playerWin") {
      const result = {
        success: true,
        message: `🎯 Đáp án đã được giải bởi: ${isCheckWinner[botId][threadId].playerName}\nĐang phân tích từ vựng, vui lòng chờ phiên game sau...`,
      };
      await sendMessageFromSQL(api, message, result, true, TIME_TO_LIVE);
    } else if (isCheckWinner[botId][threadId].type === "adminResult") {
      const result = {
        success: true,
        message: `🎯 Admin ${isCheckWinner[botId][threadId].playerName} đã kết thúc phiên game\nĐang phân tích từ vựng, vui lòng chờ phiên game sau...`,
      };
      await sendMessageFromSQL(api, message, result, true, TIME_TO_LIVE);
    } else if (isCheckWinner[botId][threadId].type === "userResult") {
      const result = {
        success: true,
        message: `🎯 Người chơi ${isCheckWinner[botId][threadId].playerName} đã sử dụng quyền xem đáp án\nĐang phân tích kết quả, vui lòng chờ phiên game sau...`,
      };
      await sendMessageFromSQL(api, message, result, true, TIME_TO_LIVE);
    }
    return true;
  }
  return false;
}

async function endAndStartNewGame(api, message, botId, threadId, senderName, game, isAdminUser) {
  const description = await getDescriptionKeyword(game.originalWord);

  const result = {
    success: true,
    message:
      `🎯 ${
        isAdminUser
          ? `Admin ${senderName} đã sử dụng quyền giải đáp án!`
          : `Người chơi ${senderName} đã sử dụng ${game.originalWord.length * POINT_USE_MULTI} điểm để giải đáp án!`
      } \n` + `Đáp án là: "${game.originalWord}"\nChú thích: ${description}`,
  };
  await sendMessageFromSQL(api, message, result, true, TIME_TO_LIVE);

  removeGame(threadId, gameTypeVuaTiengViet, false);

  const wordData = await getWordFromAPI();
  if (wordData) {
    const scrambledWord = scrambleWord(wordData.text);
    const newGameInstance = {
      type: gameTypeVuaTiengViet,
      originalWord: wordData.text,
      scrambledWord: scrambledWord,
      guesses: 0,
      players: new Map(),
    };

    isCheckWinner[botId][threadId] = null;
    addGame(threadId, gameTypeVuaTiengViet, newGameInstance);

    const newGameMsg = {
      caption: `🎮 Game mới bắt đầu!\nHãy đoán từ sau khi được xáo trộn:\n${scrambledWord}`,
    };
    await sendMessageCompleteRequest(api, message, newGameMsg, TIME_TO_LIVE);
  }
}

export async function handleVuaTiengVietGame(api, message, groupInfo) {
  const botId = api.getBotId();
  const threadId = message.threadId;
  const threadGames = getActiveGames().get(threadId);
  if (!threadGames?.has(gameTypeVuaTiengViet)) return false;

  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const game = threadGames.get(gameTypeVuaTiengViet);
  const content = removeMention(message).trim().toLowerCase();

  if (content === "dapan") {
    if (await checkIsWinVuaTiengViet(api, message, botId, threadId)) return true;
    if (isAdmin(botId, senderId)) {
      isCheckWinner[botId][threadId] = {
        type: "adminResult",
        playerName: senderName,
      };
      await endAndStartNewGame(api, message, botId, threadId, senderName, game, true);
      return true;
    }

    const infoRankPlayer = getRankMiniGameInfo(botId, threadId, gameTypeVuaTiengViet, senderId);
    const pointRequest = game.originalWord.length * POINT_USE_MULTI;
    const currentPoint = infoRankPlayer?.Point || 0;

    if (!infoRankPlayer || currentPoint < pointRequest) {
      const result = {
        success: false,
        message: `Bạn không đủ ${currentPoint}/${pointRequest} để sử dụng quyền trợ giúp!`,
      };
      await sendMessageFromSQL(api, message, result, true, 120000);
      await api.addReaction("TIEUTAN", [message]);
      return false;
    }

    usePointMiniGame(botId, threadId, gameTypeVuaTiengViet, senderId, pointRequest);

    isCheckWinner[botId][threadId] = {
      type: "userResult",
      playerName: senderName,
    };

    await endAndStartNewGame(api, message, botId, threadId, senderName, game, false);
    return true;
  } else if (content === "check") {
    const result = {
      success: false,
      message: `🤖 Cụm từ cần giải đáp:\n🎯 ${game.scrambledWord}`,
    };
    await sendMessageFromSQL(api, message, result, false, TIME_TO_LIVE);
  }

  const cleanedContent = normalizeSymbolName(content);
  const cleanedOriginalWord = normalizeSymbolName(game.originalWord);
  const isSameLetters = areAnagrams(cleanedContent, cleanedOriginalWord);
  if (!isSameLetters) return false;

  const lastGuessTime = playerCooldowns.get(`${threadId}-${senderId}`);
  const currentTime = Date.now();
  if (lastGuessTime && currentTime - lastGuessTime < COOLDOWN_DURATION) {
    const remainingTime = Math.ceil((COOLDOWN_DURATION - (currentTime - lastGuessTime)) / 1000);
    await sendReactionWaitingCountdown(api, message, remainingTime, gameTypeVuaTiengViet);
    return false;
  }

  await api.addReaction("TIASET", [message]);
  playerCooldowns.set(`${threadId}-${senderId}`, currentTime);
  game.guesses++;
  if (!game.players.has(senderId)) {
    game.players.set(senderId, 0);
  }
  game.players.set(senderId, game.players.get(senderId) + 1);

  if (content === game.originalWord.toLowerCase()) {
    if (await checkIsWinVuaTiengViet(api, message, botId, threadId)) return true;

    isCheckWinner[botId][threadId] = {
      type: "playerWin",
      playerName: senderName,
    };

    const orgWord = game.originalWord;
    const description = await getDescriptionKeyword(orgWord);
    const result = {
      success: true,
      message:
        `🎉 Chúc mừng! Bạn đã đoán đúng từ "${orgWord}", +${orgWord.length} điểm 🎉.` + `\n Giải thích: ` + description,
    };
    await sendMessageFromSQL(api, message, result, false, TIME_TO_LIVE);
    updateRankMiniGame(botId, threadId, senderId, senderName, groupInfo.name, gameTypeVuaTiengViet, orgWord.length);
    removeGame(threadId, gameTypeVuaTiengViet, false);
    const wordData = await getWordFromAPI();
    if (wordData) {
      const scrambledWord = scrambleWord(wordData.text);
      const newGameInstance = {
        type: gameTypeVuaTiengViet,
        originalWord: wordData.text,
        scrambledWord: scrambledWord,
        guesses: 0,
        players: new Map(),
      };

      isCheckWinner[botId][threadId] = null;
      addGame(threadId, gameTypeVuaTiengViet, newGameInstance);
      const result = {
        caption: `🎮 Game mới bắt đầu!\nHãy đoán từ sau khi được xáo trộn:\n${scrambledWord}`,
      };
      await sendMessageCompleteRequest(api, message, result, TIME_TO_LIVE);
    }
  } else {
    const result = {
      success: false,
      message: `❌ Đoán sai rồi! Suy nghĩ kỹ xem\n🤖 Cụm từ cần giải đáp:\n🎯 ${game.scrambledWord}`,
    };
    await sendMessageFromSQL(api, message, result, false, TIME_TO_LIVE);
  }
  return true;
}
