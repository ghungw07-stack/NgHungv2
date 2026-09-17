export const KENO_PAYOUTS = Object.freeze({
  1: Object.freeze({ 1: 3.8 }),
  2: Object.freeze({ 2: 16 }),
  3: Object.freeze({ 2: 1, 3: 70 }),
  4: Object.freeze({ 3: 8, 4: 300 }),
  5: Object.freeze({ 3: 2, 4: 30, 5: 1500 }),
});

export function normalizeKenoDoor(value) {
  const raw = String(value || "").trim();
  const tokens = raw.match(/\d+/g) || [];
  if (tokens.length < 1 || tokens.length > 5) return null;
  const picks = [...new Set(tokens.map(Number))].sort((a, b) => a - b);
  if (picks.length !== tokens.length || picks.some((number) => number < 1 || number > 40)) return null;
  const residue = raw.replace(/\d+/g, "").replace(/[\s,;|/\-]+/g, "");
  if (residue) return null;
  return { key: `pick_${picks.join("_")}`, label: `Số ${picks.join(", ")}`, category: "ticket", picks };
}

export function drawKenoNumbers(random = Math.random) {
  const pool = Array.from({ length: 40 }, (_, index) => index + 1);
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }
  return { numbers: pool.slice(0, 10).sort((a, b) => a - b) };
}

export function settleKenoBet(door, result) {
  const drawn = new Set(result.numbers);
  const hits = door.picks.filter((number) => drawn.has(number));
  const returnMultiplier = KENO_PAYOUTS[door.picks.length]?.[hits.length] || 0;
  return {
    state: returnMultiplier === 1 ? "push" : returnMultiplier > 1 ? "win" : "lose",
    returnMultiplier,
    hits,
  };
}

export function chooseKenoResult(players = {}, { random = Math.random, houseBiasChance = 0.6, samples = 60 } = {}) {
  const natural = drawKenoNumbers(random);
  const bets = Object.values(players || {});
  if (!bets.length || random() >= houseBiasChance) return natural;
  let selected = natural;
  let minimum = Infinity;
  for (let attempt = 0; attempt < samples; attempt += 1) {
    const candidate = drawKenoNumbers(random);
    const liability = bets.reduce((sum, bet) => sum + Number(bet.amount || 0) * settleKenoBet(bet.door, candidate).returnMultiplier, 0);
    if (liability < minimum) { minimum = liability; selected = candidate; }
  }
  return selected;
}
