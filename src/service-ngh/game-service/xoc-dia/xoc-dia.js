import Big from "big.js";
import { registerQuickBetTable, closeQuickBetTable } from "../shared/quick-bet.js";
import { withPlayerBetLock } from "../shared/player-bet-lock.js";
import { buildGamePlayerMessage, gameMentionPlayer } from "../../../utils/game-mentions.js";
import { Canvas } from "skia-canvas";
import fs from "fs/promises";
import path from "path";

import { getPlayerBalance, getUsernameByIdZalo, updatePlayerBalanceByUsername, setLoserGameByUsername } from "../../../database/player.js";
import { connection } from "../../../database/state.js";
import { getApiManager } from "../../../index.js";
import { getBettingBotSentReactionTarget, startBettingReactionCountdown } from "../shared/betting-reaction-countdown.js";
import { formatCurrency, parseGameAmount } from "../../../utils/format-util.js";
import { sendMessageFromSQL, sendMessageFromSQLImage } from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import { checkBeforeJoinGame } from "../index.js";
import {
  XOC_DIA_DOORS,
  chooseXocDiaCoins,
  getXocDiaOutcome,
  getXocDiaReturnMultiplier,
  normalizeXocDiaDoor,
  resolveXocDiaBet,
} from "./rules.js";

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

async function addRecentResult(api, coins) {
  const key = historyKey(api);
  const redCount = coins.filter((coin) => coin === "red").length;
  const history = recentResults.get(key) || [];
  history.push({ redCount, at: Date.now() });
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  recentResults.set(key, history);

  if (!connection) return;
  const collection = connection.collection("xocdia_history");
  await collection.insertOne({ key, botId: String(api.getBotId()), redCount, createdAt: new Date() });
  const stale = await collection.find({ key }, { projection: { _id: 1 } }).sort({ createdAt: -1 }).skip(MAX_HISTORY).toArray();
  if (stale.length) await collection.deleteMany({ _id: { $in: stale.map((item) => item._id) } });
}

async function getRecentResults(api) {
  const key = historyKey(api);
  if (connection) {
    const rows = await connection.collection("xocdia_history").find({ key }).sort({ createdAt: -1 }).limit(MAX_HISTORY).toArray();
    if (rows.length) {
      const history = rows.reverse().map((item) => ({ redCount: Number(item.redCount), at: new Date(item.createdAt).getTime() }));
      recentResults.set(key, history);
      return history;
    }
  }
  return recentResults.get(key) || [];
}

function roundRect(ctx, x, y, width, height, radius = 18) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function drawFelt(ctx, width, height) {
  const gradient = ctx.createRadialGradient(width * 0.48, height * 0.35, 40, width * 0.5, height * 0.45, width * 0.8);
  gradient.addColorStop(0, "#148966");
  gradient.addColorStop(0.55, "#086044");
  gradient.addColorStop(1, "#032e25");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.035;
  ctx.fillStyle = "#ffffff";
  for (let y = 0; y < height; y += 9) {
    for (let x = (y / 9) % 2 ? 4 : 0; x < width; x += 12) ctx.fillRect(x, y, 2, 2);
  }
  ctx.restore();
}

function drawCoin(ctx, x, y, color, radius = 52) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.72)";
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 10;
  const gradient = ctx.createRadialGradient(x - radius * 0.34, y - radius * 0.38, 3, x, y, radius);
  if (color === "red") {
    gradient.addColorStop(0, "#ff7771");
    gradient.addColorStop(0.42, "#ef302f");
    gradient.addColorStop(1, "#9d0d14");
  } else {
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.58, "#f2f0e8");
    gradient.addColorStop(1, "#aaa9a3");
  }
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = color === "red" ? "#ff8077" : "#ffffff";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, radius - 7, 0, Math.PI * 2);
  ctx.strokeStyle = color === "red" ? "rgba(110,0,0,.3)" : "rgba(70,70,70,.18)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawBetCell(ctx, cell, redCount) {
  const state = resolveXocDiaBet(cell.key, redCount);
  const isWin = state === "win";
  const isPush = state === "push";
  roundRect(ctx, cell.x, cell.y, cell.w, cell.h, 16);
  const gradient = ctx.createLinearGradient(cell.x, cell.y, cell.x, cell.y + cell.h);
  gradient.addColorStop(0, isWin ? "#fff7d0" : isPush ? "#dce8dd" : "rgba(0,31,23,.86)");
  gradient.addColorStop(1, isWin ? "#cabf8c" : isPush ? "#aebcac" : "rgba(0,17,13,.92)");
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = isWin ? "#ffe975" : isPush ? "#c5d9c8" : "rgba(98,208,155,.24)";
  ctx.lineWidth = isWin ? 3 : 1.5;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = isWin || isPush ? "#101a16" : "#d5e8dc";
  ctx.font = `bold ${cell.large ? 34 : 24}px sans-serif`;
  ctx.fillText(cell.label, cell.x + cell.w / 2, cell.y + cell.h * 0.42);
  ctx.fillStyle = isWin || isPush ? "#264e3f" : "#7fc3a4";
  ctx.font = "bold 18px sans-serif";
  ctx.fillText(`1 : ${XOC_DIA_DOORS[cell.key].profit}`, cell.x + cell.w / 2, cell.y + cell.h * 0.7);
  if (isWin || isPush) {
    roundRect(ctx, cell.x + cell.w - 78, cell.y + 10, 65, 26, 13);
    ctx.fillStyle = isWin ? "#bd251f" : "#35614d";
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText(isWin ? "TRÚNG" : "HOÀN", cell.x + cell.w - 45, cell.y + 23);
  }
}

export async function createXocDiaResultImage(coins, history = []) {
  const width = 1024;
  const height = 1050;
  const canvas = new Canvas(width, height);
  const ctx = canvas.getContext("2d");
  const redCount = coins.filter((coin) => coin === "red").length;
  const outcome = getXocDiaOutcome(redCount);

  drawFelt(ctx, width, height);
  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.fillRect(0, 0, width, 102);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff4b7";
  ctx.font = "bold 19px sans-serif";
  ctx.fillText("MYBOT • LIVE CASINO", 36, 32);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 40px sans-serif";
  ctx.fillText("XÓC ĐĨA", 36, 70);
  ctx.textAlign = "right";
  ctx.fillStyle = "#f8e9a2";
  ctx.font = "bold 24px sans-serif";
  ctx.fillText(`${outcome.redCount} ĐỎ • ${outcome.whiteCount} TRẮNG`, width - 36, 58);

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.8)";
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 18;
  ctx.beginPath();
  ctx.ellipse(512, 326, 330, 210, 0, 0, Math.PI * 2);
  const plate = ctx.createRadialGradient(455, 267, 20, 512, 326, 330);
  plate.addColorStop(0, "#424441");
  plate.addColorStop(0.55, "#171b19");
  plate.addColorStop(1, "#050706");
  ctx.fillStyle = plate;
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(512, 326, 292, 174, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,.13)";
  ctx.lineWidth = 4;
  ctx.stroke();

  const coinPositions = [[445, 270], [575, 270], [445, 386], [575, 386]];
  coins.forEach((coin, index) => drawCoin(ctx, coinPositions[index][0], coinPositions[index][1], coin));

  roundRect(ctx, 354, 478, 316, 62, 31);
  ctx.fillStyle = "rgba(4,18,14,.82)";
  ctx.fill();
  ctx.strokeStyle = "#f8e99b";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff4b7";
  ctx.font = "bold 26px sans-serif";
  ctx.fillText(`${outcome.parity === "chan" ? "CHẴN" : "LẺ"}${outcome.size ? ` • ${outcome.size === "tai" ? "TÀI" : "XỈU"}` : " • 2–2"}`, 512, 510);

  const gap = 10;
  const margin = 18;
  const cellW = (width - margin * 2 - gap * 3) / 4;
  const cells = [
    { key: "bon_trang", label: "4 TRẮNG", x: margin, y: 570, w: cellW, h: 130 },
    { key: "le", label: "LẺ", x: margin + (cellW + gap), y: 570, w: cellW, h: 130, large: true },
    { key: "chan", label: "CHẴN", x: margin + (cellW + gap) * 2, y: 570, w: cellW, h: 130, large: true },
    { key: "bon_do", label: "4 ĐỎ", x: margin + (cellW + gap) * 3, y: 570, w: cellW, h: 130 },
    { key: "ba_trang", label: "3 TRẮNG", x: margin, y: 710, w: cellW, h: 130 },
    { key: "xiu", label: "XỈU", x: margin + (cellW + gap), y: 710, w: cellW, h: 130, large: true },
    { key: "tai", label: "TÀI", x: margin + (cellW + gap) * 2, y: 710, w: cellW, h: 130, large: true },
    { key: "ba_do", label: "3 ĐỎ", x: margin + (cellW + gap) * 3, y: 710, w: cellW, h: 130 },
    { key: "hai_hai", label: "2 ĐỎ • 2 TRẮNG", x: margin, y: 850, w: cellW * 2 + gap, h: 110 },
    { key: "tu", label: "TỨ • CÙNG MÀU", x: margin + (cellW + gap) * 2, y: 850, w: cellW * 2 + gap, h: 110 },
  ];
  cells.forEach((cell) => drawBetCell(ctx, cell, redCount));

  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,.66)";
  ctx.font = "bold 13px sans-serif";
  ctx.fillText("10 PHIÊN GẦN NHẤT", 28, 1005);
  history.slice(-10).forEach((item, index) => {
    const x = 280 + index * 69;
    const count = Number(item.redCount);
    ctx.beginPath();
    ctx.arc(x, 1005, 22, 0, Math.PI * 2);
    ctx.fillStyle = count % 2 === 0 ? "#f1d778" : "#e94545";
    ctx.fill();
    ctx.fillStyle = count % 2 === 0 ? "#1a241f" : "#ffffff";
    ctx.textAlign = "center";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText(`${count}Đ`, x, 1005);
  });

  await fs.mkdir(path.resolve("./assets/temp"), { recursive: true });
  const imagePath = path.resolve(`./assets/temp/xocdia_result_${Date.now()}.png`);
  await fs.writeFile(imagePath, await canvas.toBuffer("image/png"));
  return imagePath;
}

export async function createXocDiaSoiCauImage(history) {
  const width = 1024;
  const height = 640;
  const canvas = new Canvas(width, height);
  const ctx = canvas.getContext("2d");
  drawFelt(ctx, width, height);
  ctx.fillStyle = "rgba(0,0,0,.34)";
  ctx.fillRect(0, 0, width, 110);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff4b7";
  ctx.font = "bold 18px sans-serif";
  ctx.fillText("MYBOT • XÓC ĐĨA ANALYTICS", 42, 32);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 38px sans-serif";
  ctx.fillText("SOI CẦU XÓC ĐĨA", 42, 75);

  roundRect(ctx, 34, 138, 956, 424, 24);
  ctx.fillStyle = "rgba(0,24,17,.72)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.14)";
  ctx.lineWidth = 2;
  ctx.stroke();

  if (!history.length) {
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.font = "bold 25px sans-serif";
    ctx.fillText("CHƯA CÓ KẾT QUẢ", width / 2, 350);
  } else {
    const visible = history.slice(-40);
    visible.forEach((item, index) => {
      const col = index % 10;
      const row = Math.floor(index / 10);
      const x = 95 + col * 94;
      const y = 198 + row * 88;
      const count = Number(item.redCount);
      const parity = count % 2 === 0 ? "C" : "L";
      ctx.beginPath();
      ctx.arc(x, y, 29, 0, Math.PI * 2);
      ctx.fillStyle = count % 2 === 0 ? "#f2d571" : "#e84646";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.52)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = count % 2 === 0 ? "#17251f" : "#ffffff";
      ctx.textAlign = "center";
      ctx.font = "bold 15px sans-serif";
      ctx.fillText(`${parity} ${count}Đ`, x, y);
    });
  }
  const evenCount = history.filter((item) => Number(item.redCount) % 2 === 0).length;
  const oddCount = history.length - evenCount;
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,.8)";
  ctx.font = "bold 17px sans-serif";
  ctx.fillText(`${history.length} phiên • Chẵn ${evenCount} • Lẻ ${oddCount}`, width / 2, 604);

  await fs.mkdir(path.resolve("./assets/temp"), { recursive: true });
  const imagePath = path.resolve(`./assets/temp/xocdia_soicau_${Date.now()}.png`);
  await fs.writeFile(imagePath, await canvas.toBuffer("image/png"));
  return imagePath;
}

function usage(prefix) {
  return [
    `Cú pháp: ${prefix}xocdia <cửa> <tiền>`,
    `Bàn đang mở: gõ chan 1b, le 1b hoặc tai all (mỗi tin một lượt cược).`,
    `Cược nhiều cửa: gửi thêm lệnh trong cùng phiên; có thể cược thêm cửa đã chọn.`,
    `Cửa thường: chan, le, tai, xiu`,
    `Cửa bộ: 4do, 4trang, 3do, 3trang, 2do2trang, tu`,
    `Ví dụ: ${prefix}xocdia chan 100k`,
    `Soi cầu: ${prefix}xocdia soicau`,
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
      "⏳ XÓC ĐĨA còn 10 giây chốt cược!\n",
      bets.length ? bets.flatMap((bet) => ["• ", { player: bet }, `: ${XOC_DIA_DOORS[bet.door].label} ${formatCurrency(bet.amount)}\n`]) : "Chưa có người cược trong nhóm.\n",
      `\nNhanh tay: ${prefix}xocdia <cửa> <tiền>`,
    ], { threadId: targetThreadId, botId: targetApi.getBotId(), type: meta?.type });
    targetApi.sendMessage({ ...text, ttl: 20_000 }, targetThreadId, meta?.type)
      .then(async (sent) => {
        const warningMessage = await getBettingBotSentReactionTarget(targetApi, { threadId: targetThreadId, type: meta?.type, data: {} }, sent);
        if (!warningMessage?.data?.msgId || !warningMessage?.data?.cliMsgId) return null;
        return startBettingReactionCountdown(targetApi, warningMessage, WARNING_TIME / 1000);
      })
      .catch((error) => console.warn("[xocdia] Gửi cảnh báo lỗi:", error?.message || error));
  }
}

function resultSummary(coins) {
  const redCount = coins.filter((coin) => coin === "red").length;
  const outcome = getXocDiaOutcome(redCount);
  return `${redCount} đỏ • ${outcome.whiteCount} trắng — ${outcome.parity === "chan" ? "CHẴN" : "LẺ"}${outcome.size ? ` • ${outcome.size === "tai" ? "TÀI" : "XỈU"}` : " • TÀI/XỈU HOÀN"}`;
}

async function endXocDiaGame(api, message) {
  const game = activeGames[GLOBAL_GAME_KEY];
  activeGames[GLOBAL_GAME_KEY] = null;
  if (!game) return;
  closeQuickBetTable(game);
  api.addReaction("UNDO", [message]).catch(() => {});

  const coins = chooseXocDiaCoins(game.players, { houseBiasChance: HOUSE_BIAS_CHANCE });
  const redCount = coins.filter((coin) => coin === "red").length;
  await addRecentResult(api, coins).catch((error) => console.error("[xocdia] Lưu lịch sử lỗi:", error));
  const history = await getRecentResults(api).catch(() => [{ redCount, at: Date.now() }]);

  const winners = [];
  const pushes = [];
  const losers = [];
  const settlementErrors = [];
  for (const player of Object.values(game.players)) {
    const state = resolveXocDiaBet(player.door, redCount);
    const door = XOC_DIA_DOORS[player.door];
    try {
      if (state === "win") {
        const returned = player.amount.times(new Big(String(getXocDiaReturnMultiplier(player.door)))).round(0, Big.roundDown);
        const credit = await updatePlayerBalanceByUsername(player.username, returned, true, returned.minus(player.amount).toNumber(), {
          gameName: "Xóc Đĩa",
          gameKey: "xocdia",
          choice: door.label,
          betAmount: player.amount.toNumber(),
          detail: resultSummary(coins),
        });
        if (!credit?.success) throw new Error(credit?.message || "Không thể cộng tiền trả thưởng Xóc Đĩa");
        winners.push([{ player }, ` [${door.label}]: +${formatCurrency(returned.minus(player.amount))}`]);
      } else if (state === "push") {
        const refund = await updatePlayerBalanceByUsername(player.username, player.amount, null, 0, {
          gameName: "Xóc Đĩa",
          gameKey: "xocdia",
          choice: door.label,
          betAmount: player.amount.toNumber(),
          detail: `Hòa - ${resultSummary(coins)}`,
        });
        if (!refund?.success) throw new Error(refund?.message || "Không thể hoàn cược Xóc Đĩa");
        pushes.push([{ player }, ` [${door.label}]: hoàn ${formatCurrency(player.amount)}`]);
      } else {
        await setLoserGameByUsername(player.username, player.amount.neg().toNumber(), {
          gameName: "Xóc Đĩa",
          gameKey: "xocdia",
          choice: door.label,
          betAmount: player.amount.toNumber(),
          detail: resultSummary(coins),
        });
        losers.push([{ player }, ` [${door.label}]: -${formatCurrency(player.amount)}`]);
      }
    } catch (error) {
      settlementErrors.push([{ player }]);
      console.error(`[xocdia] Trả thưởng lỗi cho ${player.username}:`, error);
    }
  }

  const parts = [`🎲 KẾT QUẢ XÓC ĐĨA\n${resultSummary(coins)}\n\n`];
  for (const [title, rows] of [["✅ THẮNG", winners], ["🔄 HOÀN CƯỢC", pushes], ["❌ THUA", losers], ["⚠️ Chưa thể quyết toán", settlementErrors]]) {
    if (rows.length) parts.push(`${title}\n`, rows.flatMap((row) => ["• ", row, "\n"]));
  }

  let imagePath = null;
  try {
    imagePath = await createXocDiaResultImage(coins, history);
    for (const targetThreadId of game.threads) {
      const meta = game.threadMeta[String(targetThreadId)];
      const targetApi = getApiManager(meta?.botId)?.apiZalo || meta?.api || api;
      await targetApi.sendMessage(
        { ...buildGamePlayerMessage(parts, { threadId: targetThreadId, botId: targetApi.getBotId(), type: meta?.type ?? message.type }), attachments: [imagePath], ttl: 60_000, isUseProphylactic: true },
        targetThreadId,
        meta?.type || message.type
      ).catch((error) => console.warn(`[xocdia] Không gửi được kết quả tới ${targetThreadId}:`, error?.message || error));
    }
  } catch (error) {
    console.error("[xocdia] Vẽ/gửi kết quả lỗi:", error);
    for (const targetThreadId of game.threads) {
      const meta = game.threadMeta[String(targetThreadId)];
      const targetApi = getApiManager(meta?.botId)?.apiZalo || meta?.api || api;
      await targetApi.sendMessage({ ...buildGamePlayerMessage(parts, { threadId: targetThreadId, botId: targetApi.getBotId(), type: meta?.type ?? message.type }), ttl: 60_000 }, targetThreadId, meta?.type ?? message.type).catch(() => {});
    }
  } finally {
    if (imagePath) setTimeout(() => fs.unlink(imagePath).catch(() => {}), 60_000);
  }
}

export async function handleXocDiaBet(api, message, groupSettings) {
  return withPlayerBetLock(message.data.uidFrom, () => placeXocDiaBet(api, message, groupSettings));
}

async function placeXocDiaBet(api, message, groupSettings) {
  const quickGame = message.__quickBetGame;
  const isQuickBetClosed = () => quickGame && (activeGames[GLOBAL_GAME_KEY] !== quickGame || Date.now() >= quickGame.expiresAt);
  if (isQuickBetClosed()) return true;
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const prefix = getGlobalPrefix(api.getBotId());
  const escapedPrefix = String(prefix).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const content = normalizeCommandText(rawMessageContent(message));
  const commandPattern = `${escapedPrefix}(?:xocdia|xoc-dia|xoc)`;

  if (new RegExp(`^${commandPattern}\\s+(?:soicau|soi-cau|cau)$`, "i").test(content)) {
    if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return true;
    const history = await getRecentResults(api);
    const imagePath = await createXocDiaSoiCauImage(history);
    try {
      await sendMessageFromSQLImage(api, message, { success: true, message: "🔎 Cầu Xóc Đĩa toàn server" }, false, imagePath);
    } finally {
      await fs.unlink(imagePath).catch(() => {});
    }
    return true;
  }

  // Cho phép đặt nhiều cửa trong cùng một tin: `xocdia 3do 100k le 50k`.
  // Tách thành các lượt nội bộ để mỗi cửa vẫn được ghi nhận và quyết toán độc lập.
  const commandPrefixMatch = content.match(new RegExp(`^${commandPattern}\\s+(.+)$`, "i"));
  if (commandPrefixMatch) {
    const pieces = commandPrefixMatch[1].trim().split(/\\s+/);
    if (pieces.length > 2) {
      const validPairs = pieces.length % 2 === 0 && Array.from({ length: pieces.length / 2 }, (_, index) => {
        const doorPart = normalizeXocDiaDoor(pieces[index * 2]);
        return doorPart && /^(?:[\\d,.]+[kmb]?|allin|all|[\\d,.]+%)$/i.test(pieces[index * 2 + 1]);
      }).every(Boolean);
      if (!validPairs) {
        await sendMessageFromSQL(api, message, { success: false, message: `${usage(prefix)}\\nNhiều cửa: ${prefix}xocdia 3do 100k le 50k` }, true, 15_000);
        return true;
      }
      for (let index = 0; index < pieces.length; index += 2) {
        const synthetic = { ...message, data: { ...message.data, content: `${prefix}xocdia ${pieces[index]} ${pieces[index + 1]}` } };
        await placeXocDiaBet(api, synthetic, groupSettings);
      }
      return true;
    }
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

  const door = normalizeXocDiaDoor(match[1]);
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
    game = {
      players: [],
      threads: new Set(),
      threadMeta: {},
      timeout: null,
      warningTimeout: null,
    };
    game.expiresAt = Date.now() + GAME_DURATION;
    activeGames[GLOBAL_GAME_KEY] = game;
  }

  const groupName = groupSettings?.[threadId]?.nameGroup || String(threadId);
  game.players.push({ ...gameMentionPlayer(api, message), door: door.key, amount: betAmount, name: playerName, username, threadId, groupName });
  game.threads.add(threadId);
  game.threadMeta[String(threadId)] = { botId: api.getBotId(), api, type: message.type };

  registerQuickBetTable(api.getBotId(), threadId, "xocdia", game, normalizeXocDiaDoor);

  if (game.players.length === 1) {
    const startMsg = `🎲 ${playerName} mở phiên XÓC ĐĨA 30 giây\nĐặt ${formatCurrency(betAmount)} vào ${door.label}.\n\n${usage(prefix)}\n\nTỷ lệ: Chẵn/Lẻ/Tài/Xỉu 1:0.95 • 4 màu 1:12 • 3–1 1:2.6 • 2–2 1:1.5 • Tứ 1:6.5`;
    game.warningTimeout = setTimeout(() => sendWarnings(game, prefix), GAME_DURATION - WARNING_TIME);
    game.timeout = setTimeout(() => endXocDiaGame(api, message), GAME_DURATION);
    const sentStart = await sendMessageFromSQL(api, message, { success: true, message: startMsg }, false, GAME_DURATION);
    const clockTarget = await getBettingBotSentReactionTarget(api, message, sentStart);
    if (clockTarget) startBettingReactionCountdown(api, clockTarget, GAME_DURATION / 1000, game.expiresAt);
    else console.warn("[xocdia] Tin mở bàn thiếu msgId/cliMsgId, không thể thả CLOCK");
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
