import { Canvas } from "skia-canvas";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";
import { createCanvas } from "canvas";
import GIFEncoder from "gifencoder";
import { formatCurrency } from "../../../utils/format-util.js";
import { WHEEL_SEGMENTS } from "./rules.js";

function rounded(ctx, x, y, width, height, radius = 18) { ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); }

const GIF_WIDTH = 440;
const GIF_HEIGHT = 500;
const VISUAL_SEGMENTS = WHEEL_SEGMENTS.flatMap((segment, index) => [
  { ...segment, visualIndex: index * 2 },
  { ...segment, visualIndex: index * 2 + 1, color: index % 2 ? "#5365b9" : segment.color },
]);

function gifText(ctx, value, x, y, size, color, align = "center", weight = "bold") {
  ctx.font = `${weight} ${size}px Arial`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(value, x, y);
}

function roundedGif(ctx, x, y, width, height, radius, color) {
  ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.fillStyle = color; ctx.fill();
}

function easeOutQuint(progress) { return 1 - (1 - progress) ** 5; }

function drawWheelGifFrame(ctx, result, amount, returned, frame, totalFrames) {
  const finished = frame >= totalFrames - 3;
  const progress = Math.min(1, frame / (totalFrames - 4));
  const target = result.index * 2;
  const slice = Math.PI * 2 / VISUAL_SEGMENTS.length;
  const rotation = easeOutQuint(progress) * (Math.PI * 2 * 6 - (target + .5) * slice);
  const cx = 220, cy = 246, radius = 158;
  const background = ctx.createRadialGradient(cx, cy, 10, cx, cy, 360);
  background.addColorStop(0, "#342913"); background.addColorStop(.62, "#14120b"); background.addColorStop(1, "#090a08");
  ctx.fillStyle = background; ctx.fillRect(0, 0, GIF_WIDTH, GIF_HEIGHT);
  for (let i = 0; i < 42; i++) {
    const x = (i * 79 + 31) % GIF_WIDTH, y = (i * 131 + 19) % GIF_HEIGHT;
    ctx.fillStyle = i % 4 ? "rgba(255,205,72,.36)" : "rgba(255,242,180,.7)";
    ctx.fillRect(x, y, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
  }
  gifText(ctx, "VÒNG QUAY MAY MẮN", cx, 23, 14, "#f5cf68");

  ctx.save(); ctx.shadowColor = "rgba(0,0,0,.85)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 8;
  ctx.beginPath(); ctx.arc(cx, cy, radius + 9, 0, Math.PI * 2); ctx.fillStyle = "#c9962c"; ctx.fill(); ctx.restore();
  ctx.beginPath(); ctx.arc(cx, cy, radius + 5, 0, Math.PI * 2); ctx.fillStyle = "#201b10"; ctx.fill();
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(rotation);
  VISUAL_SEGMENTS.forEach((segment, index) => {
    const start = -Math.PI / 2 + index * slice, end = start + slice;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, radius, start, end); ctx.closePath(); ctx.fillStyle = segment.color; ctx.fill();
    ctx.strokeStyle = "rgba(255,244,181,.8)"; ctx.lineWidth = 1; ctx.stroke();
    const angle = start + slice / 2;
    ctx.save(); ctx.rotate(angle); gifText(ctx, segment.multiplier === 0 ? "0x" : segment.multiplier === 50 ? "HŨ" : `${segment.multiplier}x`, radius * .69, 0, 11, "#fff", "center"); ctx.restore();
  });
  ctx.restore();
  ctx.beginPath(); ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2); ctx.strokeStyle = "#ffe180"; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, 47, 0, Math.PI * 2); ctx.fillStyle = "#181914"; ctx.fill(); ctx.strokeStyle = "#e3b43f"; ctx.lineWidth = 3; ctx.stroke();
  gifText(ctx, "VÒNG", cx, cy - 8, 11, "#ffd866"); gifText(ctx, "QUAY", cx, cy + 8, 11, "#ffd866");
  // Kim đứng yên, bánh xe ở dưới nó xoay và dừng đúng ô kết quả.
  ctx.beginPath(); ctx.moveTo(cx - 13, 43); ctx.lineTo(cx + 13, 43); ctx.lineTo(cx, 75); ctx.closePath(); ctx.fillStyle = "#fff2a7"; ctx.fill(); ctx.strokeStyle = "#a76e18"; ctx.lineWidth = 2; ctx.stroke();

  if (!finished) gifText(ctx, progress > .82 ? "Sắp dừng rồi..." : "Đang quay...", cx, 441, 13, "#d9d3bc");
  else {
    roundedGif(ctx, 39, 415, 362, 63, 8, "rgba(10,12,10,.93)");
    const win = returned.gt(0), color = result.multiplier > 1 ? "#81e88d" : result.multiplier === 1 ? "#8dd7ff" : "#ff8791";
    roundedGif(ctx, 48, 426, 57, 38, 6, color);
    gifText(ctx, result.multiplier === 0 ? "0x" : `${result.multiplier}x`, 76, 445, 16, "#10130f");
    gifText(ctx, result.label, 117, 431, 14, "#fff", "left");
    gifText(ctx, `Nhận ${formatCurrency(returned)} VNĐ`, 117, 448, 12, win ? "#81e88d" : "#ff9a9a", "left");
    gifText(ctx, `Cược ${formatCurrency(amount)} VNĐ`, 117, 464, 10, "#b8b9ae", "left", "normal");
  }
}

/** GIF vòng quay có kết quả đã được chọn trước; không random trong lúc render. */
export async function createLuckyWheelGif(result, amount, returned) {
  const output = path.join(os.tmpdir(), `lucky-wheel-${randomUUID()}.gif`);
  const canvas = createCanvas(GIF_WIDTH, GIF_HEIGHT), ctx = canvas.getContext("2d"), encoder = new GIFEncoder(GIF_WIDTH, GIF_HEIGHT);
  const totalFrames = 48;
  encoder.start(); encoder.setRepeat(0); encoder.setQuality(10);
  for (let frame = 0; frame < totalFrames; frame++) {
    encoder.setDelay(frame >= totalFrames - 3 ? 1600 : 70);
    drawWheelGifFrame(ctx, result, amount, returned, frame, totalFrames);
    encoder.addFrame(ctx);
  }
  encoder.finish();
  await fs.writeFile(output, encoder.out.getData());
  return output;
}

export async function createLuckyWheelImage(result, amount, returned) {
  const width = 1000, height = 1040; const canvas = new Canvas(width, height); const ctx = canvas.getContext("2d");
  const bg = ctx.createRadialGradient(500, 440, 30, 500, 520, 700); bg.addColorStop(0, "#3b2055"); bg.addColorStop(.55, "#17132d"); bg.addColorStop(1, "#070812"); ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#f6d977"; ctx.textAlign = "left"; ctx.font = "bold 16px sans-serif"; ctx.fillText("TRÒ CHƠI MAY MẮN", 40, 37); ctx.fillStyle = "#fff"; ctx.font = "bold 40px sans-serif"; ctx.fillText("VÒNG QUAY", 40, 83);
  const cx = 500, cy = 445, radius = 330, slice = Math.PI * 2 / WHEEL_SEGMENTS.length;
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,.75)"; ctx.shadowBlur = 35; ctx.shadowOffsetY = 18; ctx.beginPath(); ctx.arc(cx, cy, radius + 18, 0, Math.PI * 2); ctx.fillStyle = "#e2bd55"; ctx.fill(); ctx.restore();
  WHEEL_SEGMENTS.forEach((segment, index) => {
    const start = -Math.PI / 2 + index * slice, end = start + slice; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, radius, start, end); ctx.closePath(); ctx.fillStyle = segment.color; ctx.fill(); ctx.strokeStyle = "rgba(255,237,176,.7)"; ctx.lineWidth = index === result.index ? 6 : 2; ctx.stroke();
    const angle = start + slice / 2; ctx.save(); ctx.translate(cx + Math.cos(angle) * 225, cy + Math.sin(angle) * 225); ctx.rotate(angle + Math.PI / 2); ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "bold 18px sans-serif"; ctx.fillText(segment.multiplier === 0 ? "MẤT" : `×${segment.multiplier}`, 0, 0); ctx.restore();
  });
  ctx.beginPath(); ctx.arc(cx, cy, 86, 0, Math.PI * 2); ctx.fillStyle = "#151126"; ctx.fill(); ctx.strokeStyle = "#f0ce69"; ctx.lineWidth = 7; ctx.stroke(); ctx.fillStyle = "#f8dd7e"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "bold 25px sans-serif"; ctx.fillText("MAY MẮN", cx, cy);
  const pointerAngle = -Math.PI / 2 + (result.index + .5) * slice; const px = cx + Math.cos(pointerAngle) * (radius + 8), py = cy + Math.sin(pointerAngle) * (radius + 8); ctx.save(); ctx.translate(px, py); ctx.rotate(pointerAngle + Math.PI / 2); ctx.beginPath(); ctx.moveTo(-18, -36); ctx.lineTo(18, -36); ctx.lineTo(0, 8); ctx.closePath(); ctx.fillStyle = "#fff2aa"; ctx.fill(); ctx.restore();
  rounded(ctx, 90, 815, 820, 145, 25); ctx.fillStyle = "rgba(5,5,15,.74)"; ctx.fill(); ctx.strokeStyle = result.multiplier >= 5 ? "#f2d16b" : "rgba(255,255,255,.15)"; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = result.multiplier > 1 ? "#ffe17e" : result.multiplier === 1 ? "#74e0bb" : "#ff8791"; ctx.font = "bold 34px sans-serif"; ctx.fillText(result.label.toUpperCase(), 500, 854);
  ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.font = "bold 13px sans-serif"; ctx.fillText(`CƯỢC ${formatCurrency(amount)} VNĐ`, 290, 909); ctx.fillText("TIỀN NHẬN", 650, 909); ctx.fillStyle = "#fff"; ctx.font = "bold 22px sans-serif"; ctx.fillText(`${formatCurrency(returned)} VNĐ`, 650, 938);
  ctx.fillStyle = "rgba(255,255,255,.4)"; ctx.font = "bold 12px sans-serif"; ctx.fillText("Mỗi lượt quay là một kết quả độc lập", 500, 1004);
  await fs.mkdir(path.resolve("./assets/temp"), { recursive: true }); const output = path.resolve(`./assets/temp/vongquay_${Date.now()}.png`); await fs.writeFile(output, await canvas.toBuffer("image/png")); return output;
}
