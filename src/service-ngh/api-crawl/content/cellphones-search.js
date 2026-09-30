import path from "path";
import { launchBrowser } from "../../utilities/browser-launch.js";
import { createCanvas } from "canvas";
import { removeMention, FONT_MAIN, getFontCanvas } from "../../../utils/format-util.js";
import { loadImageWithRetry, writeFilePromise, deleteFile } from "../../../utils/util.js";
import {
  sendMessageComplete,
  sendMessageFailed,
  sendMessageWarning,
  sendMessageTag,
} from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import { setSelectionsMapData } from "../index.js";

export const PLATFORM_CELLPHONES = "cellphones";
const SITE_BASE = "https://cellphones.com.vn";
const TIME_TO_SELECT = 60000;

// Dùng Chromium headless dùng chung của bot; chỉ đóng page của request hiện tại.
async function openRealBrowser() {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  return { browser, page };
}

async function closeRealBrowser(ctx) {
  if (!ctx?.page) return;
  try { await ctx.page.close(); } catch {}
}

// ===== Colors theme CellphoneS — đỏ trắng =====
const CPS = {
  brand: "#D70018",
  brandLight: "#E63946",
  brandBg: "#FFF1F2",
  white: "#FFFFFF",
  bg: "#F5F5F5",
  card: "#FFFFFF",
  text: "#212121",
  textSub: "#757575",
  textMuted: "#BDBDBD",
  price: "#D70018",
  oldPrice: "#9CA3AF",
  green: "#22A06B",
  yellow: "#F59E0B",
  border: "#E8E8E8",
};

function fmtVnd(num) {
  if (!num || isNaN(num)) return "—";
  return Number(num).toLocaleString("vi-VN") + "đ";
}

function fmtDiscount(price, oldPrice) {
  if (!price || !oldPrice || oldPrice <= price) return null;
  return Math.round(((oldPrice - price) / oldPrice) * 100) + "%";
}

function wrapText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  while (ctx.measureText(text + "…").width > maxWidth && text.length > 0) text = text.slice(0, -1);
  return text + "…";
}

function wrapLines(ctx, text, maxWidth, maxLines = 3) {
  const words = (text || "").split(" ");
  const result = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      result.push(line);
      if (result.length >= maxLines) {
        result[maxLines - 1] += "…";
        return result;
      }
      line = word;
    } else {
      line = test;
    }
  }
  if (line) result.push(line);
  return result;
}

function drawCard(ctx, x, y, w, h, r = 10) {
  ctx.save();
  ctx.fillStyle = CPS.card;
  ctx.shadowColor = "rgba(0,0,0,0.10)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = CPS.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.stroke();
  ctx.restore();
}

function sectionHeader(ctx, x, y, label, font) {
  ctx.fillStyle = CPS.brand;
  ctx.fillRect(x, y, 4, 22);
  ctx.font = font || `bold 17px ${FONT_MAIN}`;
  ctx.fillStyle = CPS.text;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + 12, y + 11);
}

// ===== Visual helpers (shared across canvases) =====
function drawDotPattern(ctx, W, H, color = "rgba(0,0,0,0.025)", step = 18) {
  ctx.save();
  ctx.fillStyle = color;
  for (let y = step / 2; y < H; y += step) {
    for (let x = step / 2; x < W; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawShadowCard(ctx, x, y, w, h, opts = {}) {
  const {
    r = 12,
    bg = CPS.card,
    border = CPS.border,
    shadowBlur = 10,
    shadowAlpha = 0.08,
    accentBar = null,
  } = opts;
  ctx.save();
  ctx.fillStyle = bg;
  ctx.shadowColor = `rgba(0,0,0,${shadowAlpha})`;
  ctx.shadowBlur = shadowBlur;
  ctx.shadowOffsetY = 3;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.restore();
  if (border) {
    ctx.save();
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.stroke();
    ctx.restore();
  }
  if (accentBar) {
    ctx.save();
    ctx.fillStyle = accentBar.color;
    ctx.beginPath();
    ctx.roundRect(x + 1, y + 10, accentBar.width || 4, h - 20, 3);
    ctx.fill();
    ctx.restore();
  }
}

function drawRankBadge(ctx, x, y, size, idx, brandColor) {
  ctx.save();
  let stops;
  if (idx === 0) stops = ["#FFE57A", "#FFC107", "#FF8F00"];
  else if (idx === 1) stops = ["#ECECEC", "#B8B8B8", "#7A7A7A"];
  else if (idx === 2) stops = ["#E2B07A", "#B8732F", "#6E3D1A"];
  else stops = [brandColor, brandColor];
  const g = ctx.createLinearGradient(x, y, x + size, y + size);
  if (stops.length === 3) {
    g.addColorStop(0, stops[0]);
    g.addColorStop(0.5, stops[1]);
    g.addColorStop(1, stops[2]);
  } else {
    g.addColorStop(0, stops[0]);
    g.addColorStop(1, stops[1]);
  }
  ctx.fillStyle = g;
  ctx.shadowColor = "rgba(0,0,0,0.20)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, Math.max(6, size * 0.18));
  ctx.fill();
  ctx.restore();
  // Inner gloss
  ctx.save();
  ctx.globalAlpha = 0.25;
  const g2 = ctx.createLinearGradient(x, y, x, y + size / 2);
  g2.addColorStop(0, "rgba(255,255,255,0.8)");
  g2.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g2;
  ctx.beginPath();
  ctx.roundRect(x + 2, y + 2, size - 4, size / 2 - 2, Math.max(4, size * 0.14));
  ctx.fill();
  ctx.restore();
  // Number
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.floor(size * 0.5)}px ${FONT_MAIN}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 2;
  ctx.strokeText(`${idx + 1}`, x + size / 2, y + size / 2 + 1);
  ctx.fillText(`${idx + 1}`, x + size / 2, y + size / 2 + 1);
}

function drawDiscountBadge(ctx, x, y, label, brandColor) {
  const w = 46, h = 22;
  ctx.save();
  ctx.fillStyle = brandColor;
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w - 6, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#fff";
  ctx.font = `bold 12px ${FONT_MAIN}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`-${label}`, x + w / 2 - 3, y + h / 2 + 1);
}

function drawPill(ctx, x, y, text, opts = {}) {
  const { font = `bold 11px ${FONT_MAIN}`, bg = CPS.brand, fg = "#fff", padX = 8, h = 18, r = 4 } = opts;
  ctx.save();
  ctx.font = font;
  const tw = ctx.measureText(text).width;
  const w = tw + padX * 2;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + padX, y + h / 2 + 0.5);
  ctx.restore();
  return w;
}

function drawStars(ctx, x, y, rating, opts = {}) {
  const { size = 13, color = CPS.yellow, emptyColor = "#E0E0E0" } = opts;
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  ctx.save();
  ctx.font = `${size}px ${FONT_MAIN}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  let cx = x;
  for (let i = 0; i < 5; i++) {
    const fill = i < full || (i === full && half) ? color : emptyColor;
    ctx.fillStyle = fill;
    ctx.fillText("★", cx, y);
    cx += size + 1;
  }
  ctx.restore();
  return cx - x;
}

function drawHeaderBar(ctx, W, H, title, subtitle, c1, c2) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Diagonal stripe decoration
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = "#fff";
  for (let i = -H; i < W + H; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + H, H);
    ctx.lineTo(i + H - 10, H);
    ctx.lineTo(i - 10, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // Bottom highlight line
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, H - 2, W, 2);
  ctx.restore();
  // Title
  ctx.fillStyle = "#fff";
  ctx.font = `bold 26px ${FONT_MAIN}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, W / 2, H / 2 - 11);
  // Subtitle
  ctx.save();
  ctx.globalAlpha = 0.95;
  ctx.font = `13px ${FONT_MAIN}`;
  ctx.fillText(subtitle, W / 2, H / 2 + 14);
  ctx.restore();
}

function drawFooterPill(ctx, W, H, FH, text, brand) {
  ctx.save();
  ctx.font = `13px ${FONT_MAIN}`;
  const tw = ctx.measureText(text).width;
  const padX = 18, pillH = 26;
  const pillW = tw + padX * 2;
  const px = (W - pillW) / 2;
  const py = H - FH + (FH - pillH) / 2;
  ctx.fillStyle = brand;
  ctx.shadowColor = "rgba(0,0,0,0.15)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  ctx.beginPath();
  ctx.roundRect(px, py, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#fff";
  ctx.font = `13px ${FONT_MAIN}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, W / 2, H - FH + FH / 2 + 1);
}

// ===== Helper: bóc tách product từ object GraphQL bất kỳ shape nào =====
// CellphoneS dùng Nuxt CSR → page rỗng trên SSR, products được fetch qua GraphQL sau load.
// Strategy: dùng puppeteer-real-browser intercept response, walk JSON tree tìm objects giống Product.

function _looksLikeProduct(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  const name = obj.name || obj.product_name || obj?.general?.name;
  const urlKey = obj.url_key || obj?.general?.url_key || obj.product_url || obj?.general?.product_url;
  const hasPriceShape =
    obj.price != null ||
    obj.special_price != null ||
    (Array.isArray(obj.prices) && obj.prices.length) ||
    (obj.price && typeof obj.price === "object");
  return !!(name && urlKey && hasPriceShape);
}

function _collectProducts(root) {
  const found = [];
  const seen = new Set();
  function walk(obj, depth = 0) {
    if (!obj || typeof obj !== "object" || depth > 14) return;
    if (Array.isArray(obj)) {
      for (const it of obj) walk(it, depth + 1);
      return;
    }
    if (_looksLikeProduct(obj)) {
      const key = obj.url_key || obj?.general?.url_key || obj.product_id || obj?.general?.product_id || obj.name;
      if (!seen.has(key)) {
        seen.add(key);
        found.push(obj);
      }
      // không return — vẫn walk vào để tìm nested products khác
    }
    for (const k of Object.keys(obj)) walk(obj[k], depth + 1);
  }
  walk(root);
  return found;
}

function _normalizeProduct(p) {
  const g = p.general || p;
  const name = g.name || p.product_name || "";
  const urlKey = g.url_key || p.url_key || "";
  const fullUrl =
    g.product_url ||
    p.product_url ||
    (urlKey ? `${SITE_BASE}/${urlKey}.html` : `${SITE_BASE}/`);

  // Thumbnail: có thể nằm trong attributes (array {code,value}) hoặc trực tiếp
  let thumbnail = null;
  const attrs = Array.isArray(g.attributes) ? g.attributes : Array.isArray(p.attributes) ? p.attributes : [];
  if (attrs.length) {
    const findAttr = (code) => {
      const a = attrs.find((x) => x?.code === code);
      return a?.value;
    };
    thumbnail =
      findAttr("thumbnail") ||
      findAttr("image") ||
      findAttr("image_url") ||
      findAttr("small_image") ||
      null;
  }
  thumbnail = thumbnail || g.thumbnail || g.image || p.thumbnail || p.image || null;

  // Prices: hỗ trợ array prices[{price,special_price}], hoặc inline price/special_price
  let price = null;
  let oldPrice = null;
  if (Array.isArray(p.prices) && p.prices.length) {
    const pr = p.prices[0];
    price = pr?.special_price || pr?.price;
    if (pr?.special_price && pr?.price && pr.price > pr.special_price) oldPrice = pr.price;
  } else {
    price = p.special_price || p.price || g.special_price || g.price;
    const original = p.price || g.price;
    if (p.special_price && original && original > p.special_price) oldPrice = original;
  }
  price = price ? Number(price) : null;
  oldPrice = oldPrice ? Number(oldPrice) : null;

  const promotion = Array.isArray(p.promotions)
    ? p.promotions.map((x) => x?.content || x?.title).filter(Boolean).join(", ").slice(0, 80)
    : "";
  const installment = !!(p.filterable?.is_installment_enabled || p.is_installment_enabled);

  return {
    id: g.product_id || p.product_id || p.id,
    name,
    url: fullUrl,
    thumbnail,
    price,
    oldPrice,
    promotion,
    installment,
  };
}

async function searchCellphones(keyword, total = 10) {
  console.log(`[cellphones] Search "${keyword}" (total=${total}) — via real browser`);
  const ctx = await openRealBrowser();
  const { page } = ctx;

  try {
    // Gom tất cả GraphQL response trong khi page chạy
    const collected = [];
    const onResponse = async (res) => {
      try {
        const url = res.url();
        if (!url.includes("api.cellphones.com.vn") || !url.includes("graphql")) return;
        if (res.status() !== 200) return;
        const json = await res.json().catch(() => null);
        if (!json) return;
        const products = _collectProducts(json);
        if (products.length) collected.push(...products);
      } catch {}
    };
    page.on("response", onResponse);

    try {
      await page.goto(
        `${SITE_BASE}/catalogsearch/result?q=${encodeURIComponent(keyword)}`,
        { waitUntil: "domcontentloaded", timeout: 30000 }
      );

      // Đợi tới khi đã collect đủ hoặc timeout 10s — page có thể gọi multiple GraphQL
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        if (collected.length >= total) break;
        await new Promise((r) => setTimeout(r, 500));
      }
    } finally {
      page.off("response", onResponse);
    }

    let items = collected.map(_normalizeProduct).filter((x) => x.name && x.price);

    // Fallback: nếu intercept không bắt được, eval DOM trên page sau khi đã render
    if (items.length === 0) {
      console.log("[cellphones] Intercept rỗng — fallback đọc DOM rendered");
      const domItems = await page.evaluate((siteBase) => {
        const out = [];
        const cards = document.querySelectorAll(
          ".product-info-container, .product-item, [class*='ProductCard'], .product-info"
        );
        for (const el of cards) {
          const name =
            el.querySelector("h3, .product__name, .product-name, [class*='ProductName']")?.textContent?.trim() || "";
          const a = el.querySelector("a[href]");
          let href = a?.getAttribute("href") || "";
          if (href && !href.startsWith("http")) href = siteBase + (href.startsWith("/") ? href : "/" + href);
          const priceText =
            el.querySelector(".product__price--show, .price, [class*='Price']:not([class*='old']):not([class*='through'])")?.textContent || "";
          const oldText =
            el.querySelector(".product__price--through, .old-price, [class*='OldPrice'], del")?.textContent || "";
          const img = el.querySelector("img");
          const thumb = img?.getAttribute("src") || img?.getAttribute("data-src") || null;
          const parsePrice = (t) => {
            const n = parseInt((t || "").replace(/[^\d]/g, ""), 10);
            return n && n > 1000 ? n : null;
          };
          const price = parsePrice(priceText);
          const oldPrice = parsePrice(oldText);
          if (name && href && price) {
            out.push({
              name,
              url: href,
              thumbnail: thumb,
              price,
              oldPrice: oldPrice && oldPrice > price ? oldPrice : null,
              promotion: "",
              installment: false,
            });
          }
        }
        return out;
      }, SITE_BASE);
      items = domItems;
    }

    console.log(`[cellphones] Tìm được ${items.length} sản phẩm (yêu cầu ${total})`);
    return items.slice(0, total);
  } finally {
    await closeRealBrowser(ctx);
  }
}

// ===== Fetch detail từ product URL (dùng real browser vì page là CSR) =====
async function fetchCellphonesDetail(productUrl) {
  const ctx = await openRealBrowser();
  try {
    const { page } = ctx;
    await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    // Chờ block specs render (CellphoneS dùng table layout cho thông số)
    await page.waitForSelector("table, .cps-block-content, .technical-content, .description", {
      timeout: 10000,
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));

    // Cố gắng click "Xem tất cả" để mở rộng bảng thông số
    try {
      await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll("a, button, span, div"));
        const btn = candidates.find((el) => {
          const t = (el.textContent || "").trim().toLowerCase();
          return t === "xem tất cả" || t === "xem thêm" || t === "xem toàn bộ";
        });
        if (btn) btn.click();
      });
      await new Promise((r) => setTimeout(r, 1200));
    } catch {}

    const data = await page.evaluate(() => {
      const specs = [];
      const seen = new Set();
      const cleanText = (s) => (s || "").replace(/\s+/g, " ").trim();
      const push = (label, value) => {
        label = cleanText(label);
        value = cleanText(value);
        if (!label || !value || label.length > 60 || value.length > 500) return;
        const key = label.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        specs.push({ label, value });
      };

      // Pattern 1: legacy CPS rows (vẫn dùng ở vài layout cũ)
      document.querySelectorAll(".technical-content-row, .item-technical-info-row").forEach((el) => {
        const label = el.querySelector(".label, .technical-content-row__title")?.textContent || "";
        const value = el.querySelector(".value, .technical-content-row__value")?.textContent || "";
        push(label, value);
      });

      // Pattern 2: scope vào block có tiêu đề "Thông số kỹ thuật" rồi quét table tr / row
      const headers = Array.from(document.querySelectorAll("h1,h2,h3,h4,.block-title,.cps-title,.title"));
      const specHeader = headers.find((h) => /thông số kỹ thuật|thông số chi tiết/i.test(h.textContent || ""));
      let scope = specHeader ? (specHeader.closest("section, .cps-block, .block, div") || document) : document;

      // table-based
      scope.querySelectorAll("table tr").forEach((tr) => {
        const cells = tr.querySelectorAll("td, th");
        if (cells.length >= 2) push(cells[0].textContent, cells[1].textContent);
      });

      // flex/grid 2-column rows
      if (specs.length < 4) {
        scope.querySelectorAll("li, [class*='row'], [class*='Row'], [class*='item']").forEach((row) => {
          if (row.querySelector("table")) return;
          const kids = Array.from(row.children).filter((c) => c.textContent && c.textContent.trim());
          if (kids.length === 2) push(kids[0].textContent, kids[1].textContent);
        });
      }

      // Description
      const descEl = document.querySelector(".description, .cps-block-content, .product-description");
      const description = descEl ? cleanText(descEl.textContent).slice(0, 800) : "";

      // Promotions
      const promos = [];
      document.querySelectorAll(".promotion-content li, .cps-promotion-item, .product-promotion li, .block-promotion li").forEach((el) => {
        const txt = cleanText(el.textContent);
        if (txt && promos.length < 8) promos.push(txt);
      });

      // Rating
      const ratingStarStr = document.querySelector(".rating-average, .product-rating__avg, [class*='RatingAverage']")?.textContent?.trim() || "";
      const ratingCountStr = document.querySelector(".rating-count, .product-rating__count, [class*='RatingCount']")?.textContent?.trim() || "";
      const rating = parseFloat(ratingStarStr.replace(",", ".")) || 0;
      const ratingCount = parseInt(ratingCountStr.replace(/[^\d]/g, ""), 10) || 0;

      return { specs: specs.slice(0, 30), description, promos, rating, ratingCount };
    });

    console.log(`[cellphones-detail] specs=${data.specs.length} promos=${data.promos.length} rating=${data.rating}`);
    return data;
  } catch (e) {
    console.warn("[cellphones-detail] error:", e?.message);
    return { specs: [], description: "", promos: [], rating: 0, ratingCount: 0 };
  } finally {
    await closeRealBrowser(ctx);
  }
}

// ===== Search results canvas =====
async function createSearchCanvas(items, startIndex = 0) {
  const twoCol = items.length > 10;
  const COLS = twoCol ? 2 : 1;
  const W = twoCol ? 1400 : 1000;
  const HEADER_H = 80;
  const FOOTER_H = 50;
  const OUTER = 16;
  const CARD_GAP = 12;
  const CARD_PAD = 14;
  const ROW_H = twoCol ? 118 : 146;
  const THUMB = twoCol ? 88 : 116;
  const COL_W = Math.floor((W - OUTER * 2 - (COLS - 1) * CARD_GAP) / COLS);
  const perCol = Math.ceil(items.length / COLS);
  const H = HEADER_H + OUTER + perCol * ROW_H + (perCol - 1) * CARD_GAP + FOOTER_H;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Background + dot pattern
  ctx.fillStyle = CPS.bg;
  ctx.fillRect(0, 0, W, H);
  drawDotPattern(ctx, W, H);

  // Header
  drawHeaderBar(ctx, W, HEADER_H,
    "📱 CELLPHONES",
    `${items.length} sản phẩm nổi bật được tìm thấy`,
    CPS.brand, CPS.brandLight);

  // Preload thumbnails
  const thumbs = await Promise.all(
    items.map(async (item) => {
      try {
        if (item.thumbnail) return await loadImageWithRetry(item.thumbnail, 2, 6000);
      } catch {}
      return null;
    })
  );

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const col = twoCol ? (i < perCol ? 0 : 1) : 0;
    const row = twoCol ? (i < perCol ? i : i - perCol) : i;
    const cardX = OUTER + col * (COL_W + CARD_GAP);
    const cardY = HEADER_H + OUTER + row * (ROW_H + CARD_GAP);

    drawShadowCard(ctx, cardX, cardY, COL_W, ROW_H, {
      r: 12,
      accentBar: { color: CPS.brand, width: 4 },
    });

    // Rank badge (medal cho top 3)
    const BADGE = twoCol ? 40 : 48;
    const badgeX = cardX + CARD_PAD + 6;
    const badgeY = cardY + (ROW_H - BADGE) / 2;
    drawRankBadge(ctx, badgeX, badgeY, BADGE, startIndex + i, CPS.brand);

    // Thumbnail
    const thumbX = badgeX + BADGE + 14;
    const thumbY = cardY + (ROW_H - THUMB) / 2;

    ctx.save();
    ctx.fillStyle = "#FAFAFA";
    ctx.beginPath();
    ctx.roundRect(thumbX, thumbY, THUMB, THUMB, 8);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(thumbX, thumbY, THUMB, THUMB, 8);
    ctx.clip();
    if (thumbs[i]) {
      ctx.drawImage(thumbs[i], thumbX, thumbY, THUMB, THUMB);
    } else {
      ctx.fillStyle = "#EDEDED";
      ctx.fillRect(thumbX, thumbY, THUMB, THUMB);
      ctx.fillStyle = CPS.textMuted;
      ctx.font = `${Math.floor(THUMB * 0.4)}px ${FONT_MAIN}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("📱", thumbX + THUMB / 2, thumbY + THUMB / 2);
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = CPS.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(thumbX, thumbY, THUMB, THUMB, 8);
    ctx.stroke();
    ctx.restore();

    // Discount badge (floating top-left of thumbnail)
    const discount = fmtDiscount(item.price, item.oldPrice);
    if (discount) drawDiscountBadge(ctx, thumbX - 4, thumbY + 6, discount, CPS.brand);

    // Text area
    const textX = thumbX + THUMB + 14;
    const textRight = cardX + COL_W - CARD_PAD;
    const textMaxW = textRight - textX;
    let ty = cardY + (twoCol ? 14 : 16);

    // Name
    ctx.font = `bold ${twoCol ? 15 : 18}px ${getFontCanvas(item.name)}`;
    ctx.fillStyle = CPS.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const nameLines = wrapLines(ctx, item.name || "Không có tên", textMaxW, twoCol ? 1 : 2);
    for (const ln of nameLines) {
      ctx.fillText(ln, textX, ty);
      ty += twoCol ? 21 : 23;
    }
    ty += 4;

    // Price
    ctx.font = `bold ${twoCol ? 18 : 23}px ${FONT_MAIN}`;
    ctx.fillStyle = CPS.price;
    const priceStr = fmtVnd(item.price);
    ctx.fillText(priceStr, textX, ty);
    const pw = ctx.measureText(priceStr).width;

    if (item.oldPrice && item.oldPrice > item.price) {
      const oldStr = fmtVnd(item.oldPrice);
      ctx.font = `${twoCol ? 12 : 14}px ${FONT_MAIN}`;
      ctx.fillStyle = CPS.oldPrice;
      const ox = textX + pw + 10;
      const oy = ty + (twoCol ? 6 : 8);
      ctx.fillText(oldStr, ox, oy);
      const ow = ctx.measureText(oldStr).width;
      ctx.strokeStyle = CPS.oldPrice;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ox, oy + (twoCol ? 6 : 7));
      ctx.lineTo(ox + ow, oy + (twoCol ? 6 : 7));
      ctx.stroke();
    }
    ty += twoCol ? 26 : 32;

    // Pills
    let px = textX;
    const pillFont = `bold ${twoCol ? 10 : 11}px ${FONT_MAIN}`;
    const pillH = twoCol ? 18 : 20;
    const maxRight = textRight - 4;
    if (item.promotion) {
      const promoText = "🎁 " + item.promotion.slice(0, 24);
      px += drawPill(ctx, px, ty, promoText, { font: pillFont, bg: CPS.brandBg, fg: CPS.brand, h: pillH }) + 6;
    }
    if (item.installment && px < maxRight - 90) {
      px += drawPill(ctx, px, ty, "💳 Trả góp 0%", { font: pillFont, bg: "#E6F4EA", fg: CPS.green, h: pillH }) + 6;
    }
  }

  // Column divider (subtle vertical gradient)
  if (twoCol) {
    const dividerX = OUTER + COL_W + CARD_GAP / 2;
    const g = ctx.createLinearGradient(0, HEADER_H, 0, H - FOOTER_H);
    g.addColorStop(0, "rgba(232,232,232,0)");
    g.addColorStop(0.5, "rgba(200,200,200,0.6)");
    g.addColorStop(1, "rgba(232,232,232,0)");
    ctx.strokeStyle = g;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(dividerX, HEADER_H + 16);
    ctx.lineTo(dividerX, H - FOOTER_H - 8);
    ctx.stroke();
  }

  // Footer pill
  drawFooterPill(ctx, W, H, FOOTER_H,
    `Nhập số ${startIndex + 1}–${startIndex + items.length} để xem chi tiết sản phẩm`,
    CPS.brand);

  const filePath = path.join(process.cwd(), "assets", "temp", `cellphones_search_${Date.now()}.png`);
  await writeFilePromise(filePath, canvas.toBuffer("image/png"));
  return filePath;
}

// ===== Detail canvas =====
async function createDetailCanvas(item, detail, thumb) {
  const W = 960,
    PAD = 20,
    HEADER_H = 56,
    IMG_SIZE = 280,
    CARD_PAD = 16,
    IMG_GAP = 24;
  const infoX = PAD + CARD_PAD + IMG_SIZE + IMG_GAP;
  const infoW = W - infoX - PAD - CARD_PAD;

  const tempCtx = createCanvas(W, 1).getContext("2d");
  tempCtx.font = `bold 22px ${getFontCanvas(item.name)}`;
  const titleLines = wrapLines(tempCtx, item.name, infoW - CARD_PAD * 2, 4);

  const specs = (detail?.specs || []).slice(0, 20);
  const promos = (detail?.promos || []).slice(0, 6);
  tempCtx.font = `14px ${FONT_MAIN}`;
  const descLines = detail?.description
    ? wrapLines(tempCtx, detail.description, W - PAD * 4, 10)
    : [];

  const discount = fmtDiscount(item.price, item.oldPrice);

  // Pre-compute spec row layout (label hẹp bên trái, value rộng bên phải, wrap multi-line)
  const SPEC_INNER_W = W - PAD * 2 - CARD_PAD * 2;
  const SPEC_LABEL_W = Math.floor(SPEC_INNER_W * 0.30);
  const SPEC_VALUE_W = SPEC_INNER_W - SPEC_LABEL_W;
  const SPEC_PAD_X = 14;
  const SPEC_PAD_Y = 12;
  const SPEC_LINE_H = 20;
  const specRows = specs.map((s) => {
    tempCtx.font = `bold 14px ${FONT_MAIN}`;
    const labelLines = wrapLines(tempCtx, s.label, SPEC_LABEL_W - SPEC_PAD_X * 2, 3);
    tempCtx.font = `14px ${getFontCanvas(s.value)}`;
    const valueLines = wrapLines(tempCtx, s.value, SPEC_VALUE_W - SPEC_PAD_X * 2, 5);
    const rowH = Math.max(labelLines.length, valueLines.length) * SPEC_LINE_H + SPEC_PAD_Y * 2;
    return { labelLines, valueLines, rowH };
  });
  const specsBodyH = specRows.reduce((s, r) => s + r.rowH, 0);

  // right column height
  let rightH = CARD_PAD;
  if (discount) rightH += 26;
  rightH += titleLines.length * 28 + 8;
  if ((detail?.rating || 0) > 0) rightH += 26;
  rightH += 52; // price
  if (item.oldPrice) rightH += 22;
  if (item.installment) rightH += 22;
  rightH += 10; // divider
  const metaRows = [
    item.promotion ? { label: "🎁 Khuyến mại", val: item.promotion } : null,
    item.url ? { label: "🔗 Link", val: item.url.replace(/^https?:\/\//, "") } : null,
  ].filter(Boolean);
  rightH += metaRows.length * 30 + CARD_PAD;

  const topCardH = Math.max(IMG_SIZE + CARD_PAD * 2, rightH);
  const topBodyH = HEADER_H + PAD + topCardH + PAD;
  const promoH = promos.length ? 40 + promos.length * 26 + CARD_PAD : 0;
  const specH = specs.length ? 44 + specsBodyH + CARD_PAD : 0;
  const descH = descLines.length ? 40 + descLines.length * 22 + CARD_PAD : 0;
  const H =
    topBodyH +
    (promoH > 0 ? PAD + promoH : 0) +
    (specH > 0 ? PAD + specH : 0) +
    (descH > 0 ? PAD + descH : 0) +
    PAD;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = CPS.bg;
  ctx.fillRect(0, 0, W, H);

  // Header
  const hg = ctx.createLinearGradient(0, 0, W, 0);
  hg.addColorStop(0, CPS.brand);
  hg.addColorStop(1, CPS.brandLight);
  ctx.fillStyle = hg;
  ctx.fillRect(0, 0, W, HEADER_H);
  ctx.fillStyle = "#fff";
  ctx.font = `bold 26px ${FONT_MAIN}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("📱 CHI TIẾT SẢN PHẨM CELLPHONES", W / 2, HEADER_H / 2);

  const cardY = HEADER_H + PAD;
  drawCard(ctx, PAD, cardY, W - PAD * 2, topCardH, 10);

  // Thumbnail
  const thumbY = cardY + CARD_PAD;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(PAD + CARD_PAD, thumbY, IMG_SIZE, IMG_SIZE, 10);
  ctx.clip();
  if (thumb) ctx.drawImage(thumb, PAD + CARD_PAD, thumbY, IMG_SIZE, IMG_SIZE);
  else {
    ctx.fillStyle = CPS.bg;
    ctx.fillRect(PAD + CARD_PAD, thumbY, IMG_SIZE, IMG_SIZE);
  }
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = CPS.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(PAD + CARD_PAD, thumbY, IMG_SIZE, IMG_SIZE, 10);
  ctx.stroke();
  ctx.restore();

  const rx = infoX;
  let iy = cardY + CARD_PAD;
  ctx.textAlign = "left";

  // Discount badge
  if (discount) {
    ctx.fillStyle = CPS.brand;
    ctx.beginPath();
    ctx.roundRect(rx, iy, 80, 22, 3);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `bold 13px ${FONT_MAIN}`;
    ctx.textBaseline = "middle";
    ctx.fillText(`GIẢM ${discount}`, rx + 8, iy + 11);
    iy += 28;
  }

  // Title
  ctx.font = `bold 22px ${getFontCanvas(item.name)}`;
  ctx.fillStyle = CPS.text;
  ctx.textBaseline = "top";
  for (const ln of titleLines) {
    ctx.fillText(ln, rx, iy);
    iy += 28;
  }
  iy += 8;

  // Rating
  if (detail?.rating > 0) {
    const filled = Math.round(detail.rating);
    const starStr = "★".repeat(filled) + "☆".repeat(Math.max(0, 5 - filled));
    ctx.font = `15px ${FONT_MAIN}`;
    ctx.fillStyle = CPS.yellow;
    ctx.fillText(`${starStr}  ${detail.rating.toFixed(1)}`, rx, iy);
    if (detail.ratingCount) {
      const sw = ctx.measureText(`${starStr}  ${detail.rating.toFixed(1)}`).width;
      ctx.fillStyle = CPS.textSub;
      ctx.fillText(`  ·  ${detail.ratingCount.toLocaleString()} đánh giá`, rx + sw, iy);
    }
    iy += 26;
  }

  // Price
  ctx.font = `bold 34px ${FONT_MAIN}`;
  ctx.fillStyle = CPS.price;
  ctx.fillText(fmtVnd(item.price), rx, iy);
  iy += 44;
  if (item.oldPrice && item.oldPrice > item.price) {
    ctx.font = `15px ${FONT_MAIN}`;
    ctx.fillStyle = CPS.oldPrice;
    const oldStr = fmtVnd(item.oldPrice);
    ctx.fillText(oldStr, rx, iy);
    const ow = ctx.measureText(oldStr).width;
    ctx.strokeStyle = CPS.oldPrice;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rx, iy + 9);
    ctx.lineTo(rx + ow, iy + 9);
    ctx.stroke();
    iy += 22;
  }
  if (item.installment) {
    ctx.font = `14px ${FONT_MAIN}`;
    ctx.fillStyle = CPS.green;
    const monthly = Math.round(item.price / 12 / 1000) * 1000;
    ctx.fillText(`💳 Trả góp 0%: 12 tháng × ${fmtVnd(monthly)}`, rx, iy);
    iy += 22;
  }

  // Divider
  ctx.strokeStyle = CPS.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rx, iy);
  ctx.lineTo(W - PAD - CARD_PAD, iy);
  ctx.stroke();
  iy += 10;

  // Meta rows
  ctx.font = `14px ${FONT_MAIN}`;
  ctx.textBaseline = "top";
  for (const r of metaRows) {
    ctx.fillStyle = CPS.textSub;
    ctx.fillText(r.label + ":", rx, iy);
    const lw = ctx.measureText(r.label + ":").width + 8;
    ctx.fillStyle = CPS.text;
    ctx.fillText(wrapText(ctx, r.val, infoW - lw - CARD_PAD), rx + lw, iy);
    iy += 30;
  }

  let curY = topBodyH;

  // Promotions section
  if (promos.length > 0) {
    drawCard(ctx, PAD, curY, W - PAD * 2, promoH, 10);
    sectionHeader(ctx, PAD + CARD_PAD, curY + CARD_PAD, "🎁 KHUYẾN MẠI HẤP DẪN");
    let py = curY + 44;
    ctx.font = `14px ${FONT_MAIN}`;
    ctx.textBaseline = "top";
    for (let i = 0; i < promos.length; i++) {
      if (i % 2 === 0) {
        ctx.fillStyle = CPS.brandBg;
        ctx.fillRect(PAD + CARD_PAD - 4, py - 2, W - PAD * 2 - CARD_PAD * 2 + 8, 24);
      }
      ctx.fillStyle = CPS.text;
      ctx.fillText(wrapText(ctx, "• " + promos[i], W - PAD * 2 - CARD_PAD * 2), PAD + CARD_PAD, py);
      py += 26;
    }
    curY += promoH + PAD;
  }

  // Specs section — table 2 cột, value wrap multi-line
  if (specs.length > 0) {
    drawCard(ctx, PAD, curY, W - PAD * 2, specH, 10);
    sectionHeader(ctx, PAD + CARD_PAD, curY + CARD_PAD, "📋 THÔNG SỐ KỸ THUẬT");
    let ay = curY + 44;
    const tableX = PAD + CARD_PAD;
    const valueX = tableX + SPEC_LABEL_W;
    for (let i = 0; i < specRows.length; i++) {
      const r = specRows[i];
      // Zebra stripe
      if (i % 2 === 0) {
        ctx.fillStyle = CPS.bg;
        ctx.fillRect(tableX, ay, SPEC_INNER_W, r.rowH);
      }
      // Label
      ctx.font = `bold 14px ${FONT_MAIN}`;
      ctx.fillStyle = CPS.textSub;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      let ly = ay + SPEC_PAD_Y;
      for (const ln of r.labelLines) {
        ctx.fillText(ln, tableX + SPEC_PAD_X, ly);
        ly += SPEC_LINE_H;
      }
      // Value
      ctx.font = `14px ${getFontCanvas(r.valueLines[0] || "")}`;
      ctx.fillStyle = CPS.text;
      let vy = ay + SPEC_PAD_Y;
      for (const ln of r.valueLines) {
        ctx.fillText(ln, valueX + SPEC_PAD_X, vy);
        vy += SPEC_LINE_H;
      }
      // Horizontal row divider
      ctx.strokeStyle = CPS.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tableX, ay + r.rowH);
      ctx.lineTo(tableX + SPEC_INNER_W, ay + r.rowH);
      ctx.stroke();
      // Vertical separator giữa label và value
      ctx.beginPath();
      ctx.moveTo(valueX, ay);
      ctx.lineTo(valueX, ay + r.rowH);
      ctx.stroke();
      ay += r.rowH;
    }
    // Border ngoài table
    ctx.strokeStyle = CPS.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(tableX, curY + 44, SPEC_INNER_W, specsBodyH);
    curY += specH + PAD;
  }

  // Description section
  if (descLines.length > 0) {
    drawCard(ctx, PAD, curY, W - PAD * 2, descH, 10);
    sectionHeader(ctx, PAD + CARD_PAD, curY + CARD_PAD, "📝 MÔ TẢ SẢN PHẨM");
    let dy = curY + 46;
    ctx.font = `14px ${FONT_MAIN}`;
    ctx.fillStyle = CPS.textSub;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    for (const ln of descLines) {
      ctx.fillText(ln, PAD + CARD_PAD, dy);
      dy += 22;
    }
  }

  const filePath = path.join(process.cwd(), "assets", "temp", `cellphones_detail_${Date.now()}.png`);
  await writeFilePromise(filePath, canvas.toBuffer("image/png"));
  return filePath;
}

// ===== Process detail reply (gọi khi user nhập số) =====
export async function processCellphonesDetailReply(api, message, item) {
  if (!item) return;
  let thumb = null;
  if (item.thumbnail) {
    try {
      thumb = await loadImageWithRetry(item.thumbnail, 2, 8000);
    } catch {}
  }
  const detail = await fetchCellphonesDetail(item.url);

  let imagePath = null;
  try {
    imagePath = await createDetailCanvas(item, detail, thumb);
  } catch (err) {
    console.error("[cellphones-detail] canvas error:", err);
  }

  if (imagePath) {
    const caption = `📱 ${item.name}\n💰 ${fmtVnd(item.price)}\n🔗 ${item.url}`;
    await sendMessageTag(api, message, { caption, imagePath }, 300000);
    await deleteFile(imagePath).catch(() => {});
  } else {
    await sendMessageComplete(
      api,
      message,
      `📱 ${item.name}\n💰 ${fmtVnd(item.price)}\n🔗 ${item.url}`,
      false,
      300000
    );
  }
}

// ===== Main command handler =====
export async function handleCellphonesSearchCommand(api, message, aliasCommand) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const commandContent = content.replace(`${prefix}${aliasCommand}`, "").trim();
  const [keyword, totalStr] = commandContent.split("&&");
  const total = Math.min(20, Math.max(5, parseInt(totalStr?.trim()) || 8));
  const kw = keyword?.trim();

  if (!kw) {
    await sendMessageComplete(
      api,
      message,
      `📱 TÌM KIẾM SẢN PHẨM CELLPHONES\n\nCú pháp: ${prefix}${aliasCommand} [tên sản phẩm] &&[số lượng]\nVí dụ: ${prefix}${aliasCommand} iphone 15\n       ${prefix}${aliasCommand} samsung s24 &&12`,
      false,
      60000
    );
    return;
  }

  let items;
  try {
    items = await searchCellphones(kw, total);
  } catch (err) {
    const errMsg = err?.message || "";
    console.error(`[cellphones-search] Lỗi: ${errMsg}`);
    await sendMessageFailed(
      api,
      message,
      `❌ Không thể tìm trên CellphoneS. Vui lòng thử lại sau.\n(${errMsg.slice(0, 80)})`,
      true,
      30000
    );
    return;
  }

  if (!items || items.length === 0) {
    await sendMessageWarning(api, message, `Không tìm thấy sản phẩm cho: "${kw}"`, false, 30000);
    return;
  }

  let imagePath;
  try {
    imagePath = await createSearchCanvas(items, 0);
  } catch (err) {
    console.error("[cellphones-search] canvas error:", err);
    // Fallback text
    let text = `📱 KẾT QUẢ CELLPHONES: "${kw}"\n\n`;
    items.forEach((it, i) => {
      text += `${i + 1}. ${it.name?.slice(0, 60)}\n   💰 ${fmtVnd(it.price)}\n\n`;
    });
    await sendMessageComplete(api, message, text.trimEnd(), false, TIME_TO_SELECT);
    setSelectionsMapData(message.data.uidFrom, {
      collection: items,
      quotedMsgId: null,
      platform: PLATFORM_CELLPHONES,
    });
    return;
  }

  const caption = `Tìm thấy ${items.length} sản phẩm · Nhập số 1–${items.length} để xem chi tiết`;
  const sendResult = await sendMessageTag(api, message, { caption, imagePath }, TIME_TO_SELECT);
  await deleteFile(imagePath).catch(() => {});

  const quotedMsgId = sendResult?.message?.msgId || sendResult?.attachment?.[0]?.msgId || null;
  setSelectionsMapData(message.data.uidFrom, {
    collection: items,
    quotedMsgId: quotedMsgId ? quotedMsgId.toString() : null,
    platform: PLATFORM_CELLPHONES,
  });
}
