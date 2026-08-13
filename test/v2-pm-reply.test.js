import assert from "node:assert/strict";
import test from "node:test";
import { CommandRegistry } from "../src-v2/core/commands/registry.js";
import { EventBus } from "../src-v2/core/events/event-bus.js";
import { registerPmReplyCommand } from "../src-v2/modules/pm-reply/commands.js";
import { registerPmReplyEvents } from "../src-v2/modules/pm-reply/events.js";

test("pmreply preserves set card show and toggle configuration", async () => {
  let value = {}; const settings = { async get() { return value; }, async patch(_scope, changes) { value = { ...value, ...changes }; } };
  const registry = new CommandRegistry(); registerPmReplyCommand(registry, { settings }); const command = registry.resolve("pmreply");
  await command.execute({ args: ["set", "Xin", "chào"], senderId: "123", reply: async () => {} });
  await command.execute({ args: ["card", "me", "Liên", "hệ"], senderId: "123", reply: async () => {} });
  await command.execute({ args: [], senderId: "123", reply: async () => {} });
  assert.equal(value.pmReplyMessage, "Xin chào"); assert.deepEqual(value.pmReplyCard, { id: "123", content: "Liên hệ" }); assert.equal(value.pmReplyEnabled, true);
});

test("pm reply event sends configured text and business card in direct messages", async () => {
  const calls = []; const bus = new EventBus({ error() {} });
  registerPmReplyEvents(bus, { settings: { async get() { return { pmReplyEnabled: true, pmReplyMessage: "Hello", pmReplyCard: { id: "123", content: "Card" } }; } }, client: { async sendText(...args) { calls.push(["text", ...args]); }, api: { async sendBusinessCard(...args) { calls.push(["card", ...args]); } } } });
  await bus.emit("message", { message: { type: 0, threadId: "user", data: {} } });
  assert.equal(calls[0][3], "Hello"); assert.equal(calls[1][2], "123");
});
