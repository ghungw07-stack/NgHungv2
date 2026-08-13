import assert from "node:assert/strict";
import test from "node:test";
import { CommandRegistry } from "../src-v2/core/commands/registry.js";
import { registerBotManagerCommands } from "../src-v2/modules/bot-manager/commands.js";

test("main leader can persist canonical blocked command for a child", async () => {
  let patch;
  const registry = new CommandRegistry().register({ name: "hello", aliases: ["hi"], execute() {} });
  const fleet = {
    resolveOwner: () => "owner", botStore: { get: () => ({}), async patch(id, value) { patch = [id, value]; } },
  };
  registerBotManagerCommands(registry, { fleet, identity: { isMain: true } });
  await registry.resolve("mybot").execute({ args: ["blockcmd", "1", "hi"], reply: async () => {} });
  assert.deepEqual(patch, ["owner", { notAllowedCommands: ["hello"] }]);
});
