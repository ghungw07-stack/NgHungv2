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
  bg: "#f2efe7",
  surface: "#ffffff",
  surfaceLight: "#faf8f2",
  text: "#161b2b",
  muted: "#667085",
  faint: "#98a0af",
  border: "rgba(22,27,43,0.11)",
};

const THEMES = {
  MUSIC: { accent: "#3155ff", accent2: "#ffcf4a", label: "MUSIC", noun: "bài hát", action: "nghe" },
  VIDEO: { accent: "#f04438", accent2: "#ffd166", label: "VIDEO", noun: "video", action: "xem" },
  MEDIA: { accent: "#7347d8", accent2: "#5ee0c2", label: "DISCOVER", noun: "kết quả", action: "mở" },
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
  const width = 1280;
  const margin = 36;
  const sidebarWidth = 300;
  const heroHeight = 196;
  const heroGap = 22;
  const cardHeight = 108;
  const rowGap = 14;
  const columnGap = 16;
  const rows = Math.ceil(items.length / 2);
  const height = Math.max(820, margin * 2 + heroHeight + heroGap + rows * cardHeight + (rows - 1) * rowGap);
  const listX = margin + sidebarWidth + 30;
  const listWidth = width - listX - margin;
  const columnWidth = (listWidth - columnGap) / 2;

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

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);

  // Editorial paper texture.
  ctx.save();
  ctx.globalAlpha = 0.045;
  ctx.strokeStyle = COLORS.text;
  ctx.lineWidth = 1;
  for (let y = 18; y <= height; y += 24) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
  }
  ctx.restore();

  // Full-height editorial sidebar.
  const sideGradient = ctx.createLinearGradient(margin, margin, margin + sidebarWidth, height - margin);
  sideGradient.addColorStop(0, theme.accent);
  sideGradient.addColorStop(1, theme.accent2);
  fillRoundRect(ctx, margin, margin, sidebarWidth, height - margin * 2, 30, sideGradient);

  ctx.save();
  roundedPath(ctx, margin, margin, sidebarWidth, height - margin * 2, 30);
  ctx.clip();
  ctx.globalAlpha = 0.11;
  ctx.strokeStyle = COLORS.text;
  ctx.lineWidth = 34;
  ctx.beginPath();
  ctx.arc(margin + sidebarWidth + 35, margin + 135, 118, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(margin - 15, height - margin - 80, 92, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  fillRoundRect(ctx, margin + 24, margin + 24, 48, 48, 15, COLORS.text);
  drawSearchIcon(ctx, margin + 46, margin + 45, "#ffffff");
  ctx.fillStyle = COLORS.text;
  ctx.font = "700 11px BeVietnamPro, Arial";
  ctx.fillText(`NGH / ${theme.label}`, margin + 86, margin + 54);

  ctx.fillStyle = COLORS.text;
  ctx.font = "700 42px BeVietnamPro, Arial";
  ctx.fillText("CHỌN", margin + 24, margin + 154);
  ctx.fillText(theme.noun.toUpperCase(), margin + 24, margin + 203);
  ctx.fillText(`ĐỂ ${theme.action.toUpperCase()}`, margin + 24, margin + 252);

  ctx.globalAlpha = 0.72;
  ctx.font = "500 13px BeVietnamPro, Arial";
  ctx.fillText("Danh sách đã sẵn sàng.", margin + 24, margin + 294);
  ctx.fillText("Chỉ cần gửi lại một con số.", margin + 24, margin + 316);
  ctx.globalAlpha = 1;

  const countY = height - margin - 150;
  ctx.fillStyle = COLORS.text;
  ctx.font = "700 74px BeVietnamPro, Arial";
  ctx.fillText(String(items.length).padStart(2, "0"), margin + 22, countY);
  ctx.font = "700 11px BeVietnamPro, Arial";
  ctx.fillText("KẾT QUẢ TÌM THẤY", margin + 24, countY + 27);
  ctx.globalAlpha = 0.65;
  ctx.font = "500 9px BeVietnamPro, Arial";
  ctx.fillText(botId ? `BOT ID  /  ${String(botId).slice(-6)}` : "NGH MEDIA SYSTEM", margin + 24, height - margin - 25);
  ctx.globalAlpha = 1;

  // Feature the first result as a large hero cover on the right.
  const heroX = listX;
  const heroY = margin;
  fillRoundRect(ctx, heroX, heroY, listWidth, heroHeight, 26, COLORS.surface);
  strokeRoundRect(ctx, heroX, heroY, listWidth, heroHeight, 26);

  const heroImageWidth = 264;
  const heroImageX = heroX + listWidth - heroImageWidth;
  ctx.save();
  roundedPath(ctx, heroImageX, heroY, heroImageWidth, heroHeight, 26);
  ctx.clip();
  if (artworks[0]) drawImageCover(ctx, artworks[0], heroImageX, heroY, heroImageWidth, heroHeight);
  else drawFallback(ctx, heroImageX, heroY, heroImageWidth, heroHeight, 0, theme);
  const heroShade = ctx.createLinearGradient(heroImageX, heroY, heroImageX + 110, heroY);
  heroShade.addColorStop(0, COLORS.surface);
  heroShade.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = heroShade;
  ctx.fillRect(heroImageX, heroY, 112, heroHeight);
  ctx.restore();

  fillRoundRect(ctx, heroX + 24, heroY + 24, 86, 28, 14, `${theme.accent}14`);
  ctx.fillStyle = theme.accent;
  ctx.font = "700 9px BeVietnamPro, Arial";
  ctx.textAlign = "center";
  ctx.fillText("NỔI BẬT  01", heroX + 67, heroY + 42);
  ctx.textAlign = "left";
  ctx.fillStyle = COLORS.text;
  ctx.font = "700 24px BeVietnamPro, Arial";
  ctx.fillText(truncate(ctx, items[0]?.title || "Không có tiêu đề", listWidth - heroImageWidth - 62), heroX + 24, heroY + 88);
  ctx.fillStyle = COLORS.muted;
  ctx.font = "500 12px BeVietnamPro, Arial";
  ctx.fillText(truncate(ctx, subtitleOf(items[0]), listWidth - heroImageWidth - 62), heroX + 24, heroY + 115);
  const firstMeta = metaOf(items[0]);
  if (firstMeta) {
    fillRoundRect(ctx, heroX + 24, heroY + 137, 92, 28, 14, COLORS.text);
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 9px BeVietnamPro, Arial";
    ctx.textAlign = "center";
    ctx.fillText(truncate(ctx, firstMeta, 66), heroX + 70, heroY + 155);
    ctx.textAlign = "left";
  }

  // Compact magazine list.
  const listY = margin + heroHeight + heroGap;
  items.forEach((item, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = listX + column * (columnWidth + columnGap);
    const y = listY + row * (cardHeight + rowGap);

    ctx.save();
    ctx.shadowColor = "rgba(27,32,48,0.10)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 5;
    fillRoundRect(ctx, x, y, columnWidth, cardHeight, 18, COLORS.surface);
    ctx.restore();
    strokeRoundRect(ctx, x, y, columnWidth, cardHeight, 18);

    drawArtwork(ctx, artworks[index], x + 10, y + 10, 88, 88, index, theme);

    const badgeColor = index < 3 ? theme.accent : COLORS.text;
    fillRoundRect(ctx, x + 6, y + 6, 34, 27, 9, badgeColor);
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 10px BeVietnamPro, Arial";
    ctx.textAlign = "center";
    ctx.fillText(String(index + 1).padStart(2, "0"), x + 23, y + 24);

    const textX = x + 116;
    const textWidth = columnWidth - 158;
    ctx.textAlign = "left";
  ctx.fillStyle = COLORS.text;
    ctx.font = "700 13px BeVietnamPro, Arial";
    ctx.fillText(truncate(ctx, item?.title || "Không có tiêu đề", textWidth), textX, y + 35);
  ctx.fillStyle = COLORS.muted;
    ctx.font = "500 10px BeVietnamPro, Arial";
    ctx.fillText(truncate(ctx, subtitleOf(item), textWidth), textX, y + 57);
    const meta = metaOf(item);
    if (meta) {
      fillRoundRect(ctx, textX, y + 72, Math.min(94, ctx.measureText(String(meta)).width + 25), 22, 11, `${theme.accent}12`);
      ctx.fillStyle = theme.accent;
      ctx.font = "500 9px BeVietnamPro, Arial";
      ctx.fillText(truncate(ctx, meta, 70), textX + 11, y + 87);
    }
    drawArrow(ctx, x + columnWidth - 22, y + cardHeight / 2);
  });
  ctx.textAlign = "left";

  const filePath = path.resolve(`./assets/temp/search_result_${Date.now()}.png`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, canvas.toBuffer("image/png"));
  return filePath;
}
