import { randomUUID } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { createCanvas } from "canvas";
import { formatCurrency } from "../../../utils/format-util.js";

const COMPANY = { SUNWIN: "SunWin", HITCLUB: "HitClub", HUNG: "Hưng Group", HUN: "Hun Group", MESSI: "Messi Club", RONALDO: "Ronaldo Club" };

function text(ctx, value, x, y, size, color, align = "left", weight = "bold") {
  ctx.font = `${weight} ${size}px Arial`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "middle"; ctx.fillText(value, x, y);
}
function rounded(ctx, x, y, w, h, r, color) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = color; ctx.fill(); }
function drawSparkline(ctx, points, x, y, width, height, color) {
  const source = points.length > 1 ? points : [points[0] || 0, points[0] || 0];
  // Thu gọn lịch sử 4 giờ thành vài mốc đại diện, giống biểu đồ chứng khoán trong app.
  const step = Math.max(1, Math.ceil((source.length - 1) / 7));
  const values = source.filter((_, index) => index % step === 0);
  if (values[values.length - 1] !== source[source.length - 1]) values.push(source[source.length - 1]);
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.38)"; ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = "rgba(255,255,255,.055)"; ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) { const gy = y + i * height / 4; ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + width, gy); ctx.stroke(); }
  for (let i = 1; i < 6; i++) { const gx = x + i * width / 6; ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx, y + height); ctx.stroke(); }
  ctx.beginPath(); values.forEach((value, index) => { const px = x + index / (values.length - 1) * width, py = y + height - (value - min) / range * height; index ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
  ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.shadowColor = color; ctx.shadowBlur = 6; ctx.stroke();
  ctx.shadowBlur = 0; ctx.fillStyle = color; const last = values[values.length - 1]; const lx = x + width, ly = y + height - (last - min) / range * height; ctx.beginPath(); ctx.arc(lx, ly, 2.8, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Bảng thị trường kèm lịch sử 4 giờ (48 lần cập nhật, mỗi lần 5 phút). */
export async function createVirtualStockMarketImage(market) {
  const width = 900, height = 520, canvas = createCanvas(width, height), ctx = canvas.getContext("2d");
  const bg = ctx.createLinearGradient(0, 0, width, height); bg.addColorStop(0, "#2a2108"); bg.addColorStop(.35, "#16130c"); bg.addColorStop(1, "#080a0a"); ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 55; i++) { ctx.fillStyle = i % 4 ? "rgba(255,207,64,.24)" : "rgba(255,234,143,.52)"; ctx.fillRect((i * 97 + 17) % width, (i * 149 + 21) % height, 2, 2); }
  text(ctx, "▣  SÀN CỔ PHIẾU ẢO", 450, 43, 29, "#f6d875", "center");
  rounded(ctx, 25, 68, 850, 420, 17, "rgba(12,13,13,.9)"); ctx.strokeStyle = "rgba(249,215,115,.25)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(25, 68, 850, 420, 17); ctx.stroke();
  text(ctx, "MÃ", 55, 94, 13, "#a9a9a2"); text(ctx, "CÔNG TY", 155, 94, 13, "#a9a9a2"); text(ctx, "GIÁ (VNĐ/CP)", 430, 94, 13, "#a9a9a2"); text(ctx, "4 GIỜ", 605, 94, 13, "#a9a9a2"); text(ctx, "BIỂU ĐỒ", 780, 94, 13, "#a9a9a2", "center");
  Object.entries(market.prices).forEach(([symbol, value], index) => {
    const top = 106 + index * 61, rowColor = index % 2 ? "rgba(255,255,255,.025)" : "rgba(255,210,90,.035)";
    rounded(ctx, 39, top, 822, 53, 8, rowColor); ctx.strokeStyle = "rgba(255,255,255,.065)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(39, top, 822, 53, 8); ctx.stroke();
    rounded(ctx, 55, top + 8, 75, 37, 8, "#5c2027"); text(ctx, symbol, 92, top + 26, 17, "#fff", "center");
    text(ctx, COMPANY[symbol] || symbol, 155, top + 26, 16, "#e5e5df"); text(ctx, formatCurrency(value), 430, top + 26, 20, "#fff", "center");
    const series = market.history?.[symbol]?.length ? market.history[symbol] : [value], previous = series[0] || value, percent = (value - previous) / previous * 100, up = percent >= 0, color = up ? "#63df9b" : "#ff6170";
    text(ctx, `${up ? "▲" : "▼"} ${up ? "+" : ""}${percent.toFixed(2)}%`, 605, top + 26, 14, color, "center");
    drawSparkline(ctx, series, 705, top + 8, 145, 36, color);
  });
  text(ctx, "Bảng giá cập nhật mỗi 5 phút · Biểu đồ thể hiện 4 giờ gần nhất", 450, 506, 13, "#aaa798", "center", "normal");
  const output = path.join(os.tmpdir(), `virtual-stock-${randomUUID()}.png`); await fs.writeFile(output, canvas.toBuffer("image/png")); return output;
}
