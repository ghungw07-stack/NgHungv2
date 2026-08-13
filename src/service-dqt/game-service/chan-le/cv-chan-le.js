import path from "path";
import { createCanvas, loadImage } from "canvas";
import { FONT_MAIN, formatCurrency } from "../../../utils/format-util.js";
import { writeFilePromise } from "../../../utils/util.js";

const WIDTH = 960;
const HEIGHT = 540;
const DICE_ASSET_DIR = path.join(process.cwd(), "assets", "resources", "game", "taixiu");

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawBackground(ctx, accent) {
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, "#080d20");
  gradient.addColorStop(0.5, "#151335");
  gradient.addColorStop(1, "#090a16");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glow = ctx.createRadialGradient(430, 255, 20, 430, 255, 460);
  glow.addColorStop(0, `${accent}2d`);
  glow.addColorStop(0.55, `${accent}0d`);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.strokeStyle = "#ffffff";
  for (let x = -HEIGHT; x < WIDTH; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + HEIGHT, HEIGHT);
    ctx.stroke();
  }
  ctx.restore();

  const vignette = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 180, WIDTH / 2, HEIGHT / 2, 600);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.48)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawPanel(ctx, x, y, width, height, accent = "#ffffff", strong = false) {
  ctx.save();
  ctx.shadowColor = strong ? `${accent}4d` : "rgba(0,0,0,0.42)";
  ctx.shadowBlur = strong ? 20 : 14;
  ctx.shadowOffsetY = 8;
  roundedRect(ctx, x, y, width, height, 24);
  const gradient = ctx.createLinearGradient(x, y, x, y + height);
  gradient.addColorStop(0, strong ? `${accent}20` : "rgba(255,255,255,0.09)");
  gradient.addColorStop(1, "rgba(3,4,15,0.80)");
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = strong ? `${accent}b3` : "rgba(255,255,255,0.15)";
  ctx.lineWidth = strong ? 2 : 1.5;
  ctx.stroke();
  ctx.restore();
}

function fitText(ctx, text, maxWidth, startSize, minSize = 17) {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `bold ${size}px ${FONT_MAIN}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

function drawHeader(ctx, isJackpot) {
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = isJackpot ? "#ffd665" : "#a8b5ff";
  ctx.font = `bold 16px ${FONT_MAIN}`;
  ctx.fillText("DICE CLUB", 42, 39);
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 38px ${FONT_MAIN}`;
  ctx.fillText("CHẴN LẺ", 42, 76);
  ctx.fillStyle = "rgba(255,255,255,0.60)";
  ctx.font = `bold 15px ${FONT_MAIN}`;
  ctx.fillText(isJackpot ? "KẾT QUẢ ĐẶC BIỆT • JACKPOT" : "KẾT QUẢ LƯỢT CHƠI", 42, 108);

  roundedRect(ctx, 802, 36, 116, 36, 18);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fill();
  ctx.fillStyle = "#48e5a1";
  ctx.beginPath();
  ctx.arc(825, 54, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ecfff6";
  ctx.font = `bold 14px ${FONT_MAIN}`;
  ctx.fillText("HOÀN TẤT", 840, 55);
}

async function drawDiceRow(ctx, diceResults) {
  const diceSize = 94;
  const positions = [164, 292, 420];
  for (let index = 0; index < diceResults.length; index++) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.75)";
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 11;
    try {
      const image = await loadImage(path.join(DICE_ASSET_DIR, `dice_${diceResults[index]}.png`));
      ctx.drawImage(image, positions[index] - diceSize / 2, 280 - diceSize / 2, diceSize, diceSize);
    } catch (error) {
      console.error(`Không tìm thấy hình ảnh cho xúc xắc ${diceResults[index]}`);
    }
    ctx.restore();
  }
}

function drawInfoRow(ctx, label, value, x, y, width, color = "#ffffff") {
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255,255,255,0.50)";
  ctx.font = `bold 13px ${FONT_MAIN}`;
  ctx.fillText(label, x, y);
  ctx.textAlign = "right";
  ctx.fillStyle = color;
  ctx.font = `bold ${fitText(ctx, value, width * 0.6, 20, 15)}px ${FONT_MAIN}`;
  ctx.fillText(value, x + width, y);
}

export async function createChanLeResultImage(
  diceResults,
  total,
  playerChoice,
  betAmount,
  isJackpot,
  recentResults = [],
  winnings = null
) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  const isEven = total % 2 === 0;
  const resultKey = isEven ? "chan" : "le";
  const playerWin = resultKey === playerChoice;
  const resultText = isEven ? "CHẴN" : "LẺ";
  const resultAccent = isJackpot ? "#ffd665" : isEven ? "#63e6a6" : "#ff72bd";
  const choiceText = playerChoice === "chan" ? "CHẴN" : "LẺ";
  const choiceColor = playerChoice === "chan" ? "#63e6a6" : "#ff72bd";
  const moneyOutcome = isJackpot || playerWin ? "THẮNG" : "THUA";
  const netWinnings = winnings?.minus ? winnings.minus(betAmount) : Number(winnings || 0) - Number(betAmount || 0);
  const outcomeAmount = isJackpot || playerWin ? netWinnings : betAmount;

  drawBackground(ctx, resultAccent);
  drawHeader(ctx, isJackpot);

  drawPanel(ctx, 34, 136, 516, 318, resultAccent, true);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255,255,255,0.52)";
  ctx.font = `bold 13px ${FONT_MAIN}`;
  ctx.fillText("MẶT XÚC XẮC", 292, 162);

  await drawDiceRow(ctx, diceResults);

  ctx.fillStyle = resultAccent;
  ctx.shadowColor = `${resultAccent}66`;
  ctx.shadowBlur = 18;
  ctx.font = `bold 48px ${FONT_MAIN}`;
  ctx.fillText(resultText, 292, 373);
  ctx.shadowColor = "transparent";
  roundedRect(ctx, 225, 408, 134, 30, 15);
  ctx.fillStyle = `${resultAccent}24`;
  ctx.fill();
  ctx.fillStyle = resultAccent;
  ctx.font = `bold 14px ${FONT_MAIN}`;
  ctx.fillText(`TỔNG  ${total}`, 292, 423);

  drawPanel(ctx, 574, 136, 352, 318, choiceColor, false);
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.52)";
  ctx.font = `bold 13px ${FONT_MAIN}`;
  ctx.fillText("VÁN CỦA BẠN", 606, 169);

  roundedRect(ctx, 606, 193, 288, 64, 18);
  ctx.fillStyle = `${choiceColor}18`;
  ctx.fill();
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.50)";
  ctx.font = `bold 13px ${FONT_MAIN}`;
  ctx.fillText("ĐÃ CHỌN", 628, 225);
  ctx.textAlign = "right";
  ctx.fillStyle = choiceColor;
  ctx.font = `bold 25px ${FONT_MAIN}`;
  ctx.fillText(choiceText, 872, 225);

  drawInfoRow(ctx, "TIỀN CƯỢC", `${formatCurrency(betAmount, 1_000_000_000_000)} VNĐ`, 608, 288, 264);
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.beginPath();
  ctx.moveTo(608, 315);
  ctx.lineTo(872, 315);
  ctx.stroke();

  const outcomeColor = isJackpot || playerWin ? "#ffd665" : "#ff7887";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.50)";
  ctx.font = `bold 12px ${FONT_MAIN}`;
  ctx.fillText(isJackpot ? "JACKPOT • TIỀN NHẬN" : `${moneyOutcome} • ${playerWin ? "LỢI NHUẬN" : "TIỀN MẤT"}`, 750, 344);
  ctx.fillStyle = outcomeColor;
  const outcomeText = `${isJackpot || playerWin ? "+" : "−"}${formatCurrency(outcomeAmount, 1_000_000_000_000)} VNĐ`;
  ctx.font = `bold ${fitText(ctx, outcomeText, 280, 31, 20)}px ${FONT_MAIN}`;
  ctx.fillText(outcomeText, 750, 384);

  roundedRect(ctx, 650, 414, 200, 26, 13);
  ctx.fillStyle = `${outcomeColor}1f`;
  ctx.fill();
  ctx.fillStyle = outcomeColor;
  ctx.font = `bold 12px ${FONT_MAIN}`;
  ctx.fillText(isJackpot ? "NỔ HŨ THÀNH CÔNG" : playerWin ? "CHÚC MỪNG BẠN" : "CHÚC MAY MẮN LẦN SAU", 750, 427);

  roundedRect(ctx, 34, 476, 892, 44, 18);
  ctx.fillStyle = "rgba(255,255,255,0.065)";
  ctx.fill();
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.48)";
  ctx.font = `bold 12px ${FONT_MAIN}`;
  ctx.fillText("10 PHIÊN GẦN NHẤT", 55, 498);

  const displayResults = recentResults.slice(-10);
  const startX = 372;
  displayResults.forEach((item, index) => {
    const even = item.total % 2 === 0;
    const x = startX + index * 52;
    ctx.beginPath();
    ctx.arc(x, 498, 14, 0, Math.PI * 2);
    ctx.fillStyle = even ? "rgba(99,230,166,0.18)" : "rgba(255,114,189,0.18)";
    ctx.fill();
    ctx.strokeStyle = even ? "#63e6a6" : "#ff72bd";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillStyle = even ? "#63e6a6" : "#ff72bd";
    ctx.font = `bold 12px ${FONT_MAIN}`;
    ctx.fillText(even ? "C" : "L", x, 498);
  });

  if (displayResults.length === 0) {
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,0.34)";
    ctx.font = `bold 12px ${FONT_MAIN}`;
    ctx.fillText("CHƯA CÓ DỮ LIỆU", 902, 498);
  }

  const filePath = path.resolve(`./assets/temp/chanle_result_${Date.now()}.png`);
  await writeFilePromise(filePath, canvas.toBuffer());
  return filePath;
}
