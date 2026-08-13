import assert from "node:assert/strict";
import test from "node:test";
import { ModerationService } from "../src-v2/modules/moderation/service.js";

function service(settings) {
  return new ModerationService({
    repository: { async get() { return settings; } }, client: {}, groups: {},
    isPrivileged: async () => false, logger: {},
  });
}

test("moderation detects configured media types without requiring text content", async () => {
  const result = await service({ antiVoice: true }).inspect({ type: 1, threadId: "g", data: { uidFrom: "u", msgType: "chat.voice", content: { href: "x" } } });
  assert.equal(result.reason, "voice");
});

test("moderation detects forwarded media and mass mentions", async () => {
  const forward = await service({ antiForward: true }).inspect({ type: 1, threadId: "g", data: { uidFrom: "u", msgType: "chat.photo", fwLvl: 1 } });
  assert.equal(forward.reason, "tin chuyển tiếp");
  const tag = await service({ antiTag: true }).inspect({ type: 1, threadId: "g", data: { uidFrom: "u", mentions: [{ uid: "-1" }] } });
  assert.equal(tag.reason, "tag hàng loạt");
});
