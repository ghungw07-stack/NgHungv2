import assert from "node:assert/strict";
import test from "node:test";
import { CommandRegistry } from "../src-v2/core/commands/registry.js";
import { registerMessageActionCommands } from "../src-v2/modules/message-actions/commands.js";

test("fakemsg builds synthetic quote and preserves requested tag", async () => {
  let sent;
  const registry = new CommandRegistry();
  registerMessageActionCommands(registry, {
    client: { api: { async sendMessage(...args) { sent = args; } } }, groups: {},
  });
  const content = "!fakemsg . | !game bank all | @Duc Hanh";
  await registry.resolve("fakemsg").execute({
    content, prefix: "!", threadId: "g", type: 1, reply: async () => {},
    message: { data: {
      quote: { uidFrom: "quoted", content: "old" },
      mentions: [{ uid: "target", pos: content.indexOf("@Duc"), len: 9 }],
    } },
  });
  assert.equal(sent[0].quote.data.uidFrom, "quoted");
  assert.equal(sent[0].quote.data.content, ".");
  assert.equal(sent[0].msg, "!game bank all @Duc Hanh");
  assert.deepEqual(sent[0].mentions, [{ uid: "target", pos: 15, len: 9 }]);
});

test("tagall uses Zalo all-members mention", async () => {
  let payload;
  const registry = new CommandRegistry();
  registerMessageActionCommands(registry, { client: { api: { async sendMessage(value) { payload = value; } } }, groups: {} });
  await registry.resolve("all").execute({ args: ["hello"], threadId: "g", type: 1, reply: async () => {} });
  assert.deepEqual(payload.mentions, [{ uid: "-1", pos: 0, len: 4 }]);
});
