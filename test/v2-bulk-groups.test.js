import assert from "node:assert/strict";
import test from "node:test";
import { exactConfirmation } from "../src-v2/modules/bulk-groups/commands.js";

test("destructive group actions require exact target confirmation", () => {
  assert.equal(exactConfirmation(["confirm", "123"], "123"), true);
  assert.equal(exactConfirmation(["confirm", "124"], "123"), false);
  assert.equal(exactConfirmation(["yes", "123"], "123"), false);
});
