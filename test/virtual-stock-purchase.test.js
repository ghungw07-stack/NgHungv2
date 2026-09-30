import assert from "node:assert/strict";
import test from "node:test";

import { calculatePurchaseQuote } from "../src/service-ngh/game-service/cophieuao/purchase-quote.js";

test("báo giá mua cổ phiếu không lặp theo từng cổ phiếu", () => {
  const quote = calculatePurchaseQuote("1000000", "1000000", 7500);

  assert.equal(quote.qty, 132);
  assert.equal(quote.cost.toString(), "992970");
});

test("từ chối số lượng vượt giới hạn số nguyên an toàn", () => {
  assert.throws(
    () => calculatePurchaseQuote("900719925474099100000", "900719925474099100000", 7500),
    /giới hạn an toàn/u
  );
});
