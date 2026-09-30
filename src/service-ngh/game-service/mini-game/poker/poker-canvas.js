import path from "path";
import { createCanvas } from "canvas";
import { tempDir } from "../../../../utils/io-json.js";
import { formatCurrency, randomIDTemp } from "../../../../utils/format-util.js";
import { writeFilePromise } from "../../../../utils/util.js";
import { SUIT_SYMBOLS, SUIT_COLORS, HAND_NAME_VI } from "./poker-core.js";

function fmtMoney(n) {
  return formatCurrency(n);
}

const CARD_W = 90;
const CARD_H = 130;
const CARD_RADIUS = 10;

// Vẽ badge (FOLD / WIN / TURN) ở vị trí (xRight, y), neo phải.
function drawBadge(ctx, xRight, y, text, bgColor, textColor) {
  ctx.save();
  ctx.font = "bold 11px Arial";
  const padX = 7;
  const w = ctx.measureText(text).width + padX * 2;
  const h = 18;
  const x = xRight - w;
  roundRect(ctx, x, y, w, h, 9);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.fillStyle = textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + w / 2, y + h / 2 + 0.5);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Vẽ 1 lá bài tại vị trí (x, y). hidden=true thì vẽ mặt sau.
function drawCard(ctx, card, x, y, opts = {}) {
  const { highlight = false, hidden = false } = opts;

  // Body trắng với shadow
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 6;
  roundRect(ctx, x, y, CARD_W, CARD_H, CARD_RADIUS);
  ctx.fillStyle = "#fafafa";
  ctx.fill();
  ctx.restore();

  if (hidden) {
    // Mặt sau lá bài: gradient + pattern hình thoi
    roundRect(ctx, x + 3, y + 3, CARD_W - 6, CARD_H - 6, CARD_RADIUS - 2);
    const grad = ctx.createLinearGradient(x, y, x + CARD_W, y + CARD_H);
    grad.addColorStop(0, "#8b1f1f");
    grad.addColorStop(0.5, "#5a1212");
    grad.addColorStop(1, "#2a0606");
    ctx.fillStyle = grad;
    ctx.fill();
    // Diamond pattern
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, x + 3, y + 3, CARD_W - 6, CARD_H - 6, CARD_RADIUS - 2);
    ctx.clip();
    ctx.strokeStyle = "rgba(255, 215, 100, 0.18)";
    ctx.lineWidth = 1;
    const step = 14;
    for (let i = -CARD_H; i < CARD_W + CARD_H; i += step) {
      ctx.beginPath();
      ctx.moveTo(x + i, y);
      ctx.lineTo(x + i + CARD_H, y + CARD_H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + i + CARD_H, y);
      ctx.lineTo(x + i, y + CARD_H);
      ctx.stroke();
    }
    ctx.restore();
    // Gold inner frame
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#e8c060";
    roundRect(ctx, x + 7, y + 7, CARD_W - 14, CARD_H - 14, CARD_RADIUS - 4);
    ctx.stroke();
    // Center logo
    ctx.fillStyle = "#e8c060";
    ctx.font = "bold 28px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("♠", x + CARD_W / 2, y + CARD_H / 2);
    return;
  }

  // Subtle gradient highlight on front
  const cardGrad = ctx.createLinearGradient(x, y, x, y + CARD_H);
  cardGrad.addColorStop(0, "#ffffff");
  cardGrad.addColorStop(1, "#e8e8ec");
  roundRect(ctx, x, y, CARD_W, CARD_H, CARD_RADIUS);
  ctx.fillStyle = cardGrad;
  ctx.fill();

  // Highlight bài thắng
  if (highlight) {
    ctx.save();
    ctx.shadowColor = "#ffd700";
    ctx.shadowBlur = 22;
    roundRect(ctx, x - 1, y - 1, CARD_W + 2, CARD_H + 2, CARD_RADIUS + 1);
    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  } else {
    roundRect(ctx, x, y, CARD_W, CARD_H, CARD_RADIUS);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  const color = SUIT_COLORS[card.suit] || "#000";
  ctx.fillStyle = color;

  // Rank+suit ở góc trên trái
  ctx.font = "bold 22px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(card.rank, x + 8, y + 8);
  ctx.font = "20px Arial";
  ctx.fillText(SUIT_SYMBOLS[card.suit], x + 8, y + 30);

  // Suit lớn ở giữa
  ctx.font = "56px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(SUIT_SYMBOLS[card.suit], x + CARD_W / 2, y + CARD_H / 2 + 4);

  // Rank+suit lộn ngược ở góc dưới phải
  ctx.save();
  ctx.translate(x + CARD_W - 8, y + CARD_H - 8);
  ctx.rotate(Math.PI);
  ctx.font = "bold 22px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(card.rank, 0, 0);
  ctx.font = "20px Arial";
  ctx.fillText(SUIT_SYMBOLS[card.suit], 0, 22);
  ctx.restore();
}

// Vẽ bàn chơi: cộng đồng + pot + thông tin pha hiện tại.
// players: [{ name, holeCards, hidden, folded, bet, balance, isWinner, handName }]
// communityCards: lá bài chung (5 lá max, hidden=true cho lá chưa lật)
// pot: pot pool
// phase: "preflop" | "flop" | "turn" | "river" | "showdown"
export async function renderTable({
  players,
  communityCards,
  pot,
  phase,
  bigBlind,
  smallBlind,
  showAllHoles = false,
}) {
  const width = 1200;
  const height = 950;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // ─── Background: dark casino vibe ───
  const bg = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, width / 1.2);
  bg.addColorStop(0, "#1a1a2e");
  bg.addColorStop(0.5, "#0f0f1e");
  bg.addColorStop(1, "#050510");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Hạt sáng ngẫu nhiên rải đều cho không khí lung linh
  for (let i = 0; i < 80; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const r = Math.random() * 1.2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 215, 100, ${Math.random() * 0.5 + 0.1})`;
    ctx.fill();
  }

  // ─── Bàn elip - khung gỗ vàng đôi ───
  const tableRx = width / 2 - 70;
  const tableRy = height / 2 - 70;
  ctx.save();
  // Outer wood ring với gradient nâu vàng
  ctx.beginPath();
  ctx.ellipse(width / 2, height / 2, tableRx + 18, tableRy + 18, 0, 0, Math.PI * 2);
  const woodGrad = ctx.createLinearGradient(0, height / 2 - tableRy, 0, height / 2 + tableRy);
  woodGrad.addColorStop(0, "#8b5a2b");
  woodGrad.addColorStop(0.5, "#5e3a18");
  woodGrad.addColorStop(1, "#3a2208");
  ctx.fillStyle = woodGrad;
  ctx.fill();
  // Inner gold trim
  ctx.beginPath();
  ctx.ellipse(width / 2, height / 2, tableRx + 8, tableRy + 8, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "#d4a050";
  ctx.lineWidth = 3;
  ctx.stroke();
  // Felt surface
  ctx.beginPath();
  ctx.ellipse(width / 2, height / 2, tableRx, tableRy, 0, 0, Math.PI * 2);
  const feltGrad = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, 500);
  feltGrad.addColorStop(0, "#2d8855");
  feltGrad.addColorStop(0.6, "#1a6035");
  feltGrad.addColorStop(1, "#0a3a1c");
  ctx.fillStyle = feltGrad;
  ctx.fill();
  // Vignette inner shadow
  ctx.beginPath();
  ctx.ellipse(width / 2, height / 2, tableRx, tableRy, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.restore();

  // ─── Tiêu đề (suit symbols ♠♥ render được) + phase plain text ───
  ctx.save();
  ctx.shadowColor = "rgba(255, 200, 0, 0.6)";
  ctx.shadowBlur = 20;
  ctx.fillStyle = "#ffd700";
  ctx.font = "bold 32px Arial";
  ctx.textAlign = "center";
  ctx.fillText("♠ TEXAS HOLD'EM ♥", width / 2, 36);
  ctx.restore();
  // Phase plain text (không pill bg để không đè wood ring)
  const phaseLabel = {
    preflop: "PRE-FLOP",
    flop: "FLOP",
    turn: "TURN",
    river: "RIVER",
    showdown: "SHOWDOWN",
  };
  const pLabel = phaseLabel[phase] || String(phase).toUpperCase();
  ctx.font = "bold 14px Arial";
  ctx.fillStyle = "rgba(255, 215, 0, 0.85)";
  ctx.textAlign = "center";
  ctx.fillText(pLabel, width / 2, 60);

  // ─── Cộng đồng cards ở giữa với spotlight ───
  const communityY = height / 2 - CARD_H / 2 - 40;
  const totalCW = 5 * CARD_W + 4 * 15;
  const communityX0 = width / 2 - totalCW / 2;
  // Spotlight halo
  ctx.save();
  const halo = ctx.createRadialGradient(width / 2, height / 2, 30, width / 2, height / 2, 380);
  halo.addColorStop(0, "rgba(255, 255, 255, 0.08)");
  halo.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  for (let i = 0; i < 5; i++) {
    const cx = communityX0 + i * (CARD_W + 15);
    const card = communityCards[i];
    if (card) {
      drawCard(ctx, card, cx, communityY);
    } else {
      // Placeholder slot — viền vàng mờ
      ctx.save();
      roundRect(ctx, cx, communityY, CARD_W, CARD_H, CARD_RADIUS);
      ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
      ctx.fill();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "rgba(255, 215, 0, 0.35)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  // ─── Pot — chip stack icon + số tiền nổi bật ───
  const potY = communityY + CARD_H + 50;
  // Chip icon (vẽ stack chip ngang chữ)
  ctx.save();
  ctx.font = "bold 28px Arial";
  ctx.fillStyle = "#ffd700";
  ctx.textAlign = "center";
  const potText = `♦ POT: ${fmtMoney(pot)} VND ♦`;
  const potW = ctx.measureText(potText).width + 40;
  // Background pill cho pot
  roundRect(ctx, width / 2 - potW / 2, potY - 22, potW, 38, 19);
  const potBg = ctx.createLinearGradient(width / 2 - potW / 2, potY - 22, width / 2 - potW / 2, potY + 16);
  potBg.addColorStop(0, "rgba(80, 45, 0, 0.85)");
  potBg.addColorStop(1, "rgba(40, 20, 0, 0.85)");
  ctx.fillStyle = potBg;
  ctx.fill();
  ctx.strokeStyle = "#ffd700";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowColor = "rgba(255, 215, 0, 0.7)";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#ffd700";
  ctx.fillText(potText, width / 2, potY + 4);
  ctx.restore();

  // (Bỏ blinds info — overlap với panel player dưới)

  // Vẽ người chơi xung quanh bàn (tối đa 6 vị trí)
  const positions = computeSeatPositions(width, height, players.length);
  for (let i = 0; i < players.length; i++) {
    drawPlayer(ctx, players[i], positions[i], showAllHoles, height);
  }

  const outPath = path.resolve(tempDir, `poker_${randomIDTemp()}.png`);
  const buf = canvas.toBuffer("image/png");
  await writeFilePromise(outPath, buf);
  return outPath;
}

function computeSeatPositions(width, height, n) {
  const cx = width / 2;
  const cy = height / 2;
  const rx = width / 2 - 130;
  // n=2: top player cần đủ chỗ cho cards (124px) + handname (24px) + gap (28px) ≈ 175px phía trên box (90px)
  // Title chiếm y=0..90. Top player center y phải ≥ 90 + 175 + 45 (box half) = 310.
  // Bottom player center y ≤ canvasH - 90 - 175 - 45 = 950 - 310 = 640.
  // -> ry n=2 = (640 - 310) / 2 = 165
  const ry = n <= 2 ? 165 : height / 2 - 200;
  const positions = [];
  for (let i = 0; i < n; i++) {
    const angle = Math.PI / 2 + (i * 2 * Math.PI) / n;
    const px = cx + rx * Math.cos(angle);
    const py = cy + ry * Math.sin(angle);
    positions.push({ x: px, y: py });
  }
  return positions;
}

function drawPlayer(ctx, player, pos, showAllHoles, canvasH = 950) {
  const boxW = 220;
  const boxH = 90;
  const bx = pos.x - boxW / 2;
  const by = pos.y - boxH / 2;
  // Player ở nửa trên: vẽ cards bên TRÊN box. Nửa dưới: vẽ DƯỚI.
  const isUpper = pos.y < canvasH / 2;

  // Khung thông tin người chơi
  ctx.save();
  if (player.isWinner) {
    ctx.shadowColor = "#ffd700";
    ctx.shadowBlur = 18;
  }
  // Outer glow cho winner / current turn
  if (player.isWinner) {
    ctx.shadowColor = "#ffd700";
    ctx.shadowBlur = 25;
  } else if (player.isCurrentTurn) {
    ctx.shadowColor = "#00d9ff";
    ctx.shadowBlur = 18;
  }
  roundRect(ctx, bx, by, boxW, boxH, 14);
  const grad = ctx.createLinearGradient(bx, by, bx, by + boxH);
  if (player.folded) {
    grad.addColorStop(0, "rgba(60, 60, 70, 0.85)");
    grad.addColorStop(1, "rgba(25, 25, 30, 0.85)");
  } else if (player.isWinner) {
    grad.addColorStop(0, "#b8860b");
    grad.addColorStop(0.5, "#704800");
    grad.addColorStop(1, "#3a2400");
  } else if (player.isCurrentTurn) {
    grad.addColorStop(0, "#0080a8");
    grad.addColorStop(1, "#003858");
  } else {
    grad.addColorStop(0, "#22293a");
    grad.addColorStop(1, "#0e1320");
  }
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = player.isWinner ? "#ffd700" : player.isCurrentTurn ? "#00d9ff" : "rgba(120, 130, 160, 0.5)";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();

  // Tên + status badge cùng dòng đầu
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 17px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const nameDisplay = (player.name || "Player").slice(0, 14);
  ctx.fillText(nameDisplay, bx + 12, by + 10);

  // Badge bên phải
  if (player.folded) {
    drawBadge(ctx, bx + boxW - 12, by + 12, "FOLD", "#666", "#fff");
  } else if (player.isWinner) {
    drawBadge(ctx, bx + boxW - 12, by + 12, "♠ WIN", "#d4a000", "#fff");
  } else if (player.isCurrentTurn) {
    drawBadge(ctx, bx + boxW - 12, by + 12, "TURN", "#00bbe6", "#fff");
  }

  // Balance + bet — dùng suit symbols (chắc chắn render được)
  ctx.font = "13px Arial";
  ctx.fillStyle = "#d8e8ff";
  ctx.fillText(`♣ Bal: ${fmtMoney(player.balance || 0)}`, bx + 12, by + 36);
  ctx.fillStyle = "#ffb84d";
  ctx.fillText(`♥ Bet: ${fmtMoney(player.bet || 0)}`, bx + 12, by + 58);

  // Hole cards: kích thước lớn dễ nhìn. Trên thì vẽ phía trên box, dưới thì phía dưới.
  const ch = CARD_H * 0.95;
  const cw = CARD_W * 0.95;
  const gap = 10;
  const totalW = 2 * cw + gap;
  const cardsY = isUpper ? by - ch - 28 : by + boxH + 12; // chừa chỗ cho handname nếu vẽ trên
  const cardsX0 = pos.x - totalW / 2;

  if (Array.isArray(player.holeCards) && player.holeCards.length === 2) {
    const shouldHide = !showAllHoles && player.hidden;
    for (let i = 0; i < 2; i++) {
      const card = player.holeCards[i];
      const x = cardsX0 + i * (cw + gap);
      drawCardScaled(ctx, card, x, cardsY, cw, ch, {
        hidden: shouldHide,
        highlight: player.isWinner,
      });
    }
  }

  // Hand name (showdown): vẽ giữa cards và box, vị trí khác nhau tùy upper/lower
  if (player.handName && (showAllHoles || !player.hidden)) {
    ctx.fillStyle = "#ffd700";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    const handY = isUpper ? cardsY - 8 : cardsY + ch + 18;
    ctx.fillText(player.handName, pos.x, handY);
  }
}

function drawCardScaled(ctx, card, x, y, w, h, opts = {}) {
  const { hidden = false, highlight = false } = opts;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 2;
  roundRect(ctx, x, y, w, h, 6);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  if (hidden) {
    roundRect(ctx, x + 2, y + 2, w - 4, h - 4, 5);
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, "#7b1f1f");
    g.addColorStop(1, "#3a0a0a");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "#f0c060";
    ctx.lineWidth = 1.5;
    roundRect(ctx, x + 4, y + 4, w - 8, h - 8, 4);
    ctx.stroke();
    return;
  }

  if (highlight) {
    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, 6);
    ctx.stroke();
  }

  ctx.fillStyle = SUIT_COLORS[card.suit] || "#000";
  ctx.font = "bold 14px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(card.rank, x + 5, y + 5);
  ctx.font = "12px Arial";
  ctx.fillText(SUIT_SYMBOLS[card.suit], x + 5, y + 20);

  ctx.font = "30px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(SUIT_SYMBOLS[card.suit], x + w / 2, y + h / 2 + 2);
}

// Render bài riêng gửi DM cho 1 player: 2 lá hole to + 5 lá cộng đồng nhỏ phía dưới
export async function renderPrivateHand({ playerName, holeCards, communityCards = [], phase = "preflop" }) {
  const width = 720;
  const height = 480;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Background tối sang
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, "#1a2030");
  bg.addColorStop(1, "#0a0f18");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Tiêu đề
  ctx.fillStyle = "#ffd700";
  ctx.font = "bold 26px Arial";
  ctx.textAlign = "center";
  ctx.fillText(`🃏 BÀI CỦA ${(playerName || "BẠN").toUpperCase()}`, width / 2, 40);

  ctx.fillStyle = "#cccccc";
  ctx.font = "16px Arial";
  const phaseLabel = { preflop: "Pre-flop", flop: "Flop", turn: "Turn", river: "River", showdown: "Showdown" };
  ctx.fillText(phaseLabel[phase] || phase, width / 2, 64);

  // 2 lá hole to ở giữa
  const holeW = CARD_W * 1.6;
  const holeH = CARD_H * 1.6;
  const gap = 24;
  const totalW = 2 * holeW + gap;
  const startX = width / 2 - totalW / 2;
  const holeY = 90;
  for (let i = 0; i < 2; i++) {
    const c = holeCards[i];
    if (!c) continue;
    drawBigCard(ctx, c, startX + i * (holeW + gap), holeY, holeW, holeH);
  }

  // 5 lá community nhỏ ở dưới
  if (communityCards.length > 0) {
    ctx.fillStyle = "#888";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.fillText("BÀI CỘNG ĐỒNG", width / 2, holeY + holeH + 30);

    const smallW = CARD_W * 0.7;
    const smallH = CARD_H * 0.7;
    const sGap = 10;
    const totalSW = 5 * smallW + 4 * sGap;
    const sStartX = width / 2 - totalSW / 2;
    const sY = holeY + holeH + 50;
    for (let i = 0; i < 5; i++) {
      const c = communityCards[i];
      const x = sStartX + i * (smallW + sGap);
      if (c) {
        drawCardScaled(ctx, c, x, sY, smallW, smallH);
      } else {
        // Placeholder
        ctx.save();
        ctx.globalAlpha = 0.2;
        roundRect(ctx, x, sY, smallW, smallH, 6);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // Footer notice
  ctx.fillStyle = "#666";
  ctx.font = "italic 13px Arial";
  ctx.textAlign = "center";
  ctx.fillText("🔒 Chỉ mình bạn thấy được bài này", width / 2, height - 20);

  const outPath = path.resolve(tempDir, `poker_hand_${randomIDTemp()}.png`);
  const buf = canvas.toBuffer("image/png");
  await writeFilePromise(outPath, buf);
  return outPath;
}

function drawBigCard(ctx, card, x, y, w, h) {
  // Shadow + body
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 4;
  ctx.shadowOffsetY = 6;
  roundRect(ctx, x, y, w, h, 12);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  roundRect(ctx, x, y, w, h, 12);
  ctx.strokeStyle = "#444";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = SUIT_COLORS[card.suit] || "#000";
  ctx.font = "bold 36px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(card.rank, x + 14, y + 12);
  ctx.font = "30px Arial";
  ctx.fillText(SUIT_SYMBOLS[card.suit], x + 14, y + 50);

  ctx.font = "82px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(SUIT_SYMBOLS[card.suit], x + w / 2, y + h / 2 + 6);

  ctx.save();
  ctx.translate(x + w - 14, y + h - 12);
  ctx.rotate(Math.PI);
  ctx.font = "bold 36px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(card.rank, 0, 0);
  ctx.font = "30px Arial";
  ctx.fillText(SUIT_SYMBOLS[card.suit], 0, 38);
  ctx.restore();
}

// Render kết quả showdown chi tiết: ai thắng, hand combos
export async function renderShowdown({ winners, allPlayers, communityCards, pot }) {
  const winnerNames = winners.map((w) => w.name).join(", ");
  const winnerHand = winners[0]?.handName || "";
  // Đánh dấu winner trong allPlayers
  const playersWithFlags = allPlayers.map((p) => ({
    ...p,
    hidden: false,
    isWinner: winners.some((w) => w.userId === p.userId),
  }));
  return await renderTable({
    players: playersWithFlags,
    communityCards,
    pot,
    phase: "showdown",
    showAllHoles: true,
  });
}

export { fmtMoney };
