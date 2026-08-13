import assert from "node:assert/strict";
import test from "node:test";
import { CommandRegistry } from "../src-v2/core/commands/registry.js";
import { registerGroupCommands } from "../src-v2/modules/groups/commands.js";

test("kick protects group administrators", async () => {
  let called = false, output = "";
  const registry = new CommandRegistry();
  const client = { botId: "bot", api: { async removeUserFromGroup() { called = true; } } };
  const groups = { async info() { return { creatorId: "owner", adminIds: ["admin"] }; }, invalidate() {} };
  registerGroupCommands(registry, { groups, client });
  await registry.resolve("kick").execute({
    args: [], type: 1, threadId: "group",
    message: { data: { mentions: [{ uid: "admin" }] } },
    reply: async (text) => { output = text; },
  });
  assert.equal(called, false);
  assert.match(output, /Không thể thao tác/);
});
