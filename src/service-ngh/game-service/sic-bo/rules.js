export const SIC_BO_TOTAL_PROFITS = Object.freeze({
  4: 50,
  5: 18,
  6: 14,
  7: 12,
  8: 8,
  9: 6,
  10: 6,
  11: 6,
  12: 6,
  13: 8,
  14: 12,
  15: 14,
  16: 18,
  17: 50,
});

const FIXED_DOORS = Object.freeze({
  tai: Object.freeze({ key: "tai", label: "Tài", category: "main", profit: 1, aliases: ["tai", "lon"] }),
  xiu: Object.freeze({ key: "xiu", label: "Xỉu", category: "main", profit: 1, aliases: ["xiu", "nho"] }),
  chan: Object.freeze({ key: "chan", label: "Chẵn", category: "main", profit: 1, aliases: ["chan"] }),
  le: Object.freeze({ key: "le", label: "Lẻ", category: "main", profit: 1, aliases: ["le"] }),
  any_triple: Object.freeze({ key: "any_triple", label: "Bộ ba bất kỳ", category: "any_triple", profit: 30, aliases: ["batkybo", "bobabatky", "bộbabấtkỳ", "bấtkỳbộ"] }),
});

function compactText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]/g, "");
}

const FIXED_BY_ALIAS = new Map();
for (const door of Object.values(FIXED_DOORS)) {
  FIXED_BY_ALIAS.set(compactText(door.key), door);
  for (const alias of door.aliases) FIXED_BY_ALIAS.set(compactText(alias), door);
}

export function normalizeSicBoDoor(value) {
  const compact = compactText(value);
  const fixed = FIXED_BY_ALIAS.get(compact);
  if (fixed) return fixed;

  let match = compact.match(/^tong(1[0-7]|[4-9])$/);
  if (match) {
    const total = Number(match[1]);
    return { key: `total_${total}`, label: `Tổng ${total}`, category: "total", total, profit: SIC_BO_TOTAL_PROFITS[total] };
  }

  match = compact.match(/^(?:mat|motmat|don)([1-6])$/);
  if (match) {
    const face = Number(match[1]);
    return { key: `single_${face}`, label: `Một mặt ${face}`, category: "single", face, profit: null };
  }

  match = compact.match(/^doi([1-6])$/);
  if (match) {
    const face = Number(match[1]);
    return { key: `double_${face}`, label: `Đôi ${face}`, category: "double", face, profit: 10 };
  }

  match = compact.match(/^(?:bo|boba|bocuthe)([1-6])$/);
  if (match) {
    const face = Number(match[1]);
    return { key: `triple_${face}`, label: `Bộ ba ${face}`, category: "triple", face, profit: 150 };
  }

  match = compact.match(/^cap([1-6])([1-6])$/);
  if (match && match[1] !== match[2]) {
    const faces = [Number(match[1]), Number(match[2])].sort((a, b) => a - b);
    return { key: `pair_${faces[0]}_${faces[1]}`, label: `Cặp ${faces[0]}–${faces[1]}`, category: "pair", faces, profit: 5 };
  }
  return null;
}

export function getSicBoOutcome(dice) {
  if (!Array.isArray(dice) || dice.length !== 3 || dice.some((face) => !Number.isInteger(Number(face)) || Number(face) < 1 || Number(face) > 6)) {
    throw new RangeError("Sic Bo cần đúng 3 xúc xắc có giá trị từ 1 đến 6");
  }
  const normalizedDice = dice.map(Number);
  const total = normalizedDice.reduce((sum, face) => sum + face, 0);
  const isTriple = normalizedDice.every((face) => face === normalizedDice[0]);
  return {
    dice: normalizedDice,
    total,
    isTriple,
    size: isTriple ? null : total >= 11 ? "tai" : "xiu",
    parity: isTriple ? null : total % 2 === 0 ? "chan" : "le",
    counts: normalizedDice.reduce((result, face) => {
      result[face] = (result[face] || 0) + 1;
      return result;
    }, {}),
  };
}

export function resolveSicBoBet(door, dice) {
  if (!door?.category) throw new RangeError("Cửa Sic Bo không hợp lệ");
  const outcome = getSicBoOutcome(dice);
  let won = false;
  let profit = door.profit;

  if (door.category === "main") won = door.key === outcome.size || door.key === outcome.parity;
  else if (door.category === "total") won = door.total === outcome.total;
  else if (door.category === "single") {
    const occurrences = outcome.counts[door.face] || 0;
    won = occurrences > 0;
    profit = occurrences;
  } else if (door.category === "double") won = (outcome.counts[door.face] || 0) >= 2;
  else if (door.category === "triple") won = outcome.isTriple && outcome.dice[0] === door.face;
  else if (door.category === "any_triple") won = outcome.isTriple;
  else if (door.category === "pair") won = door.faces.every((face) => (outcome.counts[face] || 0) > 0);

  return { state: won ? "win" : "lose", profit: won ? profit : 0, outcome };
}

export function rollSicBoDice(random = Math.random) {
  return Array.from({ length: 3 }, () => Math.floor(random() * 6) + 1);
}

export function chooseSicBoDice(players = {}, { random = Math.random, houseBiasChance = 0.6 } = {}) {
  const naturalDice = rollSicBoDice(random);
  const bets = Object.values(players || {});
  if (!bets.length || random() >= houseBiasChance) return naturalDice;

  const candidates = [];
  let minimumLiability = Infinity;
  for (let first = 1; first <= 6; first += 1) {
    for (let second = 1; second <= 6; second += 1) {
      for (let third = 1; third <= 6; third += 1) {
        const dice = [first, second, third];
        let liability = 0;
        for (const bet of bets) {
          const result = resolveSicBoBet(bet.door, dice);
          if (result.state === "win") liability += Number(bet.amount || 0) * (1 + result.profit);
        }
        if (liability < minimumLiability) {
          minimumLiability = liability;
          candidates.length = 0;
          candidates.push(dice);
        } else if (liability === minimumLiability) {
          candidates.push(dice);
        }
      }
    }
  }
  return candidates[Math.floor(random() * candidates.length)] || naturalDice;
}

export function getWinningSicBoLabels(dice) {
  const outcome = getSicBoOutcome(dice);
  const labels = [];
  if (!outcome.isTriple) {
    labels.push(outcome.size === "tai" ? "Tài" : "Xỉu");
    labels.push(outcome.parity === "chan" ? "Chẵn" : "Lẻ");
  }
  labels.push(`Tổng ${outcome.total}`);
  for (let face = 1; face <= 6; face += 1) {
    const count = outcome.counts[face] || 0;
    if (count) labels.push(`Một mặt ${face} ×${count}`);
    if (count >= 2) labels.push(`Đôi ${face}`);
    if (count === 3) labels.push(`Bộ ba ${face}`, "Bộ ba bất kỳ");
  }
  const unique = [...new Set(outcome.dice)].sort((a, b) => a - b);
  for (let first = 0; first < unique.length; first += 1) {
    for (let second = first + 1; second < unique.length; second += 1) labels.push(`Cặp ${unique[first]}–${unique[second]}`);
  }
  return labels;
}
