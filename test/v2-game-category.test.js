import assert from "node:assert/strict";
import test from "node:test";
import { CommandRegistry } from "../src-v2/core/commands/registry.js";
import { registerEconomyCommands } from "../src-v2/modules/game/economy/commands.js";
import { registerBigGameCommands } from "../src-v2/modules/game/big-game/commands.js";

test("all economy and big-game commands are tagged for gameactive gating", () => {
  const registry = new CommandRegistry();
  registerEconomyCommands(registry, { players: {} });
  registerBigGameCommands(registry, { engine: {}, players: {} });
  for (const command of registry.list()) assert.equal(command.category, "game", command.name);
});
