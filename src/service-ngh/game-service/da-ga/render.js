import { createCanvas, registerFont, loadImage } from "canvas";
import GIFEncoder from "gifencoder";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { DA_GA_DOORS } from "./rules.js";

const W = 720, H = 520;
const RED_ROOSTER = fileURLToPath(new URL("../../../../assets/resources/game/daga/rooster-red.png", import.meta.url));
const BLUE_ROOSTER = fileURLToPath(new URL("../../../../assets/resources/game/daga/rooster-blue.png", import.meta.url));
registerFont(fileURLToPath(new URL("../../../../assets/fonts/BeVietnamPro-Bold.ttf", import.meta.url)), { family: "DaGa", weight: "bold" });
const label = (ctx, value, x, y, size, color = "#fff", align = "center") => { ctx.font = `bold ${size}px DaGa`; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(value, x, y); };

function arena(ctx) {
  const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#111827"); bg.addColorStop(.58, "#243146"); bg.addColorStop(1, "#160f0a"); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#09101d"; ctx.fillRect(0, 0, W, 88); label(ctx, "ĐẠI HÙNG KÊ • LIVE ARENA", W / 2, 40, 25, "#ffd56a"); label(ctx, "MERON  •  WALA  •  DRAW", W / 2, 69, 13, "#91a4bd");
  for (let i = 0; i < 18; i++) { ctx.fillStyle = i % 2 ? "#253247" : "#192438"; ctx.beginPath(); ctx.arc(20 + i * 42, 124 + (i % 3) * 16, 18, 0, Math.PI * 2); ctx.fill(); }
  const sand = ctx.createRadialGradient(W / 2, 340, 20, W / 2, 340, 310); sand.addColorStop(0, "#c99955"); sand.addColorStop(1, "#62452b"); ctx.fillStyle = sand; ctx.beginPath(); ctx.ellipse(W / 2, 345, 310, 135, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#e4c58a"; ctx.lineWidth = 8; ctx.beginPath(); ctx.ellipse(W / 2, 345, 322, 145, 0, 0, Math.PI * 2); ctx.stroke();
}

function rooster(ctx, x, y, side, phase, hit = false, image = null) {
  if (image) {
    const scale = 175 / image.height;
    // Hai asset đã được tạo đúng hướng: gà đỏ nhìn phải, gà xanh nhìn trái.
    // Không lật lại gà xanh, nếu không hai con sẽ cùng nhìn một hướng.
    ctx.save(); ctx.translate(x, y + Math.sin(phase) * 6); if (hit) ctx.rotate(-.12);
    ctx.globalAlpha = .98; ctx.drawImage(image, -image.width * scale / 2, -image.height * scale, image.width * scale, image.height * scale); ctx.restore(); return;
  }
  const flip = side === "right" ? -1 : 1, color = side === "left" ? "#b91c1c" : "#075985", accent = side === "left" ? "#fb7185" : "#38bdf8";
  ctx.save(); ctx.translate(x, y + Math.sin(phase) * 6); ctx.scale(flip, 1); if (hit) ctx.rotate(-.18);
  ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, 0, 68, 50, -.12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = accent; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(-54 - i * 9, -15 + i * 5, 35, 10, -.75 + i * .11, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = "#f5d08a"; ctx.beginPath(); ctx.arc(48, -42, 28, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ef4444"; ctx.beginPath(); ctx.arc(42, -70, 10, 0, Math.PI * 2); ctx.arc(55, -68, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fbbf24"; ctx.beginPath(); ctx.moveTo(72, -46); ctx.lineTo(102, -35); ctx.lineTo(73, -29); ctx.fill();
  ctx.fillStyle = "#101827"; ctx.beginPath(); ctx.arc(57, -48, 5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#e9c46a"; ctx.lineWidth = 7; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-8, 40); ctx.lineTo(-20, 78); ctx.moveTo(25, 38); ctx.lineTo(36, 77); ctx.stroke();
  ctx.restore();
}

function drawFrame(ctx, result, progress, images = {}) {
  arena(ctx); const winner = result.winner;
  const attack = Math.sin(progress * Math.PI * 6); const clash = progress > .18 && progress < .78;
  const leftX = 205 + (clash ? Math.max(0, attack) * 42 : 0), rightX = 515 - (clash ? Math.max(0, -attack) * 42 : 0);
  const finished = progress >= .82;
  rooster(ctx, leftX, 337, "left", progress * 16, finished && winner === "xanh", images.red);
  rooster(ctx, rightX, 337, "right", progress * 16 + 1, finished && winner === "do", images.blue);
  label(ctx, "GÀ ĐỎ", 130, 468, 20, "#fb7185"); label(ctx, "GÀ XANH", 590, 468, 20, "#67d5ff");
  if (!finished) label(ctx, progress < .15 ? "SẴN SÀNG!" : `HIỆP ${Math.min(result.rounds, 1 + Math.floor(progress * result.rounds))}`, W / 2, 135, 28, "#fff0b0");
  else { const door = DA_GA_DOORS[winner]; label(ctx, winner === "hoa" ? "HÒA!" : `${door.label.toUpperCase()} THẮNG!`, W / 2, 138, 34, door.color); label(ctx, winner === "hoa" ? "BẤT PHÂN THẮNG BẠI" : `KẾT THÚC SAU ${result.rounds} HIỆP`, W / 2, 172, 15, "#e7edf7"); }
}

export async function createDaGaResultGif(result) {
  const output = path.resolve("assets/temp", `daga_${randomUUID()}.gif`); await fs.mkdir(path.dirname(output), { recursive: true });
  const images = await Promise.all([loadImage(RED_ROOSTER), loadImage(BLUE_ROOSTER)]).then(([red, blue]) => ({ red, blue }));
  const canvas = createCanvas(W, H), ctx = canvas.getContext("2d"), encoder = new GIFEncoder(W, H); encoder.start(); encoder.setRepeat(0); encoder.setQuality(10);
  for (const progress of [0, .1, .22, .34, .46, .58, .7, .82, 1]) { drawFrame(ctx, result, progress, images); encoder.setDelay(progress === 1 ? 1800 : 135); encoder.addFrame(ctx); }
  encoder.finish(); await fs.writeFile(output, encoder.out.getData()); return output;
}

export async function createDaGaHistoryImage(history = []) {
  const canvas = createCanvas(720, 380), ctx = canvas.getContext("2d"); arena(ctx); ctx.fillStyle = "rgba(5,10,20,.86)"; ctx.fillRect(35, 95, 650, 250); label(ctx, "CẦU 20 VÁN GẦN NHẤT", 360, 130, 22, "#fff");
  history.slice(-20).forEach((item, index) => { const door = DA_GA_DOORS[item.winner] || DA_GA_DOORS.hoa, x = 78 + (index % 10) * 62, y = 180 + Math.floor(index / 10) * 78; ctx.fillStyle = door.color; ctx.beginPath(); ctx.arc(x, y, 23, 0, Math.PI * 2); ctx.fill(); label(ctx, item.winner === "do" ? "Đ" : item.winner === "xanh" ? "X" : "H", x, y + 6, 16, "#fff"); });
  if (!history.length) label(ctx, "CHƯA CÓ DỮ LIỆU", 360, 245, 20, "#94a3b8");
  const output = path.resolve("assets/temp", `daga_history_${randomUUID()}.png`); await fs.writeFile(output, canvas.toBuffer("image/png")); return output;
}
