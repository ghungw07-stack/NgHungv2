import Big from "big.js";
import fs from "fs/promises";

import { getPlayerBalance, getUsernameByIdZalo, updatePlayerBalanceByUsername, setLoserGameByUsername } from "../../../database/player.js";
import { connection } from "../../../database/state.js";
import { getApiManager } from "../../../index.js";
import { getBettingBotSentReactionTarget, startBettingReactionCountdown } from "./betting-reaction-countdown.js";
import { formatCurrency, parseGameAmount } from "../../../utils/format-util.js";
import { sendMessageFromSQL, sendMessageFromSQLImage } from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import { checkBeforeJoinGame } from "../index.js";
import { buildGamePlayerMessage, gameMentionPlayer } from "../../../utils/game-mentions.js";

const GAME_DURATION = 30_000;
const WARNING_TIME = 10_000;
const MAX_HISTORY = 60;

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function messageText(message) {
  const content = message?.data?.content;
  return String(content && typeof content === "object" ? content.title || content.caption || "" : content || "").trim();
}

export function createGlobalBettingGame(config) {
  let activeGame = null;
  const memoryHistory = new Map();

  const historyKey = (api) => `${api.getBotId()}_global`;

  async function addHistory(api, result) {
    const key = historyKey(api);
    const entry = { ...config.serializeResult(result), at: Date.now() };
    const history = memoryHistory.get(key) || [];
    history.push(entry);
    if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
    memoryHistory.set(key, history);
    if (!connection) return;
    const collection = connection.collection(config.historyCollection);
    await collection.insertOne({ key, botId: String(api.getBotId()), ...config.serializeResult(result), createdAt: new Date() });
    const stale = await collection.find({ key }, { projection: { _id: 1 } }).sort({ createdAt: -1 }).skip(MAX_HISTORY).toArray();
    if (stale.length) await collection.deleteMany({ _id: { $in: stale.map((item) => item._id) } });
  }

  async function getHistory(api) {
    const key = historyKey(api);
    if (connection) {
      const rows = await connection.collection(config.historyCollection).find({ key }).sort({ createdAt: -1 }).limit(MAX_HISTORY).toArray();
      if (rows.length) {
        const history = rows.reverse().map((row) => ({ ...config.deserializeResult(row), at: new Date(row.createdAt).getTime() }));
        memoryHistory.set(key, history);
        return history;
      }
    }
    return memoryHistory.get(key) || [];
  }

  async function sendWarnings(game, prefix) {
    for (const threadId of game.threads) {
      const meta = game.threadMeta[String(threadId)];
      const api = getApiManager(meta?.botId)?.apiZalo || meta?.api;
      if (!api) continue;
      const bets = Object.values(game.players).filter((player) => String(player.threadId) === String(threadId));
      const text = buildGamePlayerMessage([
        `⏳ ${config.title} còn 10 giây chốt cược!\n`,
        bets.length ? bets.flatMap((bet) => ["• ", { player: bet }, `: ${bet.door.label} ${formatCurrency(bet.amount)}\n`]) : "Chưa có người cược trong nhóm.\n",
        `\nNhanh tay: ${prefix}${config.command} <cửa> <tiền>`,
      ], { threadId, botId: api.getBotId(), type: meta?.type });
      api.sendMessage({ ...text, ttl: 20_000 }, threadId, meta?.type)
        .then(async (sent) => {
          const warning = await getBettingBotSentReactionTarget(api, { threadId, type: meta?.type, data: {} }, sent);
          if (!warning) return null;
          return startBettingReactionCountdown(api, warning, WARNING_TIME / 1000);
        })
        .catch((error) => console.warn(`[${config.command}] Gửi cảnh báo lỗi:`, error?.message || error));
    }
  }

  async function sendToThreads(game, originApi, originMessage, parts, payload) {
    for (const threadId of game.threads) {
      const meta = game.threadMeta[String(threadId)];
      const api = getApiManager(meta?.botId)?.apiZalo || meta?.api || originApi;
      const type = meta?.type ?? originMessage.type;
      const text = buildGamePlayerMessage(parts, { threadId, botId: api.getBotId(), type });
      try {
        await api.sendMessage({ ...payload, ...text }, threadId, type);
      } catch (error) {
        console.warn(`[${config.command}] Không gửi được tới ${threadId}:`, error?.message || error);
        // Upload ảnh có thể lỗi riêng (đặc biệt với GIF lớn/định dạng mới).
        // Luôn gửi lại phần kết quả chữ để người chơi không bị mất ván.
        if (payload.attachments?.length) {
          await api.sendMessage({ ttl: payload.ttl, ...text }, threadId, type)
            .catch((fallbackError) => console.warn(`[${config.command}] Gửi fallback tới ${threadId} lỗi:`, fallbackError?.message || fallbackError));
        }
      }
    }
  }

  async function endGame(api, message) {
    const game = activeGame;
    activeGame = null;
    if (!game) return;
    // Một số phiên bản API trả về void thay vì Promise ở addReaction; không
    // được để thao tác dọn reaction làm văng cả luồng quyết toán/GIF.
    try { await Promise.resolve(api.addReaction?.("UNDO", [message])); } catch {}
    const result = config.chooseResult(game.players);
    // Một số game có ảnh kết quả động (GIF) cần gửi ngay khi có kết quả;
    // không để bước ghi lịch sử/quyết toán chậm làm mất phần trình diễn.
    let earlyImagePath = null;
    if (config.renderBeforeSettlement) {
      try {
        earlyImagePath = await config.renderResult(result, []);
        await sendToThreads(game, api, message, [`🎬 ${config.title}: đang công bố kết quả...\n`], {
          attachments: [earlyImagePath], ttl: 60_000, isUseProphylactic: true,
        });
      } catch (error) {
        console.error(`[${config.command}] Gửi GIF sớm lỗi:`, error?.message || error);
      } finally {
        if (earlyImagePath) setTimeout(() => fs.unlink(earlyImagePath).catch(() => {}), 60_000);
      }
    }
    await addHistory(api, result).catch((error) => console.error(`[${config.command}] Lưu lịch sử lỗi:`, error));
    const history = await getHistory(api).catch(() => [{ ...config.serializeResult(result), at: Date.now() }]);

    const winners = [];
    const pushes = [];
    const losers = [];
    const settlementErrors = [];
    for (const player of Object.values(game.players)) {
      const settlement = config.settle(player.door, result);
      try {
        if (settlement.returnMultiplier > 0) {
          const returned = player.amount.times(new Big(String(settlement.returnMultiplier))).round(0, Big.roundDown);
          const isWin = settlement.state === "win";
          const credit = await updatePlayerBalanceByUsername(
            player.username,
            returned,
            isWin ? true : null,
            returned.minus(player.amount).toNumber(),
            {
              gameName: config.title,
              gameKey: config.command,
              choice: player.door.label,
              betAmount: player.amount.toNumber(),
              detail: config.formatOutcome(result),
            }
          );
          if (!credit?.success) throw new Error(credit?.message || "Không thể cộng tiền trả thưởng");
          if (settlement.state === "push") pushes.push([{ player }, ` [${player.door.label}]: hoàn ${formatCurrency(player.amount)}`]);
          else winners.push([{ player }, ` [${player.door.label}]: +${formatCurrency(returned.minus(player.amount))}`]);
        } else {
          const recorded = await setLoserGameByUsername(player.username, player.amount.neg().toNumber(), {
            gameName: config.title,
            gameKey: config.command,
            choice: player.door.label,
            betAmount: player.amount.toNumber(),
            detail: config.formatOutcome(result),
          });
          if (!recorded?.success) throw new Error(recorded?.message || "Không thể ghi nhận vé thua");
          losers.push([{ player }, ` [${player.door.label}]: -${formatCurrency(player.amount)}`]);
        }
      } catch (error) {
        settlementErrors.push([{ player }]);
        console.error(`[${config.command}] Quyết toán lỗi cho ${player.username}:`, error);
      }
    }

    const parts = [`🎲 KẾT QUẢ ${config.title}\n${config.formatOutcome(result)}\n\n`];
    for (const [title, rows] of [["✅ THẮNG", winners], ["🔄 HOÀN CƯỢC", pushes], ["❌ THUA", losers], ["⚠️ Chưa thể quyết toán", settlementErrors]]) {
      if (rows.length) parts.push(`${title}\n`, rows.flatMap((row) => ["• ", row, "\n"]));
    }

    let imagePath = null;
    try {
      if (!config.renderBeforeSettlement) {
        imagePath = await config.renderResult(result, history, game);
        await sendToThreads(game, api, message, parts, { attachments: [imagePath], ttl: 60_000, isUseProphylactic: true });
      } else {
        await sendToThreads(game, api, message, parts, { ttl: 60_000 });
      }
    } catch (error) {
      console.error(`[${config.command}] Vẽ/gửi kết quả lỗi:`, error);
      await sendToThreads(game, api, message, parts, { ttl: 60_000 });
    } finally {
      if (imagePath) setTimeout(() => fs.unlink(imagePath).catch(() => {}), 60_000);
    }
  }

  return async function handleGlobalBet(api, message, groupSettings) {
    const prefix = getGlobalPrefix(api.getBotId());
    const aliases = [config.command, ...(config.aliases || [])].map(escapeRegex).join("|");
    const commandPattern = `${escapeRegex(prefix)}(?:${aliases})`;
    const content = messageText(message);

    if (new RegExp(`^${commandPattern}\\s+(?:soicau|soi-cau|cau)$`, "i").test(content)) {
      if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return true;
      const history = await getHistory(api);
      const imagePath = await config.renderHistory(history);
      try {
        await sendMessageFromSQLImage(api, message, { success: true, message: `🔎 Cầu ${config.title} toàn server` }, false, imagePath);
      } finally {
        await fs.unlink(imagePath).catch(() => {});
      }
      return true;
    }

    const match = content.match(new RegExp(`^${commandPattern}\\s+(.+?)\\s+([\\d,.]+[kmb]?|allin|all|[\\d,.]+%)$`, "i"));
    if (!match) {
      if (new RegExp(`^${commandPattern}(?:\\s|$)`, "i").test(content)) {
        await sendMessageFromSQL(api, message, { success: false, message: config.usage(prefix) }, true, 15_000);
        return true;
      }
      return false;
    }
    if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return true;
    const door = config.normalizeDoor(match[1]);
    if (!door) {
      await sendMessageFromSQL(api, message, { success: false, message: `Cửa cược không hợp lệ.\n${config.usage(prefix)}` }, true, 15_000);
      return true;
    }

    const senderId = message.data.uidFrom;
    const username = await getUsernameByIdZalo(senderId);
    const balance = await getPlayerBalance(senderId);
    if (!username || !balance.success) {
      await sendMessageFromSQL(api, message, { success: false, message: "Không thể lấy hồ sơ hoặc số dư." }, true, 10_000);
      return true;
    }

    let amount;
    try {
      const parsed = parseGameAmount(match[2], balance.balance);
      amount = parsed === "allin" ? new Big(balance.balance) : parsed;
      if (amount.lt(1000)) throw new Error("Cược tối thiểu 1,000 VNĐ");
      if (amount.gt(balance.balance)) throw new Error(`Số dư không đủ. Bạn có ${formatCurrency(new Big(balance.balance))} VNĐ`);
    } catch (error) {
      await sendMessageFromSQL(api, message, { success: false, message: error.message }, true, 10_000);
      return true;
    }

    const debit = await updatePlayerBalanceByUsername(username, amount.neg());
    if (!debit?.success) {
      await sendMessageFromSQL(api, message, { success: false, message: debit?.message || "Không thể trừ tiền cược. Vui lòng thử lại." }, true, 10_000);
      return true;
    }
    const name = message.data.dName || senderId;
    if (!activeGame) activeGame = { players: {}, threads: new Set(), threadMeta: {}, timeout: null, warningTimeout: null, endsAt: Date.now() + GAME_DURATION };
    else if (activeGame.players[senderId]) {
      await updatePlayerBalanceByUsername(username, amount);
      await sendMessageFromSQL(api, message, { success: false, message: "Bạn đã cược trong ván này rồi!" }, true, 10_000);
      return true;
    }

    const game = activeGame;
    const threadId = message.threadId;
    const groupName = groupSettings?.[threadId]?.nameGroup || String(threadId);
    game.players[senderId] = { ...gameMentionPlayer(api, message), door, amount, name, username, threadId, groupName };
    game.threads.add(threadId);
    game.threadMeta[String(threadId)] = { botId: api.getBotId(), api, type: message.type };

    if (Object.keys(game.players).length === 1) {
      game.warningTimeout = setTimeout(() => sendWarnings(game, prefix), GAME_DURATION - WARNING_TIME);
      game.timeout = setTimeout(() => {
        endGame(api, message).catch((error) => console.error(`[${config.command}] Kết thúc ván lỗi:`, error));
      }, GAME_DURATION);
      const start = `🎲 ${name} mở phiên ${config.title} 30 giây\nĐặt ${formatCurrency(amount)} vào ${door.label}.\n\n${config.usage(prefix)}\n\n${config.oddsSummary}`;
      const sentStart = await sendMessageFromSQL(api, message, { success: true, message: start }, false, GAME_DURATION);
      const clockTarget = await getBettingBotSentReactionTarget(api, message, sentStart);
      if (clockTarget) startBettingReactionCountdown(api, clockTarget, GAME_DURATION / 1000, game.endsAt);
      else console.warn(`[${config.command}] Tin mở bàn thiếu msgId/cliMsgId, không thể thả CLOCK`);
    } else {
      const text = buildGamePlayerMessage([
        `✅ Đặt ${formatCurrency(amount)} cửa ${door.label}.\n👥 Cùng phiên toàn server: `,
        Object.values(game.players).flatMap((player, index) => [index ? ", " : "", { player }, ` [${player.groupName}]`]),
      ], { threadId, botId: api.getBotId(), type: message.type });
      const sentBet = await sendMessageFromSQL(api, message, { success: true, message: text.msg, mentions: text.mentions }, true, 15_000);
      const betCountdownMessage = await getBettingBotSentReactionTarget(api, message, sentBet);
      const remaining = Math.max(0, Math.ceil((game.endsAt - Date.now()) / 1000));
      if (betCountdownMessage && remaining > 0) startBettingReactionCountdown(api, betCountdownMessage, remaining, game.endsAt);
    }
    return true;
  };
}
