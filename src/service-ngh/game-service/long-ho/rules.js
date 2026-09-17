export const LONG_HO_DOORS = Object.freeze({
  long: Object.freeze({ key: "long", label: "Long", profit: 0.95, aliases: ["long", "rong"] }),
  ho: Object.freeze({ key: "ho", label: "Hổ", profit: 0.95, aliases: ["ho", "hổ"] }),
  hoa: Object.freeze({ key: "hoa", label: "Hòa", profit: 8, aliases: ["hoa", "hòa"] }),
});

const SUITS = ["♠", "♣", "♥", "♦"];

function compact(value) {
  return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/\s+/g, "");
}

export function normalizeLongHoDoor(value) {
  const text = compact(value);
  return Object.values(LONG_HO_DOORS).find((door) => door.aliases.some((alias) => compact(alias) === text)) || null;
}

export function drawLongHoCard(random = Math.random) {
  const rank = Math.floor(random() * 13) + 1;
  const suit = SUITS[Math.floor(random() * SUITS.length)];
  return { rank, suit };
}

export function getLongHoResult(longCard, hoCard) {
  const resultDoor = longCard.rank > hoCard.rank ? "long" : hoCard.rank > longCard.rank ? "ho" : "hoa";
  return { longCard, hoCard, resultDoor };
}

export function dealLongHo(random = Math.random) {
  return getLongHoResult(drawLongHoCard(random), drawLongHoCard(random));
}

export function chooseLongHoResult(players = {}, { random = Math.random, houseBiasChance = 0.6 } = {}) {
  let result = dealLongHo(random);
  const bets = Object.values(players || {});
  if (!bets.length || random() >= houseBiasChance) return result;
  const liability = Object.fromEntries(Object.values(LONG_HO_DOORS).map((door) => [door.key, 0]));
  for (const bet of bets) liability[bet.door.key] += Number(bet.amount || 0) * (1 + bet.door.profit);
  const minimum = Math.min(...Object.values(liability));
  const preferred = Object.keys(liability).filter((key) => liability[key] === minimum);
  const selected = preferred[Math.floor(random() * preferred.length)];
  for (let attempt = 0; attempt < 100 && result.resultDoor !== selected; attempt += 1) result = dealLongHo(random);
  return result;
}

export function settleLongHoBet(door, result) {
  return door.key === result.resultDoor
    ? { state: "win", returnMultiplier: 1 + door.profit }
    : { state: "lose", returnMultiplier: 0 };
}

export function cardRankLabel(rank) {
  return ({ 1: "A", 11: "J", 12: "Q", 13: "K" })[rank] || String(rank);
}
