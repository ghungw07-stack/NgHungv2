import Big from "big.js";
import { registerQuickBetTable, closeQuickBetTable } from "../shared/quick-bet.js";
import { withPlayerBetLock } from "../shared/player-bet-lock.js";
import { buildGamePlayerMessage, gameMentionPlayer } from "../../../utils/game-mentions.js";
import fs from "fs/promises";

import { getPlayerBalance, getUsernameByIdZalo, updatePlayerBalanceByUsername, setLoserGameByUsername } from "../../../database/player.js";
import { connection } from "../../../database/state.js";
import { getApiManager } from "../../../index.js";
import { getBettingBotSentReactionTarget, startBettingReactionCountdown } from "../shared/betting-reaction-countdown.js";
import { formatCurrency, parseGameAmount } from "../../../utils/format-util.js";
import { sendMessageFromSQL, sendMessageFromSQLImage } from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import { checkBeforeJoinGame } from "../index.js";
import { createSicBoResultImage, createSicBoSoiCauImage } from "./canvas.js";
import { chooseSicBoDice, getSicBoOutcome, normalizeSicBoDoor, resolveSicBoBet } from "./rules.js";

const GAME_DURATION = 30_000;
const WARNING_TIME = 10_000;
const MAX_HISTORY = 60;
const HOUSE_BIAS_CHANCE = 0.6;
const GLOBAL_GAME_KEY = "__global__";
const activeGames = { [GLOBAL_GAME_KEY]: null };
const recentResults = new Map();

function rawMessageContent(message) {
  const content = message?.data?.content;
  return String(content && typeof content === "object" ? content.title || content.caption || "" : content || "");
}

function normalizeCommandText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function historyKey(api) {
  return `${api.getBotId()}_global`;
}

async function addRecentResult(api, dice) {
  const key = historyKey(api);
  const outcome = getSicBoOutcome(dice);
  const item = { dice: [...dice], total: outcome.total, isTriple: outcome.isTriple, at: Date.now() };
  const history = recentResults.get(key) || [];
  history.push(item);
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  recentResults.set(key, history);

  if (!connection) return;
  const collection = connection.collection("sicbo_history");
  await collection.insertOne({ key, botId: String(api.getBotId()), dice: [...dice], total: outcome.total, isTriple: outcome.isTriple, createdAt: new Date() });
  const stale = await collection.find({ key }, { projection: { _id: 1 } }).sort({ createdAt: -1 }).skip(MAX_HISTORY).toArray();
  if (stale.length) await collection.deleteMany({ _id: { $in: stale.map((entry) => entry._id) } });
}

async function getRecentResults(api) {
  const key = historyKey(api);
  if (connection) {
    const rows = await connection.collection("sicbo_history").find({ key }).sort({ createdAt: -1 }).limit(MAX_HISTORY).toArray();
    if (rows.length) {
      const history = rows.reverse().map((entry) => ({
        dice: entry.dice.map(Number),
        total: Number(entry.total),
        isTriple: Boolean(entry.isTriple),
        at: new Date(entry.createdAt).getTime(),
      }));
      recentResults.set(key, history);
      return history;
    }
  }
  return recentResults.get(key) || [];
}

function usage(prefix) {
  return [
    `Cú pháp: ${prefix}sicbo <cửa> <tiền>`,
    `Bàn đang mở: gõ chan 1b, le 1b hoặc tai all (mỗi tin một lượt cược).`,
    `Cược nhiều cửa: gửi thêm lệnh trong cùng phiên; có thể cược thêm cửa đã chọn.`,
    `Cửa chính: tai, xiu, chan, le`,
    `Theo tổng: tong4 ... tong17`,
    `Theo mặt: mat1 ... mat6`,
    `Đôi: doi1 ... doi6`,
    `Bộ ba: bo1 ... bo6 hoặc batkybo`,
    `Cặp hai số: cap1-2 ... cap5-6`,
    `Soi cầu: ${prefix}sicbo soicau`,
  ].join("\n");
}

function warningMessageShape(api, sentWarning, threadId, type) {
  const sentMessage = sentWarning?.message || sentWarning;
  if (sentMessage?.data) return sentMessage;
  if (!sentMessage) return null;
  return {
    data: {
      msgId: sentMessage.msgId || sentMessage.messageId || sentMessage.gMsgID,
      cliMsgId: sentMessage.cliMsgId || sentMessage.clientId,
      uidFrom: api.getBotId(),
    },
    threadId,
    type,
  };
}

async function sendWarnings(game, prefix) {
  for (const targetThreadId of game.threads) {
    const meta = game.threadMeta[String(targetThreadId)];
    const targetApi = getApiManager(meta?.botId)?.apiZalo || meta?.api;
    if (!targetApi) continue;
    const bets = Object.values(game.players).filter((player) => String(player.threadId) === String(targetThreadId));
    const text = buildGamePlayerMessage([
      "⏳ SIC BO còn 10 giây chốt cược!\n",
      bets.length ? bets.flatMap((bet) => ["• ", { player: bet }, `: ${bet.door.label} ${formatCurrency(bet.amount)}\n`]) : "Chưa có người cược trong nhóm.\n",
      `\nNhanh tay: ${prefix}sicbo <cửa> <tiền>`,
    ], { threadId: targetThreadId, botId: targetApi.getBotId(), type: meta?.type });
    targetApi.sendMessage({ ...text, ttl: 20_000 }, targetThreadId, meta?.type)
      .then(async (sent) => {
        const warningMessage = await getBettingBotSentReactionTarget(targetApi, { threadId: targetThreadId, type: meta?.type, data: {} }, sent);
        if (!warningMessage?.data?.msgId || !warningMessage?.data?.cliMsgId) return null;
        return startBettingReactionCountdown(targetApi, warningMessage, WARNING_TIME / 1000);
      })
      .catch((error) => console.warn("[sicbo] Gửi cảnh báo lỗi:", error?.message || error));
  }
}

function formatOutcome(dice) {
  const outcome = getSicBoOutcome(dice);
  if (outcome.isTriple) return `${dice.join(" • ")} = ${outcome.total} — BỘ BA ${dice[0]} (Tài/Xỉu và Chẵn/Lẻ đều thua)`;
  return `${dice.join(" • ")} = ${outcome.total} — ${outcome.size === "tai" ? "TÀI" : "XỈU"} • ${outcome.parity === "chan" ? "CHẴN" : "LẺ"}`;
}

async function endSicBoGame(api, message) {
  const game = activeGames[GLOBAL_GAME_KEY];
  activeGames[GLOBAL_GAME_KEY] = null;
  if (!game) return;
  closeQuickBetTable(game);
  api.addReaction("UNDO", [message]).catch(() => {});

  const dice = chooseSicBoDice(game.players, { houseBiasChance: HOUSE_BIAS_CHANCE });
  await addRecentResult(api, dice).catch((error) => console.error("[sicbo] Lưu lịch sử lỗi:", error));
  const history = await getRecentResults(api).catch(() => [{ dice, ...getSicBoOutcome(dice), at: Date.now() }]);
  const winners = [];
  const losers = [];
  const settlementErrors = [];

  for (const player of Object.values(game.players)) {
    const result = resolveSicBoBet(player.door, dice);
    try {
      if (result.state === "win") {
        const returned = player.amount.times(new Big(String(1 + result.profit))).round(0, Big.roundDown);
        const credit = await updatePlayerBalanceByUsername(player.username, returned, true, returned.minus(player.amount).toNumber(), {
          gameName: "Sic Bo",
          gameKey: "sicbo",
          choice: player.door.label,
          betAmount: player.amount.toNumber(),
          detail: formatOutcome(dice),
        });
        if (!credit?.success) throw new Error(credit?.message || "Không thể cộng tiền trả thưởng Sic Bo");
        winners.push([{ player }, ` [${player.door.label}]: +${formatCurrency(returned.minus(player.amount))}`]);
      } else {
        await setLoserGameByUsername(player.username, player.amount.neg().toNumber(), {
          gameName: "Sic Bo",
          gameKey: "sicbo",
          choice: player.door.label,
          betAmount: player.amount.toNumber(),
          detail: formatOutcome(dice),
        });
        losers.push([{ player }, ` [${player.door.label}]: -${formatCurrency(player.amount)}`]);
      }
    } catch (error) {
      settlementErrors.push([{ player }]);
      console.error(`[sicbo] Trả thưởng lỗi cho ${player.username}:`, error);
    }
  }

  const parts = [`🎲 KẾT QUẢ SIC BO\n${formatOutcome(dice)}\n\n`];
  for (const [title, rows] of [["✅ THẮNG", winners], ["❌ THUA", losers], ["⚠️ Chưa thể quyết toán", settlementErrors]]) {
    if (rows.length) parts.push(`${title}\n`, rows.flatMap((row) => ["• ", row, "\n"]));
  }

  let imagePath = null;
  try {
    imagePath = await createSicBoResultImage(dice, history);
    for (const targetThreadId of game.threads) {
      const meta = game.threadMeta[String(targetThreadId)];
      const targetApi = getApiManager(meta?.botId)?.apiZalo || meta?.api || api;
      await targetApi.sendMessage(
        { ...buildGamePlayerMessage(parts, { threadId: targetThreadId, botId: targetApi.getBotId(), type: meta?.type ?? message.type }), attachments: [imagePath], ttl: 60_000, isUseProphylactic: true },
        targetThreadId,
        meta?.type || message.type
      ).catch((error) => console.warn(`[sicbo] Không gửi được kết quả tới ${targetThreadId}:`, error?.message || error));
    }
  } catch (error) {
    console.error("[sicbo] Vẽ/gửi kết quả lỗi:", error);
    for (const targetThreadId of game.threads) {
      const meta = game.threadMeta[String(targetThreadId)];
      const targetApi = getApiManager(meta?.botId)?.apiZalo || meta?.api || api;
      await targetApi.sendMessage({ ...buildGamePlayerMessage(parts, { threadId: targetThreadId, botId: targetApi.getBotId(), type: meta?.type ?? message.type }), ttl: 60_000 }, targetThreadId, meta?.type ?? message.type).catch(() => {});
    }
  } finally {
    if (imagePath) setTimeout(() => fs.unlink(imagePath).catch(() => {}), 60_000);
  }
}

export async function handleSicBoBet(api, message, groupSettings) {
  return withPlayerBetLock(message.data.uidFrom, () => placeSicBoBet(api, message, groupSettings));
}

async function placeSicBoBet(api, message, groupSettings) {
  const quickGame = message.__quickBetGame;
  const isQuickBetClosed = () => quickGame && (activeGames[GLOBAL_GAME_KEY] !== quickGame || Date.now() >= quickGame.expiresAt);
  if (isQuickBetClosed()) return true;
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const prefix = getGlobalPrefix(api.getBotId());
  const escapedPrefix = String(prefix).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const content = normalizeCommandText(rawMessageContent(message));
  const commandPattern = `${escapedPrefix}(?:sicbo|sic-bo|sb)`;

  if (new RegExp(`^${commandPattern}\\s+(?:soicau|soi-cau|cau)$`, "i").test(content)) {
    if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return true;
    const history = await getRecentResults(api);
    const imagePath = await createSicBoSoiCauImage(history);
    try {
      await sendMessageFromSQLImage(api, message, { success: true, message: "🔎 Cầu Sic Bo toàn server" }, false, imagePath);
    } finally {
      await fs.unlink(imagePath).catch(() => {});
    }
    return true;
  }

  const match = content.match(new RegExp(`^${commandPattern}\\s+(.+?)\\s+([\\d,.]+[kmb]?|allin|all|[\\d,.]+%)$`, "i"));
  if (!match) {
    if (new RegExp(`^${commandPattern}(?:\\s|$)`, "i").test(content)) {
      await sendMessageFromSQL(api, message, { success: false, message: usage(prefix) }, true, 15_000);
      return true;
    }
    return false;
  }
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return true;

  const door = normalizeSicBoDoor(match[1]);
  if (!door) {
    await sendMessageFromSQL(api, message, { success: false, message: `Cửa cược không hợp lệ.\n${usage(prefix)}` }, true, 15_000);
    return true;
  }

  const username = await getUsernameByIdZalo(senderId);
  const balanceResult = await getPlayerBalance(senderId);
  if (!username || !balanceResult.success) {
    await sendMessageFromSQL(api, message, { success: false, message: "Không thể lấy hồ sơ hoặc số dư." }, true, 10_000);
    return true;
  }

  let betAmount;
  try {
    const parsed = parseGameAmount(match[2], balanceResult.balance);
    betAmount = parsed === "allin" ? new Big(balanceResult.balance) : parsed;
    if (betAmount.lt(1000)) throw new Error("Cược tối thiểu 1,000 VNĐ");
    if (betAmount.gt(balanceResult.balance)) throw new Error(`Số dư không đủ. Bạn có ${formatCurrency(new Big(balanceResult.balance))} VNĐ`);
  } catch (error) {
    await sendMessageFromSQL(api, message, { success: false, message: error.message }, true, 10_000);
    return true;
  }

  if (isQuickBetClosed()) return true;
  const debit = await updatePlayerBalanceByUsername(username, betAmount.neg());
  if (!debit?.success) {
    await sendMessageFromSQL(api, message, { success: false, message: debit?.message || "Không thể trừ tiền cược. Vui lòng thử lại." }, true, 10_000);
    return true;
  }
  if (isQuickBetClosed()) {
    const refund = await updatePlayerBalanceByUsername(username, betAmount);
    await sendMessageFromSQL(api, message, { success: false, message: refund?.success
      ? "Bàn đã chốt cược, đã hoàn lại tiền lượt này."
      : "Bàn đã chốt cược nhưng hoàn tiền chưa thành công. Vui lòng báo quản trị viên." }, true, 10_000);
    return true;
  }
  const playerName = message.data.dName || senderId;
  let game = activeGames[GLOBAL_GAME_KEY];
  if (!game) {
    game = { players: [], threads: new Set(), threadMeta: {}, timeout: null, warningTimeout: null };
    game.expiresAt = Date.now() + GAME_DURATION;
    activeGames[GLOBAL_GAME_KEY] = game;
  }

  const groupName = groupSettings?.[threadId]?.nameGroup || String(threadId);
  game.players.push({ ...gameMentionPlayer(api, message), door, amount: betAmount, name: playerName, username, threadId, groupName });
  game.threads.add(threadId);
  game.threadMeta[String(threadId)] = { botId: api.getBotId(), api, type: message.type };

  registerQuickBetTable(api.getBotId(), threadId, "sicbo", game, normalizeSicBoDoor);

  if (game.players.length === 1) {
    const startMessage = `🎲 ${playerName} mở phiên SIC BO 30 giây\nĐặt ${formatCurrency(betAmount)} vào ${door.label}.\n\n${usage(prefix)}\n\nTỷ lệ: cửa chính 1:1 • tổng 1:6–50 • một mặt 1:1/2/3 • đôi 1:10 • bộ ba 1:150 • bộ ba bất kỳ 1:30 • cặp 1:5`;
    game.warningTimeout = setTimeout(() => sendWarnings(game, prefix), GAME_DURATION - WARNING_TIME);
    game.timeout = setTimeout(() => endSicBoGame(api, message), GAME_DURATION);
    const sentStart = await sendMessageFromSQL(api, message, { success: true, message: startMessage }, false, GAME_DURATION);
    const clockTarget = await getBettingBotSentReactionTarget(api, message, sentStart);
    if (clockTarget) startBettingReactionCountdown(api, clockTarget, GAME_DURATION / 1000, game.expiresAt);
    else console.warn("[sicbo] Tin mở bàn thiếu msgId/cliMsgId, không thể thả CLOCK");
  } else {
    const players = [...new Map(game.players.map((player) => [`${player.username}:${player.threadId}`, player])).values()];
    const text = buildGamePlayerMessage([
      `✅ Đặt ${formatCurrency(betAmount)} cửa ${door.label}.\n👥 Cùng phiên toàn server: `,
      players.flatMap((player, index) => [index ? ", " : "", { player }, ` [${player.groupName}]`]),
    ], { threadId, botId: api.getBotId(), type: message.type });
    const sentBet = await sendMessageFromSQL(api, message, { success: true, message: text.msg, mentions: text.mentions }, true, 15_000);
    const betCountdownMessage = await getBettingBotSentReactionTarget(api, message, sentBet);
    const remaining = Math.max(0, Math.ceil((game.expiresAt - Date.now()) / 1000));
    if (betCountdownMessage && remaining > 0) startBettingReactionCountdown(api, betCountdownMessage, remaining, game.expiresAt);
  }
  return true;
}
