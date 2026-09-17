/**
 * ĐẢO RỒNG — BERK: Dữ liệu game nuôi rồng
 * Catalog loài rồng, độ hiếm, vai trò, ải, vòng quay, nhiệm vụ & công thức cân bằng.
 * Author: KairoDev
 */

// ==================== ĐỘ HIẾM ====================
export const RARITIES = {
  thuong: { key: "thuong", name: "Thường", stars: 1, statMult: 1.0, color: "#9aa7b5" },
  hiem: { key: "hiem", name: "Hiếm", stars: 2, statMult: 1.18, color: "#3fa9f5" },
  caocap: { key: "caocap", name: "Cao Cấp", stars: 3, statMult: 1.4, color: "#a06bff" },
  suthi: { key: "suthi", name: "Sử Thi", stars: 4, statMult: 1.7, color: "#ff8c1a" },
  huyenthoai: { key: "huyenthoai", name: "Huyền Thoại", stars: 5, statMult: 2.1, color: "#ffd700" },
};

// ==================== VAI TRÒ (ảnh hưởng chiến đấu) ====================
export const ROLES = {
  sacben: { key: "sacben", name: "Sắc Bén", icon: "🌪️", effectName: "Chí Mạng", effectIcon: "⚡", desc: "20% gây sát thương x2" },
  tankich: { key: "tankich", name: "Tấn Kích", icon: "⚔️", effectName: "Cuồng Nộ", effectIcon: "🔥", desc: "+15% sát thương" },
  phongthu: { key: "phongthu", name: "Phòng Thủ", icon: "🛡️", effectName: "Thiết Giáp", effectIcon: "🪨", desc: "+20% giáp" },
  xaoquyet: { key: "xaoquyet", name: "Xảo Quyệt", icon: "🦊", effectName: "Suy Yếu", effectIcon: "🦊", desc: "Địch -15% sát thương" },
  tocdo: { key: "tocdo", name: "Tốc Độ", icon: "⚡", effectName: "Liên Kích", effectIcon: "💨", desc: "25% đánh 2 lần" },
  hove: { key: "hove", name: "Hộ Vệ", icon: "💚", effectName: "Hồi Phục", effectIcon: "✨", desc: "Hồi 8% máu mỗi lượt" },
};

// ==================== LOÀI RỒNG ====================
// baseStats = chỉ số ở Lv1 (trước hệ số độ hiếm), growth = tăng mỗi cấp
// art = dáng vẽ riêng của từng loài:
//   type: standard | bulky | serpent | sleek | twinhead
//   horns: crown | curved | tusks | earflaps | none · wings: 2|4 · tail: fin | club | spikes | plain
export const SPECIES = {
  deadly: {
    key: "deadly",
    name: "Deadly Nadder",
    nickname: "Stormfly",
    role: "sacben",
    rarity: "thuong",
    colors: { body: "#2fb9b0", belly: "#8fe3d9", wing: "#1d8a84", accent: "#f5c542" },
    baseStats: { hp: 110, atk: 40, def: 24 },
    growth: { hp: 12, atk: 5, def: 3 },
    art: { type: "standard", horns: "crown", wings: 2, wingSize: 1, tail: "spikes", backSpikes: true, neck: 1, snout: 1, pattern: "none", scale: 1 },
  },
  gronckle: {
    key: "gronckle",
    name: "Gronckle",
    nickname: "Meatlug",
    role: "phongthu",
    rarity: "thuong",
    colors: { body: "#a4794f", belly: "#d9b98a", wing: "#7c5a38", accent: "#c9c9c9" },
    baseStats: { hp: 140, atk: 30, def: 34 },
    growth: { hp: 15, atk: 4, def: 4 },
    art: { type: "bulky", horns: "none", wings: 2, wingSize: 0.6, tail: "club", backSpikes: false, neck: 1, snout: 1, pattern: "spots", scale: 1 },
  },
  terror: {
    key: "terror",
    name: "Terrible Terror",
    nickname: "Tiểu Yêu",
    role: "tocdo",
    rarity: "thuong",
    colors: { body: "#7cc242", belly: "#d8f0a0", wing: "#55902c", accent: "#f2d13c" },
    baseStats: { hp: 100, atk: 38, def: 20 },
    growth: { hp: 10, atk: 5, def: 2 },
    art: { type: "standard", horns: "curved", wings: 2, wingSize: 0.8, tail: "plain", backSpikes: true, neck: 0.8, snout: 0.9, pattern: "none", scale: 0.78 },
  },
  zippleback: {
    key: "zippleback",
    name: "Hideous Zippleback",
    nickname: "Barf & Belch",
    role: "xaoquyet",
    rarity: "hiem",
    colors: { body: "#5aa844", belly: "#b6e39a", wing: "#3e7a2e", accent: "#e0d24a" },
    baseStats: { hp: 120, atk: 38, def: 28 },
    growth: { hp: 13, atk: 5, def: 3 },
    art: { type: "twinhead", horns: "curved", wings: 2, wingSize: 0.9, tail: "plain", backSpikes: true, neck: 1, snout: 1, pattern: "none", scale: 1 },
  },
  nightmare: {
    key: "nightmare",
    name: "Monstrous Nightmare",
    nickname: "Hookfang",
    role: "tankich",
    rarity: "hiem",
    colors: { body: "#d1422f", belly: "#f0a06c", wing: "#93251a", accent: "#ffb347" },
    baseStats: { hp: 115, atk: 46, def: 22 },
    growth: { hp: 12, atk: 6, def: 3 },
    art: { type: "standard", horns: "curved", wings: 2, wingSize: 1.25, tail: "plain", backSpikes: false, neck: 1.15, snout: 1.15, pattern: "stripes", scale: 1.02 },
  },
  thunderdrum: {
    key: "thunderdrum",
    name: "Thunderdrum",
    nickname: "Cuồng Lôi",
    role: "tankich",
    rarity: "hiem",
    colors: { body: "#6b76d6", belly: "#c3c9f5", wing: "#4a54ad", accent: "#9fe8ff" },
    baseStats: { hp: 125, atk: 44, def: 25 },
    growth: { hp: 13, atk: 6, def: 3 },
    art: { type: "bulky", horns: "curved", wings: 2, wingSize: 1.1, tail: "fin", backSpikes: false, neck: 1, snout: 1.5, pattern: "spots", scale: 1 },
  },
  scauldron: {
    key: "scauldron",
    name: "Scauldron",
    nickname: "Rồng Nước Sôi",
    role: "hove",
    rarity: "hiem",
    colors: { body: "#9fb845", belly: "#eff5c0", wing: "#779030", accent: "#46d0c0" },
    baseStats: { hp: 130, atk: 36, def: 27 },
    growth: { hp: 14, atk: 5, def: 3 },
    art: { type: "standard", horns: "none", wings: 2, wingSize: 0.9, tail: "fin", backSpikes: false, neck: 1.5, snout: 1.1, pattern: "none", scale: 1 },
  },
  whispering: {
    key: "whispering",
    name: "Whispering Death",
    nickname: "Tử Thần Thì Thầm",
    role: "xaoquyet",
    rarity: "caocap",
    colors: { body: "#6b7280", belly: "#b8bfc9", wing: "#454b54", accent: "#d64545" },
    baseStats: { hp: 125, atk: 44, def: 30 },
    growth: { hp: 13, atk: 6, def: 4 },
    art: { type: "serpent", horns: "crown", wings: 2, wingSize: 1, tail: "spikes", backSpikes: true, neck: 1, snout: 1, pattern: "none", scale: 1 },
  },
  stormcutter: {
    key: "stormcutter",
    name: "Stormcutter",
    nickname: "Cloudjumper",
    role: "tocdo",
    rarity: "caocap",
    colors: { body: "#d98a3d", belly: "#f2cf9b", wing: "#9c5b22", accent: "#5b3b8c" },
    baseStats: { hp: 122, atk: 45, def: 27 },
    growth: { hp: 13, atk: 6, def: 3 },
    art: { type: "standard", horns: "curved", wings: 4, wingSize: 1.1, tail: "fin", backSpikes: true, neck: 1.05, snout: 1, pattern: "none", scale: 1.02 },
  },
  timberjack: {
    key: "timberjack",
    name: "Timberjack",
    nickname: "Kiếm Gỗ",
    role: "sacben",
    rarity: "caocap",
    colors: { body: "#a8683a", belly: "#e8c9a0", wing: "#7c4a26", accent: "#d8a048" },
    baseStats: { hp: 120, atk: 47, def: 26 },
    growth: { hp: 13, atk: 6, def: 3 },
    art: { type: "standard", horns: "none", wings: 2, wingSize: 1.55, tail: "plain", backSpikes: false, neck: 1.1, snout: 1, pattern: "none", scale: 1 },
  },
  snowwraith: {
    key: "snowwraith",
    name: "Snow Wraith",
    nickname: "U Linh Tuyết",
    role: "xaoquyet",
    rarity: "caocap",
    colors: { body: "#dfe8f0", belly: "#ffffff", wing: "#b0c4d8", accent: "#6fd8ff" },
    baseStats: { hp: 118, atk: 45, def: 28 },
    growth: { hp: 13, atk: 6, def: 3 },
    art: { type: "sleek", horns: "none", wings: 2, wingSize: 1, tail: "spikes", backSpikes: true, neck: 1, snout: 1, pattern: "none", scale: 1 },
  },
  skrill: {
    key: "skrill",
    name: "Skrill",
    nickname: "Lôi Long",
    role: "sacben",
    rarity: "suthi",
    colors: { body: "#7a5df0", belly: "#c9bcff", wing: "#4b34b8", accent: "#9ef7ff" },
    baseStats: { hp: 128, atk: 50, def: 28 },
    growth: { hp: 14, atk: 7, def: 3 },
    art: { type: "standard", horns: "crown", wings: 2, wingSize: 1.2, tail: "spikes", backSpikes: true, neck: 1, snout: 1, pattern: "none", scale: 1.02 },
  },
  lightfury: {
    key: "lightfury",
    name: "Light Fury",
    nickname: "Bạch Long",
    role: "hove",
    rarity: "suthi",
    colors: { body: "#e8ecf2", belly: "#ffffff", wing: "#c3ccdb", accent: "#7fd8ff" },
    baseStats: { hp: 132, atk: 47, def: 30 },
    growth: { hp: 14, atk: 6, def: 4 },
    art: { type: "sleek", horns: "earflaps", wings: 2, wingSize: 1.05, tail: "fin", backSpikes: false, neck: 1, snout: 1, pattern: "none", scale: 1 },
  },
  screamingdeath: {
    key: "screamingdeath",
    name: "Screaming Death",
    nickname: "Tử Thần Gào Thét",
    role: "tankich",
    rarity: "suthi",
    colors: { body: "#e8e0d8", belly: "#fff5ea", wing: "#c0b4a8", accent: "#e04040" },
    baseStats: { hp: 135, atk: 49, def: 27 },
    growth: { hp: 14, atk: 7, def: 3 },
    art: { type: "serpent", horns: "crown", wings: 2, wingSize: 1, tail: "spikes", backSpikes: true, neck: 1, snout: 1, pattern: "none", scale: 1.08 },
  },
  deathgripper: {
    key: "deathgripper",
    name: "Deathgripper",
    nickname: "Tử Thần Kìm Kẹp",
    role: "xaoquyet",
    rarity: "suthi",
    colors: { body: "#2a3230", belly: "#5a6a64", wing: "#1a2020", accent: "#7ff05a" },
    baseStats: { hp: 126, atk: 51, def: 29 },
    growth: { hp: 13, atk: 7, def: 3 },
    art: { type: "standard", horns: "tusks", wings: 2, wingSize: 1, tail: "spikes", backSpikes: true, neck: 1, snout: 1.05, pattern: "none", scale: 1 },
  },
  toothless: {
    key: "toothless",
    name: "Night Fury",
    nickname: "Toothless",
    role: "tocdo",
    rarity: "huyenthoai",
    colors: { body: "#23252d", belly: "#4a4e5c", wing: "#101116", accent: "#c04df9" },
    baseStats: { hp: 140, atk: 54, def: 32 },
    growth: { hp: 15, atk: 7, def: 4 },
    art: { type: "sleek", horns: "earflaps", wings: 2, wingSize: 1.15, tail: "fin", backSpikes: false, neck: 1, snout: 1, pattern: "none", scale: 1.05 },
  },
  bewilderbeast: {
    key: "bewilderbeast",
    name: "Bewilderbeast",
    nickname: "Vua Băng Hải",
    role: "phongthu",
    rarity: "huyenthoai",
    colors: { body: "#9fc4d8", belly: "#e0f2fa", wing: "#6f9cb8", accent: "#ffffff" },
    baseStats: { hp: 150, atk: 50, def: 36 },
    growth: { hp: 16, atk: 6, def: 4 },
    art: { type: "bulky", horns: "tusks", wings: 2, wingSize: 0.7, tail: "plain", backSpikes: true, neck: 1, snout: 1.1, pattern: "none", scale: 1.15 },
  },
  sw1: {
    key: "sw1",
    name: "Dragon SW1",
    nickname: "Rồng Băng",
    role: "phongthu",
    rarity: "thuong",
    colors: { body: "#69b7e8", belly: "#cdeafc", wing: "#3f89ba", accent: "#ffffff" },
    baseStats: { hp: 112, atk: 36, def: 27 },
    growth: { hp: 12, atk: 5, def: 3 },
    art: { type: "standard", horns: "curved", wings: 2, wingSize: 1, tail: "fin", backSpikes: true, neck: 1, snout: 1, pattern: "none", scale: 0.95 },
  },
  sw2: {
    key: "sw2",
    name: "Dragon SW2",
    nickname: "Rồng Tuyết",
    role: "hove",
    rarity: "thuong",
    colors: { body: "#8fd0f0", belly: "#e6f7ff", wing: "#5aa3cc", accent: "#a8e6ff" },
    baseStats: { hp: 116, atk: 35, def: 26 },
    growth: { hp: 12, atk: 5, def: 3 },
    art: { type: "sleek", horns: "none", wings: 2, wingSize: 0.95, tail: "fin", backSpikes: false, neck: 1, snout: 1, pattern: "spots", scale: 0.95 },
  },
  sw3: {
    key: "sw3",
    name: "Dragon SW3",
    nickname: "Rồng Lửa Nhỏ",
    role: "tankich",
    rarity: "thuong",
    colors: { body: "#e0763d", belly: "#ffd2a8", wing: "#a84f21", accent: "#ffe066" },
    baseStats: { hp: 108, atk: 42, def: 22 },
    growth: { hp: 11, atk: 6, def: 3 },
    art: { type: "standard", horns: "curved", wings: 2, wingSize: 1, tail: "plain", backSpikes: true, neck: 1, snout: 1, pattern: "stripes", scale: 0.92 },
  },
};

// Pool trứng theo nguồn: tỉ lệ ra loài theo độ hiếm
export const EGG_POOLS = {
  starter: { thuong: 100 },
  common: { thuong: 72, hiem: 22, caocap: 5, suthi: 0.8, huyenthoai: 0.2 },
  rare: { thuong: 35, hiem: 40, caocap: 18, suthi: 6, huyenthoai: 1 },
  epic: { hiem: 25, caocap: 40, suthi: 28, huyenthoai: 7 },
};

// Thời gian ấp theo độ hiếm trứng (ms)
export const EGG_HATCH_TIME = {
  starter: 5 * 60 * 1000,
  common: 20 * 60 * 1000,
  rare: 60 * 60 * 1000,
  epic: 3 * 60 * 60 * 1000,
};

export const EGG_NAMES = {
  starter: "Trứng Sơ Sinh",
  common: "Trứng Thường",
  rare: "Trứng Hiếm",
  epic: "Trứng Sử Thi",
};

// ==================== CẤP & CHO ĂN ====================
export const DRAGON_LEVEL_CAP = 30;
// Mốc cần tiến hóa (dùng Đá Tiến Hóa) mới được vượt qua
export const EVOLVE_GATES = { 10: 20, 20: 40 }; // level: số đá cần

// Cá cần để lên 1 cấp từ cấp hiện tại (Lv1->2 = 1.500 | 2->3 = 1.550 | 3->4 = 1.600 ...)
export function feedCostForLevel(level) {
  return 1450 + 50 * level;
}

// XP người chơi cần để lên cấp tiếp theo
export function playerXpNeed(level) {
  return 100 * level;
}

// Chỉ số thực của rồng
export function dragonStats(dragon) {
  const sp = SPECIES[dragon.species] || SPECIES.sw2;
  const rarity = RARITIES[dragon.rarity] || RARITIES.thuong;
  const evolveBonus = 1 + 0.15 * (dragon.evolves || 0);
  const bondBonus = 1 + 0.02 * Math.min(10, dragon.bondLevel || 0);
  const lv = dragon.level - 1;
  const mult = rarity.statMult * evolveBonus * bondBonus;
  return {
    hp: Math.round((sp.baseStats.hp + sp.growth.hp * lv) * mult),
    atk: Math.round((sp.baseStats.atk + sp.growth.atk * lv) * mult),
    def: Math.round((sp.baseStats.def + sp.growth.def * lv) * mult),
  };
}

// ==================== ẢI (PVE) ====================
export const ENEMY_NAMES = [
  "Lính Săn Rồng", "Bẫy Thợ Săn", "Sói Tuyết Berk", "Rồng Hoang Dại", "Chiến Thuyền Drago",
  "Tháp Canh Địch", "Rồng Gai Độc", "Thủ Lĩnh Thợ Săn", "Cuồng Long Bóng Đêm", "Hạm Đội Drago",
];

export function stageEnemy(stage) {
  const name = ENEMY_NAMES[(stage - 1) % ENEMY_NAMES.length] + (stage > ENEMY_NAMES.length ? ` Cấp ${Math.ceil(stage / ENEMY_NAMES.length)}` : "");
  const roleKeys = Object.keys(ROLES);
  const role = roleKeys[(stage * 7 + 3) % roleKeys.length];
  return {
    name,
    role,
    hp: Math.round(95 + 34 * (stage - 1) + Math.pow(stage - 1, 1.6) * 6),
    atk: Math.round(30 + 7 * (stage - 1) + Math.pow(stage - 1, 1.35)),
    def: Math.round(18 + 4 * (stage - 1)),
  };
}

export function stageRewards(stage) {
  return {
    gold: 150 + 30 * stage,
    fish: 120 + 20 * stage,
    stone: 1 + (stage % 5 === 0 ? 2 : 0),
    xp: 80 + 20 * stage,
    ticketLow: 1,
    ticketMid: stage % 5 === 0 ? 1 : 0,
    ticketHigh: stage % 10 === 0 ? 1 : 0,
    eggChance: 0.12, // 12% rớt trứng thường
  };
}

// ==================== VÒNG QUAY ====================
export const WHEEL_TIERS = {
  thap: {
    key: "thap",
    name: "Thấp",
    medal: "🥉",
    segments: [
      { key: "gold", label: "Vàng", amount: 500, weight: 50, color: "#f5c542", icon: "coin" },
      { key: "fish", label: "Cá", amount: 800, weight: 35, color: "#3e8fa8", icon: "fish" },
      { key: "stone", label: "Đá Hóa", amount: 2, weight: 15, color: "#5b5ea6", icon: "gem" },
    ],
  },
  trung: {
    key: "trung",
    name: "Trung",
    medal: "🥈",
    segments: [
      { key: "gold", label: "Vàng", amount: 2000, weight: 45, color: "#f5c542", icon: "coin" },
      { key: "fish", label: "Cá", amount: 2500, weight: 35, color: "#3e8fa8", icon: "fish" },
      { key: "stone", label: "Đá Hóa", amount: 5, weight: 15, color: "#5b5ea6", icon: "gem" },
      { key: "gem", label: "Ngọc", amount: 10, weight: 5, color: "#37c88b", icon: "diamond" },
    ],
  },
  cao: {
    key: "cao",
    name: "Cao",
    medal: "🥇",
    segments: [
      { key: "gold", label: "Vàng", amount: 8000, weight: 40, color: "#f5c542", icon: "coin" },
      { key: "stone", label: "Đá Hóa", amount: 12, weight: 25, color: "#5b5ea6", icon: "gem" },
      { key: "gem", label: "Ngọc", amount: 40, weight: 20, color: "#37c88b", icon: "diamond" },
      { key: "egg", label: "Trứng Sử Thi", amount: 1, weight: 15, color: "#c2571f", icon: "egg" },
    ],
  },
};

// ==================== NHIỆM VỤ HẰNG NGÀY ====================
export const DAILY_QUESTS = [
  { id: 1, name: "Điểm danh hôm nay", counter: "checkin", target: 1, reward: { gold: 500 }, rewardText: "+500 🪙" },
  { id: 2, name: "Thắng 1 ải", counter: "stageWin", target: 1, reward: { fish: 400 }, rewardText: "+400 🐟" },
  { id: 3, name: "Nở 1 trứng", counter: "hatch", target: 1, reward: { gem: 5 }, rewardText: "+5 💎" },
  { id: 4, name: "Vuốt ve rồng 1 lần", counter: "pet", target: 1, reward: { fish: 250 }, rewardText: "+250 🐟" },
  { id: 5, name: "Quay vòng quay 1 lần", counter: "spin", target: 1, reward: { gold: 300 }, rewardText: "+300 🪙" },
  { id: 6, name: "Cho rồng ăn lên 5 cấp", counter: "feed", target: 5, reward: { ticketLow: 1 }, rewardText: "+1 🎟️ Thấp" },
];

// ==================== ĐIỂM DANH ====================
export const CHECKIN_BASE_GOLD = 2000;
export const CHECKIN_STREAK_BONUS = 200; // mỗi ngày chuỗi +200, tối đa +4000
export const CHECKIN_STREAK_BONUS_CAP = 4000;
// Mốc lịch tháng: số ngày điểm danh trong tháng -> quà
export const MONTH_MILESTONES = [
  { days: 3, rewardText: "+1.500 🪙", reward: { gold: 1500 } },
  { days: 7, rewardText: "+1 🎟️ Trung", reward: { ticketMid: 1 } },
  { days: 14, rewardText: "+20 💎", reward: { gem: 20 } },
  { days: 21, rewardText: "+1 🎟️ Cao", reward: { ticketHigh: 1 } },
  { days: 28, rewardText: "🥚 Trứng Sử Thi", reward: { eggEpic: 1 } },
];

// ==================== VUỐT VE / BUFF ====================
export const PET_COOLDOWN_MS = 4 * 60 * 60 * 1000; // mỗi rồng 4h vuốt 1 lần
export const PET_REWARD_FISH = 200;
export const PET_BOND_XP = 120;
export const BOND_XP_PER_LEVEL = 500;
export const PET_BUFF_PCT = 10; // +10% vàng nhàn rỗi
export const PET_BUFF_MS = 4 * 60 * 60 * 1000;

// ==================== VÀNG NHÀN RỖI ====================
export const IDLE_CAP_MS = 8 * 60 * 60 * 1000; // tích tối đa 8h
export function idleGoldPerHour(player) {
  const totalDragonLv = (player.dragons || []).reduce((s, d) => s + d.level, 0);
  return 200 + 150 * ((player.hall || 1) - 1) + 8 * totalDragonLv;
}

// ==================== SẢNH ====================
export function hallUpgradeCost(hall) {
  return { gold: 5000 * hall, stone: 10 * hall };
}
export const HALL_MAX = 10;

// ==================== GAUNTLET ====================
export const GAUNTLET_RUNS_PER_DAY = 1;
export function gauntletWaveEnemy(stage, wave) {
  const base = stageEnemy(Math.max(1, stage));
  const k = 1 + 0.22 * (wave - 1);
  return {
    name: `Đợt ${wave} · ${base.name}`,
    role: base.role,
    hp: Math.round(base.hp * 0.7 * k),
    atk: Math.round(base.atk * 0.85 * k),
    def: Math.round(base.def * 0.8 * k),
  };
}
export function gauntletWaveReward(wave) {
  return { gold: 100 * wave, fish: 60 * wave, amber: wave % 3 === 0 ? 1 : 0 };
}

// ==================== KHỞI TẠO NGƯỜI CHƠI ====================
export const STARTER = {
  gold: 3000,
  fish: 5000,
  gem: 20,
  stone: 30,
  amber: 0,
  hpTinh: 0,
  vikings: 5,
  season: 0,
  species: "deadly", // rồng đầu tiên: Deadly Nadder (Stormfly)
};

export const SESSION_IDLE_MS = 6 * 60 * 60 * 1000; // rời đảo sau 6h không tương tác
