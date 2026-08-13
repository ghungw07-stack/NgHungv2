import assert from "node:assert/strict";
import test from "node:test";
import { CommandRegistry } from "../src-v2/core/commands/registry.js";
import { registerPaymentCommands } from "../src-v2/modules/payments/commands.js";

test("child rental QR always renews its configured owner", async () => {
  let request;
  const registry = new CommandRegistry();
  registerPaymentCommands(registry, {
    qr: { async send(value) { request = value; } }, client: {},
    identity: { isMain: false, ownerId: "owner123" },
  });
  await registry.resolve("giahan").execute({ senderId: "other", threadId: "g", type: 1, reply: async () => {} });
  assert.equal(request.targetId, "owner123");
  assert.equal(request.kind, "BOTPAY");
});

test("main rental QR targets the requesting user", async () => {
  let request;
  const registry = new CommandRegistry();
  registerPaymentCommands(registry, {
    qr: { async send(value) { request = value; } }, client: {}, identity: { isMain: true },
  });
  await registry.resolve("thuebot").execute({ senderId: "user", threadId: "u", type: 0, reply: async () => {} });
  assert.equal(request.targetId, "user");
});
