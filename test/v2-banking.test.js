import assert from "node:assert/strict";
import test from "node:test";
import { resolveBank } from "../src-v2/modules/banking/commands.js";

test("bank resolver accepts common names and raw BIN", () => {
  assert.deepEqual(resolveBank("VietinBank"), ["970415", "VIETINBANK"]);
  assert.deepEqual(resolveBank("970436"), ["970436", "970436"]);
  assert.equal(resolveBank("unknown"), null);
});
