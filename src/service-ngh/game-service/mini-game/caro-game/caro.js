import { MessageMention } from "zlbotngh";
import schedule from "node-schedule";
import { sendMessageFromSQL, sendMessageImageTag, sendMessageTag } from "../../../chat-zalo/chat-style/chat-style.js";
import { removeMention } from "../../../../utils/format-util.js";
import { updateRankMiniGame, getRankMiniGameInfo, getRankInfoCache } from "../../../info-service/rank-chat.js";
import { sendReactionWaitingCountdown } from "../../../../commands/manager-command/check-countdown.js";

import {
  gameTypeCaro,
  BOARD_SIZE,
  GAME_MESSAGE_TIME_TO_LIVE,
  FINAL_MESSAGE_TIME_TO_LIVE,
  COOLDOWN_DURATION,
  playerCooldowns,
  pendingChallenges,
  gameQueue,
  setupTurnTimeout,
  clearTurnTimeout,
  setProcessingMove,
  isProcessingMove,
  startCaroGame,
  endGame,
} from "./core/game-manager.js";

import { getActiveGames } from "../index.js";
import { checkWinner } from "./core/board.js";
import { makeBotMoveXO } from "./utils/algorithm.js";
import {
  getAvailableDifficulties,
  getBotDifficulties,
  getBotDifficultiesInfo,
  isDifficultyValid,
} from "./utils/bot-difficulties.js";
import { drawCaroBoard } from "./utils/render-board.js";
import { renderCaroRankBoard } from "./utils/rank-renderer.js";
import { deleteFile } from "../../../../utils/util.js";
import { getGlobalPrefix } from "../../../service.js";

// Constants
const CHALLENGE_TIMEOUT = 60000; // 60 giây để chấp nhận thách đấu
const DEFAULT_BET = 0;
const reactionMapChallenge = new Map();

// Thống kê thành tích keys
const STATS_KEYS = {
  D: "D", // Dễ - Win
  T: "T", // Thường - Win
  K: "K", // Khó - Win
  TD: "TD", // Thách đấu - Win
  DL: "DL", // Dễ - Lose
  TL: "TL", // Thường - Lose
  KL: "KL", // Khó - Lose
  TDL: "TDL", // Thách đấu - Lose
  SL: "SL", // Solo - Win
  SLT: "SLT", // Solo - Lose
};

/**
 * Tạo thống kê thành tích cho người chơi
 */
export function createStatsArgs(gameType, isWin, isBot = false, botDifficulty = null, isChallenge = false) {
  const args = {};

  if (isBot) {
    if (isWin) {
      switch (botDifficulty) {
        case "dễ":
          args[STATS_KEYS.D] = 1;
          break;
        case "thường":
          args[STATS_KEYS.T] = 1;
          break;
        case "khó":
          args[STATS_KEYS.K] = 1;
          break;
        case "thách đấu":
          args[STATS_KEYS.TD] = 1;
          break;
      }
    } else {
      switch (botDifficulty) {
        case "dễ":
          args[STATS_KEYS.DL] = 1;
          break;
        case "thường":
          args[STATS_KEYS.TL] = 1;
          break;
        case "khó":
          args[STATS_KEYS.KL] = 1;
          break;
        case "thách đấu":
          args[STATS_KEYS.TDL] = 1;
          break;
      }
    }
  } else {
    // Chơi với người
    if (isChallenge) {
      if (isWin) {
        args[STATS_KEYS.SL] = 1;
      } else {
        args[STATS_KEYS.SLT] = 1;
      }
    }
  }

  return args;
}

/**
 * Hiển thị bảng xếp hạng chi tiết bằng canvas
 */
export async function showDetailedRankCaro(api, message) {
  const botId = api.getBotId();
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const rankInfo = getRankInfoCache(botId);
  const rankGame = rankInfo[gameTypeCaro]?.[threadId]?.users || [];

  if (rankGame.length === 0) {
    const result = {
      success: false,
      message: `🏆 Chưa có dữ liệu xếp hạng Caro cho nhóm này.`,
    };
    await sendMessageFromSQL(api, message, result, false, 60000);
    return;
  }

  // Tính điểm mới cho từng người chơi
  const usersWithNewPoints = rankGame.map((user) => {
    const inventory = user.inventory || {};

    // Tính điểm theo trận thắng
    const easyWins = inventory[STATS_KEYS.D] || 0;
    const normalWins = inventory[STATS_KEYS.T] || 0;
    const hardWins = inventory[STATS_KEYS.K] || 0;
    const challengeWins = inventory[STATS_KEYS.TD] || 0;

    // Tính tổng điểm: dễ(10) + thường(100) + khó(1000) + thách đấu(10000)
    const totalPoints = easyWins * 10 + normalWins * 100 + hardWins * 1000 + challengeWins * 10000;

    return {
      ...user,
      newPoints: totalPoints,
    };
  });

  // Sắp xếp theo điểm giảm dần (từ cao đến thấp)
  const sortedUsers = usersWithNewPoints.sort((a, b) => b.newPoints - a.newPoints);
  const top10Users = sortedUsers.slice(0, 10);

  let rankImagePath = null;
  try {
    // Tạo bảng xếp hạng bằng canvas
    rankImagePath = await renderCaroRankBoard(top10Users, senderId, sortedUsers);

    // Gửi hình ảnh bảng xếp hạng
    const result = {
      caption: `🏆 Bảng xếp hạng Caro - Top 10 cao thủ`,
      imagePath: rankImagePath,
    };
    await sendMessageImageTag(api, message, result, false, 600000);
  } catch (error) {
    console.error("Lỗi khi tạo bảng xếp hạng:", error);
    // Fallback về text nếu có lỗi
    let rankMessage = `🏆 Bảng xếp hạng top 10 cao thủ Caro:\n\n`;

    top10Users.forEach((user, index) => {
      const inventory = user.inventory || {};
      const stats = {
        D: (inventory[STATS_KEYS.D] || 0) + "/" + (inventory[STATS_KEYS.DL] || 0),
        T: (inventory[STATS_KEYS.T] || 0) + "/" + (inventory[STATS_KEYS.TL] || 0),
        K: (inventory[STATS_KEYS.K] || 0) + "/" + (inventory[STATS_KEYS.KL] || 0),
        TD: (inventory[STATS_KEYS.TD] || 0) + "/" + (inventory[STATS_KEYS.TDL] || 0),
      };

      rankMessage += `${index + 1}. ${user.UserName} (${user.Rank.toLocaleString()} điểm)\n`;
      rankMessage += `   (${stats.D} D| ${stats.T} T| ${stats.K} K| ${stats.TD} TD)\n\n`;
    });

    const result = {
      success: true,
      message: rankMessage,
    };
    await sendMessageFromSQL(api, message, result, true, 600000);
  } finally {
    await deleteFile(rankImagePath);
  }
}

schedule.scheduleJob("*/5 * * * * *", () => {
  const currentTime = Date.now();
  for (const [msgId, data] of reactionMapChallenge.entries()) {
    if (currentTime - data.timestamp > CHALLENGE_TIMEOUT) {
      reactionMapChallenge.delete(msgId);
    }
  }
});

/**
 * Kiểm tra xem có trận đấu đang diễn ra không
 */
function hasActiveGame(threadId) {
  const threadGames = getActiveGames().get(threadId);
  return threadGames?.has(gameTypeCaro);
}

/**
 * Lấy thông tin game đang diễn ra
 */
function getActiveGame(threadId) {
  const threadGames = getActiveGames().get(threadId);
  return threadGames?.get(gameTypeCaro);
}

/**
 * Thêm thách đấu vào hàng chờ
 */
function addToQueue(threadId, challenge) {
  let queue = gameQueue.get(threadId) || [];
  queue.push(challenge);
  gameQueue.set(threadId, queue);
}

/**
 * Kiểm tra xem người chơi có đủ điểm để cược không
 */
function hasEnoughPoints(botId, threadId, playerId, bet) {
  const playerRank = getRankMiniGameInfo(botId, threadId, gameTypeCaro, playerId);
  return (playerRank?.Point > 0 ? playerRank?.Point : 0) >= bet;
}

/**
 * Hiển thị hướng dẫn chơi game
 */
async function showGameGuide(api, message, prefix) {
  const botInfo = getBotDifficultiesInfo();
  const result = {
    success: true,
    message:
      `🎮 Chào Mừng Đến Với Trò Chơi Caro!\n\n` +
      `👉 ${prefix}caro @người_chơi <điểm_cược> : Thách đấu người chơi\n` +
      `👉 ${prefix}caro [độ khó]: Chơi với bot\n` +
      `👉 ${prefix}caro rank: Xem bảng xếp hạng\n\n` +
      `🤖 Các độ khó Bot:\n${botInfo}\n\n` +
      `💡 Luật chơi: Ai tạo được 5 quân cùng hàng/cột/chéo trước sẽ thắng.\n` +
      `💡 Thời gian: 60 giây/lượt, gõ "lose" để đầu hàng.\n` +
      `🔧 Bàn cờ 16x16, mỗi ô đánh số từ 1-256.\n` +
      `🎯 Thêm "X" hoặc "first" để bot đi trước (VD: dễ X, thách đấu X)`,
  };
  await sendMessageFromSQL(api, message, result, true, GAME_MESSAGE_TIME_TO_LIVE);
}

/**
 * Xử lý thách đấu người chơi
 */
async function handlePlayerChallenge(api, message, mentions, args, senderId, senderName, threadId, botId) {
  const prefix = getGlobalPrefix(botId);
  const challengedId = mentions[0].uid;
  const challengedName = message.data.content
    .slice(mentions[0].pos, mentions[0].pos + mentions[0].len)
    .replace("@", "");

  if (challengedId === senderId) {
    const result = {
      success: false,
      message: `🚫 Bạn không thể thách đấu chính mình!`,
    };
    await sendMessageFromSQL(api, message, result, false, 60000);
    return;
  }

  if (challengedId === botId) {
    const result = {
      success: false,
      message: `🤖 Để chơi với bot, hãy dùng lệnh: ${prefix}caro [độ khó]`,
    };
    await sendMessageFromSQL(api, message, result, false, 60000);
    return;
  }

  // Phân tích điểm cược
  let bet = DEFAULT_BET;
  let isBet = false;
  for (const arg of args) {
    const parsedBet = parseInt(arg);
    if (!isNaN(parsedBet) && parsedBet >= DEFAULT_BET) {
      bet = parsedBet;
      isBet = true;
      break;
    }
  }

  if (!isBet) {
    const result = {
      success: false,
      message: `🚫 Mức cược tối thiểu là ${DEFAULT_BET} điểm.`,
    };
    await sendMessageFromSQL(api, message, result, false, 60000);
    return;
  }

  // Kiểm tra người thách đấu có đủ điểm
  if (!hasEnoughPoints(botId, threadId, senderId, bet)) {
    const challengerRank = getRankMiniGameInfo(botId, threadId, gameTypeCaro, senderId);
    const result = {
      success: false,
      message: `🚫 Bạn không đủ điểm để cược ${bet}. Điểm hiện tại: ${challengerRank?.Point || 0}`,
    };
    await sendMessageFromSQL(api, message, result, false, 60000);
    return;
  }

  // Kiểm tra người bị thách đấu có đủ điểm
  if (!hasEnoughPoints(botId, threadId, challengedId, bet)) {
    const challengedRank = getRankMiniGameInfo(botId, threadId, gameTypeCaro, challengedId);
    const result = {
      success: false,
      message: `🚫 ${challengedName} không đủ điểm để chấp nhận cược ${bet}. Điểm hiện tại: ${
        challengedRank?.Point || 0
      }`,
    };
    await sendMessageFromSQL(api, message, result, false, 60000);
    return;
  }

  // Tạo thách đấu
  const challenge = {
    message: message,
    challenger: { id: senderId, name: senderName },
    challenged: { id: challengedId, name: challengedName },
    bet,
    timestamp: Date.now(),
  };

  pendingChallenges.set(threadId, challenge);

  const prefixCaption = `🎮 ${senderName} đã thách đấu ${challengedName} một trận Caro với ${bet} điểm!\n\n`;

  const result = {
    caption: prefixCaption + `${challengedName} hãy thả tim ❤️ tin nhắn này để chấp nhận thách đấu.`,
    mentions: [
      {
        uid: challengedId,
        pos: prefixCaption.length,
        len: challengedName.length,
      },
    ],
  };

  const messageId = await sendMessageTag(api, message, result, CHALLENGE_TIMEOUT);
  if (messageId) {
    reactionMapChallenge.set(messageId.message.msgId.toString(), {
      timestamp: Date.now(),
      challenge: challenge,
      threadId: threadId,
      senderId: senderId,
      challengedId: challengedId,
      senderName: senderName,
      message,
    });
  }
}

/**
 * Xử lý chơi với bot
 */
async function handleBotChallenge(api, message, args, senderId, senderName, threadId, botId) {
  const difficultyArg = args.join(" ").toLowerCase();
  const botDifficulties = getBotDifficulties();

  // Kiểm tra chế độ bot đi trước - sử dụng pattern linh hoạt
  let botGoesFirst = false;
  let cleanDifficulty = difficultyArg;

  // Pattern linh hoạt: bất kỳ độ khó nào + "X" hoặc "first"
  const firstPattern = /^(.+?)\s+(x|first)$/i;
  const match = difficultyArg.match(firstPattern);

  if (match) {
    botGoesFirst = true;
    cleanDifficulty = match[1].trim(); // Lấy phần độ khó trước "X" hoặc "first"
  }

  if (!isDifficultyValid(cleanDifficulty)) {
    const result = {
      success: false,
      message:
        `🎮 Các chế độ hiện tại gồm có: ${getAvailableDifficulties().join(", ")}` +
        `\n\n🎮 Vui lòng nhập độ khó bạn muốn tham gia.` +
        `\n\n💡 Thêm "X" hoặc "first" để bot đi trước (VD: dễ X, thách đấu X)`,
    };
    await sendMessageFromSQL(api, message, result, false, 60000);
    return;
  }

  const challenge = {
    message: message,
    challenger: { id: senderId, name: senderName },
    challenged: { id: botId, name: `Bot ${cleanDifficulty}` },
    bot: true,
    difficulty: cleanDifficulty,
    bet: botDifficulties[cleanDifficulty].winPoints,
    botGoesFirst: botGoesFirst,
  };

  // Nếu có game đang chạy, thêm vào queue
  if (hasActiveGame(threadId)) {
    // Kiểm tra xem có challenge nào của người này trong queue chưa
    const queue = gameQueue.get(threadId) || [];
    const existingChallenge = queue.find((item) => item?.challenger?.id === senderId);

    if (existingChallenge) {
      const result = {
        success: false,
        message: `🚫 Bạn đã có thách đấu trong hàng đợi rồi! Vui lòng đợi trận đấu hiện tại kết thúc.`,
      };
      await sendMessageFromSQL(api, message, result, false, 60000);
      return;
    }

    addToQueue(threadId, challenge);
    const firstMessage = botGoesFirst ? " (Bot đi trước)" : "";
    const result = {
      success: true,
      message: `🎮 Đã thêm vào hàng đợi! Bạn sẽ đấu với Bot (${cleanDifficulty}${firstMessage}) sau khi trò chơi hiện tại kết thúc.`,
    };
    await sendMessageFromSQL(api, message, result, true, 60000);
  } else {
    // Bắt đầu game ngay lập tức
    await startCaroGame(api, threadId, challenge);
  }
}

/**
 * Xử lý khi có game đang chạy
 */
async function handleActiveGame(api, message, mentions, args, senderId, senderName, threadId, botId) {
  const gameInstance = getActiveGame(threadId);

  // Nếu người gửi là người chơi trong game
  if (gameInstance.players.has(senderId)) {
    const result = {
      success: false,
      message: `🎮 Bạn đang trong trò chơi. Chat "lose" để đầu hàng hoặc nhập số từ 1-${
        BOARD_SIZE * BOARD_SIZE
      } để đánh.`,
    };
    await sendMessageFromSQL(api, message, result, false, GAME_MESSAGE_TIME_TO_LIVE);
    return;
  }

  // Thêm vào hàng chờ
  if (mentions && mentions.length > 0) {
    await handlePlayerChallenge(api, message, mentions, args, senderId, senderName, threadId, botId);
  } else {
    await handleBotChallenge(api, message, args, senderId, senderName, threadId, botId);
  }
}

/**
 * Handle the caro command
 */
export async function handleCaroCommand(api, message, aliasCommand, prefix) {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const threadId = message.threadId;
  const content = removeMention(message)
    .replace(prefix + aliasCommand, "")
    .trim();
  const args = content.split(/\s+/);
  const botId = api.getBotId();
  const mentions = message.data.mentions;

  // Hiển thị hướng dẫn nếu không có tham số
  if (!content) {
    await showGameGuide(api, message, prefix);
    return;
  }

  // Xử lý các lệnh đặc biệt
  if (content.toLowerCase() === "rank") {
    await showDetailedRankCaro(api, message);
    return;
  }

  // Kiểm tra xem có game đang chạy không
  if (hasActiveGame(threadId)) {
    await handleActiveGame(api, message, mentions, args, senderId, senderName, threadId, botId);
    return;
  }

  // Không có game nào đang chạy, xử lý lệnh
  if (mentions && mentions.length > 0) {
    await handlePlayerChallenge(api, message, mentions, args, senderId, senderName, threadId, botId);
  } else {
    await handleBotChallenge(api, message, args, senderId, senderName, threadId, botId);
  }
}

/**
 * Handle player's reaction to accept challenge
 */
export async function handleCaroReaction(api, reaction) {
  const msgId = reaction.data?.content?.rMsg[0]?.gMsgID?.toString() || "";
  if (!msgId) return false;
  if (!reactionMapChallenge.has(msgId)) return false;
  const relatedData = reactionMapChallenge.get(msgId);
  const senderId = reaction.data.uidFrom;
  if (senderId !== relatedData.challengedId) return false;

  const rType = reaction.data.content.rType;
  if (rType !== 5) return false;

  reactionMapChallenge.delete(msgId);
  const challenge = relatedData.challenge;

  if (hasActiveGame(relatedData.threadId)) {
    addToQueue(relatedData.threadId, challenge);
    const result = {
      success: true,
      message: `🎮 ${challenge.challenged.name} đã chấp nhận thách đấu từ ${challenge.challenger.name} và sẽ được xếp vào hàng đợi.`,
    };
    await sendMessageFromSQL(api, relatedData.message, result, true, 60000);
  } else {
    // Bắt đầu game ngay lập tức
    await startCaroGame(api, relatedData.threadId, challenge);
  }

  return false;
}

/**
 * Process a player's move với cải thiện chống bất đồng bộ
 */
export async function handleCaroGame(api, message, groupInfo) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const content = message.data.content.trim().toLowerCase();
  const botId = api.getBotId();

  // Kiểm tra xem có đang xử lý move không (chống bất đồng bộ)
  if (isProcessingMove(threadId)) {
    return false;
  }

  // Get the active game
  const gameInstance = getActiveGame(threadId);
  if (!gameInstance) return false;

  // Check if the sender is a player in the game
  if (!gameInstance.players.has(senderId)) return false;

  // Check if it's sender's turn
  if (gameInstance.currentPlayer !== senderId) {
    return false;
  }

  // Đặt cờ đang xử lý
  setProcessingMove(threadId, true);

  try {
    // Xử lý đầu hàng
    if (["lose", "surrender", "give up", "đầu hàng"].includes(content)) {
      await handleSurrender(api, message, threadId, gameInstance, senderId, groupInfo, botId);
      return true;
    }

    // Kiểm tra cooldown
    if (!checkCooldown(threadId, senderId)) {
      const lastGuessTime = playerCooldowns.get(`${threadId}-${senderId}`);
      const currentTime = Date.now();
      const remainingTime = Math.ceil((COOLDOWN_DURATION - (currentTime - lastGuessTime)) / 1000);
      await sendReactionWaitingCountdown(api, message, remainingTime, gameTypeCaro);
      return false;
    }

    // Xử lý nước đi
    const moveResult = await processMove(api, message, threadId, gameInstance, senderId, content, groupInfo, botId);
    return moveResult;
  } finally {
    // Luôn xóa cờ xử lý move
    setProcessingMove(threadId, false);
  }
}

/**
 * Kiểm tra cooldown
 */
function checkCooldown(threadId, senderId) {
  const lastGuessTime = playerCooldowns.get(`${threadId}-${senderId}`);
  const currentTime = Date.now();

  if (lastGuessTime && currentTime - lastGuessTime < COOLDOWN_DURATION) {
    return false;
  }

  playerCooldowns.set(`${threadId}-${senderId}`, currentTime);
  return true;
}

/**
 * Xử lý đầu hàng
 */
async function handleSurrender(api, message, threadId, gameInstance, senderId, groupInfo, botId) {
  clearTurnTimeout(threadId);

  const opponentId = Array.from(gameInstance.players.keys()).find((id) => id !== senderId);
  const senderName = gameInstance.players.get(senderId).name;
  const opponentName = gameInstance.players.get(opponentId).name;

  let losePoints = -gameInstance.bet;
  let winPoints = gameInstance.bet;

  if (gameInstance.isBot) {
    losePoints = getBotDifficulties()[gameInstance.botDifficulty].losePoints;
    winPoints = getBotDifficulties()[gameInstance.botDifficulty].winPoints;
  }

  const result = {
    success: true,
    message: `🏳️ ${senderName} đã đầu hàng${
      opponentId === botId
        ? ` và bị trừ ${Math.abs(losePoints)} điểm!`
        : `\n🏆 ${opponentName} thắng và nhận được ${winPoints} điểm!\n💢 ${senderName} bị trừ ${Math.abs(
            losePoints
          )} điểm!`
    }`,
  };

  await sendMessageFromSQL(api, message, result, true, FINAL_MESSAGE_TIME_TO_LIVE);

  // Cập nhật điểm và thống kê
  if (gameInstance.isBot) {
    const senderStats = createStatsArgs(gameTypeCaro, false, true, gameInstance.botDifficulty, false);
    updateRankMiniGame(botId, threadId, senderId, senderName, groupInfo.name, gameTypeCaro, losePoints, senderStats);
  } else if (gameInstance.bet > 0) {
    const senderStats = createStatsArgs(gameTypeCaro, false, false, null, true);
    const opponentStats = createStatsArgs(gameTypeCaro, true, false, null, true);
    updateRankMiniGame(botId, threadId, senderId, senderName, groupInfo.name, gameTypeCaro, losePoints, senderStats);
    updateRankMiniGame(
      botId,
      threadId,
      opponentId,
      opponentName,
      groupInfo.name,
      gameTypeCaro,
      winPoints,
      opponentStats
    );
  } else {
    // Solo không cược
    const senderStats = createStatsArgs(gameTypeCaro, false, false, null, false);
    const opponentStats = createStatsArgs(gameTypeCaro, true, false, null, false);
    updateRankMiniGame(botId, threadId, senderId, senderName, groupInfo.name, gameTypeCaro, losePoints, senderStats);
    updateRankMiniGame(
      botId,
      threadId,
      opponentId,
      opponentName,
      groupInfo.name,
      gameTypeCaro,
      winPoints,
      opponentStats
    );
  }

  endGame(api, message, threadId, gameInstance, opponentId, "surrender");
}

/**
 * Xử lý nước đi
 */
async function processMove(api, message, threadId, gameInstance, senderId, content, groupInfo, botId) {
  const trimmedContent = content.trim();

  const moveNumber = parseInt(trimmedContent);
  if (!/^\d+$/.test(trimmedContent) || isNaN(moveNumber) || moveNumber < 1 || moveNumber > BOARD_SIZE * BOARD_SIZE) {
    return false;
  }

  const moveIndex = moveNumber - 1;
  const row = Math.floor(moveIndex / BOARD_SIZE);
  const col = moveIndex % BOARD_SIZE;

  // Kiểm tra ô đã bị chiếm
  if (gameInstance.board[row][col] !== null) {
    const result = {
      success: false,
      message: `🚫 Ô này đã được đánh rồi! Vui lòng chọn ô khác.`,
    };
    await sendMessageFromSQL(api, message, result, false, GAME_MESSAGE_TIME_TO_LIVE);
    return true;
  }

  clearTurnTimeout(threadId);
  await api.addReaction("TIASET", [message]);

  // Thực hiện nước đi
  const playerSymbol = gameInstance.players.get(senderId).symbol;
  gameInstance.board[row][col] = playerSymbol;
  gameInstance.moves.push({ player: senderId, position: moveIndex, symbol: playerSymbol });
  gameInstance.lastMoveTime = Date.now();

  const opponentId = Array.from(gameInstance.players.keys()).find((id) => id !== senderId);
  const senderName = gameInstance.players.get(senderId).name;
  const opponentName = gameInstance.players.get(opponentId).name;

  // Kiểm tra thắng thua
  const winResult = checkWinner(gameInstance.board, row, col);
  const isWinner = winResult !== false;
  const isDraw = gameInstance.moves.length === BOARD_SIZE * BOARD_SIZE;

  if (isWinner) {
    await handlePlayerWin(
      api,
      message,
      threadId,
      gameInstance,
      senderId,
      senderName,
      opponentId,
      opponentName,
      moveNumber,
      winResult,
      groupInfo,
      botId
    );
  } else if (isDraw) {
    await handleDraw(
      api,
      message,
      threadId,
      gameInstance,
      senderId,
      senderName,
      opponentId,
      opponentName,
      moveNumber,
      groupInfo,
      botId
    );
  } else if (opponentId === botId) {
    await handleBotTurn(
      api,
      message,
      threadId,
      gameInstance,
      senderId,
      senderName,
      opponentId,
      opponentName,
      moveNumber,
      groupInfo,
      botId
    );
  } else {
    await handlePlayerTurn(
      api,
      message,
      threadId,
      gameInstance,
      senderId,
      senderName,
      opponentId,
      opponentName,
      moveNumber
    );
  }

  return true;
}

/**
 * Xử lý khi người chơi thắng
 */
async function handlePlayerWin(
  api,
  message,
  threadId,
  gameInstance,
  senderId,
  senderName,
  opponentId,
  opponentName,
  moveNumber,
  winResult,
  groupInfo,
  botId
) {
  gameInstance.winner = senderId;
  gameInstance.winningLine = winResult;

  let points = gameInstance.bet;
  let msg;

  if (gameInstance.isBot) {
    points = getBotDifficulties()[gameInstance.botDifficulty].winPoints;
    msg =
      `🏆 PLAYER WIN!\n\n` +
      `🎮 ${senderName} đánh ô số ${moveNumber} và giành chiến thắng!\n` +
      `✨ Bạn đã đánh bại Bot ${gameInstance.botDifficulty} một cách xuất sắc!\n` +
      `💰 PHẦN THƯỞNG: ${points} điểm`;
  } else if (gameInstance.bet > 0) {
    msg =
      `🏆 CHIẾN THẮNG VINH QUANG! 🏆\n\n` +
      `🎮 ${senderName} đánh ô số ${moveNumber} và giành chiến thắng!\n` +
      `⚔️ Đối thủ ${opponentName} đã phải chịu thất bại!\n` +
      `💰 PHẦN THƯỞNG: ${points} điểm (nhận được điểm cược của đối thủ)`;
  } else {
    msg =
      `🏆 CHIẾN THẮNG TUYỆT VỜI! 🏆\n\n` +
      `🎮 ${senderName} đánh ô số ${moveNumber} và giành chiến thắng!\n` +
      `🎭 ${opponentName} đã không thể ngăn cản chuỗi 5 quân hoàn hảo!\n\n` +
      `👏 Một màn trình diễn đầy ấn tượng! 👏`;
  }

  const boardImage = await drawCaroBoard(
    gameInstance.board,
    senderId,
    senderName,
    opponentId,
    opponentName,
    gameInstance.moves,
    gameInstance.players,
    gameInstance.winningLine,
    gameInstance.botDifficulty
  );

  try {
    const result = { caption: msg, imagePath: boardImage, typeUpload: 3 };
    await sendMessageImageTag(api, message, result, FINAL_MESSAGE_TIME_TO_LIVE);

    // Cập nhật điểm và thống kê
    if (gameInstance.isBot) {
      const senderStats = createStatsArgs(gameTypeCaro, true, true, gameInstance.botDifficulty, false);
      updateRankMiniGame(botId, threadId, senderId, senderName, groupInfo.name, gameTypeCaro, points, senderStats);
    } else if (gameInstance.bet > 0) {
      const senderStats = createStatsArgs(gameTypeCaro, true, false, null, true);
      const opponentStats = createStatsArgs(gameTypeCaro, false, false, null, true);
      updateRankMiniGame(botId, threadId, senderId, senderName, groupInfo.name, gameTypeCaro, points, senderStats);
      updateRankMiniGame(
        botId,
        threadId,
        opponentId,
        opponentName,
        groupInfo.name,
        gameTypeCaro,
        -gameInstance.bet,
        opponentStats
      );
    } else {
      // Solo không cược
      const senderStats = createStatsArgs(gameTypeCaro, true, false, null, false);
      const opponentStats = createStatsArgs(gameTypeCaro, false, false, null, false);
      updateRankMiniGame(botId, threadId, senderId, senderName, groupInfo.name, gameTypeCaro, points, senderStats);
      updateRankMiniGame(
        botId,
        threadId,
        opponentId,
        opponentName,
        groupInfo.name,
        gameTypeCaro,
        -gameInstance.bet,
        opponentStats
      );
    }

    endGame(api, message, threadId, gameInstance, senderId);
  } finally {
    deleteFile(boardImage);
  }
}

/**
 * Xử lý khi hòa
 */
async function handleDraw(
  api,
  message,
  threadId,
  gameInstance,
  senderId,
  senderName,
  opponentId,
  opponentName,
  moveNumber,
  groupInfo,
  botId
) {
  const boardImage = await drawCaroBoard(
    gameInstance.board,
    senderId,
    senderName,
    opponentId,
    opponentName,
    gameInstance.moves,
    gameInstance.players,
    null,
    gameInstance.isBot ? gameInstance.botDifficulty : null
  );

  try {
    const result = {
      caption:
        `🤝 TRẬN ĐẤU HÒA! 🤝\n\n` +
        `🎮 ${senderName} đánh ô số ${moveNumber}\n\n` +
        `⭐ Một trận đấu cân tài cân sức!\n` +
        `Tất cả các ô đã được lấp đầy mà không có người chiến thắng\n` +
        `✨ Xin chúc mừng cả hai đã chơi rất xuất sắc!`,
      imagePath: boardImage,
      typeUpload: 3,
    };

    await sendMessageImageTag(api, message, result, FINAL_MESSAGE_TIME_TO_LIVE);

    // Trả lại điểm cược nếu PvP (không cập nhật thống kê khi hòa)
    if (!gameInstance.isBot && gameInstance.bet > 0) {
      updateRankMiniGame(botId, threadId, senderId, senderName, groupInfo.name, gameTypeCaro, gameInstance.bet);
      updateRankMiniGame(botId, threadId, opponentId, opponentName, groupInfo.name, gameTypeCaro, gameInstance.bet);
    }

    endGame(api, message, threadId, gameInstance, null, "draw");
  } finally {
    deleteFile(boardImage);
  }
}

/**
 * Xử lý lượt của bot
 */
async function handleBotTurn(
  api,
  message,
  threadId,
  gameInstance,
  senderId,
  senderName,
  opponentId,
  opponentName,
  moveNumber,
  groupInfo,
  botId
) {
  gameInstance.currentPlayer = opponentId;

  const botMove = await makeBotMoveXO(api, message, threadId, gameInstance);

  if (!botMove || botMove.moveIndex === null) {
    console.error("Error - Bot could not make a valid move");
    const result = {
      success: false,
      message: "🚫 Lỗi: Bot không thể thực hiện nước đi. Trò chơi kết thúc.",
    };
    await sendMessageFromSQL(api, message, result, false, 60000);
    endGame(api, message, threadId, gameInstance, senderId, "bot_error");
    return;
  }

  const botRow = Math.floor(botMove.moveIndex / BOARD_SIZE);
  const botCol = botMove.moveIndex % BOARD_SIZE;
  const botWinResult = checkWinner(gameInstance.board, botRow, botCol);
  const botWins = botWinResult !== false;
  const isDrawAfterBot = gameInstance.moves.length === BOARD_SIZE * BOARD_SIZE;

  const boardImage = await drawCaroBoard(
    gameInstance.board,
    senderId,
    senderName,
    opponentId,
    opponentName,
    gameInstance.moves,
    gameInstance.players,
    botWins ? botWinResult : null,
    gameInstance.botDifficulty
  );

  try {
    if (botWins) {
      await handleBotWin(
        api,
        message,
        threadId,
        gameInstance,
        senderId,
        senderName,
        moveNumber,
        botMove,
        botWinResult,
        boardImage,
        groupInfo,
        botId
      );
    } else if (isDrawAfterBot) {
      await handleBotDraw(api, message, threadId, gameInstance, senderId, senderName, moveNumber, botMove, boardImage);
    } else {
      await handleBotContinue(
        api,
        message,
        threadId,
        gameInstance,
        senderId,
        senderName,
        moveNumber,
        botMove,
        boardImage
      );
    }
  } finally {
    deleteFile(boardImage);
  }
}

/**
 * Xử lý khi bot thắng
 */
async function handleBotWin(
  api,
  message,
  threadId,
  gameInstance,
  senderId,
  senderName,
  moveNumber,
  botMove,
  botWinResult,
  boardImage,
  groupInfo,
  botId
) {
  gameInstance.winner = botId;
  gameInstance.winningLine = botWinResult;
  const points = getBotDifficulties()[gameInstance.botDifficulty].losePoints;

  const result = {
    caption:
      `🤖 BOT WIN!\n\n` +
      `🎮 ${senderName} đánh ô số ${moveNumber}\n` +
      `🔄 Bot ${gameInstance.botDifficulty} đánh ô số ${botMove.moveNumber}\n\n` +
      `⚡ Bot đã tạo thành chuỗi 5 quân liên tiếp và chiến thắng!\n` +
      `💢 Bạn đã bị trừ ${Math.abs(points)} điểm!\n\n` +
      `🎯 Hãy rút kinh nghiệm và thử lại lần sau!`,
    imagePath: boardImage,
  };

  await sendMessageImageTag(api, message, result, FINAL_MESSAGE_TIME_TO_LIVE);
  const senderStats = createStatsArgs(gameTypeCaro, false, true, gameInstance.botDifficulty, false);
  updateRankMiniGame(botId, threadId, senderId, senderName, groupInfo.name, gameTypeCaro, points, senderStats);
  endGame(api, message, threadId, gameInstance, botId);
}

/**
 * Xử lý khi bot hòa
 */
async function handleBotDraw(
  api,
  message,
  threadId,
  gameInstance,
  senderId,
  senderName,
  moveNumber,
  botMove,
  boardImage
) {
  const result = {
    caption:
      `🤝 TRẬN ĐẤU HÒA! 🤝\n\n` +
      `🎮 ${senderName} đánh ô số ${moveNumber}\n` +
      `🔄 Bot ${gameInstance.botDifficulty} đánh ô số ${botMove.moveNumber}\n\n` +
      `⭐ Một trận đấu cân tài cân sức với Bot!\n` +
      `🔄 Tất cả các ô đã được lấp đầy mà không có người chiến thắng\n` +
      `✨ Bạn đã chơi rất xuất sắc để hòa với Bot!`,
    imagePath: boardImage,
  };

  await sendMessageImageTag(api, message, result, FINAL_MESSAGE_TIME_TO_LIVE);
  endGame(api, message, threadId, gameInstance, null, "draw");
}

/**
 * Xử lý khi game tiếp tục sau lượt bot
 */
async function handleBotContinue(
  api,
  message,
  threadId,
  gameInstance,
  senderId,
  senderName,
  moveNumber,
  botMove,
  boardImage
) {
  gameInstance.currentPlayer = senderId;

  const prefix = `🎮 ${senderName} đánh ô số ${moveNumber}\n🤖 Bot đánh ô số ${botMove.moveNumber}\n\n👉 Lượt của <`;
  const result = {
    caption: `${prefix}${senderName}>!\n⏱️ Thời gian: 60 giây\nChọn số từ 1-${
      BOARD_SIZE * BOARD_SIZE
    } để đánh quân cờ.`,
    mentions: [MessageMention(senderId, senderName.length, prefix.length)],
    imagePath: boardImage,
  };

  await sendMessageImageTag(api, message, result, GAME_MESSAGE_TIME_TO_LIVE);
  setupTurnTimeout(api, message, threadId, gameInstance, senderId);
}

/**
 * Xử lý lượt của người chơi (PvP)
 */
async function handlePlayerTurn(
  api,
  message,
  threadId,
  gameInstance,
  senderId,
  senderName,
  opponentId,
  opponentName,
  moveNumber
) {
  gameInstance.currentPlayer = opponentId;

  const boardImage = await drawCaroBoard(
    gameInstance.board,
    senderId,
    senderName,
    opponentId,
    opponentName,
    gameInstance.moves,
    gameInstance.players,
    null,
    null
  );

  try {
    const prefix = `🎮 ${senderName} đánh ô số ${moveNumber}\n\n👉 Lượt của <`;
    const result = {
      caption: `${prefix}${opponentName}>!\n⏱️ Thời gian: 60 giây\nChọn số từ 1-${
        BOARD_SIZE * BOARD_SIZE
      } để đánh quân cờ.`,
      mentions: [MessageMention(opponentId, opponentName.length, prefix.length)],
      imagePath: boardImage,
    };

    await sendMessageImageTag(api, message, result, GAME_MESSAGE_TIME_TO_LIVE);
    setupTurnTimeout(api, message, threadId, gameInstance, opponentId);
  } finally {
    deleteFile(boardImage);
  }
}
