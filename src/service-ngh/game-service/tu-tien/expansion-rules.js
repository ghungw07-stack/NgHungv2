const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function resolveAlchemy(level, quantity, roll = Math.random()) {
  const batches = clamp(Math.floor(Number(quantity) || 1), 1, 20);
  const professionLevel = clamp(Number(level) || 1, 1, 20);
  const successRate = Number(Math.min(0.95, 0.62 + professionLevel * 0.015).toFixed(3));
  const quality = roll < 0.08 + professionLevel * 0.004 ? "cucpham" : roll < 0.3 + professionLevel * 0.008 ? "thuongpham" : "phamdanh";
  const multiplier = quality === "cucpham" ? 2 : quality === "thuongpham" ? 1.5 : 1;
  return { batches, successRate, quality, multiplier };
}

export function resolvePartyDungeon(memberPowers, enemyPower, roll = Math.random()) {
  const powers = memberPowers.map(Number).filter(value => Number.isFinite(value) && value > 0);
  const synergy = 1 + Math.max(0, powers.length - 1) * 0.08;
  const partyPower = Math.round(powers.reduce((sum, value) => sum + value, 0) * synergy);
  return { partyPower, synergy, win: partyPower * (0.86 + roll * 0.28) >= enemyPower };
}

export function resolveGuildWar(attackerPower, defenderPower, attackerStreak = 0, roll = Math.random()) {
  const streak = clamp(Math.floor(Number(attackerStreak) || 0), 0, 5);
  const attack = attackerPower * (1 + streak * 0.02) * (0.88 + roll * 0.24);
  const win = attack >= defenderPower;
  return { win, points: win ? 3 + streak : 1, fund: win ? 7500 : 2000, nextStreak: win ? streak + 1 : 0 };
}

export function resolveRoguelikeFloor(power, floor, buff = 0, roll = Math.random()) {
  const effectivePower = Math.round(Math.max(1, power) * (1 + Math.max(0, buff)));
  const enemyPower = Math.round(520 * Math.pow(1.24, Math.max(0, floor - 1)));
  return { effectivePower, enemyPower, win: effectivePower * (0.82 + roll * 0.36) >= enemyPower };
}

export function resolveTribulationChoice(choice, pattern) {
  const counters = { loi: "thu", hoa: "ne", tamma: "phan" };
  return { success: counters[pattern] === choice, counter: counters[pattern] };
}
