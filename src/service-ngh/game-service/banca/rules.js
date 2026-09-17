export const FISH_DOORS = [
  { key: "1", label: "Cá con", weight: 57.62, multiplier: 1.5, rate: "57,62%", num: "SỐ 1", color: "#58d8ff" },
  { key: "2", label: "Cá vàng nhỏ", weight: 34.57, multiplier: 2.5, rate: "34,57%", num: "SỐ 2", color: "#ffd166" },
  { key: "3", label: "Cá nóc", weight: 21.61, multiplier: 4, rate: "21,61%", num: "SỐ 3", color: "#ff9f1c" },
  { key: "6", label: "Bạch tuộc hồng", weight: 2.47, multiplier: 35, rate: "2,47%", num: "SỐ 6", color: "#ff70a6" },
  { key: "7", label: "Bạch tuộc tím", weight: 12.35, multiplier: 7, rate: "12,35%", num: "SỐ 7", color: "#c77dff" },
  { key: "8", label: "Cua đỏ", weight: 7.20, multiplier: 12, rate: "7,20%", num: "SỐ 8", color: "#ff4d4d" },
  { key: "9", label: "Tôm đỏ", weight: 4.32, multiplier: 20, rate: "4,32%", num: "SỐ 9", color: "#ff6b4a" },
  { key: "10", label: "Cá lớn", weight: 0.43, multiplier: 200, rate: "0,43%", num: "SỐ 10", color: "#3a86ff" },
  { key: "11", label: "Cá vàng", weight: 0.17, multiplier: 500, rate: "0,17%", num: "SỐ 11", color: "#ffbe0b" },
  { key: "12", label: "Cá rồng", weight: 0.08, multiplier: 1000, rate: "0,08%", num: "SỐ 12", color: "#fb5607" },
  { key: "boss", label: "Boss Biển Cả", weight: 0.01, multiplier: 10000, rate: "0,01%", num: "BOSS", color: "#ffe600" },
];

export function normalizeBancaDoor(value) {
  const text = String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/gu, "").replace(/đ/g, "d");
  const aliases = {
    1: "1", nho: "1", canho: "1", "ca-nho": "1", con: "1", cacon: "1", "ca-con": "1",
    2: "2", cavangnho: "2", "ca-vang-nho": "2", canhovang: "2",
    3: "3", noc: "3", canoc: "3", "ca-noc": "3", cam: "3", cacam: "3", "ca-cam": "3", 4: "3",
    6: "6", bachtuochong: "6", muchong: "6", "bach-tuoc-hong": "6",
    7: "7", bachtuoctim: "7", muctim: "7", "bach-tuoc-tim": "7",
    8: "8", cua: "8", cuado: "8", "cua-do": "8",
    9: "9", tom: "9", tomdo: "9", "tom-do": "9",
    10: "10", lon: "10", calon: "10", "ca-lon": "10",
    11: "11", vang: "11", cavang: "11", "ca-vang": "11",
    12: "12", rong: "12", carong: "12", "ca-rong": "12",
    boss: "boss", 5: "boss", 13: "boss", dai: "boss", daiduong: "boss", bienca: "boss", bossbienca: "boss", cavoi: "boss",
  };
  const key = aliases[text.replace(/\s+/gu, "")] || aliases[text] || text;
  return FISH_DOORS.find((door) => door.key === key) || null;
}

function weightedBancaResult(random) {
  const total = FISH_DOORS.reduce((sum, door) => sum + door.weight, 0);
  let cursor = random() * total;
  for (const door of FISH_DOORS) {
    cursor -= door.weight;
    if (cursor <= 0) return { ...door };
  }
  return { ...FISH_DOORS[0] };
}

export function chooseBancaResult(players = {}, { random = Math.random, houseBiasChance = 0.8 } = {}) {
  const natural = weightedBancaResult(random);
  const bets = Object.values(players || {});
  if (!bets.length || random() >= houseBiasChance) return natural;
  const liabilities = FISH_DOORS.map((door) => ({
    door,
    total: bets.reduce((sum, bet) => sum + (bet.door?.key === door.key ? Number(bet.amount || 0) * door.multiplier : 0), 0),
  }));
  const minimum = Math.min(...liabilities.map(item => item.total));
  const candidates = liabilities.filter(item => item.total === minimum);
  return { ...(candidates[Math.floor(random() * candidates.length)]?.door || natural) };
}

export function settleBancaBet(door, result) {
  return door?.key === result?.key
    ? { state: "win", returnMultiplier: result.multiplier }
    : { state: "lose", returnMultiplier: 0 };
}
