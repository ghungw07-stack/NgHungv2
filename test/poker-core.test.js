import assert from "node:assert/strict";
import test from "node:test";
import { HAND_RANK, compareHands, evaluateBest } from "../src/service-ngh/game-service/mini-game/poker/poker-core.js";

const card = (rank, suit) => ({ rank, suit, value: Number(rank) || ({ J: 11, Q: 12, K: 13, A: 14 })[rank] });

test("poker evaluator recognizes royal flush and wheel straight", () => {
  const royal = evaluateBest(
    [card("A", "spade"), card("K", "spade")],
    [card("Q", "spade"), card("J", "spade"), card("10", "spade"), card("2", "heart"), card("3", "club")]
  );
  const wheel = evaluateBest(
    [card("A", "heart"), card("2", "club")],
    [card("3", "diamond"), card("4", "spade"), card("5", "heart"), card("K", "club"), card("9", "club")]
  );

  assert.equal(royal.result.rank, HAND_RANK.ROYAL_FLUSH);
  assert.equal(wheel.result.rank, HAND_RANK.STRAIGHT);
  assert.equal(wheel.result.tiebreaker[0], 5);
  assert.ok(compareHands(royal.result, wheel.result) > 0);
});
