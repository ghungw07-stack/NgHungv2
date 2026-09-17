import { renderCollectionStyle } from "../../../utils/canvas/collection-style-renderers.js";
import { getActiveCanvasStyle } from "../../../utils/canvas/theme.js";
import { renderBoardV2 } from "../../../utils/canvas/board-style-v2.js";
import { Canvas } from "skia-canvas";
import fs from "fs/promises";
import path from "path";

import { ROULETTE_RED_NUMBERS, getRouletteOutcome } from "./rules.js";

function rounded(ctx, x, y, width, height, radius = 16) { ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); }

function background(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#102b25"); gradient.addColorStop(0.55, "#0a5741"); gradient.addColorStop(1, "#061812");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
}

function numberColor(number) { return number === 0 ? "#1b9b64" : ROULETTE_RED_NUMBERS.has(number) ? "#c52d38" : "#171a1d"; }

function drawWheel(ctx, resultNumber) {
  const cx = 300, cy = 285, outer = 190;
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,.7)"; ctx.shadowBlur = 28; ctx.shadowOffsetY = 14;
  ctx.beginPath(); ctx.arc(cx, cy, outer + 18, 0, Math.PI * 2); ctx.fillStyle = "#d5ad52"; ctx.fill(); ctx.restore();
  for (let index = 0; index < 37; index += 1) {
    const start = -Math.PI / 2 + index * Math.PI * 2 / 37;
    const end = start + Math.PI * 2 / 37;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, outer, start, end); ctx.closePath();
    ctx.fillStyle = numberColor(index); ctx.fill(); ctx.strokeStyle = "rgba(255,225,150,.55)"; ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(cx, cy, 112, 0, Math.PI * 2); ctx.fillStyle = "#4b160f"; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, 70, 0, Math.PI * 2); ctx.fillStyle = "#d4ad51"; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, 30, 0, Math.PI * 2); ctx.fillStyle = "#6b2818"; ctx.fill();
  const angle = -Math.PI / 2 + resultNumber * Math.PI * 2 / 37 + Math.PI / 37;
  const bx = cx + Math.cos(angle) * 164, by = cy + Math.sin(angle) * 164;
  ctx.save(); ctx.shadowColor = "#ffffff"; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(bx, by, 12, 0, Math.PI * 2); ctx.fillStyle = "#ffffff"; ctx.fill(); ctx.restore();
}

function drawNumberCell(ctx, number, x, y, width, height, active) {
  rounded(ctx, x, y, width, height, 9); ctx.fillStyle = numberColor(number); ctx.fill();
  ctx.strokeStyle = active ? "#ffe378" : "rgba(255,255,255,.26)"; ctx.lineWidth = active ? 5 : 1.4; ctx.stroke();
  ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = `bold ${active ? 25 : 19}px sans-serif`; ctx.fillText(String(number), x + width / 2, y + height / 2);
}

export async function createRouletteResultImage(result, history = []) {
  if (getActiveCanvasStyle() === 2) {
    const outcome = getRouletteOutcome(result.number);
    return renderBoardV2({ title: "ROULETTE", subtitle: `Số ${result.number} · ${outcome.color === "do" ? "Đỏ" : outcome.color === "den" ? "Đen" : "Xanh"}`, columns: 6,
      cells: Array.from({ length: 37 }, (_, n) => ({ label: String(n), state: n === result.number ? "selected" : "", detail: n === result.number ? "KẾT QUẢ" : n === 0 ? "Xanh" : ROULETTE_RED_NUMBERS.has(n) ? "Đỏ" : "Đen" })),
      footer: `Lịch sử: ${history.slice(-18).map(h => h.number).join(" · ")}` }, "roulette");
  }
  const width = 1200, height = 900;
  const canvas = new Canvas(width, height); const ctx = canvas.getContext("2d"); const outcome = getRouletteOutcome(result.number);
  background(ctx, width, height);
  ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fillRect(0, 0, width, 92);
  ctx.fillStyle = "#eed078"; ctx.textAlign = "left"; ctx.font = "bold 16px sans-serif"; ctx.fillText("VÒNG QUAY • KẾT QUẢ VÁN", 38, 31);
  ctx.fillStyle = "#ffffff"; ctx.font = "bold 39px sans-serif"; ctx.fillText("ROULETTE", 38, 72);
  drawWheel(ctx, result.number);

  rounded(ctx, 560, 135, 590, 300, 25); ctx.fillStyle = "rgba(1,25,19,.78)"; ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,.14)"; ctx.stroke();
  ctx.textAlign = "center"; ctx.fillStyle = numberColor(result.number); ctx.beginPath(); ctx.arc(855, 245, 83, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#f3d475"; ctx.lineWidth = 5; ctx.stroke(); ctx.fillStyle = "#ffffff"; ctx.font = "bold 72px sans-serif"; ctx.fillText(String(result.number), 855, 269);
  const labels = result.number === 0 ? ["SỐ KHÔNG", "MÀU XANH"] : [outcome.color === "do" ? "ĐỎ" : "ĐEN", outcome.parity === "chan" ? "CHẴN" : "LẺ", outcome.size === "tai" ? "TÀI" : "XỈU", `CỘT ${outcome.column}`, `NHÓM ${outcome.dozen}`];
  ctx.fillStyle = "#ffe58c"; ctx.font = "bold 22px sans-serif"; ctx.fillText(labels.join(" • "), 855, 370);

  const startX = 72, startY = 476, zeroWidth = 78, cellW = 78, cellH = 68, gap = 6;
  drawNumberCell(ctx, 0, startX, startY, zeroWidth, cellH * 3 + gap * 2, result.number === 0);
  for (let number = 1; number <= 36; number += 1) {
    const col = Math.floor((number - 1) / 3), row = 2 - ((number - 1) % 3);
    drawNumberCell(ctx, number, startX + zeroWidth + gap + col * (cellW + gap), startY + row * (cellH + gap), cellW, cellH, result.number === number);
  }

  const outside = [
    ["XỈU 1–18", outcome.size === "xiu"], ["CHẴN", outcome.parity === "chan"], ["ĐỎ", outcome.color === "do"],
    ["ĐEN", outcome.color === "den"], ["LẺ", outcome.parity === "le"], ["TÀI 19–36", outcome.size === "tai"],
  ];
  const outW = (width - 144 - 5 * gap) / 6;
  outside.forEach(([label, active], index) => {
    rounded(ctx, 72 + index * (outW + gap), 708, outW, 68, 12); ctx.fillStyle = active ? "#eed783" : "rgba(0,28,22,.9)"; ctx.fill();
    ctx.strokeStyle = active ? "#fff0aa" : "rgba(255,255,255,.2)"; ctx.lineWidth = active ? 3 : 1; ctx.stroke();
    ctx.fillStyle = active ? "#163126" : "#dff1e9"; ctx.textAlign = "center"; ctx.font = "bold 18px sans-serif"; ctx.fillText(label, 72 + index * (outW + gap) + outW / 2, 750);
  });
  ctx.textAlign = "left"; ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.font = "bold 12px sans-serif"; ctx.fillText("10 PHIÊN GẦN NHẤT", 75, 828);
  history.slice(-10).forEach((item, index) => {
    const x = 310 + index * 75; ctx.beginPath(); ctx.arc(x, 824, 23, 0, Math.PI * 2); ctx.fillStyle = numberColor(Number(item.number)); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.4)"; ctx.stroke(); ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "bold 13px sans-serif"; ctx.fillText(String(item.number), x, 829);
  });
  ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,.45)"; ctx.font = "bold 13px sans-serif"; ctx.fillText("SỐ ĐƠN 1:35 • CỘT/NHÓM 1:2 • CỬA CHÍNH 1:1", width / 2, 873);
  await fs.mkdir(path.resolve("./assets/temp"), { recursive: true }); const output = path.resolve(`./assets/temp/roulette_result_${Date.now()}.png`); await fs.writeFile(output, await canvas.toBuffer("image/png")); return output;
}

export async function createRouletteHistoryImage(history) {
  if (getActiveCanvasStyle() === 2) return renderCollectionStyle(2, { title: "LỊCH SỬ ROULETTE", subtitle: "Phiên mới nhất ở đầu danh sách", items: history.slice(-30).reverse().map((item, i) => ({ badge: String(i + 1), title: `Số ${item.number}` })) }, "history");
  const width = 1020, height = 590; const canvas = new Canvas(width, height); const ctx = canvas.getContext("2d"); background(ctx, width, height);
  ctx.fillStyle = "#eed078"; ctx.textAlign = "left"; ctx.font = "bold 16px sans-serif"; ctx.fillText("THỐNG KÊ VÒNG QUAY", 38, 36); ctx.fillStyle = "#fff"; ctx.font = "bold 38px sans-serif"; ctx.fillText("SOI CẦU ROULETTE", 38, 82);
  rounded(ctx, 30, 112, 960, 400, 22); ctx.fillStyle = "rgba(0,23,18,.75)"; ctx.fill();
  if (!history.length) { ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.font = "bold 24px sans-serif"; ctx.fillText("CHƯA CÓ KẾT QUẢ", width / 2, 320); }
  else history.slice(-40).forEach((item, index) => { const x = 80 + (index % 10) * 96, y = 160 + Math.floor(index / 10) * 92; const n = Number(item.number); ctx.beginPath(); ctx.arc(x, y, 29, 0, Math.PI * 2); ctx.fillStyle = numberColor(n); ctx.fill(); ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.stroke(); ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "bold 15px sans-serif"; ctx.fillText(String(n), x, y + 5); });
  ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.font = "bold 14px sans-serif"; ctx.fillText(`${history.length} phiên gần nhất`, width / 2, 557);
  await fs.mkdir(path.resolve("./assets/temp"), { recursive: true }); const output = path.resolve(`./assets/temp/roulette_soicau_${Date.now()}.png`); await fs.writeFile(output, await canvas.toBuffer("image/png")); return output;
}
