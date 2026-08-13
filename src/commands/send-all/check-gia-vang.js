import axios from "axios";
import fs from "fs";
import path from "path";
import { createCanvas } from "canvas";
import { sendMessageTag, sendMessageStateQuote } from "../../service-dqt/chat-zalo/chat-style/chat-style.js";
import { removeMention } from "../../utils/format-util.js";
import { getGlobalPrefix } from "../../service-dqt/service.js";
import { deleteFile } from "../../utils/util.js";
import { parseGoldPriceHtml } from "../../utils/market-price-parser.js";

const GOLD_TYPES = {
  sjc:  { name: "Vàng SJC", keywords: ["sjc"] },
  btmc: { name: "Vàng BẢO TÍN MINH CHÂU", keywords: ["bảo tín", "btmc", "rồng thăng long"] },
  doji: { name: "Vàng DOJI", keywords: ["doji", "hưng thịnh vượng"] },
  mh:   { name: "Vàng Mi Hồng", keywords: ["mi hồng"] },
  phq:  { name: "Vàng Phú Quý", keywords: ["phú quý"] },
  pnj:  { name: "Vàng PNJ", keywords: ["pnj"] },
};
const GOLD_SOURCES = ["https://webgia.vn/", "https://giavang.org/"];

const TTL_MESSAGE = 10 * 60 * 1000;

async function fetchGoldSource(url) {
  const res = await axios.get(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    timeout: 15000,
  });

  const prices = parseGoldPriceHtml(res.data);

  if (!prices.length) throw new Error("Không tìm thấy dữ liệu");
  return prices;
}

export async function fetchGoldOverview() {
  const errors = [];
  for (const url of GOLD_SOURCES) {
    try {
      const prices = await fetchGoldSource(url);
      if (prices.length) return prices;
    } catch (error) {
      errors.push(`${new URL(url).hostname}: ${error.code || error.message}`);
    }
  }
  throw new Error(`Không lấy được nguồn giá vàng: ${errors.join("; ")}`);
}

function shortenText(ctx, text, maxWidth) {
  const value = String(text || "");
  if (ctx.measureText(value).width <= maxWidth) return value;
  let shortened = value;
  while (shortened.length > 1 && ctx.measureText(`${shortened}…`).width > maxWidth) shortened = shortened.slice(0, -1);
  return `${shortened}…`;
}

function formatPrice(value) {
  return String(value || "—").replace(/\s*(?:₫|đ|VNĐ).*$/iu, "").trim();
}

export async function createGoldImage(goldTypeName, prices, updatedAt = new Date()) {
  const canvasWidth = 1200;
  const rowH = 74;
  const heroH = 218;
  const tableHeaderH = 62;
  const footerH = 76;
  const visiblePrices = prices.slice(0, 16);
  const canvasHeight = heroH + tableHeaderH + rowH * visiblePrices.length + footerH;
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, canvasWidth, canvasHeight);
  gradient.addColorStop(0, "#1b1305");
  gradient.addColorStop(0.48, "#3b2708");
  gradient.addColorStop(1, "#111827");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const glow = ctx.createRadialGradient(980, 35, 20, 980, 35, 380);
  glow.addColorStop(0, "rgba(250,204,21,0.30)");
  glow.addColorStop(1, "rgba(250,204,21,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(600, 0, 600, 430);

  ctx.fillStyle = "#facc15";
  ctx.font = "bold 24px Arial";
  ctx.textAlign = "left";
  ctx.fillText("THỊ TRƯỜNG · VIỆT NAM", 58, 55);
  ctx.fillStyle = "#fff7d6";
  ctx.font = "bold 48px Arial";
  ctx.fillText(shortenText(ctx, `BẢNG GIÁ ${goldTypeName.toUpperCase()}`, 1080), 58, 116);
  ctx.fillStyle = "#d6c69a";
  ctx.font = "22px Arial";
  ctx.fillText(`Cập nhật ${updatedAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`, 58, 158);
  ctx.fillText("Đơn vị theo niêm yết của nguồn · Giá chỉ mang tính tham khảo", 58, 192);

  const colX = [40, 720, 940, 1160];
  ctx.fillStyle = "rgba(250,204,21,0.16)";
  ctx.fillRect(40, heroH, 1120, tableHeaderH);
  ctx.fillStyle = "#fef3c7";
  ctx.font = "bold 21px Arial";
  ctx.textAlign = "left";
  ctx.fillText("SẢN PHẨM / THƯƠNG HIỆU", 66, heroH + 40);
  ctx.textAlign = "center";
  ctx.fillText("MUA VÀO", 830, heroH + 40);
  ctx.fillText("BÁN RA", 1050, heroH + 40);

  visiblePrices.forEach((price, index) => {
    const y = heroH + tableHeaderH + index * rowH;
    ctx.fillStyle = index % 2 ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.075)";
    ctx.fillRect(40, y, 1120, rowH);
    ctx.fillStyle = "#fde68a";
    ctx.font = "bold 20px Arial";
    ctx.textAlign = "left";
    ctx.fillText(shortenText(ctx, price.name, 620), 66, y + 46);
    ctx.fillStyle = "#86efac";
    ctx.font = "bold 22px Arial";
    ctx.textAlign = "center";
    ctx.fillText(formatPrice(price.buy), 830, y + 46);
    ctx.fillStyle = "#fbbf24";
    ctx.fillText(formatPrice(price.sell), 1050, y + 46);
  });

  ctx.strokeStyle = "rgba(251,191,36,0.24)";
  ctx.lineWidth = 1;
  for (const x of colX) {
    ctx.beginPath(); ctx.moveTo(x, heroH); ctx.lineTo(x, canvasHeight - footerH); ctx.stroke();
  }
  ctx.fillStyle = "#a99b79";
  ctx.font = "18px Arial";
  ctx.textAlign = "center";
  ctx.fillText(`Hiển thị ${visiblePrices.length}/${prices.length} sản phẩm · Nguồn tổng hợp thị trường`, canvasWidth / 2, canvasHeight - 30);

  const filePath = path.resolve(`./assets/temp/gold_${Date.now()}.jpg`);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, canvas.toBuffer("image/jpeg", { quality: 0.86 }));
  return filePath;
}

function getGoldMenu(prefix, aliasCommand) {
  const list = Object.entries(GOLD_TYPES)
    .map(([key, val]) => `• ${key} - ${val.name}`)
    .join("\n");
  return `Hãy nhập loại vàng bạn muốn xem:\n${list}\nVí dụ: ${prefix}${aliasCommand} sjc`;
}

export async function handleCheckGiaVangCommand(api, message, aliasCommand) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const args = content.replace(`${prefix}${aliasCommand}`, "").trim().toLowerCase();

  const goldType = args ? GOLD_TYPES[args] : null;
  if (args && !goldType) {
    return sendMessageStateQuote(
      api,
      message,
      `❌ Loại vàng "${args}" không được hỗ trợ.\n${getGoldMenu(prefix, aliasCommand)}`,
      false,
      120000
    );
  }

  let imagePath;
  try {
    const overview = await fetchGoldOverview();
    const prices = goldType
      ? overview.filter((price) => goldType.keywords.some((keyword) => price.name.toLowerCase().includes(keyword)))
      : overview;
    if (!prices.length) throw new Error(`Nguồn hiện tại chưa có dữ liệu ${goldType.name}`);
    const title = goldType ? goldType.name : "Vàng tổng hợp thị trường";
    imagePath = await createGoldImage(title, prices);

    await sendMessageTag(
      api,
      message,
      { caption: `Bảng giá ${title.toLowerCase()} hiện tại`, imagePath },
      TTL_MESSAGE
    );
  } catch (err) {
    console.error(err);
    return sendMessageStateQuote(
      api,
      message,
      `❌ Không thể lấy ${goldType ? `giá ${goldType.name}` : "bảng giá vàng tổng hợp"}`,
      false,
      120000
    );
  } finally {
    if (imagePath) await deleteFile(imagePath).catch(() => {});
  }
}
