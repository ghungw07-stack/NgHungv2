import assert from "node:assert/strict";
import test from "node:test";
import { PaymentService } from "../src-v2/modules/payments/service.js";

function fakeDatabase() {
  const references = new Set();
  return { collection() { return {
    async createIndex() {},
    async insertOne(doc) { if (references.has(doc.reference)) { const error = new Error("duplicate"); error.code = 11000; throw error; } references.add(doc.reference); },
    async updateOne() {},
  }; } };
}

test("payment parser accepts inbound BOTPAY and rejects missing references", () => {
  const service = new PaymentService({ database: fakeDatabase(), botStore: {}, fleet: {}, logger: {} });
  assert.deepEqual(
    service.parse({ transferAmount: 80000, content: "BOTPAY 123", referenceCode: "ref", transferType: "in" }),
    { kind: "BOTPAY", targetId: "123", amount: "80000", reference: "ref", raw: { transferAmount: 80000, content: "BOTPAY 123", referenceCode: "ref", transferType: "in" } }
  );
  assert.equal(service.parse({ transferAmount: 80000, content: "OTHER", referenceCode: "ref" }), null);
  assert.throws(() => service.parse({ transferAmount: 80000, content: "BOTPAY 123" }), /Thiếu mã/);
});

test("bot payment is idempotent and renews for 30 days per 80k", async () => {
  const bot = { status: "inactive", timeRemaining: 0 };
  const botStore = { get: () => bot, async patch(_id, changes) { Object.assign(bot, changes); } };
  const fleet = { list: () => [] };
  const service = new PaymentService({ database: fakeDatabase(), botStore, fleet, logger: {} });
  await service.start();
  const body = { transferAmount: 80000, content: "BOTPAY 123", referenceCode: "same" };
  const first = await service.process(body);
  const second = await service.process(body);
  assert.equal(first.success, true);
  assert.equal(first.durationMs, 30 * 86_400_000);
  assert.equal(bot.status, "inactive");
  assert.equal(second.duplicate, true);
});
