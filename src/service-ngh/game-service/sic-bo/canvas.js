import { renderCollectionStyle } from "../../../utils/canvas/collection-style-renderers.js";
import { getActiveCanvasStyle } from "../../../utils/canvas/theme.js";
import { Canvas } from "skia-canvas";
import fs from "fs/promises";
import path from "path";

import {
  SIC_BO_TOTAL_PROFITS,
  getSicBoOutcome,
  getWinningSicBoLabels,
  normalizeSicBoDoor,
  resolveSicBoBet,
} from "./rules.js";

function roundRect(ctx, x, y, width, height, radius = 18) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function drawTableBackground(ctx, width, height) {
  const gradient = ctx.createRadialGradient(width * 0.48, height * 0.34, 60, width * 0.5, height * 0.48, width * 0.78);
  gradient.addColorStop(0, "#167f83");
  gradient.addColorStop(0.55, "#07545b");
  gradient.addColorStop(1, "#022b35");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.045;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  for (let x = -height; x < width; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + height, height);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDie(ctx, value, centerX, centerY, size = 118) {
  const x = centerX - size / 2;
  const y = centerY - size / 2;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.65)";
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 12;
  roundRect(ctx, x, y, size, size, 22);
  const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.58, "#f0eee6");
  gradient.addColorStop(1, "#b8b6af");
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(255,255,255,.9)";
  ctx.lineWidth = 4;
  ctx.stroke();

  const offset = size * 0.245;
  const positions = {
    tl: [centerX - offset, centerY - offset],
    tc: [centerX, centerY - offset],
    tr: [centerX + offset, centerY - offset],
    ml: [centerX - offset, centerY],
    mc: [centerX, centerY],
    mr: [centerX + offset, centerY],
    bl: [centerX - offset, centerY + offset],
    bc: [centerX, centerY + offset],
    br: [centerX + offset, centerY + offset],
  };
  const layouts = {
    1: ["mc"],
    2: ["tl", "br"],
    3: ["tl", "mc", "br"],
    4: ["tl", "tr", "bl", "br"],
    5: ["tl", "tr", "mc", "bl", "br"],
    6: ["tl", "ml", "bl", "tr", "mr", "br"],
  };
  for (const key of layouts[value]) {
    const [pipX, pipY] = positions[key];
    ctx.beginPath();
    ctx.arc(pipX, pipY, size * 0.075, 0, Math.PI * 2);
    ctx.fillStyle = value === 1 || value === 4 ? "#dd302f" : "#17232a";
    ctx.fill();
  }
  ctx.restore();
}

function drawBetCell(ctx, { x, y, width, height, label, odds, won = false, subtitle = "" }) {
  roundRect(ctx, x, y, width, height, 15);
  const gradient = ctx.createLinearGradient(x, y, x, y + height);
  gradient.addColorStop(0, won ? "#fff4bd" : "rgba(3,45,50,.92)");
  gradient.addColorStop(1, won ? "#cabd7f" : "rgba(1,25,32,.94)");
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = won ? "#ffe476" : "rgba(143,225,218,.28)";
  ctx.lineWidth = won ? 3 : 1.5;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = won ? "#14231f" : "#e4f6f2";
  ctx.font = `bold ${height >= 95 ? 26 : 22}px sans-serif`;
  ctx.fillText(label, x + width / 2, y + height * (subtitle ? 0.34 : 0.42));
  if (subtitle) {
    ctx.fillStyle = won ? "#315247" : "#98ccc5";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(subtitle, x + width / 2, y + height * 0.59);
  }
  if (odds) {
    ctx.fillStyle = won ? "#29483e" : "#79b9b0";
    ctx.font = "bold 15px sans-serif";
    ctx.fillText(`1 : ${odds}`, x + width / 2, y + height * 0.78);
  }
  if (won) {
    roundRect(ctx, x + width - 70, y + 8, 61, 24, 12);
    ctx.fillStyle = "#bd2825";
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText("TRÚNG", x + width - 39, y + 20);
  }
}

function drawWinningLabels(ctx, labels, x, y, width) {
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffefa1";
  ctx.font = "bold 16px sans-serif";
  ctx.fillText("CỬA TRÚNG", x, y);

  let cursorX = x;
  let cursorY = y + 34;
  for (const label of labels) {
    ctx.font = "bold 14px sans-serif";
    const chipWidth = Math.min(width, ctx.measureText(label).width + 34);
    if (cursorX + chipWidth > x + width) {
      cursorX = x;
      cursorY += 38;
    }
    roundRect(ctx, cursorX, cursorY, chipWidth, 29, 14);
    ctx.fillStyle = "rgba(255,239,161,.14)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,239,161,.45)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#fff5be";
    ctx.textAlign = "center";
    ctx.fillText(label, cursorX + chipWidth / 2, cursorY + 15);
    cursorX += chipWidth + 9;
  }
}

export async function createSicBoResultImage(dice, history = []) {
  const width = 1200;
  const height = 1120;
  const canvas = new Canvas(width, height);
  const ctx = canvas.getContext("2d");
  const outcome = getSicBoOutcome(dice);

  drawTableBackground(ctx, width, height);
  ctx.fillStyle = "rgba(0,0,0,.3)";
  ctx.fillRect(0, 0, width, 96);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff1a8";
  ctx.font = "bold 17px sans-serif";
  ctx.fillText("BÀN XÚC XẮC • KẾT QUẢ VÁN", 38, 28);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 41px sans-serif";
  ctx.fillText("SIC BO", 38, 68);
  ctx.textAlign = "right";
  ctx.fillStyle = "#fff0a3";
  ctx.font = "bold 27px sans-serif";
  ctx.fillText(`TỔNG ${outcome.total}`, width - 38, 55);

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.75)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 16;
  ctx.beginPath();
  ctx.ellipse(width / 2, 267, 390, 155, 0, 0, Math.PI * 2);
  const tray = ctx.createRadialGradient(540, 220, 30, width / 2, 267, 390);
  tray.addColorStop(0, "#b9dcdf");
  tray.addColorStop(0.58, "#4f929b");
  tray.addColorStop(0.76, "#174a55");
  tray.addColorStop(1, "#071b25");
  ctx.fillStyle = tray;
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(width / 2, 267, 346, 125, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(7,31,38,.36)";
  ctx.fill();
  ctx.strokeStyle = "rgba(211,245,245,.6)";
  ctx.lineWidth = 3;
  ctx.stroke();

  [450, 600, 750].forEach((x, index) => drawDie(ctx, dice[index], x, 260));

  const sizeLabel = outcome.isTriple ? "BỘ BA" : outcome.size === "tai" ? "TÀI" : "XỈU";
  const parityLabel = outcome.isTriple ? "TÀI/XỈU • CHẴN/LẺ ĐỀU THUA" : outcome.parity === "chan" ? "CHẴN" : "LẺ";
  roundRect(ctx, 356, 385, 488, 58, 29);
  ctx.fillStyle = "rgba(1,25,29,.86)";
  ctx.fill();
  ctx.strokeStyle = "#f4df80";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff1aa";
  ctx.font = "bold 23px sans-serif";
  ctx.fillText(`${sizeLabel} • ${parityLabel} • TỔNG ${outcome.total}`, width / 2, 414);

  const mainDoors = ["xiu", "tai", "chan", "le"].map(normalizeSicBoDoor);
  const mainGap = 10;
  const mainWidth = (width - 36 * 2 - mainGap * 3) / 4;
  mainDoors.forEach((door, index) => {
    const won = resolveSicBoBet(door, dice).state === "win";
    drawBetCell(ctx, {
      x: 36 + index * (mainWidth + mainGap),
      y: 474,
      width: mainWidth,
      height: 105,
      label: door.label.toUpperCase(),
      subtitle: outcome.isTriple ? "Bộ ba: cửa này thua" : "",
      odds: door.profit,
      won,
    });
  });

  const totals = Array.from({ length: 14 }, (_, index) => index + 4);
  const totalGap = 8;
  const totalWidth = (width - 36 * 2 - totalGap * 6) / 7;
  totals.forEach((total, index) => {
    const row = index < 7 ? 0 : 1;
    const col = index % 7;
    drawBetCell(ctx, {
      x: 36 + col * (totalWidth + totalGap),
      y: 598 + row * 82,
      width: totalWidth,
      height: 72,
      label: `TỔNG ${total}`,
      odds: SIC_BO_TOTAL_PROFITS[total],
      won: outcome.total === total,
    });
  });

  const counts = outcome.counts;
  const categoryGap = 9;
  const categoryWidth = (width - 36 * 2 - categoryGap * 4) / 5;
  const uniqueFaces = Object.keys(counts).map(Number).sort((a, b) => a - b);
  const doubleFaces = uniqueFaces.filter((face) => counts[face] >= 2);
  const categories = [
    { label: "MỘT MẶT", subtitle: `Ra: ${uniqueFaces.join(", ")}`, odds: "1 / 2 / 3", won: true },
    { label: "ĐÔI CỤ THỂ", subtitle: doubleFaces.length ? `Đôi ${doubleFaces.join(", ")}` : "Không có đôi", odds: 10, won: doubleFaces.length > 0 },
    { label: "BỘ BA CỤ THỂ", subtitle: outcome.isTriple ? `Bộ ba ${dice[0]}` : "Không có bộ ba", odds: 150, won: outcome.isTriple },
    { label: "BỘ BA BẤT KỲ", subtitle: outcome.isTriple ? "Đã xuất hiện" : "Không xuất hiện", odds: 30, won: outcome.isTriple },
    { label: "CẶP HAI SỐ", subtitle: uniqueFaces.length > 1 ? "Có cặp số trúng" : "Không có cặp số", odds: 5, won: uniqueFaces.length > 1 },
  ];
  categories.forEach((category, index) => drawBetCell(ctx, {
    x: 36 + index * (categoryWidth + categoryGap),
    y: 772,
    width: categoryWidth,
    height: 105,
    ...category,
  }));

  roundRect(ctx, 36, 899, 1128, 166, 22);
  ctx.fillStyle = "rgba(1,24,30,.72)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.14)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  drawWinningLabels(ctx, getWinningSicBoLabels(dice), 58, 925, 1084);

  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.font = "bold 12px sans-serif";
  ctx.fillText("8 PHIÊN GẦN NHẤT", 42, 1093);
  history.slice(-8).forEach((item, index) => {
    const x = 275 + index * 111;
    const total = Number(item.total || item.dice?.reduce((sum, face) => sum + Number(face), 0));
    ctx.beginPath();
    ctx.arc(x, 1092, 20, 0, Math.PI * 2);
    ctx.fillStyle = item.isTriple ? "#dc4c46" : total >= 11 ? "#f0d168" : "#a9e0d8";
    ctx.fill();
    ctx.fillStyle = "#15302f";
    ctx.textAlign = "center";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText(item.isTriple ? "BỘ" : String(total), x, 1092);
  });

  await fs.mkdir(path.resolve("./assets/temp"), { recursive: true });
  const imagePath = path.resolve(`./assets/temp/sicbo_result_${Date.now()}.png`);
  await fs.writeFile(imagePath, await canvas.toBuffer("image/png"));
  return imagePath;
}

export async function createSicBoSoiCauImage(history) {
  if (getActiveCanvasStyle() === 2) return renderCollectionStyle(2, { title: "LỊCH SỬ SIC BO", subtitle: "Phiên mới nhất ở đầu danh sách", items: history.slice(-30).reverse().map((item, i) => ({ badge: String(i + 1), title: (item.dice || []).join(" · ") })) }, "history");
  const width = 1100;
  const height = 680;
  const canvas = new Canvas(width, height);
  const ctx = canvas.getContext("2d");
  drawTableBackground(ctx, width, height);
  ctx.fillStyle = "rgba(0,0,0,.3)";
  ctx.fillRect(0, 0, width, 104);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff0a0";
  ctx.font = "bold 17px sans-serif";
  ctx.fillText("THỐNG KÊ XÚC XẮC", 40, 28);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 37px sans-serif";
  ctx.fillText("SOI CẦU SIC BO", 40, 69);

  roundRect(ctx, 30, 132, 1040, 458, 24);
  ctx.fillStyle = "rgba(0,28,34,.75)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.14)";
  ctx.lineWidth = 2;
  ctx.stroke();

  if (!history.length) {
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,.6)";
    ctx.font = "bold 25px sans-serif";
    ctx.fillText("CHƯA CÓ KẾT QUẢ", width / 2, 360);
  } else {
    history.slice(-40).forEach((item, index) => {
      const col = index % 10;
      const row = Math.floor(index / 10);
      const x = 87 + col * 103;
      const y = 192 + row * 98;
      const dice = item.dice.map(Number);
      const outcome = getSicBoOutcome(dice);
      ctx.beginPath();
      ctx.arc(x, y, 33, 0, Math.PI * 2);
      ctx.fillStyle = outcome.isTriple ? "#dc4b47" : outcome.size === "tai" ? "#efd16d" : "#a9e0d8";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.55)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#18302e";
      ctx.textAlign = "center";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText(outcome.isTriple ? "BỘ" : String(outcome.total), x, y - 6);
      ctx.font = "bold 10px sans-serif";
      ctx.fillText(dice.join("•"), x, y + 11);
    });
  }

  const tripleCount = history.filter((item) => item.isTriple || new Set(item.dice).size === 1).length;
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,.82)";
  ctx.font = "bold 16px sans-serif";
  ctx.fillText(`${history.length} phiên • Bộ ba ${tripleCount} • Kết quả mới nhất nằm bên phải`, width / 2, 632);

  await fs.mkdir(path.resolve("./assets/temp"), { recursive: true });
  const imagePath = path.resolve(`./assets/temp/sicbo_soicau_${Date.now()}.png`);
  await fs.writeFile(imagePath, await canvas.toBuffer("image/png"));
  return imagePath;
}
