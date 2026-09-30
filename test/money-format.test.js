import test from "node:test";
import assert from "node:assert/strict";
import { formatCurrency } from "../src/utils/format-util.js";

test("định dạng tiền lớn theo Tỷ, Nghìn Tỷ và không hiện e", () => {
  assert.equal(formatCurrency("1000000000"), "1 Tỷ");
  assert.equal(formatCurrency("100000000000"), "100 Tỷ");
  assert.equal(formatCurrency("100000000000000"), "100 Nghìn Tỷ");
  assert.equal(formatCurrency("100000000000000000"), "100 Triệu Tỷ");
  assert.equal(formatCurrency("-1250000000000"), "-1,25 Nghìn Tỷ");
  assert.equal(formatCurrency("1234567890123456789012345678"), "1,23 Tỷ Tỷ Tỷ");
  assert.equal(formatCurrency(`1${"0".repeat(250)}`), "10 Triệu Tỷ²⁷");
  assert.equal(formatCurrency("999999999"), "999.999.999");
});
