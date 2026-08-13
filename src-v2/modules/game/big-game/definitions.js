const FACES = ["bau", "cua", "tom", "ca", "ga", "nai"];
const pick = (bytes, index, max) => bytes[index] % max;

export const BIG_GAMES = Object.freeze({
  taixiu: {
    aliases: ["tx"], selections: ["tai", "xiu"],
    roll(bytes) {
      const dice = [pick(bytes, 0, 6) + 1, pick(bytes, 1, 6) + 1, pick(bytes, 2, 6) + 1];
      const total = dice.reduce((sum, value) => sum + value, 0);
      const triple = new Set(dice).size === 1;
      return { dice, total, outcome: triple ? "bo-ba" : total >= 11 ? "tai" : "xiu" };
    },
    multiplier(selection, result) { return result.outcome === selection ? 2 : 0; },
    describe(result) { return `${result.dice.join("-")} = ${result.total} → ${result.outcome.toUpperCase()}`; },
  },
  chanle: {
    aliases: ["cl"], selections: ["chan", "le"],
    roll(bytes) { const number = pick(bytes, 0, 100); return { number, outcome: number % 2 ? "le" : "chan" }; },
    multiplier(selection, result) { return result.outcome === selection ? 2 : 0; },
    describe(result) { return `${result.number} → ${result.outcome.toUpperCase()}`; },
  },
  baucua: {
    aliases: ["bc"], selections: FACES,
    roll(bytes) { return { faces: [FACES[pick(bytes, 0, 6)], FACES[pick(bytes, 1, 6)], FACES[pick(bytes, 2, 6)]] }; },
    multiplier(selection, result) { const count = result.faces.filter((face) => face === selection).length; return count ? count + 1 : 0; },
    describe(result) { return result.faces.map((face) => face.toUpperCase()).join(" - "); },
  },
});

export function resolveBigGame(name) {
  const value = String(name || "").toLowerCase();
  return Object.entries(BIG_GAMES).find(([key, game]) => key === value || game.aliases.includes(value));
}
