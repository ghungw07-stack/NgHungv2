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
];

const KIM_LONG_DRAGON_PATH = path.resolve("./assets/resources/game/kim-long-dragon.png");

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
  drawBackground(ctx, width, height, topTier);

  // Header kiểu bảng tài phú trong ảnh mẫu.
  drawPanel(ctx, 30, 24, 840, 108, topTier, true);
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
  const [avatars, dragonImage] = await Promise.all([
    Promise.all(topTen.map((player) => safeLoadImage(player.avatar))),
    topTen.some((player) => getGameTier(player.rankPoints).key === "gold_dragon") || getGameTier(viewer?.rankPoints).key === "gold_dragon"
      ? safeLoadImage(KIM_LONG_DRAGON_PATH)
      : null,
  ]);
  const rowX = 42;
  const rowWidth = 816;
  const rowHeight = 86;
  const rowGap = 12;
  topTen.forEach((player, index) => {
    const tier = getGameTier(player.rankPoints);
    const y = 154 + index * (rowHeight + rowGap);
    drawPanel(ctx, rowX, y, rowWidth, rowHeight, tier, index < 3 || tier.key === "gold_dragon");

    // Dải màu riêng theo hạng, Kim Long có đầu rồng lớn làm watermark.
    const wash = ctx.createLinearGradient(rowX, y, rowX + rowWidth, y);
    wash.addColorStop(0, `${tier.color}${index < 3 ? "22" : "10"}`);
    wash.addColorStop(0.62, "rgba(0,0,0,0)");
    wash.addColorStop(1, `${tier.color}0d`);
    roundedRect(ctx, rowX, y, rowWidth, rowHeight, 16);
    ctx.fillStyle = wash;
    ctx.fill();
    if (tier.key === "gold_dragon") drawDragonRankBackground(ctx, dragonImage, rowX, y, rowWidth, rowHeight);

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
    ctx.fillText(String(player.rank || index + 1), 82, y + 44);

    drawAvatar(ctx, avatars[index], 143, y + 43, 62, tier.color);
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = fitFont(ctx, player.playerName || "Người chơi", 355, 25, 16);
    ctx.fillText(player.playerName || "Người chơi", 187, y + 30);
    roundedRect(ctx, 187, y + 52, Math.max(112, ctx.measureText(tier.name).width + 42), 23, 7);
    ctx.fillStyle = "rgba(3,6,10,0.72)";
    ctx.fill();
    ctx.fillStyle = tier.color;
    ctx.beginPath(); ctx.arc(198, y + 63, 4, 0, Math.PI * 2); ctx.fill();
    ctx.font = `bold 12px ${FONT_MAIN}`;
    ctx.fillText(tier.key === "gold_dragon" ? `KIM LONG  •  LONG VƯƠNG` : `HẠNG ${tier.name}`, 208, y + 64);

    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,0.48)";
    ctx.font = `bold 11px ${FONT_MAIN}`;
    ctx.fillText("TÀI SẢN", 826, y + 24);
    ctx.fillStyle = tier.color;
    ctx.font = fitFont(ctx, compactMoney(player.balance), 245, 28, 10);
    ctx.fillText(compactMoney(player.balance), 826, y + 57);
  });

  if (topTen.length === 0) {
    drawPanel(ctx, 42, 170, 816, 180, TIERS[0]);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.textAlign = "center";
    ctx.font = `bold 23px ${FONT_MAIN}`;
    ctx.fillText("CHƯA CÓ DỮ LIỆU XẾP HẠNG", width / 2, 260);
  }

  // Vị trí của người gọi lệnh, giống phần cuối ảnh mẫu.
  const viewerY = 1167;
  ctx.strokeStyle = `${(viewer ? getGameTier(viewer.rankPoints) : topTier).color}70`;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(44, viewerY); ctx.lineTo(334, viewerY); ctx.moveTo(566, viewerY); ctx.lineTo(856, viewerY); ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = viewer ? getGameTier(viewer.rankPoints).color : "rgba(255,255,255,0.45)";
  ctx.font = `bold 14px ${FONT_MAIN}`;
  ctx.fillText("VỊ TRÍ CỦA BẠN", width / 2, viewerY);

  if (viewer) {
    const tier = getGameTier(viewer.rankPoints);
    const viewerAvatar = await safeLoadImage(viewer.avatar);
    const y = 1192;
    drawPanel(ctx, 42, y, 816, 92, tier, true);
    if (tier.key === "gold_dragon") drawDragonRankBackground(ctx, dragonImage, 42, y, 816, 92);
    ctx.textAlign = "center";
    ctx.beginPath(); ctx.arc(82, y + 46, 26, 0, Math.PI * 2); ctx.fillStyle = "rgba(3,7,10,0.80)"; ctx.fill();
    ctx.strokeStyle = tier.color; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = tier.color; ctx.font = `bold 16px ${FONT_MAIN}`; ctx.fillText(String(viewer.rank || "–"), 82, y + 47);
    drawAvatar(ctx, viewerAvatar, 145, y + 46, 64, tier.color);
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff"; ctx.font = fitFont(ctx, viewer.playerName || "Người chơi", 360, 24, 16);
    ctx.fillText(viewer.playerName || "Người chơi", 190, y + 33);
    ctx.fillStyle = tier.color; ctx.font = `bold 12px ${FONT_MAIN}`; ctx.fillText(`HẠNG ${tier.name}`, 190, y + 66);
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,0.46)"; ctx.font = `bold 11px ${FONT_MAIN}`; ctx.fillText("TÀI SẢN", 826, y + 30);
    ctx.fillStyle = tier.color; ctx.font = fitFont(ctx, compactMoney(viewer.balance), 245, 27, 10); ctx.fillText(compactMoney(viewer.balance), 826, y + 62);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.font = `bold 11px ${FONT_MAIN}`;
  ctx.fillText("BẠC  •  VÀNG  •  BẠCH KIM  •  KIM CƯƠNG  •  HỒNG NGỌC  •  KIM LONG", width / 2, 1310);

  const filePath = path.resolve(`./assets/temp/game_rank_${Date.now()}.png`);
  await writeFilePromise(filePath, canvas.toBuffer());
  return filePath;
}

export async function createGamePlayerCard(playerInfo) {
  const width = 1080;
  const height = 720;
  const tier = getGameTier(playerInfo.rankPoints);
  const dragonImage = tier.key === "gold_dragon" ? await safeLoadImage(KIM_LONG_DRAGON_PATH) : null;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  drawBackground(ctx, width, height, tier);
  drawPanel(ctx, 36, 36, 1008, 648, tier, true);
  if (tier.key === "gold_dragon") drawDragonArtwork(ctx, dragonImage, 654, 62, 360, 222, 0.18);

  ctx.strokeStyle = `${tier.color}3d`;
  ctx.beginPath();
  ctx.moveTo(336, 36);
  ctx.lineTo(336, 684);
  ctx.stroke();

  const avatar = await safeLoadImage(playerInfo.avatarFull || playerInfo.avatar);
  drawAvatar(ctx, avatar, 186, 158, 148, tier.color);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = tier.color;
  ctx.font = `bold 14px ${FONT_MAIN}`;
  ctx.fillText("THÔNG TIN NGƯỜI CHƠI", 186, 263);
  ctx.fillStyle = "#ffffff";
  ctx.font = fitFont(ctx, playerInfo.playerName || "Người chơi", 260, 27, 18);
  ctx.fillText(playerInfo.playerName || "Người chơi", 186, 304);
  drawTierBadge(ctx, tier, 115, 336, 142, 32);
  ctx.fillStyle = "rgba(255,255,255,0.42)";
  ctx.font = `bold 12px ${FONT_MAIN}`;
  ctx.fillText(`THAM GIA • ${playerInfo.registrationTime || "N/A"}`, 186, 397);
  if (tier.key === "gold_dragon") drawDragonArtwork(ctx, dragonImage, 58, 447, 256, 158, 0.54);
  else {
    ctx.fillStyle = `${tier.color}24`;
    ctx.font = `bold 112px ${FONT_MAIN}`;
    ctx.fillText(tier.name.slice(0, 1), 186, 543);
  }
  ctx.fillStyle = tier.color;
  ctx.font = `bold 14px ${FONT_MAIN}`;
  ctx.fillText(tier.key === "gold_dragon" ? "LONG VƯƠNG TÀI PHÚ" : `HẠNG ${tier.name}`, 186, 636);

  const rightX = 374;
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `bold 15px ${FONT_MAIN}`;
  ctx.fillText("SỐ DƯ", rightX, 82);
  ctx.fillStyle = tier.color;
  const balanceText = compactMoney(playerInfo.balance);
  ctx.font = fitFont(ctx, balanceText, 580, 58, 16);
  ctx.fillText(balanceText, rightX, 137);
  const balanceWidth = ctx.measureText(balanceText).width;
  ctx.font = `bold 18px ${FONT_MAIN}`;
  ctx.fillText("VNĐ", rightX + balanceWidth + 14, 147);

  const profit = new Big(playerInfo.netProfit || 0);
  const profitColor = profit.gte(0) ? "#5ee4b4" : "#ff7185";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `bold 17px ${FONT_MAIN}`;
  ctx.fillText("LỢI NHUẬN", rightX, 205);
  ctx.fillStyle = profitColor;
  const profitText = `${profit.gte(0) ? "▲ +" : "▼ −"}${fullNumber(profit.abs())} VNĐ`;
  ctx.font = fitFont(ctx, profitText, 490, 28, 17);
  ctx.fillText(profitText, rightX + 132, 205);

  const stats = [
    { label: "TỔNG THẮNG", value: fullNumber(playerInfo.totalWinnings), color: "#5ee4b4" },
    { label: "TỔNG THUA", value: fullNumber(new Big(playerInfo.totalLosses || 0).abs()), color: "#ff7185" },
    { label: "TỈ LỆ THẮNG", value: `${playerInfo.winRate || 0}%`, color: tier.color },
    { label: "LƯỢT CHƠI", value: `${playerInfo.totalGames || 0}  •  ${playerInfo.totalWinGames || 0}W`, color: "#ffffff" },
  ];
  stats.forEach((stat, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = rightX + col * 326;
    const y = 244 + row * 142;
    drawPanel(ctx, x, y, 302, 120, tier);
    ctx.fillStyle = "rgba(255,255,255,0.48)";
    ctx.font = `bold 13px ${FONT_MAIN}`;
    ctx.fillText(stat.label, x + 20, y + 30);
    ctx.fillStyle = stat.color;
    ctx.font = fitFont(ctx, stat.value, 262, 27, 16);
    ctx.fillText(stat.value, x + 20, y + 76);
    if (index < 2) {
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.font = `bold 11px ${FONT_MAIN}`;
      ctx.fillText("VNĐ", x + 20, y + 101);
    }
  });

  roundedRect(ctx, rightX, 542, 628, 74, 18);
  ctx.fillStyle = `${tier.color}12`;
  ctx.fill();
  drawLabelValue(ctx, "TỔNG TIỀN ĐÃ NẠP", `${fullNumber(playerInfo.rankPoints)} VNĐ`, rightX + 20, 568, 588, tier, tier.color);
  drawLabelValue(ctx, "MÃ NGƯỜI CHƠI", String(playerInfo.idUser || "N/A"), rightX + 20, 596, 588, tier, "rgba(255,255,255,0.72)");
  ctx.textAlign = "right";
  ctx.fillStyle = tier.color;
  ctx.font = `bold 15px ${FONT_MAIN}`;
  ctx.fillText(tier.key === "gold_dragon" ? "KIM LONG • ĐỈNH CAO TÀI PHÚ" : `${tier.name} • CHINH PHỤC HẠNG TIẾP THEO`, 1002, 650);

  const filePath = path.resolve(`./assets/temp/game_mycard_${Date.now()}.png`);
  await writeFilePromise(filePath, canvas.toBuffer());
  return filePath;
}

export async function createGameBankTransferImage(data) {
  const width = 900;
  const height = 980;
  const tier = getGameTier(data.sender.rankPoints);
  const receiverTier = getGameTier(data.receiver.rankPoints);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  drawBackground(ctx, width, height, tier);
  const [senderAvatar, receiverAvatar] = await Promise.all([
    safeLoadImage(data.sender.avatar),
    safeLoadImage(data.receiver.avatar),
  ]);

  drawPanel(ctx, 22, 20, 856, 940, tier, true);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = tier.color;
  ctx.font = `bold 14px ${FONT_MAIN}`;
  ctx.fillText("GAME BANKING", 52, 54);
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 38px ${FONT_MAIN}`;
  ctx.fillText("BIẾN ĐỘNG SỐ DƯ", 52, 92);
  ctx.fillStyle = "rgba(255,255,255,0.54)";
  ctx.font = `bold 14px ${FONT_MAIN}`;
  ctx.fillText(`GIAO DỊCH THÀNH CÔNG  •  ${formatDate(data.createdAt)}`, 52, 127);

  drawPanel(ctx, 44, 158, 812, 246, tier);
  drawAvatar(ctx, senderAvatar, 113, 223, 92, "#ff7185");
  ctx.fillStyle = "#ff8294";
  ctx.font = `bold 13px ${FONT_MAIN}`;
  ctx.fillText("NGƯỜI CHUYỂN", 176, 195);
  ctx.fillStyle = "#ffffff";
  ctx.font = fitFont(ctx, data.sender.name, 390, 28, 18);
  ctx.fillText(data.sender.name, 176, 229);
  drawTierBadge(ctx, tier, 176, 255, 122, 24);
  drawLabelValue(ctx, "SỐ DƯ TRƯỚC", `${compactMoney(data.sender.balanceBefore)} VNĐ`, 76, 337, 310, tier);
  drawLabelValue(ctx, "SỐ DƯ SAU", `${compactMoney(data.sender.balanceAfter)} VNĐ`, 485, 337, 310, tier, "#ff8294");

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = `bold 14px ${FONT_MAIN}`;
  ctx.fillText("SỐ TIỀN CHUYỂN", 450, 456);
  ctx.fillStyle = tier.color;
  ctx.font = fitFont(ctx, compactMoney(data.amount), 720, 72, 38);
  ctx.fillText(compactMoney(data.amount), 450, 520);
  ctx.fillStyle = "rgba(255,255,255,0.50)";
  ctx.font = `bold 16px ${FONT_MAIN}`;
  ctx.fillText(`${fullNumber(data.amount)} VNĐ`, 450, 570);
  ctx.fillStyle = tier.color;
  ctx.font = `bold 30px ${FONT_MAIN}`;
  ctx.fillText("↓", 450, 620);

  drawPanel(ctx, 44, 660, 812, 246, receiverTier, true);
  drawAvatar(ctx, receiverAvatar, 787, 725, 92, receiverTier.color);
  ctx.textAlign = "right";
  ctx.fillStyle = receiverTier.color;
  ctx.font = `bold 13px ${FONT_MAIN}`;
  ctx.fillText("NGƯỜI NHẬN", 722, 697);
  ctx.fillStyle = "#ffffff";
  ctx.font = fitFont(ctx, data.receiver.name, 390, 28, 18);
  ctx.fillText(data.receiver.name, 722, 731);
  drawTierBadge(ctx, receiverTier, 600, 757, 122, 24);
  drawLabelValue(ctx, "SỐ DƯ TRƯỚC", `${compactMoney(data.receiver.balanceBefore)} VNĐ`, 76, 839, 310, receiverTier);
  drawLabelValue(ctx, "SỐ DƯ SAU", `${compactMoney(data.receiver.balanceAfter)} VNĐ`, 485, 839, 310, receiverTier, receiverTier.color);

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.32)";
  ctx.font = `bold 11px ${FONT_MAIN}`;
  ctx.fillText(`MÃ GIAO DỊCH  •  ${data.referenceCode}`, 450, 936);

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
  const width = 1000;
  const height = 940;
  const { tier } = getGameTierProgress(data.rankPoints);
  const dragonImage = tier.key === "gold_dragon" ? await safeLoadImage(KIM_LONG_DRAGON_PATH) : null;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  
  // Background
  drawBackground(ctx, width, height, tier);
  drawPanel(ctx, 30, 30, width - 60, height - 60, tier, true);
  if (tier.key === "gold_dragon") drawDragonArtwork(ctx, dragonImage, 680, 40, 260, 161, 0.20);

  // TOP SECTION: HẠN MỨC HÔM NAY
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = tier.color;
  ctx.font = `bold 16px ${FONT_MAIN}`;
  ctx.fillText("HẠN MỨC HÔM NAY", 60, 70);
  
  // Hai hộp Hạn mức
  drawPanel(ctx, 60, 100, 420, 100, tier);
  drawPanel(ctx, 520, 100, 420, 100, tier);
  
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = `bold 14px ${FONT_MAIN}`;
  ctx.fillText("HẠN MỨC CHUYỂN ĐI", 90, 130);
  ctx.fillText("HẠN MỨC NHẬN VỀ", 550, 130);
  
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 36px ${FONT_MAIN}`;
  ctx.fillText(compactMoney(Number(tier.sendLimit)), 90, 170);
  ctx.fillText(compactMoney(Number(tier.receiveLimit)), 550, 170);

  // MIDDLE SECTION: HẠNG THÀNH VIÊN
  ctx.fillStyle = tier.color;
  ctx.font = `bold 16px ${FONT_MAIN}`;
  ctx.fillText("HẠNG THÀNH VIÊN", 60, 240);

  drawPanel(ctx, 60, 270, 880, 140, tier);
  
  // Avatar
  let avatarImg = null;
  if (data.avatarUrl) avatarImg = await safeLoadImage(data.avatarUrl);
  
  if (avatarImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(120, 340, 40, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatarImg, 80, 300, 80, 80);
    ctx.restore();
    
    // Viền avatar
    ctx.beginPath();
    ctx.arc(120, 340, 40, 0, Math.PI * 2);
    ctx.strokeStyle = tier.color;
    ctx.lineWidth = 3;
    ctx.stroke();
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.beginPath();
    ctx.arc(120, 340, 40, 0, Math.PI * 2);
    ctx.fill();
  }

  // Tên + Hạng
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 28px ${FONT_MAIN}`;
  ctx.fillText(data.playerName, 180, 320);
  
  drawTierBadge(ctx, tier, 180, 350, 130, 28);
  ctx.fillStyle = tier.color;
  ctx.font = `bold 14px ${FONT_MAIN}`;
  ctx.fillText("Vĩnh Viễn", 325, 364);

  // Stats: Daily, Số dư
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = `bold 14px ${FONT_MAIN}`;
  ctx.textAlign = "right";
  ctx.fillText("DAILY", 650, 320);
  ctx.fillText("SỐ DƯ", 880, 320);

  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 26px ${FONT_MAIN}`;
  ctx.fillText(compactMoney(Number(tier.daily)), 650, 360);
  ctx.fillText(compactMoney(Number(data.balance)), 880, 360);

  // BOTTOM SECTION: CÁC HẠNG THÀNH VIÊN
  ctx.textAlign = "left";
  ctx.fillStyle = tier.color;
  ctx.font = `bold 16px ${FONT_MAIN}`;
  ctx.fillText("CÁC HẠNG THÀNH VIÊN", 60, 450);

  TIERS.forEach((t, i) => {
    const y = 480 + i * 70;
    drawPanel(ctx, 60, y, 880, 56, t);
    
    // Icon badge mini
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.beginPath();
    ctx.arc(90, y + 28, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = t.color;
    ctx.font = `bold 18px ${FONT_MAIN}`;
    ctx.fillText(t.emoji || "🏅", 80, y + 28);
    
    // Tên hạng
    ctx.fillStyle = t.color;
    ctx.font = `bold 18px ${FONT_MAIN}`;
    ctx.fillText(t.name, 120, y + 28);
    
    // Thông số
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = `bold 14px ${FONT_MAIN}`;
    ctx.fillText(`Daily ${compactMoney(Number(t.daily))}  •  Chuyển ${compactMoney(Number(t.sendLimit))}  •  Nhận ${compactMoney(Number(t.receiveLimit))}`, 240, y + 28);

    if (t.key === "diamond") {
      ctx.fillStyle = "#ffcc00";
      ctx.font = `bold 12px ${FONT_MAIN}`;
      ctx.fillText("✨ Sinh lời 6% /ngày", 780, y + 28);
    }

  });

  const filePath = path.resolve(`./assets/temp/vip_tier_${Date.now()}.png`);
  await writeFilePromise(filePath, canvas.toBuffer());
  return filePath;
}
