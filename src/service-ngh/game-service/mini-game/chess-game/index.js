import { Chess } from "chess.js";
import { createCanvas } from "canvas";
import fs from "fs/promises";
import path from "path";
import { getGlobalPrefix } from "../../../service.js";
import { clearImagePath } from "../../../../utils/canvas/index.js";
import { getRankInfoCache, updateRankMiniGame } from "../../../info-service/rank-chat.js";

export const gameTypeChess = "covua";

const BOT_LEVELS = {
  de: { name: "Dễ", win: 5, lose: -2, depth: 0 },
  thuong: { name: "Thường", win: 10, lose: -3, depth: 1 },
  kho: { name: "Khó", win: 20, lose: -5, depth: 2 },
  cuckho: { name: "Cực khó", win: 50, lose: -10, depth: 3 },
};
const LEVEL_ALIASES = { easy: "de", normal: "thuong", hard: "kho", master: "cuckho", "cực": "cuckho" };
const PIECES = {
  wk: "♔", wq: "♕", wr: "♖", wb: "♗", wn: "♘", wp: "♙",
  bk: "♚", bq: "♛", br: "♜", bb: "♝", bn: "♞", bp: "♟",
};
const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const busyThreads = new Set();
const chessGames = new Map();

function activeGame(threadId) {
  return chessGames.get(threadId);
}

function playerColor(game, userId) {
  if (String(game.players.w.id) === String(userId)) return "w";
  if (String(game.players.b.id) === String(userId)) return "b";
  return null;
}

function normalizeColor(value) {
  if (["white", "trang", "trắng"].includes(value)) return "w";
  if (["black", "den", "đen"].includes(value)) return "b";
  return null;
}

function displayTurn(game) {
  const color = game.chess.turn();
  return `${color === "w" ? "Trắng" : "Đen"} — ${game.players[color].name}`;
}

function help(prefix) {
  return `♔ CỜ VUA\n\n🤖 ${prefix}covua de | thuong | kho | cuckho\n🎨 Thêm white/black để chọn màu bot\n👥 ${prefix}covua @tên [white/black]\n\n♟ Đi: e2e4 · e2 e4\n🏰 Nhập thành: oo / ooo\n👑 Phong tốt: b7b8 q\n🏳 Gõ: thua\n🏆 ${prefix}covua rank | rank solo`;
}

function parseMove(text, turn) {
  const value = String(text || "").trim().toLowerCase().replace(/0/g, "o");
  if (value === "oo" || value === "o-o") return turn === "w" ? { from: "e1", to: "g1" } : { from: "e8", to: "g8" };
  if (value === "ooo" || value === "o-o-o") return turn === "w" ? { from: "e1", to: "c1" } : { from: "e8", to: "c8" };
  const match = value.match(/^([a-h][1-8])\s*([a-h][1-8])(?:\s*=?\s*([qrbn]))?$/);
  return match ? { from: match[1], to: match[2], promotion: match[3] || "q" } : null;
}

function evaluate(chess, botColor) {
  if (chess.isCheckmate()) return chess.turn() === botColor ? -999999 : 999999;
  if (chess.isDraw()) return 0;
  let score = 0;
  for (const row of chess.board()) {
    for (const piece of row) if (piece) score += (piece.color === botColor ? 1 : -1) * VALUE[piece.type];
  }
  return score;
}

function orderedMoves(chess, max = Infinity) {
  return chess.moves({ verbose: true })
    .sort((a, b) => (VALUE[b.captured] || 0) + (b.promotion ? 800 : 0) - (VALUE[a.captured] || 0) - (a.promotion ? 800 : 0))
    .slice(0, max);
}

function search(chess, depth, alpha, beta, botColor, deadline) {
  if (depth <= 0 || chess.isGameOver() || Date.now() >= deadline) return evaluate(chess, botColor);
  const maximizing = chess.turn() === botColor;
  let best = maximizing ? -Infinity : Infinity;
  for (const move of orderedMoves(chess, depth >= 2 ? 18 : 28)) {
    chess.move(move);
    const score = search(chess, depth - 1, alpha, beta, botColor, deadline);
    chess.undo();
    if (maximizing) { best = Math.max(best, score); alpha = Math.max(alpha, best); }
    else { best = Math.min(best, score); beta = Math.min(beta, best); }
    if (beta <= alpha || Date.now() >= deadline) break;
  }
  return best;
}

function chooseBotMove(game) {
  const moves = orderedMoves(game.chess);
  if (!moves.length) return null;
  const config = BOT_LEVELS[game.difficulty];
  if (config.depth === 0) return moves[Math.floor(Math.random() * moves.length)];
  const deadline = Date.now() + (config.depth === 3 ? 2200 : 900);
  let bestScore = -Infinity;
  let choices = [];
  for (const move of moves) {
    game.chess.move(move);
    const score = search(game.chess, config.depth - 1, -Infinity, Infinity, game.botColor, deadline);
    game.chess.undo();
    if (score > bestScore) { bestScore = score; choices = [move]; }
    else if (score === bestScore) choices.push(move);
    if (Date.now() >= deadline && choices.length) break;
  }
  return choices[Math.floor(Math.random() * choices.length)] || moves[0];
}

async function renderBoard(game) {
  const width = 920, height = 1120, boardX = 76, boardY = 174, cell = 96, boardSize = cell * 8;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const rounded = (x, y, w, h, r) => {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.closePath();
  };
  const shortName = (name) => String(name || "Người chơi").length > 24 ? `${String(name).slice(0, 23)}…` : String(name || "Người chơi");
  const orientation = game.viewColor || "w";

  const bg = ctx.createRadialGradient(width / 2, 330, 40, width / 2, 480, 850);
  bg.addColorStop(0, "#29455a"); bg.addColorStop(0.55, "#142735"); bg.addColorStop(1, "#08131c");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 0.06; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1;
  for (let x = -height; x < width; x += 34) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + height, height); ctx.stroke(); }
  ctx.globalAlpha = 1;

  ctx.textAlign = "center"; ctx.fillStyle = "#f7d58a"; ctx.font = "700 42px sans-serif";
  ctx.fillText("♔  CỜ VUA", width / 2, 58);
  ctx.fillStyle = "#9eb3c1"; ctx.font = "17px sans-serif";
  ctx.fillText(game.isBot ? "ĐẤU VỚI BOT" : "THÁCH ĐẤU 1 VS 1", width / 2, 88);

  const turn = game.chess.turn();
  for (const [color, y] of [[orientation === "w" ? "b" : "w", 108], [orientation === "w" ? "w" : "b", 986]]) {
    const isTurn = color === turn;
    rounded(76, y, 768, 58, 18);
    ctx.fillStyle = isTurn ? "rgba(239,190,81,.20)" : "rgba(255,255,255,.07)"; ctx.fill();
    ctx.strokeStyle = isTurn ? "#efbe51" : "rgba(255,255,255,.12)"; ctx.lineWidth = isTurn ? 2 : 1; ctx.stroke();
    ctx.textAlign = "left"; ctx.fillStyle = color === "w" ? "#fff9e9" : "#d5dde3"; ctx.font = "bold 26px sans-serif";
    ctx.fillText(color === "w" ? "♔" : "♚", 98, y + 38);
    ctx.font = "bold 21px sans-serif"; ctx.fillText(shortName(game.players[color].name), 140, y + 37);
    if (isTurn) { ctx.textAlign = "right"; ctx.fillStyle = "#f7d58a"; ctx.font = "bold 16px sans-serif"; ctx.fillText("● ĐANG ĐI", 820, y + 35); }
  }

  ctx.shadowColor = "rgba(0,0,0,.55)"; ctx.shadowBlur = 26; ctx.shadowOffsetY = 12;
  rounded(boardX - 10, boardY - 10, boardSize + 20, boardSize + 20, 12);
  ctx.fillStyle = "#5f422b"; ctx.fill();
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  const board = game.chess.board();
  const last = game.lastMove ? [game.lastMove.from, game.lastMove.to] : [];
  let checkedKing = null;
  if (game.chess.inCheck()) {
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p?.type === "k" && p.color === game.chess.turn()) checkedKing = `${String.fromCharCode(97 + f)}${8 - r}`;
    }
  }
  for (let vr = 0; vr < 8; vr++) for (let vc = 0; vc < 8; vc++) {
    const fileIndex = orientation === "w" ? vc : 7 - vc;
    const rank = orientation === "w" ? 8 - vr : vr + 1;
    const square = `${String.fromCharCode(97 + fileIndex)}${rank}`;
    const x = boardX + vc * cell, y = boardY + vr * cell;
    ctx.fillStyle = (fileIndex + rank) % 2 ? "#f0d9b5" : "#8a5b3d";
    ctx.fillRect(x, y, cell, cell);
    const tileGlow = ctx.createLinearGradient(x, y, x + cell, y + cell);
    if (last.includes(square)) { tileGlow.addColorStop(0, "rgba(255,226,72,.72)"); tileGlow.addColorStop(1, "rgba(230,169,29,.55)"); ctx.fillStyle = tileGlow; ctx.fillRect(x, y, cell, cell); }
    if (square === checkedKing) { ctx.fillStyle = "rgba(226,48,48,.72)"; ctx.fillRect(x, y, cell, cell); }
    ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.font = "bold 13px sans-serif";
    ctx.fillStyle = (fileIndex + rank) % 2 ? "rgba(88,57,37,.62)" : "rgba(255,240,211,.62)";
    if (vc === 0) ctx.fillText(String(rank), x + 5, y + 5);
    if (vr === 7) ctx.fillText(String.fromCharCode(97 + fileIndex), x + cell - 15, y + cell - 18);
    const piece = board[8 - rank][fileIndex];
    if (piece) {
      ctx.textAlign = "center"; ctx.font = "76px 'DejaVu Sans', sans-serif"; ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(0,0,0,.42)"; ctx.shadowBlur = 7; ctx.shadowOffsetY = 5;
      ctx.lineWidth = piece.color === "w" ? 3 : 2; ctx.strokeStyle = piece.color === "w" ? "#574936" : "#ecdbc0";
      ctx.fillStyle = piece.color === "w" ? "#fffaf0" : "#17212a";
      const glyph = PIECES[piece.color + piece.type];
      ctx.strokeText(glyph, x + cell / 2, y + cell / 2 + 4); ctx.fillText(glyph, x + cell / 2, y + cell / 2 + 4);
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    }
  }
  ctx.textBaseline = "alphabetic"; ctx.textAlign = "center";
  rounded(220, 1061, 480, 38, 19); ctx.fillStyle = game.chess.inCheck() ? "rgba(213,59,59,.24)" : "rgba(255,255,255,.07)"; ctx.fill();
  ctx.fillStyle = game.chess.inCheck() ? "#ff8a80" : "#b9c9d3"; ctx.font = "bold 16px sans-serif";
  ctx.fillText(game.chess.inCheck() ? "⚠  ĐANG BỊ CHIẾU" : last.length ? `NƯỚC VỪA ĐI  ${game.lastMove.from.toUpperCase()} → ${game.lastMove.to.toUpperCase()}` : "GÕ E2E4 ĐỂ DI CHUYỂN", width / 2, 1087);
  const output = path.join("/tmp", `covua-${game.threadId}-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
  await fs.writeFile(output, canvas.toBuffer("image/png"));
  return output;
}

function addTurnMention(payload, game) {
  if (game.chess.isGameOver()) return payload;
  const player = game.players[game.chess.turn()];
  if (!player || (game.isBot && game.chess.turn() === game.botColor)) return payload;
  const name = String(player.name || "Người chơi");
  const prefix = `${payload.msg}\n👉 Tới lượt: `;
  return { ...payload, msg: `${prefix}@${name}`, mentions: [{ uid: player.id, pos: prefix.length, len: name.length + 1 }] };
}

async function sendBoard(api, message, game, caption, tagTurn = false) {
  const imagePath = await renderBoard(game);
  try {
    let payload = { msg: caption, attachments: [imagePath], ttl: 600000 };
    if (tagTurn) payload = addTurnMention(payload, game);
    await api.sendMessage(payload, message.threadId, message.type);
  } finally { await clearImagePath(imagePath); }
}

function finishText(game) {
  if (game.chess.isCheckmate()) return `♚ CHIẾU HẾT! ${game.chess.turn() === "w" ? game.players.b.name : game.players.w.name} thắng.`;
  if (game.chess.isStalemate()) return "🤝 Hòa do hết nước đi.";
  if (game.chess.isThreefoldRepetition()) return "🤝 Hòa do lặp lại thế cờ 3 lần.";
  if (game.chess.isInsufficientMaterial()) return "🤝 Hòa do không đủ quân chiếu hết.";
  return "🤝 Ván đấu hòa.";
}

function saveResult(api, game, winnerColor, groupName = "Nhóm") {
  if (!game.isBot || !winnerColor) return;
  const humanColor = game.botColor === "w" ? "b" : "w";
  const human = game.players[humanColor];
  const won = winnerColor === humanColor;
  const cfg = BOT_LEVELS[game.difficulty];
  updateRankMiniGame(api.getBotId(), game.threadId, human.id, human.name, groupName, gameTypeChess, won ? cfg.win : cfg.lose, {
    [won ? `W_${game.difficulty}` : `L_${game.difficulty}`]: 1,
    [won ? "SOLO_W" : "SOLO_L"]: 1,
  });
}

async function endGame(api, message, game, caption, winnerColor, groupInfo) {
  saveResult(api, game, winnerColor, groupInfo?.name);
  await sendBoard(api, message, game, caption);
  chessGames.delete(game.threadId);
}

async function botTurn(api, message, game, groupInfo) {
  if (!game.isBot || game.chess.turn() !== game.botColor || game.chess.isGameOver()) return;
  const move = chooseBotMove(game);
  if (!move) return;
  game.lastMove = game.chess.move(move);
  if (game.chess.isGameOver()) {
    const winner = game.chess.isCheckmate() ? game.botColor : null;
    await endGame(api, message, game, `🤖 Bot đi ${game.lastMove.from}${game.lastMove.to}.\n${finishText(game)}`, winner, groupInfo);
  } else {
    const check = game.chess.inCheck() ? " · ⚠️ Chiếu!" : "";
    await sendBoard(api, message, game, `🤖 Bot: ${game.lastMove.from}${game.lastMove.to}${check}`, true);
  }
}

function getMention(message) {
  return Array.isArray(message.data?.mentions) ? message.data.mentions[0] : null;
}

async function showRank(api, message, soloOnly = false) {
  const users = getRankInfoCache(api.getBotId())?.[gameTypeChess]?.[message.threadId]?.users || [];
  const sorted = [...users].sort((a, b) => Number(b.Rank || 0) - Number(a.Rank || 0)).slice(0, 10);
  if (!sorted.length) return api.sendMessage({ msg: "🏆 Chưa có dữ liệu xếp hạng cờ vua." }, message.threadId, message.type);
  const rows = sorted.map((u, i) => {
    const inv = u.inventory || {};
    const wins = inv.SOLO_W || 0, losses = inv.SOLO_L || 0;
    return `${i + 1}. ${u.UserName} — ${soloOnly ? `${wins} thắng / ${losses} thua` : `${u.Rank || 0} điểm`}`;
  });
  await api.sendMessage({ msg: `${soloOnly ? "♟ LỊCH SỬ SOLO" : "🏆 BXH CỜ VUA"}\n\n${rows.join("\n")}` }, message.threadId, message.type);
}

export async function handleChessCommand(api, message, aliasCommand = "covua") {
  const prefix = getGlobalPrefix(api.getBotId());
  const body = typeof message.data.content === "string" ? message.data.content : message.data.content?.title || "";
  const args = body.trim().split(/\s+/).slice(1).map((v) => v.toLowerCase());
  const first = LEVEL_ALIASES[args[0]] || args[0];
  if (!first || ["help", "huongdan", "hướngdẫn"].includes(first)) {
    await api.sendMessage({ msg: help(prefix), quote: message }, message.threadId, message.type); return;
  }
  if (first === "rank" || first === "top" || first === "bxh") { await showRank(api, message, args[1] === "solo"); return; }
  if (activeGame(message.threadId)) {
    await api.sendMessage({ msg: "⚠️ Nhóm đang có một ván cờ vua. Gõ nước đi hoặc “thua” để kết thúc.", quote: message }, message.threadId, message.type); return;
  }
  const mention = getMention(message);
  const sender = { id: message.data.uidFrom, name: message.data.dName || "Người chơi" };
  let game;
  if (mention) {
    if (String(mention.uid) === String(sender.id) || String(mention.uid) === String(api.getBotId())) {
      await api.sendMessage({ msg: "⚠️ Hãy tag một người chơi khác.", quote: message }, message.threadId, message.type); return;
    }
    const taggedName = body.slice(mention.pos, mention.pos + mention.len).replace(/^@/, "") || "Đối thủ";
    const taggedColor = args.map(normalizeColor).find(Boolean) || "b";
    const tagged = { id: mention.uid, name: taggedName };
    game = { threadId: message.threadId, chess: new Chess(), isBot: false, players: {}, viewColor: "w", createdAt: Date.now() };
    game.players[taggedColor] = tagged; game.players[taggedColor === "w" ? "b" : "w"] = sender;
  } else {
    const difficulty = BOT_LEVELS[first] ? first : null;
    if (!difficulty) { await api.sendMessage({ msg: help(prefix), quote: message }, message.threadId, message.type); return; }
    const botColor = args.map(normalizeColor).find(Boolean) || "b";
    const humanColor = botColor === "w" ? "b" : "w";
    game = { threadId: message.threadId, chess: new Chess(), isBot: true, difficulty, botColor, players: {}, viewColor: humanColor, createdAt: Date.now() };
    game.players[botColor] = { id: api.getBotId(), name: "Bot" };
    game.players[humanColor] = sender;
  }
  chessGames.set(message.threadId, game);
  await sendBoard(api, message, game, "♔ Ván cờ bắt đầu!", true);
  await botTurn(api, message, game);
}

export async function handleChessMessage(api, message, groupInfo) {
  const game = activeGame(message.threadId);
  if (!game) return false;
  const senderId = message.data.uidFrom;
  const color = playerColor(game, senderId);
  if (!color || (game.isBot && color === game.botColor)) return false;
  const text = typeof message.data.content === "string" ? message.data.content.trim().toLowerCase() : "";
  const surrender = ["thua", "lose", "dauhang", "đầuhàng"].includes(text.replace(/\s+/g, ""));
  const parsed = parseMove(text, game.chess.turn());
  if (!surrender && !parsed) return false;
  if (busyThreads.has(message.threadId)) return true;
  busyThreads.add(message.threadId);
  try {
    if (color !== game.chess.turn()) {
      await api.sendMessage({ msg: `⏳ Chưa đến lượt bạn. Lượt hiện tại: ${displayTurn(game)}.` }, message.threadId, message.type); return true;
    }
    if (surrender) {
      const winner = color === "w" ? "b" : "w";
      await endGame(api, message, game, `🏳 ${game.players[color].name} đầu hàng.\n♚ ${game.players[winner].name} thắng!`, winner, groupInfo); return true;
    }
    let move;
    try { move = game.chess.move(parsed); } catch { move = null; }
    if (!move) {
      await api.sendMessage({ msg: "❌ Nước đi không hợp lệ. Ví dụ: e2e4 hoặc e2 e4." }, message.threadId, message.type); return true;
    }
    game.lastMove = move;
    if (game.chess.isGameOver()) {
      const winner = game.chess.isCheckmate() ? color : null;
      await endGame(api, message, game, finishText(game), winner, groupInfo); return true;
    }
    if (!game.isBot) {
      const check = game.chess.inCheck() ? "⚠️ Chiếu!\n" : "";
      await sendBoard(api, message, game, check.trim() || "♟ Đã cập nhật bàn cờ.", true);
    } else await botTurn(api, message, game, groupInfo);
    return true;
  } finally { busyThreads.delete(message.threadId); }
}
