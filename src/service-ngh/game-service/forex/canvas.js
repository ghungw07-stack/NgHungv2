import fs from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import Big from "big.js";
import { createCanvas, registerFont } from "canvas";
import { randomUUID } from "crypto";
import { formatCurrency } from "../../../utils/format-util.js";
import { FOREX_PAIRS, formatForexPrice } from "./rules.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../");
try {
  registerFont(path.join(ROOT, "assets/fonts/Sora-Variable.ttf"), { family: "ForexSora" });
  registerFont(path.join(ROOT, "assets/fonts/Manrope-Variable.ttf"), { family: "ForexManrope" });
} catch {}

const COLORS = {
  bg: "#070b13",
  panel: "#0d1420",
  panel2: "#111b29",
  border: "#1d2c3e",
  text: "#f4f7fb",
  muted: "#75859a",
  grid: "rgba(111, 139, 166, 0.10)",
  green: "#26e6a6",
  red: "#ff5f72",
  cyan: "#49b8ff",
  yellow: "#f5c65d",
};

function rounded(ctx, x, y, width, height, radius, fill, stroke = null) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

function label(ctx, value, x, y, size = 18, color = COLORS.text, align = "left", weight = 600, family = "ForexManrope") {
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(String(value), x, y);
}

function compact(value) {
  const number = new Big(value || 0);
  const abs = number.abs();
  const units = [["T", "1000000000000"], ["B", "1000000000"], ["M", "1000000"], ["K", "1000"]];
  for (const [suffix, divisor] of units) {
    if (abs.gte(divisor)) return `${number.div(divisor).toFixed(2).replace(/\.00$/u, "")}${suffix}`;
  }
  return formatCurrency(number);
}

function pairChange(candles) {
  if (!candles?.length) return 0;
  const first = Number(candles[0].o || candles[0].c);
  const last = Number(candles.at(-1).c);
  return first ? (last - first) / first * 100 : 0;
}

function drawBackground(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#09111d");
  gradient.addColorStop(0.55, COLORS.bg);
  gradient.addColorStop(1, "#061018");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(220, 80, 10, 220, 80, 480);
  glow.addColorStop(0, "rgba(43, 181, 255, 0.13)");
  glow.addColorStop(1, "rgba(43, 181, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
}

function drawHeader(ctx, data, width) {
  label(ctx, "NGH", 42, 39, 17, COLORS.cyan, "left", 800, "ForexSora");
  label(ctx, "FOREX TERMINAL", 88, 39, 22, COLORS.text, "left", 700, "ForexSora");
  rounded(ctx, 300, 22, 76, 33, 17, "rgba(38,230,166,.11)", "rgba(38,230,166,.26)");
  label(ctx, "LIVE", 338, 39, 12, COLORS.green, "center", 800, "ForexSora");
  label(ctx, `${data.playerName}  •  M1  •  DEMO MARKET`, width - 42, 39, 13, COLORS.muted, "right", 600);
  ctx.strokeStyle = COLORS.border;
  ctx.beginPath(); ctx.moveTo(32, 70); ctx.lineTo(width - 32, 70); ctx.stroke();
}

function drawAccountStrip(ctx, data) {
  const positions = data.positions || [];
  const margin = positions.reduce((sum, position) => sum.plus(position.margin || 0), new Big(0));
  const floating = positions.reduce((sum, position) => sum.plus(position.pnl || 0), new Big(0));
  const equity = new Big(data.wallet || 0).plus(margin).plus(floating);
  const cards = [
    ["BALANCE", data.wallet || 0, COLORS.text],
    ["EQUITY", equity, floating.gte(0) ? COLORS.green : COLORS.red],
    ["USED MARGIN", margin, COLORS.yellow],
    ["FLOATING P/L", floating, floating.gte(0) ? COLORS.green : COLORS.red],
  ];
  cards.forEach(([title, value, color], index) => {
    const x = 32 + index * 214;
    rounded(ctx, x, 86, 198, 70, 12, "rgba(13,20,32,.88)", COLORS.border);
    label(ctx, title, x + 15, 108, 11, COLORS.muted, "left", 700, "ForexSora");
    label(ctx, `${value instanceof Big && value.gt(0) && title === "FLOATING P/L" ? "+" : ""}${compact(value)} ₫`, x + 15, 137, 20, color, "left", 750, "ForexSora");
  });
}

function drawWatchlist(ctx, market, selectedPair) {
  const x = 900, y = 86, width = 268, height = 438;
  rounded(ctx, x, y, width, height, 14, "rgba(13,20,32,.94)", COLORS.border);
  label(ctx, "MARKET WATCH", x + 18, y + 27, 13, COLORS.text, "left", 750, "ForexSora");
  label(ctx, "SYMBOL", x + 18, y + 57, 10, COLORS.muted, "left", 700);
  label(ctx, "PRICE", x + 174, y + 57, 10, COLORS.muted, "right", 700);
  label(ctx, "24H", x + 247, y + 57, 10, COLORS.muted, "right", 700);
  Object.keys(FOREX_PAIRS).forEach((pair, index) => {
    const rowY = y + 95 + index * 55;
    const change = pairChange(market.candles?.[pair]);
    const color = change >= 0 ? COLORS.green : COLORS.red;
    if (pair === selectedPair) rounded(ctx, x + 10, rowY - 21, width - 20, 44, 9, "rgba(73,184,255,.10)", "rgba(73,184,255,.23)");
    label(ctx, pair, x + 18, rowY - 5, 15, pair === selectedPair ? COLORS.cyan : COLORS.text, "left", 750, "ForexSora");
    label(ctx, FOREX_PAIRS[pair].name.split(" / ")[0], x + 18, rowY + 13, 9, COLORS.muted, "left", 550);
    label(ctx, formatForexPrice(pair, market.prices[pair]), x + 174, rowY - 2, 14, COLORS.text, "right", 650);
    label(ctx, `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`, x + 247, rowY - 2, 12, color, "right", 750);
  });
}

function drawCandles(ctx, data, x, y, width, height) {
  const pair = data.pair;
  const candles = (data.market.candles?.[pair] || []).slice(-48);
  const current = Number(data.market.prices[pair]);
  const change = pairChange(candles);
  const color = change >= 0 ? COLORS.green : COLORS.red;
  const pairQuote = FOREX_PAIRS[pair];
  rounded(ctx, x, y, width, height, 14, "rgba(9,15,25,.93)", COLORS.border);

  label(ctx, pair, x + 22, y + 29, 24, COLORS.text, "left", 780, "ForexSora");
  label(ctx, pairQuote.name, x + 145, y + 30, 12, COLORS.muted, "left", 600);
  label(ctx, formatForexPrice(pair, current), x + width - 22, y + 25, 27, color, "right", 780, "ForexSora");
  label(ctx, `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`, x + width - 22, y + 51, 12, color, "right", 700);

  const chartX = x + 22, chartY = y + 68, chartW = width - 82, chartH = height - 92;
  const values = candles.flatMap((candle) => [Number(candle.h), Number(candle.l)]);
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1;
  for (let index = 0; index <= 5; index++) {
    const gy = chartY + index * chartH / 5;
    ctx.beginPath(); ctx.moveTo(chartX, gy); ctx.lineTo(chartX + chartW, gy); ctx.stroke();
    const price = max - index * range / 5;
    label(ctx, formatForexPrice(pair, price), chartX + chartW + 52, gy, 10, COLORS.muted, "right", 550);
  }
  for (let index = 0; index <= 8; index++) {
    const gx = chartX + index * chartW / 8;
    ctx.beginPath(); ctx.moveTo(gx, chartY); ctx.lineTo(gx, chartY + chartH); ctx.stroke();
  }

  const slot = chartW / Math.max(1, candles.length);
  candles.forEach((candle, index) => {
    const open = Number(candle.o), close = Number(candle.c), high = Number(candle.h), low = Number(candle.l);
    const up = close >= open, candleColor = up ? COLORS.green : COLORS.red;
    const cx = chartX + index * slot + slot / 2;
    const priceY = (price) => chartY + (max - price) / range * chartH;
    ctx.strokeStyle = candleColor; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(cx, priceY(high)); ctx.lineTo(cx, priceY(low)); ctx.stroke();
    const top = Math.min(priceY(open), priceY(close));
    const bodyHeight = Math.max(2, Math.abs(priceY(open) - priceY(close)));
    ctx.fillStyle = candleColor;
    ctx.fillRect(cx - Math.max(2, slot * 0.28), top, Math.max(4, slot * 0.56), bodyHeight);
  });

  const lastY = chartY + (max - current) / range * chartH;
  ctx.save();
  ctx.setLineDash([5, 5]); ctx.strokeStyle = color; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(chartX, lastY); ctx.lineTo(chartX + chartW, lastY); ctx.stroke();
  ctx.restore();
}

function drawPositions(ctx, positions) {
  const x = 32, y = 544, width = 1136, height = 244;
  rounded(ctx, x, y, width, height, 14, "rgba(13,20,32,.95)", COLORS.border);
  label(ctx, "OPEN POSITIONS", x + 18, y + 27, 13, COLORS.text, "left", 750, "ForexSora");
  label(ctx, `${positions.length}/5 ACTIVE`, x + width - 18, y + 27, 11, COLORS.muted, "right", 700);
  const headers = [["TICKET", 18], ["PAIR / SIDE", 145], ["MARGIN", 340], ["ENTRY", 515], ["NOW", 680], ["P/L", 835], ["ROE", 1010]];
  headers.forEach(([title, offset]) => label(ctx, title, x + offset, y + 58, 10, COLORS.muted, "left", 700));

  if (!positions.length) {
    label(ctx, "NO OPEN POSITIONS", x + width / 2, y + 132, 20, COLORS.muted, "center", 700, "ForexSora");
    label(ctx, "Dùng .game forex buy EURUSD 1m x25 để mở lệnh đầu tiên", x + width / 2, y + 164, 12, "#536579", "center", 550);
    return;
  }

  positions.slice(0, 5).forEach((position, index) => {
    const rowY = y + 86 + index * 35;
    const positive = new Big(position.pnl || 0).gte(0);
    const sideColor = position.side === "buy" ? COLORS.green : COLORS.red;
    if (index % 2 === 0) rounded(ctx, x + 10, rowY - 16, width - 20, 32, 7, "rgba(255,255,255,.018)");
    label(ctx, `#${position._id}`, x + 18, rowY, 12, COLORS.text, "left", 650);
    label(ctx, `${position.pair}  ${position.side.toUpperCase()} x${position.leverage}`, x + 145, rowY, 12, sideColor, "left", 750);
    label(ctx, `${compact(position.margin)} ₫`, x + 340, rowY, 12, COLORS.text, "left", 600);
    label(ctx, formatForexPrice(position.pair, position.entryPrice), x + 515, rowY, 12, COLORS.text, "left", 600);
    label(ctx, formatForexPrice(position.pair, position.exitPrice), x + 680, rowY, 12, COLORS.text, "left", 600);
    label(ctx, `${positive ? "+" : ""}${compact(position.pnl)} ₫`, x + 835, rowY, 12, positive ? COLORS.green : COLORS.red, "left", 750);
    label(ctx, `${new Big(position.pnlPercent || 0).gte(0) ? "+" : ""}${new Big(position.pnlPercent || 0).toFixed(2)}%`, x + 1010, rowY, 12, positive ? COLORS.green : COLORS.red, "left", 750);
  });
}

export async function createForexTerminalImage(data) {
  const width = 1200, height = 820;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  drawBackground(ctx, width, height);
  drawHeader(ctx, data, width);
  drawAccountStrip(ctx, data);
  drawCandles(ctx, data, 32, 174, 846, 350);
  drawWatchlist(ctx, data.market, data.pair);
  drawPositions(ctx, data.positions || []);
  label(ctx, "SIMULATED MARKET • NOT FINANCIAL ADVICE", width - 35, height - 14, 9, "#435267", "right", 650, "ForexSora");
  const output = path.join(os.tmpdir(), `forex-terminal-${randomUUID()}.png`);
  await fs.writeFile(output, canvas.toBuffer("image/png"));
  return output;
}
