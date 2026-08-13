import assert from "node:assert/strict";
import test from "node:test";
import { remainingLease } from "../src-v2/app/bot-fleet.js";

test("child bot eligibility follows status and remaining time", () => {
  const canRun = (bot) => bot.status === "active" && (bot.timeRemaining === -1 || Number(bot.timeRemaining) > 0);
  assert.equal(canRun({ status: "active", timeRemaining: 1 }), true);
  assert.equal(canRun({ status: "active", timeRemaining: -1 }), true);
  assert.equal(canRun({ status: "inactive", timeRemaining: 100 }), false);
  assert.equal(canRun({ status: "active", timeRemaining: 0 }), false);
});

test("lease remaining uses a fixed deadline and supports unlimited bots", () => {
  assert.equal(remainingLease({ timeRemaining: -1 }, 1000), -1);
  assert.equal(remainingLease({ timeRemaining: 999, leaseExpiresAt: 5000 }, 2000), 3000);
  assert.equal(remainingLease({ timeRemaining: 999, leaseExpiresAt: 1000 }, 2000), 0);
});
