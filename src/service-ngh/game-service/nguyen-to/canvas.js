import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createCanvas } from "canvas";

import { formatCurrency } from "../../../utils/format-util.js";
import { ELEMENT_SYMBOLS, RING_CONFIG, getPartialCashout } from "./rules.js";

const WIDTH = 900;
const HEIGHT = 1080;
const CX = WIDTH / 2;
const CY = 505;
const FONT = '"DejaVu Sans", "Noto Sans", sans-serif';
const TAU = Math.PI * 2;

const SYMBOL_META = Object.freeze({
  fire: { title: "LỬA", color: "#ff5a24", dark: "#6f160d" },
  earth: { title: "ĐẤT", color: "#39dc66", dark: "#0d592b" },
  water: { title: "NƯỚC", color: "#1faeff", dark: "#075183" },
  wind: { title: "GIÓ", color: "#dff8ff", dark: "#417e91" },
  skull: { title: "ĐẦU LÂU", color: "#e7e1d2", dark: "#635e55" },
});

const REEL_SYMBOLS = [
  ELEMENT_SYMBOLS.FIRE,
  ELEMENT_SYMBOLS.EARTH,
  ELEMENT_SYMBOLS.WATER,
  ELEMENT_SYMBOLS.WIND,
  ELEMENT_SYMBOLS.SKULL,
];

function roundedPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function text(ctx, value, x, y, size, color, align = "left", weight = "700") {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(String(value), x, y);
}

function fitText(ctx, value, x, y, maxWidth, size, minSize, color, align = "center", weight = "700") {
  let current = size;
  while (current > minSize) {
    ctx.font = `${weight} ${current}px ${FONT}`;
    if (ctx.measureText(String(value)).width <= maxWidth) break;
    current -= 1;
  }
  text(ctx, value, x, y, current, color, align, weight);
}

function panel(ctx, x, y, width, height, radius, fill, stroke) {
  roundedPath(ctx, x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawBackground(ctx) {
  const background = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  background.addColorStop(0, "#202630");
  background.addColorStop(0.48, "#11161e");
  background.addColorStop(1, "#080b10");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const centerGlow = ctx.createRadialGradient(CX, CY, 70, CX, CY, 570);
  centerGlow.addColorStop(0, "rgba(56, 78, 103, .30)");
  centerGlow.addColorStop(0.55, "rgba(17, 25, 35, .12)");
  centerGlow.addColorStop(1, "rgba(0, 0, 0, .62)");
  ctx.fillStyle = centerGlow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.save();
  ctx.translate(CX, CY);
  for (let index = 0; index < 24; index += 1) {
    ctx.rotate(TAU / 24);
    const shade = index % 2 === 0 ? "rgba(255,255,255,.016)" : "rgba(0,0,0,.075)";
    ctx.beginPath();
    ctx.moveTo(-24, -520);
    ctx.lineTo(24, -520);
    ctx.lineTo(58, -190);
    ctx.lineTo(-58, -190);
    ctx.closePath();
    ctx.fillStyle = shade;
    ctx.fill();
  }
  ctx.restore();

  const vignette = ctx.createRadialGradient(CX, CY, 300, CX, CY, 670);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,.72)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawHeader(ctx, state, options) {
  text(ctx, "XOÁY NƯỚC", 42, 39, 27, "#f0f4f8", "left", "900");
  text(ctx, "LỬA  •  ĐẤT  •  NƯỚC", 44, 68, 11, "rgba(198,211,225,.48)", "left", "800");

  const active = Boolean(state.active);
  panel(ctx, 662, 25, 196, 51, 25, "rgba(8,12,17,.76)", active ? "#42d98666" : "#8e9aa744");
  ctx.beginPath();
  ctx.arc(689, 50, 6, 0, TAU);
  ctx.fillStyle = active ? "#45e28d" : "#7d8792";
  ctx.shadowColor = active ? "#45e28d" : "transparent";
  ctx.shadowBlur = active ? 10 : 0;
  ctx.fill();
  ctx.shadowBlur = 0;
  text(ctx, active ? "VÁN ĐANG MỞ" : "VÁN ĐÃ ĐÓNG", 708, 51, 12, active ? "#b9ffd7" : "#b8c0c9", "left", "800");

  if (options.bet ?? state.bet) {
    text(ctx, `CƯỢC ${formatCurrency(options.bet ?? state.bet)}`, 858, 94, 11, "rgba(225,232,239,.53)", "right", "700");
  }
}

function annularSegment(ctx, outer, inner, start, end) {
  ctx.beginPath();
  ctx.arc(CX, CY, outer, start, end);
  ctx.arc(CX, CY, inner, end, start, true);
  ctx.closePath();
}

function drawGear(ctx) {
  ctx.save();
  ctx.translate(CX, CY);
  for (let index = 0; index < 36; index += 1) {
    ctx.rotate(TAU / 36);
    const tooth = ctx.createLinearGradient(0, -407, 0, -440);
    tooth.addColorStop(0, "#121820");
    tooth.addColorStop(1, index % 2 ? "#2a3039" : "#202630");
    roundedPath(ctx, -14, -444, 28, 57, 5);
    ctx.fillStyle = tooth;
    ctx.fill();
  }
  ctx.restore();

  const shell = ctx.createRadialGradient(CX - 80, CY - 100, 120, CX, CY, 432);
  shell.addColorStop(0, "#333b46");
  shell.addColorStop(0.7, "#171d25");
  shell.addColorStop(1, "#090d12");
  ctx.beginPath();
  ctx.arc(CX, CY, 424, 0, TAU);
  ctx.fillStyle = shell;
  ctx.fill();
  ctx.strokeStyle = "rgba(155,171,188,.18)";
  ctx.lineWidth = 3;
  ctx.stroke();
}

function ringLabels(config) {
  return [...config.steps.map((step) => `${step}X`), config.key === "fire" ? "THƯỞNG" : `${config.completionLabel}X`];
}

function drawRing(ctx, state, config, outer, inner) {
  const labels = ringLabels(config);
  const slice = TAU / config.cells;
  const gap = 0.012;

  for (let index = 0; index < config.cells; index += 1) {
    const start = -Math.PI / 2 + index * slice + gap;
    const end = -Math.PI / 2 + (index + 1) * slice - gap;
    const filled = index < Number(state[config.key] || 0);

    ctx.save();
    annularSegment(ctx, outer, inner, start, end);
    const fill = ctx.createRadialGradient(CX, CY, inner, CX, CY, outer);
    if (filled) {
      fill.addColorStop(0, SYMBOL_META[config.key].dark);
      fill.addColorStop(0.65, config.color);
      fill.addColorStop(1, SYMBOL_META[config.key].dark);
      ctx.shadowColor = config.color;
      ctx.shadowBlur = 18;
    } else {
      fill.addColorStop(0, "#121821");
      fill.addColorStop(0.52, "#252c36");
      fill.addColorStop(1, "#0e131a");
    }
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = filled ? "rgba(255,255,255,.35)" : "rgba(131,146,162,.18)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    const angle = start + (end - start) / 2;
    const radius = (outer + inner) / 2;
    const x = CX + Math.cos(angle) * radius;
    const y = CY + Math.sin(angle) * radius;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + Math.PI / 2);
    if (angle > 0 && angle < Math.PI) ctx.rotate(Math.PI);
    const completion = index === config.cells - 1;
    fitText(
      ctx,
      labels[index],
      0,
      0,
      outer - inner - 7,
      config.key === "fire" ? 21 : config.key === "earth" ? 18 : 17,
      11,
      filled ? "#ffffff" : completion ? `${config.color}99` : "rgba(168,179,193,.48)",
      "center",
      "900",
    );
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(CX, CY, outer, 0, TAU);
  ctx.strokeStyle = "rgba(170,185,200,.15)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(CX, CY, inner, 0, TAU);
  ctx.strokeStyle = "rgba(0,0,0,.62)";
  ctx.lineWidth = 5;
  ctx.stroke();
}

function drawFlame(ctx, color) {
  ctx.beginPath();
  ctx.moveTo(0, 48);
  ctx.bezierCurveTo(-42, 27, -39, -12, -8, -54);
  ctx.bezierCurveTo(-9, -21, 31, -15, 21, 21);
  ctx.bezierCurveTo(50, 2, 48, 39, 0, 52);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(1, 35);
  ctx.bezierCurveTo(-18, 23, -6, 1, 7, -13);
  ctx.bezierCurveTo(5, 9, 23, 15, 12, 36);
  ctx.closePath();
  ctx.fillStyle = "#ffd64a";
  ctx.fill();
}

function drawEarth(ctx, color) {
  for (let index = 0; index < 7; index += 1) {
    const angle = index * TAU / 7;
    ctx.save();
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.arc(0, -24, 25, 0, TAU);
    const leaf = ctx.createRadialGradient(-7, -32, 2, 0, -24, 27);
    leaf.addColorStop(0, "#baff72");
    leaf.addColorStop(0.48, color);
    leaf.addColorStop(1, "#087f31");
    ctx.fillStyle = leaf;
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, TAU);
  ctx.fillStyle = "#7cff4c";
  ctx.fill();
}

function drawWater(ctx, color) {
  ctx.beginPath();
  ctx.arc(0, 0, 50, 0, TAU);
  const orb = ctx.createRadialGradient(-17, -20, 5, 0, 0, 54);
  orb.addColorStop(0, "#77e9ff");
  orb.addColorStop(0.45, color);
  orb.addColorStop(1, "#0751b4");
  ctx.fillStyle = orb;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.67)";
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(-5, 1, 27, 3.55, 6.55);
  ctx.stroke();
  ctx.fillStyle = "rgba(220,251,255,.82)";
  ctx.beginPath();
  ctx.arc(22, 23, 6, 0, TAU);
  ctx.fill();
}

function drawWind(ctx, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  const paths = [[-48, -25, 27, -25, 46, -39], [-58, 4, 22, 4, 43, 18], [-41, 32, 10, 32, 30, 20]];
  for (const [x1, y1, x2, y2, tailX, tailY] of paths) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.quadraticCurveTo(tailX, y2, tailX, tailY);
    ctx.stroke();
  }
}

function drawSkull(ctx, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, -8, 43, Math.PI, 0);
  ctx.lineTo(39, 19);
  ctx.quadraticCurveTo(32, 40, 17, 41);
  ctx.lineTo(17, 55);
  ctx.lineTo(-17, 55);
  ctx.lineTo(-17, 41);
  ctx.quadraticCurveTo(-32, 40, -39, 19);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#121820";
  ctx.beginPath(); ctx.arc(-16, 1, 10, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(16, 1, 10, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, 15); ctx.lineTo(-7, 28); ctx.lineTo(7, 28); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#121820";
  ctx.lineWidth = 3;
  [-8, 0, 8].forEach((x) => { ctx.beginPath(); ctx.moveTo(x, 39); ctx.lineTo(x, 54); ctx.stroke(); });
}

function drawSymbolShape(ctx, symbol) {
  const meta = SYMBOL_META[symbol] || SYMBOL_META.water;
  if (symbol === ELEMENT_SYMBOLS.FIRE) drawFlame(ctx, meta.color);
  else if (symbol === ELEMENT_SYMBOLS.EARTH) drawEarth(ctx, meta.color);
  else if (symbol === ELEMENT_SYMBOLS.WATER) drawWater(ctx, meta.color);
  else if (symbol === ELEMENT_SYMBOLS.WIND) drawWind(ctx, meta.color);
  else if (symbol === ELEMENT_SYMBOLS.SKULL) drawSkull(ctx, meta.color);
  else drawWater(ctx, SYMBOL_META.water.color);
}

function drawOrb(ctx, x, y, radius, symbol, scale = 1, dimmed = false) {
  const meta = SYMBOL_META[symbol] || SYMBOL_META.water;
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = dimmed ? 0.35 : 1;
  ctx.shadowColor = meta.color;
  ctx.shadowBlur = dimmed ? 7 : 22;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  const rim = ctx.createRadialGradient(-radius * .3, -radius * .35, 2, 0, 0, radius);
  rim.addColorStop(0, "#4b5664");
  rim.addColorStop(0.14, "#1c2530");
  rim.addColorStop(0.82, "#090d13");
  rim.addColorStop(1, "#4b5661");
  ctx.fillStyle = rim;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = dimmed ? "rgba(255,255,255,.18)" : `${meta.color}aa`;
  ctx.lineWidth = Math.max(2, radius * .055);
  ctx.stroke();
  ctx.scale(scale, scale);
  drawSymbolShape(ctx, symbol);
  ctx.restore();
}

function drawTopMarkers(ctx) {
  drawOrb(ctx, CX, CY - 381, 31, ELEMENT_SYMBOLS.FIRE, .48);
  drawOrb(ctx, CX, CY - 289, 27, ELEMENT_SYMBOLS.EARTH, .43);
  drawOrb(ctx, CX, CY - 207, 24, ELEMENT_SYMBOLS.WATER, .36);
}

function reelNeighbours(symbol) {
  const index = Math.max(0, REEL_SYMBOLS.indexOf(symbol));
  return {
    previous: REEL_SYMBOLS[(index + REEL_SYMBOLS.length - 1) % REEL_SYMBOLS.length],
    next: REEL_SYMBOLS[(index + 1) % REEL_SYMBOLS.length],
  };
}

function drawReel(ctx, symbol) {
  const selected = SYMBOL_META[symbol] ? symbol : ELEMENT_SYMBOLS.WATER;
  const neighbours = reelNeighbours(selected);
  const x = CX - 119;
  const y = CY - 144;
  const width = 238;
  const height = 288;

  ctx.save();
  roundedPath(ctx, x, y, width, height, 112);
  ctx.clip();
  const slot = ctx.createLinearGradient(0, y, 0, y + height);
  slot.addColorStop(0, "#030609");
  slot.addColorStop(0.18, "#111923");
  slot.addColorStop(0.5, "#242e3a");
  slot.addColorStop(0.82, "#111923");
  slot.addColorStop(1, "#030609");
  ctx.fillStyle = slot;
  ctx.fillRect(x, y, width, height);

  drawOrb(ctx, CX, CY - 178, 62, neighbours.previous, .78, true);
  drawOrb(ctx, CX, CY, 91, selected, 1.35);
  drawOrb(ctx, CX, CY + 181, 62, neighbours.next, .78, true);

  const topShade = ctx.createLinearGradient(0, y, 0, y + 75);
  topShade.addColorStop(0, "rgba(0,0,0,.96)");
  topShade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = topShade;
  ctx.fillRect(x, y, width, 76);
  const bottomShade = ctx.createLinearGradient(0, y + height - 76, 0, y + height);
  bottomShade.addColorStop(0, "rgba(0,0,0,0)");
  bottomShade.addColorStop(1, "rgba(0,0,0,.96)");
  ctx.fillStyle = bottomShade;
  ctx.fillRect(x, y + height - 76, width, 76);
  ctx.restore();

  roundedPath(ctx, x, y, width, height, 112);
  ctx.strokeStyle = "rgba(133,151,169,.34)";
  ctx.lineWidth = 5;
  ctx.stroke();
  roundedPath(ctx, x + 8, y + 8, width - 16, height - 16, 104);
  ctx.strokeStyle = "rgba(0,0,0,.72)";
  ctx.lineWidth = 4;
  ctx.stroke();

  const meta = SYMBOL_META[selected];
  panel(ctx, CX - 61, CY + 112, 122, 30, 15, "rgba(4,8,12,.85)", `${meta.color}77`);
  text(ctx, meta.title, CX, CY + 128, 12, meta.color, "center", "900");
}

function drawBoard(ctx, state, symbol) {
  drawGear(ctx);
  drawRing(ctx, state, RING_CONFIG.fire, 399, 326);
  drawRing(ctx, state, RING_CONFIG.earth, 315, 251);
  drawRing(ctx, state, RING_CONFIG.water, 240, 181);
  drawTopMarkers(ctx);
  drawReel(ctx, symbol);
}

function drawFooter(ctx, state, options) {
  const partial = getPartialCashout(state);
  const payout = options.payout != null && Number(options.payout) > 0;
  const headline = options.headline || (state.active ? "Ván đang mở — tiếp tục quay" : "Mở ván để bắt đầu");

  panel(ctx, 38, 943, 824, 98, 20, "rgba(8,12,17,.88)", "rgba(148,164,181,.16)");
  text(ctx, "KẾT QUẢ", 64, 968, 10, "rgba(176,190,204,.45)", "left", "800");
  fitText(ctx, headline, 64, 997, 516, 19, 12, payout ? "#7af0aa" : "#e9eef3", "left", "800");

  const cashoutValue = payout
    ? `+${formatCurrency(options.payout)}`
    : partial.available
      ? `×${partial.multiplier}`
      : "CHƯA MỞ";
  text(ctx, payout ? "TIỀN NHẬN" : "RÚT MỘT PHẦN", 834, 968, 10, "rgba(176,190,204,.45)", "right", "800");
  fitText(ctx, cashoutValue, 834, 999, 222, 22, 14,
    payout ? "#7af0aa" : partial.available ? "#ffcf61" : "#727d89", "right", "900");
  if (payout) text(ctx, "VNĐ", 834, 1023, 9, "rgba(139,229,175,.52)", "right", "800");

  text(ctx, `LỬA ${state.fire}/8`, 48, 1061, 10, RING_CONFIG.fire.color, "left", "900");
  text(ctx, `ĐẤT ${state.earth}/6`, 173, 1061, 10, RING_CONFIG.earth.color, "left", "900");
  text(ctx, `NƯỚC ${state.water}/4`, 291, 1061, 10, RING_CONFIG.water.color, "left", "900");
  if (options.balance != null) text(ctx, `SỐ DƯ ${formatCurrency(options.balance)} VNĐ`, 852, 1061, 10, "rgba(197,208,219,.48)", "right", "700");
}

export async function createElementalImage(state, options = {}) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  drawBackground(ctx);
  drawHeader(ctx, state, options);
  drawBoard(ctx, state, options.symbol);
  drawFooter(ctx, state, options);

  const output = path.join(os.tmpdir(), `xoay-nuoc-${randomUUID()}.png`);
  await fs.writeFile(output, canvas.toBuffer("image/png"));
  return output;
}
