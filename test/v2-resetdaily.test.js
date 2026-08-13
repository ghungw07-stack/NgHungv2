import assert from "node:assert/strict";
import test from "node:test";
import { CommandRegistry } from "../src-v2/core/commands/registry.js";
import { registerEconomyCommands } from "../src-v2/modules/game/economy/commands.js";

test("resetdaily targets mentioned player and reports database counts", async () => {
  let target; let output;
  const players = { async resetDaily(value) { target = value; return { matched: 1, modified: 1 }; } };
  const registry = new CommandRegistry();
  registerEconomyCommands(registry, { players });
  await registry.resolve("resetdaily").execute({ args: [], message: { data: { mentions: [{ uid: "123456" }] } }, reply: async (value) => { output = value; } });
  assert.equal(target, "123456");
  assert.match(output, /thay đổi 1/);
});
