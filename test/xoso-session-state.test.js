import test from "node:test";
import assert from "node:assert/strict";

import { restoreXoSoSession, upsertXoSoHistory } from "../src/service-ngh/game-service/xoso-nhanh/session-state.js";

test("khôi phục nguyên vé cược của kỳ đang chạy sau restart", () => {
  const restored = restoreXoSoSession({
    sessionCode: 934,
    players: {
      player1: { username: "player1", bets: [{ type: "de", number: "27", amount: 10000 }] },
    },
    startTime: 1000,
    endTime: 2000,
    isRunning: true,
    notified15s: true,
  }, 933);

  assert.equal(restored.sessionCode, 934);
  assert.equal(restored.players.player1.bets[0].number, "27");
  assert.equal(restored.phase, "betting");
});

test("khôi phục kết quả và danh sách đã quyết toán để không trả hai lần", () => {
  const restored = restoreXoSoSession({
    sessionCode: 934,
    players: { player1: { bets: [] } },
    startTime: 1000,
    endTime: 2000,
    isRunning: true,
    phase: "settling",
    result: { db: "49027", de: "27", baCang: "027" },
    resultTimestamp: 1500,
    resultTimeStr: "10:58:07 24/9/2026",
    settledPlayerIds: ["player1", "player1"],
  }, 934);

  assert.equal(restored.result.db, "49027");
  assert.deepEqual(restored.settledPlayerIds, ["player1"]);
  assert.equal(restored.resultTimestamp, 1500);
});

test("không khôi phục phiên không chạy hoặc đã cũ", () => {
  assert.equal(restoreXoSoSession({ sessionCode: 10, isRunning: false }, 9), null);
  assert.equal(restoreXoSoSession({ sessionCode: 8, isRunning: true }, 9), null);
  assert.equal(restoreXoSoSession({ sessionCode: 9, isRunning: true, phase: "betting" }, 9), null);
});

test("ghi lịch sử cùng kỳ theo kiểu upsert, không nhân đôi khi quyết toán lại", () => {
  const history = [{ sessionCode: 934, de: "11" }, { sessionCode: 933, de: "08" }];
  assert.deepEqual(upsertXoSoHistory(history, { sessionCode: 934, de: "27" }, 20), [
    { sessionCode: 934, de: "27" },
    { sessionCode: 933, de: "08" },
  ]);
});
