import assert from "node:assert/strict";
import test from "node:test";

test("child bot eligibility follows status and remaining time", () => {
  const canRun = (bot) => bot.status === "active" && (bot.timeRemaining === -1 || Number(bot.timeRemaining) > 0);
  assert.equal(canRun({ status: "active", timeRemaining: 1 }), true);
  assert.equal(canRun({ status: "active", timeRemaining: -1 }), true);
  assert.equal(canRun({ status: "inactive", timeRemaining: 100 }), false);
  assert.equal(canRun({ status: "active", timeRemaining: 0 }), false);
});
