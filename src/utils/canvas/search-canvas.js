import { createCanvas, loadImage, registerFont } from "canvas";
import fs from "fs/promises";
import path from "path";
import { loadImageBuffer } from "../util.js";

const fontPath = path.join(process.cwd(), "assets", "fonts");
try {
  registerFont(path.join(fontPath, "BeVietnamPro-Bold.ttf"), { family: "BeVietnamPro", weight: "bold" });
  registerFont(path.join(fontPath, "BeVietnamPro-Medium.ttf"), { family: "BeVietnamPro", weight: "normal" });
} catch {}
/* Ch? dùng 2 weight "bold" và "normal" trong toàn b? ctx.font bên du?i —
   ph?i kh?p chính xác chu?i weight dã registerFont ? trên, tránh canvas fallback
   sang font h? th?ng thi?u glyph d?u ti?ng Vi?t (d, u, ...).
   Không dùng ký t? Unicode d?c bi?t (icon, emoji, ?...) làm text v? tr?c ti?p —
   BeVietnamPro không có các glyph dó nên s? hi?n ô vuông l?i.
   Icon placeholder du?c v? b?ng canvas path (hình h?c) thay vì ký t? font. */

/* ---------- B?ng màu: gradient xanh duong -> xanh ng?c (gi?ng ?nh m?u) ---------- */
const C_THUMB_BG = "#28304a"; // n?n placeholder ?nh khi không t?i du?c
const C_BAR       = "#5a6690"; // 3 v?ch icon placeholder
const C_TEXT      = "#ffffff"; // tiêu d? chính
const C_SUB       = "#c7cde3"; // ngh? si / ph? d?
const C_ITEM_BG   = "rgba(255,255,255,0.06)"; // n?n nh? cho t?ng item danh sách
const C_DIVIDER   = "rgba(255,255,255,0.08)"; // du?ng phân cách c?t
// Màu "lót" phía du?i toàn b? canvas. ?nh xu?t ra HOÀN TOÀN KHÔNG có alpha
// (opaque 100%) nên khi n?n t?ng chat (Zalo/Messenger...) nén ?nh sang JPEG
// (JPEG không h? tr? trong su?t), 4 góc s? KHÔNG b? t? d?ng tô tr?ng n?a —
// vì v?n di chúng dã là màu d?c (t?i, hài hòa v?i gradient) ch? không ph?i
// pixel trong su?t ch? b? flatten thành tr?ng.
const C_BACKDROP  = "#131a2e";

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
  while (out.length > 0 && ctx.measureText(`${out}...`).width > maxWidth) out = out.slice(0, -1);
  return out.length > 0 ? `${out}...` : "...";
}

function drawGradient(ctx, W, H) {
  // Gradient chéo xanh duong (trên-trái) -> xanh ng?c (du?i-ph?i), gi?ng ?nh m?u
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#2a4a8f");
  g.addColorStop(0.5, "#2e4570");
  g.addColorStop(1, "#1c7a72");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W * 0.1, H * 0.05, 0, W * 0.1, H * 0.05, W * 0.65);
  glow.addColorStop(0, "rgba(255,255,255,0.08)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

/* Icon 3 v?ch (equalizer) làm placeholder khi ?nh không t?i du?c */
function drawPlaceholderIcon(ctx, cx, cy, size) {
  const barW = Math.max(2, size * 0.14);
  const gap = barW * 0.8;
  const heights = [size * 0.35, size * 0.6, size * 0.45];
  const totalW = barW * 3 + gap * 2;
  let x = cx - totalW / 2;
  heights.forEach((h) => {
    roundRectPath(ctx, x, cy - h / 2, barW, h, barW / 2);
    ctx.fillStyle = C_BAR;
    ctx.fill();
    x += barW + gap;
  });
}

/* V? ?nh theo ki?u "cover" (gi? t? l?, l?p d?y khung, c?t ph?n du)
   thay vì kéo giãn méo ?nh. */
function drawImageCover(ctx, img, x, y, w, h) {
  const ir = img.width / img.height;
  const tr = w / h;
  let sx, sy, sw, sh;
  if (ir > tr) {
    sh = img.height;
    sw = sh * tr;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = sw / tr;
    sx = 0;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function drawThumb(ctx, img, x, y, w, h, r) {
  ctx.save();
  roundRectPath(ctx, x, y, w, h, r);
  ctx.clip();
  if (img) {
    drawImageCover(ctx, img, x, y, w, h);
  } else {
    ctx.fillStyle = C_THUMB_BG;
    ctx.fillRect(x, y, w, h);
    drawPlaceholderIcon(ctx, x + w / 2, y + h / 2, Math.min(w, h) * 0.5);
  }
  ctx.restore();
}

/* Danh sách 1 c?t: m?i item có n?n th? nh?, s? th? t? g?n li?n vào tiêu d?
   (vd "2. Track 06 x Noi...") gi?ng b? c?c ?nh m?u. */
function drawListColumn(ctx, songs, images, startRank, x, y, colW, rowH, thumbS) {
  const padX = 9;
  const innerW = colW - padX * 2;
  songs.forEach((song, idx) => {
    const rank = startRank + idx;
    const rowY = y + idx * rowH;
    const rowCenterY = rowY + rowH / 2;

    roundRectPath(ctx, x, rowY + 3, colW, rowH - 6, 12);
    ctx.fillStyle = C_ITEM_BG;
    ctx.fill();

    const thumbX = x + padX;
    const thumbY = rowCenterY - thumbS / 2;
    drawThumb(ctx, images[idx], thumbX, thumbY, thumbS, thumbS, 9);

    const textX = thumbX + thumbS + 11;
    const textMaxW = x + innerW + padX - textX - 6;

    ctx.font = "bold 14px BeVietnamPro, Arial";
    ctx.fillStyle = C_TEXT;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(clampText(ctx, `${rank}. ${song?.title || "Unknown"}`, Math.max(30, textMaxW)), textX, rowCenterY - 4);

    ctx.font = "normal 11.5px BeVietnamPro, Arial";
    ctx.fillStyle = C_SUB;
    ctx.fillText(
      clampText(ctx, song?.artistsNames || song?.channelName || "Unknown Artist", Math.max(30, textMaxW)),
      textX,
      rowCenterY + 14
    );
  });
}

export async function createSearchResultImage(data) {
  const sorted = (Array.isArray(data) ? [...data] : []).slice(0, 16);
  if (sorted.length === 0) throw new Error("Không có d? li?u.");

  /* ---------- Kích thu?c & b? c?c 3 c?t (dã tang size t?ng th?) ---------- */
  const W = 900;
  const PAD = 28;
  const GAP = 20;
  const RADIUS = 26;

  const COL1_W = 270; // c?t trái: bài hàng d?u (hero)
  const listAreaW = W - PAD * 2 - COL1_W - GAP * 2;
  const COL2_W = Math.floor(listAreaW / 2);
  const COL3_W = listAreaW - COL2_W;

  const ROW_H = 58;
  const THUMB_S = 42;

  const rest = sorted.slice(1);
  const colACount = Math.ceil(rest.length / 2);
  const colA = rest.slice(0, colACount);
  const colB = rest.slice(colACount);

  const leftContentH = COL1_W + 16 + 24 + 18; // thumb + title/artist block
  const rightContentH = Math.max(colA.length, colB.length, 1) * ROW_H;
  const contentH = Math.max(leftContentH, rightContentH);
  const H = PAD * 2 + contentH;

  const thumbnails = await Promise.all(
    sorted.map(async (song) => {
      try {
        const buf = await loadImageBuffer(song?.thumbnailM || song?.thumbnail || song?.artwork_url);
        return buf ? await loadImage(buf) : null;
      } catch {
        return null;
      }
    })
  );

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // 1) Lót toàn b? canvas b?ng màu d?c (opaque, không alpha) — dây là bu?c
  //    then ch?t d? 4 góc không bao gi? b? "lòi tr?ng" khi app chat nén ?nh
  //    sang JPEG, vì không có pixel trong su?t nào c? d? b? flatten thành tr?ng.
  ctx.fillStyle = C_BACKDROP;
  ctx.fillRect(0, 0, W, H);

  // 2) V? card bo góc gradient + toàn b? n?i dung bên trong 1 clip duy nh?t,
  //    d?m b?o không có gì tràn ra ngoài du?ng bo và không có vi?n/rang cua.
  ctx.save();
  roundRectPath(ctx, 0, 0, W, H, RADIUS);
  ctx.clip();

  drawGradient(ctx, W, H);

  /* ---------- C?t 1: bài hàng d?u (hero) — s? g?n li?n tiêu d? ---------- */
  const hero = sorted[0];
  const col1X = PAD;
  const col1Y = PAD;

  drawThumb(ctx, thumbnails[0], col1X, col1Y, COL1_W, COL1_W, 18);

  const textY = col1Y + COL1_W + 16;

  ctx.font = "bold 20px BeVietnamPro, Arial";
  ctx.fillStyle = C_TEXT;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(clampText(ctx, `1. ${hero?.title || "Unknown"}`, COL1_W), col1X, textY + 18);

  ctx.font = "normal 14px BeVietnamPro, Arial";
  ctx.fillStyle = C_SUB;
  ctx.fillText(
    clampText(ctx, hero?.artistsNames || hero?.channelName || "Unknown Artist", COL1_W),
    col1X,
    textY + 40
  );

  /* ---------- Ðu?ng phân cách gi?a các c?t ---------- */
  const col2X = col1X + COL1_W + GAP;
  const col3X = col2X + COL2_W + GAP;

  ctx.strokeStyle = C_DIVIDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(col2X - GAP / 2, PAD);
  ctx.lineTo(col2X - GAP / 2, H - PAD);
  ctx.stroke();
  if (colB.length > 0) {
    ctx.beginPath();
    ctx.moveTo(col3X - GAP / 2, PAD);
    ctx.lineTo(col3X - GAP / 2, H - PAD);
    ctx.stroke();
  }

  /* ---------- C?t 2 & 3: danh sách còn l?i ---------- */
  const listY = PAD + Math.max(0, (contentH - rightContentH) / 2);

  if (colA.length > 0) {
    drawListColumn(ctx, colA, thumbnails.slice(1, 1 + colA.length), 2, col2X, listY, COL2_W, ROW_H, THUMB_S);
  }
  if (colB.length > 0) {
    drawListColumn(
      ctx,
      colB,
      thumbnails.slice(1 + colA.length, 1 + colA.length + colB.length),
      2 + colA.length,
      col3X,
      listY,
      COL3_W,
      ROW_H,
      THUMB_S
    );
  }

  ctx.restore();

  const filePath = path.resolve(`./assets/temp/search_result_${Date.now()}.png`);
  await fs.writeFile(filePath, canvas.toBuffer("image/png"));
  return filePath;
}