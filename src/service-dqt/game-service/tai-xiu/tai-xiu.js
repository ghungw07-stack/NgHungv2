import fs from "fs/promises";
import path from "path";
import chalk from "chalk";
import { MultiMsgStyle, MessageStyle, MessageType } from "../../../api-zalo/index.js";
import { getApiManager } from "../../../index.js";
import {
  updatePlayerBalance,
  getPlayerBalance,
  setLoserGame,
  setLoserGameByUsername,
  getUsernameByIdZalo,
  updatePlayerBalanceByUsername,
  addGameRankPoints,
} from "../../../database/player.js";
import {
  sendMessageFromSQL,
  sendMessageFromSQLImage,
  COLOR_RED,
  SIZE_18,
  sendMessageImageNotQuote,
  IS_BOLD,
} from "../../chat-zalo/chat-style/chat-style.js";
import { nameServer } from "../../../database/index.js";
import {
  createTaiXiuResultImage,
  createWaitingImage,
  clearImagePath,
  createSoiCauImage,
} from "../../../utils/canvas/index.js";
import schedule from "node-schedule";
import { normalizeSymbolName, parseGameAmount, formatCurrency, formatSeconds } from "../../../utils/format-util.js";
import { getGlobalPrefix } from "../../service.js";
import Big from "big.js";
import { checkBeforeJoinGame } from "../index.js";
import { gameState } from "../game-manager.js";

let currentSession = null;
let activeThreads = {};
let isEndingGame = false;

const DEFAULT_INTERVAL = 60; // 60 giây
const MAX_INTERVAL = 3600; // 1 giờ
const TIME_SEND_UPDATE = 10000; // 10 giây
const TTL_IMAGE = 10800000;

const WIN_PERCENT = 1000; // x1000
const NORMAL_PAYOUT_MULTIPLIER = 1.9; // Trả cả gốc, nhà cái giữ lợi thế 5%
const JACKPOT_CHANCE = 0.07;
const HOUSE_BIAS_CHANCE = 0.65;

// Thêm biến lưu lịch sử kết quả (giới hạn 15 kết quả gần nhất)
const MAX_HISTORY = 20;
let gameHistory = [];

// Thêm biến lưu trữ hũ
let jackpot = new Big(1000000); // Khởi tạo hũ với 1 triệu

// Thêm hàm lưu dữ liệu
function saveGameData() {
  gameState.changes.taixiu = true;
}

function getRandomResult() {
  const dice1 = Math.floor(Math.random() * 6) + 1;
  const dice2 = Math.floor(Math.random() * 6) + 1;
  const dice3 = Math.floor(Math.random() * 6) + 1;
  const total = dice1 + dice2 + dice3;
  return {
    dice: [dice1, dice2, dice3],
    total,
    result: total > 10 ? "tai" : "xiu",
  };
}

function getSessionResult(players) {
  const bets = Object.values(players || {});
  if (!bets.length || Math.random() >= HOUSE_BIAS_CHANCE) return getRandomResult();
  const totalTai = bets.filter((bet) => bet.betType === "tai").reduce((sum, bet) => sum.plus(bet.amount), new Big(0));
  const totalXiu = bets.filter((bet) => bet.betType === "xiu").reduce((sum, bet) => sum.plus(bet.amount), new Big(0));
  const preferred = totalTai.gt(totalXiu) ? "xiu" : totalXiu.gt(totalTai) ? "tai" : (Math.random() < 0.5 ? "tai" : "xiu");
  for (let attempt = 0; attempt < 50; attempt++) {
    const result = getRandomResult();
    if (result.result === preferred) return result;
  }
  return getRandomResult();
}

export async function initializeGameTaiXiu(api) {
  if (!gameState.data.taixiu) gameState.data.taixiu = {};
  if (!gameState.data.taixiu.activeThreads || Array.isArray(gameState.data.taixiu.activeThreads)) {
    gameState.data.taixiu.activeThreads = {};
  }
  if (!gameState.data.taixiu.history) gameState.data.taixiu.history = [];
  if (!gameState.data.taixiu.jackpot) gameState.data.taixiu.jackpot = "1000000";
  gameState.data.taixiu.jackpot = new Big(gameState.data.taixiu.jackpot);

  activeThreads = gameState.data.taixiu.activeThreads;

  // Load history và jackpot từ file
  gameHistory = gameState.data.taixiu.history || [];
  jackpot = new Big(gameState.data.taixiu.jackpot || "1000000");

  currentSession = {
    players: {},
    startTime: Date.now(),
    endTime: Date.now() + MAX_INTERVAL * 1000,
    interval: MAX_INTERVAL,
  };

  if (gameState.data.taixiu && gameState.data.taixiu.players) {
    currentSession.players = gameState.data.taixiu.players;

    if (Object.keys(currentSession.players).length > 0) {
      currentSession.interval = DEFAULT_INTERVAL;
      currentSession.endTime = Date.now() + DEFAULT_INTERVAL * 1000;
    }
  }

  api.apiInstance.schedule.gameJob = schedule.scheduleJob("* * * * * *", () => runGameLoop(api));
  console.log(chalk.magentaBright("Khởi động và nạp dữ liệu minigame tài xỉu hoàn tất"));
}

async function runGameLoop(api) {
  const botId = api.getBotId();
  if (!currentSession || isEndingGame) return;

  try {
    const currentTime = Date.now();
    const remainingTime = Math.max(0, currentSession.endTime - currentTime);
    const remainingSeconds = Math.ceil(remainingTime / 1000);

    if (remainingSeconds === 0 && !isEndingGame) {
      isEndingGame = true;
      await endGame(api);
      isEndingGame = false;
    } else if (remainingSeconds % (TIME_SEND_UPDATE / 1000) === 0 && Object.keys(currentSession.players).length > 0) {
      await sendGameUpdate(api, remainingSeconds);
    }
  } catch (error) {
    console.error("Lỗi khi update tài xỉu:", error);
  }
}

async function endGame(api) {
  const result = getSessionResult(currentSession.players);

  // Thêm kết quả vào lịch sử với timestamp
  const newResult = {
    dice: result.dice,
    total: result.total,
    result: result.result,
    timestamp: Date.now(),
  };

  gameHistory.unshift(newResult);

  if (gameHistory.length > MAX_HISTORY) {
    gameHistory = gameHistory.slice(0, MAX_HISTORY);
  }

  const nameType = result.result === "tai" ? "Tài" : "Xỉu";

  let resultText = `${nameServer}\nKết quả: ${result.dice.join(" - ")}\nTổng: ${
    result.total
  } - ${nameType.toUpperCase()}\n\n`;
  let mentions = [];
  let mentionPos = resultText.length;

  let taiTotal = 0;
  let xiuTotal = 0;
  let totalLoss = new Big(0); // Tổng tiền thua để cộng vào hũ

  const threadPlayers = {};

  let jackpotWinners = [];
  // Một lần quay cho cả phiên, không phụ thuộc số dư hay số người đặt cược.
  const jackpotTriggered = Math.random() < JACKPOT_CHANCE;
  let totalJackpotBet = new Big(0);
  let totalJackpotPaid = new Big(0); // Thêm biến này

  // Kiểm tra người chơi trúng hũ
  if (Object.keys(currentSession.players).length > 0) {
    for (const [playerId, bet] of Object.entries(currentSession.players)) {
      const isWin = bet.betType === result.result;
      const playerChoice = bet.betType === "tai" ? "Tài" : "Xỉu";
      const isJackpot = isWin && jackpotTriggered;
      const betAmount = new Big(bet.amount);
      const winAmount = isWin
        ? betAmount.mul(NORMAL_PAYOUT_MULTIPLIER - 1).round(0, Big.roundDown)
        : betAmount.neg();

      if (isWin) {
        if (isJackpot) {
          jackpotWinners.push({
            playerId,
            bet: betAmount,
            ...bet,
          });
          totalJackpotBet = totalJackpotBet.plus(betAmount);
        }
        await updatePlayerBalanceByUsername(
          bet.username,
          betAmount.mul(NORMAL_PAYOUT_MULTIPLIER).round(0, Big.roundDown).toNumber(),
          isWin,
          winAmount.toNumber()
        );
      } else {
        await setLoserGameByUsername(bet.username, betAmount.neg().toNumber());
        totalLoss = totalLoss.plus(betAmount);
        // Cộng 20% tiền thua vào hũ
        jackpot = jackpot.plus(betAmount.mul(0.6));
      }
      await addGameRankPoints(playerId, { won: isWin, jackpot: isJackpot });

      resultText += `@${bet.playerName}: [${playerChoice}] ${isWin ? "Thắng" : "Thua"} ${winAmount
        .abs()
        .toNumber()
        .toLocaleString("vi-VN")} VNĐ\n`;

      mentions.push({
        len: bet.playerName.length + 1,
        uid: playerId,
        pos: mentionPos,
      });

      mentionPos = resultText.length;

      if (bet.betType === "tai") {
        taiTotal += bet.amount;
      } else {
        xiuTotal += bet.amount;
      }

      if (!threadPlayers[bet.threadId]) {
        threadPlayers[bet.threadId] = [];
      }
      threadPlayers[bet.threadId].push(playerId);
    }

    // Xử lý chia thưởng jackpot nếu có người trúng
    if (jackpotWinners.length > 0) {
      let jackpotMessage = "\n🎉 NỔ HŨ 🎉\n";

      for (const winner of jackpotWinners) {
        let maxJackpotWin = winner.bet.mul(WIN_PERCENT);
        let jackpotShare = jackpot.div(jackpotWinners.length);

        // Giới hạn tiền thưởng không vượt quá 1000% số tiền cược
        jackpotShare = jackpotShare.gt(maxJackpotWin) ? maxJackpotWin : jackpotShare;

        // Cộng dồn tổng tiền đã trả thưởng
        totalJackpotPaid = totalJackpotPaid.plus(jackpotShare);

        await updatePlayerBalanceByUsername(winner.username, jackpotShare.toNumber(), true);

        jackpotMessage += `@${winner.playerName}: Nhận ${formatCurrency(jackpotShare)} VNĐ từ hũ\n`;
        mentions.push({
          len: winner.playerName.length + 1,
          uid: winner.playerId,
          pos: resultText.length + jackpotMessage.indexOf(`@${winner.playerName}`),
        });
      }

      // Cập nhật lại số tiền hũ còn lại
      jackpot = jackpot.minus(totalJackpotPaid);

      // Nếu hũ nhỏ hơn giá trị mặc định, reset về giá trị mặc định
      if (jackpot.lt(1000000)) {
        jackpot = new Big(1000000);
      }

      resultText += jackpotMessage;
    }
  } else {
    resultText += "Không có người chơi trong phiên này.\n";
  }

  // Thêm thông tin hũ vào kết quả
  resultText += `\nTiền hũ hiện tại: ${formatCurrency(jackpot)} VNĐ 💰`;

  gameState.data.taixiu.history = gameHistory;
  gameState.data.taixiu.jackpot = jackpot.toString();
  saveGameData();

  const style = MultiMsgStyle([MessageStyle(0, nameServer.length, COLOR_RED, SIZE_18, IS_BOLD)]);

  const resultImagePath = await createTaiXiuResultImage(
    result,
    taiTotal,
    xiuTotal,
    jackpotWinners.length > 0
      ? {
          isJackpot: true,
          jackpotAmount: totalJackpotPaid.toNumber(),
        }
      : null
  );

  for (const [key, objThread] of Object.entries(activeThreads)) {
    const apiManager = getApiManager(key);
    if (objThread && apiManager) {
      for (const threadId of objThread) {
        if (threadPlayers[threadId] && threadPlayers[threadId].length > 0) {
          const threadMentions = mentions.filter((mention) => threadPlayers[threadId].includes(mention.uid));

          await apiManager.apiZalo.sendMessage(
            {
              msg: resultText,
              mentions: threadMentions,
              style: style,
              attachments: [resultImagePath],
              isUseProphylactic: true,
              ttl: TTL_IMAGE,
            },
            threadId,
            MessageType.GroupMessage
          );
        }
      }
    }
  }

  await clearImagePath(resultImagePath);

  gameState.data.taixiu.players = {};
  saveGameData();

  currentSession = {
    players: {},
    startTime: Date.now(),
    endTime: Date.now() + MAX_INTERVAL * 1000,
    interval: MAX_INTERVAL,
  };

  if (api.apiInstance.schedule.gameJob) {
    api.apiInstance.schedule.gameJob.cancel();
  }
  api.apiInstance.schedule.gameJob = schedule.scheduleJob("* * * * * *", () => runGameLoop(api));
}

async function sendGameUpdate(api, remainingSeconds) {
  const botId = api.getBotId();
  let taiTotal = 0;
  let xiuTotal = 0;
  let playerInfo = "";
  let activeThreadsWithPlayers = new Set();

  for (const [playerId, player] of Object.entries(currentSession.players)) {
    const playerBet = new Big(player.amount);
    if (player.betType === "tai") {
      taiTotal = new Big(taiTotal).plus(playerBet).toNumber();
    } else {
      xiuTotal = new Big(xiuTotal).plus(playerBet).toNumber();
    }

    const betTypeText = player.betType === "tai" ? "Tài" : "Xỉu";
    playerInfo += `${player.playerName}: đặt ${betTypeText} ${playerBet.toNumber().toLocaleString("vi-VN")} VNĐ\n`;

    activeThreadsWithPlayers.add(player.threadId);
  }

  const result = {
    success: true,
    message:
      "[  Tài Xỉu  ]" +
      "\nThời gian còn lại: " +
      formatSeconds(remainingSeconds) +
      "\n💰 Tiền hũ: " +
      formatCurrency(jackpot) +
      " VNĐ" +
      "\n💎 Nổ hũ khi > Tài: Ra 3 số 6 - Xỉu: Ra 3 số 1" +
      "\nTổng số người chơi: " +
      Object.keys(currentSession.players).length +
      "\n\nThông tin đặt cược:\n" +
      (playerInfo === "" ? "Chưa có ai đặt cược" : playerInfo),
  };

  const waitingImagePath = await createWaitingImage(remainingSeconds, taiTotal, xiuTotal);

  // Tính toán timelive dựa trên thời gian đếm ngược
  let timelive = Math.ceil(remainingSeconds % 10) * 1000 - 1000;
  if (timelive <= 0) timelive = TIME_SEND_UPDATE;
  const atcThreadofBot = activeThreads[botId] || [];

  for (const threadId of activeThreadsWithPlayers) {
    if (atcThreadofBot.includes(threadId)) {
      try {
        await sendMessageImageNotQuote(api, result, threadId, waitingImagePath, timelive, true);
      } catch (err) {
        console.log(`[${botId}] Không gửi được tin nhắn cho nhóm: `, threadId);
      }
    }
  }

  await clearImagePath(waitingImagePath);
}

async function placeBet(api, message, threadId, senderId, betType, amount) {
  const botId = api.getBotId();
  const username = await getUsernameByIdZalo(senderId);
  if (!username) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: "Không thể khởi tạo hồ sơ game. Vui lòng thử lại.",
      },
      true,
      30000
    );
    return;
  }

  if (!currentSession) {
    const result = {
      success: false,
      message: "Trò chơi Tài Xỉu chưa bắt đầu.",
    };
    await sendMessageFromSQL(api, message, result, true, 30000);
    return;
  }

  if (currentSession.players[senderId]) {
    const result = {
      success: false,
      message: "Bạn đã đặt cược cho phiên này rồi.",
    };
    await sendMessageFromSQL(api, message, result, true, 30000);
    return;
  }

  const balanceResult = await getPlayerBalance(senderId);
  if (!balanceResult.success) {
    const result = {
      success: false,
      message: "Không thể lấy thông tin số dư. Vui lòng thử lại sau.",
    };
    await sendMessageFromSQL(api, message, result, true, 30000);
    return;
  }

  // Sử dụng hàm parseGameAmount để xử lý số tiền cược
  let betAmount;
  try {
    const parsedAmount = parseGameAmount(amount, balanceResult.balance);
    if (parsedAmount === "allin") {
      betAmount = new Big(balanceResult.balance);
    } else {
      betAmount = parsedAmount;
    }

    if (betAmount.lt(1000)) {
      const result = {
        success: false,
        message: "Số tiền cược tối thiểu là 1,000 VNĐ",
      };
      await sendMessageFromSQL(api, message, result, true, 30000);
      return;
    }
  } catch (error) {
    const result = {
      success: false,
      message: error.message,
    };
    await sendMessageFromSQL(api, message, result, true, 30000);
    return;
  }

  if (betAmount.gt(balanceResult.balance)) {
    const result = {
      success: false,
      message: `Số dư không đủ. Bạn chỉ có ${formatCurrency(new Big(balanceResult.balance))} VNĐ`,
    };
    await sendMessageFromSQL(api, message, result, true, 30000);
    return;
  }

  const playerName = message.data.dName || senderId;

  // Nhóm đã qua kiểm tra gameactive ở handleTaiXiuCommand, tự đăng ký luồng gửi
  // ảnh chờ/kết quả cho đúng tài khoản bot đang nhận cược.
  if (!Array.isArray(activeThreads[botId])) activeThreads[botId] = [];
  if (!activeThreads[botId].includes(threadId)) {
    activeThreads[botId].push(threadId);
    gameState.data.taixiu.activeThreads = activeThreads;
    saveGameData();
  }

  await updatePlayerBalanceByUsername(username, betAmount.neg());
  currentSession.players[senderId] = {
    betType,
    amount: betAmount.toNumber(),
    playerName,
    threadId,
    username,
  };

  if (!gameState.data?.taixiu?.players) gameState.data.taixiu.players = {};
  gameState.data.taixiu.players[senderId] = {
    betType,
    amount: betAmount.toNumber(),
    playerName,
    threadId,
    username,
  };
  saveGameData();
  const nameType = betType === "tai" ? "Tài" : "Xỉu";

  const result = {
    success: true,
    message: `${playerName} đã đặt cược ${betAmount.toNumber().toLocaleString("vi-VN")} VNĐ cho cửa ${nameType}.`,
  };

  await sendMessageFromSQL(api, message, result, true, 30000);

  if (Object.keys(currentSession.players).length === 1) {
    currentSession.interval = DEFAULT_INTERVAL;
    currentSession.endTime = Date.now() + DEFAULT_INTERVAL * 1000;
  }
}

// Thêm hàm xử lý lệnh soi cầu
async function handleSoiCau(api, message, threadId) {
  if (gameHistory.length === 0) {
    // Thử đọc history từ file
    if (gameState.data.taixiu.history && gameState.data.taixiu.history.length > 0) {
      gameHistory = gameState.data.taixiu.history;
    } else {
      await sendMessageFromSQL(api, message, {
        success: false,
        message: "Chưa có dữ liệu lịch sử để soi cầu.",
      });
      return;
    }
  }

  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const imagePath = await createSoiCauImage(gameHistory);
  await sendMessageImageNotQuote(
    api,
    {
      success: true,
      message: `${senderName}: Thống kê kết quả ` + gameHistory.length + ` phiên gần nhất!`,
      mentions: [{ pos: 0, uid: senderId, len: senderName.length }],
    },
    threadId,
    imagePath,
    TTL_IMAGE,
    true
  );
  await clearImagePath(imagePath);
}

export async function handleTaiXiuCommand(api, message, groupSettings) {
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return;

  const senderId = message.data.uidFrom;
  const threadId = message.threadId;

  const content = message.data.content.trim().toLowerCase();
  const commandParts = content.split(" ");
  const prefix = getGlobalPrefix(api.getBotId());

  // Thêm xử lý lệnh soi cầu
  if (commandParts[1] === "soicau") {
    await handleSoiCau(api, message, threadId);
    return;
  }

  // Không còn bật/tắt riêng Tài Xỉu; gameactive của nhóm là công tắc duy nhất.
  if (commandParts[1] === "start" || commandParts[1] === "close") {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: true,
        message: `Tài Xỉu dùng chung trạng thái ${prefix}gameactive của nhóm, không cần bật hoặc tắt riêng.`,
      },
      true,
      30000
    );
    return;
  }

  // Cập nhật regex để chấp nhận nhiều định dạng số tiền hơn
  const betRegex = new RegExp(`^${prefix}(tx|taixiu)\\s*(tài|xỉu|tai|xiu)\\s*(.+)$`, "i");
  const betMatch = normalizeSymbolName(content).match(betRegex);

  if (betMatch) {
    const betType = normalizeSymbolName(betMatch[2]);
    const amount = betMatch[3].trim();

    await placeBet(api, message, threadId, senderId, betType, amount);
  } else {
    const result = {
      success: false,
      message:
        "Lệnh không hợp lệ. Sử dụng lệnh sau để tham gia trò chơi:\n" +
        `${prefix}tx [tài/xỉu] [số tiền/all/phần trăm/đơn vị]\n` +
        `${prefix}taixiu [tài/xỉu] [số tiền/all/phần trăm/đơn vị]\n` +
        "Ví dụ:\n" +
        `${prefix}tx tài 1000000|50k|1.5m|1b\n` +
        `${prefix}taixiu xỉu 50%|all|`,
    };
    await sendMessageFromSQL(api, message, result, true, 30000);
  }
}

// Thêm hàm để lấy giá trị hiện tại
export function getJackpot() {
  return jackpot;
}

export function resetJackpot() {
  jackpot = new Big(1000000);
  gameState.data.taixiu.jackpot = jackpot.toString();
  saveGameData();
  return jackpot;
}
