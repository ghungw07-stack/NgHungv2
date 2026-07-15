import { getActiveGames, addGame, removeGame, addPlayer, removePlayer } from "../index.js";
import {
  sendMessageFromSQL,
  sendMessageCompleteRequest,
  sendMessageImageTag,
} from "../../../chat-zalo/chat-style/chat-style.js";
import { formatCurrency, removeMention } from "../../../../utils/format-util.js";
import { updateRankMiniGame } from "../../../info-service/rank-chat.js";
import { deleteFile } from "../../../../utils/util.js";
import { drawQuestionCanvas, createQuestionVoice } from "./render.js";
import { AiLaTrieuPhuGame } from "./game-class.js";

// Constants
export const gameTypeAiLaTrieuPhu = "Ai Là Triệu Phú";
export const GAME_MESSAGE_TIME_TO_LIVE = 60000; // Tin nhắn câu hỏi
export const FINAL_MESSAGE_TIME_TO_LIVE = 86400000; // Tin nhắn kết thúc
export const ANSWER_TIMEOUT = 60000; // 60 giây timeout cho mỗi câu hỏi
export const HELP_COOLDOWN = 5000; // 5 giây cooldown giữa các quyền trợ giúp

// Game state maps
export const playerCooldowns = new Map();
export const gameQueue = new Map(); // threadId -> [{playerId, playerName}, ...]
export const questionTimeouts = new Map(); // threadId -> {mainTimeout, warningTimeout}
export const processingAnswers = new Map(); // threadId -> boolean (chống bất đồng bộ)

/**
 * Thiết lập timeout cho câu hỏi
 */
export function setupQuestionTimeout(api, message, threadId, gameInstance, playerId) {
  // Xóa timeout cũ nếu có
  const existingTimeouts = questionTimeouts.get(threadId);
  if (existingTimeouts) {
    if (existingTimeouts.mainTimeout) clearTimeout(existingTimeouts.mainTimeout);
    if (existingTimeouts.warningTimeout) clearTimeout(existingTimeouts.warningTimeout);
  }

  // Thiết lập timeout chính (60 giây)
  const mainTimeoutId = setTimeout(async () => {
    await handleQuestionTimeout(api, message, threadId, gameInstance, playerId);
  }, ANSWER_TIMEOUT);

  // Thiết lập cảnh báo 10 giây cuối
  const warningTimeoutId = setTimeout(async () => {
    // Kiểm tra game còn tồn tại và đúng player không
    const currentGame = getActiveGames().get(threadId)?.get(gameTypeAiLaTrieuPhu);
    if (currentGame && currentGame.playerId === playerId && currentGame.isActive) {
      const result = {
        success: false,
        message: `⏰ ${gameInstance.playerName} - Còn 10 giây để trả lời! Nếu không trả lời sẽ bị loại khỏi game.`,
      };
      await sendMessageFromSQL(api, message, result, false, 15000);
    }
  }, ANSWER_TIMEOUT - 10000);

  // Lưu cả hai timeout
  questionTimeouts.set(threadId, {
    mainTimeout: mainTimeoutId,
    warningTimeout: warningTimeoutId,
  });
}

/**
 * Xử lý timeout câu hỏi
 */
async function handleQuestionTimeout(api, message, threadId, gameInstance, playerId) {
  const threadGames = getActiveGames().get(threadId);
  if (!threadGames?.has(gameTypeAiLaTrieuPhu)) return;

  const currentGame = threadGames.get(gameTypeAiLaTrieuPhu);
  if (!currentGame || !currentGame.isActive || currentGame.playerId !== playerId) return;

  const safeMoney = formatCurrency(currentGame.getSafeMoney());
  let resultText = `⏰ **HẾT THỜI GIAN!** ⏰\n\n`;
  resultText += `😞 ${gameInstance.playerName} đã không trả lời trong 60 giây\n`;
  resultText += `💸 Bạn về mốc an toàn: ${safeMoney} VNĐ\n`;
  resultText += `🎯 Đã chơi được ${currentGame.currentLevel} câu\n`;
  resultText += `\n📝 Đáp án đúng là: **${currentGame.currentQuestion.correctAnswer.letter}** - ${
    currentGame.currentQuestion.options[currentGame.currentQuestion.correctAnswer.letter]
  }`;

  // Cập nhật thành tích
  const points = Math.max(5, currentGame.currentLevel * 2);
  await updateRankMiniGame(
    api.getBotId(),
    threadId,
    playerId,
    gameInstance.playerName,
    "Ai Là Triệu Phú",
    gameTypeAiLaTrieuPhu,
    points
  );

  const result = {
    success: true,
    message: resultText,
  };
  await sendMessageFromSQL(api, message, result, false, FINAL_MESSAGE_TIME_TO_LIVE);
  
  endGame(api, message, threadId, currentGame);
}

/**
 * Xóa timeout câu hỏi
 */
export function clearQuestionTimeout(threadId) {
  const timeouts = questionTimeouts.get(threadId);
  if (timeouts) {
    if (timeouts.mainTimeout) clearTimeout(timeouts.mainTimeout);
    if (timeouts.warningTimeout) clearTimeout(timeouts.warningTimeout);
    questionTimeouts.delete(threadId);
  }
}

/**
 * Thiết lập trạng thái xử lý đáp án
 */
export function setProcessingAnswer(threadId, isProcessing) {
  if (isProcessing) {
    processingAnswers.set(threadId, true);
  } else {
    processingAnswers.delete(threadId);
  }
}

/**
 * Kiểm tra có đang xử lý đáp án không
 */
export function isProcessingAnswer(threadId) {
  return processingAnswers.has(threadId);
}

/**
 * Bắt đầu game Ai Là Triệu Phú
 */
export async function startAiLaTrieuPhuGame(api, message, player) {
  const threadId = message.threadId;
  const { playerId, playerName } = player;
  const botId = api.getBotId();

  // Tạo game instance mới
  const gameInstance = new AiLaTrieuPhuGame(threadId, playerId, playerName);

  addGame(threadId, gameTypeAiLaTrieuPhu, gameInstance);
  addPlayer(threadId, gameTypeAiLaTrieuPhu, playerId, playerName);

  // Bắt đầu câu hỏi đầu tiên
  await startNewQuestion(api, message, threadId, gameInstance);
}

/**
 * Bắt đầu câu hỏi mới
 */
export async function startNewQuestion(api, message, threadId, gameInstance = null) {
  // Nếu không có gameInstance, lấy từ active games
  if (!gameInstance) {
    gameInstance = getCurrentGame(threadId);
    if (!gameInstance) {
      const result = {
        success: false,
        message: "❌ Không tìm thấy game đang chạy!",
      };
      await sendMessageFromSQL(api, message, result, false, FINAL_MESSAGE_TIME_TO_LIVE);
      return;
    }
  }

  const question = await gameInstance.startNewQuestion();
  if (!question) {
    const result = {
      success: false,
      message: "❌ Không thể tải câu hỏi! Game kết thúc.",
    };
    await sendMessageFromSQL(api, message, result, false, FINAL_MESSAGE_TIME_TO_LIVE);
    endGame(api, message, threadId, gameInstance);
    return;
  }

  // Vẽ canvas câu hỏi
  const imagePath = await drawQuestionCanvas(gameInstance);

  // Tạo voice
  const voiceText = await createQuestionVoice(gameInstance);

  const money = formatCurrency(gameInstance.getMoneyForCurrentLevel());
  let messageText = `🎮 **AI LÀ TRIỆU PHÚ** 🎮\n\n`;
  messageText += `👤 Người chơi: ${gameInstance.playerName}\n`;
  messageText += `📊 Câu ${gameInstance.currentLevel}/15 - ${money} VNĐ\n\n`;

  if (imagePath) {
    const result = {
      caption: messageText,
      imagePath: imagePath,
    };
    await sendMessageImageTag(api, message, result, GAME_MESSAGE_TIME_TO_LIVE);
    // Xóa file tạm sau khi gửi
    setTimeout(() => deleteFile(imagePath), 5000);
  } else {
    const result = {
      success: true,
      message: messageText,
    };
    await sendMessageFromSQL(api, message, result, false, GAME_MESSAGE_TIME_TO_LIVE);
  }

  // Đặt timeout cho câu hỏi
  setupQuestionTimeout(api, message, threadId, gameInstance, gameInstance.playerId);
}

/**
 * Kết thúc game và dọn dẹp tài nguyên
 */
export function endGame(api, message, threadId, gameInstance, reason = null) {
  // Xóa timeout câu hỏi
  clearQuestionTimeout(threadId);

  // Xóa trạng thái xử lý
  setProcessingAnswer(threadId, false);

  // Dừng game
  gameInstance.stop();

  // Xóa game khỏi hệ thống
  removeGame(threadId, gameTypeAiLaTrieuPhu);
  removePlayer(threadId, gameTypeAiLaTrieuPhu, gameInstance.playerId);

  // Kiểm tra hàng chờ
  const queue = gameQueue.get(threadId);
  if (queue && queue.length > 0) {
    // Bắt đầu game tiếp theo trong hàng chờ
    const nextPlayer = queue.shift();
    const { message, playerId, playerName } = nextPlayer;
    gameQueue.set(threadId, queue);

    setTimeout(() => {
      startAiLaTrieuPhuGame(api, message, { playerId, playerName });
    }, 3000); // Delay 3 giây để đảm bảo message trước đã được gửi
  }
}

/**
 * Thêm người chơi vào hàng chờ
 */
export function addToQueue(message) {
  const threadId = message.threadId;
  const playerId = message.data.uidFrom;
  const playerName = message.data.dName;

  if (!gameQueue.has(threadId)) {
    gameQueue.set(threadId, []);
  }
  
  const queue = gameQueue.get(threadId);
  
  // Kiểm tra xem người chơi đã có trong hàng chờ chưa
  const existingIndex = queue.findIndex(p => p.playerId === playerId);
  if (existingIndex !== -1) {
    return false; // Đã có trong hàng chờ
  }
  
  queue.push({ message, playerId, playerName });
  gameQueue.set(threadId, queue);
  return true;
}

/**
 * Xóa người chơi khỏi hàng chờ
 */
export function removeFromQueue(threadId, playerId) {
  const queue = gameQueue.get(threadId);
  if (!queue) return false;
  
  const index = queue.findIndex(p => p.playerId === playerId);
  if (index !== -1) {
    queue.splice(index, 1);
    gameQueue.set(threadId, queue);
    return true;
  }
  
  return false;
}

/**
 * Lấy thông tin hàng chờ
 */
export function getQueueInfo(threadId) {
  const queue = gameQueue.get(threadId);
  return queue ? [...queue] : [];
}

/**
 * Kiểm tra xem có game đang chạy không
 */
export function isGameActive(threadId) {
  const threadGames = getActiveGames().get(threadId);
  return threadGames?.has(gameTypeAiLaTrieuPhu);
}

/**
 * Lấy game hiện tại
 */
export function getCurrentGame(threadId) {
  const threadGames = getActiveGames().get(threadId);
  return threadGames?.get(gameTypeAiLaTrieuPhu);
} 