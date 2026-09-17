import { buildGamePlayerMessage, gameMentionPlayer, getGameMentionUid } from "../../../utils/game-mentions.js";
import chalk from "chalk";
import schedule from "node-schedule";
import Big from "big.js";
import { MessageType, MultiMsgStyle, MessageStyle } from "../../../api-zalo/index.js";
import { getApiManager, isAdmin } from "../../../index.js";
import {
  getPlayerBalance,
  updatePlayerBalanceByUsername,
  setLoserGameByUsername,
  getUsernameByIdZalo,
  addGameRankPoints,
} from "../../../database/player.js";
import {
  sendMessageFromSQL,
  sendMessageImageNotQuote,
  getNameServer,
  COLOR_RED,
  SIZE_18,
  IS_BOLD,
} from "../../chat-zalo/chat-style/chat-style.js";
import { parseGameAmount, formatCurrency, formatSeconds } from "../../../utils/format-util.js";
import { getGlobalPrefix } from "../../service.js";
import { checkBeforeJoinGame } from "../index.js";
import { gameState } from "../game-manager.js";
import { createXoSo45sResultImage } from "./canvas-xoso.js";
import { clearImagePath } from "../../../utils/canvas/index.js";

const SESSION_DURATION = 45; // 45 giây xổ 1 lần
const MAX_HISTORY = 20;
const TTL_IMAGE = 10800000; // 3 tiếng

// Tỉ lệ trả thưởng
// Đề: 1 ăn 70 (theo yêu cầu của người dùng)
const RATIO_DE = 70;
// 3 Càng: 1 ăn 400
const RATIO_3CANG = 400;
// Lô: 1 điểm = 23.000 VNĐ, trúng 1 nháy ăn 80.000 VNĐ (~ 3.478 lần / nháy)
const PRICE_PER_DIEM_LO = 23000;
const WIN_PER_DIEM_LO = 80000;
// Lô xiên 2: 1 ăn 10
const RATIO_XIEN2 = 10;
// Chẵn / Lẻ / Tài / Xỉu Đề: 1 ăn 1.95
const RATIO_CHAN_LE = 1.95;

let activeThreads = {};
let isEndingGame = false;
let forcedResult = null;
let gameHistory = [];
let gameScheduleJob = null;

let currentSession = {
  sessionCode: 1,
  players: {}, // [senderId]: { playerName, mentionUid, threadId, botId, username, bets: [] }
  startTime: null,
  endTime: null,
  isRunning: false,
  notified15s: false,
};

function saveGameData() {
  gameState.changes.xoso45s = true;
}

/**
 * Sinh ngẫu nhiên kết quả 27 giải Xổ Số Miền Bắc chuẩn
 */
function generateRandomXSMB() {
  if (forcedResult) {
    const res = forcedResult;
    forcedResult = null;
    return res;
  }

  const randDigits = (len) => {
    let s = "";
    for (let i = 0; i < len; i++) {
      s += Math.floor(Math.random() * 10).toString();
    }
    return s;
  };

  const db = randDigits(5);
  const g1 = randDigits(5);
  const g2 = [randDigits(5), randDigits(5)];
  const g3 = [randDigits(5), randDigits(5), randDigits(5), randDigits(5), randDigits(5), randDigits(5)];
  const g4 = [randDigits(4), randDigits(4), randDigits(4), randDigits(4)];
  const g5 = [randDigits(4), randDigits(4), randDigits(4), randDigits(4), randDigits(4), randDigits(4)];
  const g6 = [randDigits(3), randDigits(3), randDigits(3)];
  const g7 = [randDigits(2), randDigits(2), randDigits(2), randDigits(2)];

  const allPrizes = [db, g1, ...g2, ...g3, ...g4, ...g5, ...g6, ...g7];
  const lo27 = allPrizes.map((p) => p.slice(-2));
  const de = db.slice(-2);
  const baCang = db.slice(-3);

  const loCounts = {};
  for (const l of lo27) {
    loCounts[l] = (loCounts[l] || 0) + 1;
  }

  return {
    db,
    g1,
    g2,
    g3,
    g4,
    g5,
    g6,
    g7,
    allPrizes,
    lo27,
    loCounts,
    de,
    baCang,
  };
}

/**
 * Bảng thống kê đầu lô tô từ 0 đến 9 chuẩn XSMB
 */
function formatLotoDau(lo27) {
  const dauMap = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [] };
  const counts = {};
  for (const num of lo27) {
    counts[num] = (counts[num] || 0) + 1;
  }
  const uniqueNums = Array.from(new Set(lo27)).sort();
  for (const num of uniqueNums) {
    const d = parseInt(num[0], 10);
    const c = counts[num];
    const display = c > 1 ? `${num}(${c}n)` : num;
    dauMap[d].push(display);
  }

  let lines = [];
  for (let i = 0; i <= 9; i++) {
    const arr = dauMap[i];
    const str = arr.length > 0 ? arr.join(" ") : "(câm)";
    lines.push(`• Đầu ${i}: ${str}`);
  }
  return lines.join("\n");
}

/**
 * Bảng kết quả Xổ Số Miền Bắc đầy đủ 27 giải dạng text giống thật
 */
function formatXSMBTableText(xsmbResult, sessionCode, serverName) {
  let t = `${serverName}\n`;
  t += `🎰 KẾT QUẢ XỔ SỐ MIỀN BẮC 45S • KỲ #${sessionCode} 🎰\n`;
  t += `━━━━━━━━━━━━━━━━━━━━━\n`;
  t += `🔴 ĐẶC BIỆT:  ${xsmbResult.db}\n`;
  t += `🥇 Giải Nhất: ${xsmbResult.g1}\n`;
  t += `🥈 Giải Nhì:  ${xsmbResult.g2.join(" - ")}\n`;
  t += `🥉 Giải Ba:   ${xsmbResult.g3.slice(0, 3).join(" - ")}\n`;
  t += `              ${xsmbResult.g3.slice(3, 6).join(" - ")}\n`;
  t += `4️⃣ Giải Tư:   ${xsmbResult.g4.join(" - ")}\n`;
  t += `5️⃣ Giải Năm:  ${xsmbResult.g5.slice(0, 3).join(" - ")}\n`;
  t += `              ${xsmbResult.g5.slice(3, 6).join(" - ")}\n`;
  t += `6️⃣ Giải Sáu:  ${xsmbResult.g6.join(" - ")}\n`;
  t += `7️⃣ Giải Bảy:  ${xsmbResult.g7.join(" - ")}\n`;
  t += `━━━━━━━━━━━━━━━━━━━━━\n`;
  t += `🎯 ĐỀ (2 số cuối ĐB): [ ${xsmbResult.de} ] (Tỉ lệ 1 ăn 70)\n`;
  t += `⭐ 3 CÀNG:            [ ${xsmbResult.baCang} ] (Tỉ lệ 1 ăn 400)\n`;
  t += `━━━━━━━━━━━━━━━━━━━━━\n`;
  t += `📊 BẢNG LÔ TÔ ĐẦU (0-9):\n`;
  t += formatLotoDau(xsmbResult.lo27) + `\n`;
  t += `━━━━━━━━━━━━━━━━━━━━━\n`;
  return t;
}

/**
 * Tính thưởng cho từng vé cược
 */
function calculateBetReward(bet, xsmbResult) {
  const { type, number, amount, diem } = bet;
  const { de, baCang, loCounts } = xsmbResult;

  let isWin = false;
  let winAmount = new Big(0);
  let detail = "";

  if (type === "de") {
    // Đề đuôi giải Đặc Biệt: 1 ăn 70
    if (number === de) {
      isWin = true;
      winAmount = new Big(amount).mul(RATIO_DE);
      detail = `Trúng Đề [${number}] x70`;
    } else {
      detail = `Trượt Đề [${number}] (về ${de})`;
    }
  } else if (type === "lo") {
    // Lô 27 giải: tính theo số nháy
    const nhay = loCounts[number] || 0;
    if (nhay > 0) {
      isWin = true;
      if (diem && diem > 0) {
        winAmount = new Big(diem).mul(WIN_PER_DIEM_LO).mul(nhay);
      } else {
        winAmount = new Big(amount).div(PRICE_PER_DIEM_LO).mul(WIN_PER_DIEM_LO).mul(nhay).round(0, Big.roundDown);
      }
      detail = `Trúng Lô [${number}] (${nhay} nháy)`;
    } else {
      detail = `Trượt Lô [${number}]`;
    }
  } else if (type === "3cang") {
    // 3 Càng: 1 ăn 400
    if (number === baCang) {
      isWin = true;
      winAmount = new Big(amount).mul(RATIO_3CANG);
      detail = `Trúng 3 Càng [${number}] x400`;
    } else {
      detail = `Trượt 3 Càng (về ${baCang})`;
    }
  } else if (type === "xien2") {
    // Lô xiên 2: cả 2 con cùng có trong 27 giải
    const [num1, num2] = number.split(",");
    const has1 = (loCounts[num1] || 0) > 0;
    const has2 = (loCounts[num2] || 0) > 0;
    if (has1 && has2) {
      isWin = true;
      winAmount = new Big(amount).mul(RATIO_XIEN2);
      detail = `Trúng Xiên 2 [${num1}-${num2}] x10`;
    } else {
      detail = `Trượt Xiên 2 [${num1}-${num2}]`;
    }
  } else if (type === "chan") {
    const deNum = parseInt(de, 10);
    if (deNum % 2 === 0) {
      isWin = true;
      winAmount = new Big(amount).mul(RATIO_CHAN_LE).round(0, Big.roundDown);
      detail = `Trúng Đề Chẵn (về ${de})`;
    } else {
      detail = `Trượt Đề Chẵn (về ${de})`;
    }
  } else if (type === "le") {
    const deNum = parseInt(de, 10);
    if (deNum % 2 !== 0) {
      isWin = true;
      winAmount = new Big(amount).mul(RATIO_CHAN_LE).round(0, Big.roundDown);
      detail = `Trúng Đề Lẻ (về ${de})`;
    } else {
      detail = `Trượt Đề Lẻ (về ${de})`;
    }
  } else if (type === "tai") {
    const deNum = parseInt(de, 10);
    if (deNum >= 50) {
      isWin = true;
      winAmount = new Big(amount).mul(RATIO_CHAN_LE).round(0, Big.roundDown);
      detail = `Trúng Đề Tài (về ${de})`;
    } else {
      detail = `Trượt Đề Tài (về ${de})`;
    }
  } else if (type === "xiu") {
    const deNum = parseInt(de, 10);
    if (deNum < 50) {
      isWin = true;
      winAmount = new Big(amount).mul(RATIO_CHAN_LE).round(0, Big.roundDown);
      detail = `Trúng Đề Xỉu (về ${de})`;
    } else {
      detail = `Trượt Đề Xỉu (về ${de})`;
    }
  }

  return {
    isWin,
    winAmount,
    detail,
  };
}

/**
 * Kết thúc phiên xổ số 45s: Quay số, trả thưởng, gửi kết quả chuẩn xác tới đúng bot của nhóm
 */
async function endSession(fallbackApi) {
  if (isEndingGame) return;
  isEndingGame = true;

  try {
    const sessionCode = currentSession.sessionCode;
    const xsmbResult = generateRandomXSMB();
    const timeStr = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

    // Lưu vào lịch sử
    const historyItem = {
      sessionCode,
      db: xsmbResult.db,
      de: xsmbResult.de,
      baCang: xsmbResult.baCang,
      timestamp: Date.now(),
      timeStr,
    };
    gameHistory.unshift(historyItem);
    if (gameHistory.length > MAX_HISTORY) {
      gameHistory = gameHistory.slice(0, MAX_HISTORY);
    }
    if (gameState.data.xoso45s) {
      gameState.data.xoso45s.history = gameHistory;
      saveGameData();
    }

    // Vẽ ảnh Canvas kết quả XSMB 45s
    let resultImagePath = null;
    try {
      resultImagePath = await createXoSo45sResultImage(xsmbResult, sessionCode, timeStr);
    } catch (e) {
      console.error("[XSMB 45S] Lỗi vẽ ảnh canvas:", e);
    }

    // Gom người chơi theo nhóm để gửi kết quả
    const threadPlayers = {};
    for (const [playerId, player] of Object.entries(currentSession.players)) {
      const threadId = player.threadId;
      if (!threadPlayers[threadId]) threadPlayers[threadId] = [];
      threadPlayers[threadId].push(player);

      let playerTotalWin = new Big(0);
      let playerTotalBet = new Big(0);
      const betDetails = [];

      for (const bet of player.bets) {
        playerTotalBet = playerTotalBet.plus(bet.amount);
        const res = calculateBetReward(bet, xsmbResult);

        if (res.isWin) {
          playerTotalWin = playerTotalWin.plus(res.winAmount);
          betDetails.push(`✅ ${res.detail}: +${formatCurrency(res.winAmount)}đ`);
        } else {
          betDetails.push(`❌ ${res.detail}: -${formatCurrency(bet.amount)}đ`);
        }
      }

      player.betDetails = betDetails;
      player.totalWin = playerTotalWin;
      player.totalBet = playerTotalBet;

      // Cập nhật số dư database
      if (playerTotalWin.gt(0)) {
        try {
          await updatePlayerBalanceByUsername(
            player.username,
            playerTotalWin.toNumber(),
            true,
            playerTotalWin.toNumber(),
            {
              gameName: "Xổ Số 45S",
              gameKey: "xoso45s",
              choice: `Kỳ #${sessionCode}`,
              betAmount: playerTotalBet.toNumber(),
              detail: betDetails.join(" | "),
            }
          );
        } catch (err) {
          console.error("[XSMB 45S] Lỗi update balance thắng:", err);
        }
      } else {
        try {
          await setLoserGameByUsername(player.username, -playerTotalBet.toNumber(), {
            gameName: "Xổ Số 45S",
            gameKey: "xoso45s",
            choice: `Kỳ #${sessionCode}`,
            betAmount: playerTotalBet.toNumber(),
            detail: betDetails.join(" | "),
          });
        } catch (err) {
          console.error("[XSMB 45S] Lỗi update balance thua:", err);
        }
      }

      await addGameRankPoints(playerId, {
        won: playerTotalWin.gt(0),
        jackpot: player.bets.some((b) => b.type === "de" && b.number === xsmbResult.de),
      });
    }

    // Gửi kết quả đến các nhóm có người chơi cược
    for (const [threadId, players] of Object.entries(threadPlayers)) {
      // Xác định đúng bot của nhóm này để gửi tin nhắn
      const targetBotId = players[0]?.botId;
      const targetApiManager = getApiManager(targetBotId);
      const botApi = targetApiManager?.apiZalo || fallbackApi;
      const serverName = getNameServer(botApi);

      let msgText = formatXSMBTableText(xsmbResult, sessionCode, serverName);
      msgText += `🏆 KẾT QUẢ ĐẶT CƯỢC:\n`;

      const playerMentions = [];
      let mentionPos = msgText.length;

      for (const p of players) {
        const netWin = p.totalWin.minus(p.totalBet);
        const statusText = netWin.gt(0)
          ? `🎉 Thắng +${formatCurrency(netWin)} VNĐ`
          : netWin.eq(0)
          ? `⚖️ Hòa vốn`
          : `😢 Thua -${formatCurrency(p.totalBet)} VNĐ`;

        const namePart = `@${p.playerName}: ${statusText}\n`;
        playerMentions.push({
          uid: p.mentionUid || p.playerId,
          pos: mentionPos,
          len: p.playerName.length + 1,
        });
        msgText += namePart;
        mentionPos = msgText.length;

        for (const d of p.betDetails) {
          msgText += `  • ${d}\n`;
        }
        mentionPos = msgText.length;
      }

      msgText += `━━━━━━━━━━━━━━━━━━━━━\n`;
      msgText += `⏱ Phiên tiếp theo sẽ đếm ngược 45s ngay khi có cược mới!`;

      let sentSuccess = false;

      // Thử gửi kèm ảnh kết quả
      if (resultImagePath) {
        try {
          await sendMessageImageNotQuote(
            botApi,
            {
              message: msgText,
              mentions: playerMentions,
            },
            threadId,
            resultImagePath,
            TTL_IMAGE,
            true
          );
          sentSuccess = true;
        } catch (sendErr) {
          console.error(`[XSMB 45S] Lỗi gửi ảnh nhóm ${threadId}, tự động chuyển sang gửi text:`, sendErr.message || sendErr);
        }
      }

      // Fallback: Nếu không gửi được ảnh, gửi ngay tin nhắn text đầy đủ
      if (!sentSuccess) {
        try {
          await botApi.sendMessage(
            {
              msg: msgText,
              mentions: playerMentions,
            },
            threadId,
            MessageType.GroupMessage
          );
          sentSuccess = true;
        } catch (textErr) {
          console.error(`[XSMB 45S] Lỗi gửi text nhóm ${threadId}:`, textErr.message || textErr);
        }
      }
    }

    if (resultImagePath) {
      await clearImagePath(resultImagePath);
    }
  } catch (err) {
    console.error("[XSMB 45S] Lỗi khi kết thúc phiên xổ số 45s:", err);
  } finally {
    // Reset phiên mới
    currentSession = {
      sessionCode: (Number(currentSession.sessionCode) || 0) + 1,
      players: {},
      startTime: null,
      endTime: null,
      isRunning: false,
      notified15s: false,
    };
    isEndingGame = false;
  }
}

/**
 * Vòng lặp đếm ngược mỗi giây của xổ số nhanh 45s
 */
async function runGameLoop(api) {
  if (!currentSession.isRunning || isEndingGame) return;

  const now = Date.now();
  const remainingTime = Math.max(0, currentSession.endTime - now);
  const remainingSeconds = Math.ceil(remainingTime / 1000);

  // Nhắc nhở khi còn 15 giây
  if (remainingSeconds === 15 && !currentSession.notified15s) {
    currentSession.notified15s = true;
    const threadBotMap = {};
    for (const p of Object.values(currentSession.players)) {
      if (p.threadId) {
        threadBotMap[p.threadId] = p.botId;
      }
    }

    for (const [threadId, botId] of Object.entries(threadBotMap)) {
      const targetApi = getApiManager(botId)?.apiZalo || api;
      const prefix = getGlobalPrefix(botId);
      try {
        await targetApi.sendMessage(
          {
            msg: `⏳ [XSMB 45S] Kỳ #${currentSession.sessionCode} còn 15 GIÂY cuối cùng để khóa cược!\nCú pháp: ${prefix}xsn de <số> <tiền> (1 ăn 70) | ${prefix}xsn lo <số> <điểm/tiền>`,
          },
          threadId,
          MessageType.GroupMessage
        );
      } catch (e) {}
    }
  }

  // Khi hết thời gian: Xổ số!
  if (remainingSeconds <= 0 && !isEndingGame) {
    await endSession(api);
  }
}

/**
 * Xử lý đặt cược từ người chơi
 */
async function placeBet(api, message, threadId, senderId, betList, groupSettings) {
  const botId = api.getBotId();
  const username = await getUsernameByIdZalo(senderId);

  if (!username) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: "Không thể lấy hồ sơ game của bạn. Vui lòng thử lại sau.",
      },
      true,
      30000
    );
    return;
  }

  // Lấy số dư
  const balanceRes = await getPlayerBalance(senderId);
  if (!balanceRes.success) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: "Không thể lấy thông tin số dư tài khoản.",
      },
      true,
      30000
    );
    return;
  }

  const currentBalance = new Big(balanceRes.balance);

  // Tính tổng tiền các vé cược
  let totalBetAmount = new Big(0);
  const validBets = [];

  for (const item of betList) {
    let betAmount;
    try {
      const parsed = parseGameAmount(item.amountStr, currentBalance.minus(totalBetAmount));
      if (parsed === "allin") {
        betAmount = currentBalance.minus(totalBetAmount);
      } else {
        betAmount = new Big(parsed);
      }
    } catch (e) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Số tiền cược không hợp lệ (${item.amountStr}): ${e.message}`,
        },
        true,
        30000
      );
      return;
    }

    if (item.type === "lo" && item.diem) {
      betAmount = new Big(item.diem).mul(PRICE_PER_DIEM_LO);
    }

    if (betAmount.lt(1000)) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: "Số tiền cược tối thiểu cho mỗi vé là 1,000 VNĐ (hoặc 1 điểm lô = 23,000 VNĐ).",
        },
        true,
        30000
      );
      return;
    }

    totalBetAmount = totalBetAmount.plus(betAmount);
    validBets.push({
      ...item,
      amount: betAmount.toNumber(),
    });
  }

  if (totalBetAmount.gt(currentBalance)) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Số dư không đủ! Tổng tiền cược là ${formatCurrency(totalBetAmount)} VNĐ nhưng bạn chỉ có ${formatCurrency(currentBalance)} VNĐ.`,
      },
      true,
      30000
    );
    return;
  }

  // Trừ tiền cược ngay
  await updatePlayerBalanceByUsername(username, totalBetAmount.neg().toNumber());

  // Đăng ký phiên nếu chưa chạy
  if (!currentSession.isRunning) {
    currentSession.isRunning = true;
    currentSession.startTime = Date.now();
    currentSession.endTime = Date.now() + SESSION_DURATION * 1000;
    currentSession.notified15s = false;
    currentSession.sessionCode = currentSession.sessionCode || 1;
  }

  // Lưu cược người chơi
  const playerName = message.data.dName || senderId;
  if (!currentSession.players[senderId]) {
    currentSession.players[senderId] = {
      ...gameMentionPlayer(api, message),
      playerName,
      threadId,
      botId,
      username,
      bets: [],
    };
  }

  currentSession.players[senderId].bets.push(...validBets);

  // Đăng ký nhóm
  if (!Array.isArray(activeThreads[botId])) activeThreads[botId] = [];
  if (!activeThreads[botId].includes(threadId)) {
    activeThreads[botId].push(threadId);
    if (gameState.data.xoso45s) {
      gameState.data.xoso45s.activeThreads = activeThreads;
      saveGameData();
    }
  }

  // Tính thời gian còn lại
  const remainingSeconds = Math.max(0, Math.ceil((currentSession.endTime - Date.now()) / 1000));

  let confirmMsg = `✅ ${playerName} đã đặt cược thành công cho Kỳ #${currentSession.sessionCode}:\n`;
  for (const b of validBets) {
    let typeName = "Đề";
    if (b.type === "lo") typeName = b.diem ? `Lô (${b.diem}đ)` : "Lô";
    else if (b.type === "3cang") typeName = "3 Càng";
    else if (b.type === "xien2") typeName = "Xiên 2";
    else if (b.type === "chan") typeName = "Đề Chẵn";
    else if (b.type === "le") typeName = "Đề Lẻ";
    else if (b.type === "tai") typeName = "Đề Tài";
    else if (b.type === "xiu") typeName = "Đề Xỉu";

    confirmMsg += `• [${typeName}] ${b.number ? b.number + " : " : ""}${formatCurrency(b.amount)} VNĐ\n`;
  }
  confirmMsg += `💰 Tổng cược: ${formatCurrency(totalBetAmount)} VNĐ\n`;
  confirmMsg += `⏱ Thời gian còn lại: ${remainingSeconds} giây đếm ngược!`;

  await sendMessageFromSQL(
    api,
    message,
    {
      success: true,
      message: confirmMsg,
    },
    false,
    30000,
    false
  );
}

/**
 * Xử lý lệnh xem lịch sử soi cầu
 */
async function handleHistory(api, message, threadId) {
  if (gameHistory.length === 0) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: "Chưa có dữ liệu lịch sử các phiên trước. Hãy đặt cược để mở phiên đầu tiên!",
      },
      true,
      30000
    );
    return;
  }

  let text = `📊 KẾT QUẢ ${gameHistory.length} PHIÊN GẦN NHẤT (XSMB 45S):\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  for (let i = 0; i < Math.min(gameHistory.length, 10); i++) {
    const h = gameHistory[i];
    text += `• Kỳ #${h.sessionCode}: ĐB [${h.db}] ➔ Đề: [ ${h.de} ] | 3 Càng: [ ${h.baCang} ]\n`;
  }
  text += `━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `🎯 Đề 1 ăn 70 • 3 Càng 1 ăn 400 • Lô 23k ăn 80k/nháy`;

  await sendMessageFromSQL(
    api,
    message,
    {
      success: true,
      message: text,
    },
    false,
    60000
  );
}

/**
 * Xử lý lệnh xem thông tin phiên hiện tại
 */
async function handleSessionInfo(api, message, threadId) {
  const prefix = getGlobalPrefix(api.getBotId());
  if (!currentSession.isRunning) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: true,
        message: `🎰 [XSMB 45S] Phiên hiện tại đang ở trạng thái CHỜ.\nĐặt cược bất kỳ để kích hoạt đếm ngược 45 giây!\n\nVí dụ cược nhanh:\n${prefix}xsn de 68 10k (1 ăn 70)\n${prefix}xsn lo 68 10d (23k ăn 80k/nháy)`,
      },
      false,
      30000
    );
    return;
  }

  const remainingSeconds = Math.max(0, Math.ceil((currentSession.endTime - Date.now()) / 1000));
  const totalPlayers = Object.keys(currentSession.players).length;

  let infoMsg = `🎰 [XSMB 45S] THÔNG TIN KỲ #${currentSession.sessionCode}:\n`;
  infoMsg += `⏱ Thời gian còn lại: ${remainingSeconds} giây đếm ngược!\n`;
  infoMsg += `👥 Người chơi tham gia: ${totalPlayers} người\n`;

  const betsInThisThread = Object.values(currentSession.players).filter((p) => p.threadId === threadId);
  if (betsInThisThread.length > 0) {
    infoMsg += `\nCác vé cược trong nhóm này:\n`;
    for (const p of betsInThisThread) {
      infoMsg += `• ${p.playerName}: ${p.bets.length} vé (${formatCurrency(p.bets.reduce((s, b) => s + b.amount, 0))}đ)\n`;
    }
  }

  await sendMessageFromSQL(
    api,
    message,
    {
      success: true,
      message: infoMsg,
    },
    false,
    30000
  );
}

/**
 * Hướng dẫn chơi XSMB 45S
 */
async function sendHelp(api, message) {
  const prefix = getGlobalPrefix(api.getBotId());
  const helpText =
    `🎰 HƯỚNG DẪN XỔ SỐ MIỀN BẮC SIÊU TỐC 45S 🎰\n\n` +
    `⏱ Chu kỳ: 45 giây xổ 1 lần khi có người đặt cược!\n` +
    `🎲 Kết quả: Quay ngẫu nhiên chuẩn 27 giải XSMB.\n\n` +
    `📌 CÁC HÌNH THỨC CƯỢC & TỈ LỆ:\n` +
    `1️⃣ Cược ĐỀ (2 số cuối giải ĐB):\n` +
    `• Tỉ lệ: 1 ăn 70!\n` +
    `• Cú pháp: ${prefix}xsn de <số> <tiền>\n` +
    `• Ví dụ: ${prefix}xsn de 68 10k\n` +
    `• Cược tắt: ${prefix}xsn 68 10k\n` +
    `• Đánh dàn đề: ${prefix}xsn de 12,34,56 10k\n\n` +
    `2️⃣ Cược LÔ (Bao lô 27 giải XSMB):\n` +
    `• Tính theo điểm: 1 điểm = 23,000 VNĐ, trúng 1 nháy ăn 80,000 VNĐ!\n` +
    `• Cú pháp: ${prefix}xsn lo <số> <số điểm / tiền>\n` +
    `• Ví dụ: ${prefix}xsn lo 68 10d (cược 10 điểm = 230k)\n` +
    `• Hoặc cược theo tiền: ${prefix}xsn lo 68 50k\n\n` +
    `3️⃣ Cược 3 CÀNG (3 số cuối giải ĐB):\n` +
    `• Tỉ lệ: 1 ăn 400!\n` +
    `• Cú pháp: ${prefix}xsn 3c <3 số> <tiền> (VD: ${prefix}xsn 3c 789 10k)\n\n` +
    `4️⃣ Cược LÔ XIÊN 2 (Cả 2 số cùng về trong 27 giải):\n` +
    `• Tỉ lệ: 1 ăn 10!\n` +
    `• Cú pháp: ${prefix}xsn xien <số1>,<số2> <tiền>\n\n` +
    `5️⃣ Cược ĐỀ Chẵn / Lẻ / Tài / Xỉu (1 ăn 1.95):\n` +
    `• Cú pháp: ${prefix}xsn chan/le/tai/xiu <tiền>\n\n` +
    `📋 CÁC LỆNH KHÁC:\n` +
    `• ${prefix}xsn lichsu : Xem kết quả các phiên gần nhất\n` +
    `• ${prefix}xsn phien  : Xem thời gian còn lại của phiên`;

  await sendMessageFromSQL(
    api,
    message,
    {
      success: true,
      message: helpText,
    },
    false,
    120000
  );
}

/**
 * Điều phối lệnh từ người dùng
 */
export async function handleXoSoNhanhCommand(api, message, groupSettings, aliasCommand = "xsn") {
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return;

  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  const content = message.data.content.trim();
  const parts = content.split(/\s+/);
  const prefix = getGlobalPrefix(api.getBotId());

  const subCmd = (parts[1] || "").toLowerCase();

  // Xem hướng dẫn
  if (!subCmd || subCmd === "help" || subCmd === "huongdan" || subCmd === "hd") {
    await sendHelp(api, message);
    return;
  }

  // Xem lịch sử
  if (subCmd === "lichsu" || subCmd === "ls" || subCmd === "soicau" || subCmd === "sc") {
    await handleHistory(api, message, threadId);
    return;
  }

  // Xem phiên hiện tại
  if (subCmd === "phien" || subCmd === "info" || subCmd === "time") {
    await handleSessionInfo(api, message, threadId);
    return;
  }

  // Admin set kết quả can thiệp
  if (subCmd === "set" || subCmd === "kq") {
    if (isAdmin(api.getBotId(), senderId)) {
      const deTarget = parts[2];
      if (!deTarget || !/^\d{2}$/.test(deTarget)) {
        await sendMessageFromSQL(api, message, { success: false, message: "Vui lòng nhập 2 chữ số đề muốn set (ví dụ: !xsn set 68)" });
        return;
      }
      forcedResult = generateRandomXSMB();
      // Thay đổi 2 số cuối của ĐB thành con muốn set
      const prefixDb = forcedResult.db.slice(0, 3);
      forcedResult.db = prefixDb + deTarget;
      forcedResult.de = deTarget;
      forcedResult.baCang = forcedResult.db.slice(-3);
      forcedResult.allPrizes[0] = forcedResult.db;
      forcedResult.lo27[0] = deTarget;
      forcedResult.loCounts = {};
      for (const l of forcedResult.lo27) {
        forcedResult.loCounts[l] = (forcedResult.loCounts[l] || 0) + 1;
      }

      await sendMessageFromSQL(api, message, {
        success: true,
        message: `👑 [ADMIN] Đã can thiệp kết quả kỳ tiếp theo: Đề = [${deTarget}], Giải ĐB = [${forcedResult.db}]`,
      });
      return;
    }
  }

  // Phân tích đặt cược
  // Trường hợp 1: !xsn de 68 10k hoặc !xsn đề 68,79 10k
  if (subCmd === "de" || subCmd === "đề") {
    const numInput = parts[2];
    const amountStr = parts[3];
    if (!numInput || !amountStr) {
      await sendMessageFromSQL(api, message, { success: false, message: `Cú pháp không đúng. Ví dụ: ${prefix}xsn de 68 10k` });
      return;
    }
    const numbers = numInput.split(/[,|\s]+/).map((n) => n.trim().padStart(2, "0"));
    for (const n of numbers) {
      if (!/^\d{2}$/.test(n)) {
        await sendMessageFromSQL(api, message, { success: false, message: `Số cược không hợp lệ: [${n}]. Số đề phải từ 00 đến 99.` });
        return;
      }
    }
    const betList = numbers.map((n) => ({ type: "de", number: n, amountStr }));
    await placeBet(api, message, threadId, senderId, betList, groupSettings);
    return;
  }

  // Trường hợp 2: !xsn lo 68 10d hoặc !xsn lô 68 50k
  if (subCmd === "lo" || subCmd === "lô") {
    const numInput = parts[2];
    const amountOrDiemStr = parts[3];
    if (!numInput || !amountOrDiemStr) {
      await sendMessageFromSQL(api, message, { success: false, message: `Cú pháp không đúng. Ví dụ: ${prefix}xsn lo 68 10d (10 điểm = 230k) hoặc ${prefix}xsn lo 68 50k` });
      return;
    }
    const numbers = numInput.split(/[,|\s]+/).map((n) => n.trim().padStart(2, "0"));
    for (const n of numbers) {
      if (!/^\d{2}$/.test(n)) {
        await sendMessageFromSQL(api, message, { success: false, message: `Số cược không hợp lệ: [${n}]. Số lô phải từ 00 đến 99.` });
        return;
      }
    }

    // Kiểm tra xem là theo điểm (vd 10d, 5diem) hay theo tiền
    const diemMatch = amountOrDiemStr.match(/^(\d+)(d|diem|đ|điểm)$/i);
    let betList;
    if (diemMatch) {
      const diem = parseInt(diemMatch[1], 10);
      if (diem < 1) {
        await sendMessageFromSQL(api, message, { success: false, message: "Số điểm lô tối thiểu là 1 điểm (23,000 VNĐ)." });
        return;
      }
      betList = numbers.map((n) => ({
        type: "lo",
        number: n,
        diem,
        amountStr: `${diem * PRICE_PER_DIEM_LO}`,
      }));
    } else {
      betList = numbers.map((n) => ({
        type: "lo",
        number: n,
        amountStr: amountOrDiemStr,
      }));
    }

    await placeBet(api, message, threadId, senderId, betList, groupSettings);
    return;
  }

  // Trường hợp 3: !xsn 3c 789 10k hoặc !xsn 3cang 789 10k
  if (subCmd === "3c" || subCmd === "3cang") {
    const numInput = parts[2];
    const amountStr = parts[3];
    if (!numInput || !amountStr) {
      await sendMessageFromSQL(api, message, { success: false, message: `Cú pháp không đúng. Ví dụ: ${prefix}xsn 3c 789 10k` });
      return;
    }
    const numbers = numInput.split(/[,|\s]+/).map((n) => n.trim().padStart(3, "0"));
    for (const n of numbers) {
      if (!/^\d{3}$/.test(n)) {
        await sendMessageFromSQL(api, message, { success: false, message: `Số 3 càng không hợp lệ: [${n}]. Phải là 3 chữ số từ 000 đến 999.` });
        return;
      }
    }
    const betList = numbers.map((n) => ({ type: "3cang", number: n, amountStr }));
    await placeBet(api, message, threadId, senderId, betList, groupSettings);
    return;
  }

  // Trường hợp 4: !xsn xien 12,34 10k hoặc !xsn xiên 12 34 10k
  if (subCmd === "xien" || subCmd === "xiên" || subCmd === "xien2") {
    let num1, num2, amountStr;
    if (parts.length >= 4 && /^\d{1,2}$/.test(parts[2]) && /^\d{1,2}$/.test(parts[3])) {
      num1 = parts[2].padStart(2, "0");
      num2 = parts[3].padStart(2, "0");
      amountStr = parts[4];
    } else if (parts[2] && parts[2].includes(",")) {
      const pair = parts[2].split(",").map((s) => s.trim().padStart(2, "0"));
      num1 = pair[0];
      num2 = pair[1];
      amountStr = parts[3];
    }

    if (!num1 || !num2 || !amountStr || num1 === num2) {
      await sendMessageFromSQL(api, message, { success: false, message: `Cú pháp cược xiên 2: ${prefix}xsn xien 12,34 10k (2 số phải khác nhau).` });
      return;
    }

    const betList = [{ type: "xien2", number: `${num1},${num2}`, amountStr }];
    await placeBet(api, message, threadId, senderId, betList, groupSettings);
    return;
  }

  // Trường hợp 5: !xsn chan 10k / !xsn le 10k / !xsn tai 10k / !xsn xiu 10k
  if (["chan", "chẵn", "le", "lẻ", "tai", "tài", "xiu", "xỉu"].includes(subCmd)) {
    const amountStr = parts[2];
    if (!amountStr) {
      await sendMessageFromSQL(api, message, { success: false, message: `Cú pháp cược: ${prefix}xsn ${subCmd} 10k` });
      return;
    }
    const normalizedType =
      subCmd === "chan" || subCmd === "chẵn"
        ? "chan"
        : subCmd === "le" || subCmd === "lẻ"
        ? "le"
        : subCmd === "tai" || subCmd === "tài"
        ? "tai"
        : "xiu";
    const betList = [{ type: normalizedType, amountStr }];
    await placeBet(api, message, threadId, senderId, betList, groupSettings);
    return;
  }

  // Trường hợp 6: Đặt cược nhanh không gõ từ khóa "de": !xsn 68 10k
  if (/^\d{1,2}$/.test(subCmd)) {
    const num = subCmd.padStart(2, "0");
    const amountStr = parts[2];
    if (amountStr) {
      const betList = [{ type: "de", number: num, amountStr }];
      await placeBet(api, message, threadId, senderId, betList, groupSettings);
      return;
    }
  }

  // Lệnh không khớp cú pháp: hiện bảng hướng dẫn
  await sendHelp(api, message);
}

/**
 * Khởi tạo dữ liệu và schedule vòng lặp game Xổ Số Nhanh 45s
 */
export async function initializeGameXoSoNhanh(api) {
  if (!gameState.data.xoso45s) gameState.data.xoso45s = {};
  if (!gameState.data.xoso45s.activeThreads || Array.isArray(gameState.data.xoso45s.activeThreads)) {
    gameState.data.xoso45s.activeThreads = {};
  }
  if (!gameState.data.xoso45s.history) gameState.data.xoso45s.history = [];

  activeThreads = gameState.data.xoso45s.activeThreads;
  gameHistory = gameState.data.xoso45s.history;

  currentSession = {
    sessionCode: (gameHistory[0]?.sessionCode || 0) + 1,
    players: {},
    startTime: null,
    endTime: null,
    isRunning: false,
    notified15s: false,
  };

  // Đảm bảo chỉ có 1 job schedule chạy cho game này
  if (gameScheduleJob) {
    gameScheduleJob.cancel();
  }
  gameScheduleJob = schedule.scheduleJob("* * * * * *", () => runGameLoop(api));

  if (api.apiInstance?.schedule) {
    api.apiInstance.schedule.xosoNhanhJob = gameScheduleJob;
  }

  console.log(chalk.magentaBright("Khởi động minigame Xổ Số Nhanh 45S hoàn tất"));
}
