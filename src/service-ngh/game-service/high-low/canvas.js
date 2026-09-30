import { createCanvas, loadImage, registerFont } from "canvas";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import Big from "big.js";

import { getHighLowMultiplier, highLowCardLabel } from "./rules.js";
import { formatCurrency } from "../../../utils/format-util.js";

const WIDTH = 1000;
const HEIGHT = 690;
const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

try {
  registerFont(path.join(ROOT, "assets/fonts/Poppins-ExtraBold.ttf"), { family: "HighLowTitle", weight: "800" });
  registerFont(path.join(ROOT, "assets/fonts/Manrope-SemiBold.ttf"), { family: "HighLowText", weight: "600" });
} catch {}

function rounded(ctx, x, y, width, height, radius = 16) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function cardAssetPath(card) {
  const rank = ({ A: "ace", J: "jack", Q: "queen", K: "king" })[card.rank] || card.rank;
  const suit = ({ "♠": "spades", "♣": "clubs", "♦": "diamonds", "♥": "hearts" })[card.suit];
  return path.join(ROOT, `assets/data/cards/png/${rank}_of_${suit}.png`);
}

function compactMoney(value) {
  return formatCurrency(value);
}

function drawCardBack(ctx, x, y, width, height) {
  ctx.save();
  rounded(ctx, x, y, width, height, 12);
  ctx.clip();

  const base = ctx.createLinearGradient(x, y, x + width, y + height);
  base.addColorStop(0, "#071f25");
  base.addColorStop(0.48, "#0b5847");
  base.addColorStop(1, "#260912");
  ctx.fillStyle = base;
  ctx.fillRect(x, y, width, height);

  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = "#f0c868";
  ctx.lineWidth = 1;
  for (let offset = -height; offset < width + height; offset += 18) {
    ctx.beginPath();
    ctx.moveTo(x + offset, y);
    ctx.lineTo(x + offset - height, y + height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + offset, y);
    ctx.lineTo(x + offset + height, y + height);
    ctx.stroke();
  }
  ctx.restore();

  rounded(ctx, x + 9, y + 9, width - 18, height - 18, 9);
  ctx.strokeStyle = "#f5d77d";
  ctx.lineWidth = 3;
  ctx.stroke();
  rounded(ctx, x + 16, y + 16, width - 32, height - 32, 7);
  ctx.strokeStyle = "rgba(255, 239, 180, .42)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const centerX = x + width / 2;
  const centerY = y + height / 2;
  ctx.beginPath();
  ctx.arc(centerX, centerY, 48, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(5, 24, 25, .88)";
  ctx.fill();
  ctx.strokeStyle = "#f1c65e";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(centerX, centerY, 38, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(241, 198, 94, .52)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#f7db87";
  ctx.font = "800 31px HighLowTitle, sans-serif";
  ctx.fillText("HL", centerX, centerY - 2);
  ctx.fillStyle = "rgba(247, 219, 135, .72)";
  ctx.font = "600 9px HighLowText, sans-serif";
  ctx.fillText("BOT NGH", centerX, centerY + 23);
  ctx.restore();
}

function drawBackground(ctx) {
  const base = ctx.createRadialGradient(500, 300, 40, 500, 340, 650);
  base.addColorStop(0, "#6f111d");
  base.addColorStop(0.55, "#330811");
  base.addColorStop(1, "#0d090b");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = "#f6c85d";
  for (let radius = 80; radius < 700; radius += 48) {
    ctx.beginPath();
    ctx.arc(500, 320, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  rounded(ctx, 18, 18, WIDTH - 36, HEIGHT - 36, 28);
  ctx.strokeStyle = "#a96a2a";
  ctx.lineWidth = 8;
  ctx.stroke();
  rounded(ctx, 27, 27, WIDTH - 54, HEIGHT - 54, 22);
  ctx.strokeStyle = "#f3cc6c";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawStat(ctx, x, label, value, accent = false) {
  rounded(ctx, x, 130, 190, 66, 14);
  ctx.fillStyle = "rgba(25, 5, 10, .74)";
  ctx.fill();
  ctx.strokeStyle = accent ? "#d9a946" : "rgba(221, 157, 68, .42)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = "#c4a8a0";
  ctx.font = "600 13px HighLowText, sans-serif";
  ctx.fillText(label, x + 95, 153);
  ctx.fillStyle = accent ? "#6ee4c2" : "#fff0cf";
  ctx.font = "800 24px HighLowTitle, sans-serif";
  ctx.fillText(String(value), x + 95, 181);
}

async function drawCard(ctx, card, x, y, hidden = false) {
  const width = 190;
  const height = 266;
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, .65)";
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 12;
  rounded(ctx, x, y, width, height, 12);
  ctx.fillStyle = hidden ? "#124c35" : "#fffdf8";
  ctx.fill();
  ctx.shadowColor = "transparent";
  try {
    if (hidden) {
      drawCardBack(ctx, x, y, width, height);
    } else {
      const image = await loadImage(cardAssetPath(card));
      ctx.drawImage(image, x, y, width, height);
    }
  } catch {
    ctx.fillStyle = hidden ? "#e7d8a8" : (["♥", "♦"].includes(card?.suit) ? "#d62832" : "#17191d");
    ctx.textAlign = "center";
    ctx.font = "800 62px HighLowTitle, sans-serif";
    ctx.fillText(hidden ? "?" : highLowCardLabel(card), x + width / 2, y + height / 2 + 20);
  }
  rounded(ctx, x, y, width, height, 12);
  ctx.strokeStyle = "#f5e9c7";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

function oddsText(card, choice) {
  const multiplier = getHighLowMultiplier(card, choice);
  return multiplier == null ? "KHÔNG THỂ CHỌN" : `${multiplier.toFixed(2)}x · nhắn ${choice === "high" ? "cao/high" : "thấp/low"}`;
}

export async function createHighLowImage(session, { status = "playing", nextCard = null, choice = null } = {}) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  drawBackground(ctx);

  ctx.textAlign = "center";
  ctx.fillStyle = "#f5cf68";
  ctx.font = "800 42px HighLowTitle, sans-serif";
  ctx.fillText("HIGH - LOW", WIDTH / 2, 76);
  ctx.fillStyle = "#e7d8ca";
  ctx.font = "600 14px HighLowText, sans-serif";
  ctx.fillText("CAO THẤP  •  BOT NGH", WIDTH / 2, 104);

  drawStat(ctx, 75, "SCORE", session.score || 0);
  drawStat(ctx, 295, "STREAK", session.streak || 0);
  drawStat(ctx, 515, "GIÁ TRỊ CHUỖI", compactMoney(status === "lost" ? 0 : session.chain), true);
  drawStat(ctx, 735, "CÒN LẠI", session.deck?.length ?? 0);

  const leftCard = status === "lost" && session.previousCard ? session.previousCard : session.currentCard;
  ctx.fillStyle = "#eadbd0";
  ctx.font = "600 14px HighLowText, sans-serif";
  ctx.fillText(status === "lost" ? "LÁ TRƯỚC" : "LÁ HIỆN TẠI", 345, 230);
  ctx.fillText(nextCard ? "LÁ KẾ TIẾP" : "LÁ KẾ TIẾP", 655, 230);
  await drawCard(ctx, leftCard, 250, 246, false);
  await drawCard(ctx, nextCard, 560, 246, !nextCard);

  ctx.fillStyle = status === "lost" ? "#ff7d76" : status === "cashed" ? "#79e1ad" : "#c5853f";
  ctx.font = "800 38px HighLowTitle, sans-serif";
  ctx.fillText(status === "lost" ? "×" : status === "cashed" ? "✓" : "→", 500, 387);

  const highEnabled = getHighLowMultiplier(session.currentCard, "high") != null;
  const lowEnabled = getHighLowMultiplier(session.currentCard, "low") != null;
  rounded(ctx, 170, 545, 300, 78, 16);
  ctx.fillStyle = highEnabled ? "rgba(13, 45, 35, .82)" : "rgba(45, 31, 34, .72)";
  ctx.fill();
  ctx.strokeStyle = choice === "high" ? "#f3cf68" : highEnabled ? "#38c78f" : "#665158";
  ctx.lineWidth = choice === "high" ? 3 : 1.5;
  ctx.stroke();
  rounded(ctx, 530, 545, 300, 78, 16);
  ctx.fillStyle = lowEnabled ? "rgba(48, 15, 25, .86)" : "rgba(45, 31, 34, .72)";
  ctx.fill();
  ctx.strokeStyle = choice === "low" ? "#f3cf68" : lowEnabled ? "#df556d" : "#665158";
  ctx.lineWidth = choice === "low" ? 3 : 1.5;
  ctx.stroke();

  ctx.font = "800 23px HighLowTitle, sans-serif";
  ctx.fillStyle = highEnabled ? "#70e1ae" : "#826f73";
  ctx.fillText("↑  CAO", 320, 575);
  ctx.fillStyle = lowEnabled ? "#ff8091" : "#826f73";
  ctx.fillText("↓  THẤP", 680, 575);
  ctx.font = "600 13px HighLowText, sans-serif";
  ctx.fillStyle = highEnabled ? "#d7e9df" : "#826f73";
  ctx.fillText(oddsText(session.currentCard, "high"), 320, 603);
  ctx.fillStyle = lowEnabled ? "#ecdce0" : "#826f73";
  ctx.fillText(oddsText(session.currentCard, "low"), 680, 603);

  ctx.fillStyle = "rgba(232, 214, 198, .62)";
  ctx.font = "600 12px HighLowText, sans-serif";
  ctx.fillText(`${String(session.name || "Người chơi").slice(0, 34)}  •  Cược ${compactMoney(session.amount)}  •  Best ${session.best || 0}`, WIDTH / 2, 652);

  await fs.mkdir(path.join(ROOT, "assets/temp"), { recursive: true });
  const output = path.join(ROOT, `assets/temp/high_low_${randomUUID()}.png`);
  await fs.writeFile(output, canvas.toBuffer("image/png"));
  return output;
}
