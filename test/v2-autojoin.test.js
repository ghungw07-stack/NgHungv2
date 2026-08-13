import assert from "node:assert/strict";
import test from "node:test";
import { isGroupChatLocked, normalizeGroupLink } from "../src-v2/modules/autojoin/service.js";
import { registerAutoJoinEvents } from "../src-v2/modules/autojoin/events.js";

test("autojoin normalizes only supported Zalo group links", () => {
  assert.equal(normalizeGroupLink("x https://zaloapp.com/qr/g/AbC123 y"), "https://zalo.me/g/AbC123");
  assert.equal(normalizeGroupLink("https://example.com/g/abc"), null);
});

test("autojoin identifies locked chat across API response shapes", () => {
  assert.equal(isGroupChatLocked({ setting: { lockSendMsg: 1 } }), true);
  assert.equal(isGroupChatLocked({ data: { setting: { lockSendMsg: "1" } } }), true);
  assert.equal(isGroupChatLocked({ setting: { lockSendMsg: 0 } }), false);
});

test("autojoin event silently queues links only when enabled", async () => {
  let handler;
  const eventBus = { on(_event, _name, callback) { handler = callback; } };
  const links = [];
  registerAutoJoinEvents(eventBus, {
    settings: { async get(threadId) { return { autoJoinGroup: threadId === "enabled" }; } },
    service: { async enqueue(link) { links.push(link); } },
  });
  await handler({ message: { threadId: "disabled", data: { content: "https://zalo.me/g/nope" } } });
  await handler({ message: { threadId: "enabled", data: { content: "vào https://zalo.me/g/ok123" } } });
  assert.deepEqual(links, ["https://zalo.me/g/ok123"]);
});
