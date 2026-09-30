import test from "node:test";
import assert from "node:assert/strict";
import {
  getConversationText,
  serializeRecentGroupMessages,
  serializeConversationMessage,
  serializeConversationSummary,
} from "../src/web-service/conversation-view.js";

test("conversation view only exposes a compact safe message shape", () => {
  const message = serializeConversationMessage({
    botId: "bot-1",
    threadId: "user-1",
    msgId: "m1",
    uidFrom: "user-1",
    idTo: "bot-1",
    dName: "Người gửi",
    ts: 123,
    payload: JSON.stringify({
      msgType: "webchat",
      content: "xin chào",
      cookie: "không được trả ra web",
    }),
  }, "bot-1");

  assert.deepEqual(message, {
    id: "m1",
    threadId: "user-1",
    senderId: "user-1",
    senderName: "Người gửi",
    content: "xin chào",
    msgType: "webchat",
    conversationType: "direct",
    timestamp: 123,
    isSelf: false,
    isUndo: false,
    media: null,
  });
  assert.equal("cookie" in message, false);
});

test("conversation view identifies outgoing group messages and media", () => {
  const message = serializeConversationMessage({
    threadId: "group-1",
    msgId: "m2",
    uidFrom: "bot-1",
    idTo: "group-1",
    payload: {
      conversationType: 1,
      isSelf: true,
      msgType: "chat.photo",
      content: { title: "ảnh mới", href: "https://example.com/photo.jpg" },
    },
  }, "bot-1");
  assert.equal(message.isSelf, true);
  assert.equal(message.conversationType, "group");
  assert.equal(message.media.kind, "image");
  assert.equal(message.media.url, "https://example.com/photo.jpg");
});

test("conversation summaries retain the latest preview", () => {
  const summary = serializeConversationSummary({
    latest: { threadId: "u1", uidFrom: "u1", idTo: "bot", payload: { content: "hello" } },
    otherName: "Lan",
    messageCount: 4,
    conversationType: "direct",
  }, "bot");
  assert.equal(summary.title, "Lan");
  assert.equal(summary.lastMessage, "hello");
  assert.equal(summary.messageCount, 4);
  assert.equal(getConversationText({ msgType: "chat.voice", content: {} }), "[Tin nhắn thoại]");

  const group = serializeConversationSummary({
    latest: { threadId: "g1", uidFrom: "member", idTo: "g1", payload: { content: "hello group" } },
    otherName: "Tên một thành viên",
    conversationType: "group",
  }, "bot");
  assert.equal(group.title, "Nhóm g1");
});

test("missing wrapper type is not mistaken for a direct message", () => {
  const message = serializeConversationMessage({
    threadId: "group-old",
    uidFrom: "member",
    idTo: "group-old",
    msgWrapType: null,
    payload: { content: "tin nhóm cũ" },
  }, "bot");
  assert.equal(message.conversationType, null);
});

test("recent Zalo group messages are normalized without exposing raw session data", () => {
  const messages = serializeRecentGroupMessages(JSON.stringify({
    groupMsgs: [
      { msgId: "g1", uidFrom: "member-1", dName: "An", ts: 123, content: "xin chào", cookie: "secret" },
      { msgId: "g2", uidFrom: "0", ts: 124, content: "bot trả lời" },
    ],
  }), "bot-1", "group-1");

  assert.equal(messages.length, 2);
  assert.equal(messages[0].threadId, "group-1");
  assert.equal(messages[0].conversationType, "group");
  assert.equal(messages[0].senderName, "An");
  assert.equal(messages[0].content, "xin chào");
  assert.equal("cookie" in messages[0], false);
  assert.equal(messages[1].senderId, "bot-1");
  assert.equal(messages[1].isSelf, true);
});
