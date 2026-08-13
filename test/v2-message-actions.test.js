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

test("getlink extracts nested links from a quoted attachment", async () => {
  let output;
  const registry = new CommandRegistry();
  registerMessageActionCommands(registry, { client: {}, groups: {} });
  await registry.resolve("getlink").execute({
    message: { data: { quote: { content: "x https://ngh.dev/a", attach: JSON.stringify({ href: "https://zalo.me/1" }) } } },
    reply: async (text) => { output = text; },
  });
  assert.match(output, /https:\/\/ngh\.dev\/a/);
  assert.match(output, /https:\/\/zalo\.me\/1/);
});

test("getmessage formats quoted metadata and clips large attachments", async () => {
  let output;
  const registry = new CommandRegistry();
  registerMessageActionCommands(registry, { client: {}, groups: {} });
  await registry.resolve("gmsg").execute({
    message: { data: { quote: { ownerId: "u1", cliMsgId: "m1", msg: "hello", attach: { value: "x".repeat(4_000) } } } },
    reply: async (text) => { output = text; },
  });
  assert.match(output, /UID: u1/);
  assert.match(output, /Message ID: m1/);
  assert.match(output, /đã rút gọn/);
  assert.ok(output.length < 4_500);
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

test("undo refuses quoted messages owned by another user", async () => {
  let called = false; let output;
  const registry = new CommandRegistry();
  registerMessageActionCommands(registry, { client: { botId: "bot", api: { async undoMessage() { called = true; } } }, groups: {} });
  await registry.resolve("undo").execute({ message: { data: { quote: { ownerId: "user" } } }, reply: async (value) => { output = value; } });
  assert.equal(called, false);
  assert.match(output, /chính bot/);
});

test("todo sends one task instead of a repeated spam loop", async () => {
  let call;
  const registry = new CommandRegistry();
  registerMessageActionCommands(registry, { client: { api: { async sendTodo(...args) { call = args; } } }, groups: {} });
  await registry.resolve("todo").execute({
    args: ["Kiểm", "tra", "hệ", "thống"], senderId: "123456", message: { data: {} }, reply: async () => {},
  });
  assert.equal(call[1], "Kiểm tra hệ thống");
  assert.deepEqual(call[2], ["123456"]);
});
