import { randomUUID } from "crypto";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import Big from "big.js";
import { createCanvas, registerFont } from "canvas";
import { formatCurrency } from "../../../utils/format-util.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../");
try {
  registerFont(path.join(ROOT, "assets/fonts/Sora-Variable.ttf"), { family: "StockSora" });
  registerFont(path.join(ROOT, "assets/fonts/Manrope-Variable.ttf"), { family: "StockManrope" });
} catch {}

const COMPANY = {
  SUNWIN: "SunWin", HITCLUB: "HitClub", HUNG: "Hưng Group",
  HUN: "Hun Group", MESSI: "Messi Club", RONALDO: "Ronaldo Club",
};
const COLORS = {
  bg: "#080b0d", panel: "#101518", border: "#283036", text: "#f6f1e7",
  muted: "#858d91", grid: "rgba(169,181,184,.10)", gold: "#f2c15c",
  green: "#48d597", red: "#ff6675",
};

function rounded(ctx, x, y, width, height, radius, fill, stroke = null) {
  ctx.beginPath(); ctx.roundRect(x, y, width, height, radius);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

function label(ctx, value, x, y, size = 18, color = COLORS.text, align = "left", weight = 600, family = "StockManrope") {
  ctx.font = `${weight} ${size}px ${family}`; ctx.fillStyle = color; ctx.textAlign = align;
  ctx.textBaseline = "middle"; ctx.fillText(String(value), x, y);
}

function compact(value) {
  const amount = new Big(value || 0), abs = amount.abs();
  for (const [suffix, divisor] of [["T", "1000000000000"], ["B", "1000000000"], ["M", "1000000"], ["K", "1000"]]) {
    if (abs.gte(divisor)) return `${amount.div(divisor).toFixed(2).replace(/\.00$/u, "")}${suffix}`;
  }
  return formatCurrency(amount);
}

function marketChange(history = []) {
  if (history.length < 2) return 0;
  const first = Number(history[0]), last = Number(history.at(-1));
  return first ? (last - first) / first * 100 : 0;
}

function portfolioStats(portfolio, market) {
  const holdings = portfolio?.holdings || {};
  let value = new Big(0), cost = new Big(0);
  for (const [symbol, holding] of Object.entries(holdings)) {
    value = value.plus(new Big(holding.qty || 0).times(market.prices[symbol] || 0));
    cost = cost.plus(holding.cost || 0);
  }
  return { holdings, value, pnl: value.minus(cost), count: Object.keys(holdings).length };
}

function drawBackground(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#171408"); gradient.addColorStop(.42, COLORS.bg); gradient.addColorStop(1, "#071011");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(210, 60, 10, 210, 60, 500);
  glow.addColorStop(0, "rgba(242,193,92,.15)"); glow.addColorStop(1, "rgba(242,193,92,0)");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
}

function drawHeader(ctx, data, width) {
  label(ctx, "NGH", 42, 39, 17, COLORS.gold, "left", 800, "StockSora");
  label(ctx, "STOCK EXCHANGE", 88, 39, 22, COLORS.text, "left", 720, "StockSora");
  rounded(ctx, 315, 22, 98, 33, 17, "rgba(242,193,92,.10)", "rgba(242,193,92,.27)");
  label(ctx, "VIRTUAL", 364, 39, 11, COLORS.gold, "center", 800, "StockSora");
  label(ctx, `${data.playerName}  •  5M  •  PAPER MARKET`, width - 42, 39, 13, COLORS.muted, "right", 600);
  ctx.strokeStyle = COLORS.border; ctx.beginPath(); ctx.moveTo(32, 70); ctx.lineTo(width - 32, 70); ctx.stroke();
}

function drawAccountStrip(ctx, data, stats) {
  const netWorth = new Big(data.wallet || 0).plus(stats.value);
  const cards = [
    ["WALLET", data.wallet || 0, COLORS.text], ["PORTFOLIO", stats.value, COLORS.gold],
    ["NET WORTH", netWorth, COLORS.text], ["UNREALIZED P/L", stats.pnl, stats.pnl.gte(0) ? COLORS.green : COLORS.red],
  ];
  cards.forEach(([title, value, color], index) => {
    const x = 32 + index * 214;
    rounded(ctx, x, 86, 198, 70, 12, "rgba(16,21,24,.91)", COLORS.border);
    label(ctx, title, x + 15, 108, 11, COLORS.muted, "left", 700, "StockSora");
    const prefix = title === "UNREALIZED P/L" && new Big(value).gt(0) ? "+" : "";
    label(ctx, `${prefix}${compact(value)} ₫`, x + 15, 137, 20, color, "left", 760, "StockSora");
  });
}

function drawPriceChart(ctx, data, x, y, width, height) {
  const symbol = data.symbol;
  const history = data.market.history?.[symbol]?.slice(-48) || [data.market.prices[symbol]];
  const current = Number(data.market.prices[symbol]), change = marketChange(history);
  const color = change >= 0 ? COLORS.green : COLORS.red;
  rounded(ctx, x, y, width, height, 14, "rgba(10,14,16,.94)", COLORS.border);
  label(ctx, symbol, x + 22, y + 29, 24, COLORS.text, "left", 800, "StockSora");
  label(ctx, COMPANY[symbol] || symbol, x + 150, y + 30, 12, COLORS.muted, "left", 600);
  label(ctx, `${formatCurrency(current)} ₫`, x + width - 22, y + 25, 27, color, "right", 780, "StockSora");
  label(ctx, `${change >= 0 ? "+" : ""}${change.toFixed(2)}% · 4H`, x + width - 22, y + 51, 12, color, "right", 700);
  const chartX = x + 22, chartY = y + 72, chartW = width - 84, chartH = height - 104;
  const min = Math.min(...history), max = Math.max(...history), range = max - min || 1;
  ctx.strokeStyle = COLORS.grid;
  for (let index = 0; index <= 5; index++) {
    const gy = chartY + index * chartH / 5;
    ctx.beginPath(); ctx.moveTo(chartX, gy); ctx.lineTo(chartX + chartW, gy); ctx.stroke();
    label(ctx, formatCurrency(max - index * range / 5), chartX + chartW + 54, gy, 10, COLORS.muted, "right", 550);
  }
  for (let index = 0; index <= 8; index++) {
    const gx = chartX + index * chartW / 8;
    ctx.beginPath(); ctx.moveTo(gx, chartY); ctx.lineTo(gx, chartY + chartH); ctx.stroke();
  }
  const point = (value, index) => ({ x: chartX + index / Math.max(1, history.length - 1) * chartW, y: chartY + (max - value) / range * chartH });
  const area = ctx.createLinearGradient(0, chartY, 0, chartY + chartH);
  area.addColorStop(0, `${color}4d`); area.addColorStop(1, `${color}00`);
  ctx.beginPath(); history.forEach((value, index) => { const p = point(value, index); index ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
  ctx.lineTo(chartX + chartW, chartY + chartH); ctx.lineTo(chartX, chartY + chartH); ctx.closePath(); ctx.fillStyle = area; ctx.fill();
  ctx.beginPath(); history.forEach((value, index) => { const p = point(value, index); index ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
  ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = "round"; ctx.stroke();
  const last = point(history.at(-1), history.length - 1);
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(last.x, last.y, 4, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeStyle = color; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(chartX, last.y); ctx.lineTo(chartX + chartW, last.y); ctx.stroke(); ctx.restore();
}

function drawWatchlist(ctx, data) {
  const x = 900, y = 86, width = 268, height = 438;
  rounded(ctx, x, y, width, height, 14, "rgba(16,21,24,.95)", COLORS.border);
  label(ctx, "MARKET WATCH", x + 18, y + 27, 13, COLORS.text, "left", 760, "StockSora");
  label(ctx, "SYMBOL", x + 18, y + 57, 10, COLORS.muted, "left", 700);
  label(ctx, "PRICE", x + 174, y + 57, 10, COLORS.muted, "right", 700);
  label(ctx, "4H", x + 247, y + 57, 10, COLORS.muted, "right", 700);
  Object.entries(data.market.prices).forEach(([symbol, price], index) => {
    const rowY = y + 95 + index * 55, change = marketChange(data.market.history?.[symbol] || []);
    const color = change >= 0 ? COLORS.green : COLORS.red;
    if (symbol === data.symbol) rounded(ctx, x + 10, rowY - 21, width - 20, 44, 9, "rgba(242,193,92,.10)", "rgba(242,193,92,.25)");
    label(ctx, symbol, x + 18, rowY - 5, 15, symbol === data.symbol ? COLORS.gold : COLORS.text, "left", 760, "StockSora");
    label(ctx, COMPANY[symbol] || symbol, x + 18, rowY + 13, 9, COLORS.muted, "left", 550);
    label(ctx, formatCurrency(price), x + 174, rowY - 2, 14, COLORS.text, "right", 650);
    label(ctx, `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`, x + 247, rowY - 2, 12, color, "right", 750);
  });
}

function drawHoldings(ctx, data, stats) {
  const x = 32, y = 544, width = 1136, height = 244;
  rounded(ctx, x, y, width, height, 14, "rgba(16,21,24,.96)", COLORS.border);
  label(ctx, "MY PORTFOLIO", x + 18, y + 27, 13, COLORS.text, "left", 760, "StockSora");
  label(ctx, `${stats.count} HOLDINGS`, x + width - 18, y + 27, 11, COLORS.muted, "right", 700);
  [["SYMBOL", 18], ["SHARES", 190], ["AVG PRICE", 340], ["MARKET PRICE", 525], ["VALUE", 720], ["P/L", 930]]
    .forEach(([title, offset]) => label(ctx, title, x + offset, y + 58, 10, COLORS.muted, "left", 700));
  const rows = Object.entries(stats.holdings).map(([symbol, holding]) => {
    const quantity = new Big(holding.qty || 0), cost = new Big(holding.cost || 0);
    const value = quantity.times(data.market.prices[symbol] || 0);
    return { symbol, quantity, value, pnl: value.minus(cost), average: quantity.gt(0) ? cost.div(quantity) : new Big(0) };
  }).sort((a, b) => b.value.cmp(a.value));
  if (!rows.length) {
    label(ctx, "PORTFOLIO IS EMPTY", x + width / 2, y + 132, 20, COLORS.muted, "center", 720, "StockSora");
    label(ctx, "Dùng .game cophieuao mua HUNG 1m để mua cổ phiếu đầu tiên", x + width / 2, y + 164, 12, "#596268", "center", 550);
    return;
  }
  rows.slice(0, 5).forEach((row, index) => {
    const rowY = y + 86 + index * 35, positive = row.pnl.gte(0);
    if (index % 2 === 0) rounded(ctx, x + 10, rowY - 16, width - 20, 32, 7, "rgba(255,255,255,.018)");
    label(ctx, row.symbol, x + 18, rowY, 12, COLORS.gold, "left", 760, "StockSora");
    label(ctx, formatCurrency(row.quantity), x + 190, rowY, 12, COLORS.text, "left", 600);
    label(ctx, `${formatCurrency(row.average.round(0))} ₫`, x + 340, rowY, 12, COLORS.text, "left", 600);
    label(ctx, `${formatCurrency(data.market.prices[row.symbol])} ₫`, x + 525, rowY, 12, COLORS.text, "left", 600);
    label(ctx, `${compact(row.value)} ₫`, x + 720, rowY, 12, COLORS.text, "left", 650);
    label(ctx, `${positive ? "+" : ""}${compact(row.pnl)} ₫`, x + 930, rowY, 12, positive ? COLORS.green : COLORS.red, "left", 750);
  });
}

/** Terminal cổ phiếu ảo: chart, watchlist và danh mục trong cùng một canvas. */
export async function createVirtualStockMarketImage(input) {
  const data = input?.market ? input : { market: input, symbol: "HUNG", portfolio: { holdings: {} }, wallet: 0, playerName: "Nhà đầu tư" };
  data.symbol = data.market.prices[data.symbol] ? data.symbol : Object.keys(data.market.prices)[0];
  const stats = portfolioStats(data.portfolio, data.market);
  const width = 1200, height = 820, canvas = createCanvas(width, height), ctx = canvas.getContext("2d");
  drawBackground(ctx, width, height); drawHeader(ctx, data, width); drawAccountStrip(ctx, data, stats);
  drawPriceChart(ctx, data, 32, 174, 846, 350); drawWatchlist(ctx, data); drawHoldings(ctx, data, stats);
  label(ctx, "VIRTUAL MARKET • GIÁ CẬP NHẬT MỖI 5 PHÚT", width - 35, height - 14, 9, "#535b5f", "right", 650, "StockSora");
  const output = path.join(os.tmpdir(), `virtual-stock-${randomUUID()}.png`);
  await fs.writeFile(output, canvas.toBuffer("image/png"));
  return output;
}
