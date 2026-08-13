import { createCanvas, loadImage, registerFont } from "canvas";
import path from "path";
import fsPromises from "fs/promises";
import sharp from "sharp";
import { loadImageBuffer } from "../util.js";
import { getFontCanvas } from "../format-util.js";

const C_BORDER    = "rgba(255,255,255,0.16)";
const C_TITLE     = "#ffffff";
const C_SUB       = "rgba(255,255,255,0.72)";
const CARD_FONT   = "Manrope, Arial, sans-serif";

try {
  const manropeDir = path.join(process.cwd(), "assets", "fonts");
  registerFont(path.join(manropeDir, "Manrope-Regular.ttf"), { family: "Manrope", weight: "normal" });
  registerFont(path.join(manropeDir, "Manrope-SemiBold.ttf"), { family: "Manrope", weight: "600" });
  registerFont(path.join(manropeDir, "Manrope-Bold.ttf"), { family: "Manrope", weight: "bold" });
} catch (error) {
  console.warn(`[canvas] Không thể load font Manrope: ${error?.message || error}`);
}

function getCardFont(text) {
  const fallback = getFontCanvas(String(text || ""));
  return fallback.startsWith("Noto") ? fallback : CARD_FONT;
}

function drawBlendedBackground(ctx, width, height) {
  const base = ctx.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, "#32145f");
  base.addColorStop(0.48, "#263f82");
  base.addColorStop(1, "#087b78");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  const blobs = [
    [width * 0.15, height * 0.15, width * 0.5, "rgba(255,88,190,.34)"],
    [width * 0.72, height * 0.1, width * 0.42, "rgba(91,126,255,.30)"],
    [width * 0.82, height * 0.95, width * 0.48, "rgba(34,238,190,.28)"],
  ];
  for (const [x, y, radius, color] of blobs) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, color);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }
}

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

function drawImageCover(ctx, image, x, y, width, height) {
  const imageRatio = image.width / image.height;
  const targetRatio = width / height;
  let sx = 0;
  let sy = 0;
  let sw = image.width;
  let sh = image.height;
  if (imageRatio > targetRatio) {
    sw = image.height * targetRatio;
    sx = (image.width - sw) / 2;
  } else {
    sh = image.width / targetRatio;
    sy = (image.height - sh) / 2;
  }
  ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
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

export async function createMusicCard(musicInfo, botId) {
  const theme = { border: C_BORDER, title: C_TITLE, sub: C_SUB };
  const width = 1200;
  const height = 368;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const PAD = 34;
  const thumbSize = height - PAD * 2;
  const thumbX = PAD;
  const thumbY = PAD;

  try {
    let thumbnail = null;
    let blurredBackground = null;
    if (musicInfo.thumbnailPath) {
      try {
        const buffer = await loadImageBuffer(musicInfo.thumbnailPath);
        if (buffer) {
          const blurredBuffer = await sharp(buffer)
            .resize(width, height, { fit: "cover" })
            .blur(26)
            .modulate({ brightness: 0.72, saturation: 0.88 })
            .png()
            .toBuffer();
          [thumbnail, blurredBackground] = await Promise.all([
            loadImage(buffer),
            loadImage(blurredBuffer),
          ]);
        }
      } catch {}
    }

    // Paint every pixel opaque. Zalo may convert PNG to JPEG; transparent
    // corners would otherwise be flattened to white.
    ctx.fillStyle = "#111722";
    ctx.fillRect(0, 0, width, height);
    if (blurredBackground) drawImageCover(ctx, blurredBackground, 0, 0, width, height);
    else drawBlendedBackground(ctx, width, height);

    const darken = ctx.createLinearGradient(0, 0, width, 0);
    darken.addColorStop(0, "rgba(7,10,18,0.30)");
    darken.addColorStop(0.4, "rgba(7,10,18,0.48)");
    darken.addColorStop(1, "rgba(7,10,18,0.64)");
    ctx.fillStyle = darken;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    roundRectPath(ctx, 16.5, 16.5, width - 33, height - 33, 22);
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.38)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    roundRectPath(ctx, thumbX, thumbY, thumbSize, thumbSize, 22);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.clip();
    if (thumbnail) {
      drawImageCover(ctx, thumbnail, thumbX, thumbY, thumbSize, thumbSize);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.fillRect(thumbX, thumbY, thumbSize, thumbSize);
      ctx.font = `700 64px ${CARD_FONT}`;
      ctx.fillStyle = theme.title;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("♪", thumbX + thumbSize / 2, thumbY + thumbSize / 2);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
    ctx.restore();

    const textX = thumbX + thumbSize + 48;
    const rightZoneW = 70;
    const maxTextWidth = width - textX - PAD - rightZoneW;

    const title = musicInfo.title || "Unknown Title";
    ctx.font = `700 42px ${getCardFont(title)}`;
    ctx.fillStyle = theme.title;
    const titleLines = wrapTitle(ctx, title, maxTextWidth, 2);

    const lineHeight = 51;
    const blockHeight = titleLines.length * lineHeight + 46;
    let textY = (height - blockHeight) / 2 + 46;

    for (const line of titleLines) {
      ctx.fillText(line, textX, textY);
      textY += lineHeight;
    }

    textY += 10;
    const subtitle = (musicInfo.artists || musicInfo.artist || musicInfo.category || "Không rõ nghệ sĩ").toString();
    ctx.font = `normal 20px ${getCardFont(subtitle)}`;
    ctx.fillStyle = theme.sub;
    ctx.fillText(clampText(ctx, subtitle, maxTextWidth), textX, textY);

    const source = String(musicInfo.source || musicInfo.category || "NGH Music");
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,0.86)";
    ctx.font = `normal 17px ${getCardFont(source)}`;
    ctx.fillText(clampText(ctx, source, 220), width - PAD, PAD + 19);

    const duration = String(musicInfo.durationText || musicInfo.duration || "").trim();
    if (duration) {
      ctx.fillStyle = "rgba(255,255,255,0.90)";
      ctx.font = `700 21px ${CARD_FONT}`;
      ctx.fillText(duration, width - PAD, height - PAD);
    }
    ctx.textAlign = "left";

  } catch (error) {
    console.error("Lỗi khi tạo music card:", error);
    throw error;
  }

  const filePath = path.resolve(`./assets/temp/music_${Date.now()}.png`);
  await fsPromises.writeFile(filePath, canvas.toBuffer());
  return filePath;
}
