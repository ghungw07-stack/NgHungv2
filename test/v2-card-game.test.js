import assert from "node:assert/strict";
import test from "node:test";
import { createDeck, handScore, isBlackjack } from "../src-v2/modules/game/card-game/cards.js";
import { XiDachGame } from "../src-v2/modules/game/card-game/xidach.js";

test("card deck is complete and blackjack scoring handles aces", () => {
  const deck = createDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck).size, 52);
  assert.equal(handScore(["A♠", "K♥"]), 21);
  assert.equal(isBlackjack(["A♠", "K♥"]), true);
  assert.equal(handScore(["A♠", "A♥", "9♦"]), 21);
  assert.equal(handScore(["K♠", "Q♥", "2♦"]), 22);
});

test("xidach stand settles and credits a winning hand once", async () => {
  let finished, credited;
  const sessions = { async finish(_session, status, extra) { finished = { status, extra }; return true; } };
  const players = { async creditOnce(userId, amount, reference) { credited = { userId, amount, reference }; } };
  const game = new XiDachGame({ sessions, players, scheduler: {}, botId: "bot" });
  const session = {
    _id: "round", version: 0,
    data: { userId: "user", stake: "100", player: ["K♠", "Q♥"], dealer: ["9♠", "7♥"], deck: ["10♦"] },
  };
  const result = await game.stand(session, "user");
  assert.equal(result.outcome, "win");
  assert.equal(result.payout, "200");
  assert.equal(finished.status, "win");
  assert.equal(credited.amount, "200");
});

test("expired xidach sessions are refunded idempotently", async () => {
  let credits = 0;
  const session = { _id: "expired", data: { userId: "u", stake: "50" } };
  const game = new XiDachGame({
    botId: "bot", scheduler: {},
    sessions: { async expired() { return [session]; }, async finish() { return true; } },
    players: { async creditOnce() { credits++; } },
  });
  await game.refundExpired();
  assert.equal(credits, 1);
});
