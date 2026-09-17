import { createCanvas, registerFont } from "canvas";
import fs from "fs/promises";
import path from "path";
import { clearImagePath } from "../../../../utils/canvas/index.js";
import { getGlobalPrefix } from "../../../service.js";
import { getRankInfoCache, updateRankMiniGame } from "../../../info-service/rank-chat.js";
import { getActiveCanvasStyle } from "../../../../utils/canvas/theme.js";

export const gameTypeXiangqi = "cotuong";
const games = new Map();
const locks = new Set();
const LEVELS = {
  de: { name: "Dễ", win: 5, lose: -2, depth: 0 },
  thuong: { name: "Thường", win: 10, lose: -3, depth: 0, greedy: true },
  kho: { name: "Khó", win: 20, lose: -5, depth: 1 },
  cuckho: { name: "Cực khó", win: 50, lose: -10, depth: 2 },
};
const ALIASES = { easy: "de", normal: "thuong", hard: "kho", master: "cuckho" };
const VALUE = { K: 100000, R: 900, C: 450, N: 400, B: 200, A: 200, P: 100 };
const GLYPH = { rK: "帥", rA: "仕", rB: "相", rN: "傌", rR: "俥", rC: "炮", rP: "兵", bK: "將", bA: "士", bB: "象", bN: "馬", bR: "車", bC: "砲", bP: "卒" };

try { registerFont("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", { family: "Xiangqi CJK", weight: "bold" }); } catch {}

function initialBoard() {
  const b = Array.from({ length: 10 }, () => Array(9).fill(null));
  const back = ["R", "N", "B", "A", "K", "A", "B", "N", "R"];
  back.forEach((p, c) => { b[0][c] = `b${p}`; b[9][c] = `r${p}`; });
  b[2][1] = b[2][7] = "bC"; b[7][1] = b[7][7] = "rC";
  for (let c = 0; c < 9; c += 2) { b[3][c] = "bP"; b[6][c] = "rP"; }
  return b;
}

const cloneBoard = (b) => b.map((r) => [...r]);
const inside = (r, c) => r >= 0 && r < 10 && c >= 0 && c < 9;
const other = (color) => color === "r" ? "b" : "r";
const posText = (r, c) => `${String.fromCharCode(97 + c)}${9 - r}`;

function parseMove(text) {
  const m = String(text || "").trim().toLowerCase().match(/^([a-i])([0-9])\s*([a-i])([0-9])$/);
  return m ? { from: { r: 9 - Number(m[2]), c: m[1].charCodeAt(0) - 97 }, to: { r: 9 - Number(m[4]), c: m[3].charCodeAt(0) - 97 } } : null;
}

function clearLine(board, from, to) {
  if (from.r !== to.r && from.c !== to.c) return Infinity;
  const dr = Math.sign(to.r - from.r), dc = Math.sign(to.c - from.c);
  let count = 0;
  for (let step = 1; step < 10; step++) {
    const r = from.r + dr * step, c = from.c + dc * step;
    if (r === to.r && c === to.c) return count;
    if (!inside(r, c)) return Infinity;
    if (board[r][c]) count++;
  }
  return Infinity;
}

function pseudoLegal(board, from, to, piece) {
  if (!inside(to.r, to.c) || (from.r === to.r && from.c === to.c)) return false;
  const target = board[to.r][to.c];
  if (target?.[0] === piece[0]) return false;
  const color = piece[0], type = piece[1], dr = to.r - from.r, dc = to.c - from.c;
  const ar = Math.abs(dr), ac = Math.abs(dc);
  if (type === "R") return (dr === 0 || dc === 0) && clearLine(board, from, to) === 0;
  if (type === "C") return (dr === 0 || dc === 0) && clearLine(board, from, to) === (target ? 1 : 0);
  if (type === "N") {
    if (!((ar === 2 && ac === 1) || (ar === 1 && ac === 2))) return false;
    const leg = ar === 2 ? { r: from.r + Math.sign(dr), c: from.c } : { r: from.r, c: from.c + Math.sign(dc) };
    return !board[leg.r][leg.c];
  }
  if (type === "B") {
    if (ar !== 2 || ac !== 2 || board[from.r + dr / 2][from.c + dc / 2]) return false;
    return color === "r" ? to.r >= 5 : to.r <= 4;
  }
  if (type === "A") {
    const palace = to.c >= 3 && to.c <= 5 && (color === "r" ? to.r >= 7 : to.r <= 2);
    return palace && ar === 1 && ac === 1;
  }
  if (type === "K") {
    if (target?.[1] === "K" && dc === 0 && clearLine(board, from, to) === 0) return true;
    const palace = to.c >= 3 && to.c <= 5 && (color === "r" ? to.r >= 7 : to.r <= 2);
    return palace && ar + ac === 1;
  }
  if (type === "P") {
    const forward = color === "r" ? -1 : 1;
    const crossed = color === "r" ? from.r <= 4 : from.r >= 5;
    return (dr === forward && dc === 0) || (crossed && dr === 0 && ac === 1);
  }
  return false;
}

function kingPosition(board, color) {
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) if (board[r][c] === `${color}K`) return { r, c };
  return null;
}

function inCheck(board, color) {
  const king = kingPosition(board, color);
  if (!king) return true;
  const enemy = other(color);
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
    const piece = board[r][c];
    if (piece?.[0] === enemy && pseudoLegal(board, { r, c }, king, piece)) return true;
  }
  return false;
}

function applyMove(board, move) {
  const next = cloneBoard(board);
  const captured = next[move.to.r][move.to.c];
  next[move.to.r][move.to.c] = next[move.from.r][move.from.c]; next[move.from.r][move.from.c] = null;
  return { board: next, captured };
}

function legalMoves(board, color) {
  const moves = [];
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
    const piece = board[r][c]; if (piece?.[0] !== color) continue;
    for (let tr = 0; tr < 10; tr++) for (let tc = 0; tc < 9; tc++) {
      const move = { from: { r, c }, to: { r: tr, c: tc } };
      if (!pseudoLegal(board, move.from, move.to, piece)) continue;
      const result = applyMove(board, move);
      if (!inCheck(result.board, color)) moves.push({ ...move, piece, captured: result.captured });
    }
  }
  return moves;
}

function evaluate(board, botColor) {
  let score = 0;
  for (const row of board) for (const p of row) if (p) score += (p[0] === botColor ? 1 : -1) * VALUE[p[1]];
  return score;
}

function minimax(board, turn, depth, botColor, alpha, beta, deadline) {
  if (depth <= 0 || Date.now() > deadline) return evaluate(board, botColor);
  const moves = legalMoves(board, turn).sort((a, b) => (VALUE[b.captured?.[1]] || 0) - (VALUE[a.captured?.[1]] || 0)).slice(0, 24);
  if (!moves.length) return turn === botColor ? -999999 : 999999;
  const max = turn === botColor; let best = max ? -Infinity : Infinity;
  for (const move of moves) {
    const score = minimax(applyMove(board, move).board, other(turn), depth - 1, botColor, alpha, beta, deadline);
    if (max) { best = Math.max(best, score); alpha = Math.max(alpha, best); } else { best = Math.min(best, score); beta = Math.min(beta, best); }
    if (beta <= alpha || Date.now() > deadline) break;
  }
  return best;
}

function botMove(game) {
  const moves = legalMoves(game.board, game.botColor); if (!moves.length) return null;
  const level = LEVELS[game.difficulty];
  if (!level.greedy && level.depth === 0) return moves[Math.floor(Math.random() * moves.length)];
  const deadline = Date.now() + (level.depth === 2 ? 1800 : 700);
  let best = -Infinity, choices = [];
  for (const move of moves) {
    const score = (VALUE[move.captured?.[1]] || 0) + minimax(applyMove(game.board, move).board, other(game.botColor), level.depth, game.botColor, -Infinity, Infinity, deadline);
    if (score > best) { best = score; choices = [move]; } else if (score === best) choices.push(move);
    if (Date.now() > deadline && choices.length) break;
  }
  return choices[Math.floor(Math.random() * choices.length)] || moves[0];
}

function help(prefix) {
  return `帥 CỜ TƯỚNG\n\n🤖 ${prefix}cotuong de | thuong | kho | cuckho\n🎨 Thêm red/black để chọn màu bot\n👥 ${prefix}cotuong @tên [red/black]\n\n🧭 Đi: a0a1 hoặc a0 a1\n🏳 Gõ: thua\n🏆 ${prefix}cotuong rank\n\nĐỏ đi trước · tọa độ a–i, 0–9`;
}

function normalizeColor(s) {
  if (["red", "do", "đỏ"].includes(s)) return "r";
  if (["black", "den", "đen"].includes(s)) return "b";
  return null;
}

async function render(game) {
  const style = getActiveCanvasStyle();
  const themes = {
    1: { bg: ["#50352a", "#160e0b"], accent: "#f1c676", muted: "#c9aa80", card: "rgba(255,255,255,.07)", cardLine: "rgba(255,255,255,.15)", board: "#deb77c", grid: "#56361f", river: "#79512e", red: "#c72e28", black: "#202020", piece: "#f7dfb0", last: "rgba(255,225,68,.65)", footer: "#cbbba8" },
    2: { bg: ["#042f3e", "#020617"], accent: "#22d3ee", muted: "#67e8f9", card: "rgba(8,47,73,.82)", cardLine: "rgba(34,211,238,.45)", board: "#071e2c", grid: "#22d3ee", river: "#5eead4", red: "#fb7185", black: "#e2e8f0", piece: "#0c3042", last: "rgba(45,212,191,.42)", footer: "#94a3b8" },
    3: { bg: ["#fff9e9", "#cbb17a"], accent: "#8b6423", muted: "#66513a", card: "rgba(255,252,242,.82)", cardLine: "#a17b38", board: "#f4e5bd", grid: "#6b4a24", river: "#8c2946", red: "#9f2439", black: "#292524", piece: "#fffaf0", last: "rgba(157,118,48,.28)", footer: "#54483c" },
    4: { bg: ["#fff7f8", "#ffd7df"], accent: "#ef476f", muted: "#111827", card: "rgba(255,255,255,.9)", cardLine: "#111827", board: "#fffdfd", grid: "#111827", river: "#ef476f", red: "#ef476f", black: "#111827", piece: "#ffffff", last: "rgba(239,71,111,.28)", footer: "#4b5563" },
    5: { bg: ["#35205f", "#071a2b"], accent: "#5eead4", muted: "#d8b4fe", card: "rgba(255,255,255,.09)", cardLine: "rgba(255,255,255,.28)", board: "rgba(15,23,42,.72)", grid: "rgba(216,180,254,.72)", river: "#99f6e4", red: "#f0abfc", black: "#99f6e4", piece: "rgba(30,41,59,.94)", last: "rgba(94,234,212,.32)", footer: "#cbd5e1" },
  };
  const theme = themes[style] || themes[1];
  const W = 920, H = 1140, x0 = 108, y0 = 188, dx = 88, dy = 88;
  const canvas = createCanvas(W, H), ctx = canvas.getContext("2d");
  const bg = ctx.createRadialGradient(460, 350, 30, 460, 520, 850); bg.addColorStop(0, theme.bg[0]); bg.addColorStop(1, theme.bg[1]);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  if (style === 2) {
    ctx.strokeStyle = "rgba(34,211,238,.09)"; ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 46) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 46) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.fillStyle = theme.accent; ctx.fillRect(0, 0, W, 7); ctx.fillRect(0, 0, 7, H);
  } else if (style === 3) {
    ctx.strokeStyle = theme.accent; ctx.lineWidth = 3; ctx.strokeRect(25, 25, W - 50, H - 50); ctx.lineWidth = 1; ctx.strokeRect(37, 37, W - 74, H - 74);
  } else if (style === 4) {
    ctx.fillStyle = "#111827"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(620, 0); ctx.lineTo(520, 102); ctx.lineTo(0, 102); ctx.closePath(); ctx.fill();
    ctx.fillStyle = theme.accent; ctx.fillRect(W - 28, 0, 28, H);
  } else if (style === 5) {
    const glow = ctx.createRadialGradient(760, 160, 0, 760, 160, 430); glow.addColorStop(0, "rgba(217,70,239,.48)"); glow.addColorStop(1, "rgba(217,70,239,0)"); ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  }
  const heading = style === 2 ? "XIANGQI // 戰術盤" : style === 3 ? "帥 · KỲ PHỔ · 將" : style === 4 ? "CỜ TƯỚNG! / 將" : style === 5 ? "帥  AURORA XIANGQI  將" : "帥  CỜ TƯỚNG  將";
  ctx.textAlign = "center"; ctx.fillStyle = theme.accent; ctx.font = `bold ${style === 4 ? 39 : 43}px 'Xiangqi CJK', sans-serif`; ctx.fillText(heading, W / 2, 58);
  ctx.fillStyle = theme.muted; ctx.font = "16px sans-serif"; ctx.fillText(game.isBot ? "ĐẤU VỚI BOT" : "THÁCH ĐẤU 1 VS 1", W / 2, 88);
  const topColor = game.viewColor === "r" ? "b" : "r", bottomColor = other(topColor);
  const card = (color, y) => {
    ctx.beginPath(); ctx.roundRect(108, y, 704, 58, style === 2 ? 3 : style === 4 ? 0 : style === 5 ? 25 : 18); ctx.fillStyle = game.turn === color ? `${theme.accent}33` : theme.card; ctx.fill();
    ctx.strokeStyle = game.turn === color ? theme.accent : theme.cardLine; ctx.lineWidth = game.turn === color ? 2 : 1; ctx.stroke();
    ctx.textAlign = "left"; ctx.fillStyle = color === "r" ? theme.red : theme.black; ctx.font = "bold 23px sans-serif"; ctx.fillText(`${color === "r" ? "🔴" : "⚫"} ${String(game.players[color].name).slice(0, 25)}`, 130, y + 38);
    if (game.turn === color) { ctx.textAlign = "right"; ctx.fillStyle = theme.accent; ctx.font = "bold 15px sans-serif"; ctx.fillText(style === 2 ? "LIVE // TURN" : style === 4 ? "TỚI LƯỢT!" : "● ĐANG ĐI", 790, y + 36); }
  };
  card(topColor, 108); card(bottomColor, 1010);
  ctx.fillStyle = theme.board; ctx.beginPath(); ctx.roundRect(70, 165, 780, 820, style === 2 || style === 4 ? 2 : style === 5 ? 32 : 18); ctx.fill();
  ctx.strokeStyle = theme.grid; ctx.lineWidth = style === 2 ? 2 : style === 4 ? 4 : 3;
  for (let r = 0; r < 10; r++) { ctx.beginPath(); ctx.moveTo(x0, y0 + r * dy); ctx.lineTo(x0 + 8 * dx, y0 + r * dy); ctx.stroke(); }
  for (let c = 0; c < 9; c++) {
    ctx.beginPath(); ctx.moveTo(x0 + c * dx, y0); ctx.lineTo(x0 + c * dx, y0 + 4 * dy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0 + c * dx, y0 + 5 * dy); ctx.lineTo(x0 + c * dx, y0 + 9 * dy); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(x0, y0 + 4 * dy); ctx.lineTo(x0, y0 + 5 * dy); ctx.moveTo(x0 + 8 * dx, y0 + 4 * dy); ctx.lineTo(x0 + 8 * dx, y0 + 5 * dy); ctx.stroke();
  for (const base of [0, 7]) { ctx.beginPath(); ctx.moveTo(x0 + 3 * dx, y0 + base * dy); ctx.lineTo(x0 + 5 * dx, y0 + (base + 2) * dy); ctx.moveTo(x0 + 5 * dx, y0 + base * dy); ctx.lineTo(x0 + 3 * dx, y0 + (base + 2) * dy); ctx.stroke(); }
  ctx.fillStyle = theme.river; ctx.font = `bold ${style === 2 ? 27 : 34}px 'Xiangqi CJK', sans-serif`; ctx.textAlign = "center"; ctx.fillText(style === 2 ? "楚河 // WEST" : "楚  河", 270, y0 + 4.62 * dy); ctx.fillText(style === 2 ? "EAST // 漢界" : "漢  界", 650, y0 + 4.62 * dy);
  const last = game.lastMove ? [posText(game.lastMove.from.r, game.lastMove.from.c), posText(game.lastMove.to.r, game.lastMove.to.c)] : [];
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
    const rr = game.viewColor === "r" ? r : 9 - r, cc = game.viewColor === "r" ? c : 8 - c;
    const x = x0 + cc * dx, y = y0 + rr * dy, square = posText(r, c), p = game.board[r][c];
    if (last.includes(square)) { ctx.beginPath(); style === 4 ? ctx.roundRect(x - 39, y - 39, 78, 78, 8) : ctx.arc(x, y, 39, 0, Math.PI * 2); ctx.fillStyle = theme.last; ctx.fill(); }
    if (!p) continue;
    ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 5; ctx.beginPath();
    if (style === 2) ctx.roundRect(x - 32, y - 32, 64, 64, 8);
    else if (style === 4) ctx.roundRect(x - 33, y - 33, 66, 66, 18);
    else if (style === 5) { for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i - Math.PI / 6, px = x + Math.cos(a) * 36, py = y + Math.sin(a) * 36; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); }
    else ctx.arc(x, y, 34, 0, Math.PI * 2);
    ctx.fillStyle = theme.piece; ctx.fill();
    ctx.shadowColor = "transparent"; ctx.lineWidth = style === 4 ? 4 : 3; ctx.strokeStyle = p[0] === "r" ? theme.red : theme.black; ctx.stroke();
    ctx.fillStyle = p[0] === "r" ? theme.red : theme.black; ctx.font = "bold 36px 'Xiangqi CJK', sans-serif"; ctx.textBaseline = "middle"; ctx.fillText(GLYPH[p], x, y + 1);
  }
  ctx.textBaseline = "alphabetic"; ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.font = "bold 15px sans-serif";
  for (let c = 0; c < 9; c++) ctx.fillText(String.fromCharCode(97 + (game.viewColor === "r" ? c : 8 - c)), x0 + c * dx, 974);
  for (let r = 0; r < 10; r++) {
    const rank = game.viewColor === "r" ? 9 - r : r;
    ctx.fillText(String(rank), 84, y0 + r * dy + 5);
    ctx.fillText(String(rank), 836, y0 + r * dy + 5);
  }
  ctx.fillStyle = inCheck(game.board, game.turn) ? theme.red : theme.footer; ctx.font = "bold 16px sans-serif";
  ctx.fillText(inCheck(game.board, game.turn) ? "⚠ CHIẾU TƯỚNG" : game.lastMove ? `NƯỚC VỪA ĐI  ${posText(game.lastMove.from.r, game.lastMove.from.c).toUpperCase()} → ${posText(game.lastMove.to.r, game.lastMove.to.c).toUpperCase()}` : "GÕ A0A1 ĐỂ DI CHUYỂN", W / 2, 1110);
  const out = path.join("/tmp", `cotuong-${game.threadId}-${Date.now()}.png`); await fs.writeFile(out, canvas.toBuffer("image/png")); return out;
}

function addTurnMention(payload, game) {
  const player = game.players[game.turn];
  if (!player || (game.isBot && game.turn === game.botColor)) return payload;
  const name = String(player.name || "Người chơi"), prefix = `${payload.msg}\n👉 Tới lượt: `;
  return { ...payload, msg: `${prefix}@${name}`, mentions: [{ uid: player.id, pos: prefix.length, len: name.length + 1 }] };
}

async function sendBoard(api, message, game, caption, tagTurn = false) {
  const file = await render(game);
  try {
    let payload = { msg: caption, attachments: [file], ttl: 600000 };
    if (tagTurn) payload = addTurnMention(payload, game);
    await api.sendMessage(payload, message.threadId, message.type);
  } finally { await clearImagePath(file); }
}

function saveRank(api, game, winner, groupInfo) {
  if (!game.isBot || !winner) return;
  const humanColor = other(game.botColor), human = game.players[humanColor], won = winner === humanColor, lv = LEVELS[game.difficulty];
  updateRankMiniGame(api.getBotId(), game.threadId, human.id, human.name, groupInfo?.name || "Nhóm", gameTypeXiangqi, won ? lv.win : lv.lose, { [won ? "SOLO_W" : "SOLO_L"]: 1, [won ? `W_${game.difficulty}` : `L_${game.difficulty}`]: 1 });
}

async function finish(api, message, game, winner, caption, groupInfo) { saveRank(api, game, winner, groupInfo); await sendBoard(api, message, game, caption); games.delete(game.threadId); }

async function runBot(api, message, game, groupInfo) {
  if (!game.isBot || game.turn !== game.botColor) return;
  const move = botMove(game);
  if (!move) { await finish(api, message, game, other(game.botColor), `🎉 ${game.players[other(game.botColor)].name} thắng! Bot hết nước đi.`, groupInfo); return; }
  game.board = applyMove(game.board, move).board; game.lastMove = move; game.turn = other(game.turn);
  const replies = legalMoves(game.board, game.turn);
  if (!kingPosition(game.board, game.turn) || !replies.length) await finish(api, message, game, game.botColor, `🤖 Bot đi ${posText(move.from.r, move.from.c)}${posText(move.to.r, move.to.c)}\n🎉 CHIẾU BÍ! Bot thắng.`, groupInfo);
  else await sendBoard(api, message, game, `🤖 Bot: ${posText(move.from.r, move.from.c)}${posText(move.to.r, move.to.c)}${inCheck(game.board, game.turn) ? " · ⚠ Chiếu!" : ""}`, true);
}

async function showRank(api, message) {
  const users = getRankInfoCache(api.getBotId())?.[gameTypeXiangqi]?.[message.threadId]?.users || [];
  const top = [...users].sort((a, b) => (b.Rank || 0) - (a.Rank || 0)).slice(0, 10);
  const text = top.length ? top.map((u, i) => `${i + 1}. ${u.UserName} — ${u.Rank || 0} điểm`).join("\n") : "Chưa có dữ liệu xếp hạng.";
  await api.sendMessage({ msg: `🏆 BXH CỜ TƯỚNG\n\n${text}` }, message.threadId, message.type);
}

export async function handleXiangqiCommand(api, message) {
  const prefix = getGlobalPrefix(api.getBotId()), body = typeof message.data.content === "string" ? message.data.content : message.data.content?.title || "";
  const args = body.trim().split(/\s+/).slice(1).map((x) => x.toLowerCase()), first = ALIASES[args[0]] || args[0];
  if (!first || ["help", "huongdan"].includes(first)) return api.sendMessage({ msg: help(prefix), quote: message }, message.threadId, message.type);
  if (["rank", "top", "bxh"].includes(first)) return showRank(api, message);
  if (games.has(message.threadId)) return api.sendMessage({ msg: "⚠️ Nhóm đang có một ván cờ tướng. Gõ nước đi hoặc “thua”." }, message.threadId, message.type);
  const mention = message.data.mentions?.[0], sender = { id: message.data.uidFrom, name: message.data.dName || "Người chơi" };
  let game = { threadId: message.threadId, board: initialBoard(), turn: "r", players: {}, viewColor: "r", isBot: !mention };
  if (mention) {
    if (String(mention.uid) === String(sender.id) || String(mention.uid) === String(api.getBotId())) return api.sendMessage({ msg: "⚠️ Hãy tag người chơi khác." }, message.threadId, message.type);
    const tagged = { id: mention.uid, name: body.slice(mention.pos, mention.pos + mention.len).replace(/^@/, "") || "Đối thủ" }, taggedColor = args.map(normalizeColor).find(Boolean) || "b";
    game.players[taggedColor] = tagged; game.players[other(taggedColor)] = sender;
  } else {
    if (!LEVELS[first]) return api.sendMessage({ msg: help(prefix) }, message.threadId, message.type);
    const botColor = args.map(normalizeColor).find(Boolean) || "b", humanColor = other(botColor);
    Object.assign(game, { difficulty: first, botColor, viewColor: humanColor }); game.players[botColor] = { id: api.getBotId(), name: "Bot" }; game.players[humanColor] = sender;
  }
  games.set(message.threadId, game); await sendBoard(api, message, game, "帥 Ván cờ bắt đầu!", true); await runBot(api, message, game);
}

export async function handleXiangqiMessage(api, message, groupInfo) {
  const game = games.get(message.threadId); if (!game) return false;
  const color = ["r", "b"].find((c) => String(game.players[c].id) === String(message.data.uidFrom)); if (!color || color === game.botColor) return false;
  const text = typeof message.data.content === "string" ? message.data.content.trim().toLowerCase() : "", surrender = ["thua", "lose", "dauhang", "đầuhàng"].includes(text.replace(/\s/g, "")), parsed = parseMove(text);
  if (!surrender && !parsed) return false; if (locks.has(message.threadId)) return true; locks.add(message.threadId);
  try {
    if (color !== game.turn) { await api.sendMessage({ msg: "⏳ Chưa đến lượt bạn." }, message.threadId, message.type); return true; }
    if (surrender) { const winner = other(color); await finish(api, message, game, winner, `🏳 ${game.players[color].name} đầu hàng.\n🎉 ${game.players[winner].name} thắng!`, groupInfo); return true; }
    const move = legalMoves(game.board, color).find((m) => m.from.r === parsed.from.r && m.from.c === parsed.from.c && m.to.r === parsed.to.r && m.to.c === parsed.to.c);
    if (!move) { await api.sendMessage({ msg: "❌ Nước đi không hợp lệ. Ví dụ: a0a1 hoặc a0 a1." }, message.threadId, message.type); return true; }
    game.board = applyMove(game.board, move).board; game.lastMove = move; game.turn = other(color);
    if (!kingPosition(game.board, game.turn) || !legalMoves(game.board, game.turn).length) { await finish(api, message, game, color, `🎉 CHIẾU BÍ! ${game.players[color].name} thắng.`, groupInfo); return true; }
    if (game.isBot) await runBot(api, message, game, groupInfo); else await sendBoard(api, message, game, inCheck(game.board, game.turn) ? "⚠ Chiếu tướng!" : "帥 Đã cập nhật bàn cờ.", true);
    return true;
  } finally { locks.delete(message.threadId); }
}
