import assert from "node:assert/strict";
import test from "node:test";
import { CommandRegistry } from "../src-v2/core/commands/registry.js";
import { EventBus } from "../src-v2/core/events/event-bus.js";
import { registerAutoReplyCommands } from "../src-v2/modules/auto-reply/commands.js";
import { registerAutoReplyEvents } from "../src-v2/modules/auto-reply/events.js";

test("learn splits trigger and response at the explicit separator", async () => {
  let saved;
  const registry = new CommandRegistry();
  registerAutoReplyCommands(registry, { repository: { async set(...args) { saved = args; } }, settings: {} });
  await registry.resolve("learn").execute({ args: ["xin", "chào", "=>", "chào", "bạn"], threadId: "g", type: 1, senderId: "u", reply: async () => {} });
  assert.deepEqual(saved.slice(0, 3), ["g", "xin chào ", " chào bạn"]);
});

test("auto reply event ignores disabled groups and throttles duplicate triggers", async () => {
  const sent = []; const logger = { error() {} }; const eventBus = new EventBus(logger);
  let enabled = false;
  registerAutoReplyEvents(eventBus, {
    settings: { async get() { return { autoReplyEnabled: enabled }; } },
    repository: { async find() { return { trigger: "hi", response: "hello" }; } },
    client: { async sendText(...args) { sent.push(args); } },
  });
  const payload = { message: { type: 1, threadId: "g", data: { content: "hi" } } };
  await eventBus.emit("message", payload); enabled = true;
  await eventBus.emit("message", payload); await eventBus.emit("message", payload);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], ["g", 1, "hello"]);
});
