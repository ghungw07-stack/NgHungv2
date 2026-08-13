import assert from "node:assert/strict";
import test from "node:test";
import { registerGroupEvents, renderGroupEventMessage } from "../src-v2/modules/group-events/events.js";

test("group event placeholders render without canvas", () => {
  assert.equal(renderGroupEventMessage("{user} vào {group}, thành viên {member}", { user: "@Hưng", group: "NGH", member: 10 }), "@Hưng vào NGH, thành viên 10");
});

test("updategroup handles setting event separately and persists snapshot", async () => {
  let handler;
  const sent = [];
  let patch;
  const eventBus = { on(_event, _name, fn) { handler = fn; } };
  registerGroupEvents(eventBus, {
    client: { sendText: async (...args) => sent.push(args), api: {} },
    settings: {
      async get() { return { updateGroup: true, updateGroupSnapshot: { lockSendMsg: 0 } }; },
      async patch(_threadId, value) { patch = value; },
    },
  });
  await handler({ group_event: { type: 5, threadId: "g", data: { groupSetting: { lockSendMsg: 1 } } } });
  assert.match(sent[0][2], /Khóa chat: Bật/);
  assert.deepEqual(patch.updateGroupSnapshot, { lockSendMsg: 1 });
});
