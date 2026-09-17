export const ROULETTE_RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

const FIXED = Object.freeze({
  do: Object.freeze({ key: "do", label: "Đỏ", profit: 1, aliases: ["do", "đỏ"] }),
  den: Object.freeze({ key: "den", label: "Đen", profit: 1, aliases: ["den", "đen"] }),
  chan: Object.freeze({ key: "chan", label: "Chẵn", profit: 1, aliases: ["chan", "chẵn"] }),
  le: Object.freeze({ key: "le", label: "Lẻ", profit: 1, aliases: ["le", "lẻ"] }),
  tai: Object.freeze({ key: "tai", label: "Tài 19–36", profit: 1, aliases: ["tai", "lon"] }),
  xiu: Object.freeze({ key: "xiu", label: "Xỉu 1–18", profit: 1, aliases: ["xiu", "nho"] }),
});

function compact(value) {
  return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]/g, "");
}

export function normalizeRouletteDoor(value) {
  const text = compact(value);
  const fixed = Object.values(FIXED).find((door) => door.aliases.some((alias) => compact(alias) === text));
  if (fixed) return fixed;
  let match = text.match(/^(?:so|number)([0-9]|[12][0-9]|3[0-6])$/);
  if (match) {
    const number = Number(match[1]);
    return { key: `number_${number}`, label: `Số ${number}`, category: "number", number, profit: 35 };
  }
  match = text.match(/^cot([1-3])$/);
  if (match) return { key: `column_${match[1]}`, label: `Cột ${match[1]}`, category: "column", column: Number(match[1]), profit: 2 };
  match = text.match(/^(?:chuc|nhom)([1-3])$/);
  if (match) {
    const dozen = Number(match[1]);
    const from = (dozen - 1) * 12 + 1;
    return { key: `dozen_${dozen}`, label: `${from}–${from + 11}`, category: "dozen", dozen, profit: 2 };
  }
  return null;
}

export function getRouletteOutcome(number) {
  const value = Number(number);
  if (!Number.isInteger(value) || value < 0 || value > 36) throw new RangeError("Số Roulette phải từ 0 đến 36");
  if (value === 0) return { number: 0, color: "xanh", parity: null, size: null, column: null, dozen: null };
  return {
    number: value,
    color: ROULETTE_RED_NUMBERS.has(value) ? "do" : "den",
    parity: value % 2 === 0 ? "chan" : "le",
    size: value >= 19 ? "tai" : "xiu",
    column: ((value - 1) % 3) + 1,
    dozen: Math.floor((value - 1) / 12) + 1,
  };
}

export function settleRouletteBet(door, result) {
  const outcome = getRouletteOutcome(result.number);
  let won = false;
  if (door.category === "number") won = door.number === outcome.number;
  else if (door.category === "column") won = door.column === outcome.column;
  else if (door.category === "dozen") won = door.dozen === outcome.dozen;
  else won = door.key === outcome.color || door.key === outcome.parity || door.key === outcome.size;
  return won ? { state: "win", returnMultiplier: 1 + door.profit } : { state: "lose", returnMultiplier: 0 };
}

export function spinRoulette(random = Math.random) {
  return { number: Math.floor(random() * 37) };
}

export function chooseRouletteResult(players = {}, { random = Math.random, houseBiasChance = 0.6 } = {}) {
  const natural = spinRoulette(random);
  const bets = Object.values(players || {});
  if (!bets.length || random() >= houseBiasChance) return natural;
  const liabilities = Array.from({ length: 37 }, (_, number) => ({
    number,
    total: bets.reduce((sum, bet) => {
      const settlement = settleRouletteBet(bet.door, { number });
      return sum + Number(bet.amount || 0) * settlement.returnMultiplier;
    }, 0),
  }));
  const minimum = Math.min(...liabilities.map((item) => item.total));
  const candidates = liabilities.filter((item) => item.total === minimum);
  return { number: candidates[Math.floor(random() * candidates.length)]?.number ?? natural.number };
}
