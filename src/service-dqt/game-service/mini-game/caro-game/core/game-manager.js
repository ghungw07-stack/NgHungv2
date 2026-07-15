import { getActiveGames, addGame, removeGame, addPlayer } from "../../index.js";
import {
  sendMessageFromSQL,
  sendMessageCompleteRequest,
  sendMessageTag,
} from "../../../../chat-zalo/chat-style/chat-style.js";
import { deleteFile } from "../../../../../utils/util.js";
import { MessageMention } from "zlbotdqt";
import { drawCaroBoard } from "../utils/render-board.js";
import { getBotDifficulties } from "../utils/bot-difficulties.js";
import { updateRankMiniGame, usePointMiniGame } from "../../../../info-service/rank-chat.js";
import { getInitialBotMove } from "../core/board.js";
import { createStatsArgs } from "../caro.js";

/**
 * Tạo indicator cho chế độ bot đi trước
 */
function getBotFirstIndicator(gameInstance) {
  return gameInstance?.botGoesFirst ? " (Bot đi trước)" : "";
}

// Constants
export const gameTypeCaro = "Caro";
export const BOARD_SIZE = 16; // 16x16
export const WIN_CONDITION = 5; // 5 in a row
export const FINAL_MESSAGE_TIME_TO_LIVE = 86400000; // Tin nhắn thắng/thua
export const GAME_MESSAGE_TIME_TO_LIVE = 60000; // Tin nhắn bàn cờ lượt đi
export const COOLDOWN_DURATION = 1500; // Tăng cooldown để tránh spam
export const TURN_TIMEOUT = 60000; // 60 giây timeout cho mỗi lượt
export const WARNING_TIME = 10000; // Cảnh báo khi còn 10 giây

// Game state maps
export const playerCooldowns = new Map();
export const pendingChallenges = new Map(); // threadId -> {challenger, challenged, bet}
export const gameQueue = new Map(); // threadId -> [{challenger, challenged, bet}, ...]
export const turnTimeouts = new Map(); // threadId -> {mainTimeout, warningTimeout}
export const processingMoves = new Map(); // threadId -> boolean (chống bất đồng bộ)

/**
 * Thiết lập timeout cho lượt chơi
 */
export function setupTurnTimeout(api, message, threadId, gameInstance, playerId) {
  // Xóa timeout cũ nếu có
  const existingTimeouts = turnTimeouts.get(threadId);
  if (existingTimeouts) {
    if (existingTimeouts.mainTimeout) clearTimeout(existingTimeouts.mainTimeout);
    if (existingTimeouts.warningTimeout) clearTimeout(existingTimeouts.warningTimeout);
  }

  // Thiết lập timeout chính (60 giây)
  const mainTimeoutId = setTimeout(async () => {
    await handleTurnTimeout(api, message, threadId, gameInstance, playerId);
  }, TURN_TIMEOUT);

  // Thiết lập cảnh báo 10 giây cuối
  const warningTimeoutId = setTimeout(async () => {
    // Kiểm tra game còn tồn tại và đúng player không
    const currentGame = getActiveGames().get(threadId)?.get(gameTypeCaro);
    if (currentGame && currentGame.currentPlayer === playerId) {
      const playerName = currentGame.players.get(playerId).name;
      const result = {
        success: false,
        message: `⏰ ${playerName} - Còn 10 giây để đánh! Nếu không đánh sẽ bị xử thua.`,
      };
      await sendMessageFromSQL(api, message, result, false, 15000);
    }
  }, TURN_TIMEOUT - WARNING_TIME);

  // Lưu cả hai timeout
  turnTimeouts.set(threadId, {
    mainTimeout: mainTimeoutId,
    warningTimeout: warningTimeoutId,
  });
}

/**
 * Xử lý timeout lượt chơi
 */
async function handleTurnTimeout(api, message, threadId, gameInstance, playerId) {
  const threadGames = getActiveGames().get(threadId);
  if (!threadGames?.has(gameTypeCaro)) return;

  const currentGame = threadGames.get(gameTypeCaro);
  if (!currentGame || currentGame.currentPlayer !== playerId) return;

  const playerName = currentGame.players.get(playerId).name;
  const opponentId = Array.from(currentGame.players.keys()).find((id) => id !== playerId);
  const opponentName = currentGame.players.get(opponentId).name;

  const result = {
    success: true,
    message: `⏰ ${playerName} bị loại khỏi trận đấu do không đánh nước tiếp theo trong 60 giây!\n🏆 ${opponentName} chiến thắng ván cờ này!${
      !currentGame.isBot && currentGame.bet > 0 ? `\n💰 ${opponentName} nhận được ${currentGame.bet} điểm!` : ""
    }`,
  };

  await sendMessageFromSQL(api, message, result, true, FINAL_MESSAGE_TIME_TO_LIVE);

  // Cập nhật điểm số và thống kê
  const botId = api.getBotId();
  if (currentGame.isBot && playerId !== botId) {
    // Người chơi timeout với bot - trừ điểm người chơi
    const groupInfo = { name: "Group" }; // Fallback
    const points = getBotDifficulties()[currentGame.botDifficulty].losePoints;
    const senderStats = createStatsArgs(gameTypeCaro, false, true, currentGame.botDifficulty, false);
    updateRankMiniGame(botId, threadId, playerId, playerName, groupInfo.name, gameTypeCaro, points, senderStats);
  } else if (!currentGame.isBot && currentGame.bet > 0) {
    // PvP timeout
    const groupInfo = { name: "Group" }; // Fallback

    // Trừ điểm người thua timeout
    const loserStats = createStatsArgs(gameTypeCaro, false, false, null, true);
    updateRankMiniGame(
      botId,
      threadId,
      playerId,
      playerName,
      groupInfo.name,
      gameTypeCaro,
      -currentGame.bet,
      loserStats
    );

    // Cộng điểm cho người thắng
    const winnerStats = createStatsArgs(gameTypeCaro, true, false, null, true);
    updateRankMiniGame(
      botId,
      threadId,
      opponentId,
      opponentName,
      groupInfo.name,
      gameTypeCaro,
      currentGame.bet,
      winnerStats
    );
  } else if (!currentGame.isBot && currentGame.bet === 0) {
    // Solo timeout
    const groupInfo = { name: "Group" }; // Fallback

    // Trừ điểm người thua timeout
    const loserStats = createStatsArgs(gameTypeCaro, false, false, null, true);
    updateRankMiniGame(botId, threadId, playerId, playerName, groupInfo.name, gameTypeCaro, -1, loserStats);

    // Cộng điểm cho người thắng
    const winnerStats = createStatsArgs(gameTypeCaro, true, false, null, true);
    updateRankMiniGame(botId, threadId, opponentId, opponentName, groupInfo.name, gameTypeCaro, 1, winnerStats);
  }

  // Kết thúc game
  endGame(api, message, threadId, currentGame, opponentId, "timeout");
}

/**
 * Xóa timeout lượt chơi
 */
export function clearTurnTimeout(threadId) {
  const timeouts = turnTimeouts.get(threadId);
  if (timeouts) {
    if (timeouts.mainTimeout) {
      clearTimeout(timeouts.mainTimeout);
    }
    if (timeouts.warningTimeout) {
      clearTimeout(timeouts.warningTimeout);
    }
    turnTimeouts.delete(threadId);
  }
}

/**
 * Kiểm tra và đặt cờ xử lý move để tránh bất đồng bộ
 */
export function setProcessingMove(threadId, isProcessing) {
  if (isProcessing) {
    processingMoves.set(threadId, true);
  } else {
    processingMoves.delete(threadId);
  }
}

/**
 * Kiểm tra xem có đang xử lý move không
 */
export function isProcessingMove(threadId) {
  return processingMoves.has(threadId);
}

/**
 * Start a new caro game
 */
export async function startCaroGame(api, threadId, challenge) {
  const { challenger, challenged, bet, bot, difficulty, message, botGoesFirst } = challenge;
  const botId = api.getBotId();

  // Reserve points for both players if it's PvP
  if (!bot && bet > 0) {
    usePointMiniGame(botId, threadId, gameTypeCaro, challenger.id, bet);
    usePointMiniGame(botId, threadId, gameTypeCaro, challenged.id, bet);
  }

  // Determine who goes first (X)
  let firstPlayer;
  if (bot) {
    // Trường hợp chơi với bot
    if (botGoesFirst) {
      // Bot đi trước khi có flag botGoesFirst
      firstPlayer = botId;
    } else {
      // Ngẫu nhiên giữa người chơi và bot
      const randomFirst = Math.random() < 0.5;
      firstPlayer = randomFirst ? challenger.id : botId;
    }
  } else {
    // Trường hợp thách đấu giữa người với người
    // Người chấp nhận thách đấu sẽ đánh trước
    // firstPlayer = challenged.id;
    const randomFirst = Math.random() < 0.5;
    firstPlayer = randomFirst ? challenger.id : challenged.id;
  }

  // Trong trường hợp đánh với bot, cho phép bot hoặc người chơi đi trước
  const symbol1 = firstPlayer === challenger.id ? "X" : "O";
  const symbol2 = firstPlayer === challenger.id ? "O" : "X";

  const player1 = challenger;
  const player2 = bot ? { id: botId, name: "BOT" } : challenged;

  const gameBoard = Array(BOARD_SIZE)
    .fill()
    .map(() => Array(BOARD_SIZE).fill(null));

  const gameInstance = {
    type: gameTypeCaro,
    board: gameBoard,
    currentPlayer: firstPlayer,
    players: new Map([
      [player1.id, { id: player1.id, name: player1.name, symbol: symbol1 }],
      [player2.id, { id: player2.id, name: player2.name, symbol: symbol2 }],
    ]),
    moves: [],
    isBot: bot,
    botDifficulty: difficulty,
    bet: bet,
    botGoesFirst: botGoesFirst || false,
    winner: null,
    lastMoveTime: Date.now(),
  };

  addGame(threadId, gameTypeCaro, gameInstance);
  addPlayer(threadId, gameTypeCaro, player1.id, player1.name);
  addPlayer(threadId, gameTypeCaro, player2.id, player2.name);

  if (bot && gameInstance.currentPlayer === botId) {
    const moveIndex = getInitialBotMove(gameBoard);
    const row = Math.floor(moveIndex / BOARD_SIZE);
    const col = moveIndex % BOARD_SIZE;

    gameBoard[row][col] = gameInstance.players.get(botId).symbol;
    gameInstance.moves.push({ player: botId, position: moveIndex, symbol: gameInstance.players.get(botId).symbol });
    gameInstance.currentPlayer = player1.id;
    gameInstance.lastMoveTime = Date.now();

    const boardImage = await drawCaroBoard(
      gameBoard,
      player1.id,
      player1.name,
      player2.id,
      player2.name,
      gameInstance.moves,
      gameInstance.players,
      null,
      difficulty
    );

    try {
      const prefix =
        `🎮 Trận Caro bắt đầu!${getBotFirstIndicator(gameInstance)}` +
        `\n🤖 Độ khó: ${difficulty}\n💰 Điểm thưởng thắng: ${bet}\n\n🤖 Bot đánh ô số ${
          moveIndex + 1
        }\n👉 Đến Lượt Bạn`;
      const result = {
        caption: `${prefix}\n\nHãy chọn số từ 1-${BOARD_SIZE * BOARD_SIZE} để đánh quân cờ.`,
        mentions: [MessageMention(player1.id, player1.name.length, prefix.length)],
        imagePath: boardImage,
      };

      await sendMessageCompleteRequest(api, message, result, GAME_MESSAGE_TIME_TO_LIVE);
    } finally {
      deleteFile(boardImage);
    }

    // Thiết lập timeout cho lượt chơi của người chơi
    setupTurnTimeout(api, message, threadId, gameInstance, player1.id);
  } else {
    // Draw initial empty board
    const boardImage = await drawCaroBoard(
      gameBoard,
      player1.id,
      player1.name,
      player2.id,
      player2.name,
      gameInstance.moves,
      gameInstance.players,
      null,
      gameInstance.botDifficulty
    );

    try {
      const currentPlayerName = gameInstance.currentPlayer === player1.id ? player1.name : player2.name;
      const currentPlayerSymbol = gameInstance.players.get(gameInstance.currentPlayer).symbol;

      const suffix = bot ? `\n🤖 Độ khó: ${difficulty}\n💰 Điểm thưởng thắng: ${bet}` : `\n💰 Điểm cược: ${bet}`;
      const prefix = `🎮 Trận Caro bắt đầu!${getBotFirstIndicator(gameInstance)}${suffix}\n👉 Lượt của <`;
      const mentions =
        gameInstance.currentPlayer === player1.id
          ? []
          : [MessageMention(player2.id, player2.name.length, prefix.length)];
      const result = {
        caption: `${prefix}${currentPlayerName}>!\n🎮 Bạn đánh ${currentPlayerSymbol}\n\n⏱️ Thời gian: 60 giây/lượt\nChọn số từ 1-${
          BOARD_SIZE * BOARD_SIZE
        } để đánh quân cờ.`,
        mentions: mentions,
        imagePath: boardImage,
      };

      await sendMessageTag(api, message, result, GAME_MESSAGE_TIME_TO_LIVE);
    } finally {
      deleteFile(boardImage);
    }

    // Thiết lập timeout cho lượt chơi đầu tiên
    setupTurnTimeout(api, message, threadId, gameInstance, gameInstance.currentPlayer);
  }

  // Set timeout for entire game (15 minutes)
  gameInstance.timeout = setTimeout(() => {
    endGame(api, message, threadId, gameInstance, null, "game_timeout");
  }, 120 * 60 * 1000);
}

/**
 * End the game and clean up resources
 */
export function endGame(api, message, threadId, gameInstance, winnerId, reason = null) {
  // Clear the game timeout
  if (gameInstance.timeout) {
    clearTimeout(gameInstance.timeout);
  }

  // Clear turn timeout
  clearTurnTimeout(threadId);

  // Clear processing flag
  setProcessingMove(threadId, false);

  // Remove the game
  removeGame(threadId, gameTypeCaro);

  // Clean up cooldowns
  for (const playerId of gameInstance.players.keys()) {
    playerCooldowns.delete(`${threadId}-${playerId}`);
  }

  // Check if there are queued games
  const queue = gameQueue.get(threadId);
  if (queue && queue.length > 0) {
    // Start the next game in queue
    const nextGame = queue.shift();
    gameQueue.set(threadId, queue);

    setTimeout(() => {
      startCaroGame(api, threadId, nextGame);
    }, 3000); // Tăng delay để đảm bảo message trước đã được gửi
  }
}
