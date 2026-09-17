import { renderCollectionStyle } from "../../../utils/canvas/collection-style-renderers.js";
import { getActiveCanvasStyle } from "../../../utils/canvas/theme.js";
import { Canvas } from "skia-canvas";
import fs from "fs/promises";
import path from "path";

import { cardRankLabel } from "./rules.js";

function rounded(ctx, x, y, width, height, radius = 20) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function background(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#300b16");
  gradient.addColorStop(0.5, "#721d25");
  gradient.addColorStop(1, "#180810");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = "#ffd87a";
  for (let radius = 80; radius < 700; radius += 42) {
    ctx.beginPath(); ctx.arc(width / 2, height / 2, radius, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function drawCard(ctx, card, x, y, winner) {
  const width = 220, height = 310;
  ctx.save();
  ctx.shadowColor = winner ? "rgba(255,218,105,.75)" : "rgba(0,0,0,.65)";
  ctx.shadowBlur = winner ? 28 : 18;
  ctx.shadowOffsetY = 12;
  rounded(ctx, x, y, width, height, 22);
  ctx.fillStyle = "#fffdf7";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = winner ? "#ffdb69" : "#d8d3c8";
  ctx.lineWidth = winner ? 6 : 2;
  ctx.stroke();
  const red = card.suit === "♥" || card.suit === "♦";
  ctx.fillStyle = red ? "#d92832" : "#15151a";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = "bold 48px sans-serif";
  ctx.fillText(cardRankLabel(card.rank), x + 22, y + 18);
  ctx.font = "42px sans-serif";
  ctx.fillText(card.suit, x + 22, y + 72);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "112px sans-serif";
  ctx.fillText(card.suit, x + width / 2, y + height / 2 + 25);
  if (winner) {
    rounded(ctx, x + 55, y + height - 47, 110, 31, 15);
    ctx.fillStyle = "#b61f29";
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText("THẮNG", x + width / 2, y + height - 31);
  }
  ctx.restore();
}

export async function createLongHoResultImage(result, history = []) {
  const width = 1000, height = 760;
  const canvas = new Canvas(width, height);
  const ctx = canvas.getContext("2d");
  background(ctx, width, height);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = "#f7d477";
  ctx.font = "bold 16px sans-serif";
  ctx.fillText("BÀN BÀI • KẾT QUẢ VÁN", 38, 30);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 40px sans-serif";
  ctx.fillText("LONG HỔ", 38, 69);

  const longWin = result.resultDoor === "long" || result.resultDoor === "hoa";
  const hoWin = result.resultDoor === "ho" || result.resultDoor === "hoa";
  drawCard(ctx, result.longCard, 180, 170, longWin);
  drawCard(ctx, result.hoCard, 600, 170, hoWin);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffe28a";
  ctx.font = "bold 34px sans-serif";
  ctx.fillText("LONG", 290, 132);
  ctx.fillText("HỔ", 710, 132);
  ctx.beginPath(); ctx.arc(500, 325, 42, 0, Math.PI * 2); ctx.fillStyle = "#270914"; ctx.fill();
  ctx.strokeStyle = "#eac568"; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = "#ffe08a"; ctx.font = "bold 22px sans-serif"; ctx.fillText("ĐẤU", 500, 325);

  rounded(ctx, 270, 520, 460, 70, 35);
  ctx.fillStyle = "rgba(18,3,9,.82)"; ctx.fill();
  ctx.strokeStyle = "#efcd70"; ctx.lineWidth = 2; ctx.stroke();
  const label = result.resultDoor === "long" ? "LONG THẮNG" : result.resultDoor === "ho" ? "HỔ THẮNG" : "KẾT QUẢ HÒA";
  ctx.fillStyle = "#ffe28c"; ctx.font = "bold 29px sans-serif"; ctx.fillText(label, 500, 555);

  ctx.textAlign = "left"; ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.font = "bold 13px sans-serif";
  ctx.fillText("12 PHIÊN GẦN NHẤT", 45, 650);
  history.slice(-12).forEach((item, index) => {
    const x = 280 + index * 56;
    ctx.beginPath(); ctx.arc(x, 650, 19, 0, Math.PI * 2);
    ctx.fillStyle = item.resultDoor === "long" ? "#e04c4c" : item.resultDoor === "ho" ? "#efcd70" : "#55cba4";
    ctx.fill(); ctx.fillStyle = "#201016"; ctx.textAlign = "center"; ctx.font = "bold 12px sans-serif";
    ctx.fillText(item.resultDoor === "long" ? "L" : item.resultDoor === "ho" ? "H" : "HÒA", x, 650);
  });
  ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,.48)"; ctx.font = "bold 14px sans-serif";
  ctx.fillText("LONG/HỔ 1 : 0.95  •  HÒA 1 : 8", width / 2, 714);
  await fs.mkdir(path.resolve("./assets/temp"), { recursive: true });
  const output = path.resolve(`./assets/temp/longho_result_${Date.now()}.png`);
  await fs.writeFile(output, await canvas.toBuffer("image/png"));
  return output;
}

export async function createLongHoHistoryImage(history) {
  if (getActiveCanvasStyle() === 2) return renderCollectionStyle(2, { title: "LỊCH SỬ LONG HỔ", subtitle: "Phiên mới nhất ở đầu danh sách", items: history.slice(-30).reverse().map((item, i) => ({ badge: String(i + 1), title: item.resultDoor === "long" ? "Long thắng" : item.resultDoor === "ho" ? "Hổ thắng" : "Hòa" })) }, "history");
  const width = 980, height = 570;
  const canvas = new Canvas(width, height);
  const ctx = canvas.getContext("2d");
  background(ctx, width, height);
  ctx.fillStyle = "#f7d477"; ctx.textAlign = "left"; ctx.font = "bold 17px sans-serif"; ctx.fillText("THỐNG KÊ BÀN BÀI", 40, 37);
  ctx.fillStyle = "#ffffff"; ctx.font = "bold 38px sans-serif"; ctx.fillText("SOI CẦU LONG HỔ", 40, 83);
  rounded(ctx, 30, 115, 920, 380, 24); ctx.fillStyle = "rgba(20,3,10,.72)"; ctx.fill();
  if (!history.length) {
    ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.font = "bold 24px sans-serif"; ctx.fillText("CHƯA CÓ KẾT QUẢ", width / 2, 315);
  } else history.slice(-40).forEach((item, index) => {
    const x = 82 + (index % 10) * 91, y = 165 + Math.floor(index / 10) * 82;
    ctx.beginPath(); ctx.arc(x, y, 27, 0, Math.PI * 2);
    ctx.fillStyle = item.resultDoor === "long" ? "#e04c4c" : item.resultDoor === "ho" ? "#efcd70" : "#55cba4"; ctx.fill();
    ctx.fillStyle = "#211018"; ctx.textAlign = "center"; ctx.font = "bold 13px sans-serif";
    ctx.fillText(item.resultDoor === "long" ? "LONG" : item.resultDoor === "ho" ? "HỔ" : "HÒA", x, y + 5);
  });
  ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.font = "bold 14px sans-serif"; ctx.fillText(`${history.length} phiên gần nhất`, width / 2, 535);
  await fs.mkdir(path.resolve("./assets/temp"), { recursive: true });
  const output = path.resolve(`./assets/temp/longho_soicau_${Date.now()}.png`);
  await fs.writeFile(output, await canvas.toBuffer("image/png"));
  return output;
}
