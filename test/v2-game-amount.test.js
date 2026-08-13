import assert from "node:assert/strict";
import test from "node:test";
import { formatMoney, parseAmount } from "../src-v2/modules/game/economy/amount.js";

test("game amounts support suffixes and all without number precision loss", () => {
  assert.equal(parseAmount("1.5m", "0").toFixed(0), "1500000");
  assert.equal(parseAmount("all", "999999999999999999999").toFixed(0), "999999999999999999999");
  assert.equal(formatMoney("12345678901234567890"), "12.345.678.901.234.567.890");
  assert.throws(() => parseAmount("-1", "0"), /không hợp lệ/);
});
