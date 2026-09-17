import { Canvas, loadImage } from "skia-canvas";
import fs from "fs/promises";
import path from "path";

const LIVE_TABLE_BACKGROUND = path.resolve("./assets/data/baccarat/live-table-background-v2.png");

function rounded(ctx, x, y, width, height, radius = 18) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function drawCasinoBackground(ctx, width, height) {
  const wall = ctx.createLinearGradient(0, 0, 0, 330);
  wall.addColorStop(0, "#1f0d0a");
  wall.addColorStop(0.45, "#8a4b16");
  wall.addColorStop(1, "#d59a2e");
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, width, 330);
  for (let x = -100; x < width + 100; x += 180) {
    ctx.save();
    ctx.globalAlpha = 0.17;
    ctx.fillStyle = "#fff2bd";
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 75, 0);
    ctx.lineTo(x + 230, 330);
    ctx.lineTo(x + 145, 330);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  const felt = ctx.createRadialGradient(width / 2, 560, 40, width / 2, 720, 800);
  felt.addColorStop(0, "#148b69");
  felt.addColorStop(0.58, "#075c48");
  felt.addColorStop(1, "#022c25");
  ctx.fillStyle = felt;
  ctx.fillRect(0, 240, width, height - 240);
  ctx.save();
  ctx.globalAlpha = 0.035;
  ctx.fillStyle = "#ffffff";
  for (let y = 245; y < height; y += 9) {
    for (let x = (y / 9) % 2 ? 4 : 0; x < width; x += 12) ctx.fillRect(x, y, 2, 2);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(width / 2, 275, 620, 170, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,232,161,.72)";
  ctx.lineWidth = 6;
  ctx.stroke();
}

async function drawLiveTableBackground(ctx, width, height) {
  try {
    const background = await loadImage(LIVE_TABLE_BACKGROUND);
    ctx.drawImage(background, 0, 0, width, height);
    const tableShade = ctx.createLinearGradient(0, 520, 0, height);
    tableShade.addColorStop(0, "rgba(0,30,22,0)");
    tableShade.addColorStop(0.62, "rgba(0,23,18,.08)");
    tableShade.addColorStop(1, "rgba(0,12,10,.36)");
    ctx.fillStyle = tableShade;
    ctx.fillRect(0, 500, width, height - 500);
    return;
  } catch (error) {
    console.warn("[BACCARAT] Không tải được ảnh bàn live:", error?.message || error);
  }
  drawCasinoBackground(ctx, width, height);
}

function drawDealer(ctx) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(520, 91, 39, 0, Math.PI * 2);
  ctx.fillStyle = "#e9b895";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(520, 73, 43, Math.PI, Math.PI * 2);
  ctx.fillStyle = "#241510";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(405, 245);
  ctx.quadraticCurveTo(425, 125, 478, 122);
  ctx.lineTo(520, 178);
  ctx.lineTo(562, 122);
  ctx.quadraticCurveTo(615, 125, 635, 245);
  ctx.closePath();
  const jacket = ctx.createLinearGradient(405, 130, 635, 245);
  jacket.addColorStop(0, "#f6f0de");
  jacket.addColorStop(1, "#bda985");
  ctx.fillStyle = jacket;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(478, 122); ctx.lineTo(520, 178); ctx.lineTo(562, 122); ctx.lineTo(548, 215); ctx.lineTo(492, 215); ctx.closePath();
  ctx.fillStyle = "#491522"; ctx.fill();
  ctx.restore();
}

function cardAssetPath(card) {
  const rankName = ({ A: "ace", J: "jack", Q: "queen", K: "king" })[card.rank] || card.rank;
  const suitName = ({ "♥": "hearts", "♦": "diamonds", "♣": "clubs", "♠": "spades" })[card.suit];
  return path.resolve(`./assets/data/cards/png/${rankName}_of_${suitName}.png`);
}

async function drawCard(ctx, card, x, y, width = 118, height = 170, winner = false) {
  ctx.save();
  ctx.shadowColor = winner ? "rgba(255,225,112,.72)" : "rgba(0,0,0,.55)";
  ctx.shadowBlur = winner ? 21 : 12;
  ctx.shadowOffsetY = 8;
  rounded(ctx, x, y, width, height, 10);
  ctx.fillStyle = "#fffdf8";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = winner ? "#ffe47c" : "#ddd8cd";
  ctx.lineWidth = winner ? 4 : 1.5;
  ctx.stroke();
  try {
    const image = await loadImage(cardAssetPath(card));
    ctx.drawImage(image, x, y, width, height);
  } catch {
    const red = card.suit === "♥" || card.suit === "♦";
    ctx.fillStyle = red ? "#d62832" : "#15171a";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = `bold ${Math.round(width * 0.3)}px sans-serif`;
    ctx.fillText(card.rank, x + 10, y + 9);
    ctx.font = `${Math.round(width * 0.28)}px sans-serif`;
    ctx.fillText(card.suit, x + 10, y + 43);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.round(width * 0.58)}px sans-serif`;
    ctx.fillText(card.suit, x + width / 2, y + height * 0.6);
  }
  ctx.restore();
}

function drawBetCell(ctx, x, y, width, label, odds, color, active) {
  rounded(ctx, x, y, width, 118, 18);
  const gradient = ctx.createLinearGradient(x, y, x, y + 118);
  gradient.addColorStop(0, active ? "#fff3bf" : "rgba(0,41,31,.91)");
  gradient.addColorStop(1, active ? "#cbbd83" : "rgba(0,21,17,.94)");
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = active ? "#ffe273" : `${color}88`;
  ctx.lineWidth = active ? 4 : 2;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = active ? "#132019" : color;
  ctx.font = "bold 31px sans-serif";
  ctx.fillText(label, x + width / 2, y + 42);
  ctx.fillStyle = active ? "#355246" : "#acd0be";
  ctx.font = "bold 19px sans-serif";
  ctx.fillText(odds, x + width / 2, y + 82);
  if (active) {
    rounded(ctx, x + width - 82, y + 10, 68, 26, 13);
    ctx.fillStyle = "#be2825";
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText("CỬA TRÚNG", x + width - 48, y + 23);
  }
}

function drawSideBetCell(ctx, x, y, width, label, odds, color, active) {
  rounded(ctx, x, y, width, 76, 14);
  const gradient = ctx.createLinearGradient(x, y, x, y + 76);
  gradient.addColorStop(0, active ? "#ffe89c" : "rgba(0,48,36,.94)");
  gradient.addColorStop(1, active ? "#bca65c" : "rgba(0,24,19,.96)");
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = active ? "#ffe273" : `${color}99`;
  ctx.lineWidth = active ? 3 : 1.5;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = active ? "#132019" : color;
  ctx.font = "bold 17px sans-serif";
  ctx.fillText(label, x + width / 2, y + 27);
  ctx.fillStyle = active ? "#344a40" : "#b4d0c2";
  ctx.font = "bold 13px sans-serif";
  ctx.fillText(odds, x + width / 2, y + 55);
}

export async function createBaccaratTableImage({ player, banker, pScore, bScore, resultDoor, natural = false, winningDoors = [], history = [] }) {
  const width = 1040;
  const height = 1280;
  const canvas = new Canvas(width, height);
  const ctx = canvas.getContext("2d");
  await drawLiveTableBackground(ctx, width, height);

  ctx.fillStyle = "rgba(0,0,0,.5)";
  ctx.fillRect(0, 0, width, 62);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffe38a";
  ctx.font = "bold 16px sans-serif";
  ctx.fillText("BÀN TRỰC TUYẾN • KẾT QUẢ VÁN", 28, 31);
  ctx.textAlign = "right";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 26px sans-serif";
  ctx.fillText("BACCARAT", width - 28, 32);

  rounded(ctx, 865, 82, 142, 75, 37);
  ctx.fillStyle = "rgba(8,13,12,.88)";
  ctx.fill();
  ctx.strokeStyle = "#fff0a7";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = "#fff5c3";
  ctx.textAlign = "center";
  ctx.font = "bold 18px sans-serif";
  ctx.fillText("MỞ BÀI", 936, 120);

  ctx.textAlign = "center";
  ctx.font = "bold 42px sans-serif";
  ctx.fillStyle = "#46b8ff";
  ctx.fillText("TAY CON", 280, 574);
  ctx.fillStyle = "#ff665f";
  ctx.fillText("NHÀ CÁI", 760, 574);

  const cardWidth = 102, cardHeight = 146, cardStride = 112;
  const playerWidth = player.length * cardWidth + Math.max(0, player.length - 1) * (cardStride - cardWidth);
  const bankerWidth = banker.length * cardWidth + Math.max(0, banker.length - 1) * (cardStride - cardWidth);
  const playerStart = 280 - playerWidth / 2;
  const bankerStart = 760 - bankerWidth / 2;
  for (let index = 0; index < player.length; index += 1) await drawCard(ctx, player[index], playerStart + index * cardStride, 608, cardWidth, cardHeight, resultDoor === "con" || resultDoor === "hòa");
  for (let index = 0; index < banker.length; index += 1) await drawCard(ctx, banker[index], bankerStart + index * cardStride, 608, cardWidth, cardHeight, resultDoor === "cái" || resultDoor === "hòa");

  ctx.beginPath(); ctx.arc(280, 793, 33, 0, Math.PI * 2); ctx.fillStyle = "rgba(1,25,34,.94)"; ctx.fill(); ctx.strokeStyle = "#46b8ff"; ctx.lineWidth = 4; ctx.stroke();
  ctx.beginPath(); ctx.arc(760, 793, 33, 0, Math.PI * 2); ctx.fillStyle = "rgba(35,10,9,.94)"; ctx.fill(); ctx.strokeStyle = "#ff665f"; ctx.stroke();
  ctx.fillStyle = "#66c8ff"; ctx.font = "bold 39px sans-serif"; ctx.fillText(String(pScore), 280, 796);
  ctx.fillStyle = "#ff746d"; ctx.fillText(String(bScore), 760, 796);
  ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.font = "bold 10px sans-serif"; ctx.fillText("ĐIỂM", 280, 824); ctx.fillText("ĐIỂM", 760, 824);

  const winSet = new Set(winningDoors);
  const sideGap = 8, margin = 18, sideWidth = (width - margin * 2 - sideGap * 3) / 4;
  drawSideBetCell(ctx, margin, 842, sideWidth, "CON ĐÔI", "1 : 11", "#5bc3ff", winSet.has("con_đôi"));
  drawSideBetCell(ctx, margin + (sideWidth + sideGap), 842, sideWidth, "LONG BẢO CON", "1 : 1–30", "#78d8ff", winSet.has("long_con"));
  drawSideBetCell(ctx, margin + (sideWidth + sideGap) * 2, 842, sideWidth, "LONG BẢO CÁI", "1 : 1–30", "#ff948d", winSet.has("long_cái"));
  drawSideBetCell(ctx, margin + (sideWidth + sideGap) * 3, 842, sideWidth, "CÁI ĐÔI", "1 : 11", "#ff716a", winSet.has("cái_đôi"));

  const gap = 12, cellWidth = (width - margin * 2 - gap * 2) / 3;
  drawBetCell(ctx, margin, 928, cellWidth, "TAY CON", "1 : 1", "#54bfff", resultDoor === "con");
  drawBetCell(ctx, margin + cellWidth + gap, 928, cellWidth, "HÒA", "1 : 8", "#62dfab", resultDoor === "hòa");
  drawBetCell(ctx, margin + (cellWidth + gap) * 2, 928, cellWidth, "NHÀ CÁI", "1 : 0.95", "#ff6b65", resultDoor === "cái");

  rounded(ctx, 18, 1062, 1004, 200, 24);
  const resultGradient = ctx.createLinearGradient(18, 1062, 1022, 1262);
  resultGradient.addColorStop(0, "rgba(1,16,13,.94)");
  resultGradient.addColorStop(1, "rgba(11,45,34,.94)");
  ctx.fillStyle = resultGradient;
  ctx.fill();
  ctx.strokeStyle = "#d9bd65";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = "#f5d878";
  ctx.font = "bold 15px sans-serif";
  ctx.fillText("KẾT QUẢ VÁN", 520, 1088);
  const winnerLabel = resultDoor === "con" ? "TAY CON THẮNG" : resultDoor === "cái" ? "NHÀ CÁI THẮNG" : "KẾT QUẢ HÒA";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 34px sans-serif";
  ctx.fillText(winnerLabel, 520, 1128);
  ctx.fillStyle = "#57beff";
  ctx.font = "bold 54px sans-serif";
  ctx.fillText(String(pScore), 300, 1198);
  ctx.fillStyle = "rgba(255,255,255,.48)";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText("—", 520, 1192);
  ctx.fillStyle = "#ff716a";
  ctx.font = "bold 54px sans-serif";
  ctx.fillText(String(bScore), 740, 1198);
  ctx.fillStyle = "#57beff";
  ctx.font = "bold 15px sans-serif";
  ctx.fillText("TAY CON", 300, 1234);
  ctx.fillStyle = "#ff716a";
  ctx.fillText("NHÀ CÁI", 740, 1234);
  if (natural) {
    rounded(ctx, 430, 1178, 180, 28, 14);
    ctx.fillStyle = "#a77a22";
    ctx.fill();
    ctx.fillStyle = "#fff3bc";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText("THẮNG TỰ NHIÊN", 520, 1192);
  }

  await fs.mkdir(path.resolve("./assets/temp"), { recursive: true });
  const imagePath = path.resolve(`./assets/temp/baccarat_result_${Date.now()}.png`);
  await fs.writeFile(imagePath, await canvas.toBuffer("image/png"));
  return imagePath;
}
