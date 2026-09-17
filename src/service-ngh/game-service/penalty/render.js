import { createCanvas, registerFont } from "canvas";
import GIFEncoder from "gifencoder";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const W = 520, H = 440;
const font = fileURLToPath(new URL("../../../../assets/fonts/BeVietnamPro-Bold.ttf", import.meta.url));
registerFont(font, { family: "Penalty", weight: "bold" });
const CELL = { x: 80, y: 66, w: 116, h: 54, gapX: 6, gapY: 6 };
const MULTIPLIERS = [2.96, 2.28, 2.96, 2.03, 1.80, 2.03, 1.94, 1.77, 1.94];

function label(ctx, value, x, y, size, color, align = "center") {
  ctx.font = `bold ${size}px Penalty`; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(value, x, y);
}
function rounded(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function pos(number) { const n = number - 1; return { x: CELL.x + (n % 3) * (CELL.w + CELL.gapX), y: CELL.y + Math.floor(n / 3) * (CELL.h + CELL.gapY) }; }
function background(ctx) {
  const sky = ctx.createLinearGradient(0, 0, W, H); sky.addColorStop(0, "#302914"); sky.addColorStop(.55, "#1e1b11"); sky.addColorStop(1, "#080b08"); ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#d6b351"; for (let i = 0; i < 22; i++) { const x = (i * 83 + 19) % W, y = (i * 47 + 14) % 390; ctx.globalAlpha = .35 + (i % 3) * .15; ctx.beginPath(); ctx.arc(x, y, i % 4 ? 1.5 : 2.5, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1;
}
function goal(ctx, selected, won) {
  ctx.fillStyle = "#fff"; ctx.fillRect(68, 55, 8, 186); ctx.fillRect(444, 55, 8, 186); ctx.fillRect(68, 55, 384, 10);
  ctx.fillStyle = "#171a19"; ctx.fillRect(76, 65, 368, 175);
  for (let x = 82; x < 444; x += 18) { ctx.strokeStyle = "rgba(217,224,222,.27)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, 66); ctx.lineTo(x, 239); ctx.stroke(); }
  for (let y = 72; y < 240; y += 14) { ctx.strokeStyle = "rgba(217,224,222,.27)"; ctx.beginPath(); ctx.moveTo(76, y); ctx.lineTo(444, y); ctx.stroke(); }
  for (let n = 1; n <= 9; n++) {
    const p = pos(n), active = n === selected;
    rounded(ctx, p.x, p.y, CELL.w, CELL.h, 10); ctx.fillStyle = active ? (won ? "rgba(64,174,102,.35)" : "rgba(202,59,53,.35)") : "rgba(14,18,19,.36)"; ctx.fill();
    ctx.strokeStyle = active ? (won ? "#ffd369" : "#ff7971") : "rgba(238,240,235,.18)"; ctx.lineWidth = active ? 3 : 1; ctx.stroke();
    label(ctx, String(n), p.x + 9, p.y + 14, 10, "#a7aa9f", "left");
    label(ctx, `${MULTIPLIERS[n - 1].toFixed(2)}x`, p.x + CELL.w / 2, p.y + 34, 13, active ? "#fff6d9" : "#b9bcb4");
  }
}
function keeper(ctx, x, y, lean = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(lean); ctx.lineCap = "round";
  ctx.strokeStyle = "#e9edf0"; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(-9, 2); ctx.lineTo(-26, -30); ctx.moveTo(8, 2); ctx.lineTo(30, -20); ctx.stroke();
  ctx.strokeStyle = "#14253b"; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(-6, 38); ctx.lineTo(-17, 67); ctx.moveTo(6, 38); ctx.lineTo(17, 67); ctx.stroke();
  ctx.fillStyle = "#e9bc70"; rounded(ctx, -16, 0, 32, 42, 9); ctx.fill(); label(ctx, "1", 0, 27, 18, "#fff");
  ctx.fillStyle = "#f0c68a"; ctx.beginPath(); ctx.arc(0, -10, 12, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
function ball(ctx, x, y, scale = 1) { ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.fillStyle = "#f8f8ee"; ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill(); for (let i = 0; i < 5; i++) { const a = i * 1.256; ctx.beginPath(); ctx.arc(Math.cos(a) * 8, Math.sin(a) * 8, 2, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); }
function field(ctx) { ctx.fillStyle = "#158248"; ctx.fillRect(0, 240, W, 129); for (let y = 240; y < 369; y += 20) { ctx.fillStyle = y % 40 ? "rgba(0,0,0,.04)" : "rgba(255,255,255,.06)"; ctx.fillRect(0, y, W, 20); } ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(260, 330, 68, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
function frame(ctx, cell, won, blocked, keeperColumn, progress) {
  background(ctx); label(ctx, "⚽ SÚT PENALTY 11M", W / 2, 38, 23, "#ffd36d"); goal(ctx, cell.number, won); field(ctx);
  const target = pos(cell.number); const tx = target.x + CELL.w / 2, ty = target.y + CELL.h / 2;
  const bx = 260 + (tx - 260) * progress, by = 328 + (ty - 328) * progress;
  const keeperX = 138 + (keeperColumn - 1) * 128;
  keeper(ctx, won || progress < .65 ? 260 : keeperX, won || progress < .65 ? 175 : 177, won || progress < .65 ? 0 : (keeperX < 260 ? -.72 : keeperX > 260 ? .72 : 0));
  ball(ctx, bx, by, .55 + progress * .45);
  if (progress >= 1) { label(ctx, won ? "⚽ VÀOOOO!" : blocked ? "🧤 BỊ CẢN!" : "↗️ VỌT XÀ / CHỆCH!", W / 2, 404, 22, won ? "#80f0a6" : "#ff8d83"); label(ctx, `${cell.number} · ${cell.label} · ${cell.multiplier.toFixed(2)}x`, W / 2, 427, 13, "#e6e5d8"); }
}
export async function renderPenaltyGif(cell, won, blocked = false, keeperColumn = 2) {
  const output = path.resolve("assets/temp", `penalty_${randomUUID()}.gif`); await fs.mkdir(path.dirname(output), { recursive: true });
  const canvas = createCanvas(W, H), ctx = canvas.getContext("2d"), encoder = new GIFEncoder(W, H); encoder.start(); encoder.setRepeat(0); encoder.setQuality(10);
  for (const progress of [0, .2, .42, .65, .85, 1]) { frame(ctx, cell, won, blocked, keeperColumn, progress); encoder.setDelay(progress === 1 ? 1500 : 115); encoder.addFrame(ctx); }
  encoder.finish(); await fs.writeFile(output, encoder.out.getData()); return output;
}
