import assert from "node:assert/strict";
import test from "node:test";
import { dailyNumber } from "../src-v2/modules/fun/commands.js";

test("fun score is symmetric and stable for the same day", () => {
  assert.equal(dailyNumber("a", "b"), dailyNumber("b", "a"));
  assert.equal(dailyNumber("a", "b"), dailyNumber("a", "b"));
});
