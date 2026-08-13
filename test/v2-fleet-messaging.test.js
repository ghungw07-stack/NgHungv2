import assert from "node:assert/strict";
import test from "node:test";
import { CommandRegistry } from "../src-v2/core/commands/registry.js";
import { registerBotManagerCommands } from "../src-v2/modules/bot-manager/commands.js";

test("event.sendmsg broadcasts once per running child and builds local owner tags", async () => {
  const payloads = []; let output;
  const child = { identity: { isMain: false, ownerId: "123456" }, client: { api: { async sendMessage(payload) { payloads.push(payload); } } } };
  const fleet = { list() { return [{ identity: { isMain: true } }, child]; } };
  const registry = new CommandRegistry(); registerBotManagerCommands(registry, { fleet, identity: { isMain: true } });
  await registry.resolve("event.sendmsg").execute({ args: ["Bảo", "trì", "tag"], message: { data: { dName: "Hưng" } }, threadId: "g", type: 1, reply: async (value) => { output = value; } });
  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].msg, "Bảo trì @Hưng");
  assert.deepEqual(payloads[0].mentions, [{ uid: "123456", pos: 8, len: 5 }]);
  assert.match(output, /1\/1/);
});

test("pmreply updates live relay and persisted child setting", async () => {
  const relay = { enabled: true }; let patch;
  const fleet = { getByOwner() { return { runtime: { parentRelay: relay } }; }, botStore: { async patch(...args) { patch = args; } } };
  const registry = new CommandRegistry(); registerBotManagerCommands(registry, { fleet, identity: { isMain: false, ownerId: "owner" } });
  await registry.resolve("pmreply").execute({ args: ["off"], reply: async () => {} });
  assert.equal(relay.enabled, false);
  assert.deepEqual(patch, ["owner", { notifyParentPM: false }]);
});
