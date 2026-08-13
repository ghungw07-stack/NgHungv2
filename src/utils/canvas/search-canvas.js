import { createCanvas, loadImage, registerFont } from "canvas";
import fs from "fs/promises";
import path from "path";
import { loadImageBuffer } from "../util.js";

const fontPath = path.join(process.cwd(), "assets", "fonts");
try {
  registerFont(path.join(fontPath, "BeVietnamPro-Bold.ttf"), { family: "BeVietnamPro", weight: "700" });
  registerFont(path.join(fontPath, "BeVietnamPro-Medium.ttf"), { family: "BeVietnamPro", weight: "500" });
} catch {}

const COLORS = {
  bg: "#080a0f",
  surface: "#11141b",
  surfaceLight: "#171b24",
  text: "#f7f8fa",
  muted: "#9aa3b2",
  faint: "#606a79",
  border: "rgba(255,255,255,0.09)",
};

const THEMES = {
  MUSIC: { accent: "#b6f33d", accent2: "#53e0ba", label: "ÂM NHẠC", noun: "bài hát", action: "nghe" },
  VIDEO: { accent: "#ff6b4a", accent2: "#ffb23e", label: "VIDEO", noun: "video", action: "xem" },
  MEDIA: { accent: "#8b7cff", accent2: "#56c5ff", label: "KHÁM PHÁ", noun: "kết quả", action: "mở" },
};

function roundedPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fillRoundRect(ctx, x, y, width, height, radius, fill) {
  roundedPath(ctx, x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
}

function strokeRoundRect(ctx, x, y, width, height, radius, stroke = COLORS.border) {
  roundedPath(ctx, x + 0.5, y + 0.5, width - 1, height - 1, radius);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function truncate(ctx, value, maxWidth) {
  const text = String(value ?? "").trim();
  if (ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 0 && ctx.measureText(`${text.slice(0, end)}…`).width > maxWidth) end--;
  return end ? `${text.slice(0, end).trim()}…` : "…";
}

function subtitleOf(item) {
  const artists = Array.isArray(item?.artists)
    ? item.artists.map((artist) => artist?.name || artist).filter(Boolean).join(", ")
    : item?.artists;
  return item?.artistsNames || artists || item?.channelName || item?.author || item?.episode ||
    item?.category || item?.source || "Chưa có thông tin";
}

function metaOf(item) {
  return item?.durationText || item?.duration || item?.publishedTime || item?.quality || "";
}

function detectTheme(items) {
  const isMusic = items.some((item) =>
    item?.listen != null || item?.artists || item?.artistsNames || item?.artwork_url || item?.isPremium != null
  );
  const isVideo = items.some((item) =>
    item?.view != null || item?.publishedTime || item?.episode || item?.durationText || item?.videoId
  );
  return THEMES[isVideo && !isMusic ? "VIDEO" : isMusic ? "MUSIC" : "MEDIA"];
}

function drawImageCover(ctx, image, x, y, width, height) {
  const sourceRatio = image.width / image.height;
  const targetRatio = width / height;
  let sx = 0, sy = 0, sw = image.width, sh = image.height;
  if (sourceRatio > targetRatio) {
    sw = image.height * targetRatio;
    sx = (image.width - sw) / 2;
  } else {
    sh = image.width / targetRatio;
    sy = (image.height - sh) / 2;
  }
  ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
}

function drawFallback(ctx, x, y, width, height, index, theme) {
  const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
  gradient.addColorStop(0, index % 2 ? "#252a34" : "#1d2630");
  gradient.addColorStop(1, index % 2 ? "#151820" : "#11171d");
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, width, height);

  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 2;
  for (let offset = -height; offset < width; offset += 18) {
    ctx.beginPath();
    ctx.moveTo(x + offset, y + height);
    ctx.lineTo(x + offset + height, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawArtwork(ctx, image, x, y, width, height, index, theme) {
  ctx.save();
  roundedPath(ctx, x, y, width, height, 15);
  ctx.clip();
  if (image) drawImageCover(ctx, image, x, y, width, height);
  else drawFallback(ctx, x, y, width, height, index, theme);

  const shade = ctx.createLinearGradient(x, y, x, y + height);
  shade.addColorStop(0.5, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.3)");
  ctx.fillStyle = shade;
  ctx.fillRect(x, y, width, height);
  ctx.restore();
}

function drawSearchIcon(ctx, x, y, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.moveTo(x + 6, y + 6);
  ctx.lineTo(x + 13, y + 13);
  ctx.stroke();
}

function drawArrow(ctx, x, y) {
  ctx.strokeStyle = COLORS.faint;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x - 5, y);
  ctx.lineTo(x + 5, y);
  ctx.moveTo(x + 1, y - 4);
  ctx.lineTo(x + 5, y);
  ctx.lineTo(x + 1, y + 4);
  ctx.stroke();
}

function drawLogo(ctx, x, y, theme) {
  fillRoundRect(ctx, x, y, 42, 42, 13, theme.accent);
  ctx.fillStyle = COLORS.bg;
  [13, 22, 31].forEach((barX, index) => {
    const heights = [13, 23, 17];
    fillRoundRect(ctx, x + barX - 2.5, y + (42 - heights[index]) / 2, 5, heights[index], 3, COLORS.bg);
  });
}

export async function createSearchResultImage(data, botId) {
  const items = (Array.isArray(data) ? data : []).filter(Boolean).slice(0, 16);
  if (!items.length) throw new Error("Không có dữ liệu.");

  const theme = detectTheme(items);
  const width = 1200;
  const margin = 44;
  const headerHeight = 190;
  const cardHeight = 112;
  const rowGap = 14;
  const columnGap = 18;
  const rows = Math.ceil(items.length / 2);
  const footerHeight = 78;
  const height = Math.max(650, margin + headerHeight + rows * cardHeight + (rows - 1) * rowGap + footerHeight);
  const contentWidth = width - margin * 2;
  const columnWidth = (contentWidth - columnGap) / 2;

  const artworks = await Promise.all(items.map(async (item) => {
    try {
      const source = item?.thumbnailM || item?.thumbnail || item?.artwork_url || item?.image;
      if (!source) return null;
      const buffer = await loadImageBuffer(source);
      return buffer ? await loadImage(buffer) : null;
    } catch {
      return null;
    }
  }));

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#0c0f15");
  background.addColorStop(0.55, COLORS.bg);
  background.addColorStop(1, "#090c11");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(width - 160, -60, 0, width - 160, -60, 480);
  glow.addColorStop(0, `${theme.accent}2b`);
  glow.addColorStop(1, `${theme.accent}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, 480);

  // Brand and result count.
  drawLogo(ctx, margin, margin, theme);
  ctx.fillStyle = COLORS.text;
  ctx.font = "700 15px BeVietnamPro, Arial";
  ctx.fillText("NGH MEDIA", margin + 56, margin + 17);
  ctx.fillStyle = COLORS.faint;
  ctx.font = "500 10px BeVietnamPro, Arial";
  ctx.fillText("SMART SEARCH", margin + 56, margin + 35);

  fillRoundRect(ctx, width - margin - 158, margin + 3, 158, 36, 18, "rgba(255,255,255,0.055)");
  strokeRoundRect(ctx, width - margin - 158, margin + 3, 158, 36, 18);
  ctx.fillStyle = theme.accent;
  ctx.beginPath();
  ctx.arc(width - margin - 137, margin + 21, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.muted;
  ctx.font = "700 10px BeVietnamPro, Arial";
  ctx.fillText(`${String(items.length).padStart(2, "0")} KẾT QUẢ`, width - margin - 123, margin + 25);

  ctx.fillStyle = theme.accent;
  ctx.font = "700 11px BeVietnamPro, Arial";
  ctx.fillText(theme.label, margin, margin + 90);
  ctx.fillStyle = COLORS.text;
  ctx.font = "700 36px BeVietnamPro, Arial";
  ctx.fillText(`Chọn ${theme.noun} bạn muốn ${theme.action}`, margin, margin + 132);
  ctx.fillStyle = COLORS.muted;
  ctx.font = "500 13px BeVietnamPro, Arial";
  ctx.fillText("Nhập số thứ tự tương ứng để tiếp tục", margin, margin + 158);

  const hintWidth = 172;
  fillRoundRect(ctx, width - margin - hintWidth, margin + 107, hintWidth, 44, 14, `${theme.accent}16`);
  drawSearchIcon(ctx, width - margin - hintWidth + 24, margin + 128, theme.accent);
  ctx.fillStyle = COLORS.muted;
  ctx.font = "500 10px BeVietnamPro, Arial";
  ctx.fillText("CHỌN NHANH", width - margin - hintWidth + 49, margin + 123);
  ctx.fillStyle = COLORS.text;
  ctx.font = "700 11px BeVietnamPro, Arial";
  ctx.fillText("TRẢ LỜI BẰNG SỐ", width - margin - hintWidth + 49, margin + 139);

  const listY = margin + headerHeight;
  items.forEach((item, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = margin + column * (columnWidth + columnGap);
    const y = listY + row * (cardHeight + rowGap);

    const cardGradient = ctx.createLinearGradient(x, y, x + columnWidth, y + cardHeight);
    cardGradient.addColorStop(0, COLORS.surfaceLight);
    cardGradient.addColorStop(1, COLORS.surface);
    fillRoundRect(ctx, x, y, columnWidth, cardHeight, 20, cardGradient);
    strokeRoundRect(ctx, x, y, columnWidth, cardHeight, 20);

    drawArtwork(ctx, artworks[index], x + 10, y + 10, 92, 92, index, theme);
    fillRoundRect(ctx, x + 18, y + 70, 36, 24, 8, "rgba(7,9,13,0.86)");
    ctx.fillStyle = theme.accent;
    ctx.font = "700 10px BeVietnamPro, Arial";
    ctx.textAlign = "center";
    ctx.fillText(String(index + 1).padStart(2, "0"), x + 36, y + 86);

    const textX = x + 122;
    const meta = metaOf(item);
    const arrowArea = 42;
    const textWidth = columnWidth - 122 - arrowArea - 16;
    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.text;
    ctx.font = "700 14px BeVietnamPro, Arial";
    ctx.fillText(truncate(ctx, item?.title || "Không có tiêu đề", textWidth), textX, y + 39);
    ctx.fillStyle = COLORS.muted;
    ctx.font = "500 11px BeVietnamPro, Arial";
    ctx.fillText(truncate(ctx, subtitleOf(item), textWidth), textX, y + 64);

    if (meta) {
      ctx.fillStyle = theme.accent;
      ctx.beginPath();
      ctx.arc(textX + 3, y + 84, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.faint;
      ctx.font = "500 9px BeVietnamPro, Arial";
      ctx.fillText(truncate(ctx, meta, textWidth - 13), textX + 13, y + 87);
    }

    fillRoundRect(ctx, x + columnWidth - 45, y + 39, 28, 34, 10, "rgba(255,255,255,0.045)");
    drawArrow(ctx, x + columnWidth - 31, y + 56);
  });

  const footerY = height - 43;
  ctx.strokeStyle = COLORS.border;
  ctx.beginPath();
  ctx.moveTo(margin, footerY - 20);
  ctx.lineTo(width - margin, footerY - 20);
  ctx.stroke();
  ctx.fillStyle = COLORS.faint;
  ctx.font = "500 9px BeVietnamPro, Arial";
  ctx.fillText("POWERED BY NGH MEDIA", margin, footerY);
  ctx.textAlign = "right";
  ctx.fillText(botId ? `BOT • ${String(botId).slice(-6).toUpperCase()}` : "READY TO EXPLORE", width - margin, footerY);
  ctx.textAlign = "left";

  const filePath = path.resolve(`./assets/temp/search_result_${Date.now()}.png`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, canvas.toBuffer("image/png"));
  return filePath;
}
