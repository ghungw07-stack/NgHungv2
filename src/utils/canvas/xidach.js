import fs from "fs";
import path from "path";
import { createCanvas, loadImage } from "canvas";
import { FONT_MAIN, formatCurrency, randomIDTemp } from "../format-util.js";
import { tempDir } from "../io-json.js";

/* ============================================================================
 * Vẽ ảnh cho minigame Xì Dách:
 *  - createXiDachWaitingImage: ảnh bàn đang chờ người chơi
 *  - createXiDachPlayingImage: ảnh bàn khi đang vào ván (tổng quan cả bàn)
 *  - createXiDachHandImage: ảnh bài riêng gửi cho từng người chơi
 *  - createXiDachResultImage: ảnh kết quả ván (nhà cái đấu từng người chơi)
 * ========================================================================== */

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function saveCanvasToFile(canvas, prefix) {
  const outputPath = path.join(tempDir, `${prefix}_${randomIDTemp()}.png`);
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const out = fs.createWriteStream(outputPath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(outputPath));
    out.on("error", reject);
  });
}

function truncateText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && ctx.measureText(result + "…").width > maxWidth) {
    result = result.slice(0, -1);
  }
  return result + "…";
}

const COLORS = {
  feltDark: "#061f18",
  felt: "#0b3b2b",
  feltLight: "#146044",
  gold: "#f3c95b",
  goldDark: "#9c6b18",
  cream: "#fff5d6",
  muted: "#a8c6b8",
  red: "#9e2635",
  panel: "rgba(4, 27, 20, 0.82)",
};

function drawCasinoBackground(ctx, width, height, variant = "green") {
  const isRed = variant === "red";
  const base = ctx.createRadialGradient(width / 2, height * 0.45, 20, width / 2, height / 2, width * 0.72);
  base.addColorStop(0, isRed ? "#641722" : COLORS.feltLight);
  base.addColorStop(0.52, isRed ? "#310910" : COLORS.felt);
  base.addColorStop(1, isRed ? "#120306" : COLORS.feltDark);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  // Hoa văn felt nhẹ, tạo chiều sâu nhưng không làm rối chữ.
  ctx.save();
  ctx.globalAlpha = 0.045;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  for (let x = -height; x < width + height; x += 38) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + height, height);
    ctx.stroke();
  }
  ctx.restore();

  const vignette = ctx.createRadialGradient(width / 2, height / 2, width * 0.25, width / 2, height / 2, width * 0.75);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.48)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function drawFrame(ctx, width, height) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.7)";
  ctx.shadowBlur = 18;
  ctx.strokeStyle = COLORS.goldDark;
  ctx.lineWidth = 10;
  roundRect(ctx, 18, 18, width - 36, height - 36, 30);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = 2;
  roundRect(ctx, 24, 24, width - 48, height - 48, 25);
  ctx.stroke();
  ctx.restore();
}

function drawTitle(ctx, width, title, subtitle) {
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLORS.gold;
  ctx.font = `bold 46px ${FONT_MAIN}`;
  ctx.fillText(title, width / 2, 68);
  ctx.fillStyle = COLORS.muted;
  ctx.font = `bold 20px ${FONT_MAIN}`;
  ctx.fillText(subtitle, width / 2, 103);
  ctx.fillStyle = COLORS.goldDark;
  ctx.fillRect(width / 2 - 150, 121, 300, 2);
  ctx.beginPath();
  ctx.arc(width / 2, 122, 6, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.gold;
  ctx.fill();
}

function drawPill(ctx, cx, y, text, { fill = "#17110d", stroke = COLORS.gold, color = COLORS.gold } = {}) {
  ctx.font = `bold 20px ${FONT_MAIN}`;
  const w = ctx.measureText(text).width + 42;
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  roundRect(ctx, cx - w / 2, y, w, 40, 20);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.fillText(text, cx, y + 27);
  ctx.restore();
  return w;
}

/** Vẽ 1 lá bài đơn giản (góc trên trái + góc dưới phải + ký hiệu chất ở giữa) */
function drawCard(ctx, x, y, w, h, card) {
  const isRed = card.suit === "♥" || card.suit === "♦";
  const color = isRed ? "#c0272d" : "#1a1a1a";

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  const paper = ctx.createLinearGradient(x, y, x + w, y + h);
  paper.addColorStop(0, "#ffffff");
  paper.addColorStop(1, "#eee9df");
  ctx.fillStyle = paper;
  roundRect(ctx, x, y, w, h, 14);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "#d9d9d9";
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 14);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = color;

  // góc trên-trái
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `bold ${Math.round(w * 0.22)}px ${FONT_MAIN}`;
  ctx.fillText(card.rank, x + w * 0.09, y + h * 0.06);
  ctx.font = `bold ${Math.round(w * 0.2)}px ${FONT_MAIN}`;
  ctx.fillText(card.suit, x + w * 0.11, y + h * 0.06 + w * 0.24);

  // ký hiệu chất lớn giữa lá bài
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.round(w * 0.48)}px ${FONT_MAIN}`;
  ctx.globalAlpha = 0.92;
  ctx.fillText(card.suit, x + w / 2, y + h / 2 + h * 0.03);
  ctx.globalAlpha = 1;

  // góc dưới-phải (lộn ngược)
  ctx.save();
  ctx.translate(x + w - w * 0.09, y + h - h * 0.06);
  ctx.rotate(Math.PI);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `bold ${Math.round(w * 0.22)}px ${FONT_MAIN}`;
  ctx.fillText(card.rank, 0, 0);
  ctx.font = `bold ${Math.round(w * 0.2)}px ${FONT_MAIN}`;
  ctx.fillText(card.suit, w * 0.02, w * 0.24);
  ctx.restore();
}

/** Rút gọn số tiền theo kiểu VN: 5.000.000.000 -> "5 Tỷ", 6.500.000.000 -> "6,5 Tỷ" */
function formatCompactVND(amount) {
  let n;
  try {
    n = typeof amount === "number" ? amount : Number(amount?.toString?.() ?? amount ?? 0);
  } catch {
    n = 0;
  }
  if (!Number.isFinite(n)) n = 0;

  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";

  const trim = (v) => {
    const rounded = Math.round(v * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace(".", ",");
  };

  if (abs >= 1_000_000_000) return `${sign}${trim(abs / 1_000_000_000)} Tỷ`;
  if (abs >= 1_000_000) return `${sign}${trim(abs / 1_000_000)} Tr`;
  if (abs >= 1_000) return `${sign}${trim(abs / 1_000)} Ng`;
  return `${sign}${Math.round(abs)}`;
}

/** Vẽ avatar tròn tại (cx, cy) bán kính r; nếu không tải được ảnh thì vẽ chữ cái đầu tên thay thế */
async function drawAvatarCircle(ctx, cx, cy, r, avatarUrl, fallbackLetter) {
  let img = null;
  if (avatarUrl) {
    try {
      img = await loadImage(avatarUrl);
    } catch {
      img = null;
    }
  }

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (img) {
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = "#284a3a";
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = "#d4af37";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${Math.round(r * 0.95)}px ${FONT_MAIN}`;
    ctx.fillText((fallbackLetter || "?").toUpperCase(), cx, cy + 2);
  }
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = "#d4af37";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}


/**
 * @param {object} opts
 * @param {string} opts.tableLabel - vd: "37HA"
 * @param {string} opts.dealerId
 * @param {string} opts.dealerName
 * @param {string|null} [opts.dealerAvatar]
 * @param {import("big.js")|number} [opts.dealerBalance]
 * @param {import("big.js")} opts.betAmount
 * @param {{id:string, name:string, avatar?:string|null, balance?:any}[]} opts.players
 * @param {number} opts.maxPlayers
 */
export async function createXiDachWaitingImage({
  tableLabel,
  dealerId,
  dealerName,
  dealerAvatar,
  dealerBalance,
  betAmount,
  players,
  maxPlayers,
}) {
  const totalSeats = maxPlayers + 1; // + nhà cái
  const seatsPerSide = Math.ceil(totalSeats / 2);

  const width = 1200;
  const seatW = 320;
  const seatH = 92;
  const rowGap = 24;
  const topMargin = 176;
  const bottomMargin = 90;
  const height = topMargin + seatsPerSide * seatH + (seatsPerSide - 1) * rowGap + bottomMargin;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const bannerSub = `BÀN #${tableLabel || "?"} · THẢ ❤️ HOẶC GÕ "VAO ${tableLabel || ""}" ĐỂ VÀO`;
  drawCasinoBackground(ctx, width, height);
  drawFrame(ctx, width, height);
  drawTitle(ctx, width, "♠  XÌ DÁCH  ♥", bannerSub.trim());

  // Ghép danh sách chỗ ngồi: nhà cái luôn ở ghế đầu tiên, sau đó tới người chơi.
  const seatEntities = [
    { id: dealerId, name: dealerName, avatar: dealerAvatar, balance: dealerBalance, isDealer: true },
    ...players,
  ];

  const leftX = 40;
  const rightX = width - 40 - seatW;
  const positions = [];
  for (let i = 0; i < seatsPerSide; i++) positions.push({ x: leftX, y: topMargin + i * (seatH + rowGap) });
  for (let i = 0; i < seatsPerSide; i++) positions.push({ x: rightX, y: topMargin + i * (seatH + rowGap) });

  for (let i = 0; i < positions.length; i++) {
    const { x, y } = positions[i];
    const entity = seatEntities[i] || null;

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.42)";
    ctx.shadowBlur = entity ? 12 : 0;
    ctx.shadowOffsetY = 5;
    ctx.strokeStyle = entity ? "#d4af37" : "#3f6a55";
    ctx.lineWidth = 2;
    ctx.setLineDash(entity ? [] : [6, 5]);
    ctx.fillStyle = entity ? "rgba(30,70,52,0.65)" : "rgba(10,40,28,0.35)";
    roundRect(ctx, x, y, seatW, seatH, 14);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    if (!entity) {
      ctx.fillStyle = "#9db8ab";
      ctx.font = `22px ${FONT_MAIN}`;
      ctx.textAlign = "center";
      ctx.fillText("Trống · thả ❤️", x + seatW / 2, y + seatH / 2 + 8);
      continue;
    }

    const r = seatH / 2 - 14;
    const cx = x + 16 + r;
    const cy = y + seatH / 2;
    await drawAvatarCircle(ctx, cx, cy, r, entity.avatar, entity.name?.[0]);

    const textX = cx + r + 16;
    const maxTextW = x + seatW - 16 - textX;

    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold 22px ${FONT_MAIN}`;
    ctx.fillText(truncateText(ctx, entity.name, maxTextW), textX, y + seatH / 2 - 6);

    ctx.fillStyle = "#f5cf5c";
    ctx.font = `bold 18px ${FONT_MAIN}`;
    const balanceLabel = `${entity.isDealer ? "NHÀ CÁI · " : ""}${formatCompactVND(entity.balance)}`;
    ctx.fillText(balanceLabel, textX, y + seatH / 2 + 20);
  }

  // Khu bàn trung tâm phủ felt sáng, có viền gỗ đỏ và chỉ dẫn chính.
  const tableX = leftX + seatW + 60;
  const tableW = rightX - tableX - 60;
  const tableY = topMargin - 26;
  const tableH = seatsPerSide * seatH + (seatsPerSide - 1) * rowGap + 52;

  ctx.save();
  const tableGrad = ctx.createLinearGradient(tableX, tableY, tableX + tableW, tableY + tableH);
  tableGrad.addColorStop(0, "#0e5139");
  tableGrad.addColorStop(1, "#082d22");
  ctx.fillStyle = tableGrad;
  ctx.shadowColor = "rgba(0,0,0,.55)";
  ctx.shadowBlur = 20;
  ctx.strokeStyle = COLORS.red;
  ctx.lineWidth = 10;
  roundRect(ctx, tableX, tableY, tableW, tableH, 34);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = 2;
  roundRect(ctx, tableX + 10, tableY + 10, tableW - 20, tableH - 20, 26);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "rgba(243,201,91,.12)";
  ctx.beginPath();
  ctx.arc(tableX + tableW / 2, tableY + tableH / 2 - 38, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.gold;
  ctx.font = `bold 52px ${FONT_MAIN}`;
  ctx.fillText("♥", tableX + tableW / 2, tableY + tableH / 2 - 20);
  ctx.font = `bold 27px ${FONT_MAIN}`;
  ctx.textAlign = "center";
  ctx.fillText("THẢ TIM ĐỂ VÀO BÀN", tableX + tableW / 2, tableY + tableH / 2 + 22);

  const betText = `CƯỢC ${formatCurrency(betAmount)}`;
  drawPill(ctx, tableX + tableW / 2, tableY + tableH / 2 + 52, betText);

  ctx.fillStyle = "#8fa89a";
  ctx.font = `20px ${FONT_MAIN}`;
  ctx.textAlign = "center";
  ctx.fillText(
    `${players.length}/${maxPlayers} người chơi · Nhà cái gõ "batdau" khi đủ người`,
    width / 2,
    height - 26
  );

  return saveCanvasToFile(canvas, "xidach_waiting");
}

/* --------------------------- Ảnh bàn (đang chơi) -------------------------- */
/**
 * Bố cục Y HỆT createXiDachWaitingImage (cùng bề rộng, cùng kiểu ghế co giãn theo
 * maxPlayers) để ảnh "đang chơi" nhìn đồng bộ với ảnh "sảnh chờ", thay vì 1 layout
 * khác hoàn toàn với số ghế cố định (trước đây chỉ có đúng 6 ghế, người chơi thứ 7
 * sẽ bị rớt khỏi ảnh — nay đã hỗ trợ đủ số ghế theo maxPlayers).
 *
 * @param {object} opts
 * @param {string} opts.tableLabel - vd: "8920"
 * @param {string} opts.dealerId
 * @param {string} opts.dealerName
 * @param {string|null} [opts.dealerAvatar]
 * @param {{id:string, name:string, avatar?:string|null, cardCount:number}[]} opts.players
 * @param {number} opts.maxPlayers
 * @param {import("big.js")} opts.betAmount
 * @param {string|null} opts.currentTurnId
 * @param {string} opts.centerText
 */
export async function createXiDachPlayingImage({
  tableLabel,
  dealerName,
  dealerId,
  dealerAvatar,
  players,
  maxPlayers,
  betAmount,
  currentTurnId,
  centerText,
}) {
  const totalSeats = (maxPlayers || players.length) + 1; // + nhà cái
  const seatsPerSide = Math.ceil(totalSeats / 2);

  const width = 1200;
  const seatW = 320;
  const seatH = 92;
  const rowGap = 24;
  const topMargin = 176;
  const bottomMargin = 90;
  const height = topMargin + seatsPerSide * seatH + (seatsPerSide - 1) * rowGap + bottomMargin;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  drawCasinoBackground(ctx, width, height);
  drawFrame(ctx, width, height);
  drawTitle(ctx, width, "♠  XÌ DÁCH  ♥", `VÁN #${tableLabel || "?"} · ĐANG DIỄN RA`);

  // Ghép danh sách chỗ ngồi: nhà cái luôn ở ghế đầu tiên, sau đó tới người chơi (giống hệt ảnh sảnh chờ).
  const seatEntities = [
    { id: dealerId, name: dealerName, avatar: dealerAvatar, cardCount: null, isDealer: true },
    ...players,
  ];

  const leftX = 40;
  const rightX = width - 40 - seatW;
  const positions = [];
  for (let i = 0; i < seatsPerSide; i++) positions.push({ x: leftX, y: topMargin + i * (seatH + rowGap) });
  for (let i = 0; i < seatsPerSide; i++) positions.push({ x: rightX, y: topMargin + i * (seatH + rowGap) });

  for (let i = 0; i < positions.length; i++) {
    const { x, y } = positions[i];
    const entity = seatEntities[i] || null;
    const isTurn = entity && entity.id === currentTurnId;

    ctx.save();
    ctx.shadowColor = isTurn ? "rgba(243,201,91,.65)" : "rgba(0,0,0,.4)";
    ctx.shadowBlur = isTurn ? 20 : entity ? 10 : 0;
    ctx.shadowOffsetY = 4;
    ctx.strokeStyle = isTurn ? "#f5cf5c" : entity ? "#d4af37" : "#3f6a55";
    ctx.lineWidth = isTurn ? 3 : 2;
    ctx.setLineDash(entity ? [] : [6, 5]);
    ctx.fillStyle = isTurn ? "rgba(245,207,92,0.22)" : entity ? "rgba(30,70,52,0.65)" : "rgba(10,40,28,0.35)";
    roundRect(ctx, x, y, seatW, seatH, 14);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    if (!entity) {
      ctx.fillStyle = "#9db8ab";
      ctx.font = `22px ${FONT_MAIN}`;
      ctx.textAlign = "center";
      ctx.fillText("Trống", x + seatW / 2, y + seatH / 2 + 8);
      continue;
    }

    if (isTurn) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#1c1310";
      const tagText = "TỚI LƯỢT";
      ctx.font = `bold 16px ${FONT_MAIN}`;
      const tagW = ctx.measureText(tagText).width + 24;
      ctx.save();
      ctx.fillStyle = "#f5cf5c";
      roundRect(ctx, x + seatW / 2 - tagW / 2, y - 16, tagW, 26, 13);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = "#1c1310";
      ctx.fillText(tagText, x + seatW / 2, y - 3);
    }

    const r = seatH / 2 - 14;
    const cx = x + 16 + r;
    const cy = y + seatH / 2;
    await drawAvatarCircle(ctx, cx, cy, r, entity.avatar, entity.name?.[0]);

    const textX = cx + r + 16;
    const maxTextW = x + seatW - 16 - textX;

    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold 22px ${FONT_MAIN}`;
    ctx.fillText(truncateText(ctx, entity.name, maxTextW), textX, y + seatH / 2 - 6);

    ctx.fillStyle = "#f5cf5c";
    ctx.font = `bold 18px ${FONT_MAIN}`;
    const cardLabel = entity.isDealer ? "Nhà cái" : `${entity.cardCount || 0} lá`;
    ctx.fillText(cardLabel, textX, y + seatH / 2 + 20);
  }

  // bàn hình chữ nhật bo góc, viền đôi đỏ + vàng ở giữa (y hệt ảnh sảnh chờ)
  const tableX = leftX + seatW + 60;
  const tableW = rightX - tableX - 60;
  const tableY = topMargin - 26;
  const tableH = seatsPerSide * seatH + (seatsPerSide - 1) * rowGap + 52;

  ctx.save();
  const tableGrad = ctx.createLinearGradient(tableX, tableY, tableX + tableW, tableY + tableH);
  tableGrad.addColorStop(0, "#10563d");
  tableGrad.addColorStop(1, "#072c20");
  ctx.fillStyle = tableGrad;
  ctx.shadowColor = "rgba(0,0,0,.55)";
  ctx.shadowBlur = 20;
  ctx.strokeStyle = COLORS.red;
  ctx.lineWidth = 10;
  roundRect(ctx, tableX, tableY, tableW, tableH, 34);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = 2;
  roundRect(ctx, tableX + 10, tableY + 10, tableW - 20, tableH - 20, 26);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = COLORS.gold;
  ctx.font = `bold 25px ${FONT_MAIN}`;
  ctx.textAlign = "center";
  const rawCenterText = String(centerText || "Đang chơi...").replace(/\s+/g, " ").trim();
  const words = rawCenterText.split(" ");
  const centerLines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > tableW - 52 && line) {
      centerLines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) centerLines.push(line);
  const visibleLines = centerLines.slice(0, 3);
  const centerStartY = tableY + tableH / 2 - 32 - ((visibleLines.length - 1) * 31) / 2;
  visibleLines.forEach((textLine, idx) =>
    ctx.fillText(truncateText(ctx, textLine, tableW - 52), tableX + tableW / 2, centerStartY + idx * 31)
  );

  const betText = `CƯỢC ${formatCurrency(betAmount)}`;
  drawPill(ctx, tableX + tableW / 2, tableY + tableH / 2 + 64, betText);

  return saveCanvasToFile(canvas, "xidach_playing");
}

/* ------------------------------- Ảnh bài riêng ---------------------------- */
/**
 * @param {object} opts
 * @param {string} opts.playerName
 * @param {{rank:string, suit:string}[]} opts.cards
 * @param {string} [opts.badge] - vd: "Tới lượt bạn, có 30 giây."
 */
export async function createXiDachHandImage({ playerName, cards, badge }) {
  const cardW = 168;
  const cardH = 236;
  const gap = 22;
  const cardsWidth = cards.length * cardW + (cards.length - 1) * gap;
  const width = Math.max(700, cardsWidth + 140);
  const height = badge ? 560 : 500;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  drawCasinoBackground(ctx, width, height, "red");
  drawFrame(ctx, width, height);
  drawTitle(ctx, width, "BÀI CỦA BẠN", truncateText(ctx, playerName, width - 80));

  const startX = (width - cardsWidth) / 2;
  const cardY = 145;
  cards.forEach((card, idx) => {
    drawCard(ctx, startX + idx * (cardW + gap), cardY, cardW, cardH, card);
  });

  if (badge) {
    ctx.font = `bold 22px ${FONT_MAIN}`;
    const badgeText = truncateText(ctx, badge, width - 120);
    const badgeW = Math.min(width - 80, ctx.measureText(badgeText).width + 54);
    const badgeY = cardY + cardH + 30;
    ctx.save();
    ctx.fillStyle = "#3a0000";
    ctx.strokeStyle = "#d4af37";
    ctx.lineWidth = 2;
    roundRect(ctx, width / 2 - badgeW / 2, badgeY, badgeW, 46, 23);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f5cf5c";
    ctx.fillText(badgeText, width / 2, badgeY + 30);
    ctx.restore();
  }

  return saveCanvasToFile(canvas, "xidach_hand");
}

/* -------------------------------- Ảnh kết quả ------------------------------ */
/**
 * @param {object} opts
 * @param {string} opts.dealerName
 * @param {{rank:string,suit:string}[]} opts.dealerCards
 * @param {string} opts.dealerLabel - vd: "20 điểm (20)"
 * @param {{name:string, cards:{rank:string,suit:string}[], label:string, outcome:string, isWin:boolean, isDraw:boolean}[]} opts.players
 */
export async function createXiDachResultImage({ dealerName, dealerCards, dealerLabel, players }) {
  const width = 1000;
  const rowH = 118;
  const headerH = 150;
  const height = headerH + rowH + players.length * rowH + 40;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  drawCasinoBackground(ctx, width, height, "red");
  drawFrame(ctx, width, height);
  drawTitle(ctx, width, "KẾT QUẢ XÌ DÁCH", "NHÀ CÁI ĐỐI ĐẦU NGƯỜI CHƠI");

  const smallCardW = 60;
  const smallCardH = 84;

  function drawRow(y, name, tagText, cardsArr, isHeader, outcome) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.35)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = isHeader ? "rgba(212,175,55,0.16)" : "rgba(255,255,255,0.07)";
    roundRect(ctx, 40, y, width - 80, rowH - 16, 14);
    ctx.fill();
    ctx.restore();

    ctx.textAlign = "left";
    ctx.fillStyle = isHeader ? "#f5cf5c" : "#ffffff";
    ctx.font = `bold 24px ${FONT_MAIN}`;
    const label = isHeader ? "◆ NHÀ CÁI" : name;
    ctx.fillText(truncateText(ctx, label, 260), 64, y + 34);

    ctx.fillStyle = "#c7d9cf";
    ctx.font = `18px ${FONT_MAIN}`;
    ctx.fillText(tagText, 64, y + 62);

    if (outcome) {
      let badgeColor = "#f5cf5c";
      if (outcome.toLowerCase().includes("thắng")) badgeColor = "#4fd67d";
      else if (outcome.toLowerCase().includes("thua")) badgeColor = "#e05555";
      ctx.font = `bold 18px ${FONT_MAIN}`;
      const bw = ctx.measureText(outcome).width + 30;
      ctx.save();
      ctx.fillStyle = badgeColor + "33";
      ctx.strokeStyle = badgeColor;
      ctx.lineWidth = 2;
      roundRect(ctx, 64, y + 76, bw, 30, 15);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = badgeColor;
      ctx.textAlign = "left";
      ctx.fillText(outcome, 64 + 15, y + 97);
      ctx.restore();
    }

    // cards nhỏ bên phải, tối đa hiển thị hết
    let cx = width - 60 - smallCardW;
    for (let i = cardsArr.length - 1; i >= 0; i--) {
      drawCard(ctx, cx, y + (rowH - 16 - smallCardH) / 2, smallCardW, smallCardH, cardsArr[i]);
      cx -= smallCardW + 8;
    }
  }

  let y = headerH - 20;
  drawRow(y, dealerName, dealerLabel, dealerCards, true, null);
  y += rowH;

  for (const p of players) {
    drawRow(y, p.name, p.label, p.cards, false, p.outcome);
    y += rowH;
  }

  return saveCanvasToFile(canvas, "xidach_result");
}
