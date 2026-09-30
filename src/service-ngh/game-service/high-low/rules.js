import Big from "big.js";

export const HIGH_LOW_RANKS = Object.freeze(["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]);
export const HIGH_LOW_SUITS = Object.freeze(["♠", "♣", "♦", "♥"]);
export const HIGH_LOW_HOUSE_BIAS_CHANCE = 0.12;

const LOW_MULTIPLIERS = [null, 2.5, 2.5, 2.5, 2.5, 2.35, 1.95, 1.75, 1.52, 1.35, 1.2, 1.1, 0.8];
const HIGH_MULTIPLIERS = [0.8, 1.1, 1.2, 1.35, 1.52, 1.75, 1.95, 2.35, 2.5, 2.5, 2.5, 2.5, null];

export const HIGH_LOW_MULTIPLIERS = Object.freeze({
  low: Object.freeze(LOW_MULTIPLIERS),
  high: Object.freeze(HIGH_MULTIPLIERS),
});

function normalize(value) {
  return String(value || "").trim().toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
}

export function normalizeHighLowChoice(value) {
  const choice = normalize(value);
  if (["cao", "high", "h", "len"].includes(choice)) return "high";
  if (["thap", "low", "l", "xuong"].includes(choice)) return "low";
  return null;
}

export function createHighLowDeck(random = Math.random) {
  const deck = HIGH_LOW_RANKS.flatMap((rank) => HIGH_LOW_SUITS.map((suit) => ({ rank, suit })));
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [deck[index], deck[swap]] = [deck[swap], deck[index]];
  }
  return deck;
}

export function compareHighLowCards(left, right) {
  const rankDifference = HIGH_LOW_RANKS.indexOf(left?.rank) - HIGH_LOW_RANKS.indexOf(right?.rank);
  if (rankDifference) return Math.sign(rankDifference);
  return Math.sign(HIGH_LOW_SUITS.indexOf(left?.suit) - HIGH_LOW_SUITS.indexOf(right?.suit));
}

export function getHighLowMultiplier(card, choice) {
  const rankIndex = HIGH_LOW_RANKS.indexOf(card?.rank);
  if (rankIndex < 0 || !HIGH_LOW_MULTIPLIERS[choice]) return null;
  return HIGH_LOW_MULTIPLIERS[choice][rankIndex];
}

export function resolveHighLowGuess(currentCard, nextCard, choice) {
  const normalizedChoice = normalizeHighLowChoice(choice);
  if (!normalizedChoice) throw new Error("Cửa cược không hợp lệ.");
  const comparison = compareHighLowCards(nextCard, currentCard);
  if (comparison === 0) return "push";
  return normalizedChoice === "high" ? (comparison > 0 ? "win" : "lose") : (comparison < 0 ? "win" : "lose");
}

export function drawHighLowNextCard(
  deck,
  currentCard,
  choice,
  { random = Math.random, houseBiasChance = HIGH_LOW_HOUSE_BIAS_CHANCE } = {},
) {
  if (!Array.isArray(deck) || deck.length === 0) return null;
  const normalizedChoice = normalizeHighLowChoice(choice);
  if (!normalizedChoice) throw new Error("Cửa cược không hợp lệ.");

  const chance = Math.min(1, Math.max(0, Number(houseBiasChance) || 0));
  if (chance > 0 && random() < chance) {
    const losingIndexes = [];
    for (let index = 0; index < deck.length; index += 1) {
      if (resolveHighLowGuess(currentCard, deck[index], normalizedChoice) === "lose") {
        losingIndexes.push(index);
      }
    }
    if (losingIndexes.length) {
      const pick = Math.min(losingIndexes.length - 1, Math.floor(random() * losingIndexes.length));
      return deck.splice(losingIndexes[pick], 1)[0];
    }
  }

  return deck.pop();
}

export function multiplyHighLowChain(amount, multiplier) {
  if (multiplier == null || !Number.isFinite(multiplier) || multiplier <= 0) throw new Error("Hệ số không hợp lệ.");
  return new Big(amount).times(String(multiplier)).round(0, Big.roundDown);
}

export function formatHighLowMoney(value) {
  const amount = new Big(value || 0).round(0, Big.roundDown).toFixed(0);
  const sign = amount.startsWith("-") ? "-" : "";
  const digits = sign ? amount.slice(1) : amount;
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function highLowCardLabel(card) {
  return card ? `${card.rank}${card.suit}` : "?";
}
