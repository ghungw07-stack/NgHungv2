const FACES = ["bau", "cua", "tom", "ca", "ga", "nai"];
const pick = (bytes, index, max) => bytes[index] % max;
const cardPoint = (byte) => Math.min((byte % 13) + 1, 10) % 10;

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
  duangua: {
    aliases: ["race"], selections: ["1", "2", "3", "4", "5", "6"],
    roll(bytes) { return { horse: String(pick(bytes, 0, 6) + 1) }; },
    multiplier(selection, result) { return selection === result.horse ? 6 : 0; },
    describe(result) { return `Ngựa số ${result.horse} về nhất`; },
  },
  roulette: {
    aliases: ["rl"], selections: ["do", "den", "chan", "le"],
    roll(bytes) {
      const number = pick(bytes, 0, 37);
      const red = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
      return { number, color: number === 0 ? "xanh" : red.has(number) ? "do" : "den", parity: number === 0 ? "khong" : number % 2 ? "le" : "chan" };
    },
    multiplier(selection, result) { return selection === result.color || selection === result.parity ? 2 : 0; },
    describe(result) { return `${result.number} — ${result.color.toUpperCase()} — ${result.parity.toUpperCase()}`; },
  },
  xocdia: {
    aliases: ["xd"], selections: ["chan", "le"],
    roll(bytes) {
      const red = [0, 1, 2, 3].reduce((sum, index) => sum + pick(bytes, index, 2), 0);
      return { red, white: 4 - red, outcome: red % 2 ? "le" : "chan" };
    },
    multiplier(selection, result) { return selection === result.outcome ? 2 : 0; },
    describe(result) { return `${result.red} đỏ ${result.white} trắng → ${result.outcome.toUpperCase()}`; },
  },
  baccarat: {
    aliases: ["bcr"], selections: ["player", "banker", "tie"],
    roll(bytes) {
      const playerCards = [cardPoint(bytes[0]), cardPoint(bytes[1])];
      const bankerCards = [cardPoint(bytes[2]), cardPoint(bytes[3])];
      let player = playerCards.reduce((sum, value) => sum + value, 0) % 10;
      let banker = bankerCards.reduce((sum, value) => sum + value, 0) % 10;
      if (player < 6 && banker < 8) { const card = cardPoint(bytes[4]); playerCards.push(card); player = (player + card) % 10; }
      if (banker < 6 && player < 8) { const card = cardPoint(bytes[5]); bankerCards.push(card); banker = (banker + card) % 10; }
      return { playerCards, bankerCards, player, banker, outcome: player === banker ? "tie" : player > banker ? "player" : "banker" };
    },
    multiplier(selection, result) { return selection === result.outcome ? (selection === "tie" ? 9 : 2) : 0; },
    describe(result) { return `Player ${result.player} — Banker ${result.banker} → ${result.outcome.toUpperCase()}`; },
  },
});

export function resolveBigGame(name) {
  const value = String(name || "").toLowerCase();
  return Object.entries(BIG_GAMES).find(([key, game]) => key === value || game.aliases.includes(value));
}
