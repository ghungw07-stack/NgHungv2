import { Canvas, loadImage } from "skia-canvas";
import fs from "fs/promises";
import path from "path";

const CARD_COORDS = {
  "1":  { x: 41,  y: 94,  w: 186, h: 102, r: 12, label: "Cá con", num: "SỐ 1", rate: "57,62%" },
  "2":  { x: 247, y: 94,  w: 186, h: 102, r: 12, label: "Cá vàng nhỏ", num: "SỐ 2", rate: "34,57%" },
  "3":  { x: 453, y: 94,  w: 186, h: 102, r: 12, label: "Cá nóc", num: "SỐ 3", rate: "21,61%" },
  "6":  { x: 659, y: 94,  w: 186, h: 102, r: 12, label: "Bạch tuộc hồng", num: "SỐ 6", rate: "2,47%" },
  "7":  { x: 41,  y: 230, w: 186, h: 102, r: 12, label: "Bạch tuộc tím", num: "SỐ 7", rate: "12,35%" },
  "8":  { x: 247, y: 230, w: 186, h: 102, r: 12, label: "Cua đỏ", num: "SỐ 8", rate: "7,20%" },
  "9":  { x: 453, y: 230, w: 186, h: 102, r: 12, label: "Tôm đỏ", num: "SỐ 9", rate: "4,32%" },
  "10": { x: 41,  y: 366, w: 186, h: 102, r: 12, label: "Cá lớn", num: "SỐ 10", rate: "0,43%" },
  "11": { x: 247, y: 366, w: 186, h: 102, r: 12, label: "Cá vàng", num: "SỐ 11", rate: "0,17%" },
  "12": { x: 453, y: 366, w: 186, h: 102, r: 12, label: "Cá rồng", num: "SỐ 12", rate: "0,08%" },
  "boss": { x: 653, y: 302, w: 597, h: 83,  r: 12, label: "Boss Biển Cả", num: "BOSS", rate: "0,01%" },
};

const BASE_IMAGE_PATH = path.join(process.cwd(), "assets", "resources", "banca", "banca_perfect_base.png");

function formatMoneyVN(num) {
  return String(num || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export async function createBancaResultImage(result, history = [], game = null) {
  const players = Object.values(game?.players || {});
  const winner = players.find((p) => p.door?.key === result?.key);
  const featured = winner || (players.length ? [...players].sort((a, b) => Number(b.amount) - Number(a.amount))[0] : null);

  const targetKey = featured ? featured.door?.key : (result?.key || "1");
  const betAmount = featured ? Number(featured.amount) : 10000;
  const isWin = featured ? (featured.door?.key === result?.key) : true;
  const multiplier = Number(result?.multiplier || featured?.door?.multiplier || 1.5);
  const winAmount = isWin ? Math.floor(betAmount * multiplier) : 0;

  const card = CARD_COORDS[targetKey] || CARD_COORDS["1"];

  const baseImg = await loadImage(BASE_IMAGE_PATH);
  const canvas = new Canvas(1280, 504);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(baseImg, 0, 0);

  // 1. TIỀN ĐẠN in top right: (x starts after TIEN DAN at ~908, y=38)
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "bold 23px sans-serif";
  ctx.fillStyle = "#ffe266";
  ctx.shadowColor = "rgba(255, 226, 102, 0.4)";
  ctx.shadowBlur = 6;
  ctx.fillText(formatMoneyVN(betAmount), 908, 38);
  ctx.shadowBlur = 0;

  // 2. Selection Box around target card
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(card.x + 2, card.y + 2, card.w - 4, card.h - 4, card.r);
  const strokeColor = isWin ? "#2ecc71" : "#ff2b38";
  const glowColor = isWin ? "rgba(46, 204, 113, 0.9)" : "rgba(255, 43, 56, 0.9)";
  const tintColor = isWin ? "rgba(46, 204, 113, 0.12)" : "rgba(255, 43, 56, 0.12)";
  ctx.fillStyle = tintColor;
  ctx.fill();

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 3.5;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.restore();

  // 3. Right panel: Button, Amount, Subtitle
  const centerX = 1010;

  // Button: TRƯỢT or TRÚNG
  const btnW = 196, btnH = 54, btnY = 112;
  const btnX = centerX - btnW / 2;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(btnX, btnY, btnW, btnH, 27);
  const btnGrad = ctx.createLinearGradient(centerX, btnY, centerX, btnY + btnH);
  if (isWin) {
    btnGrad.addColorStop(0, "#2ecc71");
    btnGrad.addColorStop(0.4, "#27ae60");
    btnGrad.addColorStop(1, "#196f3d");
    ctx.shadowColor = "rgba(46, 204, 113, 0.65)";
  } else {
    btnGrad.addColorStop(0, "#e74c3c");
    btnGrad.addColorStop(0.4, "#c0392b");
    btnGrad.addColorStop(1, "#78281f");
    ctx.shadowColor = "rgba(231, 76, 60, 0.65)";
  }
  ctx.shadowBlur = 16;
  ctx.fillStyle = btnGrad;
  ctx.fill();

  ctx.strokeStyle = isWin ? "#abebc6" : "#f5b7b1";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 24px sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(isWin ? "TRÚNG" : "TRƯỢT", centerX, btnY + btnH / 2);
  ctx.restore();

  // Amount: e.g. -50.000 or +600.000
  const amountStr = (isWin ? "+" : "-") + formatMoneyVN(isWin ? winAmount : betAmount);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 44px sans-serif";
  const amtColor = isWin ? "#48f788" : "#ff3b47";
  const amtGlow = isWin ? "rgba(72, 247, 136, 0.75)" : "rgba(255, 59, 71, 0.75)";
  ctx.shadowColor = amtGlow;
  ctx.shadowBlur = 18;
  ctx.strokeStyle = "#101010";
  ctx.lineWidth = 4;
  ctx.strokeText(amountStr, centerX, 218);
  ctx.fillStyle = amtColor;
  ctx.fillText(amountStr, centerX, 218);
  ctx.restore();

  // Subtitle: "Hụt <label>" or "Bắn hạ <label>"
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 18px sans-serif";
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 6;
  ctx.fillStyle = "#e0f2fe";
  const subText = isWin ? `Bắn hạ ${card.label}` : `Hụt ${card.label}`;
  ctx.fillText(subText, centerX, 266);
  ctx.restore();

  // 4. Bottom stats values:
  // Col 1 (Muc tieu): centered at x=749
  // Col 2 (Ti le): centered at x=950
  // Col 3 (Tong nhan): centered at x=1147
  // Y = 454
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 21px sans-serif";
  ctx.fillStyle = "#ffe266";
  ctx.shadowColor = "rgba(255, 226, 102, 0.35)";
  ctx.shadowBlur = 6;
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2.5;

  const val1 = card.num;
  const val2 = card.rate;
  const val3 = isWin ? formatMoneyVN(winAmount) : "0";

  ctx.strokeText(val1, 749, 454);
  ctx.fillText(val1, 749, 454);

  ctx.strokeText(val2, 950, 454);
  ctx.fillText(val2, 950, 454);

  ctx.strokeText(val3, 1147, 454);
  ctx.fillText(val3, 1147, 454);
  ctx.restore();

  const tempDir = path.join(process.cwd(), "assets", "temp");
  await fs.mkdir(tempDir, { recursive: true });
  const output = path.join(tempDir, `banca_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.png`);
  await fs.writeFile(output, await canvas.toBuffer("image/png"));
  return output;
}

// Backward compatibility alias if anything imports createBancaResultGif
export const createBancaResultGif = createBancaResultImage;
