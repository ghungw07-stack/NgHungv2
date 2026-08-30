import { createCanvas, loadImage } from "canvas";
import GIFEncoder from "gifencoder";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { Worker } from "worker_threads";

const SECTS = {
  kiem: { name: "Thiên Kiếm Tông", icon: "⚔️", color: "#61b6ff", atk: 1.22, def: .92, hp: .95, skill: "Vạn Kiếm Quy Tông" },
  dan: { name: "Đan Hà Cốc", icon: "🔥", color: "#ff9f5b", atk: 1.02, def: 1, hp: 1.16, skill: "Cửu Chuyển Hoàn Sinh" },
  ma: { name: "U Minh Ma Môn", icon: "🌑", color: "#bd79ff", atk: 1.16, def: .96, hp: 1, skill: "Huyết Hải Thôn Thiên" },
  phat: { name: "Vạn Phật Tự", icon: "☸️", color: "#ffd56a", atk: .94, def: 1.24, hp: 1.08, skill: "Kim Cang Phục Ma" },
  linh: { name: "Ngự Linh Sơn", icon: "🦊", color: "#65e1b0", atk: 1.07, def: 1.04, hp: 1.04, skill: "Vạn Thú Triều Tông" },
};
const REALMS = [
  ["Phàm Nhân", 0], ["Luyện Khí", 500], ["Trúc Cơ", 1800], ["Kim Đan", 6000],
  ["Nguyên Anh", 18000], ["Hóa Thần", 50000], ["Luyện Hư", 130000], ["Hợp Thể", 320000],
  ["Đại Thừa", 750000], ["Độ Kiếp", 1600000], ["Chân Tiên", 3500000], ["Tiên Vương", 8000000],
];
const ITEMS = {
  tulinhdan: { name: "Tụ Linh Đan", icon: "💊", price: 120, category: "dan", rarity: "Phàm", desc: "+300 tu vi", use: p => addCultivation(p, 300) },
  hoanhuandan: { name: "Hoàn Hồn Đan", icon: "🧪", price: 260, category: "dan", rarity: "Phàm", desc: "+80 thể lực", use: p => { p.energy = Math.min(100, p.energy + 80); } },
  phukiep: { name: "Phù Hộ Kiếp", icon: "📜", price: 650, category: "dan", rarity: "Linh", desc: "+20% đột phá", passive: true },
  kiemgo: { name: "Thanh Mộc Kiếm", icon: "🗡️", price: 900, category: "vukhi", rarity: "Linh", req: 0, slot: "weapon", desc: "+18 công", equip: { atk: 18 } },
  thanhvan: { name: "Thanh Vân Kiếm", icon: "⚔️", price: 2600, category: "vukhi", rarity: "Huyền", req: 1, slot: "weapon", desc: "+48 công, +3% bạo kích", equip: { atk: 48, crit: .03 } },
  xichdiem: { name: "Xích Diễm Thương", icon: "🔱", price: 6800, category: "vukhi", rarity: "Địa", req: 2, slot: "weapon", desc: "+105 công", equip: { atk: 105 } },
  uminhkiem: { name: "U Minh Huyết Kiếm", icon: "🩸", price: 18000, category: "vukhi", rarity: "Thiên", req: 3, slot: "weapon", desc: "+210 công, +8% bạo kích", equip: { atk: 210, crit: .08 } },
  cuulong: { name: "Cửu Long Tiên Kiếm", icon: "🐉", price: 65000, category: "vukhi", rarity: "Tiên", req: 5, slot: "weapon", desc: "+480 công, +12% bạo kích", equip: { atk: 480, crit: .12 } },
  giaplinh: { name: "Linh Tê Giáp", icon: "🥋", price: 1100, category: "giap", rarity: "Linh", req: 0, slot: "armor", desc: "+22 thủ, +80 HP", equip: { def: 22, hp: 80 } },
  huyenbang: { name: "Huyền Băng Pháp Bào", icon: "🧥", price: 3600, category: "giap", rarity: "Huyền", req: 1, slot: "armor", desc: "+65 thủ, +180 HP", equip: { def: 65, hp: 180 } },
  kimcanh: { name: "Kim Cang Chiến Giáp", icon: "🛡️", price: 11000, category: "giap", rarity: "Địa", req: 3, slot: "armor", desc: "+145 thủ, +420 HP", equip: { def: 145, hp: 420 } },
  tinhthan: { name: "Tinh Thần Tiên Y", icon: "🌌", price: 52000, category: "giap", rarity: "Tiên", req: 5, slot: "armor", desc: "+330 thủ, +950 HP", equip: { def: 330, hp: 950 } },
  tutapchau: { name: "Tụ Linh Châu", icon: "🔮", price: 2200, category: "phapbao", rarity: "Huyền", req: 1, slot: "artifact", desc: "+12% tu luyện", equip: { cultivation: .12 } },
  phongloi: { name: "Phong Lôi Ấn", icon: "⚡", price: 8500, category: "phapbao", rarity: "Địa", req: 2, slot: "artifact", desc: "+70 công, +55 thủ", equip: { atk: 70, def: 55 } },
  honthien: { name: "Hỗn Thiên Kính", icon: "☯️", price: 26000, category: "phapbao", rarity: "Thiên", req: 4, slot: "artifact", desc: "+160 công, +160 thủ, +500 HP", equip: { atk: 160, def: 160, hp: 500 } },
  sonhaky: { name: "Sơn Hà Xã Tắc Đồ", icon: "🗺️", price: 120000, category: "phapbao", rarity: "Thần", req: 7, slot: "artifact", desc: "+420 công/thủ, +1600 HP", equip: { atk: 420, def: 420, hp: 1600, cultivation: .2 } },
};
const TECHNIQUES = {
  dantho: { name: "Dẫn Khí Thuật", price: 0, req: 0, cultivation: 1, atk: 1, def: 1, hp: 1, desc: "Công pháp nhập môn cân bằng" },
  thanhvanquyet: { name: "Thanh Vân Kiếm Quyết", price: 3500, req: 1, sect: "kiem", cultivation: 1.1, atk: 1.16, def: .96, hp: 1, desc: "+16% công, +10% tu luyện" },
  cuuchuyendan: { name: "Cửu Chuyển Đan Kinh", price: 3500, req: 1, sect: "dan", cultivation: 1.2, atk: 1, def: 1, hp: 1.1, desc: "+20% tu luyện, +10% HP" },
  huyethai: { name: "Huyết Hải Ma Công", price: 3500, req: 1, sect: "ma", cultivation: 1.08, atk: 1.22, def: .92, hp: 1, desc: "+22% công, +8% tu luyện" },
  kimcang: { name: "Bất Diệt Kim Cang", price: 3500, req: 1, sect: "phat", cultivation: 1.05, atk: 1, def: 1.2, hp: 1.16, desc: "+20% thủ, +16% HP" },
  vanthu: { name: "Vạn Thú Ngự Linh Kinh", price: 3500, req: 1, sect: "linh", cultivation: 1.12, atk: 1.08, def: 1.08, hp: 1.05, desc: "Chỉ số toàn diện" },
  honnguyen: { name: "Hỗn Nguyên Đạo Điển", price: 28000, req: 4, cultivation: 1.28, atk: 1.15, def: 1.15, hp: 1.15, desc: "Thiên giai, toàn diện cực mạnh" },
  thienmenh: { name: "Thái Thượng Thiên Mệnh Kinh", price: 100000, req: 7, cultivation: 1.45, atk: 1.28, def: 1.28, hp: 1.28, desc: "Thần cấp công pháp tối thượng" },
};
const COMBAT_SKILLS = {
  kiem: [
    { key: "phongkiem", name: "Phong Kiếm Trảm", req: 0, mult: 1.05 }, { key: "thienngoai", name: "Thiên Ngoại Phi Tiên", req: 1, mult: 1.12 },
    { key: "vankiem", name: "Vạn Kiếm Quy Tông", req: 2, mult: 1.2 }, { key: "nhatkiem", name: "Nhất Kiếm Phá Vạn Pháp", req: 4, mult: 1.32 }, { key: "truuthien", name: "Tru Thiên Kiếm Trận", req: 6, mult: 1.48 },
  ],
  dan: [
    { key: "danhoa", name: "Đan Hỏa Chưởng", req: 0, mult: 1.05 }, { key: "xichviem", name: "Xích Viêm Phần Thiên", req: 1, mult: 1.12 },
    { key: "cuuchuyen", name: "Cửu Chuyển Hỏa Liên", req: 2, mult: 1.2 }, { key: "thienhoa", name: "Thiên Hỏa Diệt Thế", req: 4, mult: 1.32 }, { key: "deviem", name: "Đế Viêm Phần Giới", req: 6, mult: 1.48 },
  ],
  ma: [
    { key: "huyettram", name: "Huyết Ảnh Trảm", req: 0, mult: 1.05 }, { key: "umat", name: "U Minh Ma Trảo", req: 1, mult: 1.12 },
    { key: "huyethai", name: "Huyết Hải Thôn Thiên", req: 2, mult: 1.2 }, { key: "vannahon", name: "Vạn Hồn Phệ Thiên", req: 4, mult: 1.32 }, { key: "maton", name: "Ma Tôn Diệt Thế", req: 6, mult: 1.48 },
  ],
  phat: [
    { key: "lahanchuong", name: "La Hán Chưởng", req: 0, mult: 1.05 }, { key: "kimcang", name: "Kim Cang Phục Ma", req: 1, mult: 1.12 },
    { key: "daibi", name: "Đại Bi Phật Ấn", req: 2, mult: 1.2 }, { key: "nhulai", name: "Như Lai Thần Chưởng", req: 4, mult: 1.32 }, { key: "vansu", name: "Vạn Thế Phật Quang", req: 6, mult: 1.48 },
  ],
  linh: [
    { key: "linhho", name: "Linh Hồ Truy Kích", req: 0, mult: 1.05 }, { key: "bachthu", name: "Bách Thú Bôn Đằng", req: 1, mult: 1.12 },
    { key: "vanthu", name: "Vạn Thú Triều Tông", req: 2, mult: 1.2 }, { key: "thanlong", name: "Ngự Thần Long", req: 4, mult: 1.32 }, { key: "kylan", name: "Kỳ Lân Diệt Ma", req: 6, mult: 1.48 },
  ],
};
const MONSTERS = [
  ["Thanh Lang", "🐺", .78], ["Xích Diễm Hổ", "🐯", .95], ["Huyền Thủy Giao", "🐉", 1.12],
  ["Cửu U Ma Tướng", "👹", 1.35], ["Thượng Cổ Cùng Kỳ", "🦁", 1.6],
];
const CD = { cultivate: 60_000, hunt: 45_000, boss: 5 * 60_000 };
const dataPath = botId => path.join(process.cwd(), "logs", String(botId), "tu-tien.json");
const HERO_SHEETS = {
  nam: path.join(process.cwd(), "assets", "resources", "tu-tien", "sect-heroes-male.png"),
  nu: path.join(process.cwd(), "assets", "resources", "tu-tien", "sect-heroes-female.png"),
};
const MONSTER_SHEET = path.join(process.cwd(), "assets", "resources", "tu-tien", "monsters.png");
const SECT_INDEX = { kiem: 0, dan: 1, ma: 2, phat: 3, linh: 4 };
const playerKey = id => String(id);
const SESSION_TTL = 5 * 60_000;
const sessions = new Map();
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const fmt = n => Math.floor(Number(n) || 0).toLocaleString("vi-VN");

function readData(botId) {
  try { const d = JSON.parse(fs.readFileSync(dataPath(botId), "utf8")); d.players ||= {}; return d; }
  catch { return { players: {} }; }
}
function writeData(botId, data) {
  const file = dataPath(botId); fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`; fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`); fs.renameSync(tmp, file);
}
function realm(p) { return REALMS[clamp(p.realm || 0, 0, REALMS.length - 1)]; }
function nextNeed(p) { return REALMS[p.realm + 1]?.[1] ?? Infinity; }
function stats(p) {
  const s = SECTS[p.sect], e = p.equipment || {}, r = p.realm || 0, tech = TECHNIQUES[p.activeTechnique] || TECHNIQUES.dantho;
  const bonus = Object.values(e).reduce((sum, item) => ({ atk: sum.atk + (item?.atk || 0), def: sum.def + (item?.def || 0), hp: sum.hp + (item?.hp || 0), crit: sum.crit + (item?.crit || 0), cultivation: sum.cultivation + (item?.cultivation || 0) }), { atk: 0, def: 0, hp: 0, crit: 0, cultivation: 0 });
  return {
    atk: Math.round((30 + r * 24 + bonus.atk) * s.atk * tech.atk),
    def: Math.round((20 + r * 20 + bonus.def) * s.def * tech.def),
    hp: Math.round((280 + r * 150 + bonus.hp) * s.hp * tech.hp),
    crit: bonus.crit,
    cultivationRate: tech.cultivation * (1 + bonus.cultivation),
    power: Math.round(((30 + r * 24 + bonus.atk) * s.atk * tech.atk) * 5 + ((20 + r * 20 + bonus.def) * s.def * tech.def) * 4 + (280 + r * 150 + bonus.hp) * s.hp * tech.hp + p.cultivation / 18),
  };
}
function addCultivation(p, amount) { p.cultivation = Math.max(0, Math.floor((p.cultivation || 0) + amount)); }
function cooldown(p, type) { return Math.max(0, CD[type] - (Date.now() - (p.actions?.[type] || 0))); }
function waitText(ms) { const s = Math.ceil(ms / 1000); return s >= 60 ? `${Math.ceil(s / 60)} phút` : `${s} giây`; }
function newPlayer(sect, gender, name, userId) {
  return { userId, name, sect, gender, realm: 0, cultivation: 0, stones: 500, energy: 100, wins: 0, losses: 0, kills: 0, inventory: { tulinhdan: 1 }, equipment: {}, techniques: ["dantho"], activeTechnique: "dantho", actions: {}, createdAt: Date.now(), lastEnergyAt: Date.now(), lastIdleAt: Date.now(), dailyDate: "", quests: {} };
}
function heroSheetPath(p) { return HERO_SHEETS[p.gender === "nu" ? "nu" : "nam"]; }
function todayVN() { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }); }
function refreshPlayer(p) {
  const now = Date.now(), elapsed = Math.max(0, now - (p.lastEnergyAt || now)), recovered = Math.floor(elapsed / 180_000);
  if (recovered > 0) { p.energy = Math.min(100, (p.energy ?? 100) + recovered); p.lastEnergyAt = (p.lastEnergyAt || now) + recovered * 180_000; }
  if (p.questDate !== todayVN()) { p.questDate = todayVN(); p.quests = { cultivate: 0, hunt: 0, boss: 0 }; p.questClaims = {}; }
}
function touchQuest(p, key) { p.quests ||= {}; p.quests[key] = (p.quests[key] || 0) + 1; }
function unlockedSkills(p) { return (COMBAT_SKILLS[p.sect] || []).filter(skill => skill.req <= (p.realm || 0)); }
function selectedCombatSkill(p) { const available = unlockedSkills(p), chosen = available.find(skill => skill.key === p.activeSkill); return chosen || available[available.length - 1] || COMBAT_SKILLS[p.sect][0]; }
function simulateIdle(p, elapsedMs) {
  const minutes = Math.floor(Math.min(8 * 3_600_000, Math.max(0, elapsedMs)) / 60_000), mode = p.autoTrain?.mode || "tuluyen", level = clamp(p.autoTrain?.monsterLevel || 1, 1, 5);
  const result = { minutes, cultivation: 0, stones: 0, breakthroughs: [], hunts: 0, huntWins: 0, mode, level };
  if (minutes < 5) return result;
  const rate = stats(p).cultivationRate;
  if (["tuluyen", "dotpha", "full"].includes(mode)) {
    result.cultivation = Math.round(minutes * (2 + p.realm) * rate); result.stones += Math.floor(minutes / 5) * (3 + p.realm); addCultivation(p, result.cultivation);
  }
  if (["dotpha", "full"].includes(mode)) {
    let attempts = 0;
    while (p.realm < REALMS.length - 1 && p.cultivation >= nextNeed(p) && attempts < 4) {
      attempts++; const chance = clamp(.78 - p.realm * .04, .4, .88);
      if (Math.random() < chance) { p.realm++; result.breakthroughs.push(`✅ ${realm(p)[0]}`); }
      else { const loss = Math.floor((nextNeed(p) - REALMS[p.realm][1]) * .08); addCultivation(p, -loss); result.cultivation -= loss; result.breakthroughs.push("❌ thất bại"); break; }
    }
  }
  if (["san", "full"].includes(mode)) {
    result.hunts = Math.min(24, Math.floor(minutes / 12)); const monster = MONSTERS[level - 1];
    for (let i = 0; i < result.hunts; i++) { const enemyPower = Math.round((330 + level * 390 + p.realm * 165) * monster[2]), skill = selectedCombatSkill(p), myPower = stats(p).power * skill.mult; if (myPower * (.82 + Math.random() * .38) >= enemyPower * (.85 + Math.random() * .25)) { const cultivation = 55 + level * 45, stones = 22 + level * 24; addCultivation(p, cultivation); result.cultivation += cultivation; result.stones += stones; result.huntWins++; p.kills++; p.wins++; } else p.losses++; }
  }
  if (mode === "full") {
    let attempts = 0;
    while (p.realm < REALMS.length - 1 && p.cultivation >= nextNeed(p) && attempts < 4) { attempts++; const chance = clamp(.78 - p.realm * .04, .4, .88); if (Math.random() < chance) { p.realm++; result.breakthroughs.push(`✅ ${realm(p)[0]}`); } else { const loss = Math.floor((nextNeed(p) - REALMS[p.realm][1]) * .08); addCultivation(p, -loss); result.cultivation -= loss; result.breakthroughs.push("❌ thất bại"); break; } }
  }
  p.stones += result.stones;
  return result;
}
function idleSummary(result) {
  const modeNames = { tuluyen: "Tu luyện", dotpha: "Tu luyện + đột phá", san: `Săn yêu cấp ${result.level}`, full: `Toàn năng · săn cấp ${result.level}` };
  return `💤 KẾT QUẢ TREO · ${modeNames[result.mode]}\n\n⏱️ ${result.minutes} phút\n🧘 +${fmt(result.cultivation)} tu vi\n◈ +${fmt(result.stones)} linh thạch${result.hunts ? `\n🐉 Săn ${result.hunts} trận · thắng ${result.huntWins}` : ""}${result.breakthroughs.length ? `\n⚡ Đột phá: ${result.breakthroughs.join(" → ")}` : ""}`;
}

function rounded(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}
function text(ctx, value, x, y, size, color = "#fff", align = "left", weight = "normal") {
  ctx.font = `${weight} ${size}px sans-serif`; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(String(value), x, y);
}
function bar(ctx, x, y, w, value, color) {
  rounded(ctx, x, y, w, 16, 8, "rgba(255,255,255,.12)"); rounded(ctx, x, y, Math.max(12, w * clamp(value, 0, 1)), 16, 8, color);
}
function backdrop(ctx, W, H, color) {
  const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#07131f"); g.addColorStop(.55, "#12243a"); g.addColorStop(1, "#25162e"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = .16; ctx.fillStyle = color; for (let i = 0; i < 45; i++) { const x = (i * 173) % W, y = (i * 97) % H, r = 2 + i % 7; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1;
  const moon = ctx.createRadialGradient(W - 160, 135, 8, W - 160, 135, 100); moon.addColorStop(0, "rgba(255,244,195,.85)"); moon.addColorStop(1, "rgba(255,244,195,0)"); ctx.fillStyle = moon; ctx.fillRect(W - 280, 15, 240, 240);
}
function drawSprite(ctx, sheet, index, cx, bottom, maxW, maxH, flip = false) {
  const sw = sheet.width / 5, sh = sheet.height, scale = Math.min(maxW / sw, maxH / sh), dw = sw * scale, dh = sh * scale;
  ctx.save(); ctx.translate(cx, 0); if (flip) ctx.scale(-1, 1);
  ctx.drawImage(sheet, index * sw, 0, sw, sh, -dw / 2, bottom - dh, dw, dh); ctx.restore();
}
async function saveCanvas(canvas, tag) { const file = path.join("/tmp", `tutien-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}.png`); await fsp.writeFile(file, canvas.toBuffer("image/png")); return file; }

async function encodeGif(tag, width, height, frames, draw, delay = 110) {
  const file = path.join("/tmp", `tutien-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}.gif`);
  const canvas = createCanvas(width, height), ctx = canvas.getContext("2d"), encoder = new GIFEncoder(width, height), output = fs.createWriteStream(file);
  const finished = new Promise((resolve, reject) => { output.once("finish", resolve); output.once("error", reject); });
  encoder.createReadStream().pipe(output); encoder.start(); encoder.setRepeat(0); encoder.setDelay(delay); encoder.setQuality(30);
  for (let frame = 0; frame < frames; frame++) { draw(ctx, frame, frames); encoder.addFrame(ctx); }
  encoder.finish(); await finished; return file;
}

export async function renderActionGif(p, type, success = true) {
  const W = 640, H = 400, sect = SECTS[p.sect], title = type === "cultivate" ? "VẬN CHUYỂN CHU THIÊN" : success ? "ĐỘT PHÁ THÀNH CÔNG" : "ĐỘT PHÁ THẤT BẠI";
  const heroes = await loadImage(heroSheetPath(p));
  return encodeGif(type, W, H, 10, (ctx, f, total) => {
    const t = f / (total - 1); backdrop(ctx, W, H, success ? sect.color : "#ef4758");
    ctx.save(); ctx.translate(W / 2, 240);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + t * Math.PI * 2.2, radius = 66 + (i % 3) * 25; ctx.beginPath(); ctx.arc(Math.cos(a) * radius, Math.sin(a) * radius * .42, 4 + i % 4, 0, Math.PI * 2); ctx.fillStyle = i % 2 ? sect.color : "#f7e6a4"; ctx.globalAlpha = .3 + .65 * Math.sin((t + i / 10) * Math.PI) ** 2; ctx.fill(); }
    ctx.globalAlpha = 1; const aura = ctx.createRadialGradient(0, 0, 8, 0, 0, 105 + Math.sin(t * Math.PI * 4) * 9); aura.addColorStop(0, "rgba(255,255,255,.72)"); aura.addColorStop(.4, `${sect.color}77`); aura.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = aura; ctx.fillRect(-130, -130, 260, 260); ctx.restore();
    drawSprite(ctx, heroes, SECT_INDEX[p.sect], W / 2, 355, 225, 265);
    if (type === "breakthrough") { ctx.strokeStyle = success ? "#f8e58e" : "#ff5368"; ctx.lineWidth = 6; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 14; const x = W * (.25 + .5 * ((f * 37) % 10) / 10); ctx.beginPath(); ctx.moveTo(x, 82); for (let y = 105; y < 300; y += 34) ctx.lineTo(x + ((y / 34 + f) % 2 ? 30 : -24), y); ctx.stroke(); ctx.shadowBlur = 0; }
    rounded(ctx, 50, 22, 540, 72, 18, "rgba(3,10,20,.78)"); text(ctx, title, W / 2, 55, 23, success ? "#f5da87" : "#ff8a94", "center", "bold"); text(ctx, `${p.name} · ${realm(p)[0]}`, W / 2, 80, 14, "#b8c7d3", "center");
    const phase = t < .34 ? "Tụ khí" : t < .72 ? (type === "cultivate" ? "Thông mạch" : "Nghênh thiên kiếp") : success ? "Đạo pháp viên mãn" : "Đạo tâm chấn động"; text(ctx, phase, W / 2, 382, 17, success ? sect.color : "#ff8a94", "center", "bold");
  });
}

async function renderProfile(p) {
  const W = 1000, H = 1180, canvas = createCanvas(W, H), ctx = canvas.getContext("2d"), sect = SECTS[p.sect], st = stats(p), current = realm(p), next = nextNeed(p), heroes = await loadImage(heroSheetPath(p));
  backdrop(ctx, W, H, sect.color); rounded(ctx, 48, 42, 904, 1090, 32, "rgba(5,12,22,.78)", "rgba(255,255,255,.13)");
  text(ctx, "TIÊN LỘ VẤN ĐẠO", 500, 102, 36, "#f5d98b", "center", "bold"); text(ctx, "HỒ SƠ TU SĨ", 500, 140, 17, "#8ea6bb", "center", "bold");
  const glow = ctx.createRadialGradient(175, 270, 20, 175, 270, 135); glow.addColorStop(0, `${sect.color}77`); glow.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = glow; ctx.fillRect(35, 145, 280, 245);
  drawSprite(ctx, heroes, SECT_INDEX[p.sect], 175, 378, 255, 255); text(ctx, p.name, 330, 230, 34, "#fff", "left", "bold"); text(ctx, `${sect.name} · ${p.gender === "nu" ? "Nữ" : "Nam"}`, 330, 274, 23, sect.color, "left", "bold"); text(ctx, `Tuyệt kỹ · ${sect.skill}`, 330, 312, 19, "#aebccc");
  rounded(ctx, 82, 385, 836, 150, 22, "rgba(255,255,255,.055)"); text(ctx, current[0], 110, 432, 28, "#f5d98b", "left", "bold"); text(ctx, p.realm >= REALMS.length - 1 ? "Đại đạo viên mãn" : `${fmt(p.cultivation)} / ${fmt(next)} tu vi`, 890, 430, 19, "#c6d2dc", "right");
  const prev = current[1], ratio = next === Infinity ? 1 : (p.cultivation - prev) / Math.max(1, next - prev); bar(ctx, 110, 462, 780, ratio, sect.color); text(ctx, `Linh thạch  ◈ ${fmt(p.stones)}     Thể lực  ⚡ ${p.energy}/100`, 110, 510, 19, "#b7c4cf");
  text(ctx, "CHIẾN LỰC", 82, 600, 18, "#7f96aa", "left", "bold"); text(ctx, fmt(st.power), 82, 652, 42, "#fff", "left", "bold");
  const cards = [["CÔNG", st.atk, "#ff7b69"], ["THỦ", st.def, "#6bbcff"], ["SINH MỆNH", st.hp, "#66d59a"]];
  cards.forEach(([label, val, color], i) => { const x = 82 + i * 278; rounded(ctx, x, 700, 248, 112, 18, "rgba(255,255,255,.055)"); text(ctx, label, x + 22, 738, 15, "#8097aa", "left", "bold"); text(ctx, fmt(val), x + 22, 782, 28, color, "left", "bold"); });
  text(ctx, "HÀNH TRANG & CHIẾN TÍCH", 82, 872, 18, "#7f96aa", "left", "bold"); rounded(ctx, 82, 897, 836, 160, 18, "rgba(255,255,255,.055)");
  text(ctx, `🗡️ ${p.equipment?.weapon?.name || "Chưa có vũ khí"}   🥋 ${p.equipment?.armor?.name || "Chưa có hộ giáp"}`, 112, 942, 18, "#d8e2ea");
  text(ctx, `🔮 ${p.equipment?.artifact?.name || "Chưa có pháp bảo"}   📖 ${TECHNIQUES[p.activeTechnique]?.name || "Dẫn Khí Thuật"}`, 112, 983, 18, "#d8e2ea");
  text(ctx, `Săn yêu: ${p.kills}  ·  Thắng: ${p.wins}  ·  Bại: ${p.losses}`, 112, 1028, 19, "#9cafbe"); text(ctx, "Ngẩng đầu ba thước có thần minh · Nghịch thiên cải mệnh", 500, 1100, 16, "#71879a", "center");
  return saveCanvas(canvas, "profile");
}

async function renderBattle(p, enemy, result) {
  const W = 1100, H = 760, canvas = createCanvas(W, H), ctx = canvas.getContext("2d"), sect = SECTS[p.sect]; backdrop(ctx, W, H, result.win ? sect.color : "#e64a5f");
  text(ctx, result.win ? "ĐẠI THẮNG" : "THẤT BẠI", 550, 90, 42, result.win ? "#f5d98b" : "#ff8b93", "center", "bold"); text(ctx, "THIÊN ĐỊA CHỨNG GIÁM", 550, 124, 15, "#91a5b7", "center", "bold");
  rounded(ctx, 55, 170, 440, 355, 28, "rgba(5,13,24,.76)"); rounded(ctx, 605, 170, 440, 355, 28, "rgba(5,13,24,.76)");
  text(ctx, sect.icon, 275, 305, 105, "#fff", "center"); text(ctx, enemy.icon, 825, 305, 105, "#fff", "center"); text(ctx, p.name, 275, 375, 27, "#fff", "center", "bold"); text(ctx, enemy.name, 825, 375, 27, "#fff", "center", "bold");
  text(ctx, `${realm(p)[0]} · ${fmt(result.myPower)} lực`, 275, 416, 18, sect.color, "center"); text(ctx, `${enemy.title} · ${fmt(result.enemyPower)} lực`, 825, 416, 18, "#ff8f87", "center");
  text(ctx, "VS", 550, 352, 44, "#f4d887", "center", "bold"); bar(ctx, 100, 466, 350, result.win ? .42 : .08, sect.color); bar(ctx, 650, 466, 350, result.win ? .06 : .45, "#e55c61");
  rounded(ctx, 115, 570, 870, 110, 22, "rgba(255,255,255,.06)"); text(ctx, result.log, 550, 616, 19, "#d9e1e8", "center"); text(ctx, result.win ? `Nhận ${fmt(result.cultivation)} tu vi · ${fmt(result.stones)} linh thạch` : "Đạo tâm dao động, hãy tu luyện thêm", 550, 652, 19, result.win ? "#72deb0" : "#ff9b9f", "center", "bold");
  return saveCanvas(canvas, "battle");
}

function combatBar(ctx, x, y, w, ratio, color, flip = false) {
  rounded(ctx, x, y, w, 10, 5, "rgba(0,0,0,.58)");
  const fill = Math.max(3, (w - 4) * clamp(ratio, 0, 1));
  rounded(ctx, flip ? x + w - fill - 2 : x + 2, y + 2, fill, 6, 3, color);
}
function glowOrb(ctx, x, y, radius, color, alpha = 1) {
  const g = ctx.createRadialGradient(x, y, 1, x, y, radius); g.addColorStop(0, `rgba(255,255,255,${alpha})`); g.addColorStop(.32, color); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}
function drawSectSkill(ctx, sectKey, t, fromX, toX, y) {
  const flight = clamp((t - .2) / .43, 0, 1), impact = clamp((t - .58) / .2, 0, 1), x = fromX + (toX - fromX) * (1 - (1 - flight) ** 3);
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  if (sectKey === "kiem") {
    ctx.strokeStyle = "#78caff"; ctx.lineCap = "round"; ctx.shadowColor = "#35a8ff"; ctx.shadowBlur = 13;
    for (let i = 0; i < 7; i++) { const off = (i - 3) * 17, lead = x - i * 9; ctx.lineWidth = i === 3 ? 7 : 3; ctx.beginPath(); ctx.moveTo(lead - 68, y + off + 15); ctx.lineTo(lead + 30, y + off - 15); ctx.stroke(); }
    if (impact > 0) { ctx.strokeStyle = "#e9f8ff"; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(toX, y, 35 + impact * 100, -.9, .9); ctx.stroke(); ctx.beginPath(); ctx.arc(toX, y, 25 + impact * 75, Math.PI - .7, Math.PI + .7); ctx.stroke(); }
  } else if (sectKey === "dan") {
    for (let i = 0; i < 5; i++) glowOrb(ctx, x - i * 20, y + Math.sin(i + t * 12) * 18, 34 - i * 4, i % 2 ? "rgba(255,65,15,.8)" : "rgba(255,180,35,.8)", .9);
    if (impact > 0) for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; glowOrb(ctx, toX + Math.cos(a) * impact * 100, y + Math.sin(a) * impact * 72, 18 + impact * 15, "rgba(255,70,12,.75)", .8); }
  } else if (sectKey === "ma") {
    ctx.strokeStyle = "#d54cff"; ctx.shadowColor = "#ff174d"; ctx.shadowBlur = 18; ctx.lineWidth = 13; ctx.beginPath(); ctx.moveTo(x - 100, y - 75); ctx.quadraticCurveTo(x, y + 10, x + 65, y + 85); ctx.stroke(); ctx.strokeStyle = "#ff3f68"; ctx.lineWidth = 5; ctx.stroke();
    if (impact > 0) { ctx.fillStyle = `rgba(115,20,145,${.6 * (1 - impact)})`; ctx.beginPath(); ctx.arc(toX, y, 45 + impact * 110, 0, Math.PI * 2); ctx.fill(); }
  } else if (sectKey === "phat") {
    ctx.strokeStyle = "#ffe27a"; ctx.shadowColor = "#ffc928"; ctx.shadowBlur = 15; ctx.lineWidth = 5;
    for (let r = 26; r <= 62; r += 18) { ctx.beginPath(); ctx.arc(x, y, r, t * 5, t * 5 + Math.PI * 1.55); ctx.stroke(); }
    ctx.fillStyle = "rgba(255,225,105,.4)"; ctx.beginPath(); ctx.roundRect(x - 25, y - 60, 50, 120, 22); ctx.fill();
    if (impact > 0) glowOrb(ctx, toX, y, 70 + impact * 100, "rgba(255,205,60,.65)", .9);
  } else {
    ctx.strokeStyle = "#58f2c0"; ctx.shadowColor = "#20e8bb"; ctx.shadowBlur = 14; ctx.lineWidth = 5;
    for (let i = 0; i < 4; i++) { const a = t * 9 + i * Math.PI / 2, ox = Math.cos(a) * 28, oy = Math.sin(a) * 25; ctx.beginPath(); ctx.moveTo(fromX + ox, y + oy); ctx.quadraticCurveTo(x - 35, y + oy * 1.8, x + ox, y + oy); ctx.stroke(); glowOrb(ctx, x + ox, y + oy, 18, "rgba(55,238,190,.7)", .8); }
    if (impact > 0) { ctx.strokeStyle = "#d6fff1"; ctx.lineWidth = 6; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(toX, y, 28 + i * 26 + impact * 55, i, i + 2.5); ctx.stroke(); } }
  }
  ctx.restore();
}

export async function renderBattleGif(p, enemy, result) {
  const W = 640, H = 400, sect = SECTS[p.sect];
  const [heroes, monsters] = await Promise.all([loadImage(heroSheetPath(p)), loadImage(MONSTER_SHEET)]);
  return encodeGif("battle", W, H, 14, (ctx, f, total) => {
    const t = f / (total - 1), advance = clamp(t / .28, 0, 1), reveal = t > .76, hit = clamp((t - .58) / .2, 0, 1); backdrop(ctx, W, H, result.win ? sect.color : "#d94155");
    const shake = t > .57 && t < .76 ? (f % 2 ? 5 : -5) : 0, px = 92 + advance * 48 + shake, ex = 548 - advance * 48 - shake;
    ctx.globalAlpha = .3; ctx.fillStyle = sect.color; ctx.beginPath(); ctx.ellipse(px - 30, 280, 90, 34, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#ed4d5e"; ctx.beginPath(); ctx.ellipse(ex + 30, 280, 90, 34, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    drawSprite(ctx, heroes, SECT_INDEX[p.sect], px, 338, 175, 250); drawSprite(ctx, monsters, clamp(enemy.level - 1, 0, 4), ex, 338, 190, 250, true);
    if (t >= .16 && t <= .82) drawSectSkill(ctx, p.sect, t, px + 45, ex - 35, 238);
    if (hit > 0 && hit < 1) { ctx.fillStyle = `rgba(255,255,255,${.3 * Math.sin(hit * Math.PI)})`; ctx.fillRect(0, 0, W, H); }
    rounded(ctx, 42, 20, 556, 72, 18, "rgba(3,10,20,.8)"); text(ctx, reveal ? (result.win ? "TRẢM YÊU THÀNH CÔNG" : "ĐẠO HẠNH CHƯA ĐỦ") : "TIÊN MA GIAO PHONG", W / 2, 52, 22, reveal && !result.win ? "#ff8d98" : "#f5d98b", "center", "bold"); text(ctx, `${fmt(result.myPower)}  ⚔  ${fmt(result.enemyPower)}`, W / 2, 77, 14, "#b9c7d2", "center");
    combatBar(ctx, 54, 104, 220, result.win ? 1 - hit * .18 : 1 - hit * .88, "#5ce2a5"); combatBar(ctx, 366, 104, 220, result.win ? 1 - hit * .94 : 1 - hit * .32, "#ff5d69", true);
    if (t > .6 && t < .88) text(ctx, result.win ? `-${fmt(Math.round(result.enemyPower * .86))}` : `-${fmt(Math.round(result.myPower * .78))}`, result.win ? ex : px, 160 - hit * 24, 25, result.win ? "#ffd76a" : "#ff7180", "center", "bold");
    text(ctx, p.name, 88, 355, 14, sect.color, "center", "bold"); text(ctx, enemy.name, 552, 355, 14, "#ff8992", "center", "bold");
    if (reveal) { rounded(ctx, 70, 365, 500, 28, 12, "rgba(4,12,22,.9)"); text(ctx, result.win ? `${result.skillName || sect.skill} · +${fmt(result.cultivation)} tu vi · +${fmt(result.stones)} linh thạch` : "Trọng thương rút lui · Hãy củng cố đạo hạnh", W / 2, 385, 12, result.win ? "#71e0b0" : "#ff929b", "center", "bold"); }
  });
}

let gifQueue = Promise.resolve();
let gifQueueDepth = 0;
function renderGifInWorker(payload) {
  if (gifQueueDepth >= 3) return Promise.reject(new Error("Hàng chờ GIF đang đầy"));
  gifQueueDepth++;
  const task = gifQueue.then(() => new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./render-worker.js", import.meta.url), {
      workerData: payload,
      execArgv: [],
    });
    worker.once("message", data => data?.success ? resolve(data.file) : reject(new Error(data?.error || "Render GIF thất bại")));
    worker.once("error", reject);
    worker.once("exit", code => { if (code !== 0) reject(new Error(`Worker GIF dừng với mã ${code}`)); });
  }));
  gifQueue = task.catch(() => {}).finally(() => { gifQueueDepth--; });
  return task;
}

async function animatedOrProfile(p, payload) {
  try { return await renderGifInWorker(payload); }
  catch (error) { console.error("[tu-tien] Không thể render GIF, dùng ảnh tĩnh:", error.message); return renderProfile(p); }
}

async function sendImage(api, message, file, caption = "") { try { await api.sendMessage({ msg: caption, attachments: [file], ttl: 600000 }, message.threadId, message.type); } finally { await fsp.unlink(file).catch(() => {}); } }
function help(prefix) { return `☯️ TIÊN LỘ VẤN ĐẠO\n\n🌱 ${prefix}tt nhap <môn> <nam|nu> <tên>\nVí dụ: ${prefix}tt nhap kiem nu Thanh Nguyệt\n🐉 san [1-5] · 👹 boss\n🎒 tui | dung <vật phẩm>\n🏪 shop | mua <vật phẩm> [SL]\n🗡️ trangbi <mã> · 📖 congphap\n⚔️ chienky · chieu <mã>\n📜 nhiemvu · 💤 treo\n\nMôn phái: kiếm, đan, ma, phật, linh.`; }
function parseBody(message) { const raw = typeof message.data?.content === "string" ? message.data.content : message.data?.content?.title || ""; return raw.trim().split(/\s+/).slice(1); }
function commandPrefix(message) { const raw = typeof message.data?.content === "string" ? message.data.content.trim() : message.data?.content?.title?.trim() || ""; const token = raw.split(/\s+/, 1)[0]; return token.replace(/(?:tutien|xianxia|tt)$/i, "") || "!"; }
function sessionKey(api, message) { return `${api.getBotId()}:${message.threadId}:${message.data.uidFrom}`; }
function openSession(api, message) { sessions.set(sessionKey(api, message), Date.now() + SESSION_TTL); }
const SESSION_COMMANDS = new Set(["xem","info","hoso","tuluyen","dotpha","san","boss","treo","offline","thutuvi","daily","tui","shop","mua","dung","trangbi","nhiemvu","nv","quest","rank","monphai","nhap","congphap","hoc","chon","chienky","chieu","help","huongdan"]);

export async function handleTuTienShortcut(api, message) {
  const key = sessionKey(api, message), expires = sessions.get(key), now = Date.now();
  if (!expires || expires <= now) { sessions.delete(key); return false; }
  const raw = typeof message.data?.content === "string" ? message.data.content.trim() : "";
  if (!raw || raw.length > 100) return false;
  const first = raw.split(/\s+/, 1)[0].toLowerCase();
  if (["thoat", "exit", "dong"].includes(first)) { sessions.delete(key); await api.sendMessage({ msg: "🚪 Đã đóng phiên tu tiên. Mở lại bằng !tt" }, message.threadId, message.type); return true; }
  if (!SESSION_COMMANDS.has(first)) return false;
  sessions.set(key, now + SESSION_TTL);
  const routed = { ...message, data: { ...message.data, content: `!tt ${raw}` } };
  await handleTuTienCommand(api, routed);
  return true;
}

export async function handleTuTienCommand(api, message) {
  openSession(api, message);
  const botId = api.getBotId(), prefix = commandPrefix(message), args = parseBody(message), data = readData(botId), id = playerKey(message.data.uidFrom); let cmd = (args[0] || "").toLowerCase(), p = data.players[id];
  if (["help", "huongdan"].includes(cmd)) return api.sendMessage({ msg: help(prefix) }, message.threadId, message.type);
  if (cmd === "monphai") return api.sendMessage({ msg: `🏯 NGŨ ĐẠI MÔN PHÁI\n\n${Object.entries(SECTS).map(([k,s]) => `${s.icon} ${k} — ${s.name}\n   ${s.skill} · Công x${s.atk} · Thủ x${s.def} · HP x${s.hp}`).join("\n\n")}\n\nGia nhập: nhap <môn> <nam|nu> <tên>\nVí dụ: nhap kiem nu Thanh Nguyệt` }, message.threadId, message.type);
  if (cmd === "nhap") { const sect = (args[1] || "").toLowerCase(), gender = (args[2] || "").toLowerCase(), characterName = args.slice(3).join(" ").trim(); if (p) return api.sendMessage({ msg: "Bạn đã bước lên tiên lộ, không thể tùy ý phản bội sư môn." }, message.threadId, message.type); if (!SECTS[sect] || !["nam","nu"].includes(gender) || !characterName) return api.sendMessage({ msg: `Cần chọn đủ môn phái, giới tính và tên nhân vật.\nVí dụ: nhap kiem nam Vô Trần\nMôn: kiem, dan, ma, phat, linh · Giới tính: nam, nu` }, message.threadId, message.type); p = newPlayer(sect, gender, characterName.slice(0, 24), id); data.players[id] = p; writeData(botId, data); return sendImage(api, message, await renderProfile(p), `🎊 ${SECTS[sect].name} đã thu nhận ${gender === "nu" ? "nữ" : "nam"} đệ tử ${p.name}!`); }
  if (!p) return api.sendMessage({ msg: `Bạn chưa bước lên tiên lộ.\nXem môn phái: ${prefix}tt monphai` }, message.threadId, message.type);
  p.name ||= message.data.dName || "Vô Danh"; p.gender ||= "nam"; p.energy = clamp(p.energy ?? 100, 0, 100); p.inventory ||= {}; p.actions ||= {}; p.equipment ||= {}; p.techniques ||= ["dantho"]; p.activeTechnique ||= "dantho"; refreshPlayer(p);
  if (!cmd || ["xem", "info", "hoso"].includes(cmd)) { writeData(botId, data); return sendImage(api, message, await renderProfile(p)); }
  if (cmd === "tuluyen") { const left = cooldown(p, "cultivate"); if (left) return api.sendMessage({ msg: `🕰️ Linh khí chưa ổn định, chờ ${waitText(left)}.` }, message.threadId, message.type); const rate = stats(p).cultivationRate, gain = Math.round((90 + p.realm * 35 + Math.floor(Math.random() * 80)) * rate), stones = 18 + Math.floor(Math.random() * 28); addCultivation(p, gain); p.stones += stones; p.energy = Math.min(100, p.energy + 8); p.actions.cultivate = Date.now(); touchQuest(p, "cultivate"); writeData(botId, data); return sendImage(api, message, await animatedOrProfile(p, { kind: "action", p, type: "cultivate", success: true }), `🧘 ${TECHNIQUES[p.activeTechnique].name}: +${gain} tu vi (x${rate.toFixed(2)}), +${stones} linh thạch.\n📜 Nhiệm vụ tu luyện: ${Math.min(3, p.quests.cultivate)}/3`); }
  if (cmd === "dotpha") { if (p.realm >= REALMS.length - 1) return api.sendMessage({ msg: "Bạn đã đứng trên đỉnh tiên đạo." }, message.threadId, message.type); const need = nextNeed(p); if (p.cultivation < need) return api.sendMessage({ msg: `Chưa đủ tu vi. Cần ${fmt(need)}, hiện có ${fmt(p.cultivation)}.` }, message.threadId, message.type); const charm = (p.inventory.phukiep || 0) > 0, chance = clamp(.82 - p.realm * .045 + (charm ? .2 : 0), .38, .95), ok = Math.random() < chance; if (charm) p.inventory.phukiep--; if (ok) { p.realm++; p.energy = 100; p.wins++; } else { const lost = Math.floor((need - REALMS[p.realm][1]) * .12); addCultivation(p, -lost); p.energy = Math.max(10, p.energy - 35); p.losses++; } writeData(botId, data); return sendImage(api, message, await animatedOrProfile(p, { kind: "action", p, type: "breakthrough", success: ok }), ok ? `⚡ Thiên kiếp tan! Đột phá thành công ${realm(p)[0]}.` : `💥 Đột phá thất bại, tổn thất căn cơ. Hãy củng cố đạo tâm.`); }
  if (cmd === "chienky") { const all=COMBAT_SKILLS[p.sect], available=unlockedSkills(p); return api.sendMessage({msg:`⚔️ CHIẾN KỸ · ${SECTS[p.sect].name}\n\n${all.map(s=>`${p.activeSkill===s.key?"🔆":s.req<=p.realm?"✅":"🔒"} ${s.key} · ${s.name}\n   Sát thương x${s.mult.toFixed(2)} · ${REALMS[s.req][0]}`).join("\n\n")}\n\nĐã mở ${available.length}/${all.length}. Chọn: chieu <mã>`},message.threadId,message.type); }
  if (cmd === "chieu") { const key=(args[1]||"").toLowerCase(), skill=(COMBAT_SKILLS[p.sect]||[]).find(s=>s.key===key);if(!skill)return api.sendMessage({msg:"Môn phái của bạn không có chiêu này. Gõ chienky để xem."},message.threadId,message.type);if(skill.req>p.realm)return api.sendMessage({msg:`🔒 ${skill.name} cần cảnh giới ${REALMS[skill.req][0]}.`},message.threadId,message.type);p.activeSkill=key;writeData(botId,data);return api.sendMessage({msg:`⚔️ Đã chọn ${skill.name} · hệ số sát thương x${skill.mult.toFixed(2)}.`},message.threadId,message.type); }
  if (cmd === "san" || cmd === "boss") { const type = cmd, left = cooldown(p, type === "san" ? "hunt" : "boss"); if (left) return api.sendMessage({ msg: `⏳ Cần dưỡng thương thêm ${waitText(left)}.` }, message.threadId, message.type); const cost = type === "boss" ? 35 : 15; if (p.energy < cost) return api.sendMessage({ msg: `Thể lực không đủ (cần ${cost}). Dùng Hoàn Hồn Đan hoặc chờ tu luyện.` }, message.threadId, message.type); const level = type === "boss" ? clamp(p.realm + 2, 1, 5) : clamp(Number(args[1]) || Math.min(5, p.realm + 1), 1, 5), m = MONSTERS[level - 1], skill = selectedCombatSkill(p), myPower = Math.round(stats(p).power * skill.mult), enemyPower = Math.round((330 + level * 390 + p.realm * 165) * m[2] * (type === "boss" ? 1.55 : 1)), win = myPower * (.82 + Math.random() * .42) >= enemyPower * (.85 + Math.random() * .3), cultivation = win ? Math.round((85 + level * 72) * (type === "boss" ? 2.7 : 1)) : 0, stones = win ? Math.round((35 + level * 34) * (type === "boss" ? 3 : 1)) : 0; p.energy -= cost; p.actions[type === "boss" ? "boss" : "hunt"] = Date.now(); touchQuest(p, type === "boss" ? "boss" : "hunt"); if (win) { addCultivation(p, cultivation); p.stones += stones; p.kills++; p.wins++; if (Math.random() < .14) p.inventory.tulinhdan = (p.inventory.tulinhdan || 0) + 1; } else p.losses++; writeData(botId, data); const enemy = { name: type === "boss" ? `Ma Chủ · ${m[0]}` : m[0], icon: m[1], level, title: type === "boss" ? "Thế giới Boss" : `Yêu thú cấp ${level}` }; const result = { win, myPower, enemyPower, cultivation, stones, skillName: skill.name, log: win ? `${skill.name} phá tan yêu khí!` : `${enemy.name} áp chế, bạn buộc phải thoái lui.` }; return sendImage(api, message, await animatedOrProfile(p, { kind: "battle", p, enemy, result }), `⚔️ ${skill.name} x${skill.mult.toFixed(2)}\n📜 Nhiệm vụ: săn ${Math.min(2,p.quests.hunt)}/2 · boss ${Math.min(1,p.quests.boss)}/1`); }
  if (["treo", "offline", "thutuvi"].includes(cmd)) {
    const action=(args[1]||"").toLowerCase(), modes=new Set(["tuluyen","dotpha","san","full"]), now=Date.now();
    if (["bat","chedo"].includes(action)) { const mode=(args[2]||"full").toLowerCase(), level=clamp(Number(args[3])||1,1,5); if(!modes.has(mode))return api.sendMessage({msg:"Chế độ: tuluyen, dotpha, san hoặc full."},message.threadId,message.type);p.autoTrain={enabled:true,mode,monsterLevel:level};p.lastIdleAt=now;writeData(botId,data);return api.sendMessage({msg:`✅ Đã bật treo ${mode}${["san","full"].includes(mode)?` · yêu thú cấp ${level}`:""}.\nTối đa 8 giờ, quay lại gõ “treo” để nhận.\nĐổi: treo chedo <tuluyen|dotpha|san|full> [cấp]`},message.threadId,message.type); }
    if (action==="tat") { if(!p.autoTrain?.enabled)return api.sendMessage({msg:"Bạn chưa bật treo."},message.threadId,message.type);const result=simulateIdle(p,now-(p.lastIdleAt||now));p.autoTrain.enabled=false;p.lastIdleAt=now;writeData(botId,data);return api.sendMessage({msg:`${result.minutes>=5?idleSummary(result)+"\n\n":""}🛑 Đã tắt chế độ treo.`},message.threadId,message.type); }
    if (!p.autoTrain?.enabled) return api.sendMessage({msg:"💤 AUTO TREO\n\ntreo bat tuluyen\ntreo bat dotpha\ntreo bat san 2\ntreo bat full 2\n\nFull = tự tu luyện + đột phá + săn quái. Tối đa 8 giờ."},message.threadId,message.type);
    const result=simulateIdle(p,now-(p.lastIdleAt||now));if(result.minutes<5)return api.sendMessage({msg:`💤 Đang treo ${p.autoTrain.mode}. Còn ${5-result.minutes} phút mới có thể thu hoạch.`},message.threadId,message.type);p.lastIdleAt=now;writeData(botId,data);return sendImage(api,message,await renderProfile(p),`${idleSummary(result)}\n\n✅ Chế độ treo vẫn tiếp tục.`);
  }
  if (["nhiemvu", "nv", "quest"].includes(cmd)) { const defs = { cultivate: [3, "Tu luyện 3 lần"], hunt: [2, "Săn yêu 2 lần"], boss: [1, "Khiêu chiến Boss"] }; let reward = 0; for (const [key,[target]] of Object.entries(defs)) if ((p.quests[key] || 0) >= target && !p.questClaims[key]) { p.questClaims[key] = true; reward++; } if (reward) { addCultivation(p, reward * 250); p.stones += reward * 150; writeData(botId, data); } return api.sendMessage({ msg: `📜 NHIỆM VỤ NGÀY\n\n${Object.entries(defs).map(([k,[target,name]]) => `${p.questClaims[k] ? "✅" : (p.quests[k]||0)>=target ? "🎁" : "▫️"} ${name}: ${Math.min(target,p.quests[k]||0)}/${target}`).join("\n")}\n\n${reward ? `Đã tự nhận: +${reward*250} tu vi, +${reward*150} linh thạch.` : "Hoàn thành sẽ tự nhận thưởng khi mở bảng."}` }, message.threadId, message.type); }
  if (cmd === "daily") { const today = todayVN(); if (p.dailyDate === today) return api.sendMessage({ msg: "Hôm nay bạn đã nhận bổng lộc tông môn." }, message.threadId, message.type); p.dailyDate = today; const gift = 180 + Math.floor(Math.random() * 121); p.stones += gift; p.energy = 100; p.inventory.tulinhdan = (p.inventory.tulinhdan || 0) + 1; writeData(botId, data); return api.sendMessage({ msg: `🎁 Bổng lộc: +${gift} linh thạch, +1 Tụ Linh Đan, hồi đầy thể lực.` }, message.threadId, message.type); }
  if (cmd === "shop") { const aliases = { vk: "vukhi", vukhi: "vukhi", giap: "giap", pb: "phapbao", phapbao: "phapbao", dan: "dan" }, category = aliases[(args[1] || "").toLowerCase()]; if (!category) return api.sendMessage({ msg: `🏪 BÁCH BẢO CÁC · ${fmt(p.stones)} linh thạch\n\nGõ: shop vk · shop giap · shop pb · shop dan\nMua: mua <mã vật phẩm> [SL]\nTrang bị: trangbi <mã>` }, message.threadId, message.type); const list = Object.entries(ITEMS).filter(([,v]) => v.category === category); return api.sendMessage({ msg: `🏪 ${category.toUpperCase()} · ${fmt(p.stones)} ◈\n\n${list.map(([k,v]) => `${v.icon} ${k} · [${v.rarity}] ${fmt(v.price)} ◈${v.req ? ` · ${REALMS[v.req][0]}` : ""}\n${v.name}: ${v.desc}`).join("\n\n")}` }, message.threadId, message.type); }
  if (cmd === "mua") { const key = (args[1] || "").toLowerCase(), item = ITEMS[key], qty = clamp(Math.floor(Number(args[2]) || 1), 1, 20); if (!item) return api.sendMessage({ msg: "Vật phẩm không tồn tại trong Bách Bảo Các." }, message.threadId, message.type); if ((p.realm || 0) < (item.req || 0)) return api.sendMessage({ msg: `🔒 ${item.name} yêu cầu cảnh giới ${REALMS[item.req][0]}.` }, message.threadId, message.type); const total = item.price * qty; if (p.stones < total) return api.sendMessage({ msg: `Không đủ linh thạch. Cần ${fmt(total)}, bạn có ${fmt(p.stones)}.` }, message.threadId, message.type); p.stones -= total; p.inventory[key] = (p.inventory[key] || 0) + qty; writeData(botId, data); return api.sendMessage({ msg: `✅ Đã mua ${qty} [${item.rarity}] ${item.name}, tiêu ${fmt(total)} linh thạch.${item.equip ? `\nGõ: trangbi ${key}` : ""}` }, message.threadId, message.type); }
  if (cmd === "tui") return api.sendMessage({ msg: `🎒 TÚI CÀN KHÔN\n\n${Object.entries(p.inventory).filter(([,n]) => n > 0).map(([k,n]) => `${ITEMS[k]?.icon || "📦"} ${k} ×${n} — ${ITEMS[k]?.name || k}`).join("\n") || "Trống không"}\n\n🗡️ Pháp khí: ${p.equipment.weapon?.name || "Chưa có"}\n🥋 Hộ giáp: ${p.equipment.armor?.name || "Chưa có"}` }, message.threadId, message.type);
  if (cmd === "dung") { const key = (args[1] || "").toLowerCase(), item = ITEMS[key]; if (!item?.use) return api.sendMessage({ msg: "Vật phẩm này không thể dùng trực tiếp." }, message.threadId, message.type); if (!p.inventory[key]) return api.sendMessage({ msg: "Trong túi không có vật phẩm này." }, message.threadId, message.type); p.inventory[key]--; item.use(p); writeData(botId, data); return sendImage(api, message, await renderProfile(p), `✨ Đã dùng ${item.name}: ${item.desc}.`); }
  if (cmd === "trangbi") { const key = (args[1] || "").toLowerCase(), item = ITEMS[key]; if (!item?.equip || !item.slot) return api.sendMessage({ msg: "Đây không phải trang bị." }, message.threadId, message.type); if (!p.inventory[key]) return api.sendMessage({ msg: "Bạn chưa sở hữu trang bị này." }, message.threadId, message.type); if ((p.realm || 0) < (item.req || 0)) return api.sendMessage({ msg: `🔒 Cần ${REALMS[item.req][0]} để sử dụng.` }, message.threadId, message.type); const oldKey = p.equipment[item.slot]?.key; if (oldKey) p.inventory[oldKey] = (p.inventory[oldKey] || 0) + 1; p.inventory[key]--; p.equipment[item.slot] = { key, name: `[${item.rarity}] ${item.name}`, ...item.equip }; writeData(botId, data); return sendImage(api, message, await renderProfile(p), `✨ Đã trang bị [${item.rarity}] ${item.name}. Chiến lực: ${fmt(stats(p).power)}`); }
  if (cmd === "congphap") return api.sendMessage({ msg: `📖 CÔNG PHÁP · Đang dùng: ${TECHNIQUES[p.activeTechnique].name}\n\n${Object.entries(TECHNIQUES).map(([k,v]) => `${p.activeTechnique===k?"🔆":p.techniques.includes(k)?"✅":"▫️"} ${k} · ${v.name}${v.sect ? ` · ${SECTS[v.sect].name}` : ""}\n   ${v.desc}${v.price ? ` · ${fmt(v.price)} ◈ · ${REALMS[v.req][0]}` : ""}`).join("\n\n")}\n\nHọc: hoc <mã> · Chọn: chon <mã>` }, message.threadId, message.type);
  if (cmd === "hoc") { const key=(args[1]||"").toLowerCase(), tech=TECHNIQUES[key]; if(!tech)return api.sendMessage({msg:"Không có công pháp này."},message.threadId,message.type);if(p.techniques.includes(key))return api.sendMessage({msg:"Bạn đã học công pháp này."},message.threadId,message.type);if(tech.sect&&tech.sect!==p.sect)return api.sendMessage({msg:`Công pháp này chỉ truyền cho ${SECTS[tech.sect].name}.`},message.threadId,message.type);if(p.realm<tech.req)return api.sendMessage({msg:`Cần cảnh giới ${REALMS[tech.req][0]}.`},message.threadId,message.type);if(p.stones<tech.price)return api.sendMessage({msg:`Cần ${fmt(tech.price)} linh thạch.`},message.threadId,message.type);p.stones-=tech.price;p.techniques.push(key);writeData(botId,data);return api.sendMessage({msg:`📖 Lĩnh ngộ thành công ${tech.name}!\nGõ: chon ${key}`},message.threadId,message.type); }
  if (cmd === "chon") { const key=(args[1]||"").toLowerCase();if(!p.techniques.includes(key)||!TECHNIQUES[key])return api.sendMessage({msg:"Bạn chưa học công pháp này."},message.threadId,message.type);p.activeTechnique=key;writeData(botId,data);return sendImage(api,message,await renderProfile(p),`🔆 Đã vận hành ${TECHNIQUES[key].name}. Chiến lực: ${fmt(stats(p).power)}`); }
  if (cmd === "rank") { const list = Object.values(data.players).sort((a,b) => stats(b).power - stats(a).power).slice(0, 10); return api.sendMessage({ msg: `🏆 TIÊN BẢNG\n\n${list.map((x,i) => `${i + 1}. ${x.name} · ${realm(x)[0]}\n   ${SECTS[x.sect]?.icon || "☯️"} ${fmt(stats(x).power)} chiến lực`).join("\n") || "Chưa có tu sĩ."}` }, message.threadId, message.type); }
  return api.sendMessage({ msg: help(prefix) }, message.threadId, message.type);
}
