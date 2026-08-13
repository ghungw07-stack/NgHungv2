import assert from "node:assert/strict";
import test from "node:test";
import { CommandDispatcher } from "../src-v2/core/commands/dispatcher.js";
import { CommandRegistry } from "../src-v2/core/commands/registry.js";
import { registerCommandManagerCommands } from "../src-v2/modules/command-manager/commands.js";

const logger = { error() {} };

test("dispatcher enforces per-user command cooldown", async () => {
  let calls = 0;
  const registry = new CommandRegistry().register({ name: "slow", cooldownMs: 10_000, execute() { calls++; } });
  const replies = [];
  const dispatcher = new CommandDispatcher({ prefix: "!", registry, permissions: { allows: () => true }, logger });
  const context = { content: "!slow", senderId: "u", threadId: "g", reply: async (text) => replies.push(text) };
  await dispatcher.dispatch(context);
  await dispatcher.dispatch(context);
  assert.equal(calls, 1);
  assert.match(replies[0], /chờ 10 giây/);
});

test("setcmd stores canonical command name even when alias is used", async () => {
  let changes;
  const settings = { async get() { return { disabledCommands: [] }; }, async patch(_id, value) { changes = value; } };
  const registry = new CommandRegistry().register({ name: "hello", aliases: ["hi"], execute() {} });
  registerCommandManagerCommands(registry, { settings });
  await registry.resolve("setcmd").execute({ args: ["off", "hi"], threadId: "g", reply: async () => {} });
  assert.deepEqual(changes.disabledCommands, ["hello"]);
});

test("dispatcher blocks disabled commands before execution", async () => {
  let calls = 0;
  const registry = new CommandRegistry().register({ name: "x", execute() { calls++; } });
  const replies = [];
  const dispatcher = new CommandDispatcher({
    prefix: "!", registry, permissions: { allows: () => true }, logger,
    commandEnabledResolver: async () => false,
  });
  await dispatcher.dispatch({ content: "!x", senderId: "u", threadId: "g", reply: async (text) => replies.push(text) });
  assert.equal(calls, 0);
  assert.match(replies[0], /đang bị tắt/);
});
