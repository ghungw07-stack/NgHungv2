export const DA_GA_DOORS = Object.freeze({
  do: { key: "do", label: "Gà Đỏ", color: "#ef4444" },
  xanh: { key: "xanh", label: "Gà Xanh", color: "#38bdf8" },
  hoa: { key: "hoa", label: "Hòa", color: "#facc15" },
});

export function normalizeDaGaDoor(value) {
  const key = String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replaceAll("đ", "d");
  if (["do", "red", "meron", "ga do", "gado"].includes(key)) return DA_GA_DOORS.do;
  if (["xanh", "blue", "wala", "ga xanh", "gaxanh"].includes(key)) return DA_GA_DOORS.xanh;
  if (["hoa", "draw", "bdd"].includes(key)) return DA_GA_DOORS.hoa;
  return null;
}

export function chooseDaGaResult(players = {}, random = Math.random, houseBiasChance = 0.8) {
  const roll = random();
  let winner = roll < .47 ? "do" : roll < .94 ? "xanh" : "hoa";
  const bets = Object.values(players || {});
  if (bets.length && random() < houseBiasChance) {
    const liabilities = Object.values(DA_GA_DOORS).map(door => ({
      key: door.key,
      total: bets.reduce((sum, bet) => sum + (bet.door?.key === door.key ? Number(bet.amount || 0) * (door.key === "hoa" ? 8.5 : 1.9) : 0), 0),
    }));
    const minimum = Math.min(...liabilities.map(item => item.total));
    const candidates = liabilities.filter(item => item.total === minimum);
    winner = candidates[Math.floor(random() * candidates.length)]?.key || winner;
  }
  return { winner, rounds: 2 + Math.floor(random() * 4), seed: Math.floor(random() * 1_000_000) };
}

export function settleDaGaBet(door, result) {
  const multiplier = door.key === result.winner ? (door.key === "hoa" ? 8.5 : 1.9) : 0;
  return { state: multiplier ? "win" : "lose", returnMultiplier: multiplier };
}
