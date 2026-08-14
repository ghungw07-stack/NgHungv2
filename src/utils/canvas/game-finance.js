import path from "path";
import Big from "big.js";
import { createCanvas, loadImage } from "canvas";
import { FONT_MAIN, formatCurrency } from "../format-util.js";
import { writeFilePromise } from "../util.js";

const TIERS = [
  { key: "silver", name: "BẠC", min: "0", color: "#d9e2ea", deep: "#506172", dark: "#111923", glow: "rgba(217,226,234,0.30)", daily: "3000000000", sendLimit: "50000000000", receiveLimit: "15000000000" },
  { key: "gold", name: "VÀNG", min: "50000", color: "#ffd568", deep: "#9b6414", dark: "#211707", glow: "rgba(255,213,104,0.30)", daily: "5000000000", sendLimit: "100000000000", receiveLimit: "30000000000" },
  { key: "platinum", name: "BẠCH KIM", min: "100000", color: "#a7f0f2", deep: "#4d8591", dark: "#0d1c23", glow: "rgba(167,240,242,0.28)", daily: "12000000000", sendLimit: "300000000000", receiveLimit: "120000000000" },
  { key: "emerald", name: "LỤC BẢO", min: "200000", color: "#50c878", deep: "#187a38", dark: "#0a2612", glow: "rgba(80,200,120,0.30)", daily: "30000000000", sendLimit: "1200000000000", receiveLimit: "300000000000" },
  { key: "ruby", name: "HỒNG NGỌC", min: "500000", color: "#ff7388", deep: "#971d45", dark: "#290b18", glow: "rgba(255,115,136,0.30)", daily: "90000000000", sendLimit: "3600000000000", receiveLimit: "800000000000" },
  { key: "diamond", name: "KIM CƯƠNG", min: "1000000", color: "#70d3ff", deep: "#3159ad", dark: "#0a1530", glow: "rgba(112,211,255,0.30)", daily: "200000000000", sendLimit: "8000000000000", receiveLimit: "1800000000000" },
  { key: "gold_dragon", name: "KIM LONG", min: "2000000", color: "#ffd45a", deep: "#a86408", dark: "#211204", glow: "rgba(255,212,90,0.38)", daily: "500000000000", sendLimit: "20000000000000", receiveLimit: "5000000000000" },
  { key: "angel", name: "MỸ NHÂN", min: "2500000", color: "#ffa3d1", deep: "#a84576", dark: "#2e0f1d", glow: "rgba(255,163,209,0.38)", daily: "500000000000", sendLimit: "20000000000000", receiveLimit: "5000000000000" },
];

const KIM_LONG_DRAGON_PATH = path.resolve("./assets/resources/game/kim-long-dragon.png");
const MY_NHAN_BG_PATH = path.resolve("./assets/resources/game/my-nhan-bg.jpg");

function drawDragonArtwork(ctx, image, x, y, width, height, alpha = 0.32) {
  if (!image) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(image, x, y, width, height);
  ctx.restore();
}

function drawDragonRankBackground(ctx, image, x, y, width, height, radius = 16) {
  if (!image) return;
  ctx.save();
  roundedRect(ctx, x, y, width, height, radius);
  ctx.clip();
  // Phủ gần kín khung nhưng giữ alpha thấp để tên/avatar/số dư luôn dễ đọc.
  ctx.globalAlpha = 0.18;
  const dragonWidth = width - 140;
  const dragonHeight = dragonWidth * (image.height / image.width);
  // Giữ đúng tỉ lệ rồng thật; phóng lớn rồi crop trong khung thay vì kéo dài thân.
  ctx.drawImage(image, x + 112, y - dragonHeight * 0.26, dragonWidth, dragonHeight);
  const fade = ctx.createLinearGradient(x, y, x + width, y);
  fade.addColorStop(0, "rgba(3,5,9,0.72)");
  fade.addColorStop(0.35, "rgba(3,5,9,0.38)");
  fade.addColorStop(0.72, "rgba(3,5,9,0.05)");
  fade.addColorStop(1, "rgba(3,5,9,0.30)");
  ctx.globalAlpha = 1;
  ctx.fillStyle = fade;
  ctx.fillRect(x, y, width, height);
  ctx.restore();
}

export function getGameTier(rankPoints) {
  let value;
  try {
    value = new Big(rankPoints || 0);
  } catch {
    value = new Big(0);
  }
  for (let index = TIERS.length - 1; index >= 0; index--) {
    if (value.gte(TIERS[index].min)) return TIERS[index];
  }
  return TIERS[0];
}

export function getGameTierProgress(rankPoints) {
  const points = Math.max(0, Number(rankPoints) || 0);
  const tier = getGameTier(points);
  const index = TIERS.findIndex((item) => item.key === tier.key);
  const nextTier = TIERS[index + 1] || null;
  const start = Number(tier.min);
  const end = nextTier ? Number(nextTier.min) : start;
  return { tier, nextTier, points, progress: nextTier ? Math.max(0, Math.min(1, (points - start) / (end - start))) : 1 };
}

export function getGameTierByName(input) {
  const normalized = String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]/g, "");
  const aliases = {
    bac: "silver", silver: "silver",
    vang: "gold", gold: "gold",
    bachkim: "platinum", platinum: "platinum",
    kimcuong: "diamond", diamond: "diamond",
    hongngoc: "ruby", ruby: "ruby",
    kimlong: "gold_dragon", gold_dragon: "gold_dragon", golddragon: "gold_dragon",
  };
  return TIERS.find((tier) => tier.key === aliases[normalized]) || null;
}

/** Danh hiệu cá nhân suy ra từ lịch sử chơi, không gắn cứng với hạng tài sản. */
export function getPlayerTitle(playerInfo = {}) {
  const games = Math.max(0, Number(playerInfo.totalGames) || 0);
  const wins = Math.max(0, Number(playerInfo.totalWinGames) || 0);
  const winRate = games ? (wins / games) * 100 : Number(playerInfo.winRate) || 0;
  const winnings = Number(playerInfo.totalWinnings) || 0;
  const losses = Math.abs(Number(playerInfo.totalLosses) || 0);
  const netProfit = Number(playerInfo.netProfit) || winnings - losses;

  if (games >= 50 && winRate >= 65 && netProfit > 0) return "CON NHÀ CÁI";
  if (games >= 30 && winRate >= 55 && netProfit > 0) return "ĐỌC VỊ NHÀ CÁI";
  if (winnings >= 1000000000 && netProfit > 0) return "THỢ SĂN LỢI NHUẬN";
  if (games >= 100 && netProfit > 0) return "TAY CHƠI BỀN BỈ";
  if (games >= 20 && netProfit > 0) return "KẺ SĂN KÈO";
  if (games >= 10 && winRate >= 50) return "DÂN CHƠI CÓ SỐ";
  return "NGƯỜI CHƠI MỚI";
}

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

function drawPanel(ctx, x, y, width, height, tier, strong = false) {
  ctx.save();
  ctx.shadowColor = strong ? tier.glow : "rgba(0,0,0,0.40)";
  ctx.shadowBlur = strong ? 24 : 14;
  ctx.shadowOffsetY = 8;
  roundedRect(ctx, x, y, width, height, 22);
  const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
  gradient.addColorStop(0, strong ? `${tier.color}26` : "rgba(255,255,255,0.09)");
  gradient.addColorStop(1, "rgba(3,5,10,0.82)");
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = strong ? `${tier.color}b8` : "rgba(255,255,255,0.14)";
  ctx.lineWidth = strong ? 2 : 1.2;
  ctx.stroke();
  ctx.restore();
}

function drawBackground(ctx, width, height, tier) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, tier.dark);
  gradient.addColorStop(0.48, "#12151d");
  gradient.addColorStop(1, "#06080d");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(width * 0.68, height * 0.28, 10, width * 0.68, height * 0.28, width * 0.58);
  glow.addColorStop(0, tier.glow);
  glow.addColorStop(0.55, `${tier.color}0c`);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = "#ffffff";
  for (let x = -height; x < width; x += 42) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + height, height);
    ctx.stroke();
  }
  ctx.restore();
}

function fitFont(ctx, text, maxWidth, startSize, minSize = 14, weight = "bold") {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px ${FONT_MAIN}`;
    if (ctx.measureText(String(text)).width <= maxWidth) break;
    size -= 2;
  }
  return `${weight} ${size}px ${FONT_MAIN}`;
}

function fullNumber(value) {
  try {
    const negative = new Big(value || 0).lt(0);
    const digits = new Big(value || 0).abs().round(0).toFixed(0);
    return `${negative ? "−" : ""}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
  } catch {
    return "0";
  }
}

function compactMoney(value) {
  try {
    const amount = new Big(value || 0);
    if (amount.abs().lt(1_000_000_000)) return fullNumber(amount);
    const billions = amount.div(1_000_000_000);
    const [integerPart, decimalPart = ""] = billions.toFixed(2).split(".");
    const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const decimals = decimalPart.replace(/0+$/, "");
    return `${grouped}${decimals ? `,${decimals}` : ""} TỶ`;
  } catch {
    return "0";
  }
}

function formatDate(value = Date.now()) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour12: false,
  });
}

async function safeLoadImage(source) {
  if (!source) return null;
  try {
    return await loadImage(source);
  } catch {
    return null;
  }
}

function drawAvatar(ctx, image, centerX, centerY, size, borderColor) {
  ctx.save();
  ctx.shadowColor = `${borderColor}66`;
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(centerX, centerY, size / 2 + 5, 0, Math.PI * 2);
  ctx.fillStyle = borderColor;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.beginPath();
  ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
  ctx.clip();
  if (image) {
    const scale = Math.max(size / image.width, size / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    ctx.drawImage(image, centerX - width / 2, centerY - height / 2, width, height);
  } else {
    const gradient = ctx.createLinearGradient(centerX - size / 2, centerY - size / 2, centerX + size / 2, centerY + size / 2);
    gradient.addColorStop(0, "#334155");
    gradient.addColorStop(1, "#111827");
    ctx.fillStyle = gradient;
    ctx.fillRect(centerX - size / 2, centerY - size / 2, size, size);
    ctx.fillStyle = "rgba(255,255,255,0.70)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${Math.round(size * 0.38)}px ${FONT_MAIN}`;
    ctx.fillText("?", centerX, centerY + 2);
  }
  ctx.restore();
}

function drawTierBadge(ctx, tier, x, y, width = 142, height = 32) {
  roundedRect(ctx, x, y, width, height, height / 2);
  ctx.fillStyle = `${tier.color}20`;
  ctx.fill();
  ctx.strokeStyle = `${tier.color}b8`;
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.fillStyle = tier.color;
  ctx.font = `bold ${height < 30 ? 11 : 13}px ${FONT_MAIN}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(tier.name, x + width / 2, y + height / 2 + 1);
}

function drawDragon(ctx, x, y, scale, color, alpha = 0.28) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Rồng Kim Long toàn thân nhìn ngang: đầu trái, thân uốn chữ S, đuôi phải.
  ctx.lineWidth = 34;
  ctx.beginPath();
  ctx.moveTo(-137, -10);
  ctx.bezierCurveTo(-80, 58, -55, -82, 20, -57);
  ctx.bezierCurveTo(91, -31, 77, 62, 145, 45);
  ctx.bezierCurveTo(192, 33, 207, -28, 182, -58);
  ctx.stroke();

  // Bụng giáp chia đốt và vảy lưng.
  ctx.globalAlpha = alpha * 0.75;
  ctx.lineWidth = 3;
  for (let i = -112; i <= 158; i += 19) {
    const wave = Math.sin((i + 112) / 43);
    ctx.beginPath();
    ctx.arc(i, wave * 35 - 5, 8, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }
  ctx.globalAlpha = alpha;

  // Gai lửa dọc sống lưng.
  for (const [sx, sy, rot] of [[-105,-39,-0.8],[-70,-67,-0.45],[-30,-84,-0.15],[17,-77,0.1],[59,-55,0.35],[101,-13,0.55],[145,15,0.8]]) {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.moveTo(-11, 10);
    ctx.quadraticCurveTo(-2, -25, 15, -18);
    ctx.quadraticCurveTo(5, -5, 12, 11);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Cổ và đầu rồng quay về bên trái.
  ctx.lineWidth = 26;
  ctx.beginPath();
  ctx.moveTo(-126, -2);
  ctx.quadraticCurveTo(-150, -43, -178, -38);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-149, -60);
  ctx.quadraticCurveTo(-186, -83, -216, -55);
  ctx.lineTo(-235, -30);
  ctx.lineTo(-218, -7);
  ctx.quadraticCurveTo(-187, 7, -154, -12);
  ctx.closePath();
  ctx.fill();

  // Mõm dài, hàm há và răng nanh.
  ctx.beginPath();
  ctx.moveTo(-201, -32);
  ctx.quadraticCurveTo(-244, -33, -260, -10);
  ctx.quadraticCurveTo(-240, 4, -202, -8);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-252, -8); ctx.lineTo(-235, 10); ctx.lineTo(-207, -5);
  ctx.quadraticCurveTo(-231, 26, -260, 4); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = Math.min(1, alpha + 0.28);
  ctx.fillStyle = "#fff0a0";
  for (const fx of [-242, -228, -214]) {
    ctx.beginPath(); ctx.moveTo(fx, -5); ctx.lineTo(fx + 5, 8); ctx.lineTo(fx + 10, -7); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;

  // Sừng, bờm và râu dài quanh đầu.
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(-190, -59); ctx.quadraticCurveTo(-183, -104, -145, -111); ctx.quadraticCurveTo(-170, -86, -166, -57);
  ctx.moveTo(-211, -56); ctx.quadraticCurveTo(-222, -96, -194, -111); ctx.quadraticCurveTo(-207, -83, -192, -57);
  ctx.stroke();
  for (const [mx, my, rot] of [[-170,-64,-0.2],[-151,-52,0.15],[-148,-28,0.45],[-165,-5,0.8]]) {
    ctx.save(); ctx.translate(mx,my); ctx.rotate(rot);
    ctx.beginPath(); ctx.moveTo(-8,8); ctx.quadraticCurveTo(3,-22,19,-14); ctx.lineTo(10,10); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-223, -18); ctx.bezierCurveTo(-276, -57, -290, -24, -303, -4);
  ctx.moveTo(-219, -8); ctx.bezierCurveTo(-270, 12, -278, 37, -292, 45);
  ctx.stroke();

  // Bốn chân khỏe và móng vuốt.
  ctx.lineWidth = 8;
  for (const [legX, legY, direction] of [[-103,25,-1],[-48,27,1],[91,38,-1],[142,31,1]]) {
    ctx.beginPath();
    ctx.moveTo(legX, legY);
    ctx.quadraticCurveTo(legX + direction * 18, legY + 31, legX + direction * 44, legY + 37);
    ctx.lineTo(legX + direction * 59, legY + 27);
    ctx.stroke();
    ctx.lineWidth = 3;
    for (let claw = -1; claw <= 1; claw++) {
      ctx.beginPath();
      ctx.moveTo(legX + direction * 58, legY + 27);
      ctx.lineTo(legX + direction * (72 + claw * 2), legY + 17 + claw * 9);
      ctx.stroke();
    }
    ctx.lineWidth = 8;
  }

  // Chùm lông đuôi giống ảnh mẫu.
  for (let feather = -2; feather <= 2; feather++) {
    ctx.save(); ctx.translate(185, -58); ctx.rotate(feather * 0.22 - 0.25);
    ctx.beginPath(); ctx.moveTo(0,0); ctx.quadraticCurveTo(36,-24,67,-5); ctx.quadraticCurveTo(36,-4,9,12); ctx.closePath(); ctx.fill(); ctx.restore();
  }

  // Mắt và lỗ mũi tương phản.
  ctx.globalAlpha = Math.min(1, alpha + 0.35);
  ctx.fillStyle = "#fff4b0";
  ctx.beginPath();
  ctx.arc(-205, -38, 5, 0, Math.PI * 2);
  ctx.arc(-249, -19, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLabelValue(ctx, label, value, x, y, width, tier, valueColor = "#ffffff") {
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255,255,255,0.50)";
  ctx.font = `bold 13px ${FONT_MAIN}`;
  ctx.fillText(label, x, y);
  ctx.textAlign = "right";
  ctx.fillStyle = valueColor || tier.color;
  ctx.font = fitFont(ctx, value, width * 0.64, 22, 14);
  ctx.fillText(value, x + width, y);
}

export async function createGameRankImage(players, title = "BẢNG XẾP HẠNG GAME", viewer = null) {
  const width = 900;
  const height = 1332;
  const topTier = getGameTier(players[0]?.rankPoints || 0);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  
  // Background Global Premium Style
  ctx.fillStyle = "#0A0A0C"; 
  ctx.fillRect(0, 0, width, height);
  
  ctx.save();
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, "#080B10");
  bgGrad.addColorStop(1, "#030406");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  const drawOrb = (x, y, r, alpha, color) => {
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `${color}${Math.round(alpha*255).toString(16).padStart(2,'0')}`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  };
  
  drawOrb(width * 0.2, height * 0.1, width * 0.7, 0.2, topTier.color);
  drawOrb(width * 0.8, height * 0.9, width * 0.7, 0.15, topTier.color);

  ctx.fillStyle = "rgba(255, 255, 255, 0.015)";
  for (let i = 0; i < width; i += 4) {
    for (let j = 0; j < height; j += 4) {
      if (Math.random() > 0.5) ctx.fillRect(i, j, 2, 2);
    }
  }
  ctx.restore();

  // Header
  ctx.save();
  ctx.beginPath();
  roundedRect(ctx, 30, 24, 840, 108, 20);
  ctx.fillStyle = "rgba(20, 22, 28, 0.65)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  ctx.textBaseline = "middle";
  ctx.strokeStyle = topTier.color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(51, 83); ctx.lineTo(47, 55); ctx.lineTo(65, 68); ctx.lineTo(76, 48);
  ctx.lineTo(87, 68); ctx.lineTo(105, 55); ctx.lineTo(101, 83); ctx.closePath();
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(53, 92); ctx.lineTo(99, 92); ctx.stroke();
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = fitFont(ctx, title, 550, 38, 25);
  ctx.fillText(title, 122, 65);
  ctx.fillStyle = "rgba(255,255,255,0.58)";
  ctx.font = `bold 14px ${FONT_MAIN}`;
  ctx.fillText("TOP 10 NGƯỜI GIÀU NHẤT TOÀN HỆ THỐNG", 122, 103);
  ctx.textAlign = "right";
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 18px ${FONT_MAIN}`;
  ctx.fillText(new Date().toLocaleDateString("vi-VN"), 838, 84);

  const topTen = players.slice(0, 10);
  const [avatars, dragonImage, beautyImage] = await Promise.all([
    Promise.all(topTen.map((player) => safeLoadImage(player.avatar))),
    topTen.some((player) => getGameTier(player.rankPoints).key === "gold_dragon") || getGameTier(viewer?.rankPoints).key === "gold_dragon"
      ? safeLoadImage(KIM_LONG_DRAGON_PATH)
      : null,
    topTen.some((player) => getGameTier(player.rankPoints).key === "angel") || getGameTier(viewer?.rankPoints).key === "angel"
      ? safeLoadImage(MY_NHAN_BG_PATH)
      : null,
  ]);
  
  const rowX = 42;
  const rowWidth = 816;
  const rowHeight = 86;
  const rowGap = 12;

  const drawRow = (ctx, y, player, index, avatar, isViewer = false) => {
    const tier = getGameTier(player.rankPoints);
    const isPremium = ["emerald", "ruby", "diamond", "angel"].includes(tier.key);
    const isDragon = tier.key === "gold_dragon";
    
    ctx.save();
    ctx.beginPath();
    roundedRect(ctx, rowX, y, rowWidth, rowHeight, 20);

    // Nền row
    if (tier.key === "angel") {
      ctx.fillStyle = "rgba(20, 22, 28, 0.85)";
      ctx.fill();
      ctx.clip();
      if (beautyImage) {
        ctx.globalAlpha = 0.5;
        const sh = rowWidth * (beautyImage.height/beautyImage.width);
        ctx.drawImage(beautyImage, rowX, y - sh/2 + rowHeight/2, rowWidth, sh);
        ctx.globalAlpha = 1;
      }
      const wash = ctx.createLinearGradient(rowX, y, rowX + rowWidth, y);
      wash.addColorStop(0, `${tier.color}66`);
      wash.addColorStop(0.5, "rgba(0,0,0,0.2)");
      wash.addColorStop(1, `${tier.color}22`);
      ctx.fillStyle = wash;
      ctx.fill();
      ctx.shadowColor = tier.color;
      ctx.shadowBlur = 15;
      ctx.strokeStyle = `${tier.color}AA`;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (isPremium) {
      ctx.fillStyle = "rgba(20, 22, 28, 0.75)";
      ctx.fill();
      const wash = ctx.createLinearGradient(rowX, y, rowX + rowWidth, y);
      wash.addColorStop(0, `${tier.color}33`);
      wash.addColorStop(0.5, "rgba(0,0,0,0)");
      wash.addColorStop(1, `${tier.color}11`);
      ctx.fillStyle = wash;
      ctx.fill();
      
      // Viền Neon Aurora
      ctx.shadowColor = tier.color;
      ctx.shadowBlur = 15;
      ctx.strokeStyle = tier.color;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    } else if (isDragon) {
      ctx.fillStyle = "rgba(10, 10, 12, 0.85)";
      ctx.fill();
      ctx.clip();
      if (dragonImage) {
        ctx.globalAlpha = 0.4;
        ctx.drawImage(dragonImage, rowX, y - rowHeight, rowWidth, rowWidth * (dragonImage.height/dragonImage.width));
        ctx.globalAlpha = 1;
      }
      ctx.shadowColor = tier.color;
      ctx.shadowBlur = 15;
      ctx.strokeStyle = `${tier.color}AA`;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.fillStyle = "rgba(25, 27, 33, 0.65)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 1;
      ctx.stroke();
      if (index < 3) {
        ctx.shadowColor = tier.color;
        ctx.shadowBlur = 10;
        ctx.strokeStyle = `${tier.color}88`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    ctx.restore();

    // Số hạng
    ctx.textAlign = "center";
    ctx.beginPath();
    ctx.arc(82, y + rowHeight / 2, 25, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(5,8,12,0.75)";
    ctx.fill();
    ctx.strokeStyle = tier.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = index === 0 ? tier.color : "#ffffff";
    ctx.font = `bold 18px ${FONT_MAIN}`;
    ctx.fillText(String(player.rank || (isViewer ? "–" : index + 1)), 82, y + 44);

    // Avatar
    ctx.save();
    ctx.beginPath();
    ctx.arc(143, y + 43, 31, 0, Math.PI * 2);
    ctx.clip();
    if (avatar) ctx.drawImage(avatar, 143 - 31, y + 43 - 31, 62, 62);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(143, y + 43, 33, 0, Math.PI * 2);
    ctx.strokeStyle = tier.color;
    ctx.lineWidth = 2;
    if (isPremium || isDragon) {
      ctx.save();
      ctx.shadowColor = tier.color;
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.stroke();
    }

    // Tên
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = fitFont(ctx, player.playerName || "Người chơi", 355, 25, 16);
    ctx.fillText(player.playerName || "Người chơi", 187, y + 30);
    
    // Badge danh hiệu
    const titleText = `${tier.name.toUpperCase()} • ${getPlayerTitle(player)}`;
    ctx.font = fitFont(ctx, titleText, 300, 13, 9);
    const badgeW = ctx.measureText(titleText).width + 24;
    roundedRect(ctx, 187, y + 52, badgeW, 23, 11);
    if (isPremium) {
      ctx.fillStyle = `${tier.color}33`;
      ctx.fill();
      ctx.strokeStyle = `${tier.color}`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = tier.color;
    } else {
      ctx.fillStyle = "rgba(3,6,10,0.72)";
      ctx.fill();
      ctx.fillStyle = tier.color;
    }
    ctx.fillText(titleText, 199, y + 64);

    // Tài sản
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,0.48)";
    ctx.font = `bold 11px ${FONT_MAIN}`;
    ctx.fillText("TÀI SẢN", 826, y + 24);
    ctx.fillStyle = tier.color;
    ctx.font = fitFont(ctx, compactMoney(player.balance), 245, 28, 10);
    if (isPremium || isDragon) {
      ctx.save();
      ctx.shadowColor = tier.color;
      ctx.shadowBlur = 10;
      ctx.fillText(compactMoney(player.balance), 826, y + 57);
      ctx.restore();
    } else {
      ctx.fillText(compactMoney(player.balance), 826, y + 57);
    }
  };

  topTen.forEach((player, index) => {
    const y = 154 + index * (rowHeight + rowGap);
    drawRow(ctx, y, player, index, avatars[index], false);
  });

  if (topTen.length === 0) {
    ctx.save();
    ctx.beginPath();
    roundedRect(ctx, 42, 170, 816, 180, 20);
    ctx.fillStyle = "rgba(20,22,28,0.65)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.textAlign = "center";
    ctx.font = `bold 23px ${FONT_MAIN}`;
    ctx.fillText("CHƯA CÓ DỮ LIỆU XẾP HẠNG", width / 2, 260);
    ctx.restore();
  }

  // Vị trí của người gọi lệnh
  const viewerY = 1167;
  ctx.strokeStyle = `${(viewer ? getGameTier(viewer.rankPoints) : topTier).color}70`;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(44, viewerY); ctx.lineTo(334, viewerY); ctx.moveTo(566, viewerY); ctx.lineTo(856, viewerY); ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = viewer ? getGameTier(viewer.rankPoints).color : "rgba(255,255,255,0.45)";
  ctx.font = `bold 14px ${FONT_MAIN}`;
  ctx.fillText("VỊ TRÍ CỦA BẠN", width / 2, viewerY);

  if (viewer) {
    const viewerAvatar = await safeLoadImage(viewer.avatar);
    drawRow(ctx, 1192, viewer, 0, viewerAvatar, true);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.font = `bold 11px ${FONT_MAIN}`;
  ctx.fillText("LỤC BẢO  •  HỒNG NGỌC  •  KIM CƯƠNG  •  KIM LONG", width / 2, 1310);

  const filePath = path.resolve(`./assets/temp/game_rank_${Date.now()}.png`);
  await writeFilePromise(filePath, canvas.toBuffer());
  return filePath;
}
export async function createGamePlayerCard(playerInfo) {
  const W = 1100;
  const H = 720;
  const tier = getGameTier(playerInfo.rankPoints);
  const { nextTier, progress: tierProgress } = getGameTierProgress(playerInfo.rankPoints);
  const isDragon = tier.key === "gold_dragon";
  const isPremium = ["emerald", "ruby", "diamond", "angel"].includes(tier.key);
  
  const dragonImage = isDragon ? await safeLoadImage(KIM_LONG_DRAGON_PATH) : null;
  const beautyImage = tier.key === "angel" ? await safeLoadImage(MY_NHAN_BG_PATH) : null;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "middle";

  // NỀN CƠ BẢN
  ctx.fillStyle = "#0A0A0C"; 
  ctx.fillRect(0, 0, W, H);

  // BACKGROUND
  if (isDragon && dragonImage) {
    ctx.save();
    const scale = Math.max(W / dragonImage.width, H / dragonImage.height) * 1.2;
    const dw = dragonImage.width * scale;
    const dh = dragonImage.height * scale;
    const dx = (W - dw) / 2;
    const dy = (H - dh) / 2;
    ctx.globalAlpha = 0.5;
    ctx.drawImage(dragonImage, dx, dy, dw, dh);
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  } else if (tier.key === "angel" && beautyImage) {
    ctx.save();
    const isW = typeof W !== 'undefined' ? W : width;
    const isH = typeof H !== 'undefined' ? H : height;
    const scale = Math.max(isW / beautyImage.width, isH / beautyImage.height);
    const dw = beautyImage.width * scale;
    const dh = beautyImage.height * scale;
    const dx = (isW - dw) / 2;
    const dy = (isH - dh) / 2;
    ctx.globalAlpha = 0.55;
    ctx.drawImage(beautyImage, dx, dy, dw, dh);
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(0, 0, isW, isH);
    ctx.restore();
  } else if (isPremium) {
    // Premium Aurora Background
    ctx.save();
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, "#080B10");
    bgGrad.addColorStop(1, "#030406");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Aurora Orbs
    const drawOrb = (x, y, r, alpha) => {
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `${tier.color}${Math.round(alpha*255).toString(16).padStart(2,'0')}`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    };
    
    // Smooth blended lights
    drawOrb(W * 0.1, H * 0.2, W * 0.5, 0.25);
    drawOrb(W * 0.9, H * 0.8, W * 0.6, 0.15);
    drawOrb(W * 0.5, H * 0.5, W * 0.8, 0.08);

    // Subtle noise texture overlay
    ctx.fillStyle = "rgba(255, 255, 255, 0.015)";
    for (let i = 0; i < W; i += 4) {
      for (let j = 0; j < H; j += 4) {
        if (Math.random() > 0.5) ctx.fillRect(i, j, 2, 2);
      }
    }
    ctx.restore();
  } else {
    const bgGlow = ctx.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, W * 0.7);
    bgGlow.addColorStop(0, `${tier.color}15`);
    bgGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bgGlow;
    ctx.fillRect(0, 0, W, H);
  }

  // HÀM VẼ THẺ KÍNH (Glassmorphism)
  const drawCardBg = (x, y, w, h) => {
    ctx.save();
    ctx.beginPath();
    roundedRect(ctx, x, y, w, h, 28);
    
    if (isPremium) {
      // Elegant Frosted Glass
      ctx.fillStyle = "rgba(20, 22, 28, 0.65)";
      ctx.fill();
      
      // Viền glow mỏng cao cấp
      ctx.shadowColor = tier.color;
      ctx.shadowBlur = 20;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (isDragon) {
      ctx.fillStyle = "rgba(10, 10, 12, 0.65)";
      ctx.fill();
      ctx.shadowColor = tier.color;
      ctx.shadowBlur = 15;
      ctx.strokeStyle = `${tier.color}AA`;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
      ctx.shadowBlur = 20;
      ctx.fillStyle = "#1C1C1E";
      ctx.fill();
    }
    ctx.restore();
  };

  const textPrimary = "#FFFFFF";
  const textSecondary = "#EBEBF599"; 
  const pad = 40;
  
  // 2. PROFILE CARD
  const leftW = 350;
  const leftH = H - pad * 2;
  const lX = pad;
  const lY = pad;

  drawCardBg(lX, lY, leftW, leftH);

  const avX = lX + leftW / 2;
  const avY = lY + 140;
  const avR = 85;

  ctx.save();
  ctx.beginPath();
  ctx.arc(avX, avY, avR, 0, Math.PI * 2);
  ctx.clip();
  const avatar = await safeLoadImage(playerInfo.avatarFull || playerInfo.avatar);
  ctx.drawImage(avatar, avX - avR, avY - avR, avR * 2, avR * 2);
  ctx.restore();

  // Viền avatar (Đẹp, thanh lịch)
  ctx.save();
  ctx.beginPath();
  ctx.arc(avX, avY, avR + 6, 0, Math.PI * 2);
  ctx.strokeStyle = tier.color;
  ctx.lineWidth = 3;
  if (isPremium || isDragon) {
    ctx.shadowColor = tier.color;
    ctx.shadowBlur = 15;
  }
  ctx.stroke();
  
  // Viền siêu mỏng lót trong
  if (isPremium) {
    ctx.beginPath();
    ctx.arc(avX, avY, avR + 2, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();

  // Name
  ctx.textAlign = "center";
  ctx.fillStyle = textPrimary;
  ctx.font = `bold 30px ${FONT_MAIN}`;
  ctx.fillText(playerInfo.playerName || "Player", avX, avY + 140);

  // Tier Badge
  const title = getPlayerTitle(playerInfo);
  const badgeText = `${tier.name.toUpperCase()} • ${title}`;
  ctx.font = `bold 13px ${FONT_MAIN}`;
  const badgeW = ctx.measureText(badgeText).width + 36;
  const badgeH = 34;
  
  roundedRect(ctx, avX - badgeW / 2, avY + 180, badgeW, badgeH, badgeH / 2);
  if (isPremium) {
    ctx.fillStyle = `${tier.color}33`; 
    ctx.fill();
    ctx.strokeStyle = tier.color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else {
    ctx.fillStyle = `${tier.color}33`; 
    ctx.fill();
  }
  ctx.fillStyle = tier.color;
  ctx.fillText(badgeText, avX, avY + 180 + badgeH / 2);

  // Player ID
  ctx.fillStyle = textSecondary;
  ctx.font = `14px ${FONT_MAIN}`;
  ctx.fillText(`Mã người chơi: ${playerInfo.idUser || "N/A"}`, avX, avY + 240);

  // Progress Bar
  const pbW = leftW - 80;
  const pbH = 14;
  const pbX = lX + 40;
  const pbY = lY + leftH - 90;

  roundedRect(ctx, pbX, pbY, pbW, pbH, pbH / 2);
  ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
  ctx.fill();

  const fW = Math.max(pbH, pbW * tierProgress);
  roundedRect(ctx, pbX, pbY, fW, pbH, pbH / 2);
  ctx.save();
  if (isPremium || isDragon) {
    ctx.shadowColor = tier.color;
    ctx.shadowBlur = 12;
  }
  ctx.fillStyle = tier.color;
  ctx.fill();
  ctx.restore();

  ctx.font = `bold 13px ${FONT_MAIN}`;
  ctx.textAlign = "left";
  ctx.fillStyle = textSecondary;
  ctx.fillText(tier.name, pbX, pbY - 20);
  ctx.textAlign = "right";
  ctx.fillText(nextTier ? nextTier.name : "MAX", pbX + pbW, pbY - 20);

  // 3. RIGHT SECTION
  const rX = lX + leftW + 30;
  const rW = W - rX - pad;

  // BALANCE CARD
  const balH = 220;
  drawCardBg(rX, lY, rW, balH);

  ctx.textAlign = "left";
  ctx.fillStyle = textSecondary;
  ctx.font = `bold 16px ${FONT_MAIN}`;
  ctx.fillText("Tổng Số Dư", rX + 40, lY + 50);

  const balanceText = compactMoney(playerInfo.balance);
  ctx.fillStyle = textPrimary;
  ctx.font = fitFont(ctx, balanceText, rW - 200, 72, 40);
  if (isPremium) {
    ctx.save();
    ctx.shadowColor = "rgba(255,255,255,0.2)";
    ctx.shadowBlur = 10;
    ctx.fillText(balanceText, rX + 40, lY + 110);
    ctx.restore();
  } else {
    ctx.fillText(balanceText, rX + 40, lY + 110);
  }
  
  const bW = ctx.measureText(balanceText).width;
  ctx.fillStyle = tier.color;
  ctx.font = `bold 24px ${FONT_MAIN}`;
  ctx.fillText("VNĐ", rX + 40 + bW + 12, lY + 110);

  // Profit Pill
  const profit = new Big(playerInfo.netProfit || 0);
  const isProfit = profit.gte(0);
  const pColor = isProfit ? "#32D74B" : "#FF453A"; 
  const pBg = isProfit ? "rgba(50, 215, 75, 0.2)" : "rgba(255, 69, 58, 0.2)";
  const pTxt = `${isProfit ? "+" : "-"}${compactMoney(profit.abs())} VNĐ`;

  ctx.font = `bold 16px ${FONT_MAIN}`;
  const pTxtW = ctx.measureText(pTxt).width + 32;
  roundedRect(ctx, rX + 40, lY + 155, pTxtW, 36, 18);
  ctx.fillStyle = pBg;
  ctx.fill();
  if (isPremium) {
    ctx.strokeStyle = pColor;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  
  ctx.textAlign = "center";
  ctx.fillStyle = pColor;
  ctx.fillText(pTxt, rX + 40 + pTxtW / 2, lY + 155 + 18);

  ctx.textAlign = "right";
  ctx.fillStyle = textSecondary;
  ctx.font = `14px ${FONT_MAIN}`;
  ctx.fillText("Tổng tiền đã nạp", rX + rW - 40, lY + 145);
  ctx.fillStyle = textPrimary;
  ctx.font = `bold 22px ${FONT_MAIN}`;
  ctx.fillText(`${compactMoney(playerInfo.rankPoints)} VNĐ`, rX + rW - 40, lY + 175);

  // 4 STAT CARDS
  const statY = lY + balH + 30;
  const statH = H - pad - statY; 
  const colW = (rW - 30) / 2;
  const rowH = (statH - 30) / 2;

  const statData = [
    { label: "Tổng Thắng",  value: compactMoney(playerInfo.totalWinnings), color: "#32D74B", sub: "VNĐ" },
    { label: "Tổng Thua",   value: compactMoney(new Big(playerInfo.totalLosses||0).abs()), color: "#FF453A", sub: "VNĐ" },
    { label: "Tỉ lệ Thắng", value: `${playerInfo.winRate || 0}%`, color: tier.color, sub: `${playerInfo.totalWinGames||0} trận` },
    { label: "Tổng Trận",   value: String(playerInfo.totalGames || 0), color: "#0A84FF", sub: "trận" }, 
  ];

  statData.forEach((s, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const boxX = rX + col * (colW + 30);
    const boxY = statY + row * (rowH + 30);

    drawCardBg(boxX, boxY, colW, rowH);

    ctx.beginPath();
    ctx.arc(boxX + 35, boxY + 35, 6, 0, Math.PI * 2);
    ctx.fillStyle = s.color;
    if (isPremium || isDragon) {
      ctx.save();
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fill();
    }

    ctx.textAlign = "left";
    ctx.fillStyle = textSecondary;
    ctx.font = `15px ${FONT_MAIN}`;
    ctx.fillText(s.label, boxX + 50, boxY + 35);

    ctx.fillStyle = textPrimary;
    ctx.font = fitFont(ctx, s.value, colW - 60, 42, 24);
    const valW = ctx.measureText(s.value).width;
    ctx.fillText(s.value, boxX + 30, boxY + 85);
    
    ctx.fillStyle = textSecondary;
    ctx.font = `13px ${FONT_MAIN}`;
    ctx.fillText(s.sub, boxX + 30 + valW + 8, boxY + 82);
  });

  const filePath = path.resolve(`./assets/temp/game_mycard_${Date.now()}.png`);
  await writeFilePromise(filePath, canvas.toBuffer());
  return filePath;
}

export async function createGameBankTransferImage(data) {
  const width = 900;
  const height = 980;
  const tier = getGameTier(data.sender.rankPoints);
  const receiverTier = getGameTier(data.receiver.rankPoints);
  const isDragon = tier.key === "gold_dragon";
  const isPremium = ["emerald", "ruby", "diamond", "angel"].includes(tier.key);

  const dragonImage = isDragon ? await safeLoadImage(KIM_LONG_DRAGON_PATH) : null;
  const beautyImage = tier.key === "angel" ? await safeLoadImage(MY_NHAN_BG_PATH) : null;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  
  ctx.fillStyle = "#0A0A0C"; 
  ctx.fillRect(0, 0, width, height);

  if (isDragon && dragonImage) {
    ctx.save();
    const scale = Math.max(width / dragonImage.width, height / dragonImage.height) * 1.2;
    const dw = dragonImage.width * scale;
    const dh = dragonImage.height * scale;
    const dx = (width - dw) / 2;
    const dy = (height - dh) / 2;
    ctx.globalAlpha = 0.5;
    ctx.drawImage(dragonImage, dx, dy, dw, dh);
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  } else if (tier.key === "angel" && beautyImage) {
    ctx.save();
    const isW = typeof W !== 'undefined' ? W : width;
    const isH = typeof H !== 'undefined' ? H : height;
    const scale = Math.max(isW / beautyImage.width, isH / beautyImage.height);
    const dw = beautyImage.width * scale;
    const dh = beautyImage.height * scale;
    const dx = (isW - dw) / 2;
    const dy = (isH - dh) / 2;
    ctx.globalAlpha = 0.55;
    ctx.drawImage(beautyImage, dx, dy, dw, dh);
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(0, 0, isW, isH);
    ctx.restore();
  } else if (isPremium) {
    ctx.save();
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, "#080B10");
    bgGrad.addColorStop(1, "#030406");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const drawOrb = (x, y, r, alpha) => {
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `${tier.color}${Math.round(alpha*255).toString(16).padStart(2,'0')}`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    };
    
    drawOrb(width * 0.1, height * 0.2, width * 0.5, 0.25);
    drawOrb(width * 0.9, height * 0.8, width * 0.6, 0.15);
    drawOrb(width * 0.5, height * 0.5, width * 0.8, 0.08);

    ctx.fillStyle = "rgba(255, 255, 255, 0.015)";
    for (let i = 0; i < width; i += 4) {
      for (let j = 0; j < height; j += 4) {
        if (Math.random() > 0.5) ctx.fillRect(i, j, 2, 2);
      }
    }
    ctx.restore();
  } else {
    const bgGlow = ctx.createRadialGradient(width * 0.5, height * 0.5, 0, width * 0.5, height * 0.5, width * 0.7);
    bgGlow.addColorStop(0, `${tier.color}15`);
    bgGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bgGlow;
    ctx.fillRect(0, 0, width, height);
  }

  const drawCardBg = (x, y, w, h, t = tier) => {
    ctx.save();
    ctx.beginPath();
    roundedRect(ctx, x, y, w, h, 28);
    if (isPremium) {
      ctx.fillStyle = "rgba(20, 22, 28, 0.65)";
      ctx.fill();
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 20;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (isDragon) {
      ctx.fillStyle = "rgba(10, 10, 12, 0.65)";
      ctx.fill();
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 15;
      ctx.strokeStyle = `${t.color}AA`;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
      ctx.shadowBlur = 20;
      ctx.fillStyle = "#1C1C1E";
      ctx.fill();
    }
    ctx.restore();
  };

  const [senderAvatar, receiverAvatar] = await Promise.all([
    safeLoadImage(data.sender.avatar),
    safeLoadImage(data.receiver.avatar),
  ]);

  // Title
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = tier.color;
  ctx.font = `bold 16px ${FONT_MAIN}`;
  ctx.fillText("GAME BANKING", width / 2, 70);
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 42px ${FONT_MAIN}`;
  ctx.fillText("BIẾN ĐỘNG SỐ DƯ", width / 2, 115);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = `bold 16px ${FONT_MAIN}`;
  ctx.fillText(`GIAO DỊCH THÀNH CÔNG  •  ${formatDate(data.createdAt)}`, width / 2, 160);

  // SENDER (Top)
  const pad = 44;
  const cardW = width - pad * 2;
  const cardH = 246;
  const sY = 200;
  
  drawCardBg(pad, sY, cardW, cardH, tier);

  ctx.save();
  ctx.beginPath();
  ctx.arc(120, sY + 80, 50, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(senderAvatar, 70, sY + 30, 100, 100);
  ctx.restore();
  
  ctx.beginPath();
  ctx.arc(120, sY + 80, 53, 0, Math.PI * 2);
  ctx.strokeStyle = tier.color;
  ctx.lineWidth = 3;
  if (isPremium) {
    ctx.shadowColor = tier.color;
    ctx.shadowBlur = 15;
  }
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.fillStyle = tier.color;
  ctx.font = `bold 14px ${FONT_MAIN}`;
  ctx.fillText("NGƯỜI CHUYỂN", 190, sY + 50);
  
  ctx.fillStyle = "#ffffff";
  ctx.font = fitFont(ctx, data.sender.name, 500, 36, 20);
  ctx.fillText(data.sender.name, 190, sY + 90);

  const badgeText = `${tier.name.toUpperCase()}`;
  ctx.font = `bold 13px ${FONT_MAIN}`;
  const badgeW = ctx.measureText(badgeText).width + 36;
  roundedRect(ctx, 190, sY + 115, badgeW, 28, 14);
  ctx.fillStyle = `${tier.color}33`;
  ctx.fill();
  if (isPremium) {
    ctx.strokeStyle = tier.color;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.fillStyle = tier.color;
  ctx.fillText(badgeText, 190 + badgeW / 2, sY + 115 + 14);
  ctx.textAlign = "left";

  // Balances sender
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = `14px ${FONT_MAIN}`;
  ctx.fillText("SỐ DƯ TRƯỚC", 80, sY + 180);
  ctx.fillText("SỐ DƯ SAU", 420, sY + 180);
  
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 24px ${FONT_MAIN}`;
  ctx.fillText(`${compactMoney(data.sender.balanceBefore)} VNĐ`, 80, sY + 210);
  ctx.fillStyle = "#FF453A";
  ctx.fillText(`${compactMoney(data.sender.balanceAfter)} VNĐ`, 420, sY + 210);

  // AMOUNT (Middle)
  const mY = sY + cardH + 20;
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = `bold 16px ${FONT_MAIN}`;
  ctx.fillText("SỐ TIỀN CHUYỂN", width / 2, mY + 20);
  
  ctx.fillStyle = tier.color;
  ctx.font = fitFont(ctx, compactMoney(data.amount), 800, 64, 40);
  if (isPremium) {
    ctx.save();
    ctx.shadowColor = "rgba(255,255,255,0.15)";
    ctx.shadowBlur = 10;
    ctx.fillText(compactMoney(data.amount), width / 2, mY + 80);
    ctx.restore();
  } else {
    ctx.fillText(compactMoney(data.amount), width / 2, mY + 80);
  }
  
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = `bold 18px ${FONT_MAIN}`;
  ctx.fillText(`${fullNumber(data.amount)} VNĐ`, width / 2, mY + 130);
  
  ctx.fillStyle = tier.color;
  ctx.font = `bold 32px ${FONT_MAIN}`;
  ctx.fillText("↓", width / 2, mY + 175);

  // RECEIVER (Bottom)
  const rY = mY + 200;
  drawCardBg(pad, rY, cardW, cardH, receiverTier);
  
  ctx.save();
  ctx.beginPath();
  ctx.arc(width - 120, rY + 80, 50, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(receiverAvatar, width - 170, rY + 30, 100, 100);
  ctx.restore();
  
  ctx.beginPath();
  ctx.arc(width - 120, rY + 80, 53, 0, Math.PI * 2);
  ctx.strokeStyle = receiverTier.color;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.textAlign = "right";
  ctx.fillStyle = receiverTier.color;
  ctx.font = `bold 14px ${FONT_MAIN}`;
  ctx.fillText("NGƯỜI NHẬN", width - 190, rY + 50);
  
  ctx.fillStyle = "#ffffff";
  ctx.font = fitFont(ctx, data.receiver.name, 500, 36, 20);
  ctx.fillText(data.receiver.name, width - 190, rY + 90);

  const rBadgeText = `${receiverTier.name.toUpperCase()}`;
  ctx.font = `bold 13px ${FONT_MAIN}`;
  const rBadgeW = ctx.measureText(rBadgeText).width + 36;
  roundedRect(ctx, width - 190 - rBadgeW, rY + 115, rBadgeW, 28, 14);
  ctx.fillStyle = `${receiverTier.color}33`; 
  ctx.fill();
  ctx.fillStyle = receiverTier.color;
  ctx.textAlign = "center";
  ctx.fillText(rBadgeText, width - 190 - rBadgeW / 2, rY + 115 + 14);

  // Balances receiver
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = `14px ${FONT_MAIN}`;
  ctx.fillText("SỐ DƯ TRƯỚC", 80, rY + 180);
  ctx.fillText("SỐ DƯ SAU", 420, rY + 180);
  
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 24px ${FONT_MAIN}`;
  ctx.fillText(`${compactMoney(data.receiver.balanceBefore)} VNĐ`, 80, rY + 210);
  ctx.fillStyle = "#32D74B";
  ctx.fillText(`${compactMoney(data.receiver.balanceAfter)} VNĐ`, 420, rY + 210);

  // Trans id
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = `bold 12px ${FONT_MAIN}`;
  ctx.fillText(`MÃ GIAO DỊCH  •  ${data.referenceCode}`, width / 2, height - 30);

  const filePath = path.resolve(`./assets/temp/game_bank_${Date.now()}.png`);
  await writeFilePromise(filePath, canvas.toBuffer());
  return filePath;
}

export async function createGameStatementImage(data) {
  const transactions = data.transactions || [];
  const width = 1080;
  const height = Math.max(520, 270 + transactions.length * 92);
  const tier = getGameTier(data.rankPoints);
  const dragonImage = tier.key === "gold_dragon" ? await safeLoadImage(KIM_LONG_DRAGON_PATH) : null;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  drawBackground(ctx, width, height, tier);
  if (tier.key === "gold_dragon") drawDragonArtwork(ctx, dragonImage, 718, 24, 310, 192, 0.17);

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = tier.color;
  ctx.font = `bold 14px ${FONT_MAIN}`;
  ctx.fillText("GAME BANKING", 46, 42);
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 40px ${FONT_MAIN}`;
  ctx.fillText("SAO KÊ GIAO DỊCH", 46, 82);
  ctx.fillStyle = "rgba(255,255,255,0.48)";
  ctx.font = `bold 13px ${FONT_MAIN}`;
  ctx.fillText(`10 GIAO DỊCH GẦN NHẤT  •  ${formatDate()}`, 46, 120);

  drawPanel(ctx, 46, 150, 988, 88, tier, true);
  ctx.fillStyle = "rgba(255,255,255,0.48)";
  ctx.font = `bold 13px ${FONT_MAIN}`;
  ctx.fillText("CHỦ TÀI KHOẢN", 72, 178);
  ctx.fillStyle = "#ffffff";
  ctx.font = fitFont(ctx, data.playerName || "Người chơi", 380, 23, 16);
  ctx.fillText(data.playerName || "Người chơi", 72, 211);
  drawTierBadge(ctx, tier, 462, 178, 132, 28);
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.48)";
  ctx.font = `bold 13px ${FONT_MAIN}`;
  ctx.fillText("SỐ DƯ HIỆN TẠI", 1004, 178);
  ctx.fillStyle = tier.color;
  ctx.font = fitFont(ctx, `${compactMoney(data.balance)} VNĐ`, 360, 28, 17);
  ctx.fillText(`${compactMoney(data.balance)} VNĐ`, 1004, 211);

  if (transactions.length === 0) {
    drawPanel(ctx, 46, 270, 988, 180, tier);
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.52)";
    ctx.font = `bold 22px ${FONT_MAIN}`;
    ctx.fillText("CHƯA CÓ GIAO DỊCH CHUYỂN TIỀN", width / 2, 360);
  }

  transactions.forEach((transaction, index) => {
    const incoming = transaction.direction === "in";
    const color = incoming ? "#5ee4b4" : "#ff7185";
    const y = 264 + index * 92;
    drawPanel(ctx, 46, y, 988, 76, tier);
    roundedRect(ctx, 66, y + 17, 42, 42, 14);
    ctx.fillStyle = `${color}20`;
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.font = `bold 22px ${FONT_MAIN}`;
    ctx.fillText(incoming ? "+" : "−", 87, y + 39);
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = fitFont(ctx, transaction.counterpartyName || "Người chơi", 330, 19, 14);
    ctx.fillText(transaction.counterpartyName || "Người chơi", 128, y + 28);
    ctx.fillStyle = "rgba(255,255,255,0.38)";
    ctx.font = `bold 11px ${FONT_MAIN}`;
    ctx.fillText(`${formatDate(transaction.createdAt)}  •  ${transaction.referenceCode}`, 128, y + 54);
    ctx.textAlign = "right";
    ctx.fillStyle = color;
    ctx.font = fitFont(ctx, `${incoming ? "+" : "−"}${compactMoney(transaction.amount)} VNĐ`, 300, 22, 15);
    ctx.fillText(`${incoming ? "+" : "−"}${compactMoney(transaction.amount)} VNĐ`, 1004, y + 28);
    ctx.fillStyle = "rgba(255,255,255,0.42)";
    ctx.font = `bold 11px ${FONT_MAIN}`;
    ctx.fillText(`Số dư: ${compactMoney(transaction.balanceAfter)} VNĐ`, 1004, y + 54);
  });

  const filePath = path.resolve(`./assets/temp/game_statement_${Date.now()}.png`);
  await writeFilePromise(filePath, canvas.toBuffer());
  return filePath;
}

export async function createGameMissionImage(data) {
  const width = 980;
  const height = 900;
  const { tier, nextTier, points, progress } = getGameTierProgress(data.rankPoints);
  const dragonImage = tier.key === "gold_dragon" ? await safeLoadImage(KIM_LONG_DRAGON_PATH) : null;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  drawBackground(ctx, width, height, tier);
  drawPanel(ctx, 28, 26, 924, 848, tier, true);
  if (tier.key === "gold_dragon") drawDragonArtwork(ctx, dragonImage, 660, 34, 260, 161, 0.20);

  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = tier.color;
  ctx.font = `bold 14px ${FONT_MAIN}`;
  ctx.fillText("GAME MISSION", 58, 62);
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 40px ${FONT_MAIN}`;
  ctx.fillText("NHIỆM VỤ LÊN HẠNG", 58, 105);
  ctx.fillStyle = "rgba(255,255,255,0.48)";
  ctx.font = `bold 13px ${FONT_MAIN}`;
  ctx.fillText("NẠP ĐỦ MỐC • TỰ ĐỘNG MỞ KHÓA HẠNG MỚI", 58, 143);

  drawPanel(ctx, 54, 176, 872, 206, tier);
  ctx.fillStyle = "rgba(255,255,255,0.48)";
  ctx.font = `bold 13px ${FONT_MAIN}`;
  ctx.fillText("NGƯỜI CHƠI", 82, 208);
  ctx.fillStyle = "#ffffff";
  ctx.font = fitFont(ctx, data.playerName || "Người chơi", 500, 29, 18);
  ctx.fillText(data.playerName || "Người chơi", 82, 248);
  drawTierBadge(ctx, tier, 730, 204, 160, 34);
  ctx.textAlign = "left";
  ctx.fillStyle = tier.color;
  ctx.font = `bold 34px ${FONT_MAIN}`;
  ctx.fillText(`${fullNumber(points)} VNĐ ĐÃ NẠP`, 82, 302);
  ctx.fillStyle = "rgba(255,255,255,0.42)";
  ctx.font = `bold 13px ${FONT_MAIN}`;
  ctx.fillText(nextTier ? `Còn nạp ${fullNumber(Number(nextTier.min) - points)} VNĐ để lên ${nextTier.name}` : "Đã đạt hạng cao nhất", 82, 338);

  roundedRect(ctx, 82, 354, 808, 12, 6);
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.fill();
  roundedRect(ctx, 82, 354, Math.max(12, 808 * progress), 12, 6);
  ctx.fillStyle = tier.color;
  ctx.fill();

  const missions = [
    { icon: "🥈", title: "HẠNG BẠC", reward: "Mặc định", note: "Mọi người chơi đều bắt đầu từ hạng Bạc" },
    { icon: "🥇", title: "HẠNG VÀNG", reward: "50.000 VNĐ", note: "Tổng tiền nạp đạt đủ mốc" },
    { icon: "💚", title: "LỤC BẢO", reward: "200.000 VNĐ", note: "Hạng chỉ tăng theo tổng tiền đã nạp" },
    { icon: "💎", title: "KIM CƯƠNG", reward: "1.000.000 VNĐ", note: "Chơi game không cộng tiến độ hạng" },
  ];
  missions.forEach((mission, index) => {
    const y = 414 + index * 100;
    drawPanel(ctx, 54, y, 872, 82, tier);
    ctx.textAlign = "center";
    ctx.fillStyle = `${tier.color}22`;
    ctx.font = `bold 30px ${FONT_MAIN}`;
    ctx.fillText(mission.icon, 96, y + 41);
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold 17px ${FONT_MAIN}`;
    ctx.fillText(mission.title, 138, y + 29);
    ctx.fillStyle = "rgba(255,255,255,0.42)";
    ctx.font = `bold 12px ${FONT_MAIN}`;
    ctx.fillText(mission.note, 138, y + 55);
    ctx.textAlign = "right";
    ctx.fillStyle = tier.color;
    ctx.font = `bold 20px ${FONT_MAIN}`;
    ctx.fillText(mission.reward, 892, y + 41);
  });

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.38)";
  ctx.font = `bold 12px ${FONT_MAIN}`;
  ctx.fillText("BẠC 0  •  VÀNG 50K  •  BẠCH KIM 100K  •  LỤC BẢO 200K  •  HỒNG NGỌC 500K  •  KIM CƯƠNG 1M", width / 2, 842);

  const filePath = path.resolve(`./assets/temp/game_mission_${Date.now()}.png`);
  await writeFilePromise(filePath, canvas.toBuffer());
  return filePath;
}

export async function createVIPTierImage(data) {
  const width = 1200, height = 900, left = 300, pad = 28;
  const { tier } = getGameTierProgress(data.rankPoints);
  const canvas = createCanvas(width, height), ctx = canvas.getContext("2d");
  drawBackground(ctx, width, height, tier);
  drawPanel(ctx, 18, 18, width - 36, height - 36, tier, true);
  ctx.textBaseline = "middle";

  // Profile rail.
  ctx.strokeStyle = "rgba(255,255,255,.16)"; ctx.beginPath(); ctx.moveTo(left, 18); ctx.lineTo(left, height - 18); ctx.stroke();
  let avatarImg = data.avatarUrl ? await safeLoadImage(data.avatarUrl) : null;
  drawAvatar(ctx, avatarImg, 150, 145, 145, tier.color);
  ctx.textAlign = "center"; ctx.fillStyle = tier.color; ctx.font = `bold 18px ${FONT_MAIN}`; ctx.fillText("HẠNG THÀNH VIÊN", 150, 245);
  ctx.fillStyle = "#fff"; ctx.font = fitFont(ctx, data.playerName || "Người chơi", 245, 25, 16); ctx.fillText(data.playerName || "Người chơi", 150, 295);
  ctx.strokeStyle = `${tier.color}66`; ctx.beginPath(); ctx.moveTo(60, 325); ctx.lineTo(240, 325); ctx.stroke();
  ctx.fillStyle = tier.color; ctx.font = `bold 42px ${FONT_MAIN}`; ctx.fillText(tier.name.replace("BẠCH KIM", "Bạch Kim").replace("HỒNG NGỌC", "Hồng Ngọc").replace("KIM CƯƠNG", "Kim Cương"), 150, 375);
  ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.font = `bold 18px ${FONT_MAIN}`; ctx.fillText("Vĩnh Viễn", 150, 415);
  ctx.font = `bold 28px ${FONT_MAIN}`; ctx.fillText("♠   ♥   ♦   ♣", 150, 825);

  const x = left + pad, w = width - x - pad, gap = 18, cardW = (w - gap) / 2;
  ctx.textAlign = "left"; ctx.fillStyle = "#fff"; ctx.font = `bold 24px ${FONT_MAIN}`; ctx.fillText("HẠN MỨC HÔM NAY", x, 62);
  const metric = (mx, my, label, value, color = tier.color) => { drawPanel(ctx, mx, my, cardW, 100, tier); ctx.fillStyle = "#fff"; ctx.font = `bold 16px ${FONT_MAIN}`; ctx.fillText(label, mx + 20, my + 30); ctx.fillStyle = color; ctx.font = `bold 38px ${FONT_MAIN}`; ctx.fillText(value, mx + 20, my + 72); ctx.fillStyle = color; ctx.fillRect(mx + 20, my + 89, cardW - 40, 4); };
  metric(x, 88, "HẠN MỨC CHUYỂN ĐI", compactMoney(Number(tier.sendLimit)));
  metric(x + cardW + gap, 88, "HẠN MỨC NHẬN VỀ", compactMoney(Number(tier.receiveLimit)));
  metric(x, 200, "DAILY", compactMoney(Number(tier.daily)), "#ffd568");
  metric(x + cardW + gap, 200, "SỐ DƯ", compactMoney(Number(data.balance)), "#fff");
  ctx.fillStyle = "#fff"; ctx.font = `bold 20px ${FONT_MAIN}`; ctx.fillText("CÁC HẠNG THÀNH VIÊN", x, 370);
  TIERS.slice(0, 6).forEach((t, i) => { const y = 392 + i * 62; drawPanel(ctx, x, y, w, 52, t, t.key === tier.key); ctx.fillStyle = t.color; ctx.font = `bold 18px ${FONT_MAIN}`; ctx.fillText(t.name, x + 18, y + 27); ctx.fillStyle = "rgba(255,255,255,.78)"; ctx.font = `bold 14px ${FONT_MAIN}`; ctx.textAlign = "right"; ctx.fillText(`Daily ${compactMoney(Number(t.daily))} · Chuyển ${compactMoney(Number(t.sendLimit))} · Nhận ${compactMoney(Number(t.receiveLimit))}`, x + w - 16, y + 27); ctx.textAlign = "left"; });
  ctx.textAlign = "center"; ctx.fillStyle = "#ffd568"; ctx.font = `bold 20px ${FONT_MAIN}`; ctx.fillText("Chúc Bạn 8386 | Mãi Đỉnh Mãi Đỉnh", left + (width - left) / 2, 850);
  const filePath = path.resolve(`./assets/temp/vip_tier_${Date.now()}.png`);
  await writeFilePromise(filePath, canvas.toBuffer());
  return filePath;
}
