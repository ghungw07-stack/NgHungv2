import assert from "node:assert/strict";
import test from "node:test";
import { CommandRegistry } from "../src-v2/core/commands/registry.js";
import { registerMiniGameCommands } from "../src-v2/modules/game/mini-game/commands.js";

test("guess number persists progress and rewards winner once", async () => {
  let finished = 0, credited = 0, updated = 0;
  const session = { _id: "round", version: 0, data: { secret: 42, attempts: 0 } };
  const sessions = {
    async get() { return session; },
    async update() { updated++; },
    async finish() { finished++; return true; },
  };
  const players = { async creditOnce() { credited++; } };
  const registry = new CommandRegistry();
  registerMiniGameCommands(registry, { sessions, players });
  let output = "";
  await registry.resolve("doanso").execute({ args: ["30"], threadId: "g", senderId: "u", reply: async (text) => { output = text; } });
  assert.match(output, /lớn hơn/);
  assert.equal(updated, 1);
  await registry.resolve("doanso").execute({ args: ["42"], threadId: "g", senderId: "u", message: { data: {} }, reply: async (text) => { output = text; } });
  assert.match(output, /Chính xác/);
  assert.equal(finished, 1);
  assert.equal(credited, 1);
});

test("word chain enforces alternating players and matching syllables", async () => {
  let nextData;
  const session = { _id: "word", version: 0, data: { current: "hạnh phúc", used: ["hạnh phúc"], lastUserId: "a" } };
  const sessions = { async get() { return session; }, async update(_session, data) { nextData = data; } };
  const registry = new CommandRegistry();
  registerMiniGameCommands(registry, { sessions, players: {} });
  let output = "";
  await registry.resolve("noitu").execute({ args: ["phúc", "lợi"], threadId: "g", senderId: "b", reply: async (text) => { output = text; } });
  assert.match(output, /Hợp lệ/);
  assert.equal(nextData.current, "phúc lợi");
  assert.equal(nextData.lastUserId, "b");
});
