import { createCanvas, registerFont } from "canvas";
import fs from "fs/promises";
import path from "path";
import { clearImagePath } from "../../../../utils/canvas/index.js";
import { getGlobalPrefix } from "../../../service.js";
import { getRankInfoCache, updateRankMiniGame } from "../../../info-service/rank-chat.js";

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
  const W = 920, H = 1140, x0 = 108, y0 = 188, dx = 88, dy = 88;
  const canvas = createCanvas(W, H), ctx = canvas.getContext("2d");
  const bg = ctx.createRadialGradient(460, 350, 30, 460, 520, 850); bg.addColorStop(0, "#50352a"); bg.addColorStop(1, "#160e0b");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center"; ctx.fillStyle = "#f1c676"; ctx.font = "bold 43px 'Xiangqi CJK', sans-serif"; ctx.fillText("帥  CỜ TƯỚNG  將", W / 2, 58);
  ctx.fillStyle = "#c9aa80"; ctx.font = "16px sans-serif"; ctx.fillText(game.isBot ? "ĐẤU VỚI BOT" : "THÁCH ĐẤU 1 VS 1", W / 2, 88);
  const topColor = game.viewColor === "r" ? "b" : "r", bottomColor = other(topColor);
  const card = (color, y) => {
    ctx.beginPath(); ctx.roundRect(108, y, 704, 58, 18); ctx.fillStyle = game.turn === color ? "rgba(241,198,118,.2)" : "rgba(255,255,255,.07)"; ctx.fill();
    ctx.strokeStyle = game.turn === color ? "#f1c676" : "rgba(255,255,255,.15)"; ctx.lineWidth = game.turn === color ? 2 : 1; ctx.stroke();
    ctx.textAlign = "left"; ctx.fillStyle = color === "r" ? "#ff766e" : "#e7ddd0"; ctx.font = "bold 23px sans-serif"; ctx.fillText(`${color === "r" ? "🔴" : "⚫"} ${String(game.players[color].name).slice(0, 25)}`, 130, y + 38);
    if (game.turn === color) { ctx.textAlign = "right"; ctx.fillStyle = "#f1c676"; ctx.font = "bold 15px sans-serif"; ctx.fillText("● ĐANG ĐI", 790, y + 36); }
  };
  card(topColor, 108); card(bottomColor, 1010);
  ctx.fillStyle = "#deb77c"; ctx.beginPath(); ctx.roundRect(70, 165, 780, 820, 18); ctx.fill();
  ctx.strokeStyle = "#56361f"; ctx.lineWidth = 3;
  for (let r = 0; r < 10; r++) { ctx.beginPath(); ctx.moveTo(x0, y0 + r * dy); ctx.lineTo(x0 + 8 * dx, y0 + r * dy); ctx.stroke(); }
  for (let c = 0; c < 9; c++) {
    ctx.beginPath(); ctx.moveTo(x0 + c * dx, y0); ctx.lineTo(x0 + c * dx, y0 + 4 * dy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0 + c * dx, y0 + 5 * dy); ctx.lineTo(x0 + c * dx, y0 + 9 * dy); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(x0, y0 + 4 * dy); ctx.lineTo(x0, y0 + 5 * dy); ctx.moveTo(x0 + 8 * dx, y0 + 4 * dy); ctx.lineTo(x0 + 8 * dx, y0 + 5 * dy); ctx.stroke();
  for (const base of [0, 7]) { ctx.beginPath(); ctx.moveTo(x0 + 3 * dx, y0 + base * dy); ctx.lineTo(x0 + 5 * dx, y0 + (base + 2) * dy); ctx.moveTo(x0 + 5 * dx, y0 + base * dy); ctx.lineTo(x0 + 3 * dx, y0 + (base + 2) * dy); ctx.stroke(); }
  ctx.fillStyle = "#79512e"; ctx.font = "bold 34px 'Xiangqi CJK', sans-serif"; ctx.textAlign = "center"; ctx.fillText("楚  河", 270, y0 + 4.62 * dy); ctx.fillText("漢  界", 650, y0 + 4.62 * dy);
  const last = game.lastMove ? [posText(game.lastMove.from.r, game.lastMove.from.c), posText(game.lastMove.to.r, game.lastMove.to.c)] : [];
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
    const rr = game.viewColor === "r" ? r : 9 - r, cc = game.viewColor === "r" ? c : 8 - c;
    const x = x0 + cc * dx, y = y0 + rr * dy, square = posText(r, c), p = game.board[r][c];
    if (last.includes(square)) { ctx.beginPath(); ctx.arc(x, y, 39, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,225,68,.65)"; ctx.fill(); }
    if (!p) continue;
    ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 5; ctx.beginPath(); ctx.arc(x, y, 34, 0, Math.PI * 2); ctx.fillStyle = "#f7dfb0"; ctx.fill();
    ctx.shadowColor = "transparent"; ctx.lineWidth = 3; ctx.strokeStyle = p[0] === "r" ? "#bd2924" : "#242424"; ctx.stroke();
    ctx.fillStyle = p[0] === "r" ? "#c72e28" : "#202020"; ctx.font = "bold 36px 'Xiangqi CJK', sans-serif"; ctx.textBaseline = "middle"; ctx.fillText(GLYPH[p], x, y + 1);
  }
  ctx.textBaseline = "alphabetic"; ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.font = "bold 15px sans-serif";
  for (let c = 0; c < 9; c++) ctx.fillText(String.fromCharCode(97 + (game.viewColor === "r" ? c : 8 - c)), x0 + c * dx, 974);
  for (let r = 0; r < 10; r++) {
    const rank = game.viewColor === "r" ? 9 - r : r;
    ctx.fillText(String(rank), 84, y0 + r * dy + 5);
    ctx.fillText(String(rank), 836, y0 + r * dy + 5);
  }
  ctx.fillStyle = inCheck(game.board, game.turn) ? "#ff8279" : "#cbbba8"; ctx.font = "bold 16px sans-serif";
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
