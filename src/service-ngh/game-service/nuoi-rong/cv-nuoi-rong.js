/**
 * ĐẢO RỒNG — BERK: Vẽ canvas (thẻ đảo, vòng quay, trứng nở, chi tiết rồng)
 * Author: KairoDev
 */
import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import { FONT_MAIN } from "../../../utils/format-util.js";
import { SPECIES, RARITIES, ROLES, DRAGON_LEVEL_CAP, dragonStats } from "./data-nuoi-rong.js";

const F = FONT_MAIN;

// ==================== ẢNH RỒNG THỰC ====================
const DRAGON_IMG_DIR = path.resolve("./assets/resources/game/nuoi-rong/dragons");
const _dragonImgCache = new Map();
async function loadDragonImg(speciesKey) {
  if (_dragonImgCache.has(speciesKey)) return _dragonImgCache.get(speciesKey);
  for (const ext of ["png", "jpg", "webp"]) {
    const p = path.join(DRAGON_IMG_DIR, `${speciesKey}.${ext}`);
    if (fs.existsSync(p)) {
      try {
        const img = await loadImage(p);
        _dragonImgCache.set(speciesKey, img);
        return img;
      } catch {}
    }
  }
  _dragonImgCache.set(speciesKey, null);
  return null;
}

// ==================== TIỆN ÍCH ====================
async function saveCanvas(canvas, name) {
  const dir = path.resolve("./assets/temp");
  await fs.promises.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${name}_${Date.now()}_${Math.floor(Math.random() * 9999)}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}

function hexA(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

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

function fmt(n) {
  return Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function drawStars(ctx, cx, cy, count, filled, size = 14, gap = 8) {
  const total = count;
  const startX = cx - ((total - 1) * (size * 2 + gap)) / 2;
  for (let i = 0; i < total; i++) {
    const x = startX + i * (size * 2 + gap);
    drawStar(ctx, x, cy, size, i < filled ? "#ffd447" : "rgba(255,255,255,0.18)", i < filled);
  }
}

function drawStar(ctx, cx, cy, r, color, glow = false) {
  ctx.save();
  if (glow) {
    ctx.shadowColor = "rgba(255,212,71,0.8)";
    ctx.shadowBlur = 10;
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const a2 = a + Math.PI / 5;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
    ctx.lineTo(cx + Math.cos(a2) * r * 0.45, cy + Math.sin(a2) * r * 0.45);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function nightSky(ctx, w, h, top = "#101726", bottom = "#0a0e18") {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // sao trời
  for (let i = 0; i < Math.floor((w * h) / 14000); i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = Math.random() * 1.6 + 0.4;
    ctx.fillStyle = `rgba(255,255,255,${0.08 + Math.random() * 0.25})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ==================== VẼ RỒNG (mỗi loài một dáng riêng) ====================
const DEFAULT_ART = {
  type: "standard", horns: "curved", wings: 2, wingSize: 1, tail: "fin",
  backSpikes: true, neck: 1, snout: 1, pattern: "none", scale: 1,
};

function blob(ctx, chain, color) {
  // vẽ thân bằng chuỗi hình tròn chồng nhau (kiểu metaball hoạt hình)
  ctx.fillStyle = color;
  for (const [x, y, r] of chain) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function neckChain(x0, y0, x1, y1, r0, r1, n = 5) {
  const chain = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // cong nhẹ theo quadratic
    const mx = (x0 + x1) / 2 + 10;
    const my = (y0 + y1) / 2 - 6;
    const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * mx + t * t * x1;
    const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * my + t * t * y1;
    chain.push([x, y, r0 + (r1 - r0) * t]);
  }
  return chain;
}

function drawBatWing(ctx, color, accent, flip = 1, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-8 * flip, -4);
  ctx.quadraticCurveTo(-38 * flip, -102, -92 * flip, -80);
  ctx.quadraticCurveTo(-56 * flip, -58, -66 * flip, -40);
  ctx.quadraticCurveTo(-38 * flip, -46, -46 * flip, -20);
  ctx.quadraticCurveTo(-24 * flip, -28, -16 * flip, -4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = hexA(accent, 0.35);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-12 * flip, -8);
  ctx.quadraticCurveTo(-45 * flip, -60, -84 * flip, -76);
  ctx.moveTo(-12 * flip, -8);
  ctx.quadraticCurveTo(-40 * flip, -40, -62 * flip, -38);
  ctx.stroke();
  ctx.restore();
}

function drawRoundWing(ctx, color, accent, alpha = 1) {
  // cánh mượt bo tròn (dáng sleek: Night Fury / Light Fury)
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-6, -2);
  ctx.quadraticCurveTo(-20, -96, -88, -70);
  ctx.quadraticCurveTo(-70, -46, -78, -30);
  ctx.quadraticCurveTo(-52, -34, -54, -14);
  ctx.quadraticCurveTo(-30, -20, -14, -2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = hexA(accent, 0.3);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-10, -6);
  ctx.quadraticCurveTo(-40, -54, -80, -64);
  ctx.stroke();
  ctx.restore();
}

function drawWingsFor(ctx, C, a) {
  const isSleek = a.type === "sleek";
  const drawOne = (flip, alpha) => (isSleek && flip === 1 ? drawRoundWing(ctx, C.wing, C.accent, alpha) : drawBatWing(ctx, C.wing, C.accent, flip, alpha));
  ctx.save();
  ctx.translate(-8, -4);
  ctx.scale(a.wingSize, a.wingSize);
  ctx.translate(8, 4);
  // cánh sau (mờ, lật sang phải)
  ctx.save();
  ctx.translate(16, 0);
  drawBatWing(ctx, hexA(C.wing, 1), C.accent, -1, 0.55);
  ctx.restore();
  if (a.wings === 4) {
    ctx.save();
    ctx.rotate(0.32);
    ctx.translate(-6, 8);
    drawBatWing(ctx, C.wing, C.accent, 1, 0.7);
    ctx.restore();
  }
  drawOne(1, 1);
  ctx.restore();
}

function drawHorns(ctx, C, style, hx, hy, headR) {
  ctx.fillStyle = C.accent;
  if (style === "crown") {
    // vương miện gai (Deadly Nadder / Whispering Death / Skrill)
    for (let i = 0; i < 3; i++) {
      const a0 = -2.4 + i * 0.5;
      const bx = hx + Math.cos(a0) * headR * 0.9;
      const by = hy + Math.sin(a0) * headR * 0.9;
      const tx = hx + Math.cos(a0) * (headR + 16 + (i === 1 ? 6 : 0));
      const ty = hy + Math.sin(a0) * (headR + 16 + (i === 1 ? 6 : 0));
      ctx.beginPath();
      ctx.moveTo(bx - 4, by + 3);
      ctx.lineTo(tx, ty);
      ctx.lineTo(bx + 5, by - 2);
      ctx.closePath();
      ctx.fill();
    }
  } else if (style === "curved") {
    ctx.beginPath();
    ctx.moveTo(hx - 4, hy - headR + 2);
    ctx.quadraticCurveTo(hx - 18, hy - headR - 18, hx - 30, hy - headR - 20);
    ctx.quadraticCurveTo(hx - 14, hy - headR - 8, hx - 12, hy - headR + 6);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(hx + 4, hy - headR + 1);
    ctx.quadraticCurveTo(hx - 4, hy - headR - 22, hx - 16, hy - headR - 28);
    ctx.quadraticCurveTo(hx - 2, hy - headR - 10, hx + 10, hy - headR + 5);
    ctx.closePath();
    ctx.fill();
  } else if (style === "tusks") {
    // ngà chĩa về trước (Bewilderbeast / Deathgripper)
    ctx.fillStyle = C.belly;
    ctx.beginPath();
    ctx.moveTo(hx + headR * 0.7, hy + headR * 0.35);
    ctx.quadraticCurveTo(hx + headR + 20, hy + headR * 0.9, hx + headR + 26, hy - 2);
    ctx.quadraticCurveTo(hx + headR + 12, hy + headR * 0.5, hx + headR * 0.6, hy + headR * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(hx + headR * 0.2, hy + headR * 0.5);
    ctx.quadraticCurveTo(hx + headR * 0.8, hy + headR + 16, hx + headR + 10, hy + headR * 0.4);
    ctx.quadraticCurveTo(hx + headR * 0.5, hy + headR * 0.8, hx + headR * 0.1, hy + headR * 0.8);
    ctx.closePath();
    ctx.fill();
  } else if (style === "earflaps") {
    // tai dơi tròn (Fury)
    ctx.fillStyle = C.body;
    ctx.beginPath();
    ctx.ellipse(hx - 6, hy - headR - 4, 5.5, 11, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(hx + 6, hy - headR - 5, 5, 10, -0.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTailTip(ctx, C, style, tx, ty, angle = -0.4) {
  ctx.save();
  ctx.translate(tx, ty);
  ctx.rotate(angle);
  if (style === "fin") {
    ctx.fillStyle = C.accent;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-20, -14);
    ctx.lineTo(-8, 2);
    ctx.lineTo(-22, 16);
    ctx.closePath();
    ctx.fill();
  } else if (style === "club") {
    ctx.fillStyle = C.accent;
    ctx.beginPath();
    ctx.arc(-6, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hexA(C.wing, 0.9);
    for (const [bx, by] of [[-12, -8], [-14, 6], [0, -10], [2, 8]]) {
      ctx.beginPath();
      ctx.arc(bx, by, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (style === "spikes") {
    ctx.fillStyle = C.accent;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-i * 9, 4);
      ctx.lineTo(-6 - i * 9, -12 - (i === 1 ? 4 : 0));
      ctx.lineTo(-10 - i * 9, 4);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawPattern(ctx, C, pattern, cx, cy, rx, ry) {
  if (pattern === "spots") {
    ctx.fillStyle = hexA(C.wing, 0.5);
    for (const [dx, dy, r] of [[-14, -10, 6], [10, -14, 5], [22, 2, 4.5], [-26, 4, 4.5], [0, 0, 5.5]]) {
      ctx.beginPath();
      ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (pattern === "stripes") {
    ctx.strokeStyle = hexA(C.wing, 0.55);
    ctx.lineWidth = 5;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(cx - 8 + i * 16, cy - ry - 2, ry * 0.95, Math.PI * 0.25, Math.PI * 0.72);
      ctx.stroke();
    }
  }
}

function drawBackSpikes(ctx, C, points) {
  ctx.fillStyle = hexA(C.accent, 0.9);
  for (const [sx, sy, h] of points) {
    ctx.beginPath();
    ctx.moveTo(sx - 6, sy + 4);
    ctx.lineTo(sx, sy - (h || 12));
    ctx.lineTo(sx + 6, sy + 4);
    ctx.closePath();
    ctx.fill();
  }
}

function drawHead(ctx, C, hx, hy, headR, snout, opts = {}) {
  // đầu
  ctx.fillStyle = C.body;
  ctx.beginPath();
  ctx.ellipse(hx, hy, headR, headR * 0.85, -0.1, 0, Math.PI * 2);
  ctx.fill();
  // mõm
  const sl = headR * (0.85 + 0.55 * (snout - 1));
  ctx.beginPath();
  ctx.ellipse(hx + headR * 0.75 + sl * 0.4, hy + headR * 0.18, sl, headR * 0.5, 0.05, 0, Math.PI * 2);
  ctx.fill();
  if (opts.bigJaw) {
    ctx.fillStyle = hexA(C.belly, 0.95);
    ctx.beginPath();
    ctx.ellipse(hx + headR * 0.7 + sl * 0.35, hy + headR * 0.55, sl * 0.95, headR * 0.4, 0.1, 0, Math.PI * 2);
    ctx.fill();
  }
  // mắt
  ctx.save();
  ctx.shadowColor = C.accent;
  ctx.shadowBlur = 8;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(hx + headR * 0.32, hy - headR * 0.22, 4.5, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.arc(hx + headR * 0.38, hy - headR * 0.18, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // lỗ mũi
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.arc(hx + headR * 0.75 + sl * 0.75, hy + headR * 0.05, 1.7, 0, Math.PI * 2);
  ctx.fill();
}

function drawLegs(ctx, C, wide = false) {
  ctx.fillStyle = C.body;
  roundRect(ctx, wide ? -24 : -18, 48, wide ? 20 : 16, 26, 7);
  ctx.fill();
  roundRect(ctx, wide ? 14 : 16, 50, wide ? 20 : 16, 26, 7);
  ctx.fill();
  ctx.fillStyle = C.belly;
  roundRect(ctx, wide ? -27 : -20, 68, wide ? 25 : 20, 8, 4);
  ctx.fill();
  roundRect(ctx, wide ? 11 : 14, 70, wide ? 25 : 20, 8, 4);
  ctx.fill();
}

function paintStandard(ctx, C, a) {
  const hx = 52;
  const hy = -46 - 34 * (a.neck - 1);
  drawWingsFor(ctx, C, a);
  // đuôi
  ctx.fillStyle = C.body;
  ctx.beginPath();
  ctx.moveTo(-16, 26);
  ctx.quadraticCurveTo(-62, 40, -86, 18);
  ctx.quadraticCurveTo(-102, 2, -112, 6);
  ctx.quadraticCurveTo(-98, 20, -84, 40);
  ctx.quadraticCurveTo(-52, 58, -14, 46);
  ctx.closePath();
  ctx.fill();
  drawTailTip(ctx, C, a.tail, -110, 2);
  // thân
  ctx.fillStyle = C.body;
  ctx.beginPath();
  ctx.ellipse(2, 26, 46, 34, -0.15, 0, Math.PI * 2);
  ctx.fill();
  drawPattern(ctx, C, a.pattern, 0, 20, 40, 28);
  // bụng
  ctx.fillStyle = C.belly;
  ctx.beginPath();
  ctx.ellipse(6, 40, 32, 18, -0.1, 0, Math.PI * 2);
  ctx.fill();
  drawLegs(ctx, C);
  // cổ + đầu
  blob(ctx, neckChain(30, 12, hx - 6, hy + 8, 17, 11), C.body);
  drawHead(ctx, C, hx, hy, 16, a.snout);
  drawHorns(ctx, C, a.horns, hx, hy, 15);
  if (a.backSpikes) drawBackSpikes(ctx, C, [[26, -2], [14, 4], [0, 6], [-14, 8]]);
}

function paintBulky(ctx, C, a) {
  const hx = 50;
  const hy = -14;
  drawWingsFor(ctx, C, { ...a, wingSize: a.wingSize * 0.9 });
  // đuôi ngắn
  ctx.fillStyle = C.body;
  ctx.beginPath();
  ctx.moveTo(-20, 16);
  ctx.quadraticCurveTo(-64, 20, -86, 8);
  ctx.quadraticCurveTo(-70, 30, -40, 44);
  ctx.quadraticCurveTo(-24, 48, -12, 44);
  ctx.closePath();
  ctx.fill();
  drawTailTip(ctx, C, a.tail === "plain" ? "club" : a.tail, -88, 8, -0.2);
  // thân to tròn
  ctx.fillStyle = C.body;
  ctx.beginPath();
  ctx.ellipse(0, 22, 55, 42, -0.08, 0, Math.PI * 2);
  ctx.fill();
  drawPattern(ctx, C, a.pattern, -4, 12, 46, 34);
  // u lưng
  if (a.backSpikes) {
    drawBackSpikes(ctx, C, [[24, -14], [8, -10], [-10, -8], [-28, -4]]);
  } else {
    ctx.fillStyle = hexA(C.wing, 0.85);
    for (const [bx, by, r] of [[22, -16, 6], [6, -19, 7], [-12, -18, 6], [-30, -12, 5]]) {
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // bụng
  ctx.fillStyle = C.belly;
  ctx.beginPath();
  ctx.ellipse(4, 42, 38, 20, -0.05, 0, Math.PI * 2);
  ctx.fill();
  drawLegs(ctx, C, true);
  // đầu to sát thân
  blob(ctx, neckChain(34, 6, hx - 8, hy + 4, 20, 16, 3), C.body);
  drawHead(ctx, C, hx, hy, 21, a.snout, { bigJaw: true });
  drawHorns(ctx, C, a.horns, hx, hy, 20);
}

function paintSleek(ctx, C, a) {
  const hx = 48;
  const hy = -26 - 20 * (a.neck - 1);
  drawWingsFor(ctx, C, a);
  // đuôi dài mượt
  ctx.fillStyle = C.body;
  ctx.beginPath();
  ctx.moveTo(-14, 28);
  ctx.quadraticCurveTo(-58, 44, -90, 30);
  ctx.quadraticCurveTo(-108, 20, -118, 24);
  ctx.quadraticCurveTo(-102, 34, -86, 48);
  ctx.quadraticCurveTo(-48, 60, -10, 46);
  ctx.closePath();
  ctx.fill();
  drawTailTip(ctx, C, a.tail, -114, 22, -0.15);
  // thân thấp mượt
  ctx.fillStyle = C.body;
  ctx.beginPath();
  ctx.ellipse(2, 30, 50, 28, -0.1, 0, Math.PI * 2);
  ctx.fill();
  drawPattern(ctx, C, a.pattern, 0, 24, 42, 24);
  ctx.fillStyle = C.belly;
  ctx.beginPath();
  ctx.ellipse(6, 44, 34, 14, -0.06, 0, Math.PI * 2);
  ctx.fill();
  drawLegs(ctx, C);
  // cổ ngắn + đầu tròn to
  blob(ctx, neckChain(28, 16, hx - 6, hy + 10, 18, 14, 4), C.body);
  drawHead(ctx, C, hx, hy, 19, a.snout * 0.8);
  drawHorns(ctx, C, a.horns, hx, hy, 18);
  if (a.backSpikes) drawBackSpikes(ctx, C, [[22, 2], [8, 6], [-8, 8]], 9);
}

function paintSerpent(ctx, C, a) {
  // thân rắn cuộn (Whispering/Screaming Death) — không chân
  const chain = [
    [-72, -2, 9], [-64, 16, 12], [-46, 32, 15], [-20, 42, 18], [10, 44, 20],
    [38, 34, 21], [54, 14, 20], [56, -10, 18], [42, -30, 16], [20, -40, 14], [-2, -42, 13],
  ];
  drawWingsFor(ctx, C, { ...a, wingSize: a.wingSize * 0.75 });
  drawTailTip(ctx, C, "spikes", -72, -4, 2.4);
  blob(ctx, chain, C.body);
  // bụng chạy dọc thân
  ctx.fillStyle = hexA(C.belly, 0.85);
  for (const [x, y, r] of chain.slice(2, 8)) {
    ctx.beginPath();
    ctx.arc(x, y + r * 0.35, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
  // gai dọc sống lưng
  if (a.backSpikes) {
    ctx.fillStyle = hexA(C.accent, 0.9);
    for (let i = 1; i < chain.length - 1; i += 2) {
      const [x, y, r] = chain[i];
      ctx.beginPath();
      ctx.moveTo(x - 5, y - r + 3);
      ctx.lineTo(x, y - r - 11);
      ctx.lineTo(x + 5, y - r + 3);
      ctx.closePath();
      ctx.fill();
    }
  }
  // đầu ngẩng lên
  const hx = -6;
  const hy = -48;
  drawHead(ctx, C, hx, hy, 17, a.snout, { bigJaw: true });
  drawHorns(ctx, C, a.horns, hx, hy, 16);
}

function paintTwinhead(ctx, C, a) {
  // hai đầu (Zippleback)
  drawWingsFor(ctx, C, a);
  // đuôi
  ctx.fillStyle = C.body;
  ctx.beginPath();
  ctx.moveTo(-16, 26);
  ctx.quadraticCurveTo(-62, 40, -92, 20);
  ctx.quadraticCurveTo(-106, 8, -114, 12);
  ctx.quadraticCurveTo(-98, 26, -84, 42);
  ctx.quadraticCurveTo(-52, 58, -14, 46);
  ctx.closePath();
  ctx.fill();
  drawTailTip(ctx, C, "fin", -112, 10);
  // thân
  ctx.fillStyle = C.body;
  ctx.beginPath();
  ctx.ellipse(0, 28, 46, 32, -0.12, 0, Math.PI * 2);
  ctx.fill();
  drawPattern(ctx, C, a.pattern, -2, 22, 38, 26);
  ctx.fillStyle = C.belly;
  ctx.beginPath();
  ctx.ellipse(4, 42, 32, 16, -0.08, 0, Math.PI * 2);
  ctx.fill();
  drawLegs(ctx, C);
  // hai cổ tách chữ V + hai đầu
  const h1 = { x: 24, y: -58 };
  const h2 = { x: 62, y: -44 };
  blob(ctx, neckChain(14, 10, h1.x - 2, h1.y + 8, 14, 9), C.body);
  blob(ctx, neckChain(32, 12, h2.x - 4, h2.y + 8, 14, 9), C.body);
  drawHead(ctx, C, h1.x, h1.y, 12.5, a.snout * 0.9);
  drawHead(ctx, C, h2.x, h2.y, 12.5, a.snout * 0.9);
  drawHorns(ctx, C, "curved", h1.x, h1.y, 12);
  drawHorns(ctx, C, "curved", h2.x, h2.y, 12);
  if (a.backSpikes) drawBackSpikes(ctx, C, [[8, 2], [-6, 5], [-20, 8]]);
}

export function drawDragonArt(ctx, cx, cy, size, colors, art = {}) {
  const a = { ...DEFAULT_ART, ...art };
  ctx.save();
  ctx.translate(cx, cy);
  const s = (size / 220) * a.scale;
  ctx.scale(s, s);

  // quầng sáng
  const glow = ctx.createRadialGradient(0, 0, 12, 0, 0, 120);
  glow.addColorStop(0, hexA(colors.accent, 0.4));
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 120, 0, Math.PI * 2);
  ctx.fill();

  switch (a.type) {
    case "bulky":
      paintBulky(ctx, colors, a);
      break;
    case "serpent":
      paintSerpent(ctx, colors, a);
      break;
    case "sleek":
      paintSleek(ctx, colors, a);
      break;
    case "twinhead":
      paintTwinhead(ctx, colors, a);
      break;
    default:
      paintStandard(ctx, colors, a);
  }

  ctx.restore();
}

// ==================== ICONS ====================
function drawCoin(ctx, cx, cy, r) {
  const g = ctx.createRadialGradient(cx - r / 3, cy - r / 3, r / 4, cx, cy, r);
  g.addColorStop(0, "#ffe9a3");
  g.addColorStop(1, "#e0a52e");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#b07d16";
  ctx.lineWidth = Math.max(1.5, r / 8);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
  ctx.stroke();
}

function drawFishIcon(ctx, cx, cy, r, color = "#bfe6f5") {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.15, cy, r * 0.75, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.45, cy);
  ctx.lineTo(cx + r, cy - r * 0.45);
  ctx.lineTo(cx + r, cy + r * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#123";
  ctx.beginPath();
  ctx.arc(cx - r * 0.55, cy - r * 0.08, r * 0.08, 0, Math.PI * 2);
  ctx.fill();
}

function drawGemIcon(ctx, cx, cy, r, color = "#7f7fff") {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r * 0.85, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r * 0.85, cy);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r * 0.85, cy);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fill();
}

function drawEggIcon(ctx, cx, cy, r, color = "#f2e0c8") {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.1, r * 0.7, r * 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.25, cy - r * 0.25, r * 0.18, r * 0.28, -0.4, 0, Math.PI * 2);
  ctx.fill();
}

function segIcon(ctx, icon, cx, cy, r, color) {
  switch (icon) {
    case "coin": return drawCoin(ctx, cx, cy, r);
    case "fish": return drawFishIcon(ctx, cx, cy, r, "#eaf6fc");
    case "gem": return drawGemIcon(ctx, cx, cy, r, "#e8e8ff");
    case "diamond": return drawGemIcon(ctx, cx, cy, r, "#b8ffe1");
    case "egg": return drawEggIcon(ctx, cx, cy, r);
    default: return drawCoin(ctx, cx, cy, r);
  }
}

/// ==================== ICON MINH HOẠ CHIP ====================
function drawCoinStack(ctx, cx, cy, r, color) {
  // 3 đồng xu chồng nhau
  for (let i = 2; i >= 0; i--) {
    const oy = i * 5 - 5;
    const cg = ctx.createRadialGradient(cx - r * 0.25, cy + oy - r * 0.2, r * 0.1, cx, cy + oy, r);
    cg.addColorStop(0, "#ffe9a3");
    cg.addColorStop(1, "#c68a10");
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(cx, cy + oy, r * 0.82, r * 0.82, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#b07d16";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy + oy, r * 0.55, r * 0.55, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawFishCrate(ctx, cx, cy, r, color) {
  // cái hộp gỗ + cá
  ctx.fillStyle = "#7a5533";
  roundRect(ctx, cx - r * 0.9, cy - r * 0.6, r * 1.8, r * 1.2, 5);
  ctx.fill();
  ctx.strokeStyle = "#9b7040";
  ctx.lineWidth = 2;
  roundRect(ctx, cx - r * 0.9, cy - r * 0.6, r * 1.8, r * 1.2, 5);
  ctx.stroke();
  // kẻ ngang hộp
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.85, cy);
  ctx.lineTo(cx + r * 0.85, cy);
  ctx.strokeStyle = "#9b7040";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // cá nhỏ nhô lên
  ctx.fillStyle = "#bfe6f5";
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.3, cy - r * 0.72, r * 0.42, r * 0.26, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.3, cy - r * 0.7, r * 0.36, r * 0.22, 0.15, 0, Math.PI * 2);
  ctx.fill();
}

function drawGemCluster(ctx, cx, cy, r, color) {
  // 3 đá quý màu xanh
  const gems = [[-r * 0.45, 0, r * 0.5, r * 0.65, "#38bdf8"], [r * 0.28, r * 0.1, r * 0.42, r * 0.55, "#60d6ff"], [0, -r * 0.25, r * 0.35, r * 0.46, "#7ee8ff"]];
  for (const [gx, gy, gw, gh, gc] of gems) {
    ctx.fillStyle = gc;
    ctx.beginPath();
    ctx.moveTo(cx + gx, cy + gy - gh * 0.6);
    ctx.lineTo(cx + gx + gw * 0.55, cy + gy);
    ctx.lineTo(cx + gx, cy + gy + gh * 0.6);
    ctx.lineTo(cx + gx - gw * 0.55, cy + gy);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath();
    ctx.moveTo(cx + gx, cy + gy - gh * 0.6);
    ctx.lineTo(cx + gx + gw * 0.55, cy + gy);
    ctx.lineTo(cx + gx, cy + gy);
    ctx.closePath();
    ctx.fill();
  }
}

function drawStonePile(ctx, cx, cy, r, color) {
  // đống đá
  const stones = [[0, r * 0.1, r * 0.75, "#9ca3af"], [-r * 0.5, r * 0.3, r * 0.55, "#6b7280"], [r * 0.46, r * 0.32, r * 0.5, "#b0b9c4"], [r * 0.05, -r * 0.28, r * 0.52, "#8b909a"]];
  for (const [sx, sy, sr, sc] of stones) {
    ctx.fillStyle = sc;
    ctx.beginPath();
    ctx.ellipse(cx + sx, cy + sy, sr, sr * 0.65, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.ellipse(cx + sx - sr * 0.2, cy + sy - sr * 0.2, sr * 0.28, sr * 0.18, -0.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ==================== KHUNG THẺ BÀI FANTASY ====================
async function drawFantasyTile(ctx, x, y, tw, th, dragon, sp, rarity) {
  // --- nền nâu da ấm ---
  roundRect(ctx, x, y, tw, th, 14);
  const bg = ctx.createLinearGradient(x, y, x, y + th);
  bg.addColorStop(0, "#3a2310");
  bg.addColorStop(0.45, "#2a1808");
  bg.addColorStop(1, "#1e1005");
  ctx.fillStyle = bg;
  ctx.fill();

  // --- viền ngoài màu độ hiếm ---
  roundRect(ctx, x, y, tw, th, 14);
  ctx.strokeStyle = hexA(rarity.color, 0.8);
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // --- viền vàng trong (ornate border) ---
  const bi = 5;
  roundRect(ctx, x + bi, y + bi, tw - bi * 2, th - bi * 2, 10);
  const ig = ctx.createLinearGradient(x, y, x + tw, y + th);
  ig.addColorStop(0, "rgba(245,197,66,0.55)");
  ig.addColorStop(0.5, "rgba(200,155,40,0.3)");
  ig.addColorStop(1, "rgba(245,197,66,0.55)");
  ctx.strokeStyle = ig;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // --- góc trang trí dây leo ---
  _drawVineCorner(ctx, x + 12, y + 12, 1, 1);
  _drawVineCorner(ctx, x + tw - 12, y + 12, -1, 1);
  _drawVineCorner(ctx, x + 12, y + th - 12, 1, -1);
  _drawVineCorner(ctx, x + tw - 12, y + th - 12, -1, -1);

  // --- vùng ảnh rồng (hơi tối hơn, bo góc nhỏ) ---
  const artY = y + 20;
  const artH = 195;
  roundRect(ctx, x + 14, artY, tw - 28, artH, 8);
  const artBg = ctx.createLinearGradient(x + 14, artY, x + 14, artY + artH);
  artBg.addColorStop(0, "rgba(0,0,0,0.45)");
  artBg.addColorStop(1, "rgba(0,0,0,0.25)");
  ctx.fillStyle = artBg;
  ctx.fill();

  // --- boost màu sắc rồng theo level ---
  // level cao → màu accent sáng hơn, body đậm hơn
  const lvBoost = Math.min(29, dragon.level - 1) / 29; // 0 → 1
  // Lv1=165 → Lv30=235 (tăng dần)
  const lvScale = 165 + Math.min(29, dragon.level - 1) * 2.4;
  const glowR = 80 + (dragon.level - 1) * 1.8;
  const glowAlpha = 0.18 + Math.min(0.32, (dragon.level - 1) * 0.012);

  function boostHex(hex, amount) {
    const h = hex.replace("#", "");
    const r = Math.min(255, parseInt(h.substring(0, 2), 16) + Math.round(amount * 80));
    const g = Math.min(255, parseInt(h.substring(2, 4), 16) + Math.round(amount * 70));
    const b = Math.min(255, parseInt(h.substring(4, 6), 16) + Math.round(amount * 50));
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }
  const boostedColors = lvBoost > 0.05 ? {
    ...sp.colors,
    accent: boostHex(sp.colors.accent, lvBoost * 0.55),
    body:   boostHex(sp.colors.body,   lvBoost * 0.25),
    belly:  boostHex(sp.colors.belly,  lvBoost * 0.15),
  } : sp.colors;

  // --- hào quang nền màu độ hiếm (scale theo level) ---
  const halo = ctx.createRadialGradient(x + tw / 2, artY + artH * 0.5, 10, x + tw / 2, artY + artH * 0.5, glowR);
  halo.addColorStop(0, hexA(rarity.color, glowAlpha));
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x + tw / 2, artY + artH * 0.5, glowR, 0, Math.PI * 2);
  ctx.fill();

  // --- mã rồng ---
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = `bold 17px ${F}`;
  ctx.textAlign = "right";
  ctx.fillText(`#${dragon.code}`, x + tw - 20, artY + 22);

  // --- vẽ rồng: ảnh thực nếu có, fallback canvas art ---
  const dragonImg = await loadDragonImg(dragon.species || sp.key);
  const dragonCX = x + tw / 2;
  const dragonCY = artY + artH * 0.52;

  if (dragonImg) {
    // --- load ảnh thực ---
    const imgSize = lvScale * 1.05;
    const iw = imgSize;
    const ih = imgSize;
    const ix = dragonCX - iw / 2;
    const iy = dragonCY - ih * 0.6; // hơi lệch lên trên cho cân

    if (dragon.level >= 10) {
      ctx.save();
      ctx.shadowColor = hexA(rarity.color, 0.6 + lvBoost * 0.3);
      ctx.shadowBlur  = 12 + lvBoost * 28;
      ctx.drawImage(dragonImg, ix, iy, iw, ih);
      ctx.restore();
    }
    ctx.drawImage(dragonImg, ix, iy, iw, ih);
  } else {
    // --- fallback: canvas art ---
    if (dragon.level >= 10) {
      ctx.save();
      ctx.shadowColor = hexA(rarity.color, 0.55 + lvBoost * 0.3);
      ctx.shadowBlur  = 8 + lvBoost * 24;
      drawDragonArt(ctx, dragonCX, dragonCY, lvScale, boostedColors, sp.art);
      ctx.restore();
    }
    drawDragonArt(ctx, dragonCX, dragonCY, lvScale, boostedColors, sp.art);
  }


  // --- sparkle particles cho level cao ---
  if (dragon.level >= 10) {
    const dragonCX = x + tw / 2;
    const dragonCY = artY + artH * 0.52;
    const spread = lvScale * 0.55;
    const count = dragon.level >= 20 ? 10 : 6;
    const seed = dragon.code ? dragon.code.charCodeAt(0) : 99;
    ctx.save();
    for (let i = 0; i < count; i++) {
      // vị trí giả random nhưng stable (không dùng Math.random để ảnh không nhảy)
      const angle = (i / count) * Math.PI * 2 + seed * 0.37;
      const dist  = spread * (0.55 + (((seed * i * 137) % 100) / 100) * 0.45);
      const px = dragonCX + Math.cos(angle) * dist;
      const py = dragonCY + Math.sin(angle) * dist;
      const pr = dragon.level >= 20 ? 2.8 : 1.8;
      ctx.shadowColor = rarity.color;
      ctx.shadowBlur  = 6;
      ctx.fillStyle   = dragon.level >= 30 ? "#ffffff" : hexA(rarity.color, 0.9);
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
      // tia sáng nhỏ (+)
      if (dragon.level >= 20) {
        ctx.strokeStyle = hexA(rarity.color, 0.6);
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(px - pr * 2.5, py);
        ctx.lineTo(px + pr * 2.5, py);
        ctx.moveTo(px, py - pr * 2.5);
        ctx.lineTo(px, py + pr * 2.5);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // --- separator line ---
  const sepY = artY + artH + 8;
  ctx.strokeStyle = hexA(rarity.color, 0.4);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 24, sepY);
  ctx.lineTo(x + tw - 24, sepY);
  ctx.stroke();

  // --- tên ---
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 23px ${F}`;
  let dn = sp.name;
  if (ctx.measureText(dn).width > tw - 30) {
    ctx.font = `bold 19px ${F}`;
  }
  ctx.fillText(dn, x + tw / 2, sepY + 26);
  if (sp.nickname) {
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = `17px ${F}`;
    ctx.fillText(`(${sp.nickname})`, x + tw / 2, sepY + 48);
  }

  // --- level ---
  ctx.fillStyle = hexA(rarity.color, 1);
  ctx.font = `bold 20px ${F}`;
  ctx.fillText(`Lv ${dragon.level}/${DRAGON_LEVEL_CAP}`, x + tw / 2, sepY + 74);

  // --- sao ---
  drawStars(ctx, x + tw / 2, sepY + 96, 5, Math.min(5, rarity.stars + (dragon.evolves || 0)), 7, 5);
}

function _drawVineCorner(ctx, cx, cy, sx, sy) {
  ctx.save();
  ctx.strokeStyle = "rgba(245,197,66,0.55)";
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  // cành ngang
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.quadraticCurveTo(cx + sx * 14, cy + sy * 4, cx + sx * 22, cy + sy * 2);
  ctx.stroke();
  // cành dọc
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.quadraticCurveTo(cx + sx * 4, cy + sy * 14, cx + sx * 2, cy + sy * 22);
  ctx.stroke();
  // lá nhỏ
  ctx.fillStyle = "rgba(245,197,66,0.4)";
  ctx.beginPath();
  ctx.ellipse(cx + sx * 14, cy + sy * 5, 4, 2.5, sx * sy * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + sx * 5, cy + sy * 14, 2.5, 4, sx * sy * 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ==================== 1) THẺ ĐẢO RỒNG ====================
export async function drawIslandCard(player, avatarUrl = null) {
  const W = 1080;
  const dragons = player.dragons || [];
  const perRow = 3;
  const tileW = 320;
  const tileH = 340;
  const shown = Math.min(dragons.length, perRow * 4);
  const rows = Math.max(1, Math.ceil(shown / perRow));
  const SEC_Y = 488;
  const H = SEC_Y + rows * (tileH + 24) + 8;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  nightSky(ctx, W, H, "#131b2e", "#090d16");

  // dải sáng đầu trang
  const topGlow = ctx.createLinearGradient(0, 0, 0, 240);
  topGlow.addColorStop(0, "rgba(245,197,66,0.14)");
  topGlow.addColorStop(1, "rgba(245,197,66,0)");
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, W, 240);

  // ===== HEADER =====
  const pad = 40;
  // avatar
  const avR = 62;
  const avX = pad + avR;
  const avY = 40 + avR;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avX, avY, avR, 0, Math.PI * 2);
  ctx.strokeStyle = "#f5c542";
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.clip();
  let drewAvatar = false;
  if (avatarUrl) {
    try {
      const img = await loadImage(avatarUrl);
      ctx.drawImage(img, avX - avR, avY - avR, avR * 2, avR * 2);
      drewAvatar = true;
    } catch {}
  }
  if (!drewAvatar) {
    const g = ctx.createLinearGradient(avX - avR, avY - avR, avX + avR, avY + avR);
    g.addColorStop(0, "#25304d");
    g.addColorStop(1, "#141a2c");
    ctx.fillStyle = g;
    ctx.fillRect(avX - avR, avY - avR, avR * 2, avR * 2);
    drawDragonArt(ctx, avX, avY + 6, 96, SPECIES.deadly.colors, SPECIES.deadly.art);
  }
  ctx.restore();

  const infoX = avX + avR + 28;
  ctx.textAlign = "left";
  ctx.fillStyle = "#f5c542";
  ctx.font = `bold 26px ${F}`;
  ctx.fillText("ĐẢO RỒNG · BERK", infoX, 78);
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 46px ${F}`;
  let name = player.name || "Viking";
  if (ctx.measureText(name).width > W - infoX - pad) {
    while (ctx.measureText(name + "…").width > W - infoX - pad && name.length > 2) name = name.slice(0, -1);
    name += "…";
  }
  ctx.fillText(name, infoX, 128);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = `26px ${F}`;
  ctx.fillText(`Cấp Viking ${player.level} · ${dragons.length} rồng · Ải ${player.stage}`, infoX, 164);

  // ===== HÀNG CHIP TÀI NGUYÊN (to, có icon minh hoạ) =====
  const chipDefs = [
    { letter: "V", label: "VÀNG",  value: fmt(player.gold),  color: "#f5c542", drawBig: drawCoinStack },
    { letter: "C", label: "CÁ",    value: fmt(player.fish),  color: "#38bdf8", drawBig: drawFishCrate },
    { letter: "N", label: "NGỌC",  value: fmt(player.gem),   color: "#34d399", drawBig: drawGemCluster },
    { letter: "Đ", label: "ĐÁ",    value: fmt(player.stone), color: "#818cf8", drawBig: drawStonePile },
  ];
  const chipY = 200;
  const chipH = 84;
  const chipW = (W - pad * 2 - 24 * 3) / 4;
  chipDefs.forEach((c, i) => {
    const x = pad + i * (chipW + 24);
    // nền chip
    roundRect(ctx, x, chipY, chipW, chipH, 16);
    const cg = ctx.createLinearGradient(x, chipY, x, chipY + chipH);
    cg.addColorStop(0, "rgba(255,255,255,0.075)");
    cg.addColorStop(1, "rgba(255,255,255,0.03)");
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.strokeStyle = hexA(c.color, 0.4);
    ctx.lineWidth = 1.8;
    roundRect(ctx, x, chipY, chipW, chipH, 16);
    ctx.stroke();
    // icon tròn trái
    const cg2 = ctx.createRadialGradient(x + 34, chipY + chipH / 2, 0, x + 34, chipY + chipH / 2, 22);
    cg2.addColorStop(0, c.color);
    cg2.addColorStop(1, hexA(c.color, 0.6));
    ctx.fillStyle = cg2;
    ctx.beginPath();
    ctx.arc(x + 34, chipY + chipH / 2, 21, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#10131c";
    ctx.font = `bold 22px ${F}`;
    ctx.textAlign = "center";
    ctx.fillText(c.letter, x + 34, chipY + chipH / 2 + 8);
    // text giữa
    ctx.textAlign = "left";
    ctx.fillStyle = hexA(c.color, 0.75);
    ctx.font = `bold 17px ${F}`;
    ctx.fillText(c.label, x + 66, chipY + 32);
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold 30px ${F}`;
    ctx.fillText(c.value, x + 66, chipY + 66);
    // icon minh hoạ bên phải
    c.drawBig(ctx, x + chipW - 46, chipY + chipH / 2, 28, c.color);
  });

  // ===== HÀNG CHIP PHỤ =====
  const sub = [
    { letter: "A", label: "Hổ Phách",   value: fmt(player.amber),   color: "#fb923c" },
    { letter: "T", label: "H.P Tinh",   value: fmt(player.hpTinh),  color: "#2dd4bf" },
    { letter: "D", label: "Dân Viking", value: fmt(player.vikings), color: "#facc15" },
    { letter: "M", label: "Mùa Giải",   value: fmt(player.season),  color: "#c084fc" },
  ];
  const subY = chipY + chipH + 16;
  const subH = 56;
  sub.forEach((c, i) => {
    const x = pad + i * (chipW + 24);
    roundRect(ctx, x, subY, chipW, subH, 12);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fill();
    const sg = ctx.createRadialGradient(x + 26, subY + subH / 2, 0, x + 26, subY + subH / 2, 15);
    sg.addColorStop(0, c.color);
    sg.addColorStop(1, hexA(c.color, 0.55));
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(x + 26, subY + subH / 2, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#10131c";
    ctx.font = `bold 15px ${F}`;
    ctx.textAlign = "center";
    ctx.fillText(c.letter, x + 26, subY + subH / 2 + 5);
    ctx.textAlign = "left";
    ctx.fillStyle = hexA(c.color, 0.8);
    ctx.font = `bold 16px ${F}`;
    ctx.fillText(c.label, x + 48, subY + 26);
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold 20px ${F}`;
    ctx.fillText(c.value, x + 48, subY + 48);
  });

  // ===== CÔNG TRÌNH =====
  const bY = subY + subH + 16;
  const builds = [
    { label: `Chuồng Lv${player.buildings?.chuong || 1}`, color: "#facc15" },
    { label: `Ao Cá Lv${player.buildings?.aoca || 1}`, color: "#38bdf8" },
    { label: `Lò Ấp Lv${player.buildings?.loap || 1}`, color: "#fb923c" },
    { label: `Ấp ${player.incubator?.length || 0}/${player.buildings?.loap || 1}`, color: "#34d399" },
  ];
  let bx = pad;
  ctx.font = `bold 20px ${F}`;
  builds.forEach((b) => {
    const tw = ctx.measureText(b.label).width;
    const bw = tw + 52;
    roundRect(ctx, bx, bY, bw, 44, 22);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fill();
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(bx + 22, bY + 22, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.textAlign = "left";
    ctx.fillText(b.label, bx + 38, bY + 29);
    bx += bw + 14;
  });

  // ===== ĐÀN RỒNG =====
  const secY = SEC_Y;
  ctx.strokeStyle = "#f5c542";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(pad, secY - 8);
  ctx.lineTo(pad, secY - 34);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = `bold 26px ${F}`;
  ctx.textAlign = "left";
  ctx.fillText(`RỒNG CỦA BẠN  ${dragons.length}`, pad + 14, secY - 12);
  drawStar(ctx, W - pad - 10, secY - 20, 8, "#f5c542", true);

  for (const [i, d] of dragons.slice(0, perRow * 4).entries()) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const inRow = Math.min(perRow, shown - row * perRow);
    const rowX = (W - inRow * tileW - (inRow - 1) * 20) / 2;
    const x = rowX + col * (tileW + 20);
    const y = secY + row * (tileH + 24);
    const sp = SPECIES[d.species] || SPECIES.sw2;
    const rarity = RARITIES[d.rarity] || RARITIES.thuong;
    await drawFantasyTile(ctx, x, y, tileW, tileH, d, sp, rarity);
  }


  ctx.textAlign = "left";
  return saveCanvas(canvas, "nuoirong_dao");
}


// ==================== 2) VÒNG QUAY ====================
export async function drawWheelCard(tier, winSegment, tickets) {
  const W = 720;
  const H = 1000;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  nightSky(ctx, W, H, "#171226", "#0b0913");

  // khung ngoài
  ctx.strokeStyle = "rgba(245,197,66,0.5)";
  ctx.lineWidth = 3;
  const bk = 26;
  for (const [cx, cy, dx, dy] of [[24, 24, 1, 1], [W - 24, 24, -1, 1], [24, H - 24, 1, -1], [W - 24, H - 24, -1, -1]]) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + dy * bk);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + dx * bk, cy);
    ctx.stroke();
  }

  // tiêu đề
  ctx.textAlign = "center";
  ctx.save();
  ctx.shadowColor = "rgba(245,197,66,0.7)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#f5c542";
  ctx.font = `bold 38px ${F}`;
  ctx.fillText("VÒNG QUAY THƯỞNG", W / 2 - 60, 76);
  ctx.restore();

  // vé còn
  const total = (tickets?.low || 0) + (tickets?.mid || 0) + (tickets?.high || 0);
  ctx.font = `bold 18px ${F}`;
  const vtext = `VÉ CÒN ${total}`;
  const vw = ctx.measureText(vtext).width + 32;
  roundRect(ctx, W - vw - 30, 46, vw, 38, 19);
  ctx.strokeStyle = "#f5c542";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#f5c542";
  ctx.fillText(vtext, W - 30 - vw / 2, 71);

  // huy hiệu bậc
  ctx.font = `bold 24px ${F}`;
  const bt = `BẬC ${tier.name.toUpperCase()}`;
  const bw = ctx.measureText(bt).width + 48;
  roundRect(ctx, W / 2 - bw / 2, 104, bw, 44, 22);
  ctx.fillStyle = "rgba(245,197,66,0.12)";
  ctx.fill();
  ctx.strokeStyle = "#f5c542";
  ctx.stroke();
  ctx.fillStyle = "#ffe9a3";
  ctx.fillText(bt, W / 2, 134);

  // ===== BÁNH XE =====
  const cx = W / 2;
  const cy = 430;
  const R = 240;
  const totalWeight = tier.segments.reduce((s, x) => s + x.weight, 0);

  // xoay sao cho segment trúng nằm đúng đỉnh (mũi kim)
  let acc = 0;
  let winStart = 0;
  let winArc = 0;
  for (const seg of tier.segments) {
    const arc = (seg.weight / totalWeight) * Math.PI * 2;
    if (seg === winSegment || (seg.key === winSegment.key && seg.amount === winSegment.amount)) {
      winStart = acc;
      winArc = arc;
    }
    acc += arc;
  }
  const pointerAngle = -Math.PI / 2;
  const rotation = pointerAngle - (winStart + winArc * (0.3 + Math.random() * 0.4));

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  let a0 = 0;
  for (const seg of tier.segments) {
    const arc = (seg.weight / totalWeight) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, a0, a0 + arc);
    ctx.closePath();
    const g = ctx.createRadialGradient(0, 0, 40, 0, 0, R);
    g.addColorStop(0, hexA(seg.color, 0.95));
    g.addColorStop(1, hexA(seg.color, 0.75));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // nội dung segment
    const mid = a0 + arc / 2;
    const ix = Math.cos(mid) * R * 0.62;
    const iy = Math.sin(mid) * R * 0.62;
    ctx.save();
    ctx.translate(ix, iy);
    ctx.rotate(-rotation); // giữ icon thẳng đứng
    segIcon(ctx, seg.icon, 0, -8, 26);
    ctx.fillStyle = seg.key === "gold" ? "#7a5a00" : "#ffffff";
    ctx.font = `bold 26px ${F}`;
    ctx.textAlign = "center";
    ctx.fillText(seg.key === "stone" || seg.key === "egg" ? `×${seg.amount}` : `+${fmt(seg.amount)}`, 0, 44);
    ctx.restore();

    a0 += arc;
  }
  ctx.restore();

  // vành vàng + chấm
  ctx.strokeStyle = "#c9992e";
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(cx, cy, R + 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#f5c542";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, R + 16, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.fillStyle = i % 2 === 0 ? "#ffe9a3" : "#f5c542";
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * (R + 8), cy + Math.sin(a) * (R + 8), 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // trục giữa
  ctx.fillStyle = "#10131c";
  ctx.beginPath();
  ctx.arc(cx, cy, 44, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#f5c542";
  ctx.lineWidth = 4;
  ctx.stroke();
  drawStar(ctx, cx, cy, 20, "#f5c542", true);

  // kim chỉ
  ctx.save();
  ctx.shadowColor = "rgba(245,197,66,0.9)";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#f5c542";
  ctx.beginPath();
  ctx.moveTo(cx - 20, cy - R - 34);
  ctx.lineTo(cx + 20, cy - R - 34);
  ctx.lineTo(cx, cy - R + 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // ===== KẾT QUẢ =====
  const boxY = 730;
  roundRect(ctx, 50, boxY, W - 100, 120, 20);
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.fill();
  ctx.strokeStyle = "rgba(245,197,66,0.55)";
  ctx.lineWidth = 2;
  roundRect(ctx, 50, boxY, W - 100, 120, 20);
  ctx.stroke();

  segIcon(ctx, winSegment.icon, 110, boxY + 60, 34);
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = `bold 20px ${F}`;
  ctx.fillText("BẠN NHẬN ĐƯỢC", 170, boxY + 46);
  ctx.fillStyle = "#f5c542";
  ctx.font = `bold 44px ${F}`;
  const amountText = winSegment.key === "stone" || winSegment.key === "egg" ? `×${winSegment.amount}` : `+${fmt(winSegment.amount)}`;
  ctx.fillText(`${amountText} ${winSegment.label}`, 170, boxY + 92);

  ctx.font = `bold 22px ${F}`;
  const tw2 = ctx.measureText("TRÚNG!").width + 32;
  roundRect(ctx, W - 66 - tw2, boxY + 24, tw2, 40, 10);
  ctx.fillStyle = "#f5c542";
  ctx.fill();
  ctx.fillStyle = "#3a2a00";
  ctx.textAlign = "center";
  ctx.fillText("TRÚNG!", W - 66 - tw2 / 2, boxY + 52);

  // ===== CHÚ GIẢI % =====
  const legY = boxY + 150;
  const legW = (W - 100 - 20 * (tier.segments.length - 1)) / tier.segments.length;
  tier.segments.forEach((seg, i) => {
    const x = 50 + i * (legW + 20);
    roundRect(ctx, x, legY, legW, 56, 12);
    ctx.fillStyle = seg === winSegment || seg.key === winSegment.key ? hexA(seg.color, 0.28) : "rgba(255,255,255,0.05)";
    ctx.fill();
    ctx.fillStyle = seg.color;
    ctx.beginPath();
    ctx.arc(x + 22, legY + 28, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = `bold 19px ${F}`;
    ctx.fillText(seg.label, x + 40, legY + 26);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = `bold 18px ${F}`;
    ctx.fillText(`${Math.round((seg.weight / totalWeight) * 100)}%`, x + 40, legY + 48);
  });

  ctx.textAlign = "left";
  return saveCanvas(canvas, "nuoirong_quay");
}

// ==================== 3) TRỨNG ĐÃ NỞ ====================
export async function drawEggHatchCard(dragon) {
  const W = 720;
  const H = 1020;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const sp = SPECIES[dragon.species] || SPECIES.sw2;
  const rarity = RARITIES[dragon.rarity] || RARITIES.thuong;

  nightSky(ctx, W, H, "#141021", "#0a0812");

  // góc khung vàng
  ctx.strokeStyle = "#c9992e";
  ctx.lineWidth = 4;
  const bk = 36;
  for (const [cx, cy, dx, dy] of [[30, 30, 1, 1], [W - 30, 30, -1, 1], [30, H - 30, 1, -1], [W - 30, H - 30, -1, -1]]) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + dy * bk);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + dx * bk, cy);
    ctx.stroke();
  }

  // tiêu đề
  ctx.textAlign = "center";
  ctx.save();
  ctx.shadowColor = "rgba(245,197,66,0.8)";
  ctx.shadowBlur = 22;
  ctx.fillStyle = "#f5c542";
  ctx.font = `bold 58px ${F}`;
  ctx.fillText("TRỨNG ĐÃ NỞ", W / 2, 108);
  ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = `24px ${F}`;
  ctx.fillText("1 sinh linh mới vừa chào đời tại Berk", W / 2, 148);

  // khung trong
  const px = 70;
  const py = 190;
  const pw = W - px * 2;
  const ph = 660;
  roundRect(ctx, px, py, pw, ph, 22);
  const pg = ctx.createLinearGradient(0, py, 0, py + ph);
  pg.addColorStop(0, "rgba(255,255,255,0.06)");
  pg.addColorStop(1, "rgba(255,255,255,0.02)");
  ctx.fillStyle = pg;
  ctx.fill();
  ctx.strokeStyle = hexA(rarity.color, 0.8);
  ctx.lineWidth = 3;
  roundRect(ctx, px, py, pw, ph, 22);
  ctx.stroke();

  // hào quang + rồng
  const dgY = py + 240;
  const halo = ctx.createRadialGradient(W / 2, dgY, 20, W / 2, dgY, 220);
  halo.addColorStop(0, hexA(rarity.color, 0.4));
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(W / 2, dgY, 220, 0, Math.PI * 2);
  ctx.fill();
  // tia sáng
  ctx.save();
  ctx.strokeStyle = hexA(rarity.color, 0.25);
  ctx.lineWidth = 3;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(W / 2 + Math.cos(a) * 150, dgY + Math.sin(a) * 150);
    ctx.lineTo(W / 2 + Math.cos(a) * (185 + (i % 2) * 22), dgY + Math.sin(a) * (185 + (i % 2) * 22));
    ctx.stroke();
  }
  ctx.restore();
  drawDragonArt(ctx, W / 2, dgY, 330, sp.colors, sp.art);

  // vỏ trứng vỡ dưới chân
  ctx.fillStyle = "rgba(240,228,200,0.85)";
  ctx.beginPath();
  ctx.moveTo(W / 2 - 90, dgY + 130);
  ctx.lineTo(W / 2 - 60, dgY + 100);
  ctx.lineTo(W / 2 - 40, dgY + 130);
  ctx.lineTo(W / 2 - 14, dgY + 104);
  ctx.lineTo(W / 2 + 10, dgY + 130);
  ctx.quadraticCurveTo(W / 2 - 40, dgY + 152, W / 2 - 90, dgY + 130);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(240,228,200,0.7)";
  ctx.beginPath();
  ctx.moveTo(W / 2 + 30, dgY + 128);
  ctx.lineTo(W / 2 + 52, dgY + 106);
  ctx.lineTo(W / 2 + 72, dgY + 128);
  ctx.lineTo(W / 2 + 92, dgY + 112);
  ctx.quadraticCurveTo(W / 2 + 70, dgY + 146, W / 2 + 30, dgY + 128);
  ctx.closePath();
  ctx.fill();

  // pill độ hiếm
  ctx.font = `bold 24px ${F}`;
  const rt = rarity.name.toUpperCase();
  const rw = ctx.measureText(rt).width + 56;
  roundRect(ctx, W / 2 - rw / 2, py + 424, rw, 46, 23);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fill();
  ctx.strokeStyle = rarity.color;
  ctx.lineWidth = 2;
  roundRect(ctx, W / 2 - rw / 2, py + 424, rw, 46, 23);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(rt, W / 2, py + 456);

  // sao
  drawStars(ctx, W / 2, py + 508, 5, Math.min(5, rarity.stars + (dragon.evolves || 0)), 13, 10);

  // tên
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 44px ${F}`;
  ctx.fillText(sp.name, W / 2, py + 572);
  if (sp.nickname) {
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = `26px ${F}`;
    ctx.fillText(`(${sp.nickname})`, W / 2, py + 606);
  }

  // mã
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `bold 26px ${F}`;
  ctx.fillText(`Mã #${dragon.code}`, W / 2, py + 646);

  // footer
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = `22px ${F}`;
  ctx.fillText(`Gõ  xem ${dragon.code}  để xem chi tiết rồng`, W / 2, H - 90);

  ctx.textAlign = "left";
  return saveCanvas(canvas, "nuoirong_no");
}

// ==================== 4) CHI TIẾT RỒNG ====================
export async function drawDragonDetailCard(dragon) {
  const W = 760;
  const H = 1000;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const sp = SPECIES[dragon.species] || SPECIES.sw2;
  const rarity = RARITIES[dragon.rarity] || RARITIES.thuong;
  const role = ROLES[sp.role] || ROLES.tankich;
  const stats = dragonStats(dragon);

  nightSky(ctx, W, H, "#10182a", "#090d16");

  // header
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold 44px ${F}`;
  ctx.fillText(sp.name, W / 2, 74);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = `26px ${F}`;
  ctx.fillText(`${sp.nickname ? "(" + sp.nickname + ")  ·  " : ""}#${dragon.code}`, W / 2, 110);

  // rồng
  const halo = ctx.createRadialGradient(W / 2, 300, 20, W / 2, 300, 230);
  halo.addColorStop(0, hexA(rarity.color, 0.35));
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(W / 2, 300, 230, 0, Math.PI * 2);
  ctx.fill();
  drawDragonArt(ctx, W / 2, 300, 320, sp.colors, sp.art);

  // chips: độ hiếm + vai trò
  const chipY = 480;
  ctx.font = `bold 22px ${F}`;
  const c1 = rarity.name.toUpperCase();
  const c2 = `${role.name} · ${role.desc}`;
  const c1w = ctx.measureText(c1).width + 48;
  const c2w = ctx.measureText(c2).width + 48;
  const gap = 16;
  let cx0 = (W - c1w - c2w - gap) / 2;
  roundRect(ctx, cx0, chipY, c1w, 44, 22);
  ctx.fillStyle = hexA(rarity.color, 0.22);
  ctx.fill();
  ctx.strokeStyle = rarity.color;
  ctx.lineWidth = 2;
  roundRect(ctx, cx0, chipY, c1w, 44, 22);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(c1, cx0 + c1w / 2, chipY + 30);
  cx0 += c1w + gap;
  roundRect(ctx, cx0, chipY, c2w, 44, 22);
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillText(c2, cx0 + c2w / 2, chipY + 30);

  // level + sao
  ctx.fillStyle = hexA(rarity.color, 1);
  ctx.font = `bold 30px ${F}`;
  ctx.fillText(`Lv ${dragon.level}/${DRAGON_LEVEL_CAP}`, W / 2, chipY + 92);
  drawStars(ctx, W / 2, chipY + 126, 5, Math.min(5, rarity.stars + (dragon.evolves || 0)), 12, 10);

  // stat bars
  const bars = [
    { label: "HP", value: stats.hp, max: Math.max(stats.hp, 600), color: "#4ade80" },
    { label: "ATK", value: stats.atk, max: Math.max(stats.atk, 220), color: "#f87171" },
    { label: "DEF", value: stats.def, max: Math.max(stats.def, 160), color: "#60a5fa" },
  ];
  const barX = 90;
  const barW = W - barX * 2;
  let by = chipY + 170;
  ctx.textAlign = "left";
  for (const b of bars) {
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = `bold 24px ${F}`;
    ctx.fillText(b.label, barX, by + 8);
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(fmt(b.value), barX + barW, by + 8);
    ctx.textAlign = "left";
    roundRect(ctx, barX, by + 20, barW, 18, 9);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fill();
    const fw = Math.max(12, barW * Math.min(1, b.value / b.max));
    roundRect(ctx, barX, by + 20, fw, 18, 9);
    const bg = ctx.createLinearGradient(barX, 0, barX + fw, 0);
    bg.addColorStop(0, hexA(b.color, 0.7));
    bg.addColorStop(1, b.color);
    ctx.fillStyle = bg;
    ctx.fill();
    by += 74;
  }

  // gắn kết
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = `bold 24px ${F}`;
  ctx.fillText(`💞 Gắn kết Lv${dragon.bondLevel || 0}`, barX, by + 8);
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = `20px ${F}`;
  ctx.fillText(`${dragon.bondXp || 0}/500 XP`, barX + barW, by + 8);
  ctx.textAlign = "left";
  roundRect(ctx, barX, by + 20, barW, 14, 7);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fill();
  const bondW = Math.max(8, barW * Math.min(1, (dragon.bondXp || 0) / 500));
  roundRect(ctx, barX, by + 20, bondW, 14, 7);
  ctx.fillStyle = "#f472b6";
  ctx.fill();

  // footer
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = `20px ${F}`;
  ctx.fillText(`choan ${dragon.code} <số> — cho ăn  ·  vuotve ${dragon.code} — vuốt ve`, W / 2, H - 46);

  ctx.textAlign = "left";
  return saveCanvas(canvas, "nuoirong_xem");
}
