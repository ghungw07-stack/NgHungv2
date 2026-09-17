import { randomUUID } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { createCanvas } from "canvas";
import GIFEncoder from "gifencoder";

const WIDTH = 512;
const HEIGHT = 304;
const MAX_ROWS = 5;
const SPIN_FRAMES = 20;
const REEL_SYMBOLS = ["🍒", "🍋", "🔔", "⭐", "7️⃣", "💎", "🪙"];

function money(value) {
  return new Intl.NumberFormat("vi-VN").format(value);
}

function rounded(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fillRounded(ctx, x, y, width, height, radius, color) {
  rounded(ctx, x, y, width, height, radius);
  ctx.fillStyle = color;
  ctx.fill();
}

function text(ctx, value, x, y, size, color, align = "left", weight = "bold") {
  ctx.font = `${weight} ${size}px Arial`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(value, x, y);
}

function drawSymbol(ctx, symbol, x, y) {
  const palette = {
    "🍒": ["#721337", "#ff4f68"], "🍋": ["#5d5512", "#ffe350"], "🔔": ["#77500b", "#ffc928"],
    "⭐": ["#684b09", "#ffe062"], "7️⃣": ["#8e1111", "#ff6666"], "💎": ["#07526b", "#66e9ff"], "🪙": ["#7a4d08", "#ffd34e"],
  }[symbol] || ["#35405d", "#f5d55e"];
  fillRounded(ctx, x, y, 29, 29, 6, "#070b25");
  ctx.strokeStyle = palette[0]; ctx.lineWidth = 2; rounded(ctx, x + 1, y + 1, 27, 27, 5); ctx.stroke();
  text(ctx, symbol, x + 14.5, y + 15.5, 18, palette[1], "center", "normal");
}

// Không dùng Math.random ở đây: cùng một lượt luôn render ra animation ổn định,
// nhưng các ô chưa dừng vẫn thay biểu tượng ở mỗi khung hình như máy slot thật.
function rollingSymbol(row, column, frame) {
  return REEL_SYMBOLS[(row * 5 + column * 3 + frame * 2 + 1) % REEL_SYMBOLS.length];
}

function drawFrame(ctx, results, frame, spinFrames) {
  const displayed = results.slice(0, MAX_ROWS);
  const isFinal = frame >= spinFrames;
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, "#19043b"); gradient.addColorStop(0.55, "#35052b"); gradient.addColorStop(1, "#10051f");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  fillRounded(ctx, 10, 11, 492, 282, 20, "#ffce2b");
  fillRounded(ctx, 14, 15, 484, 274, 17, "#310638");
  const header = ctx.createLinearGradient(18, 18, 18, 68);
  header.addColorStop(0, "#d52995"); header.addColorStop(1, "#87115e");
  fillRounded(ctx, 18, 18, 476, 50, 11, header);
  for (let i = 0; i < 13; i++) { ctx.fillStyle = i % 3 === 0 ? "#fff08a" : "#bd5a9d"; ctx.beginPath(); ctx.arc(35 + i * 34, 26, i % 3 === 0 ? 3.5 : 3, 0, Math.PI * 2); ctx.fill(); }
  text(ctx, "🎰  NỔ HŨ", 34, 51, 23, "#fff7e8");
  text(ctx, `quay ${results.length} lần`, 480, 51, 14, "#fff4a8", "right");

  const rowHeight = 34;
  const activeIndex = isFinal ? -1 : displayed.findIndex((_, index) => frame < Math.ceil((index + 1) * spinFrames / displayed.length));
  displayed.forEach((result, index) => {
    const y = 73 + index * rowHeight;
    const active = index === activeIndex;
    fillRounded(ctx, 18, y, 476, 31, 7, active ? "#441050" : "#1d0b34");
    ctx.fillStyle = active ? "#ffdc40" : "#ff5678"; ctx.fillRect(19, y + 2, 3, 27);
    ctx.strokeStyle = "#cc9d25"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(44, y + 15.5, 10.5, 0, Math.PI * 2); ctx.stroke();
    text(ctx, String(index + 1), 44, y + 16, 13, "#ffe46a", "center", "normal");
    const settledAt = Math.ceil((index + 1) * spinFrames / displayed.length);
    const settled = isFinal || frame >= settledAt;
    (settled ? result.slots.map((slot) => slot.key) : [0, 1, 2].map((slotIndex) => rollingSymbol(index, slotIndex, frame)))
      .forEach((symbol, slotIndex) => drawSymbol(ctx, symbol, 65 + slotIndex * 33, y + 1));
    const net = result.returned.minus(result.amount);
    const shown = settled ? net : null;
    if (shown === null) return;
    const sign = shown.gt(0) ? "+" : shown.lt(0) ? "-" : "";
    const color = shown.gt(0) ? "#7df7b3" : shown.lt(0) ? "#ff7474" : "#f5d1d1";
    fillRounded(ctx, 406, y + 5, 76, 21, 12, shown.gt(0) ? "#126142" : "#bd303a");
    text(ctx, `${sign}${money(shown.abs())}`, 475, y + 16, 12, color, "right");
  });
  for (let index = displayed.length; index < MAX_ROWS; index++) {
    const y = 73 + index * rowHeight;
    fillRounded(ctx, 18, y, 476, 31, 7, "#1d0b34");
  }
  const total = results.reduce((sum, item) => sum.plus(item.returned), results[0].amount.times(0));
  const bet = results.reduce((sum, item) => sum.plus(item.amount), results[0].amount.times(0));
  fillRounded(ctx, 18, 246, 476, 39, 7, "#320f29");
  if (isFinal) {
    text(ctx, `CƯỢC: ${money(bet)} VNĐ`, 31, 267, 14, "#ffb2b2");
    text(ctx, `NHẬN: ${money(total)} VNĐ`, 481, 267, 14, total.gt(0) ? "#85ffc2" : "#ffb2b2", "right");
  } else text(ctx, "ĐANG QUAY...", 256, 267, 20, "#ffb2b2", "center");
}

/** Render GIF Nổ Hũ đúng với các lượt vừa quay. Caller có trách nhiệm xóa file sau khi gửi. */
export async function renderNoHuGif(results) {
  if (!Array.isArray(results) || !results.length) throw new Error("Thiếu kết quả Nổ Hũ để render GIF.");
  const outputPath = path.join(os.tmpdir(), `nohu-${randomUUID()}.gif`);
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  const encoder = new GIFEncoder(WIDTH, HEIGHT);
  encoder.start(); encoder.setRepeat(0); encoder.setQuality(10);
  for (let frame = 0; frame < SPIN_FRAMES + 2; frame++) {
    const final = frame >= SPIN_FRAMES;
    encoder.setDelay(final ? 1600 : 180);
    drawFrame(ctx, results, frame, SPIN_FRAMES);
    encoder.addFrame(ctx);
  }
  encoder.finish();
  await fs.writeFile(outputPath, encoder.out.getData());
  return outputPath;
}
