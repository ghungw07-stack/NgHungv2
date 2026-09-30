import test from "node:test";
import assert from "node:assert/strict";
import { resolveGamePlayerAliasChain } from "../src/database/player-sync.js";

test("account reads follow every merged profile to the current balance and tier", () => {
  const aliases = new Map([["uid", "old"], ["old", "current"], ["current", "current"]]);
  assert.equal(resolveGamePlayerAliasChain("uid_0", aliases), "current");
  assert.equal(resolveGamePlayerAliasChain("current", aliases), "current");
  assert.equal(resolveGamePlayerAliasChain("unknown", aliases), "unknown");
  assert.equal(resolveGamePlayerAliasChain("private:bot:uid", new Map([
    ["private:bot:uid", "private:bot:current"],
  ])), "private:bot:current");
});

test("cyclic aliases fail instead of reading or updating an arbitrary wallet", () => {
  assert.throws(() => resolveGamePlayerAliasChain("a", new Map([["a", "b"], ["b", "a"]])), /Vòng lặp/);
});

