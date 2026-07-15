import { createCanvas, loadImage } from "canvas";
import path from "path";
import fsPromises from "fs/promises";
import { loadImageBuffer } from "../util.js";
import { FONT_MAIN, getFontCanvas } from "../format-util.js";

/* ---------- Bảng màu sáng, tối giản (giống ảnh mẫu) ---------- */
const C_PAGE_BG   = "#e9ebf0"; // nền ngoài (viền quanh card)
const C_CARD_BG   = "#ffffff";
const C_BORDER    = "rgba(0,0,0,0.06)";
const C_TITLE     = "#14151a";
const C_SUB       = "#9096a3";
const C_PLAY_BG   = "#14151a";
const C_LIKE_FROM = "#ff7a3d";
const C_LIKE_TO   = "#ff4d6d";

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.floor(Math.min(w, h) / 2)));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function clampText(ctx, text, maxWidth) {
  let out = String(text || "");
  if (ctx.measureText(out).width <= maxWidth) return out;
  while (out.length > 0 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return out.length > 0 ? `${out}…` : "…";
}

/* Wrap tiêu đề tối đa 2 dòng, giống ảnh mẫu ("Nơi Này Có" / "Anh") */
function wrapTitle(ctx, text, maxWidth, maxLines = 2) {
  const words = String(text || "").split(" ").filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);

  if (lines.length === maxLines) {
    const lastIdx = words.length;
    const usedWords = lines.join(" ").split(" ").length;
    if (usedWords < lastIdx) {
      lines[maxLines - 1] = clampText(ctx, `${lines[maxLines - 1]}…`, maxWidth);
    }
  }
  return lines;
}

/* Nút tròn play (đen, tam giác trắng) */
function drawPlayButton(ctx, cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = C_PLAY_BG;
  ctx.fill();
  ctx.restore();

  const s = r * 0.62;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.42, cy - s * 0.58);
  ctx.lineTo(cx - s * 0.42, cy + s * 0.58);
  ctx.lineTo(cx + s * 0.62, cy);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
}

/* Nút tròn tim (gradient cam) */
function drawLikeButton(ctx, cx, cy, r) {
  const grad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  grad.addColorStop(0, C_LIKE_FROM);
  grad.addColorStop(1, C_LIKE_TO);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  const s = r * 0.85;
  ctx.save();
  ctx.translate(cx, cy - s * 0.08);
  ctx.beginPath();
  ctx.moveTo(0, s * 0.32);
  ctx.bezierCurveTo(-s * 0.1, s * 0.05, -s * 0.55, -s * 0.05, -s * 0.55, -s * 0.28);
  ctx.bezierCurveTo(-s * 0.55, -s * 0.5, -s * 0.22, -s * 0.55, 0, -s * 0.22);
  ctx.bezierCurveTo(s * 0.22, -s * 0.55, s * 0.55, -s * 0.5, s * 0.55, -s * 0.28);
  ctx.bezierCurveTo(s * 0.55, -s * 0.05, s * 0.1, s * 0.05, 0, s * 0.32);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
}

export async function createMusicCard(musicInfo) {
  const width = 900;
  const height = 260;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const PAD = 24;
  const thumbSize = height - PAD * 2;
  const thumbX = PAD;
  const thumbY = PAD;

  try {
    /* Nền ngoài + card trắng bo góc lớn */
    ctx.fillStyle = C_PAGE_BG;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    roundRectPath(ctx, 0, 0, width, height, 32);
    ctx.clip();
    ctx.fillStyle = C_CARD_BG;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    ctx.save();
    roundRectPath(ctx, 1, 1, width - 2, height - 2, 32);
    ctx.strokeStyle = C_BORDER;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    /* Thumbnail vuông bo góc */
    let thumbnail = null;
    if (musicInfo.thumbnailPath) {
      try {
        const buf = await loadImageBuffer(musicInfo.thumbnailPath);
        if (buf) thumbnail = await loadImage(buf);
      } catch {}
    }

    ctx.save();
    roundRectPath(ctx, thumbX, thumbY, thumbSize, thumbSize, 20);
    ctx.clip();
    if (thumbnail) {
      ctx.drawImage(thumbnail, thumbX, thumbY, thumbSize, thumbSize);
    } else {
      ctx.fillStyle = "#e4e6ec";
      ctx.fillRect(thumbX, thumbY, thumbSize, thumbSize);
      ctx.font = `700 40px ${FONT_MAIN}`;
      ctx.fillStyle = C_SUB;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("♪", thumbX + thumbSize / 2, thumbY + thumbSize / 2);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
    ctx.restore();

    /* Khối văn bản: tiêu đề (tối đa 2 dòng) + thể loại/nguồn */
    const textX = thumbX + thumbSize + 40;
    const rightZoneW = 220; // khoảng trống dành cho 2 nút tròn bên phải
    const maxTextWidth = width - textX - PAD - rightZoneW;

    const title = musicInfo.title || "Unknown Title";
    ctx.font = `800 42px ${getFontCanvas(title)}`;
    ctx.fillStyle = C_TITLE;
    const titleLines = wrapTitle(ctx, title, maxTextWidth, 2);

    const lineHeight = 50;
    const blockHeight = titleLines.length * lineHeight + 40; // + chỗ cho subtitle
    let textY = (height - blockHeight) / 2 + 42;

    for (const line of titleLines) {
      ctx.fillText(line, textX, textY);
      textY += lineHeight;
    }

    textY += 6;
    const subtitle = (musicInfo.category || musicInfo.artists || musicInfo.source || "").toString().toUpperCase();
    ctx.font = `600 22px ${FONT_MAIN}`;
    ctx.fillStyle = C_SUB;
    ctx.fillText(clampText(ctx, subtitle, maxTextWidth), textX, textY);

    /* Hai nút tròn bên phải: play + tim */
    const btnR = 46;
    const btnCy = height / 2;
    const likeCx = width - PAD - btnR;
    const playCx = likeCx - btnR * 2 - 24;

    drawPlayButton(ctx, playCx, btnCy, btnR);
    drawLikeButton(ctx, likeCx, btnCy, btnR);
  } catch (error) {
    console.error("Lỗi khi tạo music card:", error);
    throw error;
  }

  const filePath = path.resolve(`./assets/temp/music_${Date.now()}.png`);
  await fsPromises.writeFile(filePath, canvas.toBuffer());
  return filePath;
}