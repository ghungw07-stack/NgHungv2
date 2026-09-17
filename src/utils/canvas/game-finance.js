import path from "path";
import Big from "big.js";
import { createCanvas, loadImage } from "canvas";
import { FONT_MAIN, formatCurrency } from "../format-util.js";
import { writeFilePromise } from "../util.js";
import { getActiveCanvasStyle } from "./theme.js";
import { renderCollectionStyle } from "./collection-style-renderers.js";
import { renderPortraitStyle } from "./portrait-style-renderers.js";
import { drawGameTierBackground, getGameTierTextColor } from "./game-tier-background.js";

const TIERS = [
  { key: "silver", name: "Bạc", min: "0", donate: "Hạng mặc định", color: "#b0c4de", deep: "#506172", dark: "#111923", glow: "rgba(176,196,222,0.30)", daily: "3000000000", sendLimit: "50000000000", receiveLimit: "15000000000", dailyText: "3 TỶ", sendText: "50 TỶ", recvText: "15 TỶ", extra: "Hạn mức cộng dồn / 30 ngày", rate: 0 },
  { key: "gold", name: "Vàng", min: "10000", donate: "Ủng hộ 10.000đ", color: "#ffd700", deep: "#9b6414", dark: "#211707", glow: "rgba(255,215,0,0.30)", daily: "5000000000", sendLimit: "100000000000", receiveLimit: "30000000000", dailyText: "5 TỶ", sendText: "100 TỶ", recvText: "30 TỶ", extra: "Hạn mức cộng dồn / 30 ngày", rate: 0 },
  { key: "platinum", name: "Bạch Kim", min: "20000", donate: "Ủng hộ 20.000đ", color: "#e5e4e2", deep: "#4d8591", dark: "#0d1c23", glow: "rgba(229,228,226,0.28)", daily: "12000000000", sendLimit: "300000000000", receiveLimit: "120000000000", dailyText: "12 TỶ", sendText: "300 TỶ", recvText: "120 TỶ", extra: "Hạn mức cộng dồn / 30 ngày", rate: 0 },
  { key: "emerald", name: "Lục Bảo", min: "40000", donate: "Ủng hộ 40.000đ", color: "#2ecc71", deep: "#187a38", dark: "#0a2612", glow: "rgba(46,204,113,0.30)", daily: "30000000000", sendLimit: "1200000000000", receiveLimit: "300000000000", dailyText: "30 TỶ", sendText: "1,2 K TỶ", recvText: "300 TỶ", extra: "Hạn mức cộng dồn / 30 ngày", rate: 0 },
  { key: "ruby", name: "Hồng Ngọc", min: "70000", donate: "Ủng hộ 70.000đ", color: "#ff4d6d", deep: "#971d45", dark: "#290b18", glow: "rgba(255,77,109,0.30)", daily: "90000000000", sendLimit: "3600000000000", receiveLimit: "800000000000", dailyText: "90 TỶ", sendText: "3,6 K TỶ", recvText: "800 TỶ", extra: "Hạn mức cộng dồn / 30 ngày", rate: 0 },
  { key: "diamond", name: "Kim Cương", min: "100000", donate: "Ủng hộ 100.000đ", color: "#00d2ff", deep: "#3159ad", dark: "#0a1530", glow: "rgba(0,210,255,0.30)", daily: "200000000000", sendLimit: "8000000000000", receiveLimit: "1800000000000", dailyText: "200 TỶ", sendText: "8 K TỶ", recvText: "1,8 K TỶ", extra: "NH 6%/ngày · Hạn mức / 30 ngày", rate: 0.06 },
  { key: "gold_dragon", name: "Kim Long", min: "150000", donate: "Ủng hộ 150.000đ", color: "#ffb703", deep: "#a86408", dark: "#211204", glow: "rgba(255,183,3,0.38)", daily: "500000000000", sendLimit: "20000000000000", receiveLimit: "5000000000000", dailyText: "500 TỶ", sendText: "20 K TỶ", recvText: "5 K TỶ", extra: "NH 12%/ngày · Hạn mức / 30 ngày", rate: 0.12 },
  { key: "huyen_vu", name: "Huyền Vũ", min: "200000", donate: "Ủng hộ 200.000đ", color: "#52b788", deep: "#2d6a4f", dark: "#081c15", glow: "rgba(82,183,136,0.38)", daily: "700000000000", sendLimit: "20000000000000", receiveLimit: "4500000000000", dailyText: "700 TỶ", sendText: "20 K TỶ", recvText: "4,5 K TỶ", extra: "NH 12%/ngày · Hạn mức / 30 ngày", rate: 0.12 },
  { key: "angel", name: "Mỹ Nhân", min: "250000", donate: "Hạng đặc biệt", color: "#ffa3d1", deep: "#a84576", dark: "#2e0f1d", glow: "rgba(255,163,209,0.38)", daily: "700000000000", sendLimit: "20000000000000", receiveLimit: "4500000000000", dailyText: "700 TỶ", sendText: "20 K TỶ", recvText: "4,5 K TỶ", extra: "Hạng đặc biệt Mỹ Nhân", rate: 0.12 },
  { key: "bach_ho", name: "Bạch Hổ", min: "300000", donate: "Ủng hộ 300.000đ", color: "#caf0f8", deep: "#48cae4", dark: "#03045e", glow: "rgba(202,240,248,0.38)", daily: "1000000000000", sendLimit: "40000000000000", receiveLimit: "9000000000000", dailyText: "1 K TỶ", sendText: "40 K TỶ", recvText: "9 K TỶ", extra: "NH 16%/ngày · Hạn mức / 30 ngày", rate: 0.16 },
  { key: "con_bang", name: "Côn Bằng", min: "400000", donate: "Ủng hộ 400.000đ", color: "#48cae4", deep: "#0077b6", dark: "#03045e", glow: "rgba(72,202,228,0.38)", daily: "2000000000000", sendLimit: "80000000000000", receiveLimit: "18000000000000", dailyText: "2 K TỶ", sendText: "80 K TỶ", recvText: "18 K TỶ", extra: "NH 20%/ngày · Hạn mức / 30 ngày", rate: 0.20 },
  { key: "thanh_long", name: "Thanh Long", min: "500000", donate: "Ủng hộ 500.000đ", color: "#2dc653", deep: "#1b4332", dark: "#081c15", glow: "rgba(45,198,83,0.38)", daily: "3000000000000", sendLimit: "120000000000000", receiveLimit: "27000000000000", dailyText: "3 K TỶ", sendText: "120 K TỶ", recvText: "27 K TỶ", extra: "NH 24%/ngày · Hạn mức / 30 ngày", rate: 0.24 },
  { key: "chu_tuoc", name: "Chu Tước", min: "600000", donate: "Ủng hộ 600.000đ", color: "#f77f00", deep: "#d62828", dark: "#370617", glow: "rgba(247,127,0,0.38)", daily: "4500000000000", sendLimit: "180000000000000", receiveLimit: "40500000000000", dailyText: "4,5 K TỶ", sendText: "180 K TỶ", recvText: "40,5 K TỶ", extra: "NH 30%/ngày · Hạn mức / 30 ngày", rate: 0.30 },
  { key: "ky_lan", name: "Kỳ Lân", min: "700000", donate: "Ủng hộ 700.000đ", color: "#ffd166", deep: "#f48c06", dark: "#370617", glow: "rgba(255,209,102,0.38)", daily: "7000000000000", sendLimit: "280000000000000", receiveLimit: "63000000000000", dailyText: "7 K TỶ", sendText: "280 K TỶ", recvText: "63 K TỶ", extra: "NH 36%/ngày · Hạn mức / 30 ngày", rate: 0.36 },
  { key: "hon_don", name: "Hỗn Độn", min: "780000", donate: "Ủng hộ 780.000đ", color: "#b5179e", deep: "#7209b7", dark: "#240046", glow: "rgba(181,23,151,0.38)", daily: "10000000000000", sendLimit: "400000000000000", receiveLimit: "90000000000000", dailyText: "10 K TỶ", sendText: "400 K TỶ", recvText: "90 K TỶ", extra: "NH 45%/ngày · Hạn mức / 30 ngày", rate: 0.45 },
  { key: "vo_cuc", name: "Vô Cực", min: "850000", donate: "Ủng hộ 850.000đ", color: "#7209b7", deep: "#560bad", dark: "#10002b", glow: "rgba(114,9,183,0.38)", daily: "14000000000000", sendLimit: "560000000000000", receiveLimit: "126000000000000", dailyText: "14 K TỶ", sendText: "560 K TỶ", recvText: "126 K TỶ", extra: "NH 48%/ngày · Hạn mức / 30 ngày", rate: 0.48 },
  { key: "can_khon", name: "Càn Khôn", min: "900000", donate: "Ủng hộ 900.000đ", color: "#9d4edd", deep: "#3c096c", dark: "#10002b", glow: "rgba(157,78,221,0.38)", daily: "20000000000000", sendLimit: "800000000000000", receiveLimit: "180000000000000", dailyText: "20 K TỶ", sendText: "800 K TỶ", recvText: "180 K TỶ", extra: "NH 50%/ngày · Hạn mức / 30 ngày", rate: 0.50 },
  { key: "vinh_hang", name: "Vĩnh Hằng", min: "950000", donate: "Ủng hộ 950.000đ", color: "#4895ef", deep: "#3f37c9", dark: "#03045e", glow: "rgba(72,149,239,0.38)", daily: "28000000000000", sendLimit: "1100000000000000", receiveLimit: "252000000000000", dailyText: "28 K TỶ", sendText: "1100 K TỶ", recvText: "252 K TỶ", extra: "NH 52%/ngày · Hạn mức / 30 ngày", rate: 0.52 },
  { key: "chi_ton", name: "Chí Tôn", min: "1000000", donate: "Ủng hộ 1.000.000đ", color: "#ffb703", deep: "#fb8500", dark: "#211204", glow: "rgba(255,183,3,0.45)", daily: "40000000000000", sendLimit: "1600000000000000", receiveLimit: "360000000000000", dailyText: "40 K TỶ", sendText: "1600 K TỶ", recvText: "360 K TỶ", extra: "NH 55%/ngày · Hạn mức / 30 ngày", rate: 0.55 },
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

/** Danh sách hạng donate dùng chung cho menu, QR và các màn hình game. */
export function getGameTiers() {
  return TIERS.map((tier) => ({ ...tier }));
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
    lucbao: "emerald", emerald: "emerald",
    hongngoc: "ruby", ruby: "ruby",
    kimcuong: "diamond", diamond: "diamond",
    kimlong: "gold_dragon", gold_dragon: "gold_dragon", golddragon: "gold_dragon",
    huyenvu: "huyen_vu", huyen_vu: "huyen_vu",
    bachho: "bach_ho", bach_ho: "bach_ho",
    conbang: "con_bang", con_bang: "con_bang",
    thanhlong: "thanh_long", thanh_long: "thanh_long",
    chutuoc: "chu_tuoc", chu_tuoc: "chu_tuoc",
    kylan: "ky_lan", ky_lan: "ky_lan",
    hondon: "hon_don", hon_don: "hon_don",
    vocuc: "vo_cuc", vo_cuc: "vo_cuc",
    cankhon: "can_khon", can_khon: "can_khon",
    vinhhang: "vinh_hang", vinh_hang: "vinh_hang",
    chiton: "chi_ton", chi_ton: "chi_ton",
    mynam: "angel", mynhan: "angel", angel: "angel"
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

/** Các danh hiệu tích luỹ để hiển thị trên hồ sơ game. */
export function getPlayerAchievements(playerInfo = {}) {
  const games = Math.max(0, Number(playerInfo.totalGames) || 0);
  const wins = Math.max(0, Number(playerInfo.totalWinGames) || 0);
  const winRate = games ? (wins / games) * 100 : Number(playerInfo.winRate) || 0;
  const balance = new Big(playerInfo.balance || 0);
  const profit = new Big(playerInfo.netProfit || 0);
  const points = Number(playerInfo.rankPoints) || 0;
  const achievements = [getPlayerTitle(playerInfo)];

  if (games >= 200) achievements.push("HUYỀN THOẠI BÀN CHƠI");
  else if (games >= 100) achievements.push("CAO THỦ BỀN BỈ");
  else if (games >= 30) achievements.push("DÂN CHƠI KỲ CỰU");
  else if (games >= 10) achievements.push("NGƯỜI CHƠI CHĂM CHỈ");
  else achievements.push("TÂN THỦ KHỞI ĐỘNG");

  if (wins >= 100) achievements.push("BÁCH THẮNG VƯƠNG");
  else if (wins >= 50) achievements.push("CHIẾN THẮNG GIẢ");
  else if (wins >= 20) achievements.push("NGƯỜI CHIẾN THẮNG");
  else if (wins >= 5) achievements.push("KHỞI ĐẦU THUẬN LỢI");

  if (games >= 10 && winRate >= 75) achievements.push("BÀN TAY VÀNG");
  else if (games >= 10 && winRate >= 60) achievements.push("CAO THỦ CHIẾN THUẬT");
  else if (games >= 10 && winRate >= 50) achievements.push("PHONG ĐỘ ỔN ĐỊNH");

  if (profit.gte("1000000000")) achievements.push("TỶ PHÚ LỢI NHUẬN");
  else if (profit.gte("100000000")) achievements.push("THỢ SĂN LỢI NHUẬN");
  else if (profit.gt(0)) achievements.push("NGƯỜI CHƠI SINH LỜI");

  if (balance.gte("10000000000")) achievements.push("ĐẠI GIA GAME");
  else if (balance.gte("1000000000")) achievements.push("TỶ PHÚ GAME");
  else if (balance.gte("100000000")) achievements.push("TÀI PHIỆT TẬP SỰ");

  const tier = getGameTier(points);
  if (tier.key !== "silver") achievements.push(`HẠNG ${tier.name.toUpperCase()}`);
  return [...new Set(achievements)].slice(0, 7);
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
  const activeStyle = getActiveCanvasStyle();
  if (activeStyle !== 1) {
    const topPlayers = players.slice(0, 10);
    const avatars = await Promise.all(topPlayers.map((player) => safeLoadImage(player.avatar)));
    return renderCollectionStyle(activeStyle, {
      kicker: "MYBOT • GAME ECONOMY",
      title,
      subtitle: "Top người chơi giàu nhất toàn hệ thống",
      footer: viewer ? `Vị trí của bạn: ${viewer.rank || "--"} • ${compactMoney(viewer.balance)} VNĐ` : "Bảng xếp hạng tài sản game",
      items: topPlayers.map((player, index) => ({
        title: player.playerName || "Người chơi",
        subtitle: player.hideTier ? "ẨN HẠNG" : getGameTier(player.rankPoints).name,
        meta: `${compactMoney(player.balance)} VNĐ`,
        image: avatars[index],
        badge: String(player.rank || index + 1).padStart(2, "0"),
      })),
    }, "game_rank");
  }
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
  const displayTitle = typeof title === "string" ? title : (title?.title || "BẢNG XẾP HẠNG GAME");
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = fitFont(ctx, displayTitle, 550, 38, 25);
  ctx.fillText(displayTitle, 122, 65);
  ctx.fillStyle = "rgba(255,255,255,0.58)";
  ctx.font = `bold 14px ${FONT_MAIN}`;
  ctx.fillText("TOP 10 NGƯỜI GIÀU NHẤT TOÀN HỆ THỐNG", 122, 103);
  ctx.textAlign = "right";
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 18px ${FONT_MAIN}`;
  ctx.fillText(new Date().toLocaleDateString("vi-VN"), 838, 84);

  const topTen = players.slice(0, 10);
  const frameMap = {};
  const backgroundMap = {};
  const artworkMap = {};
  const fullCreatureTiers = new Set(["gold_dragon", "huyen_vu", "bach_ho", "con_bang", "thanh_long", "chu_tuoc", "ky_lan"]);
  const allNeededTiers = new Set([
    ...topTen.map((p) => getGameTier(p.rankPoints).key),
    viewer ? getGameTier(viewer.rankPoints).key : "silver"
  ]);

  const [avatars] = await Promise.all([
    Promise.all(topTen.map((player) => safeLoadImage(player.avatar))),
    ...Array.from(allNeededTiers).map(async (key) => {
      [frameMap[key], backgroundMap[key], artworkMap[key]] = await Promise.all([
        key === "silver" ? null : safeLoadImage(path.resolve(`./assets/resources/game/tiers/frames/${key}.png`)),
        safeLoadImage(key === "angel" ? MY_NHAN_BG_PATH : path.resolve(`./assets/resources/game/tiers/backgrounds/${key}.jpg`)),
        key === "angel"
          ? safeLoadImage(MY_NHAN_BG_PATH)
          : fullCreatureTiers.has(key) ? safeLoadImage(path.resolve(`./assets/resources/game/tiers/artworks/${key}.png`)) : null,
      ]);
    })
  ]);
  
  const rowX = 42;
  const rowWidth = 816;
  const rowHeight = 86;
  const rowGap = 12;

  const drawRow = (ctx, y, player, index, avatar, isViewer = false) => {
    const tier = getGameTier(player.rankPoints);
    const textColor = getGameTierTextColor(tier);
    const isDefaultTier = tier.key === "silver";
    const isPremium = ["emerald", "ruby", "diamond", "angel"].includes(tier.key);
    const isDragon = tier.key === "gold_dragon";
    
    drawGameTierBackground(ctx, rowX, y, rowWidth, rowHeight, tier, {
      radius: 20,
      prominent: index < 3,
      selected: isViewer,
      background: artworkMap[tier.key] || backgroundMap[tier.key],
      backgroundCover: Boolean(artworkMap[tier.key]),
    });

    // Số hạng
    ctx.textAlign = "center";
    ctx.beginPath();
    ctx.arc(82, y + rowHeight / 2, 25, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(5,8,12,0.75)";
    ctx.fill();
    ctx.strokeStyle = tier.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = index === 0 ? textColor : "#ffffff";
    ctx.font = `bold 18px ${FONT_MAIN}`;
    ctx.fillText(String(player.rank || (isViewer ? "–" : index + 1)), 82, y + 44);

    // Avatar và Frame căn tâm đồng trục tuyệt đối
    const avCenterX = 143;
    const avCenterY = y + 43;
    const avRadius = 26;

    ctx.save();
    ctx.beginPath();
    ctx.arc(avCenterX, avCenterY, avRadius, 0, Math.PI * 2);
    ctx.fillStyle = "#1a1d26";
    ctx.fill();
    ctx.clip();
    if (avatar) {
      const scale = Math.max((avRadius * 2) / avatar.width, (avRadius * 2) / avatar.height);
      const aw = avatar.width * scale;
      const ah = avatar.height * scale;
      ctx.drawImage(avatar, avCenterX - aw / 2, avCenterY - ah / 2, aw, ah);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold 20px ${FONT_MAIN}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText((player.playerName || "P").trim().charAt(0).toUpperCase(), avCenterX, avCenterY);
    }
    ctx.restore();

    // Khung frame Avatar 3D theo tier bao trọn avatar
    const playerFrame = isDefaultTier ? null : frameMap[tier.key];
    if (playerFrame) {
      const fSize = 84;
      ctx.drawImage(playerFrame, avCenterX - fSize / 2, avCenterY - fSize / 2, fSize, fSize);
    } else if (!isDefaultTier) {
      ctx.beginPath();
      ctx.arc(avCenterX, avCenterY, avRadius + 2, 0, Math.PI * 2);
      ctx.strokeStyle = tier.color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Tên
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = fitFont(ctx, player.playerName || "Người chơi", 300, 25, 16);
    ctx.fillText(player.playerName || "Người chơi", 187, y + 30);
    
    // Badge danh hiệu
    const titleText = player.hideTier ? "ẨN HẠNG" : `${tier.name.toUpperCase()} • ${getPlayerTitle(player)}`;
    ctx.font = fitFont(ctx, titleText, 275, 13, 9);
    const badgeW = ctx.measureText(titleText).width + 24;
    roundedRect(ctx, 187, y + 52, badgeW, 23, 11);
    if (isPremium) {
      ctx.fillStyle = `${tier.color}33`;
      ctx.fill();
      ctx.strokeStyle = `${tier.color}`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = textColor;
    } else {
      ctx.fillStyle = "rgba(3,6,10,0.72)";
      ctx.fill();
      ctx.fillStyle = textColor;
    }
    ctx.fillText(titleText, 199, y + 64);

    // Tài sản
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,0.48)";
    ctx.font = `bold 11px ${FONT_MAIN}`;
    ctx.fillText("TÀI SẢN", 826, y + 24);
    ctx.fillStyle = textColor;
    ctx.font = fitFont(ctx, compactMoney(player.balance), 185, 28, 10);
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
  ctx.fillStyle = viewer ? getGameTierTextColor(getGameTier(viewer.rankPoints)) : "rgba(255,255,255,0.45)";
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
async function renderGamePlayerCardClassic(playerInfo) {
  const W = 1080, H = 720;
  const tier = getGameTier(playerInfo.rankPoints);
  const avatar = await safeLoadImage(playerInfo.avatarFull || playerInfo.avatar);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "middle";
  const rr = (x, y, w, h, r, fill, stroke = null, line = 1) => {
    ctx.beginPath(); roundedRect(ctx, x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = line; ctx.stroke(); }
  };
  const line = (x1, y1, x2, y2, color = "rgba(240,196,93,.28)") => {
    ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  };
  const label = (text, x, y, align = "left") => {
    ctx.textAlign = align; ctx.fillStyle = "rgba(255,255,255,.76)"; ctx.font = `bold 18px ${FONT_MAIN}`; ctx.fillText(text, x, y);
  };
  const avatarCircle = (cx, cy) => {
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, 76, 0, Math.PI * 2); ctx.clip();
    if (avatar) ctx.drawImage(avatar, cx - 76, cy - 76, 152, 152);
    else { ctx.fillStyle = "#39424f"; ctx.fillRect(cx - 76, cy - 76, 152, 152); ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = `bold 56px ${FONT_MAIN}`; ctx.fillText((playerInfo.playerName || "P")[0].toUpperCase(), cx, cy); }
    ctx.restore(); ctx.beginPath(); ctx.arc(cx, cy, 80, 0, Math.PI * 2); ctx.strokeStyle = tier.color; ctx.lineWidth = 6; ctx.stroke();
  };
  const stat = (x, y, w, h, title, value, color, note = "") => {
    rr(x, y, w, h, 8, "rgba(255,255,255,.055)", "rgba(245,191,80,.30)");
    ctx.textAlign = "left"; ctx.fillStyle = "#f8f8f8"; ctx.font = `bold 20px ${FONT_MAIN}`; ctx.fillText(title.toUpperCase(), x + 20, y + 34);
    ctx.fillStyle = color; ctx.font = fitFont(ctx, value, w - 40, 38, 24); ctx.fillText(value, x + 20, y + 75);
    if (note) { ctx.fillStyle = "rgba(255,255,255,.50)"; ctx.font = `bold 13px ${FONT_MAIN}`; ctx.fillText(note, x + 20, y + h - 14); }
  };

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#46504d"); bg.addColorStop(.4, "#171c1e"); bg.addColorStop(1, "#252d2c");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(130, 90, 0, 130, 90, 620);
  glow.addColorStop(0, `${tier.color}30`); glow.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  rr(36, 36, 1008, 648, 10, "rgba(10,13,15,.90)", "rgba(255,255,255,.24)", 1.2);
  line(340, 36, 340, 684, "rgba(245,191,80,.32)");

  avatarCircle(188, 134);
  ctx.textAlign = "center"; ctx.fillStyle = tier.color; ctx.font = `bold 18px ${FONT_MAIN}`; ctx.fillText("THÔNG TIN NGƯỜI CHƠI", 188, 240);
  ctx.fillStyle = "#fff"; ctx.font = fitFont(ctx, playerInfo.playerName || "Người chơi", 250, 29, 19); ctx.fillText(playerInfo.playerName || "Người chơi", 188, 288);
  line(66, 325, 310, 325);
  ctx.fillStyle = "rgba(255,255,255,.58)"; ctx.font = `bold 13px ${FONT_MAIN}`; ctx.fillText(`DANH HIỆU • ${playerInfo.totalGames || 0} TRẬN`, 188, 345);
  const achievements = getPlayerAchievements(playerInfo);
  achievements.forEach((text, index) => {
    const y = 366 + index * 29;
    rr(54, y, 268, 24, 5, "rgba(255,255,255,.07)", "rgba(255,255,255,.18)");
    ctx.fillStyle = index === 0 ? tier.color : "#4be0d0"; ctx.beginPath(); ctx.arc(77, y + 12, 4, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = "left"; ctx.fillStyle = "#f2f2f2"; ctx.font = fitFont(ctx, text, 210, 12, 9); ctx.fillText(text, 91, y + 13);
  });
  // Không hiển thị mã nội bộ (đặc biệt private:<server>:<uid>) trên thẻ;
  // mã dài làm tràn khung và không có giá trị với người chơi.
  ctx.fillStyle = tier.color; ctx.font = `bold 24px ${FONT_MAIN}`; ctx.fillText("♠   ♥   ♦   ♣", 188, 642);

  const rX = 376, rW = 634;
  label("SỐ DƯ", rX, 88);
  const balance = compactMoney(playerInfo.balance);
  ctx.fillStyle = tier.color; ctx.font = fitFont(ctx, balance, 470, 68, 38); ctx.textAlign = "left"; ctx.fillText(balance, rX, 151);
  ctx.fillStyle = "#f5c75d"; ctx.font = `bold 26px ${FONT_MAIN}`; ctx.textAlign = "right"; ctx.fillText("VNĐ", rX + rW, 171);
  line(rX, 216, rX + rW, 216);
  const profit = new Big(playerInfo.netProfit || 0); const gain = profit.gte(0); const profitColor = gain ? "#42ddca" : "#ff637a";
  ctx.textAlign = "left"; ctx.fillStyle = "#fff"; ctx.font = `bold 27px ${FONT_MAIN}`; ctx.fillText("Lợi nhuận", rX, 255);
  ctx.fillStyle = profitColor; ctx.font = `bold 29px ${FONT_MAIN}`; ctx.fillText(`${gain ? "▲" : "▼"}  ${gain ? "+" : "−"}${compactMoney(profit.abs())} VNĐ`, rX + 176, 255);
  line(rX, 286, rX + rW, 286);
  stat(rX, 304, 312, 124, "Tổng thắng", compactMoney(playerInfo.totalWinnings || 0), "#42ddca");
  stat(rX + 322, 304, 312, 124, "Tổng thua", compactMoney(new Big(playerInfo.totalLosses || 0).abs()), "#ff637a");
  stat(rX, 438, 312, 124, "Tỉ lệ thắng", `${playerInfo.winRate || 0}%`, "#fff", `${playerInfo.totalWinGames || 0} thắng • ${Math.max(0, (playerInfo.totalGames || 0) - (playerInfo.totalWinGames || 0))} thua`);
  stat(rX + 322, 438, 312, 124, "Lượt chơi", String(playerInfo.totalGames || 0), "#fff", "TỔNG SỐ TRẬN");
  line(rX, 582, rX + rW, 582);
  ctx.textAlign = "left"; ctx.fillStyle = "rgba(255,255,255,.56)"; ctx.font = `bold 14px ${FONT_MAIN}`; ctx.fillText(`Tham gia: ${playerInfo.registrationTime || "—"}`, rX, 616);
  ctx.textAlign = "right"; ctx.fillText(`Hạng: ${tier.name}`, rX + rW, 616);
  line(rX, 642, rX + rW, 642);
  ctx.textAlign = "center"; ctx.fillStyle = tier.color; ctx.font = `bold 22px ${FONT_MAIN}`; ctx.fillText("CHÚC BẠN CÓ NHỮNG VÁN CHƠI MAY MẮN", rX + rW / 2, 668);
  const filePath = path.resolve(`./assets/temp/game_mycard_${Date.now()}.png`);
  await writeFilePromise(filePath, canvas.toBuffer());
  return filePath;
}

export async function createGamePlayerCard(playerInfo) {
  // MyCard có thiết kế riêng, không dùng renderer portrait toàn cục.
  if (playerInfo.mycardStyle !== "legacy") return renderGamePlayerCardClassic(playerInfo);
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

  // Nền studio tối, có chiều sâu nhưng không lấn át số liệu.
  const pageBg = ctx.createLinearGradient(0, 0, W, H);
  pageBg.addColorStop(0, "#182029");
  pageBg.addColorStop(0.45, "#090d12");
  pageBg.addColorStop(1, "#111720");
  ctx.fillStyle = pageBg;
  ctx.fillRect(0, 0, W, H);
  const ambient = ctx.createRadialGradient(W * 0.78, H * 0.16, 0, W * 0.78, H * 0.16, W * 0.72);
  ambient.addColorStop(0, `${tier.color}28`);
  ambient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = ambient;
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
      const panel = ctx.createLinearGradient(x, y, x + w, y + h);
      panel.addColorStop(0, "rgba(35, 42, 51, 0.96)");
      panel.addColorStop(1, "rgba(18, 23, 31, 0.96)");
      ctx.fillStyle = panel;
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
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

  ctx.textAlign = "left";
  ctx.fillStyle = tier.color;
  ctx.font = `bold 13px ${FONT_MAIN}`;
  ctx.fillText("HỒ SƠ GAME", lX + 30, lY + 34);

  const avX = lX + leftW / 2;
  const avY = lY + 140;
  const avR = 85;

  ctx.save();
  ctx.beginPath();
  ctx.arc(avX, avY, avR, 0, Math.PI * 2);
  ctx.clip();
  const avatar = await safeLoadImage(playerInfo.avatarFull || playerInfo.avatar);
  if (avatar) {
    ctx.drawImage(avatar, avX - avR, avY - avR, avR * 2, avR * 2);
  } else {
    const fallback = ctx.createLinearGradient(avX - avR, avY - avR, avX + avR, avY + avR);
    fallback.addColorStop(0, "#566273");
    fallback.addColorStop(1, "#1b222c");
    ctx.fillStyle = fallback;
    ctx.fillRect(avX - avR, avY - avR, avR * 2, avR * 2);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = `bold 62px ${FONT_MAIN}`;
    ctx.fillText((playerInfo.playerName || "P").trim().charAt(0).toUpperCase(), avX, avY);
  }
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
  ctx.fillText("SỐ DƯ GAME", rX + 40, lY + 50);

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

  ctx.strokeStyle = `${tier.color}55`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rX + 40, lY + 132);
  ctx.lineTo(rX + rW - 40, lY + 132);
  ctx.stroke();

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

async function renderGameBankTransferReceipt(data) {
  const width = 900;
  const height = 980;
  const senderColor = "#ff5d78";
  const receiverColor = "#42e0cc";
  const gold = "#f5bf50";
  const [senderAvatar, receiverAvatar] = await Promise.all([
    safeLoadImage(data.sender.avatar),
    safeLoadImage(data.receiver.avatar),
  ]);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "middle";

  const outer = (x, y, w, h, radius, fill, stroke, lineWidth = 1) => {
    ctx.beginPath();
    roundedRect(ctx, x, y, w, h, radius);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  };
  const avatar = (image, centerX, centerY, color) => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, 43, 0, Math.PI * 2);
    ctx.clip();
    if (image) {
      ctx.drawImage(image, centerX - 43, centerY - 43, 86, 86);
    } else {
      const fallback = ctx.createLinearGradient(centerX - 43, centerY - 43, centerX + 43, centerY + 43);
      fallback.addColorStop(0, "#50545d");
      fallback.addColorStop(1, "#171a20");
      ctx.fillStyle = fallback;
      ctx.fillRect(centerX - 43, centerY - 43, 86, 86);
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(centerX, centerY, 45, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.stroke();
  };
  const metric = (x, y, w, label, compact, raw, color) => {
    const fill = ctx.createLinearGradient(x, y, x + w, y + 108);
    fill.addColorStop(0, "rgba(255,255,255,0.08)");
    fill.addColorStop(1, "rgba(255,255,255,0.035)");
    outer(x, y, w, 108, 10, fill, "rgba(245,191,80,0.35)");
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.font = `bold 16px ${FONT_MAIN}`;
    ctx.fillText(label, x + w / 2, y + 24);
    ctx.fillStyle = color;
    ctx.font = fitFont(ctx, compact, w - 30, 34, 22);
    ctx.fillText(compact, x + w / 2, y + 57);
    ctx.fillStyle = "rgba(255,255,255,0.74)";
    ctx.font = fitFont(ctx, `${raw} VNĐ`, w - 22, 16, 11);
    ctx.fillText(`${raw} VNĐ`, x + w / 2, y + 89);
  };
  const directionArrow = (x, y, color) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - 18, y);
    ctx.lineTo(x + 17, y);
    ctx.lineTo(x + 6, y - 12);
    ctx.moveTo(x + 17, y);
    ctx.lineTo(x + 6, y + 12);
    ctx.stroke();
    ctx.restore();
  };
  const downMarker = (y) => {
    outer(width / 2 - 28, y - 27, 56, 56, 28, "#111217", "rgba(255,255,255,0.10)");
    ctx.save();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const offset of [-7, 5]) {
      ctx.beginPath();
      ctx.moveTo(width / 2 - 8, y + offset - 4);
      ctx.lineTo(width / 2, y + offset + 4);
      ctx.lineTo(width / 2 + 8, y + offset - 4);
      ctx.stroke();
    }
    ctx.restore();
  };

  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#10171a");
  background.addColorStop(0.52, "#05080b");
  background.addColorStop(1, "#090b10");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(150, 240, 0, 150, 240, 720);
  glow.addColorStop(0, "rgba(255,255,255,0.055)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
  outer(22, 18, width - 44, height - 36, 18, "rgba(4,6,9,0.76)", "rgba(255,255,255,0.20)", 1.2);

  // Bank glyph and heading.
  ctx.save();
  ctx.strokeStyle = gold;
  ctx.fillStyle = gold;
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(54, 67);
  ctx.lineTo(77, 54);
  ctx.lineTo(100, 67);
  ctx.stroke();
  ctx.fillRect(59, 72, 36, 5);
  for (const x of [62, 74, 86]) ctx.fillRect(x, 77, 6, 16);
  ctx.fillRect(58, 94, 38, 5);
  ctx.restore();
  ctx.textAlign = "left";
  ctx.fillStyle = "#f8f8f8";
  ctx.font = `bold 40px ${FONT_MAIN}`;
  ctx.fillText("BIẾN ĐỘNG SỐ DƯ", 118, 70);
  ctx.fillStyle = "rgba(255,255,255,0.67)";
  ctx.font = `bold 20px ${FONT_MAIN}`;
  ctx.fillText("Giao dịch chuyển tiền thành công", 119, 108);
  ctx.strokeStyle = "rgba(245,191,80,0.43)";
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(44, 134); ctx.lineTo(856, 134); ctx.stroke();

  // Sender panel.
  outer(44, 154, 812, 242, 14, "rgba(255,255,255,0.065)", "rgba(255,93,120,0.55)", 1.5);
  avatar(senderAvatar, 120, 214, "#ff9dad");
  ctx.textAlign = "left";
  ctx.fillStyle = senderColor;
  ctx.font = `bold 17px ${FONT_MAIN}`;
  ctx.fillText("NGƯỜI CHUYỂN", 182, 191);
  ctx.fillStyle = "#fff";
  ctx.font = fitFont(ctx, data.sender.name || "Người gửi", 560, 34, 22);
  ctx.fillText(data.sender.name || "Người gửi", 182, 229);
  ctx.textAlign = "right";
  ctx.fillStyle = senderColor;
  ctx.font = `bold 30px ${FONT_MAIN}`;
  ctx.fillText("−", 813, 213);
  metric(70, 275, 336, "SỐ DƯ TRƯỚC", compactMoney(data.sender.balanceBefore), fullNumber(data.sender.balanceBefore), "#fff");
  directionArrow(450, 323, senderColor);
  metric(494, 275, 336, "SỐ DƯ SAU", compactMoney(data.sender.balanceAfter), fullNumber(data.sender.balanceAfter), senderColor);

  downMarker(430);
  outer(189, 466, 522, 157, 13, "rgba(255,255,255,0.075)", "rgba(245,191,80,0.42)");
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.67)";
  ctx.font = `bold 20px ${FONT_MAIN}`;
  ctx.fillText("SỐ TIỀN CHUYỂN", width / 2, 499);
  ctx.fillStyle = gold;
  ctx.font = fitFont(ctx, compactMoney(data.amount), 470, 62, 38);
  ctx.fillText(compactMoney(data.amount), width / 2, 549);
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = fitFont(ctx, `${fullNumber(data.amount)} VNĐ`, 470, 18, 12);
  ctx.fillText(`${fullNumber(data.amount)} VNĐ`, width / 2, 597);
  downMarker(652);

  // Receiver panel.
  outer(44, 684, 812, 242, 14, "rgba(255,255,255,0.065)", "rgba(66,224,204,0.52)", 1.5);
  ctx.textAlign = "left";
  ctx.fillStyle = receiverColor;
  ctx.font = `bold 31px ${FONT_MAIN}`;
  ctx.fillText("+", 83, 742);
  ctx.textAlign = "right";
  ctx.fillStyle = receiverColor;
  ctx.font = `bold 17px ${FONT_MAIN}`;
  ctx.fillText("NGƯỜI NHẬN", 716, 719);
  ctx.fillStyle = "#fff";
  ctx.font = fitFont(ctx, data.receiver.name || "Người nhận", 550, 34, 22);
  ctx.fillText(data.receiver.name || "Người nhận", 716, 758);
  avatar(receiverAvatar, 782, 746, "#8ceee0");
  metric(70, 805, 336, "SỐ DƯ TRƯỚC", compactMoney(data.receiver.balanceBefore), fullNumber(data.receiver.balanceBefore), "#fff");
  directionArrow(450, 853, receiverColor);
  metric(494, 805, 336, "SỐ DƯ SAU", compactMoney(data.receiver.balanceAfter), fullNumber(data.receiver.balanceAfter), receiverColor);

  const filePath = path.resolve(`./assets/temp/game_bank_${Date.now()}.png`);
  await writeFilePromise(filePath, canvas.toBuffer());
  return filePath;
}

export async function createGameBankTransferImage(data) {
  const activeStyle = getActiveCanvasStyle();
  if (activeStyle !== 1) {
    const [senderAvatar, receiverAvatar] = await Promise.all([
      safeLoadImage(data.sender.avatar), safeLoadImage(data.receiver.avatar),
    ]);
    return renderPortraitStyle(activeStyle, {
      kind: "bank-transfer",
      kicker: "MYBOT • GAME BANKING",
      title: "CHUYỂN TIỀN THÀNH CÔNG",
      names: [data.sender.name || "Người gửi", data.receiver.name || "Người nhận"],
      avatars: [senderAvatar, receiverAvatar],
      primaryLabel: "SỐ TIỀN GIAO DỊCH",
      primaryValue: `${compactMoney(data.amount)} VNĐ`,
      secondaryLabel: "MÃ GIAO DỊCH",
      secondaryValue: data.referenceCode || "N/A",
      body: `Số dư người gửi ${compactMoney(data.sender.balanceAfter)} • Người nhận ${compactMoney(data.receiver.balanceAfter)} VNĐ`,
      footer: "Giao dịch nội bộ Game Banking",
    }, "game_bank");
  }
  // Mặc định dùng phiếu dọc theo mẫu Game Bank; vẫn giữ mẫu cũ cho các luồng
  // nội bộ nào cần tương thích với giao diện trước đây.
  if (data.receiptStyle !== "legacy") return renderGameBankTransferReceipt(data);
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
  const totalGames = Math.max(0, Number(data.totalGames) || 0);
  const totalWinGames = Math.max(0, Number(data.totalWinGames) || 0);
  const totalLossGames = Math.max(0, totalGames - totalWinGames);
  const winRate = totalGames > 0 ? ((totalWinGames / totalGames) * 100).toFixed(1).replace(/\.0$/, "") : (data.winRate || "0");
  const netProfit = Number(data.netProfit || 0);
  const profitPrefix = netProfit > 0 ? "+" : "";

  const activeStyle = getActiveCanvasStyle();
  if (activeStyle !== 1) {
    return renderCollectionStyle(activeStyle, {
      kicker: "MYBOT • LỊCH SỬ THẮNG THUA",
      title: "SAO KÊ THẮNG THUA",
      subtitle: `${data.playerName || "Người chơi"} • Thắng ${totalWinGames}/${totalGames} (${winRate}%) • LN ${profitPrefix}${compactMoney(netProfit)} VNĐ`,
      footer: `${transactions.length} ván gần nhất • Số dư ${compactMoney(data.balance)} VNĐ • ${formatDate()}`,
      items: transactions.map((transaction) => {
        const isWin = transaction.direction === "in";
        const isPush = transaction.direction === "push";
        const sign = isWin ? "+" : isPush ? "±" : "−";
        const badge = isWin ? "THẮNG" : isPush ? "HÒA" : "THUA";
        return {
          title: transaction.counterpartyName || "Ván đấu",
          subtitle: `${formatDate(transaction.createdAt)} • ${transaction.referenceCode || "N/A"}${transaction.detail ? ` • ${transaction.detail}` : ""}`,
          meta: `${sign}${compactMoney(transaction.amount)} VNĐ`,
          badge,
        };
      }),
    }, "game_statement");
  }
  const width = 1080;
  const height = Math.max(560, 310 + transactions.length * 92);
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
  ctx.fillText("MYBOT • LỊCH SỬ GAME", 46, 42);
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 40px ${FONT_MAIN}`;
  ctx.fillText("SAO KÊ THẮNG THUA", 46, 82);
  ctx.fillStyle = "rgba(255,255,255,0.48)";
  ctx.font = `bold 13px ${FONT_MAIN}`;
  ctx.fillText(`10 VÁN ĐẤU GẦN NHẤT  •  ${formatDate()}`, 46, 120);

  // Main account panel
  drawPanel(ctx, 46, 146, 988, 76, tier, true);
  ctx.fillStyle = "rgba(255,255,255,0.48)";
  ctx.font = `bold 12px ${FONT_MAIN}`;
  ctx.fillText("CHỦ TÀI KHOẢN", 72, 168);
  ctx.fillStyle = "#ffffff";
  ctx.font = fitFont(ctx, data.playerName || "Người chơi", 380, 22, 16);
  ctx.fillText(data.playerName || "Người chơi", 72, 198);
  drawTierBadge(ctx, tier, 462, 168, 132, 28);
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.48)";
  ctx.font = `bold 12px ${FONT_MAIN}`;
  ctx.fillText("SỐ DƯ HIỆN TẠI", 1004, 168);
  ctx.fillStyle = tier.color;
  ctx.font = fitFont(ctx, `${compactMoney(data.balance)} VNĐ`, 360, 26, 17);
  ctx.fillText(`${compactMoney(data.balance)} VNĐ`, 1004, 198);

  // Stats summary bar
  drawPanel(ctx, 46, 230, 988, 52, tier);
  ctx.textAlign = "left";
  ctx.font = `bold 13px ${FONT_MAIN}`;
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.fillText("Tổng ván:", 72, 256);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`${totalGames}`, 142, 256);

  ctx.fillStyle = "#5ee4b4";
  ctx.fillText(`Thắng: ${totalWinGames}`, 230, 256);
  ctx.fillStyle = "#ff7185";
  ctx.fillText(`Thua: ${totalLossGames}`, 370, 256);

  ctx.fillStyle = "#ffd166";
  ctx.fillText(`Tỉ lệ: ${winRate}%`, 510, 256);

  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.fillText("Lợi nhuận ròng:", 840, 256);
  ctx.fillStyle = netProfit > 0 ? "#5ee4b4" : netProfit < 0 ? "#ff7185" : "#ffffff";
  ctx.font = `bold 14px ${FONT_MAIN}`;
  ctx.fillText(`${profitPrefix}${compactMoney(netProfit)} VNĐ`, 1004, 256);

  if (transactions.length === 0) {
    drawPanel(ctx, 46, 296, 988, 180, tier);
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.52)";
    ctx.font = `bold 20px ${FONT_MAIN}`;
    ctx.fillText("CHƯA CÓ LỊCH SỬ VÁN ĐẤU GẦN ĐÂY", width / 2, 380);
    ctx.font = `14px ${FONT_MAIN}`;
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillText("Hãy tham gia Tài Xỉu, Bầu Cua, Baccarat... để lưu sao kê ván đấu!", width / 2, 415);
  }

  transactions.forEach((transaction, index) => {
    const incoming = transaction.direction === "in";
    const isPush = transaction.direction === "push";
    const color = isPush ? "#ffd166" : incoming ? "#5ee4b4" : "#ff7185";
    const symbol = isPush ? "•" : incoming ? "+" : "−";
    const y = 296 + index * 92;
    drawPanel(ctx, 46, y, 988, 76, tier);
    roundedRect(ctx, 66, y + 17, 42, 42, 14);
    ctx.fillStyle = `${color}20`;
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.font = `bold 22px ${FONT_MAIN}`;
    ctx.fillText(symbol, 87, y + 39);
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = fitFont(ctx, transaction.counterpartyName || "Trò chơi", 330, 19, 14);
    ctx.fillText(transaction.counterpartyName || "Trò chơi", 128, y + 28);
    ctx.fillStyle = "rgba(255,255,255,0.38)";
    ctx.font = `bold 11px ${FONT_MAIN}`;
    const subText = `${formatDate(transaction.createdAt)}  •  ${transaction.referenceCode}${transaction.detail ? `  •  ${transaction.detail}` : ""}`;
    ctx.fillText(subText, 128, y + 54);
    ctx.textAlign = "right";
    ctx.fillStyle = color;
    ctx.font = fitFont(ctx, `${symbol}${compactMoney(transaction.amount)} VNĐ`, 300, 22, 15);
    ctx.fillText(`${symbol}${compactMoney(transaction.amount)} VNĐ`, 1004, y + 28);
    ctx.fillStyle = "rgba(255,255,255,0.42)";
    ctx.font = `bold 11px ${FONT_MAIN}`;
    ctx.fillText(transaction.balanceAfter ? `Số dư: ${compactMoney(transaction.balanceAfter)} VNĐ` : (isPush ? "Hoàn cược" : (incoming ? "Thắng cược" : "Thua cược")), 1004, y + 54);
  });

  const filePath = path.resolve(`./assets/temp/game_statement_${Date.now()}.png`);
  await writeFilePromise(filePath, canvas.toBuffer());
  return filePath;
}

/** Thẻ sổ tiết kiệm: màu, huy hiệu và lãi suất đều lấy theo hạng người chơi. */
export async function createGameSavingsImage(data) {
  const width = 1080;
  const height = 640;
  const tier = getGameTier(data.rankPoints);
  const [artwork, avatar] = await Promise.all([
    safeLoadImage(path.resolve(`./assets/resources/game/tiers/artworks/${tier.key}.png`)),
    safeLoadImage(data.avatar),
  ]);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  // Layout theo mẫu thẻ ngân hàng; bảng màu/nền luôn lấy từ hạng hiện tại.
  const base = ctx.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, tier.dark);
  base.addColorStop(0.58, "#07120f");
  base.addColorStop(1, tier.deep);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);
  if (artwork) {
    ctx.save();
    ctx.globalAlpha = 0.11;
    ctx.drawImage(artwork, 702, 10, 400, 400);
    ctx.restore();
  }
  const glow = ctx.createRadialGradient(100, 610, 20, 100, 610, 750);
  glow.addColorStop(0, `${tier.color}5c`);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = "middle";

  // Viền và nền thẻ đúng kiểu mẫu: thẻ lớn, header, sau đó 4 ô số liệu.
  ctx.save();
  ctx.shadowColor = `${tier.color}8c`;
  ctx.shadowBlur = 26;
  roundedRect(ctx, 30, 30, 1020, 580, 30);
  ctx.fillStyle = "rgba(5,13,12,0.86)";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = `${tier.color}bd`;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  drawAvatar(ctx, avatar, 136, 146, 142, tier.color);
  ctx.textAlign = "left";
  ctx.fillStyle = tier.color;
  ctx.font = `bold 30px ${FONT_MAIN}`;
  ctx.fillText("TÀI KHOẢN NGÂN HÀNG", 258, 100);
  ctx.fillStyle = "#fff";
  ctx.font = fitFont(ctx, data.playerName || "Người chơi", 530, 46, 26);
  ctx.fillText(data.playerName || "Người chơi", 258, 152);
  drawTierBadge(ctx, tier, 258, 181, 132, 34);
  ctx.textAlign = "right";
  ctx.fillStyle = tier.color;
  ctx.font = `bold 27px ${FONT_MAIN}`;
  ctx.fillText("♠ ♥ ♦ ♣", 1010, 100);
  ctx.strokeStyle = `${tier.color}66`;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(64, 250);
  ctx.lineTo(1016, 250);
  ctx.stroke();

  const locked = data.savingsUnlocked === false;
  const values = [
    ["SỐ DƯ VÍ CHÍNH", `${compactMoney(data.balance)} VNĐ`, tier.color],
    ["SỔ TIẾT KIỆM", locked ? "Đang khóa" : `${compactMoney(data.savings)} VNĐ`, locked ? "#44e3ae" : tier.color],
    ["LÃI MỖI NGÀY", locked ? "—" : `${Math.round((data.rate || 0) * 100)}%`, "#44e3ae"],
    ["CÒN CHUYỂN / NHẬN", `${compactMoney(tier.sendLimit)} / ${compactMoney(tier.receiveLimit)}`, "#fff"],
  ];
  values.forEach(([label, value, color], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 64 + col * 488;
    const y = 282 + row * 142;
    roundedRect(ctx, x, y, 464, 118, 18);
    ctx.fillStyle = "rgba(255,255,255,0.045)";
    ctx.fill();
    ctx.strokeStyle = `${tier.color}55`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.63)";
    ctx.font = `bold 20px ${FONT_MAIN}`;
    ctx.fillText(label, x + 24, y + 36);
    ctx.fillStyle = color;
    ctx.font = fitFont(ctx, value, 416, index === 3 ? 31 : 43, 21);
    ctx.fillText(value, x + 24, y + 82);
  });
  ctx.textAlign = "center";
  ctx.fillStyle = locked ? "rgba(255,255,255,0.72)" : "#44e3ae";
  ctx.font = `bold 19px ${FONT_MAIN}`;
  ctx.fillText(locked ? "🔒 Ngân Hàng Sinh Lời là đặc quyền hạng Kim Cương" : `🔓 Ngân Hàng Sinh Lời • Hạng ${tier.name}`, width / 2, 574);
  const filePath = path.resolve(`./assets/temp/game_savings_${Date.now()}.png`);
  await writeFilePromise(filePath, canvas.toBuffer("image/png"));
  return filePath;
}

export async function createGameMissionImage(data) {
  const activeStyle = getActiveCanvasStyle();
  if (activeStyle !== 1) {
    const { tier: currentTier, nextTier, points } = getGameTierProgress(data.rankPoints);
    const missions = [
      ["HẠNG BẠC", "Mặc định", "Mọi người chơi đều bắt đầu từ hạng Bạc"],
      ["HẠNG VÀNG", "10.000 VNĐ", "Tổng tiền nạp đạt đủ mốc"],
      ["LỤC BẢO", "40.000 VNĐ", "Hạng tăng theo tổng tiền đã nạp"],
      ["KIM CƯƠNG", "100.000 VNĐ", "Chơi game không cộng tiến độ hạng"],
    ];
    return renderCollectionStyle(activeStyle, {
      kicker: "MYBOT • GAME MISSION",
      title: "NHIỆM VỤ LÊN HẠNG",
      subtitle: `${data.playerName || "Người chơi"} • ${currentTier.name} • Đã nạp ${fullNumber(points)} VNĐ`,
      footer: nextTier ? `Còn ${fullNumber(Number(nextTier.min) - points)} VNĐ để lên ${nextTier.name}` : "Đã đạt hạng cao nhất",
      items: missions.map(([title, meta, subtitle], index) => ({ title, subtitle, meta, badge: String(index + 1).padStart(2, "0") })),
    }, "game_mission");
  }
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
    { icon: "🥇", title: "HẠNG VÀNG", reward: "10.000 VNĐ", note: "Tổng tiền nạp đạt đủ mốc" },
    { icon: "💚", title: "LỤC BẢO", reward: "40.000 VNĐ", note: "Hạng chỉ tăng theo tổng tiền đã nạp" },
    { icon: "💎", title: "KIM CƯƠNG", reward: "100.000 VNĐ", note: "Chơi game không cộng tiến độ hạng" },
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
  ctx.fillText("BẠC 0  •  VÀNG 10K  •  BẠCH KIM 20K  •  LỤC BẢO 40K  •  HỒNG NGỌC 70K  •  KIM CƯƠNG 100K", width / 2, 842);

  const filePath = path.resolve(`./assets/temp/game_mission_${Date.now()}.png`);
  await writeFilePromise(filePath, canvas.toBuffer());
  return filePath;
}


function drawLuxuryVIPTierAvatar(ctx, cx, cy, avatarImg, tier, initial = "N") {
  const R_AVATAR = 60;   // Avatar người dùng
  const R_RING1 = 66;    // Vành màu pastel nhạt
  const R_RING2 = 74;    // Vành màu tier phát sáng
  const R_OUTER = 86;    // Vành mảnh bên ngoài

  ctx.save();

  // 1. Ánh sáng hào quang phía sau (Aura)
  const glow = ctx.createRadialGradient(cx, cy, R_AVATAR, cx, cy, R_OUTER + 45);
  glow.addColorStop(0, `${tier.color}44`);
  glow.addColorStop(0.5, `${tier.color}15`);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, R_OUTER + 45, 0, Math.PI * 2);
  ctx.fill();

  // 2. Vành tròn ngoài cùng (Mảnh, thanh lịch)
  ctx.beginPath();
  ctx.arc(cx, cy, R_OUTER, 0, Math.PI * 2);
  ctx.strokeStyle = `${tier.color}66`;
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // 3. Vành đai giữa (Màu tier phát sáng rực rỡ)
  ctx.beginPath();
  ctx.arc(cx, cy, R_RING2, 0, Math.PI * 2);
  ctx.strokeStyle = tier.color;
  ctx.lineWidth = 4;
  ctx.shadowColor = tier.color;
  ctx.shadowBlur = 16;
  ctx.stroke();
  ctx.shadowColor = "transparent";

  // 4. Vành đai trong (Màu sáng pastel làm tôn avatar)
  ctx.beginPath();
  ctx.arc(cx, cy, R_RING1, 0, Math.PI * 2);
  ctx.strokeStyle = `${tier.color}aa`;
  ctx.lineWidth = 5;
  ctx.stroke();

  // 5. Viền chỉ trắng tinh tế sát mép avatar
  ctx.beginPath();
  ctx.arc(cx, cy, R_AVATAR + 1, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 6. Các viên kim cương trang trí quanh vành R_OUTER
  const drawDiamond = (x, y, size, color, glowColor = null) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = color;
    if (glowColor) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 10;
    }
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.restore();
  };

  // 4 Kim cương lớn tại 4 hướng:
  drawDiamond(cx, cy - R_OUTER, 20, tier.color, tier.color); // Đỉnh trên (to nhất)
  drawDiamond(cx, cy - R_OUTER, 9, "#ffffff");               // Lõi trắng trong viên đỉnh trên
  drawDiamond(cx, cy + R_OUTER, 14, tier.color, tier.color); // Đỉnh dưới
  drawDiamond(cx - R_OUTER, cy, 14, tier.color, tier.color); // Đỉnh trái
  drawDiamond(cx + R_OUTER, cy, 14, tier.color, tier.color); // Đỉnh phải

  // 4 Điểm chấm kim cương nhỏ góc 45 độ
  for (let angle = 45; angle < 360; angle += 90) {
    const rad = (angle * Math.PI) / 180;
    const px = cx + Math.cos(rad) * R_OUTER;
    const py = cy + Math.sin(rad) * R_OUTER;
    drawDiamond(px, py, 5, "rgba(255, 255, 255, 0.85)");
  }

  // 7. Lồng ảnh Avatar người chơi vào tâm
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R_AVATAR, 0, Math.PI * 2);
  ctx.fillStyle = "#181b24";
  ctx.fill();
  ctx.clip();

  if (avatarImg) {
    const scale = Math.max((R_AVATAR * 2) / avatarImg.width, (R_AVATAR * 2) / avatarImg.height);
    const aw = avatarImg.width * scale;
    const ah = avatarImg.height * scale;
    ctx.drawImage(avatarImg, cx - aw / 2, cy - ah / 2, aw, ah);
  } else {
    ctx.fillStyle = "#fff8db";
    ctx.font = `bold 60px ${FONT_MAIN}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initial, cx, cy);
  }
  ctx.restore();

  ctx.restore();
}

export async function createVIPTierImage(data) {
  const W = 1280;
  // listStartY(410) + 18×rowH(70)=1260 + gap(20) + footer(80) = 1770 → dùng 1780
  const H = 1780;
  const { tier: currentTier, nextTier } = getGameTierProgress(data.rankPoints);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Nền tổng siêu sang
  ctx.fillStyle = "#0c0d12";
  ctx.fillRect(0, 0, W, H);

  // Gradient huyền ảo nền theo màu tier
  const bgGrad = ctx.createRadialGradient(W * 0.2, H * 0.2, 50, W * 0.2, H * 0.2, W * 0.8);
  bgGrad.addColorStop(0, currentTier.glow || "rgba(80, 40, 120, 0.15)");
  bgGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Background artwork mờ tương ứng hạng
  const bgPath = currentTier.key === "angel"
    ? MY_NHAN_BG_PATH
    : path.resolve(`./assets/resources/game/tiers/backgrounds/${currentTier.key}.jpg`);
  const bgImg = await safeLoadImage(bgPath);
  if (bgImg) {
    ctx.save();
    const scale = Math.max(W / bgImg.width, H / bgImg.height);
    const bgW = bgImg.width * scale;
    const bgH = bgImg.height * scale;
    ctx.globalAlpha = 0.16;
    ctx.drawImage(bgImg, (W - bgW) / 2, (H - bgH) / 2, bgW, bgH);
    ctx.fillStyle = "rgba(4, 8, 15, 0.58)";
    ctx.fillRect(0, 0, W, H);
    // Preserve the complete source composition in the center instead of
    // cropping its subject to fill the tall card.
    const containScale = Math.min((W * 0.96) / bgImg.width, (H * 0.96) / bgImg.height);
    const containW = bgImg.width * containScale;
    const containH = bgImg.height * containScale;
    ctx.globalAlpha = 0.11;
    ctx.drawImage(bgImg, (W - containW) / 2, (H - containH) / 2, containW, containH);
    ctx.restore();
  }

  // Khung viền ngoài cùng sắc nét với 4 góc trang trí
  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 1.5;
  roundedRect(ctx, 30, 30, W - 60, H - 60, 12);
  ctx.stroke();

  // 4 Góc trang trí màu vàng hoàng kim
  const drawCorner = (cx, cy, ox, oy) => {
    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy + oy * 20);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + ox * 20, cy);
    ctx.stroke();
  };
  drawCorner(46, 46, 1, 1);
  drawCorner(W - 46, 46, -1, 1);
  drawCorner(46, H - 46, 1, -1);
  drawCorner(W - 46, H - 46, -1, -1);

  // ===== CỘT TRÁI (LEFT PANEL) =====
  const avatarCenterX = 205;
  const avatarCenterY = 150;
  let avatarImg = data.avatarUrl ? await safeLoadImage(data.avatarUrl) : null;
  const initial = (data.playerName || "N").trim().charAt(0).toUpperCase();

  // Vẽ Khung Avatar Vector Đẳng Cấp theo đúng tone màu Tier
  drawLuxuryVIPTierAvatar(ctx, avatarCenterX, avatarCenterY, avatarImg, currentTier, initial);

  // Hạng thành viên
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
  ctx.font = `bold 18px ${FONT_MAIN}`;
  ctx.fillText("HẠNG THÀNH VIÊN", avatarCenterX, 275);

  // Tên người chơi
  ctx.fillStyle = "#ffffff";
  ctx.font = fitFont(ctx, data.playerName || "Người chơi", 280, 26, 16);
  ctx.fillText(data.playerName || "Người chơi", avatarCenterX, 310);

  // Tên Tier hiện tại
  ctx.fillStyle = currentTier.color;
  ctx.font = `bold 44px ${FONT_MAIN}`;
  ctx.fillText(currentTier.name, avatarCenterX, 390);

  // Có hiệu lực đến (hoặc Vĩnh viễn)
  ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
  ctx.font = `16px ${FONT_MAIN}`;
  ctx.fillText("Có hiệu lực đến", avatarCenterX, 425);
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 18px ${FONT_MAIN}`;
  const expireDate = data.vipExpireAt ? formatDate(data.vipExpireAt).split(" ")[1] : "06/10/2026";
  ctx.fillText(expireDate, avatarCenterX, 450);

  // Ủng hộ trong 30 ngày (quy đổi từ rankPoints hoặc donate)
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.font = `bold 15px ${FONT_MAIN}`;
  ctx.fillText("ỦNG HỘ TRONG 30 NGÀY", avatarCenterX, 510);
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 26px ${FONT_MAIN}`;
  const userDonateVND = Number(data.rankPoints || 0);
  ctx.fillText(fullNumber(userDonateVND) + "đ", avatarCenterX, 545);

  // Ủng hộ thêm lên hạng tiếp theo
  ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
  ctx.font = `14px ${FONT_MAIN}`;
  if (nextTier) {
    const remainVND = Math.max(0, Number(nextTier.min) - userDonateVND);
    ctx.fillText(`Ủng hộ thêm ${fullNumber(remainVND)}đ lên ${nextTier.name}`, avatarCenterX, 605);
  } else {
    ctx.fillText("Đã đạt bậc hạng Tối Cao!", avatarCenterX, 605);
  }

  // Box ĐẶC QUYỀN HÔM NAY (Left rail)
  const dqBoxX = 65;
  const dqBoxY = 720;
  const dqBoxW = 280;
  const dqBoxH = 260;
  ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
  roundedRect(ctx, dqBoxX, dqBoxY, dqBoxW, dqBoxH, 12);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.stroke();

  // Tiêu đề box đặc quyền
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.font = `bold 16px ${FONT_MAIN}`;
  ctx.fillText("ĐẶC QUYỀN HÔM NAY", avatarCenterX, dqBoxY + 30);

  // CHUYỂN ĐI
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.font = `bold 13px ${FONT_MAIN}`;
  ctx.fillText("CHUYỂN ĐI", avatarCenterX, dqBoxY + 70);
  ctx.fillStyle = currentTier.color;
  ctx.font = `bold 24px ${FONT_MAIN}`;
  ctx.fillText(currentTier.sendText || compactMoney(Number(currentTier.sendLimit)), avatarCenterX, dqBoxY + 98);

  // NHẬN VỀ
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.font = `bold 13px ${FONT_MAIN}`;
  ctx.fillText("NHẬN VỀ", avatarCenterX, dqBoxY + 140);
  ctx.fillStyle = currentTier.color;
  ctx.font = `bold 24px ${FONT_MAIN}`;
  ctx.fillText(currentTier.recvText || compactMoney(Number(currentTier.receiveLimit)), avatarCenterX, dqBoxY + 168);

  // QUÀ DAILY
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.font = `bold 13px ${FONT_MAIN}`;
  ctx.fillText("QUÀ DAILY", avatarCenterX, dqBoxY + 210);
  ctx.fillStyle = currentTier.color;
  ctx.font = `bold 24px ${FONT_MAIN}`;
  ctx.fillText(currentTier.dailyText || compactMoney(Number(currentTier.daily)), avatarCenterX, dqBoxY + 238);

  // Đường phân cách dọc
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(375, 45);
  ctx.lineTo(375, H - 90);
  ctx.stroke();

  // ===== CỘT PHẢI (RIGHT PANEL) =====
  const rightX = 395;
  const rightW = W - rightX - 55;

  // HẠN MỨC 24 GIỜ
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 24px ${FONT_MAIN}`;
  ctx.fillText("HẠN MỨC 30 NGÀY", rightX, 82);

  // 4 Thẻ chỉ số (2 hàng x 2 cột)
  const cardGap = 20;
  const cardW = (rightW - cardGap) / 2;
  const cardH = 110;

  const drawMetricCard = (mx, my, label, value, sub = "") => {
    ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
    roundedRect(ctx, mx, my, cardW, cardH, 10);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.09)";
    ctx.stroke();

    // Dấu góc viền mờ
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(mx + 10, my + 20);
    ctx.lineTo(mx + 10, my + 10);
    ctx.lineTo(mx + 20, my + 10);
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    ctx.font = `bold 15px ${FONT_MAIN}`;
    ctx.fillText(label, mx + 24, my + 30);

    ctx.fillStyle = "#ffffff";
    ctx.font = `bold 34px ${FONT_MAIN}`;
    ctx.fillText(value, mx + 24, my + 72);

    if (sub) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.font = `13px ${FONT_MAIN}`;
      ctx.fillText(sub, mx + 24, my + 96);
    }
  };

  // Row 1
  drawMetricCard(rightX, 105, "HẠN MỨC CHUYỂN ĐI", currentTier.sendText || compactMoney(Number(currentTier.sendLimit)), "Đã dùng 0 / " + (currentTier.sendText || compactMoney(Number(currentTier.sendLimit))));
  drawMetricCard(rightX + cardW + cardGap, 105, "HẠN MỨC NHẬN VỀ", currentTier.recvText || compactMoney(Number(currentTier.receiveLimit)), "Đã dùng 0 / " + (currentTier.recvText || compactMoney(Number(currentTier.receiveLimit))));

  // Row 2
  drawMetricCard(rightX, 235, "DAILY", currentTier.dailyText || compactMoney(Number(currentTier.daily)), "");
  drawMetricCard(rightX + cardW + cardGap, 235, "SỐ DƯ", compactMoney(Number(data.balance || 0)), "");

  // CÁC HẠNG THÀNH VIÊN Header
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 22px ${FONT_MAIN}`;
  ctx.fillText("CÁC HẠNG THÀNH VIÊN", rightX, 390);

  // 18 rows of 64px with a 6px gap, sharing the leaderboard finish.
  const listStartY = 410;
  const rowH = 70;
  const rowW = rightW;

  // Match the badge and the creature / emblem inside each rectangular background.
  const badgeMap = {};
  const backgroundMap = {};
  const artworkMap = {};
  const fullCreatureTiers = new Set(["gold_dragon", "huyen_vu", "bach_ho", "con_bang", "thanh_long", "chu_tuoc", "ky_lan"]);
  await Promise.all(TIERS.map(async (t) => {
    [badgeMap[t.key], backgroundMap[t.key], artworkMap[t.key]] = await Promise.all([
      safeLoadImage(path.resolve(`./assets/resources/game/tiers/badges/${t.key}.png`)),
      safeLoadImage(path.resolve(`./assets/resources/game/tiers/backgrounds/${t.key}.jpg`)),
      fullCreatureTiers.has(t.key) ? safeLoadImage(path.resolve(`./assets/resources/game/tiers/artworks/${t.key}.png`)) : null,
    ]);
  }));

  // Layout 3 cột chia đều trên nửa phải
  // Leave a visible artwork area between the tier name and the daily column.
  const colDailyMid = rightX + 365;
  const colSendMid  = rightX + 535;
  const colRecvMid  = rightX + 720;

  for (let i = 0; i < TIERS.length; i++) {
    const t = TIERS[i];
    const y = listStartY + i * rowH;
    const rowH2 = rowH - 6;
    const isCurrent = t.key === currentTier.key;
    const color = getGameTierTextColor(t);

    drawGameTierBackground(ctx, rightX, y, rowW, rowH2, t, {
      radius: 12,
      selected: isCurrent,
      background: artworkMap[t.key] || backgroundMap[t.key],
      backgroundCover: Boolean(artworkMap[t.key]),
    });

    // Badge icon bên trái
    const bImg = badgeMap[t.key];
    if (bImg) {
      ctx.drawImage(bImg, rightX + 12, y + (rowH2 - 46) / 2, 46, 46);
    }

    // Tên Hạng dạng Gradient nổi bật
    ctx.textAlign = "left";
    const nameY = y + 27;
    const nameGrad = ctx.createLinearGradient(rightX + 66, y + 10, rightX + 66, y + 32);
    nameGrad.addColorStop(0, "#ffffff");
    nameGrad.addColorStop(1, color);
    ctx.fillStyle = nameGrad;
    ctx.font = `bold 19px ${FONT_MAIN}`;
    ctx.fillText(t.name.toUpperCase(), rightX + 66, nameY);

    // Mốc donate nhỏ bên dưới
    ctx.fillStyle = "rgba(255, 255, 255, 0.62)";
    ctx.font = `11px ${FONT_MAIN}`;
    ctx.fillText(t.donate || `Ủng hộ ${fullNumber(t.min)}đ`, rightX + 66, y + 47);

    // Ba Cột Thông Số (QUÀ NGÀY / CHUYỂN ĐI / NHẬN VỀ)
    ctx.textAlign = "center";

    // Header labels (màu sắc tinh tế ăn nhập theo tier)
    ctx.font = `bold 11px ${FONT_MAIN}`;
    ctx.fillStyle = isCurrent ? color : "rgba(200, 225, 255, 0.75)";
    ctx.fillText("QUÀ NGÀY", colDailyMid, y + 22);
    ctx.fillText("CHUYỂN ĐI", colSendMid, y + 22);
    ctx.fillText("NHẬN VỀ", colRecvMid, y + 22);

    // Giá trị (Số lớn, màu vàng kim/cam sang trọng)
    const valColor = "#ffd166";
    ctx.font = `bold 18px ${FONT_MAIN}`;
    ctx.fillStyle = valColor;
    ctx.fillText(t.dailyText || compactMoney(Number(t.daily)), colDailyMid, y + 46);
    ctx.fillText(t.sendText || compactMoney(Number(t.sendLimit)), colSendMid, y + 46);

    ctx.fillText(t.recvText || compactMoney(Number(t.receiveLimit)), colRecvMid, y + 43);
    ctx.fillStyle = "rgba(255, 255, 255, 0.62)";
    ctx.font = `10px ${FONT_MAIN}`;
    ctx.fillText(t.extra || "Hạn mức / 30 ngày", colRecvMid, y + 57);
  }

  // Footer
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 20px ${FONT_MAIN}`;
  ctx.fillText("Chúc Bạn 8386 | Mãi Đỉnh Mãi Đỉnh", W / 2 + 100, H - 45);

  // Ký hiệu bài dưới góc trái
  ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
  ctx.font = `bold 24px ${FONT_MAIN}`;
  ctx.fillText("♠", 90, H - 45);
  ctx.fillStyle = "#e63946";
  ctx.fillText("♥", 130, H - 45);
  ctx.fillText("♦", 170, H - 45);
  ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
  ctx.fillText("♣", 210, H - 45);

  const filePath = path.resolve(`./assets/temp/vip_tier_${Date.now()}.png`);
  await writeFilePromise(filePath, canvas.toBuffer("image/png"));
  return filePath;
}
