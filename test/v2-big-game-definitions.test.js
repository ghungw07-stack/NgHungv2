import assert from "node:assert/strict";
import test from "node:test";
import { BIG_GAMES, resolveBigGame } from "../src-v2/modules/game/big-game/definitions.js";

test("big game definitions produce deterministic valid outcomes", () => {
  const bytes = Buffer.alloc(32, 7);
  const tx = BIG_GAMES.taixiu.roll(bytes);
  assert.deepEqual(tx.dice, [2, 2, 2]);
  assert.equal(tx.outcome, "bo-ba");
  assert.equal(BIG_GAMES.taixiu.multiplier("xiu", tx), 0);
  const chanle = BIG_GAMES.chanle.roll(bytes);
  assert.equal(chanle.outcome, "le");
  assert.equal(BIG_GAMES.chanle.multiplier("le", chanle), 2);
  assert.equal(BIG_GAMES.baucua.roll(bytes).faces.length, 3);
  assert.match(BIG_GAMES.duangua.roll(bytes).horse, /^[1-6]$/);
  assert.ok(["do", "den", "xanh"].includes(BIG_GAMES.roulette.roll(bytes).color));
  assert.ok(["chan", "le"].includes(BIG_GAMES.xocdia.roll(bytes).outcome));
  assert.ok(["player", "banker", "tie"].includes(BIG_GAMES.baccarat.roll(bytes).outcome));
});

test("big game aliases resolve to canonical names", () => {
  assert.equal(resolveBigGame("tx")[0], "taixiu");
  assert.equal(resolveBigGame("bc")[0], "baucua");
  assert.equal(resolveBigGame("bcr")[0], "baccarat");
});
