import assert from "node:assert/strict";
import test from "node:test";
import { CommandDispatcher } from "../src-v2/core/commands/dispatcher.js";
import { CommandRegistry } from "../src-v2/core/commands/registry.js";
import { Permission } from "../src-v2/core/permissions.js";

const logger = { error() {} };
test("dispatcher ignores normal messages", async () => {
  const dispatcher = new CommandDispatcher({ prefix: "!", registry: new CommandRegistry(), permissions: {}, logger });
  assert.equal(await dispatcher.dispatch({ content: "hello" }), false);
});
test("dispatcher checks permission before execute", async () => {
  let executed = false, reply = "";
  const registry = new CommandRegistry().register({ name: "secret", permission: Permission.LEADER, execute() { executed = true; } });
  const dispatcher = new CommandDispatcher({ prefix: "!", registry, permissions: { allows: () => false }, logger });
  assert.equal(await dispatcher.dispatch({ content: "!secret", senderId: "1", reply: async (text) => { reply = text; } }), true);
  assert.equal(executed, false);
  assert.match(reply, /không có quyền/i);
});
