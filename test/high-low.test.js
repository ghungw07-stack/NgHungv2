import test from "node:test";
import assert from "node:assert/strict";

import {
  compareHighLowCards,
  createHighLowDeck,
  drawHighLowNextCard,
  formatHighLowMoney,
  getHighLowMultiplier,
  multiplyHighLowChain,
  normalizeHighLowChoice,
  resolveHighLowGuess,
} from "../src/service-ngh/game-service/high-low/rules.js";

test("high-low compares rank before suit", () => {
  assert.equal(compareHighLowCards({ rank: "J", suit: "♠" }, { rank: "10", suit: "♥" }), 1);
  assert.equal(compareHighLowCards({ rank: "7", suit: "♥" }, { rank: "7", suit: "♦" }), 1);
  assert.equal(compareHighLowCards({ rank: "A", suit: "♠" }, { rank: "A", suit: "♠" }), 0);
});

test("high-low resolves aliases, wins, losses and pushes", () => {
  assert.equal(normalizeHighLowChoice("thấp"), "low");
  assert.equal(normalizeHighLowChoice("HIGH"), "high");
  assert.equal(resolveHighLowGuess({ rank: "7", suit: "♣" }, { rank: "Q", suit: "♠" }, "high"), "win");
  assert.equal(resolveHighLowGuess({ rank: "7", suit: "♣" }, { rank: "Q", suit: "♠" }, "cao"), "win");
  assert.equal(resolveHighLowGuess({ rank: "7", suit: "♣" }, { rank: "2", suit: "♥" }, "high"), "lose");
  assert.equal(resolveHighLowGuess({ rank: "7", suit: "♣" }, { rank: "7", suit: "♣" }, "low"), "push");
});

test("high-low payout table and floor rounding match the displayed rules", () => {
  assert.equal(getHighLowMultiplier({ rank: "J", suit: "♦" }, "high"), 2.5);
  assert.equal(getHighLowMultiplier({ rank: "J", suit: "♦" }, "low"), 1.2);
  assert.equal(getHighLowMultiplier({ rank: "A", suit: "♠" }, "low"), null);
  assert.equal(getHighLowMultiplier({ rank: "K", suit: "♥" }, "high"), null);
  assert.equal(multiplyHighLowChain("10001", 1.2).toString(), "12001");
});

test("high-low prints huge balances without duplicated currency units", () => {
  assert.equal(formatHighLowMoney("97100000000000000000"), "97.100.000.000.000.000.000");
  assert.equal(formatHighLowMoney("-3100000000000000000"), "-3.100.000.000.000.000.000");
});

test("high-low deck contains 52 unique cards", () => {
  const deck = createHighLowDeck(() => 0.5);
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map((card) => `${card.rank}${card.suit}`)).size, 52);
});

test("high-low house edge only draws cards that remain in the deck", () => {
  const losingCard = { rank: "2", suit: "♠" };
  const winningCard = { rank: "K", suit: "♥" };
  const deck = [losingCard, winningCard];
  const drawn = drawHighLowNextCard(deck, { rank: "7", suit: "♣" }, "high", {
    houseBiasChance: 1,
    random: () => 0,
  });

  assert.equal(drawn, losingCard);
  assert.deepEqual(deck, [winningCard]);
});

test("high-low slight house edge still leaves most favorable draws untouched", () => {
  let losses = 0;
  let wins = 0;

  for (let trial = 0; trial < 1_000; trial += 1) {
    const deck = [
      { rank: "2", suit: "♠" },
      { rank: "K", suit: "♥" },
    ];
    let calls = 0;
    const drawn = drawHighLowNextCard(deck, { rank: "7", suit: "♣" }, "high", {
      random: () => (calls++ === 0 ? (trial + 0.5) / 1_000 : 0),
    });
    const result = resolveHighLowGuess({ rank: "7", suit: "♣" }, drawn, "high");
    if (result === "lose") losses += 1;
    if (result === "win") wins += 1;
  }

  assert.equal(losses, 120);
  assert.equal(wins, 880);
});
