import { getPlayerBalance, updatePlayerBalanceByUsername, setLoserGameByUsername, getUsernameByIdZalo } from "../../../database/player.js";
import { sendMessageFromSQL, sendMessageFromSQLImage } from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import { Canvas, Path2D, loadImage } from "skia-canvas";
import fs from "fs/promises";
import path from "path";
import { parseGameAmount, formatCurrency } from "../../../utils/format-util.js";
import { checkBeforeJoinGame } from "../index.js";
import { connection } from "../../../database/state.js";
import { getApiManager } from "../../../index.js";
import Big from "big.js";
import { getActiveCanvasStyle } from "../../../utils/canvas/theme.js";
import { renderCollectionStyle } from "../../../utils/canvas/collection-style-renderers.js";
import { createBaccaratTableImage } from "./canvas-table.js";
import { buildGamePlayerMessage, gameMentionPlayer } from "../../../utils/game-mentions.js";
import { withPlayerBetLock } from "../shared/player-bet-lock.js";
import { resolveSentMessageTarget } from "../../../utils/zalo-message-target.js";
import {
  evaluateBaccaratBet,
  getBaccaratDoorLabel,
  getWinningBaccaratDoors,
  isBaccaratNatural,
  normalizeBaccaratDoor,
} from "./rules.js";

const GAME_DURATION = 30000;
const WARNING_TIME = 10000;
const MAX_HISTORY = 90;
const HOUSE_BIAS_CHANCE = 0.6;

// Baccarat dùng một phiên chung cho toàn server (mọi group cùng tham gia).
const GLOBAL_GAME_KEY = "__global__";
const activeGames = { [GLOBAL_GAME_KEY]: null };
const recentResults = new Map();
const activeReactionCountdowns = new Map();
const MAX_COUNTDOWN_REACTIONS = 60;

// Lấy thẳng ID do API trả về lúc bot vừa gửi. cliMsgId này là clientId của
// chính tin Baccarat, không phải cliMsgId của lệnh cược của người chơi.
async function getBotSentReactionTarget(api, sourceMessage, sent) {
  if (!sent) {
    console.warn("[baccarat] getBotSentReactionTarget: sent is", sent);
    return resolveSentMessageTarget(api, sourceMessage, sent);
  }
  const sources = [sent?.message, sent?.message?.data, sent?.data, sent, sent?.attachment?.[0], sent?.attachment?.[0]?.data];
  let msgId = null;
  let cliMsgId = null;
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    // Một số response giữ `msgId` của tin quote, còn `msgIds[0]` mới là tin
    // bot vừa gửi. Phải ưu tiên mảng này để CLOCK không bám nhầm tin cũ.
    msgId ||= source.msgIds?.[0] || source.messageIds?.[0] || source.msgId || source.globalMsgId || source.messageId || null;
    cliMsgId ||= source.cliMsgId || source.clientId || source.clientMsgId || null;
  }
  console.error(`[baccarat] getBotSentReactionTarget: msgId=${msgId} cliMsgId=${cliMsgId}`);
  if (msgId && cliMsgId) {
    return {
      type: sourceMessage.type,
      threadId: sourceMessage.threadId,
      data: {
        msgId: String(msgId),
        cliMsgId: String(cliMsgId),
        uidFrom: String(api.getBotId()),
      },
    };
  }
  // Chỉ dùng đọc lại nhóm khi API không trả identity tin bot.
  console.warn("[baccarat] Thiếu msgId/cliMsgId từ response, dùng fallback đọc lại nhóm");
  return resolveSentMessageTarget(api, sourceMessage, sent);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stopBaccaratReactionCountdown(api, threadId) {
  const key = String(threadId || "");
  const current = activeReactionCountdowns.get(key);
  if (!current) return;
  current.cancelled = true;
  activeReactionCountdowns.delete(key);
  const target = current.batch?.length ? [...current.batch] : current.message;
  void api.addReaction("UNDO", target).catch(() => {});
}

// Zalo hiển thị chữ số trên CLOCK theo số phần tử trùng trong rMsg. Countdown
// Baccarat giữ batch riêng theo từng group để không bị countdown lệnh khác ghi đè.
function startBaccaratReactionCountdown(api, message, seconds, endsAt = null) {
  if (!message || !seconds) return;
  const key = String(message.threadId || "");
  stopBaccaratReactionCountdown(api, key);
  const deadline = endsAt || Date.now() + seconds * 1000;
  const state = { cancelled: false, message, batch: null };
  activeReactionCountdowns.set(key, state);

  void (async () => {
    try {
      await sleep(300);
      while (!state.cancelled) {
        const remaining = Math.ceil((deadline - Date.now()) / 1000);
        if (remaining <= 0) break;
        const batch = Array(Math.min(remaining, MAX_COUNTDOWN_REACTIONS)).fill(message);
        state.batch = batch;
        try {
          if (remaining === seconds) {
            console.error(`[baccarat] CLOCK request msgId=${message.data?.msgId} cliMsgId=${message.data?.cliMsgId} batch=${batch.length}`);
          }
          const reactionResult = await Promise.race([
            api.addReaction("CLOCK", batch),
            sleep(3_000).then(() => { throw new Error("CLOCK request timed out"); }),
          ]);
          if (remaining === seconds) console.error(`[baccarat] CLOCK response=${JSON.stringify(reactionResult)}`);
        } catch (tickError) {
          console.warn("[baccarat] CLOCK tick lỗi (tiếp tục):", tickError?.message || tickError);
        }
        await sleep(1000);
        if (state.cancelled) break;
        try {
          await api.addReaction("UNDO", batch);
        } catch (_) { /* bỏ qua lỗi UNDO */ }
        state.batch = null;
      }
    } catch (error) {
      console.error("[baccarat] Countdown reaction lỗi:", error?.message || error);
    } finally {
      if (activeReactionCountdowns.get(key) === state) {
        activeReactionCountdowns.delete(key);
        if (state.batch) await api.addReaction("UNDO", state.batch).catch(() => {});
      }
    }
  })();
}

// sendMessage có thể trả về trực tiếp Message hoặc wrapper { message, ... }.
// Countdown reaction cần đúng ID của tin vừa gửi, không phải tin lệnh cược.
function historyKey(api, threadId) {
  return `${api.getBotId()}_global`;
}

async function addRecentResult(api, threadId, door) {
  const key = historyKey(api, threadId);
  const history = recentResults.get(key) || [];
  history.push({ door, at: Date.now() });
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  recentResults.set(key, history);
  if (!connection) return;
  const collection = connection.collection("baccarat_history");
  await collection.insertOne({ key, botId: String(api.getBotId()), threadId: String(threadId), door, createdAt: new Date() });
  const stale = await collection.find({ key }, { projection: { _id: 1 } }).sort({ createdAt: -1 }).skip(MAX_HISTORY).toArray();
  if (stale.length) await collection.deleteMany({ _id: { $in: stale.map((item) => item._id) } });
}

async function getRecentResults(api, threadId) {
  const key = historyKey(api, threadId);
  if (connection) {
    const rows = await connection.collection("baccarat_history").find({ key }).sort({ createdAt: -1 }).limit(MAX_HISTORY).toArray();
    if (rows.length) {
      const history = rows.reverse().map((item) => ({ door: item.door, at: new Date(item.createdAt).getTime() }));
      recentResults.set(key, history);
      return history;
    }
  }
  return recentResults.get(key) || [];
}

function getSoiCauStats(history) {
  if (!history.length) return null;

  const name = { con: "CON", "cái": "CÁI", "hòa": "HÒA" };
  const counts = history.reduce((result, item) => {
    result[item.door] += 1;
    return result;
  }, { con: 0, "cái": 0, "hòa": 0 });
  const latest = history[history.length - 1].door;
  let streak = 0;
  for (let index = history.length - 1; index >= 0 && history[index].door === latest; index--) streak += 1;
  const percent = (value) => `${((value / history.length) * 100).toFixed(1).replace(".0", "")}%`;
  return { counts, latest, streak, name, percent };
}

export async function createSoiCauCanvas(history, groupName = "Nhóm Baccarat") {
  const activeStyle = getActiveCanvasStyle();
  if (activeStyle !== 1) {
    const stats = getSoiCauStats(history);
    const recent = history.slice(-16).reverse();
    return renderCollectionStyle(activeStyle, {
      kicker: "MYBOT • BACCARAT ANALYTICS",
      title: "SOI CẦU BACCARAT",
      subtitle: `${groupName} • ${history.length} ván • ${stats ? `Bệt ${stats.name[stats.latest]} ${stats.streak}` : "Chưa có dữ liệu"}`,
      footer: stats ? `Con ${stats.counts.con} • Cái ${stats.counts["cái"]} • Hòa ${stats.counts["hòa"]}` : "Dữ liệu chỉ mang tính tham khảo",
      items: recent.map((item, index) => ({
        title: stats?.name[item.door] || String(item.door).toUpperCase(),
        subtitle: item.at ? new Date(item.at).toLocaleString("vi-VN") : "Phiên Baccarat",
        meta: item.door === "con" ? "PLAYER" : item.door === "cái" ? "BANKER" : "TIE",
        badge: String(history.length - index).padStart(2, "0"),
      })),
    }, "baccarat_soicau");
  }
  const width = 1026, height = 594;
  const canvas = new Canvas(width, height);
  const ctx = canvas.getContext("2d");
  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#1b2224"); background.addColorStop(1, "#05090a");
  ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);

  const panel = (x, y, w, h, radius = 22) => {
    const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
    gradient.addColorStop(0, "#111719"); gradient.addColorStop(1, "#050809");
    ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fillStyle = gradient; ctx.fill();
    ctx.strokeStyle = "#354044"; ctx.lineWidth = 1.4; ctx.stroke();
  };
  const fitText = (text, maxWidth, startSize) => {
    let size = startSize;
    do { ctx.font = `bold ${size}px sans-serif`; size -= 1; } while (ctx.measureText(text).width > maxWidth && size > 15);
  };
  const colors = { con: "#278dff", "cái": "#ff4963", "hòa": "#43d5aa" };
  const stats = getSoiCauStats(history);

  panel(26, 26, 974, 100, 22);
  ctx.textAlign = "left"; ctx.fillStyle = "#f6f3ed"; ctx.font = "bold 37px sans-serif";
  ctx.fillText("SOI CẦU BACCARAT", 52, 82);
  const safeGroupName = String(groupName || "Nhóm Baccarat").trim();
  fitText(`⚜  ${safeGroupName}  ⚜  · ${history.length} v`, 700, 20);
  ctx.fillStyle = "#aaa9a7"; ctx.fillText(`⚜  ${safeGroupName}  ⚜  · ${history.length} v`, 53, 108);

  panel(811, 42, 169, 69, 14);
  const latest = stats?.latest || null;
  const latestColor = latest ? colors[latest] : "#697276";
  ctx.shadowColor = latestColor; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(843, 76, 14, 0, Math.PI * 2);
  ctx.strokeStyle = latestColor; ctx.lineWidth = 5; ctx.stroke(); ctx.shadowBlur = 0;
  ctx.textAlign = "left"; ctx.fillStyle = "#9e9899"; ctx.font = "bold 13px sans-serif"; ctx.fillText("ĐANG RA", 869, 70);
  ctx.fillStyle = latestColor; ctx.font = "bold 22px sans-serif";
  ctx.fillText(latest ? `${stats.name[latest][0]}${stats.name[latest].slice(1).toLowerCase()} · bệt ${stats.streak}` : "Chưa có", 869, 96);

  panel(26, 142, 974, 350, 22);
  const roadX = 70, roadY = 187, gapX = 52, gapY = 52, roadCols = 18, roadRows = 6;
  for (let colIndex = 0; colIndex < roadCols; colIndex++) {
    for (let rowIndex = 0; rowIndex < roadRows; rowIndex++) {
      ctx.beginPath(); ctx.arc(roadX + colIndex * gapX, roadY + rowIndex * gapY, 14, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(55,62,65,.19)"; ctx.fill();
    }
  }

  if (!history.length) {
    ctx.textAlign = "center"; ctx.fillStyle = "#777f82"; ctx.font = "bold 24px sans-serif";
    ctx.fillText("Chưa có kết quả Baccarat trong nhóm này", width / 2, 330);
  } else {
    const placements = []; let col = -1, row = 0, lastDoor = null, lastPlacement = null, pendingTies = 0;
    for (const item of history) {
      if (item.door === "hòa") {
        if (lastPlacement) lastPlacement.ties = (lastPlacement.ties || 0) + 1;
        else pendingTies += 1;
        continue;
      }
      if (item.door !== lastDoor) { col += 1; row = 0; lastDoor = item.door; }
      else if (row < roadRows - 1) row += 1;
      else col += 1;
      lastPlacement = { col, row, door: item.door, ties: pendingTies };
      pendingTies = 0;
      placements.push(lastPlacement);
    }
    const visibleOffset = Math.max(0, Math.max(0, ...placements.map((item) => item.col)) - roadCols + 1);
    placements.forEach((item) => {
      const visibleCol = item.col - visibleOffset;
      if (visibleCol < 0 || visibleCol >= roadCols) return;
      const x = roadX + visibleCol * gapX, y = roadY + item.row * gapY;
      ctx.shadowColor = colors[item.door]; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(x, y, 17, 0, Math.PI * 2); ctx.strokeStyle = colors[item.door]; ctx.lineWidth = 5; ctx.stroke();
      ctx.shadowBlur = 0;
      if (item.ties) {
        ctx.save();
        ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.clip();
        ctx.strokeStyle = colors["hòa"]; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(x - 12, y + 12); ctx.lineTo(x + 12, y - 12); ctx.stroke();
        ctx.restore();
        if (item.ties > 1) {
          ctx.textAlign = "center"; ctx.fillStyle = "#f2f4f3"; ctx.font = "bold 13px sans-serif";
          ctx.fillText(String(item.ties), x, y + 5);
        }
      }
    });
  }

  panel(26, 508, 974, 60, 17);
  const summary = [
    { x: 304, door: "con", label: "Con" },
    { x: 474, door: "cái", label: "Cái" },
    { x: 634, door: "hòa", label: "Hòa" },
  ];
  summary.forEach(({ x, door, label }) => {
    ctx.beginPath(); ctx.arc(x, 538, 11, 0, Math.PI * 2); ctx.strokeStyle = colors[door]; ctx.lineWidth = 4; ctx.stroke();
    if (door === "hòa") { ctx.beginPath(); ctx.moveTo(x - 7, 545); ctx.lineTo(x + 7, 531); ctx.stroke(); }
    ctx.textAlign = "left"; ctx.fillStyle = "#eeeae5"; ctx.font = "bold 22px sans-serif"; ctx.fillText(label, x + 23, 546);
    ctx.fillStyle = colors[door]; ctx.fillText(String(stats?.counts?.[door] || 0), x + 80, 546);
  });
  const imagePath = path.resolve(`./assets/temp/baccarat_soicau_${Date.now()}.png`);
  await fs.writeFile(imagePath, await canvas.toBuffer("image/png"));
  return imagePath;
}

function getCardValue(rank) {
  if (['10', 'J', 'Q', 'K'].includes(rank)) return 0;
  if (rank === 'A') return 1;
  return parseInt(rank);
}

function createBaccaratShoe(deckCount = 8) {
  const suits = ['♠', '♣', '♥', '♦'];
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const shoe = [];
  for (let deck = 0; deck < deckCount; deck += 1) {
    for (const suit of suits) {
      for (const rank of ranks) shoe.push({ suit, rank, value: getCardValue(rank), str: `${rank}${suit}` });
    }
  }
  return shoe;
}

function drawRandomCard(shoe) {
  const index = Math.floor(Math.random() * shoe.length);
  return shoe.splice(index, 1)[0];
}

function calculateScore(cards) {
  return cards.reduce((sum, card) => sum + card.value, 0) % 10;
}

function dealBaccaratHand() {
  const shoe = createBaccaratShoe();
  const player = [drawRandomCard(shoe)];
  const banker = [drawRandomCard(shoe)];
  player.push(drawRandomCard(shoe));
  banker.push(drawRandomCard(shoe));
  let pScore = calculateScore(player), bScore = calculateScore(banker), p3 = null;

  if (pScore < 8 && bScore < 8) {
    let playerDrew = false;
    if (pScore <= 5) {
      p3 = drawRandomCard(shoe); player.push(p3); pScore = calculateScore(player); playerDrew = true;
    }
    if (!playerDrew) {
      if (bScore <= 5) { banker.push(drawRandomCard(shoe)); bScore = calculateScore(banker); }
    } else {
      const bDraw = bScore <= 2 ||
        (bScore === 3 && p3.value !== 8) ||
        (bScore === 4 && [2, 3, 4, 5, 6, 7].includes(p3.value)) ||
        (bScore === 5 && [4, 5, 6, 7].includes(p3.value)) ||
        (bScore === 6 && [6, 7].includes(p3.value));
      if (bDraw) { banker.push(drawRandomCard(shoe)); bScore = calculateScore(banker); }
    }
  }
  const resultDoor = pScore > bScore ? "con" : bScore > pScore ? "cái" : "hòa";
  return { player, banker, pScore, bScore, resultDoor };
}

function dealBaccaratForBets(players = {}) {
  let selected = dealBaccaratHand();
  const bets = Object.values(players || {});
  if (!bets.length || Math.random() >= HOUSE_BIAS_CHANCE) return selected;
  let minimum = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const candidate = attempt ? dealBaccaratHand() : selected;
    const liability = bets.reduce((sum, bet) => sum.plus(bet.amount.times(evaluateBaccaratBet(bet.door, candidate).totalMultiplier)), new Big(0));
    if (minimum === null || liability.lt(minimum)) { minimum = liability; selected = candidate; }
  }
  return selected;
}

function baccaratHelp(prefix) {
  return [
    "👉 Lệnh đặt cửa cược:",
    `- ${prefix}bcr con <tiền> — Tay con`,
    `- ${prefix}bcr cái <tiền> — Nhà cái`,
    `- ${prefix}bcr hòa <tiền> — Hòa`,
    `- ${prefix}bcr con đôi <tiền> — hai lá đầu Tay con cùng hạng`,
    `- ${prefix}bcr cái đôi <tiền> — hai lá đầu Nhà cái cùng hạng`,
    `- ${prefix}bcr long con <tiền> — Long bảo Tay con`,
    `- ${prefix}bcr long cái <tiền> — Long bảo Nhà cái`,
    "",
    "📊 Trả thưởng: Con 1:1 • Cái 1:0.95 • Hòa 1:8",
    "Đôi 1:11 • Long bảo 1:1 đến 1:30",
  ].join("\n");
}

export async function handleBaccaratBet(api, message, groupSettings) {
  return withPlayerBetLock(message.data.uidFrom, () => placeBaccaratBet(api, message, groupSettings));
}

async function placeBaccaratBet(api, message, groupSettings) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  console.error(`[baccarat] received thread=${threadId} sender=${senderId}`);
  // Chuẩn hóa dấu để cả "cái/hòa" dạng Unicode dựng sẵn và dạng dấu tổ hợp
  // (thường do bàn phím/Zalo gửi lên) đều được nhận như nhau.
  const content = String(message.data.content || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const prefix = getGlobalPrefix(api.getBotId());
  const escapedPrefix = String(prefix).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const isSoiCau = new RegExp(`^${escapedPrefix}(?:bcr|bac|baccarat)\\s+(?:soicau|soi-cau|cau)$`, "i").test(content);
  if (isSoiCau) {
    if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return true;
    const history = await getRecentResults(api, threadId);
    const groupName = "Baccarat toàn server";
    const imagePath = await createSoiCauCanvas(history, groupName);
    try {
      await sendMessageFromSQLImage(api, message, { success: true, message: "🔎 Cầu Baccarat gần đây" }, false, imagePath);
    } finally {
      await fs.unlink(imagePath).catch(() => {});
    }
    return true;
  }
  const match = content.match(new RegExp(`^${escapedPrefix}(?:bcr|bac|baccarat)\\s+(.+?)\\s+([\\d,.]+[kmb]?|allin|all|[\\d,.]+%)$`, "i"));
  
  if (!match) {
    // Nếu dùng lệnh sai cú pháp (!bcr) thì trả về false để hiển thị thông báo
    if ([`${prefix}bcr`, `${prefix}bac`, `${prefix}baccarat`].some((command) => content.startsWith(command))) {
       await sendMessageFromSQL(api, message, { success: false, message: `Lệnh cược không hợp lệ.\nSử dụng: ${prefix}bcr <con/cái/hòa/con đôi/cái đôi/long con/long cái> <số tiền>` }, true, 10000);
       return true;
    }
    return false;
  }

  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return true;

  const betDoor = normalizeBaccaratDoor(match[1]);
  if (!betDoor) {
    await sendMessageFromSQL(api, message, { success: false, message: `Không nhận ra cửa cược "${match[1]}".` }, true, 10000);
    return true;
  }

  // Xác nhận riêng cho Baccarat bằng icon :v ("CƯỜI GƯỢNG" của Zalo).
  // Đây là reaction có sẵn của Zalo; ảnh JPG bên ngoài không thể dùng làm
  // reaction tùy biến qua API.
  void api.addReaction("CƯỜI GƯỢNG", [message]).catch((error) => {
    console.warn("[baccarat] Không thể thả reaction :v:", error?.message || error);
  });
  
  const amountStr = match[2];

  const username = await getUsernameByIdZalo(senderId);
  if (!username) {
    await sendMessageFromSQL(api, message, { success: false, message: "Không thể lấy hồ sơ." }, true, 10000);
    return true;
  }

  const balanceResult = await getPlayerBalance(senderId);
  if (!balanceResult.success) {
    await sendMessageFromSQL(api, message, { success: false, message: "Lỗi kiểm tra số dư." }, true, 10000);
    return true;
  }

  let betAmount;
  try {
    const parsedAmount = parseGameAmount(amountStr, balanceResult.balance);
    betAmount = parsedAmount === "allin" ? new Big(balanceResult.balance) : parsedAmount;
    if (betAmount.lt(1000)) throw new Error("Cược tối thiểu 1,000 VNĐ");
  } catch (err) {
    await sendMessageFromSQL(api, message, { success: false, message: err.message }, true, 10000);
    return true;
  }

  if (betAmount.gt(balanceResult.balance)) {
    await sendMessageFromSQL(api, message, { success: false, message: `Số dư không đủ. Bạn có ${formatCurrency(new Big(balanceResult.balance))} VNĐ` }, true, 10000);
    return true;
  }

  const playerName = message.data.dName || senderId;
  const betKey = `${senderId}:${betDoor}`;
  
  // Trừ tiền ngay
  const debit = await updatePlayerBalanceByUsername(username, betAmount.neg());
  if (!debit?.success) {
    await sendMessageFromSQL(api, message, { success: false, message: debit?.message || "Không thể trừ tiền cược. Vui lòng thử lại." }, true, 10000);
    return true;
  }

  const gameKey = GLOBAL_GAME_KEY;
  if (!activeGames[gameKey]) {
    console.error(`[baccarat] opening round thread=${threadId}`);
    // Bắt đầu game mới
    activeGames[gameKey] = {
      players: {},
      threads: new Set(),
      timeout: null,
      warningTimeout: null,
      endsAt: Date.now() + GAME_DURATION,
    };
    activeGames[gameKey].threads.add(threadId);
    activeGames[gameKey].threadBots = { [String(threadId)]: api.getBotId() };
    const groupName = groupSettings?.[threadId]?.nameGroup || String(threadId);
    activeGames[gameKey].players[betKey] = { ...gameMentionPlayer(api, message), uid: senderId, door: betDoor, amount: betAmount, name: playerName, username, threadId, groupName, botId: api.getBotId() };

    const startMsg = `⚜️ ThuHoa Bot Team ⚜️\n🎴 ${playerName} mở ván Baccarat 30 giây và đặt ${formatCurrency(betAmount)} vào ${getBaccaratDoorLabel(betDoor)}.\n\n${baccaratHelp(prefix)}`;
    
    const sentStart = await sendMessageFromSQL(api, message, { success: true, message: startMsg }, false, GAME_DURATION);
    console.error(`[baccarat] send table response=${JSON.stringify(sentStart)}`);
    const startCountdownMessage = await getBotSentReactionTarget(api, message, sentStart);
    if (startCountdownMessage) {
      startBaccaratReactionCountdown(api, startCountdownMessage, GAME_DURATION / 1000, activeGames[gameKey].endsAt);
    } else {
      console.warn("[baccarat] Tin mở bàn thiếu msgId/cliMsgId, không thể thả CLOCK");
    }

    // Cài đặt cảnh báo 10s
    activeGames[gameKey].warningTimeout = setTimeout(() => {
      if (!activeGames[gameKey]) return;
      const betsByDoor = new Map();
      const currentGroup = groupName;
      const otherGroups = new Map();
      for (const p of Object.values(activeGames[gameKey].players)) {
        const line = `${p.name}: ${formatCurrency(p.amount)}`;
        if (p.groupName !== currentGroup) {
          if (!otherGroups.has(p.groupName)) otherGroups.set(p.groupName, []);
          otherGroups.get(p.groupName).push(`- ${line} cửa ${getBaccaratDoorLabel(p.door)}`);
          continue;
        }
        if (!betsByDoor.has(p.door)) betsByDoor.set(p.door, []);
        betsByDoor.get(p.door).push([{ player: p }, `: ${formatCurrency(p.amount)}`]);
      }
      
      const otherSession = [...otherGroups.entries()]
        .map(([groupName, players]) => `\n📌 Phiên khác: ${groupName}\n${players.join("\n")}`)
        .join("");
      const betSummary = [...betsByDoor.entries()]
        .flatMap(([door, names]) => [`${getBaccaratDoorLabel(door)}: `, names.flatMap((name, index) => [index ? ", " : "", name]), "\n"]);
      const warning = buildGamePlayerMessage([
        "⚜️ ThuHoa Bot Team ⚜️\n⏳ BACCARAT còn 10 giây nữa là chốt cược!\n",
        betSummary.length ? betSummary : "Nhóm này chưa có cược.", otherSession,
        `\n\n${baccaratHelp(prefix)}`,
      ], { threadId, botId: api.getBotId(), type: message.type });
      
      api.sendMessage({ ...warning, ttl: 20000 }, message.threadId, message.type)
        .then(async (sentWarning) => {
          // sendMessage trả về wrapper { message, attachment, link }. Tạo đúng
          // shape Message mà addReaction cần, nhưng giữ ID của TIN CẢNH BÁO.
          const warningMessage = await getBotSentReactionTarget(api, message, sentWarning);

          if (!warningMessage?.data?.msgId || !warningMessage?.data?.cliMsgId) {
            console.warn("[baccarat] Tin cảnh báo thiếu msgId/cliMsgId, bỏ qua countdown reaction");
            return;
          }

          startBaccaratReactionCountdown(api, warningMessage, WARNING_TIME / 1000, activeGames[gameKey]?.endsAt || (Date.now() + WARNING_TIME));
        })
        .catch((error) => {
          console.warn("[baccarat] Gửi cảnh báo/countdown reaction lỗi:", error?.message || error);
        });
    }, Math.max(0, activeGames[gameKey].endsAt - Date.now() - WARNING_TIME));

    // Cài đặt chốt kết quả
    activeGames[gameKey].timeout = setTimeout(() => {
      endBaccaratGame(api, message);
    }, Math.max(0, activeGames[gameKey].endsAt - Date.now()));

  } else {
    console.error(`[baccarat] joining active round thread=${threadId}`);
    const game = activeGames[gameKey];
    if (game.players[betKey]) {
      // Hoàn tiền và báo lỗi nếu đã cược
      await updatePlayerBalanceByUsername(username, betAmount);
      await sendMessageFromSQL(api, message, { success: false, message: `Bạn đã cược cửa ${getBaccaratDoorLabel(betDoor)} trong ván này rồi!` }, true, 10000);
      return true;
    }
    
    game.threads.add(threadId);
    game.threadBots[String(threadId)] = api.getBotId();
    const groupName = groupSettings?.[threadId]?.nameGroup || String(threadId);
    game.players[betKey] = { ...gameMentionPlayer(api, message), uid: senderId, door: betDoor, amount: betAmount, name: playerName, username, threadId, groupName, botId: api.getBotId() };
    
    const text = buildGamePlayerMessage([
      `⚜️ ThuHoa Bot Team ⚜️\n✅ Đặt ${formatCurrency(betAmount)} cửa ${getBaccaratDoorLabel(betDoor)}.\n👥 Cùng phiên toàn server: `,
      Object.values(game.players).flatMap((player, index) => [index ? ", " : "", { player }, ` (${getBaccaratDoorLabel(player.door)}) [${player.groupName}]`]),
    ], { threadId, botId: api.getBotId(), type: message.type });
    const sentBet = await sendMessageFromSQL(api, message, { success: true, message: text.msg, mentions: text.mentions }, true, 15000);
    const betCountdownMessage = await getBotSentReactionTarget(api, message, sentBet);
    const remaining = Math.max(0, Math.ceil((game.endsAt - Date.now()) / 1000));
    if (betCountdownMessage && remaining > 0) {
      // Phiên toàn server có thể đã được mở ở group khác. Bám countdown vào
      // chính tin xác nhận mới nhất ở group hiện tại để người chơi vẫn thấy.
      startBaccaratReactionCountdown(api, betCountdownMessage, remaining, game.endsAt);
    }
  }

  return true;
}

async function endBaccaratGame(api, message) {
  const game = activeGames[GLOBAL_GAME_KEY];
  activeGames[GLOBAL_GAME_KEY] = null;
  if (!game) return;
  api.addReaction("UNDO", [message]).catch(() => {});

  const deal = dealBaccaratForBets(game.players);
  const { player, banker, pScore, bScore, resultDoor } = deal;
  await addRecentResult(api, GLOBAL_GAME_KEY, resultDoor).catch((error) => console.error("Lỗi lưu cầu Baccarat:", error));

  const natural = isBaccaratNatural(deal);
  const winningDoors = getWinningBaccaratDoors(deal);
  const winnerLabel = getBaccaratDoorLabel(resultDoor);
  let resultMsg = `🎴 KẾT QUẢ BACCARAT\n`;
  resultMsg += `Tay con: ${pScore} điểm | Nhà cái: ${bScore} điểm\n`;
  resultMsg += `➡️ ${winnerLabel} ${resultDoor === "hòa" ? "KẾT QUẢ HÒA" : "THẮNG"}${natural ? " • thắng tự nhiên" : ""}\n`;
  const sideWins = winningDoors.filter((door) => !["con", "cái", "hòa"].includes(door));
  if (sideWins.length) resultMsg += `✨ Cửa phụ trúng: ${sideWins.map(getBaccaratDoorLabel).join(", ")}\n`;
  resultMsg += "\n";

  const winners = [];
  const pushes = [];
  const losers = [];
  const settlementErrors = [];

  for (const p of Object.values(game.players)) {
    const resolution = evaluateBaccaratBet(p.door, deal);
    const doorLabel = getBaccaratDoorLabel(p.door);
    if (resolution.outcome === "win") {
      const payout = p.amount.times(resolution.totalMultiplier);
      const profit = payout.minus(p.amount);
      const credit = await updatePlayerBalanceByUsername(p.username, payout, true, profit.toNumber(), {
        gameName: "Baccarat",
        gameKey: "bcr",
        choice: doorLabel,
        betAmount: p.amount.toNumber(),
        detail: `P ${pScore} - B ${bScore}`,
      });
      if (!credit?.success) {
        settlementErrors.push([{ player: p }, ` (${doorLabel})`]);
        console.error(`[baccarat] Trả thưởng lỗi cho ${p.username}: ${credit?.message || "không rõ lỗi"}`);
        continue;
      }
      winners.push([{ player: p }, ` (${doorLabel}): thắng +${formatCurrency(profit)}`]);
    } else if (resolution.outcome === "push") {
      const refund = await updatePlayerBalanceByUsername(p.username, p.amount, null, 0, {
        gameName: "Baccarat",
        gameKey: "bcr",
        choice: doorLabel,
        betAmount: p.amount.toNumber(),
        detail: `Hòa (P ${pScore} - B ${bScore})`,
      });
      if (!refund?.success) {
        settlementErrors.push([{ player: p }, ` (${doorLabel})`]);
        console.error(`[baccarat] Hoàn cược lỗi cho ${p.username}: ${refund?.message || "không rõ lỗi"}`);
        continue;
      }
      pushes.push([{ player: p }, ` (${doorLabel}): hoàn ${formatCurrency(p.amount)}`]);
    } else {
      await setLoserGameByUsername(p.username, p.amount.neg().toNumber(), {
        gameName: "Baccarat",
        gameKey: "bcr",
        choice: doorLabel,
        betAmount: p.amount.toNumber(),
        detail: `P ${pScore} - B ${bScore}`,
      });
      losers.push([{ player: p }, ` (${doorLabel}): thua -${formatCurrency(p.amount)}`]);
    }
  }

  const resultParts = [resultMsg];
  for (const [title, rows] of [["✅ Thắng:", winners], ["🔄 Hòa — hoàn cửa chính:", pushes], ["❌ Thua:", losers], ["⚠️ Chưa thể quyết toán:", settlementErrors]]) {
    if (rows.length) resultParts.push(`${title}\n`, rows.flatMap((row) => ["- ", row, "\n"]));
  }
  
  if (!winners.length && !pushes.length && !losers.length) resultParts.push("Không có ai tham gia.");

  // Giao diện bàn Baccarat dọc theo phong cách live casino.
  // Nếu renderer mới gặp lỗi tài nguyên, tiếp tục dùng canvas cũ ở bên dưới.
  {
    let modernImagePath = null;
    try {
      const history = await getRecentResults(api, GLOBAL_GAME_KEY).catch(() => []);
      modernImagePath = await createBaccaratTableImage({
        player,
        banker,
        pScore,
        bScore,
        resultDoor,
        natural,
        winningDoors,
        history,
      });

      const groupsByThread = new Map();
      for (const playerEntry of Object.values(game.players)) {
        groupsByThread.set(String(playerEntry.threadId), playerEntry.groupName);
      }

      const messageForThread = (threadId) => {
        const currentGroup = groupsByThread.get(String(threadId));
        const otherPlayers = Object.values(game.players).filter(
          (playerEntry) => playerEntry.groupName && playerEntry.groupName !== currentGroup
        );
        if (!otherPlayers.length) return resultParts;
        const grouped = new Map();
        for (const playerEntry of otherPlayers) {
          if (!grouped.has(playerEntry.groupName)) grouped.set(playerEntry.groupName, []);
          const door = getBaccaratDoorLabel(playerEntry.door);
          grouped.get(playerEntry.groupName).push(
            `- ${playerEntry.name}: ${formatCurrency(playerEntry.amount)} cửa ${door}`
          );
        }
        const otherSession = [...grouped.entries()]
          .map(([groupName, players]) => `📌 Phiên khác: ${groupName}\n${players.join("\n")}`)
          .join("\n");
        return [resultParts, "\n", otherSession];
      };

      for (const targetThreadId of game.threads || [message.threadId]) {
        const targetApi = getApiManager(game.threadBots?.[String(targetThreadId)])?.apiZalo || api;
        await targetApi.sendMessage({
          ...buildGamePlayerMessage(messageForThread(targetThreadId), { threadId: targetThreadId, botId: targetApi.getBotId(), type: message.type }),
          attachments: [modernImagePath],
          ttl: 60000,
          isUseProphylactic: true,
        }, targetThreadId, message.type).catch((error) => {
          console.error(`[BACCARAT] Không thể gửi kết quả tới nhóm ${targetThreadId}:`, error);
        });
      }

      setTimeout(() => fs.unlink(modernImagePath).catch(() => {}), 60000);
      return;
    } catch (error) {
      if (modernImagePath) await fs.unlink(modernImagePath).catch(() => {});
      console.warn("[BACCARAT] Canvas live casino lỗi, chuyển sang giao diện dự phòng:", error);
    }
  }

  // Canvas dự phòng
  const imagePath = path.resolve(`./assets/temp/baccarat_result_${Date.now()}.png`);
  try {
    const canvas = new Canvas(900, 600);
    const ctx = canvas.getContext("2d");

    // Nền Đỏ Đậm (rất tối)
    ctx.fillStyle = "#1e0a0d";
    ctx.fillRect(0, 0, 900, 600);
    
    // Viền Vàng + Viền Đỏ
    ctx.strokeStyle = "#cda45e"; // Vàng
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, 880, 580);
    ctx.strokeStyle = "#802020"; // Đỏ
    ctx.lineWidth = 1.5;
    ctx.strokeRect(15, 15, 870, 570);

    // Tiêu đề
    ctx.fillStyle = "#cda45e";
    ctx.font = "bold 32px sans-serif";
    ctx.textAlign = "center";
    ctx.letterSpacing = "5px";
    ctx.fillText("B A C C A R A T", 450, 55);

    // C O N / C Á I
    ctx.font = "bold 45px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("C O N", 250, 130);
    ctx.fillStyle = "#cda45e";
    ctx.fillText("C Á I", 650, 130);

    // Đường line gạch đứt chia đôi
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 12]);
    ctx.beginPath();
    ctx.moveTo(450, 100);
    ctx.lineTo(450, 520);
    ctx.stroke();
    ctx.setLineDash([]); // Reset

    // Hàm tạo viền bo tròn
    function roundedRectPath(x, y, width, height, radius) {
      let p = new Path2D();
      p.moveTo(x + radius, y);
      p.arcTo(x + width, y, x + width, y + height, radius);
      p.arcTo(x + width, y + height, x, y + height, radius);
      p.arcTo(x, y + height, x, y, radius);
      p.arcTo(x, y, x + width, y, radius);
      p.closePath();
      return p;
    }

    // Hàm vẽ Card (Sử dụng ảnh png bài thật)
    const drawCard = async (card, x, y) => {
      ctx.save();
      ctx.translate(x, y);
      
      // Bóng đổ nhẹ
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;

      // Vẽ nền trắng bo tròn
      ctx.fillStyle = "#FFFFFF";
      ctx.fill(roundedRectPath(0, 0, 110, 160, 6));

      // Viền nhẹ cho bài
      ctx.strokeStyle = "#DDDDDD";
      ctx.lineWidth = 1;
      ctx.stroke(roundedRectPath(0, 0, 110, 160, 6));

      // Reset bóng đổ để ảnh PNG không bị đổ bóng lần 2
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // Map tên file
      const rankMap = { 'A': 'ace', 'J': 'jack', 'Q': 'queen', 'K': 'king' };
      const rankName = rankMap[card.rank] || card.rank;
      const suitMap = { '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs', '♠': 'spades' };
      const suitName = suitMap[card.suit];
      
      const cardImgPath = path.resolve(`./assets/data/cards/png/${rankName}_of_${suitName}.png`);
      
      try {
        const cardImg = await loadImage(cardImgPath);
        ctx.drawImage(cardImg, 0, 0, 110, 160);
      } catch (err) {
        // Fallback vẽ tay nếu lỗi load ảnh
        const isRed = (card.suit === '♥' || card.suit === '♦');
        ctx.fillStyle = isRed ? "#e51f28" : "#000000";
        ctx.font = "bold 24px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(card.rank, 10, 30);
        ctx.font = "20px sans-serif";
        ctx.fillText(card.suit, 10, 52);
        ctx.font = "55px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(card.suit, 55, 95);
      }
      
      ctx.restore();
    };

    // Vẽ bài Player (CON) - Căn giữa cụm bài
    let pWidth = player.length * 110 + (player.length - 1) * 15;
    let pStartX = 250 - pWidth / 2;
    for (let i = 0; i < player.length; i++) {
      await drawCard(player[i], pStartX + (i * 125), 160);
    }
    
    // Vẽ bài Banker (CÁI) - Căn giữa cụm bài
    let bWidth = banker.length * 110 + (banker.length - 1) * 15;
    let bStartX = 650 - bWidth / 2;
    for (let i = 0; i < banker.length; i++) {
      await drawCard(banker[i], bStartX + (i * 125), 160);
    }

    // Điểm số Player
    ctx.fillStyle = "#fcf1d7";
    ctx.font = "bold 80px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(pScore.toString(), 250, 430);
    ctx.font = "bold 20px sans-serif";
    ctx.fillStyle = "#8a757b";
    ctx.letterSpacing = "2px";
    ctx.fillText("Đ I Ể M", 250, 465);

    // Điểm số Banker
    ctx.fillStyle = "#cda45e";
    ctx.font = "bold 80px sans-serif";
    ctx.fillText(bScore.toString(), 650, 430);
    ctx.font = "bold 20px sans-serif";
    ctx.fillStyle = "#8a757b";
    ctx.fillText("Đ I Ể M", 650, 465);
    ctx.letterSpacing = "0px";

    // Vòng tròn VS ở giữa
    ctx.fillStyle = "#1e0a0d";
    ctx.beginPath();
    ctx.arc(450, 400, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#cda45e";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#cda45e";
    ctx.font = "bold 22px sans-serif";
    ctx.fillText("VS", 450, 408);

    // Vẽ nút THẮNG / THUA
    const drawBadge = (text, isWin, x, y) => {
      const w = 180, h = 45;
      ctx.save();
      ctx.translate(x - w/2, y);
      
      if (isWin) {
        ctx.fillStyle = "#eec165";
        ctx.shadowColor = "rgba(238, 193, 101, 0.4)";
        ctx.shadowBlur = 20;
        ctx.fill(roundedRectPath(0, 0, w, h, 22));
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#1e0a0d";
      } else {
        ctx.fillStyle = "#47141b";
        ctx.fill(roundedRectPath(0, 0, w, h, 22));
        ctx.strokeStyle = "#78252a";
        ctx.lineWidth = 1;
        ctx.stroke(roundedRectPath(0, 0, w, h, 22));
        ctx.fillStyle = "#96424b";
      }

      ctx.font = "bold 24px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(text, w/2, 32);
      ctx.restore();
    };

    // Vẽ nút THẮNG / THUA / HÒA
    if (resultDoor === 'con') {
      drawBadge("THẮNG", true, 250, 500);
      drawBadge("THUA", false, 650, 500);
    } else if (resultDoor === 'cái') {
      drawBadge("THUA", false, 250, 500);
      drawBadge("THẮNG", true, 650, 500);
    } else {
      drawBadge("HÒA", true, 250, 500);
      drawBadge("HÒA", true, 650, 500);
    }

    const buffer = await canvas.toBuffer("image/png");
    await fs.writeFile(imagePath, buffer);
    
    const groupsByThread = new Map();
    for (const player of Object.values(game.players)) {
      groupsByThread.set(String(player.threadId), player.groupName);
    }
    const messageForThread = (targetThreadId) => {
      const currentGroup = groupsByThread.get(String(targetThreadId));
      const otherPlayers = Object.values(game.players).filter((player) => player.groupName && player.groupName !== currentGroup);
      if (!otherPlayers.length) return resultParts;
      const grouped = new Map();
      for (const player of otherPlayers) {
        if (!grouped.has(player.groupName)) grouped.set(player.groupName, []);
        const door = getBaccaratDoorLabel(player.door);
        grouped.get(player.groupName).push(`- ${player.name}: ${formatCurrency(player.amount)} cửa ${door}`);
      }
      const otherSession = [...grouped.entries()]
        .map(([groupName, players]) => `📌 Phiên khác: ${groupName}\n${players.join("\n")}`)
        .join("\n");
      return [resultParts, "\n", otherSession];
    };

    await api.sendMessage(
      { ...buildGamePlayerMessage(messageForThread(message.threadId), { threadId: message.threadId, botId: api.getBotId(), type: message.type }), attachments: [imagePath], ttl: 60000, isUseProphylactic: true },
      message.threadId,
      message.type
    );

    // Báo kết quả cho các group khác đã tham gia cùng phiên toàn server.
    for (const targetThreadId of game.threads) {
      if (String(targetThreadId) === String(message.threadId)) continue;
      const targetApi = getApiManager(game.threadBots?.[String(targetThreadId)])?.apiZalo || api;
      await targetApi.sendMessage({ ...buildGamePlayerMessage(messageForThread(targetThreadId), { threadId: targetThreadId, botId: targetApi.getBotId(), type: message.type }), ttl: 60000 }, targetThreadId, message.type).catch(() => {});
    }
    
    setTimeout(() => fs.unlink(imagePath).catch(() => {}), 60000); // Xóa ảnh sau 1p
  } catch (error) {
    console.error("Lỗi vẽ canvas Baccarat:", error);
    const text = buildGamePlayerMessage(resultParts, { threadId: message.threadId, botId: api.getBotId(), type: message.type });
    await sendMessageFromSQL(api, message, { success: true, message: text.msg, mentions: text.mentions }, false);
  }
}
