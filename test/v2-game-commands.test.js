import assert from "node:assert/strict";
import test from "node:test";
import { CommandRegistry } from "../src-v2/core/commands/registry.js";
import { registerEconomyCommands } from "../src-v2/modules/game/economy/commands.js";

test("game menu preserves requested Vietnamese layout", async () => {
  const registry = new CommandRegistry();
  registerEconomyCommands(registry, { players: {} });
  let output = "";
  await registry.resolve("game").execute({ args: [], reply: async (text) => { output = text; } });
  assert.match(output, /MENU TRÒ CHƠI/);
  assert.match(output, /MiniGame/);
  assert.match(output, /BigGame/);
  assert.doesNotMatch(output, /DQT Bot/);
});

test("bank command reads Decimal-safe balance", async () => {
  const registry = new CommandRegistry();
  registerEconomyCommands(registry, { players: { async balance() { return "12345678901234567890"; } } });
  let output = "";
  await registry.resolve("bank").execute({ senderId: "u", message: { data: { dName: "User" } }, reply: async (text) => { output = text; } });
  assert.match(output, /12\.345\.678\.901\.234\.567\.890/);
});
