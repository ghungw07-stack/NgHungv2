import test from "node:test";
import assert from "node:assert/strict";
import { isBankTransferLimitExempt } from "../src/service-ngh/game-service/bank-transfer-limits.js";

const base = {
  senderTierKey: "silver",
  receiverTierKey: "silver",
  senderRankPoints: 0,
  receiverRankPoints: 0,
  kimLongMin: 150000,
};

test("Overlord gửi không bị hạn mức nhận của hạng người khác", () => {
  assert.equal(isBankTransferLimitExempt({ ...base, senderTierKey: "overlord" }), true);
});

test("Overlord nhận không bị hạn mức gửi của hạng người khác", () => {
  assert.equal(isBankTransferLimitExempt({ ...base, receiverTierKey: "overlord" }), true);
});

test("giao dịch thường vẫn áp hạn mức và quyền Kim Long cũ vẫn hoạt động", () => {
  assert.equal(isBankTransferLimitExempt(base), false);
  assert.equal(isBankTransferLimitExempt({ ...base, senderRankPoints: 150000 }), true);
  assert.equal(isBankTransferLimitExempt({ ...base, receiverRankPoints: "150000" }), true);
});
