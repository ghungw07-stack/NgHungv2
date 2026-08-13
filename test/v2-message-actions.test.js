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

test("getlink preserves legacy href-only behavior", async () => {
  let output;
  const registry = new CommandRegistry();
  registerMessageActionCommands(registry, { client: {}, groups: {} });
  await registry.resolve("getlink").execute({
    message: { data: { quote: { content: "x https://ngh.dev/a", attach: JSON.stringify({ href: "https://zalo.me/1" }) } } },
    reply: async (text) => { output = text; },
  });
  assert.equal(output, "Link: https://zalo.me/1");
});

test("getmessage preserves legacy quoted field names", async () => {
  let output;
  const registry = new CommandRegistry();
  registerMessageActionCommands(registry, { client: {}, groups: {} });
  await registry.resolve("gmsg").execute({
    message: { data: { quote: { ownerId: "u1", cliMsgId: "m1", msg: "hello", attach: { value: "x".repeat(4_000) } } } },
    reply: async (text) => { output = text; },
  });
  assert.match(output, /ID Người Gửi: u1/);
  assert.match(output, /cliMsgId: m1/);
  assert.match(output, /Đính kèm:/);
});

test("quickmessage validates and sends normalized Zalo payload", async () => {
  let payload;
  const registry = new CommandRegistry();
  registerMessageActionCommands(registry, { client: { api: { async addQuickMessage(value) { payload = value; } } }, groups: {} });
  await registry.resolve("quickmessage").execute({
    content: '!quickmessage {"keyword":"ok","title":"Đồng ý"}', prefix: "!", reply: async () => {},
  });
  assert.deepEqual(payload, { keyword: "ok", title: "Đồng ý" });
});

test("undo preserves legacy quoted-message API call", async () => {
  let called = false;
  const registry = new CommandRegistry();
  registerMessageActionCommands(registry, { client: { botId: "bot", api: { async undoMessage() { called = true; } } }, groups: {} });
  await registry.resolve("undo").execute({ message: { data: { quote: { ownerId: "user" } } }, reply: async () => {} });
  assert.equal(called, true);
});

test("todo preserves underscore syntax and repeat count", async () => {
  const calls = [];
  const registry = new CommandRegistry();
  registerMessageActionCommands(registry, { client: { api: { async sendTodo(...args) { calls.push(args); } } }, groups: {} });
  await registry.resolve("todo").execute({
    content: "!todo_Kiểm tra hệ thống_2_123456", prefix: "!", message: { data: {} }, reply: async () => {},
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0][1], "Kiểm tra hệ thống");
  assert.deepEqual(calls[0][2], ["123456"]);
});

test("sendp preserves underscore syntax and repeat count", async () => {
  const calls = [];
  const registry = new CommandRegistry();
  registerMessageActionCommands(registry, { client: { api: { async sendMessageForward(...args) { calls.push(args); } } }, groups: {} });
  await registry.resolve("sendp").execute({ content: "!sendp_Xin chào_3_123456", prefix: "!", message: { data: {} }, reply: async () => {} });
  assert.equal(calls.length, 3);
  assert.equal(calls[0][0].msg, "Xin chào");
  assert.equal(calls[0][1], "123456");
});
