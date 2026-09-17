import { createCanvas, loadImage, registerFont } from "canvas";
import GIFEncoder from "gifencoder";
import { createWriteStream, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const ASSETS = fileURLToPath(new URL("../../../../assets/resources/tu-tien/", import.meta.url));
const FONTS = fileURLToPath(new URL("../../../../assets/fonts/", import.meta.url));
for (const [file, family, weight] of [
  ["BeVietnamPro-Bold.ttf", "TuTienUI", "bold"],
  ["NotoSans-Regular.ttf", "TuTienUI", "normal"],
  ["Junicode-Bold.ttf", "TuTienTitle", "bold"],
]) {
  if (existsSync(join(FONTS, file))) registerFont(join(FONTS, file), { family, weight });
}

// A chat GIF must finish quickly and remain comfortably below Zalo upload
// limits. The previous 800×500/36-frame scene produced 4+ MB files and took
// 15–18 seconds to encode, making commands appear stuck.
export const GIF_STYLE = Object.freeze({ width: 600, height: 375, frames: 12, delay: 120, hold: 850 });
// Scene layout was designed at this coordinate system. Output may be encoded
// smaller, but the complete scene must be scaled rather than clipped.
const SCENE_WIDTH = 800;
const SCENE_HEIGHT = 500;
const TAU = Math.PI * 2;
const GOLD = "#edcf8b";
const WHITE = "#f5f3e9";
const MUTED = "#c0ced8";
const RED = "#ff929e";
export const SECTS = Object.freeze({
  kiem: { key: "kiem", name: "Bổ Thiên Các", color: "#61b6ff", skill: "Vạn Kiếm Quy Tông" },
  dan: { key: "dan", name: "Trục Lộc Thư Viện", color: "#ff9f5b", skill: "Cửu Chuyển Hoàn Sinh" },
  ma: { key: "ma", name: "Ma Linh Hồ", color: "#bd79ff", skill: "Huyết Hải Thôn Thiên" },
  phat: { key: "phat", name: "Thạch Quốc Tổ Địa", color: "#ffd56a", skill: "Kim Cang Phục Ma" },
  linh: { key: "linh", name: "Thái Cổ Thần Sơn", color: "#65e1b0", skill: "Vạn Thú Triều Tông" },
});
const SECT_INDEX = { kiem: 0, dan: 1, ma: 2, phat: 3, linh: 4 };
const clamp = (n, low = 0, high = 1) => Math.max(low, Math.min(high, n));
const ease = n => { const x = clamp(n); return x * x * (3 - 2 * x); };
const fmt = n => Math.floor(Number(n) || 0).toLocaleString("vi-VN");
let assetsPromise;
const heroRows = new Map();

function loadAssets() {
  if (!assetsPromise) {
    const arenaFile = join(ASSETS, "celestial-arena.png");
    assetsPromise = Promise.all([
      loadImage(join(ASSETS, "sect-heroes-male.png")),
      loadImage(join(ASSETS, "sect-heroes-female.png")),
      loadImage(join(ASSETS, "monsters.png")),
      existsSync(arenaFile) ? loadImage(arenaFile) : Promise.resolve(createArenaFallback()),
    ]).then(([maleHeroes, femaleHeroes, monsters, arena]) => ({ maleHeroes, femaleHeroes, monsters, arena }))
      .catch(error => { assetsPromise = undefined; throw error; });
  }
  return assetsPromise;
}

function createArenaFallback() {
  const canvas = createCanvas(SCENE_WIDTH, SCENE_HEIGHT), ctx = canvas.getContext("2d");
  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, "#07152b"); sky.addColorStop(.58, "#17274c"); sky.addColorStop(1, "#090d1b");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#dfe9ff"; ctx.globalAlpha = .12; ctx.beginPath(); ctx.arc(665, 100, 62, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1; ctx.fillStyle = "#0b1426"; ctx.beginPath(); ctx.ellipse(400, 470, 530, 168, 0, 0, Math.PI * 2); ctx.fill();
  return canvas;
}

// Keep the existing profile card on the same art as the animated scenes.
export async function loadHeroSheet(gender) {
  const key = gender === "nu" ? "nu" : "nam";
  if (!heroRows.has(key)) {
    const assets = await loadAssets();
    heroRows.set(key, key === "nu" ? assets.femaleHeroes : assets.maleHeroes);
  }
  return heroRows.get(key);
}

function label(ctx, value, x, y, size, color = WHITE, align = "left", maxWidth = 720, serif = false) {
  const str = String(value ?? "").replace(/[\r\n\t]+/g, " ");
  ctx.save();
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.font = `bold ${size}px ${serif ? "TuTienTitle" : "TuTienUI"}, sans-serif`;
  const measured = ctx.measureText(str).width;
  if (measured > maxWidth) ctx.font = `bold ${Math.max(10, size * maxWidth / measured)}px ${serif ? "TuTienTitle" : "TuTienUI"}, sans-serif`;
  ctx.fillStyle = color;
  ctx.shadowColor = "#020713";
  ctx.shadowBlur = 5;
  ctx.fillText(str, x, y, maxWidth);
  ctx.restore();
}

function rounded(ctx, x, y, w, h, radius, fill, stroke) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, radius);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

function orb(ctx, x, y, radius, color, alpha = 1) {
  ctx.save(); ctx.globalAlpha *= alpha;
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, `${color}b0`); g.addColorStop(.3, `${color}50`); g.addColorStop(1, `${color}00`);
  ctx.fillStyle = g; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2); ctx.restore();
}

function background(arena) {
  const canvas = createCanvas(SCENE_WIDTH, SCENE_HEIGHT), ctx = canvas.getContext("2d");
  ctx.drawImage(arena, 0, 0, canvas.width, canvas.height);
  const shade = ctx.createLinearGradient(0, 0, 0, canvas.height);
  shade.addColorStop(0, "#030b18e8"); shade.addColorStop(.25, "#08172b45");
  shade.addColorStop(.66, "#091a3025"); shade.addColorStop(1, "#030a17e8");
  ctx.fillStyle = shade; ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

function stage(ctx, plate, t, color) {
  ctx.drawImage(plate, 0, 0);
  ctx.save();
  for (let i = 0; i < 30; i++) {
    const x = (i * 127.7 + Math.sin(t * 3 + i) * 13) % 800;
    const y = 125 + ((i * 37.3 - t * (35 + i % 7) + 310) % 310);
    ctx.globalAlpha = .18 + Math.sin(i + t * 5) ** 2 * .35;
    ctx.fillStyle = i % 3 ? GOLD : color;
    ctx.beginPath(); ctx.arc(x, y, i % 4 === 0 ? 1.8 : 1, 0, TAU); ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = "#edcf8b55"; ctx.lineWidth = 1; ctx.strokeRect(13.5, 13.5, 773, 473);
  for (const [x, y, sx, sy] of [[13, 13, 1, 1], [787, 13, -1, 1], [13, 487, 1, -1], [787, 487, -1, -1]]) {
    ctx.strokeStyle = GOLD; ctx.beginPath(); ctx.moveTo(x, y + sy * 26); ctx.lineTo(x, y); ctx.lineTo(x + sx * 26, y); ctx.stroke();
  }
}

function sigil(ctx, x, y, radius, t, color, squash = 1, alpha = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1, squash); ctx.rotate(t * .7);
  ctx.globalAlpha *= alpha; ctx.strokeStyle = color; ctx.lineWidth = 1.2;
  ctx.shadowColor = color; ctx.shadowBlur = 6;
  for (const r of [radius, radius * .92, radius * .66]) {
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const a = TAU * i / 12;
    ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(0, -radius * .77);
    ctx.lineTo(-4, -radius * .82); ctx.lineTo(0, -radius * .89); ctx.lineTo(4, -radius * .82); ctx.closePath(); ctx.stroke(); ctx.restore();
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * radius * .64, Math.sin(a) * radius * .64);
    ctx.lineTo(Math.cos(a + TAU / 3) * radius * .64, Math.sin(a + TAU / 3) * radius * .64); ctx.stroke();
  }
  ctx.restore();
}

function hero(ctx, assets, p, x, bottom, height, t, alpha = 1, tilt = 0, flip = false) {
  const sheet = p.gender === "nu" ? assets.femaleHeroes : assets.maleHeroes;
  const sw = sheet.width / 5, sh = sheet.height, col = SECT_INDEX[p.sect] ?? 0;
  const w = height * sw / sh;
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.translate(x + Math.sin(t * TAU) * 2, bottom); ctx.rotate(tilt);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(sheet, col * sw, 0, sw, sh, -w / 2, -height - Math.sin(t * TAU) * 3, w, height);
  ctx.restore();
}

function footer(ctx, title, detail, color, progress) {
  rounded(ctx, 29, 428, 742, 47, 9, "#04101de8", "#edcf8b33");
  label(ctx, title, 400, 448, 16, color, "center", 700);
  label(ctx, detail, 400, 467, 11, MUTED, "center", 700);
  ctx.fillStyle = "#edcf8b20"; ctx.fillRect(44, 480, 712, 2);
  ctx.fillStyle = color; ctx.fillRect(44, 480, 712 * clamp(progress), 2);
}

function lightning(ctx, x, top, bottom, t, color, alpha) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, top);
  for (let i = 1; i <= 9; i++) ctx.lineTo(x + Math.sin(i * 8.1 + Math.floor(t * 12)) * 20, top + (bottom - top) * i / 9);
  ctx.stroke(); ctx.restore();
}

export async function createActionScene(p, type, success, sect, realmName) {
  const assets = await loadAssets(), plate = background(assets.arena);
  const cultivate = type === "cultivate", color = sect.color;
  return {
    tag: type,
    draw(ctx, t) {
      const reveal = t >= .78, charge = ease(t / .55), resolution = ease((t - .62) / .2);
      const outcomeColor = !cultivate && !success && reveal ? RED : color;
      stage(ctx, plate, t, outcomeColor);
      const leftShade = ctx.createLinearGradient(22, 0, 460, 0);
      leftShade.addColorStop(0, "#05111fd9"); leftShade.addColorStop(.75, "#05111f9a"); leftShade.addColorStop(1, "#05111f00");
      ctx.fillStyle = leftShade; ctx.fillRect(23, 70, 440, 352);
      label(ctx, "TIÊN LỘ VẤN ĐẠO", 42, 48, 17, GOLD);
      label(ctx, cultivate ? "TĨNH TÂM • DƯỠNG KHÍ" : "THIÊN KIẾP • NGHỊCH MỆNH", 758, 46, 10, MUTED, "right", 340);
      label(ctx, cultivate ? "Vận khí" : "Nghịch thiên", 49, 139, 42, WHITE, "left", 345, true);
      label(ctx, cultivate ? "TU LUYỆN" : "ĐỘT PHÁ", 49, 181, 32, GOLD, "left", 345);
      ctx.fillStyle = `${color}b0`; ctx.fillRect(51, 201, 56, 2);
      label(ctx, p.name, 50, 247, 23, WHITE, "left", 320);
      label(ctx, sect.name, 51, 276, 15, color, "left", 310);
      rounded(ctx, 49, 293, 287, 38, 8, "#0d243bc9", `${color}55`);
      label(ctx, realmName, 67, 318, 17, GOLD, "left", 253);
      label(ctx, cultivate ? "Linh khí hội tụ, đạo tâm an nhiên." : "Một bước vượt phàm, chạm tới tiên đạo.", 51, 366, 12, MUTED, "left", 315);
      label(ctx, "KIẾM • ĐAN • MA • PHẬT • LINH", 51, 397, 10, "#8eacbb", "left", 315);
      orb(ctx, 565, 262, 174, outcomeColor, .35 + charge * .4);
      sigil(ctx, 565, 258, 134 + charge * 7, t, outcomeColor, 1, .27 + charge * .28);
      sigil(ctx, 565, 397, 127, -t * 2, outcomeColor, .21, .65);
      if (!cultivate && t > .28 && t < .75) {
        const a = Math.sin(clamp((t - .28) / .47) * Math.PI) * .85;
        lightning(ctx, 477, 84, 381, t, success ? "#c7e9ff" : RED, a);
        lightning(ctx, 662, 83, 384, t + .2, success ? GOLD : RED, a * .7);
      }
      hero(ctx, assets, p, 565, 414, 343, t, !cultivate && !success ? 1 - resolution * .18 : 1);
      // Thin spirals pass in front of the robe without covering the face.
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.globalAlpha = .6;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.ellipse(565, 323 + i * 27, 104 + i * 6, 16, -.12, t * TAU + i, t * TAU + i + Math.PI); ctx.stroke();
      }
      ctx.restore();
      if (resolution > 0) sigil(ctx, 565, 258, 142 + resolution * 24, t, outcomeColor, 1, (1 - resolution) * .5);
      const phase = reveal ? (cultivate ? "CHU THIÊN VIÊN MÃN" : success ? "ĐỘT PHÁ THÀNH CÔNG" : "ĐỘT PHÁ THẤT BẠI")
        : t < .3 ? "TỤ KHÍ • HỘI TỤ LINH LỰC" : t < .62 ? (cultivate ? "THÔNG MẠCH • VẬN CHUYỂN CHU THIÊN" : "NGHÊNH KIẾP • PHÁ VỠ BÌNH CẢNH") : "ỔN ĐỊNH ĐẠO TÂM";
      const detail = reveal ? (cultivate ? "Tu vi tinh tiến · Tiếp tục hành trình tiên đạo" : success ? `Cảnh giới hiện tại: ${realmName}` : "Thiên kiếp chưa qua · Dưỡng thương, củng cố căn cơ")
        : sect.skill;
      footer(ctx, phase, detail, reveal && success ? GOLD : outcomeColor, t);
    },
  };
}

function healthBar(ctx, x, y, ratio, color, reverse = false) {
  rounded(ctx, x, y, 280, 8, 4, "#020814dc", "#d5e8ee30");
  const width = 276 * clamp(ratio);
  if (width > 0) rounded(ctx, reverse ? x + 278 - width : x + 2, y + 2, width, 4, 2, color);
}

function monsterPortal(ctx, sheet, level, x, bottom, t, color, alpha, boss) {
  const w = boss ? 181 : 167, h = 294, top = bottom - h, left = x - w / 2;
  ctx.save(); ctx.globalAlpha *= alpha;
  orb(ctx, x, top + h / 2, 135, color, .5);
  // The source is illustrated portrait art: show its scenery inside a summoning gate.
  ctx.save(); ctx.beginPath(); ctx.roundRect(left, top, w, h, [w / 2, w / 2, 13, 13]); ctx.clip();
  const col = clamp(Math.floor(Number(level) || 1) - 1, 0, 4), sw = sheet.width / 5;
  const zoom = 1.01 + Math.sin(t * Math.PI) * .015;
  ctx.drawImage(sheet, col * sw + 2, 0, sw - 4, sheet.height, left - w * (zoom - 1) / 2, top - h * (zoom - 1) / 2, w * zoom, h * zoom);
  const g = ctx.createLinearGradient(0, bottom - 80, 0, bottom);
  g.addColorStop(0, "#05111c00"); g.addColorStop(1, "#05111cc7"); ctx.fillStyle = g; ctx.fillRect(left, top, w, h);
  ctx.restore();
  rounded(ctx, left - 3, top - 3, w + 6, h + 6, [w / 2, w / 2, 16, 16], null, `${color}bb`);
  rounded(ctx, left - 7, top - 7, w + 14, h + 14, [w / 2, w / 2, 20, 20], null, "#edcf8b66");
  if (boss) label(ctx, "MA CHỦ", x, bottom - 15, 12, GOLD, "center", w - 15);
  ctx.restore();
}

function worldBossSprite(ctx, image, x, bottom, t, color, alpha) {
  const maxW = 245, maxH = 300;
  const scale = Math.min(maxW / image.width, maxH / image.height);
  const pulse = 1 + Math.sin(t * TAU) * .025;
  const w = image.width * scale * pulse, h = image.height * scale * pulse;
  ctx.save();
  ctx.globalAlpha *= alpha;
  orb(ctx, x, bottom - h * .48, 155, color, .62);
  ctx.shadowColor = color; ctx.shadowBlur = 22;
  ctx.translate(x + Math.sin(t * TAU) * 3, bottom - Math.sin(t * TAU) * 5);
  ctx.drawImage(image, -w / 2, -h, w, h);
  ctx.restore();
}

function attack(ctx, sect, from, to, y, progress, reverse = false) {
  const t = clamp(progress), x = from + (to - from) * ease(t), envelope = Math.sin(t * Math.PI);
  ctx.save(); ctx.globalAlpha = envelope; ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = sect.color; ctx.fillStyle = sect.color; ctx.shadowColor = sect.color; ctx.shadowBlur = 9;
  const dir = reverse ? -1 : 1;
  if (sect.key === "kiem") {
    for (let i = -2; i <= 2; i++) {
      const yy = y + i * 17, xx = x - Math.abs(i) * 13 * dir;
      ctx.beginPath(); ctx.moveTo(xx - 57 * dir, yy + 8); ctx.lineTo(xx + 18 * dir, yy - 5); ctx.lineTo(xx - 12 * dir, yy + 6); ctx.closePath(); ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = "#e8f6ff"; ctx.beginPath(); ctx.moveTo(xx - 47 * dir, yy + 9); ctx.lineTo(xx + 18 * dir, yy - 5); ctx.stroke();
    }
  } else if (sect.key === "dan") {
    for (let i = 5; i >= 0; i--) orb(ctx, x - i * 15 * dir, y + Math.sin(i + t * 8) * 11, 31 - i * 3, i % 2 ? "#ff653f" : "#ffd27f", 1 - i * .1);
  } else if (sect.key === "ma") {
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = i % 2 ? "#fa5f9c" : sect.color; ctx.lineWidth = 4 - i;
      ctx.beginPath(); ctx.arc(x - i * 12 * dir, y, 44 + i * 9, reverse ? 2.19 : -.95, reverse ? 4.29 : 1.15); ctx.stroke();
    }
  } else if (sect.key === "phat") {
    sigil(ctx, x, y, 48, t * 4, sect.color, 1, .9); orb(ctx, x, y, 33, GOLD, .8);
  } else {
    for (let i = 0; i < 4; i++) {
      const a = t * 7 + i * TAU / 4, yy = y + Math.sin(a) * 26;
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 85 * dir, y + Math.cos(a) * 12); ctx.quadraticCurveTo(x - 30 * dir, yy - 30, x, yy); ctx.stroke();
      orb(ctx, x, yy, 17, sect.color);
    }
  }
  ctx.restore();
}

export async function createBattleScene(p, enemy, result, sect, realmName) {
  const assets = await loadAssets(), plate = background(assets.arena);
  const safeBossAsset = /^[a-z0-9_-]+\.png$/i.test(enemy.bossAsset || "") ? enemy.bossAsset : "";
  const bossImage = safeBossAsset ? await loadImage(join(ASSETS, "world-boss", safeBossAsset)) : null;
  const duel = Boolean(enemy.isPlayer);
  const boss = !duel && /boss|ma chủ/i.test(`${enemy.title || ""} ${enemy.name || ""}`);
  const enemySect = (enemy.sect && SECTS[enemy.sect]) ? SECTS[enemy.sect] : sect;
  const enemyColor = duel ? (enemySect.color || "#ffab72") : ["#94ceff", "#ffab72", "#76d9f2", "#d68af1", GOLD][clamp(Math.floor(Number(enemy.level) || 1) - 1, 0, 4)];
  return {
    tag: duel ? "pk" : (boss ? "boss" : "hunt"),
    draw(ctx, t) {
      const strike = ease((t - .43) / .16), counter = ease((t - .62) / .14), reveal = t >= .82;
      const advance = Math.sin(clamp(t / .7) * Math.PI) * 15;
      const recoil = Math.sin(clamp((t - .47) / .16) * Math.PI) * 6;
      const retreat = !result.win ? counter * 14 : 0;
      const px = 198 + advance - retreat, ex = 594 + recoil;
      stage(ctx, plate, t, sect.color);
      label(ctx, duel ? "TIÊN GIẢ ĐỐI QUYẾT" : (boss ? "ĐẠI CHIẾN MA CHỦ" : "TIÊN MA GIAO PHONG"), 400, 42, 25, GOLD, "center", 720, true);
      label(ctx, `${realmName}  /  ${duel ? (enemy.title || "Tu sĩ") : (enemy.title || `Yêu thú cấp ${enemy.level}`)}`, 400, 62, 10, MUTED, "center", 680);
      label(ctx, p.name, 44, 91, 14, WHITE, "left", 280);
      if (p.companionName) label(ctx, `🧑‍🎓 Đệ tử: ${p.companionName}`, 44, 136, 10, GOLD, "left", 280);
      label(ctx, enemy.name, 756, 91, 14, WHITE, "right", 280);
      label(ctx, `⚔ ${p.equipment?.weapon?.name || "Tay không"}`, 44, 118, 10, sect.color, "left", 270);
      if (duel) label(ctx, `⚔ ${enemy.equipment?.weapon?.name || "Tay không"}`, 756, 118, 10, enemyColor, "right", 270);
      healthBar(ctx, 44, 101, 1 - counter * (result.win ? .18 : 1), "#7fe3c6");
      healthBar(ctx, 476, 101, 1 - strike * (result.win ? 1 : .36), "#ff8c98", true);
      sigil(ctx, px, 398, 97, t, sect.color, .22, .6);
      orb(ctx, px, 277, 113, sect.color, .42);
      hero(ctx, assets, p, px, 414, 296, t, 1 - (!result.win ? counter * .4 : 0), !result.win ? -counter * .045 : 0, false);
      if (duel) hero(ctx, assets, enemy, ex, 414, 296, t, 1 - (result.win ? strike * .48 : 0), result.win ? strike * .05 : 0, true);
      else if (bossImage) worldBossSprite(ctx, bossImage, ex, 413, t, enemyColor, 1 - (result.win ? strike * .48 : 0));
      else monsterPortal(ctx, assets.monsters, enemy.level, ex, 413, t, enemyColor, 1 - (result.win ? strike * .48 : 0), boss);
      sigil(ctx, ex, 405, 103, -t, enemyColor, .18, .55);
      label(ctx, fmt(result.myPower), 199, 414, 11, sect.color, "center", 150);
      label(ctx, fmt(result.enemyPower), 594, 414, 11, enemyColor, "center", 150);
      if (t > .12 && t < .54) {
        orb(ctx, px + 50, 276, 44, sect.color, Math.sin((t - .12) / .42 * Math.PI));
        attack(ctx, { ...sect, key: p.sect }, px + 65, ex - 44, 270, (t - .18) / .37, false);
      }
      if (t > .48 && t < .68) {
        const hit = (t - .48) / .2;
        sigil(ctx, ex, 270, 30 + hit * 78, t, GOLD, 1, (1 - hit) * .8);
      }
      if (!result.win && t > .55 && t < .79) {
        const q = (t - .55) / .24;
        if (duel && enemy.sect) {
          attack(ctx, { ...enemySect, key: enemy.sect }, ex - 65, px + 44, 270, q, true);
        } else {
          orb(ctx, ex - (ex - px) * ease(q), 270, 45, "#ff8296", Math.sin(q * Math.PI));
        }
      }
      label(ctx, reveal ? (result.worldBoss ? (result.win ? "TIÊU DIỆT" : `-${fmt(result.damage)} HP`) : (result.win ? "THẮNG" : "BẠI")) : "VS", 400, 196, reveal ? 25 : 19, reveal && !result.win && !result.worldBoss ? RED : GOLD, "center", 150, true);
      if (reveal) {
        footer(ctx, result.worldBoss ? (result.win ? "BOSS THẾ GIỚI ĐÃ BỊ TIÊU DIỆT" : "ĐẠI CHIẾN BOSS THẾ GIỚI") : result.win ? (duel ? "PK THẮNG LỢI" : (boss ? "HẠ GỤC MA CHỦ" : "TRẢM YÊU THÀNH CÔNG")) : (duel ? "PK THẤT BẠI" : "BẠI TRẬN • RÚT LUI"), result.worldBoss
          ? `Gây ${fmt(result.damage)} sát thương · Boss còn ${fmt(result.bossHp)}/${fmt(result.bossMaxHp)} HP`
          : result.win
          ? `+${fmt(result.cultivation)} tu vi   ·   +${fmt(result.stones)} linh thạch`
          : "Đạo hạnh chưa đủ · Dưỡng thương và tu luyện thêm", result.win ? GOLD : RED, t);
      } else {
        footer(ctx, t < .2 ? (duel ? "LÔI ĐÀI TỶ THÍ" : "YÊU KHÍ XUẤT HIỆN") : t < .6 ? (result.skillName || sect.skill).toLocaleUpperCase("vi-VN") : "GIAO PHONG QUYẾT ĐỊNH", sect.name, sect.color, t);
      }
    },
  };
}

export async function createProfileScene(p, sect, realmName, profileData = {}) {
  const assets = await loadAssets();
  const W = 680, H = 880;
  const color = sect?.color || "#61b6ff";
  const st = profileData.st || { atk: 100, def: 100, hp: 1000, power: 1000 };
  const current = profileData.current || ["Bàn Huyết", 0];
  const next = profileData.next ?? Infinity;
  const title = profileData.title || (p.isHeavenlyDao ? "Thiên Đạo · Chúa Tể Vạn Giới" : "");
  const currentMap = profileData.currentMap || { name: "Thạch Thôn", need: 0 };
  const mapCult = profileData.mapCult || 0;
  const mapBoss = profileData.mapBoss || 0;
  const faction = profileData.faction || null;
  const techName = profileData.techName || "Dẫn Khí Thuật";

  const prevCult = current[1] || 0;
  const cultRatio = next === Infinity ? 1 : clamp((p.cultivation - prevCult) / Math.max(1, next - prevCult), 0, 1);

  // Pre-render static plate một lần duy nhất
  const plate = createCanvas(W, H);
  const pctx = plate.getContext("2d");

  // Nền tiên giới gradient sâu thẳm
  const bg = pctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#050d18");
  bg.addColorStop(0.35, "#0b182b");
  bg.addColorStop(0.7, "#171228");
  bg.addColorStop(1, "#080c16");
  pctx.fillStyle = bg;
  pctx.fillRect(0, 0, W, H);

  // Vầng trăng tiên giới
  const moon = pctx.createRadialGradient(W - 100, 95, 6, W - 100, 95, 85);
  moon.addColorStop(0, "rgba(255,246,204,0.9)");
  moon.addColorStop(0.4, "rgba(255,236,170,0.25)");
  moon.addColorStop(1, "rgba(255,236,170,0)");
  pctx.fillStyle = moon;
  pctx.fillRect(W - 190, 10, 180, 180);

  // Khung viền mạ vàng ngoài cùng
  pctx.strokeStyle = "#edcf8b44";
  pctx.lineWidth = 1;
  pctx.strokeRect(10, 10, W - 20, H - 20);
  for (const [cx, cy, sx, sy] of [[10, 10, 1, 1], [W - 10, 10, -1, 1], [10, H - 10, 1, -1], [W - 10, H - 10, -1, -1]]) {
    pctx.strokeStyle = GOLD;
    pctx.lineWidth = 2;
    pctx.beginPath();
    pctx.moveTo(cx, cy + sy * 24);
    pctx.lineTo(cx, cy);
    pctx.lineTo(cx + sx * 24, cy);
    pctx.stroke();
  }

  // Card chính bo góc
  rounded(pctx, 24, 22, W - 48, H - 44, 20, "rgba(5,13,24,0.88)", `${color}66`);

  // Banner Header
  pctx.fillStyle = `${color}18`;
  pctx.beginPath();
  pctx.roundRect(24, 22, W - 48, 88, [20, 20, 0, 0]);
  pctx.fill();

  label(pctx, "TIÊN LỘ VẤN ĐẠO", W / 2, 58, 26, GOLD, "center", W - 100, true);
  const subHeading = p.isHeavenlyDao
    ? "THIÊN ĐẠO · CHÚA TỂ VẠN GIỚI"
    : `HỒ SƠ TU SĨ${p.rebirth ? ` · ${p.rebirth} CHUYỂN SINH` : ""}`;
  label(pctx, subHeading, W / 2, 88, 13, p.isHeavenlyDao ? "#ffd966" : MUTED, "center", W - 120);

  // Khung thông tin nhân vật bên phải
  const infoX = 275;
  label(pctx, p.name, infoX, 155, 26, WHITE, "left", 360, true);
  label(pctx, `${sect.name} · ${p.gender === "nu" ? "Nữ Tu" : "Nam Tu"}`, infoX, 185, 17, color, "left", 360);
  label(pctx, `Tuyệt kỹ: ${sect.skill}`, infoX, 212, 13, "#abbdce", "left", 360);

  if (title) {
    rounded(pctx, infoX, 224, 360, 28, 6, p.isHeavenlyDao ? "rgba(255,217,102,0.18)" : "rgba(255,255,255,0.07)", p.isHeavenlyDao ? "rgba(255,217,102,0.65)" : `${color}55`);
    label(pctx, `✦ ${title}`, infoX + 12, 243, 12, p.isHeavenlyDao ? "#ffe58a" : "#e0d4ff", "left", 335);
  }

  const daoLuText = p.daoLu?.name ? `💞 Đạo Lữ: ${p.daoLu.name}` : "Đạo Lữ: Độc hành tu đạo";
  label(pctx, daoLuText, infoX, title ? 275 : 246, 13, p.daoLu?.name ? "#ff94b8" : "#94a7b8", "left", 360);
  const factionText = faction?.name ? `Thế lực: ${faction.name}` : "Thế lực: Tự do";
  label(pctx, factionText, infoX, title ? 298 : 269, 13, faction?.name ? color : "#8298aa", "left", 360);

  // Box Cảnh Giới & Tu Vi (y: 395)
  const boxY = 395;
  rounded(pctx, 42, boxY, W - 84, 115, 14, "rgba(255,255,255,0.045)", "rgba(255,255,255,0.1)");
  label(pctx, realmName, 60, boxY + 34, 22, GOLD, "left", 320, true);
  const cultText = p.realm >= 19 ? "Đại Đạo Viên Mãn" : `${fmt(p.cultivation)} / ${fmt(next)} tu vi`;
  label(pctx, cultText, W - 60, boxY + 33, 14, "#c2d1dd", "right", 260);

  // Rãnh nền của thanh tu vi
  rounded(pctx, 60, boxY + 48, W - 120, 14, 7, "rgba(255,255,255,0.1)");

  // Tài nguyên dưới thanh tu vi
  label(pctx, `◈ LINH THẠCH: ${fmt(p.stones)}`, 60, boxY + 92, 14, GOLD, "left", 260);
  label(pctx, `⚡ THỂ LỰC: ${p.energy}/100`, W - 60, boxY + 92, 14, "#7ee0b5", "right", 260);

  // Box Chiến Lực & Tam Thuộc Tính (y: 526)
  const statsY = 526;
  label(pctx, "CHIẾN LỰC", 44, statsY + 16, 13, "#7f98ad");
  label(pctx, fmt(st.power), 44, statsY + 54, 34, WHITE, "left", 240, true);

  // 3 thẻ chỉ số: CÔNG, THỦ, MÁU
  const statCards = [
    ["CÔNG", st.atk, "#ff7262"],
    ["THỦ", st.def, "#5eb8ff"],
    ["MÁU", st.hp, "#5ce0a3"],
  ];
  const cardW = 188, cardH = 68, cardGap = 16, startCardX = 42;
  statCards.forEach(([sLabel, val, sColor], idx) => {
    const cx = startCardX + idx * (cardW + cardGap);
    const cy = statsY + 68;
    rounded(pctx, cx, cy, cardW, cardH, 10, "rgba(255,255,255,0.05)", `${sColor}55`);
    label(pctx, sLabel, cx + 14, cy + 24, 12, "#8ca2b4");
    label(pctx, fmt(val), cx + 14, cy + 54, 20, sColor, "left", cardW - 28, true);
  });

  // Box Hành Trang & Chiến Tích (y: 676)
  const bagY = 676;
  label(pctx, "PHÁP BẢO & CHIẾN TÍCH", 44, bagY + 16, 13, "#7f98ad");
  rounded(pctx, 42, bagY + 24, W - 84, 136, 12, "rgba(255,255,255,0.04)", "rgba(255,255,255,0.09)");

  const eq1 = `Vũ Khí: ${p.equipment?.weapon?.name || "Tay không"}`;
  const eq2 = `Hộ Giáp: ${p.equipment?.armor?.name || "Vải thô"}`;
  label(pctx, eq1, 60, bagY + 52, 13, "#d5e2ec", "left", 270);
  label(pctx, eq2, W / 2 + 10, bagY + 52, 13, "#d5e2ec", "left", 270);

  const eq3 = `Pháp Bảo: ${p.equipment?.artifact?.name || "Chưa có"}`;
  const eq4 = `Công Pháp: ${techName}`;
  label(pctx, eq3, 60, bagY + 78, 13, "#d5e2ec", "left", 270);
  label(pctx, eq4, W / 2 + 10, bagY + 78, 13, "#d5e2ec", "left", 270);

  const mapInfo = `Bản đồ: ${currentMap.name} (${fmt(mapCult)}/${fmt(currentMap.need || 0)})`;
  label(pctx, mapInfo, 60, bagY + 104, 12, "#c9b6f0", "left", 270);
  const winRate = (p.wins + p.losses) > 0 ? Math.round((p.wins / (p.wins + p.losses)) * 100) : 0;
  const pvpInfo = `Săn: ${p.kills} · Boss: ${mapBoss} · Thắng/Bại: ${p.wins}/${p.losses} (${winRate}%)`;
  label(pctx, pvpInfo, W / 2 + 10, bagY + 104, 12, "#8fa4b5", "left", 270);

  const footerText = "Ngẩng đầu ba thước có thần minh · Nghịch thiên cải mệnh";
  label(pctx, footerText, W / 2, H - 28, 11, "#657c91", "center", W - 100);

  return {
    tag: "profile",
    width: W,
    height: H,
    gifStyle: { width: 544, height: 704, frames: 10, delay: 130, hold: 1000 },
    draw(ctx, t) {
      // 1. Vẽ tấm nền tĩnh
      ctx.drawImage(plate, 0, 0);

      // 2. Bụi sao / linh khí lấp lánh bay lên
      ctx.save();
      for (let i = 0; i < 22; i++) {
        const px = (i * 97.3 + Math.sin(t * TAU + i) * 8) % (W - 80) + 40;
        const py = 110 + ((i * 37.1 - t * 35 + 720) % 720);
        const pAlpha = 0.15 + 0.45 * Math.sin(t * TAU + i * 1.5) ** 2;
        ctx.globalAlpha = pAlpha;
        ctx.fillStyle = i % 3 === 0 ? GOLD : color;
        ctx.beginPath();
        ctx.arc(px, py, i % 4 === 0 ? 1.8 : 1.1, 0, TAU);
        ctx.fill();
      }
      ctx.restore();

      // 3. Nhân vật tu sĩ & Linh trận phía sau
      const heroCx = 148;
      const heroBottom = 388 + Math.sin(t * TAU) * 3;

      // Hào quang chân nguyên (pulsing aura)
      orb(ctx, heroCx, heroBottom - 120, 115, color, 0.32 + Math.sin(t * TAU) * 0.1);

      // Bát quái linh trận xoay chậm sau lưng
      sigil(ctx, heroCx, heroBottom - 120, 95, t * TAU * 0.6, color, 1, 0.35);
      sigil(ctx, heroCx, heroBottom - 8, 92, -t * TAU * 1.2, color, 0.22, 0.55);

      // Sprite nhân vật tu sĩ
      hero(ctx, assets, p, heroCx, heroBottom, 260, t, 1, 0, false);

      // Vòng khí chu thiên lướt nhẹ trước thân
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.3;
      ctx.globalAlpha = 0.55;
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.ellipse(heroCx, heroBottom - 110 + i * 28, 85 + i * 8, 14, -0.1, t * TAU + i * 2, t * TAU + i * 2 + Math.PI);
        ctx.stroke();
      }
      ctx.restore();

      // 4. Thanh Tu Vi: Phần đầy & Vệt sáng năng lượng chạy qua (Shimmer)
      const barX = 60, barY = boxY + 48, maxBarW = W - 120, barH = 14;
      const filledW = Math.max(12, maxBarW * cultRatio);
      rounded(ctx, barX, barY, filledW, barH, 7, color);

      // Vệt sáng (light sweep shimmer)
      if (filledW > 20) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(barX, barY, filledW, barH, 7);
        ctx.clip();
        const shimmerPos = (t * 1.5) % 1.2;
        const sx = barX + shimmerPos * filledW - 40;
        const sGrad = ctx.createLinearGradient(sx, 0, sx + 50, 0);
        sGrad.addColorStop(0, "rgba(255,255,255,0)");
        sGrad.addColorStop(0.5, "rgba(255,255,255,0.7)");
        sGrad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = sGrad;
        ctx.fillRect(sx, barY, 50, barH);
        ctx.restore();
      }
    },
  };
}

export async function encodeSceneGif(scene) {
  const style = scene.gifStyle || GIF_STYLE;
  const { width, height, frames, delay, hold } = style;
  const file = join(tmpdir(), `tutien-${scene.tag || "scene"}-${randomUUID()}.gif`);
  const canvas = createCanvas(width, height), ctx = canvas.getContext("2d"), encoder = new GIFEncoder(width, height);
  const output = createWriteStream(file), finished = new Promise((resolve, reject) => { output.once("finish", resolve); output.once("error", reject); });
  encoder.createReadStream().pipe(output); encoder.start(); encoder.setRepeat(0); encoder.setDelay(delay); encoder.setQuality(18);
  const sceneW = scene.width || SCENE_WIDTH, sceneH = scene.height || SCENE_HEIGHT;
  for (let frame = 0; frame < frames; frame++) {
    ctx.save();
    ctx.scale(width / sceneW, height / sceneH);
    scene.draw(ctx, frame / (frames - 1));
    ctx.restore();
    if (frame === frames - 1) encoder.setDelay(hold);
    encoder.addFrame(ctx);
  }
  encoder.finish(); await finished; return file;
}
