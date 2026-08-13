import assert from "node:assert/strict";
import test from "node:test";
import { CommandRegistry } from "../src-v2/core/commands/registry.js";
import { registerOperationCommands } from "../src-v2/modules/operations/commands.js";

function fixture() {
  const data = new Map();
  const settings = {
    async get(scope) { return data.get(String(scope)) || {}; },
    async patch(scope, changes) { const value = { ...(data.get(String(scope)) || {}), ...changes }; data.set(String(scope), value); return value; },
    async getPrefix() { return "!"; }, clear() {},
  };
  const registry = new CommandRegistry();
  registerOperationCommands(registry, { settings, adminStore: { reload() {} }, botId: "bot" });
  return { registry, data };
}

test("whitelist adds mentioned users without duplicates", async () => {
  const { registry, data } = fixture(); let reply;
  await registry.resolve("whitelist").execute({
    args: ["add"], threadId: "g", type: 1,
    message: { data: { mentions: [{ uid: "123456" }, { uid: "123456" }] } },
    reply: async (value) => { reply = value; },
  });
  assert.deepEqual(data.get("g").whitelistedUsers, ["123456"]);
  assert.match(reply, /1 người/);
});

test("ban and blockbot use separate group and global scopes", async () => {
  const { registry, data } = fixture();
  const context = { message: { data: {} }, reply: async () => {} };
  await registry.resolve("ban").execute({ ...context, args: ["add", "123456"], threadId: "g", type: 1 });
  await registry.resolve("blockbot").execute({ ...context, args: ["add", "789012"] });
  assert.deepEqual(data.get("g").bannedUsers, ["123456"]);
  assert.deepEqual(data.get("__global__").blockedUsers, ["789012"]);
});

test("privatebot persists legacy direct-message allow list globally", async () => {
  const { registry, data } = fixture(); let output;
  await registry.resolve("privatebot").execute({ args: ["add"], senderId: "123456", type: 0, message: { data: {} }, reply: async (value) => { output = value; } });
  assert.deepEqual(data.get("__global__").acceptedPrivateUsers, ["123456"]);
  assert.match(output, /Đã thêm/);
});
