import assert from "node:assert/strict";
import test from "node:test";
import { CommandRegistry } from "../src-v2/core/commands/registry.js";
import { registerEconomyCommands } from "../src-v2/modules/game/economy/commands.js";

test("ban and unban preserve legacy game-account scope", async () => {
  const calls = []; const players = { async setBanned(...args) { calls.push(args); return true; } };
  const registry = new CommandRegistry(); registerEconomyCommands(registry, { players }); const command = registry.resolve("ban");
  const base = { args: [], message: { data: { mentions: [{ uid: "123456" }] } }, reply: async () => {} };
  await command.execute({ ...base, invokedName: "ban" }); await command.execute({ ...base, invokedName: "unban" });
  assert.deepEqual(calls, [["123456", true], ["123456", false]]);
});
