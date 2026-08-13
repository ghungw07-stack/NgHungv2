import assert from "node:assert/strict";
import test from "node:test";
import { CommandRegistry } from "../src-v2/core/commands/registry.js";
import { registerBotManagerCommands } from "../src-v2/modules/bot-manager/commands.js";

test("mybot is unavailable on child bots", async () => {
  const registry = new CommandRegistry();
  registerBotManagerCommands(registry, { fleet: {}, identity: { isMain: false } });
  let output = "";
  await registry.resolve("mybot").execute({ args: ["list"], reply: async (text) => { output = text; } });
  assert.match(output, /chỉ chạy trên bot mẹ/i);
});

test("mybot list does not expose credentials", async () => {
  const registry = new CommandRegistry();
  const fleet = { listChildren: () => [{ index: 1, name: "Bot A", status: "online", timeRemaining: -1 }] };
  registerBotManagerCommands(registry, { fleet, identity: { isMain: true } });
  let output = "";
  await registry.resolve("mybot").execute({ args: ["list"], reply: async (text) => { output = text; } });
  assert.match(output, /Bot A/);
  assert.doesNotMatch(output, /cookie|imei/i);
});
