import assert from "node:assert/strict";
import test from "node:test";
import { undoMessageId } from "../src-v2/modules/message-archive/events.js";

test("message archive resolves original ID from undo payload shapes", () => {
  assert.equal(undoMessageId({ data: { content: { globalMsgId: "123" } } }), "123");
  assert.equal(undoMessageId({ data: { content: JSON.stringify({ globalMsgId: "456" }) } }), "456");
  assert.equal(undoMessageId({ data: { content: "invalid" } }), null);
});
