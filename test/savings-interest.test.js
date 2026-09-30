import test from "node:test";
import assert from "node:assert/strict";

import { calculateOneNightSavingsInterest, calculateSavingsInterest, depositInterestDate } from "../src/service-ngh/game-service/savings-interest.js";

test("hiển thị đúng số tiền lãi dự kiến sau một đêm", () => {
  assert.equal(calculateOneNightSavingsInterest("1000000000000", { rate: 0.06 }).toString(), "60000000000");
  assert.equal(calculateOneNightSavingsInterest("101", { rate: 0.06 }).toString(), "6");
  assert.equal(calculateOneNightSavingsInterest("0", { rate: 0.6 }).toString(), "0");
});

test("ngân hàng chỉ cộng lãi khi qua 00:00 giờ Việt Nam", () => {
  const start = new Date("2026-01-01T10:00:00.000Z");
  const account = { principal: "1000000", lastInterestAt: start };

  const afterOneHour = calculateSavingsInterest(account, { rate: 0.06 }, new Date(start.getTime() + 3600000));
  assert.equal(afterOneHour.days, 0);
  assert.equal(afterOneHour.interest.toString(), "0");

  const afterVietnamMidnight = calculateSavingsInterest(account, { rate: 0.06 }, new Date("2026-01-01T17:00:01.000Z"));
  assert.equal(afterVietnamMidnight.principal.toString(), "1060000");
  assert.equal(afterVietnamMidnight.days, 1);
  assert.equal(afterVietnamMidnight.lastInterestAt.toISOString(), "2026-01-01T17:00:00.000Z");
});

test("ngân hàng bù đủ lãi các mốc 00:00 bị bỏ lỡ", () => {
  const result = calculateSavingsInterest(
    { principal: "1000000", lastInterestAt: new Date("2026-01-01T16:59:59.000Z") },
    { rate: 0.06 },
    new Date("2026-01-03T17:00:01.000Z")
  );
  assert.equal(result.days, 3);
  assert.equal(result.principal.toString(), "1191016");
});

test("tiền gửi thêm giữ mốc tính lãi 00:00 hiện tại", () => {
  const lastInterestAt = new Date("2026-01-01T17:00:00.000Z");
  assert.equal(
    depositInterestDate({ principal: "1000000", lastInterestAt }, "500000", new Date("2026-01-02T12:00:00.000Z")).toISOString(),
    lastInterestAt.toISOString()
  );
});

test("ngân hàng tự phục hồi mốc thời gian không hợp lệ", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const result = calculateSavingsInterest({ principal: "1000000", lastInterestAt: "invalid" }, { rate: 0.06 }, now);
  assert.equal(result.interest.toString(), "0");
  assert.equal(result.needsTimestampRepair, true);
  assert.equal(result.lastInterestAt.toISOString(), now.toISOString());
});
