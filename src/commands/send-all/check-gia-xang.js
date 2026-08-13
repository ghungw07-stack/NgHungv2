import axios from "axios";
import fs from "fs";
import path from "path";
import { createCanvas } from "canvas";
import { sendMessageStateQuote, sendMessageTag } from "../../service-ngh/chat-zalo/chat-style/chat-style.js";
import { deleteFile } from "../../utils/util.js";
import { parseFuelPriceHtml } from "../../utils/market-price-parser.js";

const SOURCES = [
  "https://webgia.vn/",
  "https://webgia.tv/xang-dau",
  "https://giaxangdau.vn/",
];
const TTL_MESSAGE = 10 * 60 * 1000;

export async function fetchFuelPrices() {
  const errors = [];
  for (const url of SOURCES) {
    try {
      const response = await axios.get(url, {
        timeout: 15_000,
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36" },
      });
      const prices = parseFuelPriceHtml(response.data);
      if (prices.length) return { prices, source: new URL(url).hostname };
    } catch (error) {
      errors.push(`${new URL(url).hostname}: ${error.code || error.response?.status || error.message}`);
    }
  }
  throw new Error(errors.join("; ") || "Không tìm thấy dữ liệu giá xăng dầu");
}

export async function createFuelPriceImage(prices, source, updatedAt = new Date()) {
  const width = 1100;
  const headerHeight = 190;
  const rowHeight = 76;
  const height = headerHeight + 72 + prices.length * rowHeight + 70;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#071a2f");
  gradient.addColorStop(0.55, "#0b3551");
  gradient.addColorStop(1, "#0c5b55");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#5eead4";
  ctx.font = "bold 44px Arial";
  ctx.textAlign = "center";
  ctx.fillText("BẢNG GIÁ XĂNG DẦU", width / 2, 70);
  ctx.fillStyle = "#d8f3f0";
  ctx.font = "22px Arial";
  ctx.fillText(`Cập nhật ${updatedAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`, width / 2, 112);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "18px Arial";
  ctx.fillText(`Nguồn tổng hợp: ${source} · Đơn vị: đồng/lít (trừ khi ghi khác)`, width / 2, 148);

  const columns = [40, 650, 855, 1060];
  ctx.fillStyle = "rgba(45, 212, 191, 0.18)";
  ctx.fillRect(40, headerHeight, 1020, 58);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 21px Arial";
  ctx.textAlign = "left";
  ctx.fillText("SẢN PHẨM", 62, headerHeight + 38);
  ctx.textAlign = "center";
  ctx.fillText("VÙNG 1", 752, headerHeight + 38);
  ctx.fillText("VÙNG 2", 957, headerHeight + 38);

  prices.forEach((price, index) => {
    const y = headerHeight + 58 + index * rowHeight;
    ctx.fillStyle = index % 2 ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.075)";
    ctx.fillRect(40, y, 1020, rowHeight);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 21px Arial";
    ctx.textAlign = "left";
    const label = price.name.length > 47 ? `${price.name.slice(0, 46)}…` : price.name;
    ctx.fillText(label, 62, y + 47);
    ctx.fillStyle = "#86efac";
    ctx.textAlign = "center";
    ctx.fillText(price.region1, 752, y + 47);
    ctx.fillStyle = "#fbbf24";
    ctx.fillText(price.region2, 957, y + 47);
  });

  ctx.strokeStyle = "rgba(148,163,184,0.25)";
  for (const x of columns) {
    ctx.beginPath(); ctx.moveTo(x, headerHeight); ctx.lineTo(x, height - 70); ctx.stroke();
  }
  ctx.fillStyle = "#94a3b8";
  ctx.font = "17px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Giá thực tế có thể chênh lệch theo địa bàn và đơn vị bán lẻ.", width / 2, height - 27);

  const filePath = path.resolve(`./assets/temp/fuel_${Date.now()}.jpg`);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, canvas.toBuffer("image/jpeg", { quality: 0.86 }));
  return filePath;
}

export async function handleCheckGiaXangCommand(api, message) {
  let imagePath;
  try {
    const { prices, source } = await fetchFuelPrices();
    imagePath = await createFuelPriceImage(prices, source);
    await sendMessageTag(api, message, { caption: "Bảng giá xăng dầu mới nhất", imagePath }, TTL_MESSAGE);
  } catch (error) {
    console.error("Lỗi lấy giá xăng dầu:", error);
    await sendMessageStateQuote(api, message, "❌ Không thể lấy bảng giá xăng dầu lúc này.", false, 120000);
  } finally {
    if (imagePath) await deleteFile(imagePath).catch(() => {});
  }
}
