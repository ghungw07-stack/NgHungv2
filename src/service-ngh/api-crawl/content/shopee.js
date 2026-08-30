import axios from "axios";
import * as cheerio from "cheerio";
import fs from "node:fs/promises";
import path from "node:path";
import { createCanvas } from "canvas";
import { getGlobalPrefix } from "../../service.js";
import { removeMention } from "../../../utils/format-util.js";
import { sendMessageTag } from "../../chat-zalo/chat-style/chat-style.js";

function extractKeyword(api, message, aliasCommand) {
  const prefix = getGlobalPrefix(api.getBotId()) || "";
  let text = String(removeMention(message) || message?.data?.content || "").trim();
  if (prefix && text.startsWith(prefix)) text = text.slice(prefix.length).trim();
  const aliases = [aliasCommand, "shopee", "sp", "muasam"].filter(Boolean);
  const command = aliases.find((value) => text.toLowerCase().startsWith(String(value).toLowerCase()));
  return command ? text.slice(String(command).length).trim() : text;
}

async function searchShopee(keyword, limit = 10) {
  const serpKeys = String(process.env.SERPAPI_KEYS || "").split(",").map((key) => key.trim()).filter(Boolean);
  for (const key of serpKeys) {
    try {
      const serp = await axios.get("https://serpapi.com/search", {
        timeout: 30000,
        params: { engine: "google", q: `site:shopee.vn/product \"${keyword}\"`, gl: "vn", hl: "vi", num: limit, api_key: key },
      });
      const items = (serp.data?.organic_results || []).map((item) => ({
        name: String(item.title || keyword).replace(/\s*[-|].*Shopee.*$/iu, "").trim(),
        link: item.link,
        price: 0,
        displayPrice: item.rich_snippet?.top?.detected_extensions?.price || "Giá xem trên Shopee",
        historical_sold: 0,
      })).filter((item) => item.link && /shopee\.vn/i.test(item.link));
      if (items.length) {
        console.log(`[shopee] SerpAPI trả ${items.length} kết quả`);
        return items.slice(0, limit);
      }
      console.warn(`[shopee] SerpAPI không có kết quả (key #${serpKeys.indexOf(key) + 1})`);
    } catch (error) {
      console.warn(`[shopee] SerpAPI lỗi (key #${serpKeys.indexOf(key) + 1}): ${error?.response?.status || error?.code || error?.message}`);
    }
  }

  const url = `https://shopee.vn/api/v4/search/search_items?by=relevancy&keyword=${encodeURIComponent(keyword)}&limit=${limit}&newest=0&order=desc&page_type=search&scenario=PAGE_GLOBAL_SEARCH&version=2`;
  try {
    const response = await axios.get(url, {
      timeout: 8000,
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
        Referer: `https://shopee.vn/search?keyword=${encodeURIComponent(keyword)}`,
        "x-shopee-language": "vi",
      },
    });
    const items = (response.data?.items || []).map((entry) => entry.item_basic || entry).filter((item) => item?.name);
    if (items.length) return items;
  } catch {}

  // Shopee thường chặn IP máy chủ; dùng chỉ mục Google làm nguồn dự phòng.
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(`site:shopee.vn/product ${keyword}`)}&num=${limit}`;
  const results = [];
  try {
    const google = await axios.get(googleUrl, {
      timeout: 8000,
      headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36" },
    });
    const $ = cheerio.load(google.data);
    $("a").each((_, element) => {
      const href = $(element).attr("href") || "";
      const match = href.match(/https?:\/\/shopee\.vn\/product\/[^&?#\s]+/i);
      if (!match) return;
      const link = match[0];
      const name = $(element).find("h3").first().text().trim() || $(element).text().trim();
      if (name && !results.some((item) => item.link === link)) results.push({ name, link, price: 0, historical_sold: 0 });
    });
  } catch {}
  if (results.length) return results.slice(0, limit);

  // Nguồn dự phòng thứ hai: WebSoSanh thường vẫn truy cập được từ VPS.
  const compareUrl = `https://websosanh.vn/s/${encodeURIComponent(keyword)}.htm`;
  const compare = await axios.get(compareUrl, {
    timeout: 8000,
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36" },
  });
  const compare$ = cheerio.load(compare.data);
  const compareResults = [];
  compare$("li.product-item, .product-item, .list-product .item").each((_, element) => {
    const node = compare$(element);
    const name = node.find(".product-name, h2.title, h3, .name").first().text().replace(/[\r\n\t]+/g, " ").trim();
    if (!name || compareResults.some((item) => item.name === name)) return;
    const price = node.find(".product-price, .price").first().text().replace(/[\r\n\t]+/g, " ").trim();
    compareResults.push({
      name,
      price: 0,
      displayPrice: price || "Giá xem trên WebSoSanh",
      historical_sold: 0,
      link: `https://shopee.vn/search?keyword=${encodeURIComponent(keyword)}`,
    });
  });
  return compareResults.slice(0, limit);
}

async function createShopeeProductsImage(items, keyword) {
  const width = 1400;
  const rowHeight = 108;
  const canvas = createCanvas(width, 180 + Math.max(1, items.length) * rowHeight);
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, width, canvas.height);
  gradient.addColorStop(0, "#fff7ed");
  gradient.addColorStop(1, "#ffedd5");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, canvas.height);
  ctx.fillStyle = "#ee4d2d";
  ctx.fillRect(0, 0, width, 120);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 42px Arial";
  ctx.fillText("SHOPEE - SẢN PHẨM TÌM KIẾM", 45, 72);
  ctx.fillStyle = "#7c2d12";
  ctx.font = "bold 30px Arial";
  ctx.fillText(`Từ khóa: ${keyword}`, 45, 160);
  items.forEach((item, index) => {
    const y = 190 + index * rowHeight;
    ctx.fillStyle = index % 2 ? "rgba(255,255,255,.7)" : "rgba(255,255,255,.95)";
    ctx.fillRect(30, y - 28, width - 60, rowHeight - 10);
    ctx.fillStyle = "#ee4d2d";
    ctx.font = "bold 30px Arial";
    ctx.fillText(`${index + 1}`, 52, y + 12);
    ctx.fillStyle = "#1f2937";
    ctx.font = "bold 25px Arial";
    ctx.fillText(String(item.name).slice(0, 72), 115, y + 2);
    ctx.fillStyle = "#dc2626";
    ctx.font = "bold 24px Arial";
    ctx.fillText(item.displayPrice || (Number(item.price || item.price_min || 0) > 0 ? `${Math.round(Number(item.price || item.price_min) / 100000).toLocaleString("vi-VN")}đ` : "Giá xem trên Shopee"), 115, y + 35);
    ctx.fillStyle = "#6b7280";
    ctx.font = "20px Arial";
    ctx.fillText(`Đã bán ${(item.historical_sold || 0).toLocaleString("vi-VN")}  |  Mở link trong tin nhắn`, 500, y + 35);
  });
  const filePath = path.join(process.cwd(), "temp", `shopee-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, canvas.toBuffer("image/jpeg", { quality: 0.9 }));
  return filePath;
}

export async function handleShopeeCommand(api, message, aliasCommand = "shopee") {
  const prefix = getGlobalPrefix(api.getBotId()) || "";
  const keyword = extractKeyword(api, message, aliasCommand);
  if (!keyword) {
    await api.sendMessage({
      msg: `Dùng: ${prefix}${aliasCommand} <từ khóa>\nVí dụ: ${prefix}${aliasCommand} tai nghe bluetooth`,
      quote: message,
      ttl: 300000,
    }, message.threadId, message.type);
    return true;
  }

  try {
    const items = await searchShopee(keyword);
    const lines = items.slice(0, 10).map((item, index) => {
      const price = item.displayPrice || (Number(item.price || item.price_min || 0) > 0
        ? `${Math.round(Number(item.price || item.price_min) / 100000).toLocaleString("vi-VN")}đ`
        : "Giá xem trên Shopee");
      const link = item.link || (item.shopid && item.itemid
        ? `https://shopee.vn/product/${item.shopid}/${item.itemid}`
        : `https://shopee.vn/search?keyword=${encodeURIComponent(keyword)}`);
      return `${index + 1}. ${String(item.name).replace(/[\r\n]+/g, " ").slice(0, 100)}\n   💰 ${price} | 🔥 Đã bán ${(item.historical_sold || 0).toLocaleString("vi-VN")}\n   🔗 ${link}`;
    });
    const fallback = `https://shopee.vn/search?keyword=${encodeURIComponent(keyword)}`;
    if (items.length) {
      const imagePath = await createShopeeProductsImage(items, keyword);
      try {
        await sendMessageTag(api, message, { caption: `🛒 Kết quả Shopee cho: ${keyword}\n\n${lines.join("\n\n")}\n\n🔎 Chọn link trên ảnh để mua hàng.`, imagePath }, 600000);
      } finally {
        await fs.unlink(imagePath).catch(() => {});
      }
    } else {
      await api.sendMessage({ msg: `Không lấy được dữ liệu sản phẩm.\n🔎 Mở Shopee: ${fallback}`, quote: message, ttl: 300000 }, message.threadId, message.type);
    }
  } catch (error) {
    console.error(`[shopee] ${error?.message || error}`);
    await api.sendMessage({
      msg: `Shopee đang giới hạn truy cập. Mở tìm kiếm trực tiếp:\nhttps://shopee.vn/search?keyword=${encodeURIComponent(keyword)}`,
      quote: message,
      ttl: 300000,
    }, message.threadId, message.type);
  }
  return true;
}
