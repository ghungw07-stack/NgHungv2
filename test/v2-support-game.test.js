import assert from "node:assert/strict";
import test from "node:test";
import { CommandRegistry } from "../src-v2/core/commands/registry.js";
import { registerSupportGameCommand, resolveAction } from "../src-v2/modules/game/support/commands.js";

function fixture(admin = true) {
  let value = {};
  const settings = { async get() { return value; }, async patch(_id, changes) { value = { ...value, ...changes }; return value; } };
  const registry = new CommandRegistry();
  registerSupportGameCommand(registry, { settings, media: {}, client: {}, accessControl: { async allows() { return admin; } } });
  return { command: registry.resolve("supportgame"), get: () => value };
}

test("supportgame stores group-scoped codes and aliases", async () => {
  const item = fixture(); const context = { threadId: "g", type: 1, senderId: "admin", reply: async () => {} };
  await item.command.execute({ ...context, args: ["code", "add", "WELCOME2026"], command: item.command });
  await item.command.execute({ ...context, args: ["alias", "add", "code", "giftcode"], command: item.command });
  assert.deepEqual(item.get().supportGame.codes, ["WELCOME2026"]);
  assert.equal(resolveAction(item.get().supportGame, "giftcode"), "code");
});

test("supportgame prevents ordinary members from editing", async () => {
  const item = fixture(false); let output;
  await item.command.execute({ args: ["web", "set", "https://game.example"], threadId: "g", type: 1, senderId: "user", command: item.command, reply: async (value) => { output = value; } });
  assert.match(output, /không có quyền/);
  assert.equal(item.get().supportGame, undefined);
});
