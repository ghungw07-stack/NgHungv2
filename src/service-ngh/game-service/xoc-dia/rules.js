export const XOC_DIA_DOORS = Object.freeze({
  chan: Object.freeze({ key: "chan", label: "Chẵn", profit: 0.95, aliases: ["chan", "chẵn"] }),
  le: Object.freeze({ key: "le", label: "Lẻ", profit: 0.95, aliases: ["le", "lẻ"] }),
  tai: Object.freeze({ key: "tai", label: "Tài", profit: 0.95, aliases: ["tai", "tài"] }),
  xiu: Object.freeze({ key: "xiu", label: "Xỉu", profit: 0.95, aliases: ["xiu", "xỉu"] }),
  bon_do: Object.freeze({ key: "bon_do", label: "4 đỏ", profit: 12, aliases: ["4do", "bondo", "tudo", "4đỏ", "bốnđỏ"] }),
  bon_trang: Object.freeze({ key: "bon_trang", label: "4 trắng", profit: 12, aliases: ["4trang", "bontrang", "tutrang", "4trắng", "bốntrắng"] }),
  ba_do: Object.freeze({ key: "ba_do", label: "3 đỏ 1 trắng", profit: 2.6, aliases: ["3do", "bado", "3do1trang", "3đỏ", "bađỏ", "3 đỏ 1 trắng"] }),
  ba_trang: Object.freeze({ key: "ba_trang", label: "3 trắng 1 đỏ", profit: 2.6, aliases: ["3trang", "batrang", "3trang1do", "3trắng", "batrắng", "3 trắng 1 đỏ"] }),
  hai_hai: Object.freeze({ key: "hai_hai", label: "2 đỏ 2 trắng", profit: 1.5, aliases: ["2do2trang", "2-2", "22", "haihai", "2đỏ2trắng"] }),
  tu: Object.freeze({ key: "tu", label: "Tứ (4 quân cùng màu)", profit: 6.5, aliases: ["tu", "tứ", "cungmau", "đồngmàu", "dongmau"] }),
});

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[\s_]+/g, "");
}

const DOOR_BY_ALIAS = new Map();
for (const door of Object.values(XOC_DIA_DOORS)) {
  DOOR_BY_ALIAS.set(normalizeText(door.key), door);
  for (const alias of door.aliases) DOOR_BY_ALIAS.set(normalizeText(alias), door);
}

export function normalizeXocDiaDoor(value) {
  return DOOR_BY_ALIAS.get(normalizeText(value)) || null;
}

export function getXocDiaOutcome(redCount) {
  const count = Number(redCount);
  if (!Number.isInteger(count) || count < 0 || count > 4) throw new RangeError("Số quân đỏ phải từ 0 đến 4");
  return {
    redCount: count,
    whiteCount: 4 - count,
    parity: count % 2 === 0 ? "chan" : "le",
    size: count === 2 ? null : count >= 3 ? "tai" : "xiu",
    exact: count === 0 ? "bon_trang" : count === 1 ? "ba_trang" : count === 2 ? "hai_hai" : count === 3 ? "ba_do" : "bon_do",
    isFourOfAKind: count === 0 || count === 4,
  };
}

export function resolveXocDiaBet(doorKey, redCount) {
  const outcome = getXocDiaOutcome(redCount);
  if ((doorKey === "tai" || doorKey === "xiu") && outcome.size === null) return "push";
  if (doorKey === outcome.parity || doorKey === outcome.size || doorKey === outcome.exact) return "win";
  if (doorKey === "tu" && outcome.isFourOfAKind) return "win";
  return "lose";
}

export function getXocDiaReturnMultiplier(doorKey) {
  const door = XOC_DIA_DOORS[doorKey];
  if (!door) throw new RangeError(`Cửa Xóc Đĩa không hợp lệ: ${doorKey}`);
  return 1 + door.profit;
}

export function shakeXocDiaCoins(random = Math.random) {
  return Array.from({ length: 4 }, () => (random() < 0.5 ? "red" : "white"));
}

export function coinsForRedCount(redCount, random = Math.random) {
  const outcome = getXocDiaOutcome(redCount);
  const coins = [
    ...Array.from({ length: outcome.redCount }, () => "red"),
    ...Array.from({ length: outcome.whiteCount }, () => "white"),
  ];
  for (let index = coins.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [coins[index], coins[swapIndex]] = [coins[swapIndex], coins[index]];
  }
  return coins;
}

export function chooseXocDiaCoins(players = {}, { random = Math.random, houseBiasChance = 0.6 } = {}) {
  const naturalCoins = shakeXocDiaCoins(random);
  const bets = Object.values(players || {});
  if (!bets.length || random() >= houseBiasChance) return naturalCoins;

  const liabilities = Array.from({ length: 5 }, (_, redCount) => {
    let total = 0;
    for (const bet of bets) {
      const amount = Number(bet.amount || 0);
      const result = resolveXocDiaBet(bet.door, redCount);
      if (result === "win") total += amount * getXocDiaReturnMultiplier(bet.door);
      else if (result === "push") total += amount;
    }
    return { redCount, total };
  });
  const minimum = Math.min(...liabilities.map((item) => item.total));
  const candidates = liabilities.filter((item) => item.total === minimum);
  const selected = candidates[Math.floor(random() * candidates.length)] || liabilities[0];
  return coinsForRedCount(selected.redCount, random);
}
