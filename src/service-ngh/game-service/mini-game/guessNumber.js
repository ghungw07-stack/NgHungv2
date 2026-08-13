import { getGlobalPrefix } from "../../service.js";
import { getActiveGames, addGame, removeGame, addPlayer } from "./index.js";
import { sendMessageFromSQL } from "../../chat-zalo/chat-style/chat-style.js";
import { sendReactionWaitingCountdown } from "../../../commands/manager-command/check-countdown.js";
import { updateRankMiniGame } from "../../info-service/rank-chat.js";

const playerCooldowns = new Map();
const COOLDOWN_DURATION = 3000;
export const gameTypeDoanSo = "Đoán Số";

function calculateMaxAttempts(range) {
  return Math.floor(5 + Math.pow(range, 0.4));
}

export async function handleGuessNumberCommand(api, message, aliasCommand, startNumber) {
  const prefix = getGlobalPrefix(api.getBotId());
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const threadId = message.threadId;

  const threadGames = getActiveGames().get(threadId);

  if (startNumber) {
    if (threadGames?.has(gameTypeDoanSo)) {
      const result = {
        success: false,
        message: `Trò chơi đoán số đã được bắt đầu trong nhóm này.\nBạn có thể tham gia bằng cách chat \n"${
          prefix + aliasCommand
        } join" để tham gia trò chơi này.`,
      };
      await sendMessageFromSQL(api, message, result, false, 30000);
      return;
    } else {
      if (startNumber === "Invalid") {
        const result = {
          success: false,
          message: `Sử dụng: ${prefix + aliasCommand} start [số lớn nhất] để bắt đầu trò chơi`,
        };
        await sendMessageFromSQL(api, message, result, false, 30000);
        return;
      }

      let range = parseInt(startNumber);
      if (isNaN(range) || range < 100) {
        const result = {
          success: false,
          message: `Số lớn nhất phải là một số nguyên lớn hơn hoặc bằng 100.`,
        };
        await sendMessageFromSQL(api, message, result, true, 30000);
        return;
      }

      range = 1000;
      if (!isNaN(startNumber)) {
        range = Math.max(10, Math.min(1000000, parseInt(startNumber)));
      }

      const targetNumber = Math.floor(Math.random() * range) + 1;
      const maxAttempts = calculateMaxAttempts(range);

      const gameInstance = {
        type: gameTypeDoanSo,
        targetNumber,
        attempts: 0,
        players: new Map(),
        range,
        maxAttempts,
      };

      addGame(threadId, gameTypeDoanSo, gameInstance);
      const result = {
        success: true,
        message:
          `Trò chơi đoán số bắt đầu! Hãy đoán một số từ 1 đến ${range}. ` +
          `Bạn có tối đa ${maxAttempts} lượt đoán, các bạn khác có thể tham gia thông qua lệnh .`,
      };
      await sendMessageFromSQL(api, message, result, false, 60000);
      addPlayer(threadId, gameTypeDoanSo, senderId, senderName);
    }
  } else {
    if (threadGames?.has(gameTypeDoanSo)) {
      addPlayer(threadId, gameTypeDoanSo, senderId, senderName);
    } else {
      const result = {
        success: false,
        message: `Trò chơi đoán số chưa được bắt đầu trong nhóm này.\nBạn có thể bắt đầu trò chơi bằng cách chat \n"${
          prefix + aliasCommand
        } start [số lớn nhất]" để bắt đầu trò chơi này.`,
      };
      await sendMessageFromSQL(api, message, result, false, 30000);
      return;
    }
  }
}

export async function handleGuessNumberGame(api, message, groupInfo) {
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const threadGames = getActiveGames().get(threadId);
  if (!threadGames || !threadGames.has(gameTypeDoanSo)) return false;

  const gameInstance = threadGames.get(gameTypeDoanSo);
  if (!gameInstance) return false;

  const guessedNumber = parseInt(message.data.content);
  if (isNaN(guessedNumber) || guessedNumber < 1 || guessedNumber > gameInstance.range) {
    return false;
  }

  const lastGuessTime = playerCooldowns.get(`${threadId}-${senderId}`);
  const currentTime = Date.now();
  if (lastGuessTime && currentTime - lastGuessTime < COOLDOWN_DURATION) {
    const remainingTime = Math.ceil((COOLDOWN_DURATION - (currentTime - lastGuessTime)) / 1000);
    await sendReactionWaitingCountdown(api, message, remainingTime, gameTypeDoanSo);
    return false;
  }

  await api.addReaction("TIASET", [message]);
  gameInstance.attempts++;

  if (!gameInstance.players.has(senderId)) {
    gameInstance.players.set(senderId, 0);
  }
  gameInstance.players.set(senderId, gameInstance.players.get(senderId) + 1);

  playerCooldowns.set(`${threadId}-${senderId}`, Date.now());
  const pointSub = 0 - Math.floor(gameInstance.range / 100);

  if (guessedNumber === gameInstance.targetNumber) {
    await handleCorrectGuess(api, message, gameInstance, groupInfo);
    removeGame(threadId, gameTypeDoanSo);
  } else if (guessedNumber < gameInstance.targetNumber) {
    const result = {
      success: false,
      message: `Số bạn đoán nhỏ hơn. Hãy thử lại sau 3 giây (Trừ ${pointSub} điểm) !\n\nCác bạn khác có thể chat \n"${
        prefix + "doanso"
      } join" để tham gia\n"${prefix + "doanso"} leave" để rời khỏi trò chơi này.`,
    };
    await sendMessageFromSQL(api, message, result, false, 30000);
  } else {
    const result = {
      success: false,
      message: `Số bạn đoán lớn hơn. Hãy thử lại sau 3 giây (Trừ ${pointSub} điểm) !\n\nCác bạn khác có thể chat \n"${
        prefix + "doanso"
      } join" để tham gia\n"${prefix + "doanso"} leave" để rời khỏi trò chơi này.`,
    };
    await sendMessageFromSQL(api, message, result, false, 30000);
  }
  updateRankMiniGame(botId, threadId, senderId, senderName, groupInfo.name, gameTypeDoanSo, pointSub);
  if (gameInstance.attempts >= gameInstance.maxAttempts) {
    await handleGameOver(api, message, threadId, gameInstance);
    removeGame(threadId, gameTypeDoanSo);
  }
  return true;
}

async function handleCorrectGuess(api, message, gameInstance, groupInfo) {
  const botId = api.getBotId();
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const result = {
    success: true,
    message: `Chúc mừng! Bạn đã đoán đúng số ${gameInstance.targetNumber} sau ${
      gameInstance.attempts
    } lần thử tổng cộng và ${gameInstance.players.get(senderId)} lần thử của bạn, + ${gameInstance.range} điểm.`,
  };
  await sendMessageFromSQL(api, message, result, true, 180000);
  updateRankMiniGame(botId, threadId, senderId, senderName, groupInfo.name, gameTypeDoanSo, gameInstance.range);
  playerCooldowns.delete(`${threadId}-${senderId}`);
  removeGame(threadId, gameTypeDoanSo);
}

async function handleGameOver(api, message, threadId, gameInstance) {
  const result = {
    success: false,
    message: `Trò chơi kết thúc! Số cần đoán là ${gameInstance.targetNumber}. Đã đạt đến giới hạn ${gameInstance.maxAttempts} lượt đoán.`,
  };
  await sendMessageFromSQL(api, message, result, false, 180000);
  for (const [senderId] of gameInstance.players) {
    playerCooldowns.delete(`${threadId}-${senderId}`);
  }
  removeGame(threadId, gameTypeDoanSo);
}
