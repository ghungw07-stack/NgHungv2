import { createCanvas, registerFont, loadImage } from "canvas";
import GIFEncoder from "gifencoder";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { SYMBOLS } from "./rules.js";
const W = 520, H = 470, X = 19, Y = 90, CW = 80, CH = 88;
const spritePath = path.resolve("assets/resources/game/quyet-chien/western-symbols.png");
registerFont(fileURLToPath(new URL("../../../../assets/fonts/BeVietnamPro-Bold.ttf", import.meta.url)), { family: "QuyetChien", weight: "bold" });
function text(ctx, value, x, y, size, color, align = "center") { ctx.font = `bold ${size}px QuyetChien`; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(value, x, y); }
function panel(ctx, x, y, w, h, fill, stroke = "#aa7738") { ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 3; ctx.stroke(); }
function backdrop(ctx) { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#8eb6bd"); g.addColorStop(.25, "#5c3421"); g.addColorStop(1, "#d4a766"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.fillStyle = "rgba(45,18,10,.87)"; ctx.fillRect(15, 61, 490, 303); }
function hat(ctx, x, y) { ctx.fillStyle = "#b34d92"; ctx.beginPath(); ctx.ellipse(x + 43, y + 57, 31, 9, -.12, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#7b285c"; ctx.beginPath(); ctx.roundRect(x + 25, y + 27, 37, 29, 8); ctx.fill(); ctx.fillStyle = "#ed78c2"; ctx.fillRect(x + 24, y + 50, 39, 5); }
function bottle(ctx, x, y) { ctx.fillStyle = "#d7dde0"; ctx.beginPath(); ctx.roundRect(x + 38, y + 16, 12, 19, 3); ctx.fill(); ctx.beginPath(); ctx.roundRect(x + 25, y + 31, 38, 39, 8); ctx.fill(); ctx.fillStyle = "#a84d2c"; ctx.beginPath(); ctx.roundRect(x + 28, y + 48, 32, 19, 5); ctx.fill(); ctx.strokeStyle = "#f0f0e2"; ctx.lineWidth = 2; ctx.strokeRect(x + 30, y + 39, 28, 24); }
function gun(ctx, x, y) { ctx.strokeStyle = "#adb7bf"; ctx.lineWidth = 8; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(x + 20, y + 36); ctx.lineTo(x + 64, y + 36); ctx.lineTo(x + 68, y + 42); ctx.moveTo(x + 45, y + 39); ctx.lineTo(x + 35, y + 65); ctx.stroke(); ctx.fillStyle = "#a25b36"; ctx.fillRect(x + 32, y + 55, 11, 16); }
function bandit(ctx, x, y) { ctx.fillStyle = "#67331f"; ctx.beginPath(); ctx.ellipse(x + 43, y + 30, 26, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(x + 30, y + 24, 27, 8); ctx.fillStyle = "#e0ab75"; ctx.beginPath(); ctx.arc(x + 43, y + 43, 18, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#bd3335"; ctx.beginPath(); ctx.moveTo(x + 25, y + 47); ctx.lineTo(x + 61, y + 47); ctx.lineTo(x + 57, y + 65); ctx.lineTo(x + 29, y + 63); ctx.fill(); ctx.fillStyle = "#1c1b20"; ctx.fillRect(x + 33, y + 41, 6, 4); ctx.fillRect(x + 48, y + 41, 6, 4); }
function gold(ctx, x, y) { ctx.fillStyle = "#f2c743"; for (const [dx, dy] of [[16, 43], [34, 43], [25, 31], [43, 31]]) { ctx.beginPath(); ctx.roundRect(x + dx, y + dy, 22, 13, 3); ctx.fill(); } ctx.strokeStyle = "#ffed8a"; ctx.lineWidth = 2; ctx.strokeRect(x + 25, y + 31, 22, 13); }
const spriteCell = { HAT: [0, 0], WHISKY: [1, 0], GUN: [2, 0], WILD: [0, 1], SCATTER: [1, 1] };
function drawSymbol(ctx, key, x, y, sprites) { const data = SYMBOLS[key]; panel(ctx, x, y, CW - 5, CH - 5, "#25150f", "#6a4429"); const cell = spriteCell[key]; if (cell && sprites) { ctx.drawImage(sprites, cell[0] * 512, cell[1] * 512, 512, 512, x + 3, y + 2, CW - 11, CH - 9); return; } if (key === "HAT") return hat(ctx, x, y); if (key === "WHISKY") return bottle(ctx, x, y); if (key === "GUN") return gun(ctx, x, y); if (key === "WILD") return bandit(ctx, x, y); if (key === "SCATTER") return gold(ctx, x, y); text(ctx, data.label, x + 43, y + 54, 32, data.color); }
const reelSymbols = Object.keys(SYMBOLS);
function drawReel(ctx, column, finalGrid, tick, stopped, sprites) {
  const x = X + column * CW;
  if (stopped) { for (let row = 0; row < 3; row++) drawSymbol(ctx, finalGrid[row][column], x, Y + row * CH, sprites); return; }
  const offset = (tick * 39 + column * 23) % (reelSymbols.length * CH);
  ctx.save(); ctx.beginPath(); ctx.rect(x, Y, CW - 4, CH * 3 - 4); ctx.clip();
  for (let item = -1; item < 6; item++) {
    const absolute = item * CH + offset;
    const y = Y - CH + ((absolute % (CH * 6)) + CH * 6) % (CH * 6);
    const key = reelSymbols[(item + Math.floor(offset / CH) + column * 2 + reelSymbols.length * 4) % reelSymbols.length];
    drawSymbol(ctx, key, x, y, sprites);
  }
  ctx.restore();
}
function draw(ctx, grid, result, tick, stoppedReels, phase, sprites, chainMultiplier, betUnits) { backdrop(ctx); panel(ctx, 29, 12, 462, 57, "#3b2116", "#d4a14d"); text(ctx, "QUYẾT CHIẾN TIỀN THƯỞNG", 225, 50, 21, "#f8d16b"); panel(ctx, 407, 20, 72, 39, "#6a3b1a", "#f3c452"); text(ctx, `x${chainMultiplier}`, 443, 48, 24, "#ffe37d");
  for (let column = 0; column < 6; column++) drawReel(ctx, column, grid, tick, stoppedReels >= column + 1, sprites);
  if (phase === "result" && result.lines.length) { ctx.strokeStyle = "#f7d762"; ctx.lineWidth = 4; ctx.beginPath(); ctx.roundRect(X + 2, Y + 2, 6 * CW - 8, 3 * CH - 8, 10); ctx.stroke(); }
  panel(ctx, 55, 382, 410, 64, "#492a1a", "#d3a24e"); const won = result.multiplier > 0, ways = result.lines.reduce((total, item) => total + item.ways, 0), nextMultiplier = won ? Math.min(1024, chainMultiplier * 2) : 1, paidMultiplier = result.multiplier / betUnits; text(ctx, phase === "spin" ? `ĐANG QUAY ${"●".repeat(Math.min(6, stoppedReels + 1))}` : won ? `THẮNG ${paidMultiplier.toFixed(2)}x · x${chainMultiplier}` : "THUA · RESET x1", W / 2, 410, 22, won ? "#ffe071" : "#ffb1a3"); if (phase === "result") text(ctx, won ? `${ways} WAYS · CHUỖI x${chainMultiplier} → x${nextMultiplier}` : "3+ biểu tượng liên tiếp từ trái", W / 2, 433, 13, "#ead6b4"); }
export async function renderQuyetChienCascadeGif(steps, betUnits = 4) {
  const out = path.resolve("assets/temp", `quyetchien_${randomUUID()}.gif`);
  await fs.mkdir(path.dirname(out), { recursive: true });
  const sprites = await loadImage(spritePath).catch(() => null);
  const canvas = createCanvas(W, H), ctx = canvas.getContext("2d"), encoder = new GIFEncoder(W, H);
  encoder.start(); encoder.setRepeat(0); encoder.setQuality(10);
  const stops = [2, 3, 4, 5, 6, 7];
  for (const [index, step] of steps.entries()) {
    for (let tick = 0; tick <= 8; tick += 1) {
      const stopped = stops.filter(stop => tick >= stop).length;
      draw(ctx, step.grid, step.result, tick + index * 3, stopped, tick === 8 ? "result" : "spin", sprites, step.chainMultiplier, betUnits);
      encoder.setDelay(tick === 8 ? (step.result.multiplier > 0 && index < steps.length - 1 ? 650 : 1500) : 68);
      encoder.addFrame(ctx);
    }
  }
  encoder.finish(); await fs.writeFile(out, encoder.out.getData()); return out;
}
export async function renderQuyetChienGif(grid, result, chainMultiplier = 1, betUnits = 4) {
  return renderQuyetChienCascadeGif([{ grid, result, chainMultiplier }], betUnits);
}
