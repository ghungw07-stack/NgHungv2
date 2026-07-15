import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";
import { createCanvas } from "canvas";
import * as cv from "../../utils/canvas/index.js";
import { sendMessageTag, sendMessageStateQuote } from "../../service-dqt/chat-zalo/chat-style/chat-style.js";
import { removeMention } from "../../utils/format-util.js";
import { getGlobalPrefix } from "../../service-dqt/service.js";
import { deleteFile } from "../../utils/util.js";

const GOLD_TYPES = {
  sjc:  { name: "Vàng SJC",               url: "https://webgia.click/bang-gia-vang-sjc" },
  btmc: { name: "Vàng BẢO TÍN MINH CHÂU", url: "https://webgia.click/gia-vang-btmc" },
  doji: { name: "Vàng Doji",              url: "https://webgia.click/gia-vang-doji" },
  mh:   { name: "Vàng Mi Hồng",           url: "https://webgia.click/gia-vang-mi-hong" },
  phq:  { name: "Vàng Phú Quý",           url: "https://webgia.click/gia-vang-phu-quy" },
  pnj:  { name: "Vàng PNJ",               url: "https://webgia.click/gia-vang-pnj" },
};

const TTL_MESSAGE = 10 * 60 * 1000;

async function fetchGoldPrice(url) {
  const res = await axios.get(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    timeout: 15000,
  });

  const $ = cheerio.load(res.data);
  const prices = [];

  $("table tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length >= 3) {
      prices.push({
        name: $(tds[0]).text().trim(),
        buy:  $(tds[1]).text().trim() || "N/A",
        sell: $(tds[2]).text().trim() || "N/A",
      });
    }
  });

  if (!prices.length) throw new Error("Không tìm thấy dữ liệu");
  return prices;
}

export async function createGoldImage(goldTypeName, prices) {
  const canvasWidth = 1100;
  const rowH = 50;
  const headerH = 70;
  const minCol1 = 400;
  const defaultCol1 = 500;
  const padding = 20;

  // Tạm canvas để đo text
  const tempCanvas = createCanvas(0, 0);
  const tempCtx = tempCanvas.getContext("2d");
  tempCtx.font = "bold 20px Arial";

  let maxTextWidth = 0;
  prices.forEach(p => {
    const w = tempCtx.measureText(p.name).width + padding * 2;
    if (w > maxTextWidth) maxTextWidth = w;
  });

  let col1Width = Math.max(minCol1, Math.min(maxTextWidth, canvasWidth - 2 * 50));
  if (col1Width < defaultCol1) col1Width = defaultCol1;

  const remaining = canvasWidth - col1Width;
  const col2Width = remaining / 2;
  const col3Width = remaining / 2;

  const columns = [
    { name: "Loại vàng", width: col1Width },
    { name: "Mua vào",  width: col2Width },
    { name: "Bán ra",   width: col3Width },
  ];

  const canvasHeight = headerH + rowH * (prices.length + 1);
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");

  // Nền gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
  gradient.addColorStop(0, "rgba(59,130,246,1.0)");
  gradient.addColorStop(1, "rgba(17,24,39,0.8)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Overlay
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Tiêu đề
  ctx.font = "bold 36px Arial";
  ctx.textAlign = "center";
  ctx.fillStyle = cv.getRandomGradient(ctx, canvasWidth);
  ctx.fillText(`BẢNG GIÁ ${goldTypeName.toUpperCase()}`, canvasWidth / 2, 50);

  // Tính vị trí cột
  let xPos = [0];
  for (let i = 0; i < columns.length; i++) xPos.push(xPos[i] + columns[i].width);

  // Header
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(0, headerH, canvasWidth, rowH);
  ctx.font = "bold 22px Arial";
  ctx.textAlign = "center";
  columns.forEach((col, i) => {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(col.name, xPos[i] + col.width / 2, headerH + 33);
  });

  // Rows
  ctx.font = "bold 20px Arial";
  prices.forEach((p, rowIdx) => {
    const y = headerH + rowH * (rowIdx + 1);
    ctx.fillStyle = rowIdx % 2 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
    ctx.fillRect(0, y, canvasWidth, rowH);

    ctx.fillStyle = "#FFD700";
    ctx.textAlign = "left";
    ctx.fillText(p.name, xPos[0] + 10, y + 33);

    ctx.fillStyle = "#90EE90";
    ctx.textAlign = "center";
    ctx.fillText(p.buy, xPos[1] + columns[1].width / 2, y + 33);

    ctx.fillStyle = "#FF8A80";
    ctx.fillText(p.sell, xPos[2] + columns[2].width / 2, y + 33);
  });

  // Grid
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 2;
  for (let i = 0; i <= prices.length + 1; i++) {
    const y = headerH + rowH * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasWidth, y);
    ctx.stroke();
  }
  for (let i = 1; i < xPos.length - 1; i++) {
    ctx.beginPath();
    ctx.moveTo(xPos[i], headerH);
    ctx.lineTo(xPos[i], canvasHeight);
    ctx.stroke();
  }

  const filePath = path.resolve(`./assets/temp/gold_${Date.now()}.png`);
  await fs.promises.writeFile(filePath, canvas.toBuffer("image/png"));
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

  if (!args) {
    return sendMessageStateQuote(
      api,
      message,
      getGoldMenu(prefix, aliasCommand),
      true,
      120000
    );
  }

  const goldType = GOLD_TYPES[args];
  if (!goldType) {
    return sendMessageStateQuote(
      api,
      message,
      `❌ Loại vàng "${args}" không được hỗ trợ.\n${getGoldMenu(prefix, aliasCommand)}`,
      false,
      120000
    );
  }

  try {
    const prices = await fetchGoldPrice(goldType.url);
    const imagePath = await createGoldImage(goldType.name, prices);

    await sendMessageTag(
      api,
      message,
      { caption: `Đây là giá vàng "${goldType.name}" hiện tại`, imagePath },
      TTL_MESSAGE
    );

    await deleteFile(imagePath).catch(err => 
      console.error("Lỗi xóa file sau khi gửi:", err)
    );

  } catch (err) {
    console.error(err);
    return sendMessageStateQuote(
      api,
      message,
      `❌ Không thể lấy giá ${goldType.name}`,
      false,
      120000
    );
  }
}
