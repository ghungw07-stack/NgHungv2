import assert from "node:assert/strict";
import test from "node:test";
import { CommandRegistry } from "../src-v2/core/commands/registry.js";
import { groupIdsFromList, registerGroupCommands } from "../src-v2/modules/groups/commands.js";

test("group list parser supports current API response shapes", () => {
  assert.deepEqual(groupIdsFromList({ gridVerMap: { g1: "1", g2: "2" } }), ["g1", "g2"]);
  assert.deepEqual(groupIdsFromList({ data: { gridInfoMap: { g3: {} } } }), ["g3"]);
});

test("join refuses locked group before calling join API", async () => {
  let joined = false;
  const registry = new CommandRegistry();
  registerGroupCommands(registry, {
    groups: {},
    client: { api: { async getGroupInfoByLink() { return { setting: { lockSendMsg: 1 } }; }, async joinGroup() { joined = true; } } },
  });
  const replies = [];
  await registry.resolve("join").execute({ args: ["https://zalo.me/g/abc"], reply: async (text) => replies.push(text) });
  assert.equal(joined, false);
  assert.match(replies[0], /khóa chat/);
});

test("leave requires explicit confirmation", async () => {
  let left = false;
  const registry = new CommandRegistry();
  registerGroupCommands(registry, { groups: {}, client: { api: { async leaveGroup() { left = true; } } } });
  await registry.resolve("leave").execute({ args: [], threadId: "g", type: 1, reply: async () => {} });
  assert.equal(left, false);
});
