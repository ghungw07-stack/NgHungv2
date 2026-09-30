import assert from "node:assert/strict";
import test from "node:test";
import { antiTagAll, clearAntiTagAllState, isTagAllMessage } from "../src/service-ngh/anti-service/anti-tag-all.js";

function makeMessage(mentions) {
  return {
    threadId: "group-1",
    type: 1,
    data: {
      uidFrom: "user-1",
      dName: "Người thử",
      mentions,
      cliMsgId: "cli-1",
      msgId: "msg-1",
    },
  };
}

test("anti tag-all detects only the all-members mention", () => {
  assert.equal(isTagAllMessage(makeMessage([{ uid: "-1" }])), true);
  assert.equal(isTagAllMessage(makeMessage([{ uid: "user-2" }])), false);
  assert.equal(isTagAllMessage(makeMessage([])), false);
});

test("anti tag-all warns twice and blocks on the third violation", async () => {
  clearAntiTagAllState();
  const sent = [];
  const blocked = [];
  const api = {
    getBotId: () => "bot-1",
    sendMessage: async (payload) => sent.push(payload),
    blockUsers: async (threadId, users) => blocked.push({ threadId, users }),
    deleteMessage: async () => ({ status: 0 }),
  };
  const settings = { "group-1": { antiTagAll: true, whiteList: {} } };

  for (let i = 0; i < 3; i++) {
    const handled = await antiTagAll(api, makeMessage([{ uid: -1 }]), false, settings, true, false);
    assert.equal(handled, true);
  }

  assert.equal(blocked.length, 1);
  assert.deepEqual(blocked[0], { threadId: "group-1", users: ["user-1"] });
  assert.match(sent[0].msg, /Cảnh cáo lần 1/);
  assert.match(sent[1].msg, /Cảnh cáo lần 2/);
  assert.match(sent[2].msg, /Đã chặn/);
});
