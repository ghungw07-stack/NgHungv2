import crypto from "node:crypto";

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export function createDeck() {
  const deck = SUITS.flatMap((suit) => RANKS.map((rank) => `${rank}${suit}`));
  for (let index = deck.length - 1; index > 0; index--) {
    const target = crypto.randomInt(index + 1);
    [deck[index], deck[target]] = [deck[target], deck[index]];
  }
  return deck;
}

export function handScore(hand) {
  let total = 0, aces = 0;
  for (const card of hand) {
    const rank = card.slice(0, -1);
    if (rank === "A") { total += 11; aces++; }
    else total += ["J", "Q", "K"].includes(rank) ? 10 : Number(rank);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

export function isBlackjack(hand) { return hand.length === 2 && handScore(hand) === 21; }
