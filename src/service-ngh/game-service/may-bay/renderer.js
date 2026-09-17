import { createCanvas, registerFont } from "canvas";
import GIFEncoder from "gifencoder";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const WIDTH = 640, HEIGHT = 460;
const fontPath = fileURLToPath(new URL("../../../../assets/fonts/BeVietnamPro-Bold.ttf", import.meta.url));
registerFont(fontPath, { family: "MayBay", weight: "bold" });
const W = WIDTH, H = HEIGHT, LEFT = 70, RIGHT = 602, TOP = 94, BOTTOM = 367;

function text(ctx, value, x, y, size, color, align = "left") {
  ctx.font = `bold ${size}px MayBay`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(String(value), x, y);
}
function box(ctx, x, y, w, h, radius, color) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill();
}
function glow(ctx, x, y, radius, color) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color); gradient.addColorStop(1, "transparent");
  ctx.fillStyle = gradient; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}
function shortName(ctx, value, width) {
  let name = String(value || "Người chơi").replace(/[\r\n\t]/g, " ");
  if (ctx.measureText(name).width <= width) return name;
  while (name.length && ctx.measureText(`${name}…`).width > width) name = name.slice(0, -1);
  return `${name}…`;
}
function plane(ctx, x, y, angle, scale = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(scale, scale);
  glow(ctx, -8, 0, 46, "#57e6ca75");
  ctx.fillStyle = "#ffce62";
  ctx.beginPath(); ctx.moveTo(-26, -4); ctx.lineTo(-50, 0); ctx.lineTo(-26, 5); ctx.fill();
  ctx.shadowColor = "#73f9df"; ctx.shadowBlur = 13; ctx.fillStyle = "#f0fff6";
  ctx.beginPath(); ctx.moveTo(30, 0); ctx.quadraticCurveTo(16, -8, -14, -5);
  ctx.lineTo(-25, -16); ctx.lineTo(-32, -16); ctx.lineTo(-26, -3); ctx.lineTo(-32, 4);
  ctx.lineTo(-20, 7); ctx.lineTo(-11, 5); ctx.lineTo(-17, 26); ctx.lineTo(-7, 24);
  ctx.lineTo(9, 5); ctx.quadraticCurveTo(23, 5, 30, 0); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = "#b9dcd7";
  ctx.beginPath(); ctx.moveTo(-10, -4); ctx.lineTo(-20, -23); ctx.lineTo(-13, -23); ctx.lineTo(7, -4); ctx.fill();
  ctx.fillStyle = "#188b9b"; ctx.beginPath(); ctx.ellipse(17, -2, 5, 2, 0, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 4; i++) ctx.fillRect(3 - i * 6, -2, 3, 3);
  ctx.restore();
}
function parachute(ctx, x, y, color = "#ffdc78") {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(x, y, 7, Math.PI, 0); ctx.closePath(); ctx.stroke();
  for (const dx of [-7, 0, 7]) { ctx.beginPath(); ctx.moveTo(x + dx, y); ctx.lineTo(x, y + 9); ctx.stroke(); }
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y + 10, 2, 0, 2 * Math.PI); ctx.fill(); ctx.restore();
}
function background(ctx, frame, crashed) {
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, crashed ? "#5c0d20" : "#080f27");
  gradient.addColorStop(0.6, crashed ? "#351328" : "#11234a");
  gradient.addColorStop(1, crashed ? "#402330" : "#544459");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 88; i++) {
    const x = (i * 101 + 13) % W, y = (i * 47 + 19) % (H - 90);
    ctx.fillStyle = `rgba(206,236,255,${0.18 + (i % 5) * 0.09})`; ctx.fillRect(x, y, i % 6 ? 1 : 2, i % 6 ? 1 : 2);
  }
  for (let i = 0; i < 13; i++) {
    const x = ((i * 153 - frame * 1.8) % (W + 150)) - 40, y = 330 + (i % 4) * 27;
    ctx.fillStyle = "#bac4e00e"; ctx.beginPath(); ctx.ellipse(x, y, 76 + i % 3 * 15, 20 + i % 3 * 3, 0, 0, Math.PI * 2); ctx.fill();
  }
}
function ceiling(point) {
  return [1.5, 2, 3, 5, 10, 20, 50, 100].find(n => n >= point * 1.04) || 100;
}
function drawReplayFrame(ctx, round, index) {
  const flightFrames = 32, crashFrame = Math.max(0, index - flightFrames), crashed = index >= flightFrames;
  const progress = Math.min(1, index / (flightFrames - 1));
  const cap = ceiling(round.crashPoint);
  const maxLog = Math.max(Math.log2(round.crashPoint), 0.05);
  const current = crashed ? round.crashPoint : Math.max(1, Math.floor((round.crashPoint ** progress) * 100) / 100);
  const yFor = m => BOTTOM - (m - 1) / (cap - 1) * (BOTTOM - TOP);
  const xFor = m => LEFT + Math.log2(m) / maxLog * (RIGHT - LEFT);
  background(ctx, index, crashed);
  if (crashed && crashFrame < 4) {
    ctx.fillStyle = `rgba(255,48,49,${0.35 * (1 - crashFrame / 4)})`; ctx.fillRect(0, 0, W, H);
  }
  plane(ctx, 31, 33, -0.55, 0.32);
  text(ctx, `MÁY BAY · #${round.number}`, 52, 43, 22, "#ffd36f");
  box(ctx, 451, 10, 175, 58, 12, crashed ? "#270711a0" : "#0b1a2b90");
  ctx.save(); ctx.shadowColor = crashed ? "#ff4949" : "#57ebc9"; ctx.shadowBlur = 16;
  text(ctx, `${current.toFixed(2)}x`, 615, 53, 42, crashed ? "#ff6569" : "#96ffe0", "right"); ctx.restore();
  const levels = cap <= 3 ? [1, 1.5, 2, cap] : [1, cap / 4, cap / 2, cap];
  for (const level of [...new Set(levels)]) {
    if (level < 1 || level > cap) continue;
    const y = yFor(level);
    ctx.strokeStyle = level === cap ? "#dfba6755" : "#bad4f014";
    ctx.lineWidth = 1; ctx.setLineDash(level === cap ? [5, 6] : []);
    ctx.beginPath(); ctx.moveTo(LEFT, y); ctx.lineTo(RIGHT, y); ctx.stroke(); ctx.setLineDash([]);
    text(ctx, `${level}x`, LEFT - 10, y + 5, 12, level === cap ? "#ecc263" : "#819bab", "right");
  }
  const points = Array.from({ length: 61 }, (_, n) => {
    const t = progress * n / 60, m = round.crashPoint ** t;
    return [LEFT + t * (RIGHT - LEFT), yFor(m)];
  });
  const [px, py] = points.at(-1);
  ctx.beginPath(); ctx.moveTo(LEFT, BOTTOM);
  for (const [x, y] of points) ctx.lineTo(x, y);
  ctx.lineTo(px, BOTTOM); ctx.closePath();
  const fill = ctx.createLinearGradient(0, TOP, 0, BOTTOM);
  fill.addColorStop(0, crashed ? "#ff575d28" : "#64edbc25"); fill.addColorStop(1, "transparent");
  ctx.fillStyle = fill; ctx.fill();
  ctx.save(); ctx.strokeStyle = crashed ? "#ff6768" : "#7af5cf";
  ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 14; ctx.lineWidth = 4;
  ctx.beginPath(); for (const [n, point] of points.entries()) n ? ctx.lineTo(...point) : ctx.moveTo(...point); ctx.stroke(); ctx.restore();
  const winners = round.tickets.filter(t => ["cashed", "cashing"].includes(t.status)).sort((a, b) => a.multiplier - b.multiplier);
  for (const [n, ticket] of winners.slice(-4).entries()) {
    if (ticket.multiplier > current && !crashed) continue;
    const x = Math.min(RIGHT, xFor(ticket.multiplier)), y = yFor(ticket.multiplier);
    glow(ctx, x, y, 14, "#ffcc6060"); ctx.strokeStyle = "#ffe18c"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.stroke();
    const labelY = Math.min(BOTTOM - 15, Math.max(TOP + 25, y + (n % 2 ? 25 : -16)));
    const labelX = Math.min(RIGHT - 210, x + 15);
    parachute(ctx, labelX + 5, labelY - 6);
    ctx.font = "bold 12px MayBay";
    text(ctx, `${shortName(ctx, ticket.name, 132)} ${ticket.multiplier.toFixed(2)}x`, labelX + 18, labelY, 12, "#fff7e4");
  }
  if (!crashed) {
    const angle = -Math.atan(Math.log(round.crashPoint) * current * (BOTTOM - TOP) / ((cap - 1) * (RIGHT - LEFT)));
    plane(ctx, px, py, angle, 0.88);
    text(ctx, "Đang bay… gõ “rút” hoặc “nhảy” để nhảy dù", W / 2, 410, 15, "#d7ece9", "center");
    text(ctx, "TUA LẠI CHUYẾN BAY", W / 2, 440, 10, "#819bab", "center");
  } else {
    const radius = 25 + Math.min(crashFrame, 9) * 4;
    glow(ctx, px, py, radius * 2, "#ffbd4fa0");
    ctx.strokeStyle = `rgba(255,211,93,${Math.max(0.2, 1 - crashFrame / 18)})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(px, py, radius, 0, Math.PI * 2); ctx.stroke();
    for (let n = 0; n < 14; n++) {
      const angle = n / 14 * Math.PI * 2 + crashFrame * 0.05;
      ctx.beginPath(); ctx.moveTo(px + Math.cos(angle) * radius * 0.55, py + Math.sin(angle) * radius * 0.55);
      ctx.lineTo(px + Math.cos(angle) * radius * 1.4, py + Math.sin(angle) * radius * 1.4); ctx.stroke();
    }
    glow(ctx, px, py, 24, "#fff4b9");
    text(ctx, `NỔ TẠI ${round.crashPoint.toFixed(2)}x`, W / 2, 352, 32, "#ffdb7b", "center");
    box(ctx, 20, 377, W - 40, 69, 15, "#050d1ecc");
    const losers = round.tickets.filter(t => t.status === "lost").length;
    parachute(ctx, 40, 397, "#99efd4");
    text(ctx, `${winners.length} rút kịp`, 55, 408, 17, "#a4f3da");
    text(ctx, `${losers} không kịp`, W - 37, 408, 17, "#ff9e94", "right");
    const best = winners.at(-1);
    ctx.font = "bold 12px MayBay";
    text(ctx, best ? `Cao nhất: ${shortName(ctx, best.name, 220)} ${best.multiplier.toFixed(2)}x` : "Chậm một nhịp, lỡ cả chuyến bay!", 37, 432, 12, "#d6dce5");
  }
}

export async function renderCrashReplay(round, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const canvas = createCanvas(W, H), ctx = canvas.getContext("2d");
  const encoder = new GIFEncoder(W, H);
  encoder.start(); encoder.setRepeat(0); encoder.setQuality(12);
  for (let frame = 0; frame < 46; frame++) {
    encoder.setDelay(frame === 45 ? 1800 : 100);
    drawReplayFrame(ctx, round, frame); encoder.addFrame(ctx);
  }
  encoder.finish();
  await fs.writeFile(outputPath, encoder.out.getData());
  return outputPath;
}

export async function renderCrashHistory(history, outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const canvas = createCanvas(W, H), ctx = canvas.getContext("2d");
  background(ctx, 0, false);
  text(ctx, "MÁY BAY · 20 CHUYẾN GẦN NHẤT", 28, 48, 24, "#ffda7b");
  text(ctx, "Cũ → mới · Điểm nổ của từng chuyến", 28, 78, 13, "#a4b4c9");
  const entries = history.slice(-20);
  if (!entries.length) text(ctx, "Chưa có chuyến bay nào kết thúc.", W / 2, 247, 20, "#d3dfed", "center");
  entries.forEach((entry, i) => {
    const x = 28 + i % 5 * 120, y = 108 + Math.floor(i / 5) * 75;
    const color = entry.crashPoint < 2 ? "#ff97a2" : entry.crashPoint < 10 ? "#96f6d0" : "#ffda7b";
    box(ctx, x, y, 105, 62, 12, "#0c172ae0");
    text(ctx, `${entry.crashPoint.toFixed(2)}x`, x + 52, y + 30, 23, color, "center");
    text(ctx, `#${entry.number}`, x + 52, y + 49, 10, "#92a6c1", "center");
  });
  text(ctx, "Mỗi chuyến có điểm nổ ngẫu nhiên độc lập · Trần 100x", W / 2, 442, 12, "#b1c2d2", "center");
  await fs.writeFile(outputPath, canvas.toBuffer("image/png"));
  return outputPath;
}
