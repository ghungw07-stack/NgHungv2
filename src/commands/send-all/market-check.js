import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";
import { createCanvas } from "canvas";
import * as cv from "../../utils/canvas/index.js";
import { sendMessageTag, sendMessageStateQuote } from "../../service-ngh/chat-zalo/chat-style/chat-style.js";
import { deleteFile } from "../../utils/util.js";
import { launchBrowser } from "../../service-ngh/utilities/browser-launch.js";

const TTL = 10 * 60 * 1000;
const UA  = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

// ─── Helper: lưu canvas ────────────────────────────────────────────────────
async function saveCanvas(canvas, prefix) {
  const dir = path.resolve("./assets/temp");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${prefix}_${Date.now()}.png`);
  await fs.promises.writeFile(filePath, canvas.toBuffer("image/png"));
  return filePath;
}

// ─── Helper: rounded rectangle ─────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  if (typeof r === "number") r = { tl: r, tr: r, br: r, bl: r };
  ctx.beginPath();
  ctx.moveTo(x + r.tl, y);
  ctx.lineTo(x + w - r.tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r.tr);
  ctx.lineTo(x + w, y + h - r.br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
  ctx.lineTo(x + r.bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r.bl);
  ctx.lineTo(x, y + r.tl);
  ctx.quadraticCurveTo(x, y, x + r.tl, y);
  ctx.closePath();
}

// ─── Helper: tạo canvas với nền gradient hiện đại + decoration ─────────────
function makeCanvas(width, height, c0, c1) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Nền gradient chính (đậm xuống nhạt)
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, c0);
  bg.addColorStop(1, c1);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Overlay tối nhẹ để text nổi hơn
  ctx.fillStyle = "rgba(15, 20, 35, 0.55)";
  ctx.fillRect(0, 0, width, height);

  // Confetti decoration — chấm li ti rải đều
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const r = Math.random() * 2 + 0.5;
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.22 + 0.05})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Viền nhẹ
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, width, height);

  return { canvas, ctx };
}

// ─── Helper: vẽ bảng dạng card đẹp (rounded, gradient header, zebra rows) ──
function drawTable(ctx, { title, columns, rows, startY, canvasWidth, rowH }) {
  const PADDING = 20;
  const HEADER_HEIGHT = rowH + 6;
  const tableX = PADDING;
  const tableW = canvasWidth - PADDING * 2;
  const totalRows = rows.length;
  const tableH = HEADER_HEIGHT + rowH * totalRows;

  // ── Tiêu đề chính ─────────────────────────────────────────────
  if (title) {
    ctx.font = "bold 36px Arial";
    ctx.textAlign = "center";
    // Gradient title (vàng → cam → hồng)
    const titleGrad = ctx.createLinearGradient(canvasWidth / 2 - 250, 0, canvasWidth / 2 + 250, 0);
    titleGrad.addColorStop(0, "#FFD700");
    titleGrad.addColorStop(0.5, "#FFA500");
    titleGrad.addColorStop(1, "#FF6B9D");
    ctx.shadowColor = "rgba(255, 215, 0, 0.5)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = titleGrad;
    ctx.fillText(title, canvasWidth / 2, startY - 24);
    ctx.shadowBlur = 0;
  }

  // ── Card background với rounded corners ────────────────────────
  ctx.fillStyle = "rgba(15, 25, 50, 0.55)";
  roundRect(ctx, tableX, startY, tableW, tableH, 16);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Tính xPos
  const totalWidth = columns.reduce((s, c) => s + c.width, 0);
  const scale = tableW / totalWidth;
  const xPos = [tableX];
  for (const col of columns) xPos.push(xPos[xPos.length - 1] + col.width * scale);

  // ── Header row gradient ────────────────────────────────────────
  const headerGrad = ctx.createLinearGradient(tableX, startY, tableX + tableW, startY);
  headerGrad.addColorStop(0, "rgba(99, 102, 241, 0.95)");
  headerGrad.addColorStop(0.5, "rgba(168, 85, 247, 0.95)");
  headerGrad.addColorStop(1, "rgba(236, 72, 153, 0.95)");
  ctx.save();
  roundRect(ctx, tableX, startY, tableW, HEADER_HEIGHT, { tl: 16, tr: 16, bl: 0, br: 0 });
  ctx.clip();
  ctx.fillStyle = headerGrad;
  ctx.fillRect(tableX, startY, tableW, HEADER_HEIGHT);
  ctx.restore();

  ctx.font = "bold 19px Arial";
  ctx.textAlign = "center";
  columns.forEach((col, i) => {
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 3;
    ctx.fillStyle = "#FFFFFF";
    const cx = xPos[i] + (xPos[i + 1] - xPos[i]) / 2;
    ctx.fillText(col.name, cx, startY + HEADER_HEIGHT / 2 + 7);
    ctx.shadowBlur = 0;
  });

  // ── Data rows với zebra striping ───────────────────────────────
  rows.forEach((cells, idx) => {
    const y = startY + HEADER_HEIGHT + rowH * idx;
    // Zebra bg
    ctx.fillStyle = idx % 2 ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.20)";
    if (idx === rows.length - 1) {
      // Last row có rounded bottom
      ctx.save();
      roundRect(ctx, tableX, y, tableW, rowH, { tl: 0, tr: 0, bl: 16, br: 16 });
      ctx.clip();
      ctx.fillRect(tableX, y, tableW, rowH);
      ctx.restore();
    } else {
      ctx.fillRect(tableX, y, tableW, rowH);
    }
    // Cells
    cells.forEach((cell, ci) => {
      ctx.font = cell.font || "bold 17px Arial";
      ctx.fillStyle = cell.color || "#FFFFFF";
      ctx.textAlign = cell.align || "center";
      const cx = cell.align === "left"
        ? xPos[ci] + 12
        : xPos[ci] + (xPos[ci + 1] - xPos[ci]) / 2;
      ctx.shadowColor = "rgba(0,0,0,0.4)";
      ctx.shadowBlur = 2;
      ctx.fillText(cell.text, cx, y + rowH / 2 + 6);
      ctx.shadowBlur = 0;
    });
  });

  // ── Grid lines (mảnh và mờ) ────────────────────────────────────
  ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
  ctx.lineWidth = 1;
  // Horizontal lines giữa các row data (skip viền ngoài)
  for (let i = 1; i < totalRows; i++) {
    const y = startY + HEADER_HEIGHT + rowH * i;
    ctx.beginPath();
    ctx.moveTo(tableX + 6, y);
    ctx.lineTo(tableX + tableW - 6, y);
    ctx.stroke();
  }
  // Vertical lines giữa columns (skip viền ngoài)
  for (let i = 1; i < xPos.length - 1; i++) {
    ctx.beginPath();
    ctx.moveTo(xPos[i], startY + 4);
    ctx.lineTo(xPos[i], startY + tableH - 4);
    ctx.stroke();
  }

  return startY + tableH;
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. GIÁ VÀNG
// ══════════════════════════════════════════════════════════════════════════════
const GOLD_SOURCES = [
  { brand: "SJC",               url: "https://webgia.click/bang-gia-vang-sjc"  },
  { brand: "DOJI",              url: "https://webgia.click/gia-vang-doji"       },
  { brand: "PNJ",               url: "https://webgia.click/gia-vang-pnj"        },
  { brand: "BẢO TÍN MINH CHÂU", url: "https://webgia.click/gia-vang-btmc"      },
  { brand: "PHÚ QUÝ",          url: "https://webgia.click/gia-vang-phu-quy"   },
  { brand: "MI HỒNG",          url: "https://webgia.click/gia-vang-mi-hong"   },
];

async function fetchOneBrand(source) {
  try {
    const res = await axios.get(source.url, { headers: { "User-Agent": UA }, timeout: 15000 });
    const $ = cheerio.load(res.data);
    const rows = [];
    $("table tr").each((_, tr) => {
      const tds = $(tr).find("td");
      if (tds.length >= 3) {
        const name = $(tds[0]).text().trim();
        if (name) rows.push({ name, buy: $(tds[1]).text().trim() || "N/A", sell: $(tds[2]).text().trim() || "N/A", brand: source.brand });
      }
    });
    return rows;
  } catch { return []; }
}

async function fetchAllGoldPrices() {
  const all = (await Promise.all(GOLD_SOURCES.map(fetchOneBrand))).flat();
  if (!all.length) throw new Error("Không tìm thấy dữ liệu giá vàng");
  return all;
}

export async function handleCheckGiaVangCommand(api, message) {
  try {
    const prices = await fetchAllGoldPrices();
    const W = 1200, rowH = 48, headerH = 75;
    const [c1W, c2W, c3W, c4W] = [420, 200, 290, 290];
    const { canvas, ctx } = makeCanvas(W, headerH + rowH * (prices.length + 1) + 10, "rgba(146,100,0,1)", "rgba(17,24,39,0.95)");
    const rows = prices.map(p => [
      { text: p.name,  color: "#FFD700", align: "left"   },
      { text: p.brand, color: "#E0E0E0"                   },
      { text: p.buy,   color: "#90EE90"                   },
      { text: p.sell,  color: "#FF8A80"                   },
    ]);
    drawTable(ctx, {
      title: "BẢNG GIÁ VÀNG TỔNG HỢP",
      columns: [{ name: "Loại vàng", width: c1W }, { name: "Thương hiệu", width: c2W }, { name: "Mua vào", width: c3W }, { name: "Bán ra", width: c4W }],
      rows, startY: headerH, canvasWidth: W, rowH,
    });
    const imagePath = await saveCanvas(canvas, "gold");
    await sendMessageTag(api, message, { caption: "Đây là bảng giá vàng tổng hợp các thương hiệu hiện tại", imagePath }, TTL);
    await deleteFile(imagePath).catch(() => {});
  } catch (err) {
    console.error(err);
    return sendMessageStateQuote(api, message, "❌ Không thể lấy giá vàng hiện tại", false, 120000);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. GIÁ XĂNG DẦU
// Đa nguồn fallback: Petrolimex JSON API → vnexpress → vietnamnet
// ══════════════════════════════════════════════════════════════════════════════
async function fetchFuelPrice() {
  // Source 1: Petrolimex Puppeteer (canonical, ưu tiên đầu — user trỏ vào URL này)
  try {
    const browser = await launchBrowser();
    const page = await browser.newPage();
    try {
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      );
      await page.goto("https://www.petrolimex.com.vn/", { waitUntil: "networkidle2", timeout: 35000 });
      await page.waitForSelector("table tr td", { timeout: 20000 }).catch(() => {});
      const prices = await page.evaluate(() => {
        const tables = Array.from(document.querySelectorAll("table"));
        let best = [];
        for (const t of tables) {
          const rows = [];
          t.querySelectorAll("tr").forEach((tr) => {
            const tds = tr.querySelectorAll("td");
            if (tds.length < 2) return;
            const name = tds[0].textContent.trim();
            const p1 = tds[1].textContent.trim();
            if (name && /\d/.test(p1) && !/^\s*\d+\s*$/.test(name) && name.length < 80) {
              rows.push({
                name,
                zone1: p1,
                zone2: tds.length >= 3 ? tds[2].textContent.trim() || "N/A" : "N/A",
              });
            }
          });
          if (rows.length > best.length) best = rows;
        }
        return best;
      });
      await page.close().catch(() => {});
      if (prices.length >= 2) return prices;
    } finally {
      await page.close().catch(() => {});
    }
  } catch (e) {
    console.warn("[giaxang] petrolimex Puppeteer fail:", e?.message || e);
  }

  // Source 2: Petrolimex JSON API (axios)
  try {
    const res = await axios.get(
      "https://www.petrolimex.com.vn/api/Petrolimex/GetListProductPriceCurrent",
      {
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          Referer: "https://www.petrolimex.com.vn/",
          "X-Requested-With": "XMLHttpRequest",
        },
        timeout: 15000,
      },
    );
    const data = res.data;
    let arr = [];
    if (Array.isArray(data)) arr = data;
    else if (Array.isArray(data?.data)) arr = data.data;
    else if (Array.isArray(data?.result)) arr = data.result;
    else if (Array.isArray(data?.products)) arr = data.products;

    if (arr.length) {
      const out = arr.map((p) => {
        const name = p.productName || p.name || p.ProductName || p.title || "Sản phẩm";
        const p1 = p.priceZone1 || p.zone1 || p.PriceZone1 || p.price1 || p.price || "N/A";
        const p2 = p.priceZone2 || p.zone2 || p.PriceZone2 || p.price2 || "N/A";
        const fmt = (v) => (typeof v === "number" ? v.toLocaleString("vi-VN") : String(v));
        return { name: String(name).trim(), zone1: fmt(p1), zone2: fmt(p2) };
      }).filter((x) => x.name && /\d/.test(x.zone1));
      if (out.length) return out;
    }
  } catch (e) {
    console.warn("[giaxang] petrolimex API fail:", e?.message || e);
  }

  // Source 3: vnexpress trang giá xăng — kèm full browser headers chống 406
  try {
    const res = await axios.get("https://vnexpress.net/giaxang-dau", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
        Referer: "https://vnexpress.net/",
        "Upgrade-Insecure-Requests": "1",
      },
      timeout: 15000,
    });
    const $ = cheerio.load(res.data);
    const out = [];
    $("table tr").each((_, tr) => {
      const tds = $(tr).find("td");
      if (tds.length < 2) return;
      const name = $(tds[0]).text().trim();
      const p1 = $(tds[1]).text().replace(/[ \s]+/g, " ").trim();
      if (name && /\d/.test(p1) && name.length < 80 && !/giá|tên|sản phẩm/i.test(name)) {
        out.push({
          name,
          zone1: p1,
          zone2: tds.length >= 3 ? $(tds[2]).text().trim() || "N/A" : "N/A",
        });
      }
    });
    if (out.length >= 2) return out;
  } catch (e) {
    console.warn("[giaxang] vnexpress fail:", e?.message || e);
  }

  // Source 3: petroltimes.vn (trang chuyên giá xăng dầu)
  try {
    const res = await axios.get("https://petroltimes.vn/", {
      headers: { "User-Agent": UA },
      timeout: 15000,
    });
    const $ = cheerio.load(res.data);
    const out = [];
    $("table tr").each((_, tr) => {
      const tds = $(tr).find("td");
      if (tds.length < 2) return;
      const name = $(tds[0]).text().trim();
      const p1 = $(tds[1]).text().trim();
      if (name && /\d/.test(p1) && name.length < 80) {
        out.push({
          name,
          zone1: p1,
          zone2: tds.length >= 3 ? $(tds[2]).text().trim() || "N/A" : "N/A",
        });
      }
    });
    if (out.length >= 2) return out;
  } catch (e) {
    console.warn("[giaxang] petroltimes fail:", e?.message || e);
  }

  // Source 4 (fallback): vnexpress homepage có widget giá xăng
  try {
    const res = await axios.get("https://vnexpress.net/kinh-doanh", {
      headers: { "User-Agent": UA },
      timeout: 15000,
    });
    const html = res.data;
    // Tìm pattern "Xăng RON 95-V: 25.xxx đ/lít"
    const out = [];
    const re = /(Xăng [^:]+|Dầu [^:]+|RON [^:]+)\s*[:\-]?\s*([\d.,]+)\s*(?:đ\/lít|đồng\/lít|VNĐ)/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const name = m[1].trim();
      const price = m[2].trim();
      if (name.length < 60 && /\d{4,}/.test(price.replace(/[.,]/g, ""))) {
        out.push({ name, zone1: price, zone2: "N/A" });
      }
      if (out.length >= 10) break;
    }
    if (out.length >= 2) return out;
  } catch (e) {
    console.warn("[giaxang] vnexpress regex fail:", e?.message || e);
  }

  throw new Error(
    "Không lấy được dữ liệu giá xăng. Có thể do:\n" +
    "  1. Bot chưa cài Chrome cho Puppeteer (cần cho petrolimex.com.vn)\n" +
    "     → Chạy: npx puppeteer browsers install chrome\n" +
    "     → Hoặc double-click file scripts\\install-puppeteer-chrome.bat\n" +
    "  2. Petrolimex API / VnExpress tạm thời block scrape.\n",
  );
}

export async function handleCheckGiaXangCommand(api, message) {
  try {
    const prices = await fetchFuelPrice();

    // Phân loại để màu sắc trực quan hơn
    // Xăng → vàng | Dầu DO → cam | Dầu hỏa → xanh
    const productColor = (name) => {
      const lower = name.toLowerCase();
      if (lower.includes("ron") || lower.startsWith("xăng")) return "#FFD700"; // vàng
      if (lower.startsWith("do") || lower.includes("diesel")) return "#FB923C"; // cam
      if (lower.includes("dầu") || lower.includes("kerosene")) return "#60A5FA"; // xanh
      return "#FFD700";
    };

    const W = 1100, rowH = 44, titleH = 80;
    const HEADER_H = rowH + 6;
    const totalH = titleH + HEADER_H + rowH * prices.length + 30;

    // Gradient nền cam đậm — phù hợp xăng dầu
    const { canvas, ctx } = makeCanvas(W, totalH, "#7C2D12", "#0F172A");

    const rows = prices.map((p) => [
      { text: p.name, color: productColor(p.name), align: "left", font: "bold 17px Arial" },
      { text: p.zone1, color: "#86EFAC", font: "bold 18px Arial" },   // vùng 1: xanh
      { text: p.zone2, color: "#FCD34D", font: "bold 18px Arial" },   // vùng 2: vàng amber (KHÔNG đỏ)
    ]);

    drawTable(ctx, {
      title: "BẢNG GIÁ XĂNG DẦU",
      columns: [
        { name: "Sản phẩm", width: 520 },
        { name: "Vùng 1 (đ/lít)", width: 260 },
        { name: "Vùng 2 (đ/lít)", width: 260 },
      ],
      rows,
      startY: titleH,
      canvasWidth: W,
      rowH,
    });

    // Footer ghi chú nhỏ
    ctx.font = "italic 13px Arial";
    ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
    ctx.textAlign = "center";
    ctx.fillText("Nguồn: Petrolimex • Vùng 1: nội đồng • Vùng 2: vùng sâu/xa", W / 2, totalH - 12);

    const imagePath = await saveCanvas(canvas, "fuel");
    await sendMessageTag(api, message, { caption: "Đây là giá xăng dầu hiện tại", imagePath }, TTL);
    await deleteFile(imagePath).catch(() => {});
  } catch (err) {
    console.error(err);
    return sendMessageStateQuote(api, message, "❌ Không thể lấy giá xăng dầu hiện tại", false, 120000);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. TỶ GIÁ TIỀN TỆ (Nguồn: webgia.com/ty-gia/vietcombank)
// ══════════════════════════════════════════════════════════════════════════════
const POPULAR_CODES = ["USD","EUR","GBP","JPY","AUD","SGD","CNY","KRW","THB","HKD","CAD","CHF"];

async function fetchExchangeRates() {
  const res = await axios.get("https://webgia.com/ty-gia/vietcombank/", {
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
      "Referer": "https://webgia.com/",
    },
    timeout: 15000,
  });
  const $ = cheerio.load(res.data);
  const rates = [];

  $("table tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 4) return;
    const code = $(tds[0]).text().trim().toUpperCase();
    const name = $(tds[1]).text().trim();
    if (!code || !name || /mã|code|ngoại tệ/i.test(code)) return;
    const buy      = $(tds[2]).text().trim() || "-";
    const transfer = tds.length >= 5 ? $(tds[3]).text().trim() || "-" : buy;
    const sell     = tds.length >= 5 ? $(tds[4]).text().trim() || "-" : $(tds[3]).text().trim() || "-";
    rates.push({ code, name, buy, transfer, sell });
  });

  if (!rates.length) throw new Error("Không tìm thấy tỷ giá");
  const popular = POPULAR_CODES.map(c => rates.find(r => r.code === c)).filter(Boolean);
  return [...popular, ...rates.filter(r => !POPULAR_CODES.includes(r.code))];
}

export async function handleCheckTienTeCommand(api, message) {
  try {
    const rates = await fetchExchangeRates();
    const W = 1200, rowH = 46, headerH = 75;
    const [c1W, c2W, c3W, c4W, c5W] = [90, 340, 257, 257, 256];
    const { canvas, ctx } = makeCanvas(W, headerH + rowH * (rates.length + 1) + 10, "rgba(5,100,50,1)", "rgba(17,24,39,0.95)");
    const rows = rates.map(r => [
      { text: r.code,     color: "#FFD700" },
      { text: r.name,     color: "#E0E0E0", align: "left" },
      { text: r.buy,      color: "#90EE90" },
      { text: r.transfer, color: "#90EE90" },
      { text: r.sell,     color: "#FF8A80" },
    ]);
    drawTable(ctx, {
      title: "TỶ GIÁ NGOẠI TỆ – VCB",
      columns: [
        { name: "Mã NT",       width: c1W },
        { name: "Tên tiền tệ", width: c2W },
        { name: "Mua TM",      width: c3W },
        { name: "Mua CK",      width: c4W },
        { name: "Bán",         width: c5W },
      ],
      rows, startY: headerH, canvasWidth: W, rowH,
    });
    const imagePath = await saveCanvas(canvas, "fx");
    await sendMessageTag(api, message, { caption: "Đây là tỷ giá ngoại tệ hiện tại", imagePath }, TTL);
    await deleteFile(imagePath).catch(() => {});
  } catch (err) {
    console.error(err);
    return sendMessageStateQuote(api, message, "❌ Không thể lấy tỷ giá ngoại tệ hiện tại", false, 120000);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. CỔ PHIẾU (Nguồn: cafef.vn – Puppeteer + JSON banggia)
// ══════════════════════════════════════════════════════════════════════════════
const TOP_STOCKS = ["VIC","VHM","VCB","BID","CTG","TCB","VPB","HPG","MBB","FPT","MSN","SAB","BCM","GVR","ACB","HDB","STB","POW","PLX","VNM"];

// Lấy danh sách stocks từ JSON API trực tiếp qua axios (không cần puppeteer)
async function fetchStocksFromCafef(indexParam) {
  try {
    const res = await axios.get(`https://banggia.cafef.vn/stockhandler.ashx?index=${indexParam}`, {
      headers: {
        "User-Agent": UA,
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Referer": "https://banggia.cafef.vn/",
      },
      timeout: 15000,
    });
    return Array.isArray(res.data) ? res.data : [];
  } catch { return []; }
}

// Lấy chỉ số thị trường — thử nhiều API/source cho tới khi có data
async function fetchIndices() {
  const wanted = ["VNINDEX", "HNXINDEX", "UPCOMINDEX", "VN30", "HNX30"];

  // ── Source 1: cafef msh-appdata REST API ──
  try {
    const res = await axios.get(
      "https://msh-appdata.cafef.vn/rest-api/api/v1/Index?GetAll=1",
      {
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          Referer: "https://cafef.vn/",
        },
        timeout: 15000,
      },
    );
    const arr = res.data?.value || res.data?.data || res.data || [];
    if (Array.isArray(arr) && arr.length) {
      const out = [];
      for (const code of wanted) {
        const item = arr.find(
          (x) => String(x.symbol || x.code || x.Symbol || "").toUpperCase().replace(/[\s-]/g, "") === code,
        );
        if (!item) continue;
        const close = Number(item.point || item.value || item.indexValue || item.lastPrice || 0);
        const change = Number(item.change || item.changedIndex || item.priceChange || 0);
        const pct = Number(item.percentChange || item.percentIndex || item.changePct || 0);
        if (close > 0) {
          out.push({
            code,
            close: close.toFixed(2),
            change: change >= 0 ? `+${change.toFixed(2)}` : change.toFixed(2),
            pct: pct >= 0 ? `+${pct.toFixed(2)}%` : `${pct.toFixed(2)}%`,
            isUp: change >= 0,
          });
        }
      }
      if (out.length) return out;
    }
  } catch (e) {
    console.warn("[cophieu] cafef msh-appdata fail:", e?.message || e);
  }

  // ── Source 2: VnDirect price API ──
  try {
    const res = await axios.get(
      "https://price-api.vndirect.com.vn/v3/indices?q=&size=20",
      {
        headers: { "User-Agent": UA, Accept: "application/json" },
        timeout: 15000,
      },
    );
    const arr = res.data?.data || res.data?.indices || res.data || [];
    if (Array.isArray(arr) && arr.length) {
      const out = [];
      for (const code of wanted) {
        const item = arr.find(
          (x) => String(x.code || x.symbol || x.indexCode || "").toUpperCase().replace(/[\s-]/g, "") === code,
        );
        if (!item) continue;
        const close = Number(item.value || item.indexValue || item.point || 0);
        const change = Number(item.change || item.changeValue || 0);
        const pct = Number(item.percentChange || item.changePct || 0);
        if (close > 0) {
          out.push({
            code,
            close: close.toFixed(2),
            change: change >= 0 ? `+${change.toFixed(2)}` : change.toFixed(2),
            pct: pct >= 0 ? `+${pct.toFixed(2)}%` : `${pct.toFixed(2)}%`,
            isUp: change >= 0,
          });
        }
      }
      if (out.length) return out;
    }
  } catch (e) {
    console.warn("[cophieu] vndirect API fail:", e?.message || e);
  }

  // ── Source 3: cafef cardindex handler (old API) ──
  try {
    const res = await axios.get(
      "https://banggia.cafef.vn/data.ashx?type=cardgnindexv2",
      {
        headers: {
          "User-Agent": UA,
          Accept: "application/json, text/javascript, */*; q=0.01",
          Referer: "https://banggia.cafef.vn/",
          "X-Requested-With": "XMLHttpRequest",
        },
        timeout: 15000,
      },
    );
    const arr = Array.isArray(res.data) ? res.data : (res.data?.data || []);
    if (Array.isArray(arr) && arr.length) {
      const out = [];
      for (const code of wanted) {
        const item = arr.find(
          (x) => String(x.MarketName || x.code || x.IndexId || "").toUpperCase().replace(/[\s-]/g, "") === code,
        );
        if (!item) continue;
        const close = Number(item.Index || item.indexValue || item.value || 0);
        const change = Number(item.Change || item.changedIndex || 0);
        const pct = Number(item.Percent || item.percentIndex || 0);
        if (close > 0) {
          out.push({
            code,
            close: close.toFixed(2),
            change: change >= 0 ? `+${change.toFixed(2)}` : change.toFixed(2),
            pct: pct >= 0 ? `+${pct.toFixed(2)}%` : `${pct.toFixed(2)}%`,
            isUp: change >= 0,
          });
        }
      }
      if (out.length) return out;
    }
  } catch (e) {
    console.warn("[cophieu] cafef cardgnindexv2 fail:", e?.message || e);
  }

  // ── Source 4: scrape vietstock.vn (HTML) ──
  try {
    const res = await axios.get("https://finance.vietstock.vn/chung-khoan-truc-tuyen/bang-gia-truc-tuyen.htm", {
      headers: { "User-Agent": UA },
      timeout: 15000,
    });
    const html = res.data;
    const out = [];
    for (const code of wanted) {
      // Pattern: VNINDEX  1,234.56  +12.34  +0.85%
      const re = new RegExp(
        code.replace("INDEX", "[-]?INDEX") +
          "[\\s\\S]{0,100}?(-?\\d{1,4}[,.]\\d+)[\\s\\S]{0,40}?([+-]?\\d+[.,]?\\d*)[\\s\\S]{0,20}?([+-]?\\d+[.,]?\\d*)\\s*%",
        "i",
      );
      const m = html.match(re);
      if (m) {
        const close = parseFloat(m[1].replace(/[,]/g, ""));
        const change = parseFloat(m[2].replace(",", "."));
        const pct = parseFloat(m[3].replace(",", "."));
        if (!isNaN(close)) {
          out.push({
            code,
            close: close.toFixed(2),
            change: change >= 0 ? `+${change.toFixed(2)}` : change.toFixed(2),
            pct: pct >= 0 ? `+${pct.toFixed(2)}%` : `${pct.toFixed(2)}%`,
            isUp: change >= 0,
          });
        }
      }
    }
    if (out.length) return out;
  } catch (e) {
    console.warn("[cophieu] vietstock scrape fail:", e?.message || e);
  }

  return [];
}

async function fetchStockData() {
  // 1. Top stocks: API banggia.cafef.vn (đã hoạt động ổn định)
  const [hose, hnx] = await Promise.all([
    fetchStocksFromCafef("VNINDEX"),
    fetchStocksFromCafef("HNX"),
  ]);
  const all = [...hose, ...hnx];
  const map = Object.fromEntries(all.map((s) => [s.a, s]));

  const stocks = TOP_STOCKS.map((c) => map[c]).filter(Boolean).map((s) => {
    const close = Number(s.b) || 0;
    const open = Number(s.l) || close;
    const change = +(close - open).toFixed(2);
    const pct = open ? +((change / open) * 100).toFixed(2) : 0;
    const vol = Number(s.totalvolume) || 0;
    return {
      code: s.a,
      price: close.toLocaleString("vi-VN"),
      change: change >= 0 ? `+${change}` : `${change}`,
      pct: pct >= 0 ? `+${pct}%` : `${pct}%`,
      vol: vol ? `${(vol / 1e6).toFixed(2)}tr` : "N/A",
      isUp: change >= 0,
    };
  });

  // 2. Chỉ số thị trường: thử nhiều API/source fallback
  const indices = await fetchIndices();

  return { indices, stocks };
}


export async function handleCheckCoPhieuCommand(api, message) {
  try {
    const { indices, stocks } = await fetchStockData();
    if (!indices.length && !stocks.length) throw new Error("Không có dữ liệu");

    const W = 1200, rowH = 44;
    const hasIndices = indices.length > 0;
    const hasStocks = stocks.length > 0;

    // Tính height theo từng block thực sự tồn tại
    const TITLE_H = 80;
    const HEADER_H = rowH + 6;
    const idxBlockH = hasIndices ? TITLE_H + HEADER_H + rowH * indices.length + 30 : 0;
    const stockBlockH = hasStocks ? (hasIndices ? 60 : TITLE_H) + HEADER_H + rowH * stocks.length + 20 : 0;
    const totalH = idxBlockH + stockBlockH + 20;

    const { canvas, ctx } = makeCanvas(W, totalH, "#0A2463", "#0F172A");

    let nextY = 0;

    // ── Block chỉ số (chỉ vẽ khi có data) ─────────────────────────
    if (hasIndices) {
      const idxColW = (W - 40) / 4;
      drawTable(ctx, {
        title: "THỊ TRƯỜNG CHỨNG KHOÁN VIỆT NAM",
        columns: [
          { name: "Chỉ số", width: idxColW },
          { name: "Điểm", width: idxColW },
          { name: "Thay đổi", width: idxColW },
          { name: "%", width: idxColW },
        ],
        rows: indices.map((d) => [
          { text: d.code, color: "#FFD700" },
          { text: String(d.close), color: "#FFFFFF" },
          { text: d.change, color: d.isUp ? "#86EFAC" : "#FF8A80" },
          { text: d.pct, color: d.isUp ? "#86EFAC" : "#FF8A80" },
        ]),
        startY: TITLE_H, canvasWidth: W, rowH,
      });
      nextY = idxBlockH;
    }

    // ── Block cổ phiếu ─────────────────────────────────────────────
    if (hasStocks) {
      const stockTitleY = hasIndices ? nextY + 40 : TITLE_H;
      const [sc1, sc2, sc3, sc4, sc5] = [140, 220, 220, 220, W - 40 - 140 - 220 - 220 - 220];
      drawTable(ctx, {
        title: "CỔ PHIẾU VỐN HOÁ LỚN",
        columns: [
          { name: "Mã CK", width: sc1 },
          { name: "Giá (đ)", width: sc2 },
          { name: "Thay đổi", width: sc3 },
          { name: "%", width: sc4 },
          { name: "Khối lượng", width: sc5 },
        ],
        rows: stocks.map((s) => [
          { text: s.code, color: "#FFD700" },
          { text: s.price, color: "#FFFFFF" },
          { text: s.change, color: s.isUp ? "#86EFAC" : "#FF8A80" },
          { text: s.pct, color: s.isUp ? "#86EFAC" : "#FF8A80" },
          { text: s.vol, color: "#93C5FD" },
        ]),
        startY: stockTitleY, canvasWidth: W, rowH,
      });
    }

    const imagePath = await saveCanvas(canvas, "stock");
    const caption = hasIndices
      ? "Đây là bảng giá cổ phiếu thị trường chứng khoán Việt Nam"
      : "Đây là bảng giá cổ phiếu vốn hoá lớn (không lấy được chỉ số thị trường lúc này)";
    await sendMessageTag(api, message, { caption, imagePath }, TTL);
    await deleteFile(imagePath).catch(() => {});
  } catch (err) {
    console.error(err);
    return sendMessageStateQuote(api, message, "❌ Không thể lấy dữ liệu chứng khoán hiện tại", false, 120000);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. TIỀN ĐIỆN TỬ (CRYPTO)
// ══════════════════════════════════════════════════════════════════════════════
const COIN_IDS = [
  "bitcoin","ethereum","tether","binancecoin","solana",
  "ripple","usd-coin","dogecoin","cardano","tron",
  "avalanche-2","polkadot","chainlink","litecoin","shiba-inu",
];

function fmtUSD(v) {
  if (!v && v !== 0) return "N/A";
  if (v >= 1e9)  return `$${(v/1e9).toFixed(2)}B`;
  if (v >= 1e6)  return `$${(v/1e6).toFixed(2)}M`;
  if (v >= 1000) return `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (v >= 1)    return `$${v.toFixed(4)}`;
  return `$${v.toFixed(6)}`;
}

async function fetchCryptoData() {
  const res = await axios.get(
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${COIN_IDS.join(",")}&order=market_cap_desc&per_page=15&page=1&sparkline=false`,
    { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" }, timeout: 20000 }
  );
  const data = res.data;
  if (!Array.isArray(data) || !data.length) throw new Error("Không có dữ liệu crypto");
  return data.map((c, i) => ({
    rank:   i + 1,
    symbol: (c.symbol || "").toUpperCase(),
    name:   c.name || "?",
    price:  fmtUSD(c.current_price),
    pct24h: c.price_change_percentage_24h != null
      ? `${c.price_change_percentage_24h >= 0 ? "+" : ""}${c.price_change_percentage_24h.toFixed(2)}%`
      : "N/A",
    cap:  fmtUSD(c.market_cap),
    isUp: (c.price_change_percentage_24h || 0) >= 0,
  }));
}

export async function handleCheckCryptoCommand(api, message) {
  try {
    const coins = await fetchCryptoData();
    const W = 1200, rowH = 48, headerH = 75;
    const [c1,c2,c3,c4,c5,c6] = [60,100,260,260,260,260];
    const { canvas, ctx } = makeCanvas(W, headerH + rowH * (coins.length + 1) + 10, "rgba(60,0,120,1)", "rgba(17,24,39,0.95)");
    const rows = coins.map(c => [
      { text: String(c.rank), color: "#E0E0E0" },
      { text: c.symbol,       color: "#FFD700" },
      { text: c.name,         color: "#FFFFFF", align: "left" },
      { text: c.price,        color: "#ADD8E6" },
      { text: c.pct24h,       color: c.isUp ? "#90EE90" : "#FF8A80" },
      { text: c.cap,          color: "#C0C0C0" },
    ]);
    drawTable(ctx, {
      title: "GIÁ TIỀN ĐIỆN TỬ (CRYPTO)",
      columns: [
        { name: "#",          width: c1 },
        { name: "Ký hiệu",   width: c2 },
        { name: "Tên",        width: c3 },
        { name: "Giá (USD)",  width: c4 },
        { name: "24h",        width: c5 },
        { name: "Vốn hoá",   width: c6 },
      ],
      rows, startY: headerH, canvasWidth: W, rowH,
    });
    const imagePath = await saveCanvas(canvas, "crypto");
    await sendMessageTag(api, message, { caption: "Đây là giá tiền điện tử top 15", imagePath }, TTL);
    await deleteFile(imagePath).catch(() => {});
  } catch (err) {
    console.error(err);
    return sendMessageStateQuote(api, message, "❌ Không thể lấy giá tiền điện tử hiện tại", false, 120000);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. LÃI SUẤT NGÂN HÀNG
// Đa nguồn: thebank.vn → lscb.com → mybank.vn (đều có số plain trong HTML)
// ══════════════════════════════════════════════════════════════════════════════

// Validate row: lọc bỏ row có placeholder "webgia.com" / "xem tại" / link text
function isRowHasRealNumbers(row) {
  const numericCount = row.values.filter((v) => {
    if (!v || v === "-") return false;
    // Lọc placeholder text — bắt phần lớn link text (webgia.com, "xem tại …", "web giá")
    if (/webgia|xem tại|web giá|click|tại đây/i.test(v)) return false;
    // Phải có ít nhất 1 số (có thể có dấu .,)
    return /\d/.test(v) && !/^[a-zA-Z\s]+$/.test(v);
  }).length;
  return numericCount >= 1;
}

async function fetchBankRates() {
  // Source 1: Puppeteer cafef.vn — canonical (user trỏ vào URL này)
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    );
    await page.goto("https://cafef.vn/du-lieu/lai-suat-ngan-hang.chn", {
      waitUntil: "networkidle2",
      timeout: 35000,
    });
    await page.waitForSelector("table tr td", { timeout: 20000 }).catch(() => {});
    const data = await page.evaluate(() => {
      const allTables = Array.from(document.querySelectorAll("table"));
      let bestTable = null;
      let maxRows = 0;
      for (const t of allTables) {
        const n = t.querySelectorAll("tr").length;
        if (n > maxRows) { maxRows = n; bestTable = t; }
      }
      if (!bestTable || maxRows < 3) return { headers: [], rows: [] };
      const headers = [];
      const firstTr = bestTable.querySelector("tr");
      if (firstTr) firstTr.querySelectorAll("th, td").forEach((c) => headers.push(c.textContent.trim()));
      const rows = [];
      const trs = bestTable.querySelectorAll("tr");
      for (let i = 1; i < trs.length; i++) {
        const tds = trs[i].querySelectorAll("td");
        if (tds.length < 2) continue;
        const bank = tds[0].textContent.trim();
        if (!bank) continue;
        const values = [];
        for (let j = 1; j < tds.length; j++) values.push(tds[j].textContent.trim() || "-");
        rows.push({ bank, values });
      }
      return { headers, rows };
    });
    await page.close().catch(() => {});
    if (data.rows.length) return data;
  } catch (e) {
    console.warn("[laisuat] cafef Puppeteer fail:", e?.message || e);
  }
  // KHÔNG đóng browser ở finally — nó là singleton dùng cho commands khác.

  // Source 2: thebank.vn — bảng so sánh lãi suất (axios fallback)
  try {
    const res = await axios.get("https://thebank.vn/products/personal-loans/lai-suat-tiet-kiem", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "vi-VN,vi;q=0.9",
        Referer: "https://www.google.com/",
      },
      timeout: 15000,
    });
    const $ = cheerio.load(res.data);
    const result = parseRateTable($);
    if (result.rows.length >= 3 && result.rows.some(isRowHasRealNumbers)) {
      result.rows = result.rows.filter(isRowHasRealNumbers);
      return result;
    }
  } catch (e) {
    console.warn("[laisuat] thebank.vn fail:", e?.message || e);
  }

  // Source 3: laisuatnganhang.vn (axios fallback)
  try {
    const res = await axios.get("https://laisuatnganhang.vn/", {
      headers: { "User-Agent": UA },
      timeout: 12000,
    });
    const $ = cheerio.load(res.data);
    const result = parseRateTable($);
    if (result.rows.length >= 3 && result.rows.some(isRowHasRealNumbers)) {
      result.rows = result.rows.filter(isRowHasRealNumbers);
      return result;
    }
  } catch (e) {
    console.warn("[laisuat] laisuatnganhang.vn fail:", e?.message || e);
  }

  throw new Error(
    "Không lấy được lãi suất từ mọi nguồn. Có thể do:\n" +
    "  1. Bot chưa cài Chrome cho Puppeteer (cần cho cafef.vn)\n" +
    "     → Chạy: npx puppeteer browsers install chrome\n" +
    "     → Hoặc double-click file scripts\\install-puppeteer-chrome.bat\n" +
    "  2. Các website nguồn (thebank.vn, laisuatnganhang.vn) tạm thời chặn.\n",
  );
}

// Helper: parse bảng lãi suất từ cheerio object — tìm bảng có nhiều rows nhất
function parseRateTable($) {
  let bestRows = [];
  let bestHeaders = [];
  $("table").each((_, t) => {
    const $t = $(t);
    const trs = $t.find("tr");
    if (trs.length < 4) return;
    const headers = [];
    $(trs[0]).find("th, td").each((_, c) => headers.push($(c).text().trim()));
    const rows = [];
    for (let i = 1; i < trs.length; i++) {
      const tds = $(trs[i]).find("td");
      if (tds.length < 2) continue;
      const bank = $(tds[0]).text().trim();
      if (!bank || bank.length > 100) continue;
      const values = [];
      for (let j = 1; j < tds.length; j++) values.push($(tds[j]).text().trim() || "-");
      rows.push({ bank, values });
    }
    if (rows.length > bestRows.length) {
      bestRows = rows;
      bestHeaders = headers;
    }
  });
  return { headers: bestHeaders, rows: bestRows };
}

export async function handleCheckLaiSuatCommand(api, message) {
  try {
    const { headers, rows } = await fetchBankRates();
    const W = 1400, rowH = 44, titleH = 80;
    const numCols = Math.max(...rows.map((r) => r.values.length));
    const defaultTerms = ["1T", "2T", "3T", "6T", "9T", "12T", "18T", "24T", "36T", "48T", "60T"];
    const col1W = 280;
    const colW = Math.floor((W - col1W - 40) / numCols);

    const totalH = titleH + (rowH + 6) + rowH * rows.length + 30;
    const { canvas, ctx } = makeCanvas(W, totalH, "#003566", "#0F172A");

    // Build columns + rows cho drawTable
    const columns = [{ name: "Ngân hàng", width: col1W }];
    for (let i = 0; i < numCols; i++) {
      const label = headers.length > i + 1 ? headers[i + 1] : (defaultTerms[i] || `KH${i + 1}`);
      columns.push({ name: label, width: colW });
    }

    const tableRows = rows.map((r) => {
      const cells = [{ text: r.bank, color: "#FFD700", align: "left", font: "bold 16px Arial" }];
      for (let vi = 0; vi < numCols; vi++) {
        const val = r.values[vi] || "-";
        const num = parseFloat(val.replace(",", "."));
        const color = !isNaN(num)
          ? (num >= 7 ? "#FF8A80" : num >= 5 ? "#86EFAC" : "#FFFFFF")
          : "#94A3B8";
        cells.push({ text: val, color, font: "bold 16px Arial" });
      }
      return cells;
    });

    drawTable(ctx, {
      title: "LÃI SUẤT TIỀN GỬI NGÂN HÀNG (%/NĂM)",
      columns,
      rows: tableRows,
      startY: titleH,
      canvasWidth: W,
      rowH,
    });

    const imagePath = await saveCanvas(canvas, "rate");
    await sendMessageTag(api, message, { caption: "Đây là bảng lãi suất tiền gửi các ngân hàng hiện tại (%/năm)", imagePath }, TTL);
    await deleteFile(imagePath).catch(() => {});
  } catch (err) {
    console.error(err);
    return sendMessageStateQuote(api, message, "❌ Không thể lấy lãi suất ngân hàng hiện tại", false, 120000);
  }
}

