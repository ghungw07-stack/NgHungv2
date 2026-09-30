import test from "node:test";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { createLotteryEngine } from "../src/service-ngh/game-service/ve-so/engine.js";
import { applyLotteryWallet } from "../src/service-ngh/game-service/ve-so/wallet.js";
import { PRIZES, TICKET_PRICE, DRAW_DURATION, drawLottery, ticketPrize, purchaseNumbers } from "../src/service-ngh/game-service/ve-so/rules.js";

const clone = structuredClone;
const player = { username: "alice", name: "Alice", botId: "bot", threadId: "group", type: 1 };

function fakeCollection(balance = 1_000_000_000_000) {
  const doc = { _id: "p1", username: "alice", idUserZalo: "u1", balance: String(balance) };
  return {
    doc,
    conflicts: 0,
    async findOne(filter) { return Object.entries(filter).every(([key, value]) => doc[key] === value) ? clone(doc) : null; },
    async updateOne(filter, update) {
      if (this.conflicts > 0) { this.conflicts--; return { modifiedCount: 0 }; }
      if (!Object.entries(filter).every(([key, value]) => isDeepStrictEqual(doc[key] ?? null, value))) return { modifiedCount: 0 };
      Object.assign(doc, clone(update.$set));
      return { modifiedCount: 1 };
    },
  };
}

function rig({ collection = fakeCollection(), initial } = {}) {
  const harness = { time: 1000, persisted: null, messages: [], drawCalls: 0, failSave: () => false, collection };
  harness.engine = createLotteryEngine({
    state: clone(initial || { nextCode: 1, current: null, history: [] }),
    now: () => harness.time,
    draw: () => { harness.drawCalls++; return drawLottery(() => 0); },
    save: state => {
      if (harness.failSave(state)) throw new Error("Disk unavailable");
      harness.persisted = clone(state);
    },
    wallet: operation => applyLotteryWallet(collection, operation),
    notify: async session => { harness.messages.push(clone(session)); },
  });
  return harness;
}

test("ticket pricing, prize values and random result widths", () => {
  assert.equal(TICKET_PRICE, 10_000_000_000);
  assert.equal(DRAW_DURATION, 60_000);
  assert.equal(PRIZES[0].amount, 500_000_000_000);
  const zero = drawLottery(() => 0);
  const maximum = drawLottery(limit => limit - 1);
  assert.equal(Object.values(zero).flat().length, 18);
  for (const prize of PRIZES) {
    assert.equal(zero[prize.key].length, prize.count);
    assert.ok(zero[prize.key].every(number => number === "0".repeat(prize.digits)));
    assert.ok(maximum[prize.key].every(number => number === "9".repeat(prize.digits)));
  }
  assert.equal(ticketPrize("000000", zero).key, "db");
  assert.equal(ticketPrize("123456", zero), null);
  for (const prize of PRIZES) {
    const result = drawLottery(() => 0);
    result[prize.key][0] = "123456".slice(-prize.digits);
    assert.equal(ticketPrize("123456", result).amount, prize.amount);
  }
  assert.equal(ticketPrize("100000", zero).key, "g1");
});

test("purchase parsing preserves leading zeros and rejects malformed quantities/numbers", () => {
  assert.deepEqual(purchaseNumbers("mua", [], () => 21), ["000021"]);
  assert.equal(purchaseNumbers("mua", ["100"]).length, 100);
  assert.deepEqual(purchaseNumbers("chon", ["000021,123456", "123456"]), ["000021", "123456", "123456"]);
  for (const args of [["0"], ["101"], ["-1"], ["1.5"], ["1e2"], ["2", "3"]]) {
    assert.throws(() => purchaseNumbers("mua", args));
  }
  for (const args of [[], ["21"], ["1234567"], ["12345x"], ["123456,"]]) {
    assert.throws(() => purchaseNumbers("chon", args));
  }
});

test("wallet retries conflicting updates and applies each debit/award once", async () => {
  const collection = fakeCollection(20_000_000_000);
  collection.conflicts = 2;
  const operation = { username: "alice", sessionId: "s", operationId: "buy", amount: -TICKET_PRICE };
  assert.equal((await applyLotteryWallet(collection, operation)).success, true);
  assert.equal((await applyLotteryWallet(collection, operation)).duplicate, true);
  const prize = { ...operation, operationId: "prize", amount: 500_000_000_000, cost: TICKET_PRICE };
  await applyLotteryWallet(collection, prize);
  await applyLotteryWallet(collection, prize);
  assert.equal(collection.doc.balance, "510000000000");
  assert.equal(collection.doc.totalGames, 1);
  assert.equal(collection.doc.totalWinGames, 1);
  assert.equal(collection.doc.totalWinnings, "490000000000");
});

test("insufficient funds never charge and concurrent requests cannot overdraw", async () => {
  const h = rig({ collection: fakeCollection(TICKET_PRICE) });
  const results = await Promise.allSettled([
    h.engine.buy(player, ["123456"], "request1"),
    h.engine.buy(player, ["234567"], "request2"),
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.match(results.find(result => result.status === "rejected").reason.message, /không đủ tiền/);
  assert.equal(h.collection.doc.balance, "0");
  assert.equal(h.engine.state.current.orders.filter(order => order.status === "paid").length, 1);
});

test("duplicate incoming message neither charges twice nor creates extra tickets", async () => {
  const h = rig();
  const a = await h.engine.buy(player, ["000000"], "msg1");
  const b = await h.engine.buy(player, ["123456"], "msg1");
  assert.equal(a.order.id, b.order.id);
  assert.equal(h.collection.doc.balance, "990000000000");
  assert.equal(h.engine.state.current.orders.length, 1);
});

test("an unaffordable purchase does not start the next player's countdown", async () => {
  const h = rig({ collection: fakeCollection(0) });
  await assert.rejects(h.engine.buy(player, ["123456"], "msg1"), /không đủ tiền/);
  h.time = 20_000;
  h.collection.doc.balance = String(TICKET_PRICE);
  const bought = await h.engine.buy(player, ["123456"], "msg2");
  assert.equal(bought.session.endsAt, 80_000);
});

test("draw occurs at 60 seconds, pays highest prize in full for every ticket, and does not repeat", async () => {
  const h = rig();
  await h.engine.buy(player, ["000000", "000000", "123456"], "msg1");
  h.time += DRAW_DURATION - 1;
  await h.engine.tick();
  assert.equal(h.drawCalls, 0);
  h.time++;
  await h.engine.tick();
  await h.engine.tick();
  assert.equal(h.drawCalls, 1);
  assert.equal(h.messages.length, 1);
  assert.equal(h.collection.doc.balance, "1970000000000");
  assert.equal(h.engine.state.current, null);
  assert.equal(h.engine.state.history[0].orders[0].payout, 1_000_000_000_000);
});

test("additional purchases do not extend a session; tickets at cutoff enter a new session", async () => {
  const h = rig();
  await h.engine.buy(player, ["123456"], "msg1");
  h.time += 30_000;
  await h.engine.buy(player, ["234567"], "msg2");
  assert.equal(h.engine.state.current.endsAt, 61_000);
  h.time = 61_000;
  const next = await h.engine.buy(player, ["345678"], "msg3");
  assert.equal(next.session.code, 2);
  assert.equal(next.session.endsAt, 121_000);
  assert.equal(h.messages.length, 1);
});

test("100 ticket cap is enforced across purchases before charging", async () => {
  const h = rig({ collection: fakeCollection(2_000_000_000_000) });
  await h.engine.buy(player, Array(100).fill("123456"), "msg1");
  await assert.rejects(h.engine.buy(player, ["123456"], "msg2"), /tối đa 100 vé/);
  assert.equal(h.collection.doc.balance, "1000000000000");
});

test("restart recovers a purchase interrupted after debit without charging again", async () => {
  const h = rig();
  h.failSave = state => state.current?.orders.some(order => order.status === "paid");
  await assert.rejects(h.engine.buy(player, ["000000"], "msg1"), /Disk unavailable/);
  assert.equal(h.persisted.current.orders[0].status, "pending");
  const recovered = rig({ collection: h.collection, initial: h.persisted });
  await recovered.engine.tick();
  assert.equal(recovered.collection.doc.balance, "990000000000");
  assert.equal(recovered.engine.state.current.orders[0].status, "paid");
  recovered.time = 61_000;
  await recovered.engine.tick();
  assert.equal(recovered.collection.doc.balance, "1490000000000");
});

test("restart during payout keeps original draw and does not pay twice", async () => {
  const h = rig();
  await h.engine.buy(player, ["000000"], "msg1");
  h.time = 61_000;
  h.failSave = state => state.current?.orders.some(order => order.status === "settled");
  await assert.rejects(h.engine.tick(), /Disk unavailable/);
  assert.equal(h.collection.doc.balance, "1490000000000");
  assert.equal(h.persisted.current.orders[0].status, "paid");
  const recovered = rig({ collection: h.collection, initial: h.persisted });
  recovered.time = 61_000;
  await recovered.engine.tick();
  assert.equal(recovered.drawCalls, 0);
  assert.equal(recovered.collection.doc.balance, "1490000000000");
  assert.equal(recovered.collection.doc.totalGames, 1);
  assert.equal(recovered.messages.length, 1);
});

test("storage failure before journaling a purchase cannot debit the wallet", async () => {
  const h = rig();
  h.failSave = () => true;
  await assert.rejects(h.engine.buy(player, ["000000"], "msg1"), /Disk unavailable/);
  await assert.rejects(h.engine.tick(), /Disk unavailable/);
  assert.equal(h.collection.doc.balance, "1000000000000");
});
