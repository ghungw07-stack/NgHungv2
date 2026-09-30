import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateGameLoanAccrual,
  calculateGameLoanLimit,
  collectGameLoan,
  GAME_LOAN_HOURLY_RATE,
} from "../src/service-ngh/game-service/game-loan.js";

test("vay 1 triệu phát sinh đúng 100 nghìn lãi mỗi giờ", () => {
  const createdAt = new Date("2026-09-22T00:00:00.000Z");
  const result = calculateGameLoanAccrual({
    principalRemaining: "1000000",
    interestOutstanding: "0",
    createdAt,
    lastAccruedAt: createdAt,
  }, new Date("2026-09-22T03:15:00.000Z"));
  assert.equal(GAME_LOAN_HOURLY_RATE.toString(), "0.1");
  assert.equal(result.elapsedHours, 3);
  assert.equal(result.addedInterest.toString(), "300000");
  assert.equal(result.debt.toString(), "1300000");
});

test("hạn mức vay dùng cả tài sản và lịch sử chơi", () => {
  const active = calculateGameLoanLimit({
    balance: "1000000",
    totalWinnings: "10000000",
    totalLosses: "5000000",
    totalGames: 20,
    totalWinGames: 12,
  }, "1000000", "3000000000");
  assert.equal(active.limit.toString(), "2700000000");

  const newPlayer = calculateGameLoanLimit({ balance: "10000", totalGames: 0 }, "0");
  assert.equal(newPlayer.limit.toString(), "0");
});

test("ngân hàng quyết định khoản vay đúng 90% Daily", () => {
  const offer = calculateGameLoanLimit({ balance: "2000000", totalGames: 0 }, "0", "40000000000000");
  assert.equal(offer.limit.toString(), "36000000000000");
});

test("tự thu nợ ưu tiên lãi rồi mới trừ gốc và lưu số đã trả", async () => {
  const createdAt = new Date("2026-09-22T00:00:00.000Z");
  const docs = {
    game_loans: [{
      _id: "loan-1", playerId: "P1", status: "active", principal: "1000000",
      principalRemaining: "1000000", interestOutstanding: "0", totalPaid: "0",
      totalInterestPaid: "0", totalPrincipalPaid: "0", totalInterestCharged: "0",
      createdAt, lastAccruedAt: createdAt, collectionStartsAt: new Date(createdAt.getTime() + 3600000),
    }],
    players: [{ _id: "player-1", idUserZalo: "P1", balance: "500000" }],
    game_savings_accounts: [],
    game_loan_transactions: [],
  };
  const matches = (doc, filter) => Object.entries(filter).every(([key, value]) => doc[key] === value);
  const db = { collection(name) { return {
    async findOne(filter) { return docs[name].find((doc) => matches(doc, filter)) || null; },
    async updateOne(filter, update) {
      const doc = docs[name].find((item) => matches(item, filter));
      if (!doc) return { modifiedCount: 0 };
      Object.assign(doc, update.$set || {});
      for (const key of Object.keys(update.$unset || {})) delete doc[key];
      return { modifiedCount: 1 };
    },
    async insertOne(doc) { docs[name].push(doc); return { insertedId: docs[name].length }; },
  }; } };

  const result = await collectGameLoan(db, "players", "P1", new Date("2026-09-22T02:00:00.000Z"));
  assert.equal(result.collected, "500000");
  assert.equal(result.interestAfter, "0");
  assert.equal(result.principalAfter, "700000");
  assert.equal(result.debt, "700000");
  assert.equal(result.totalInterestPaid, "200000");
  assert.equal(result.totalPrincipalPaid, "300000");
  assert.equal(docs.players[0].balance, "0");
  assert.equal(docs.game_loan_transactions[0].type, "repayment");
});
