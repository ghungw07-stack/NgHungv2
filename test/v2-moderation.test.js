import assert from "node:assert/strict";
import test from "node:test";
import { ModerationService } from "../src-v2/modules/moderation/service.js";

function message(content, user = "user") {
  return { type: 1, threadId: "group", isSelf: false, data: { content, uidFrom: user } };
}

test("moderation detects links and ignores privileged users", async () => {
  const repository = { async get() { return { removeLinks: true }; } };
  const base = { repository, client: {}, groups: {}, logger: {} };
  const service = new ModerationService({ ...base, isPrivileged: async () => false });
  assert.equal((await service.inspect(message("https://example.com"))).reason, "liên kết");
  const privileged = new ModerationService({ ...base, isPrivileged: async () => true });
  assert.equal(await privileged.inspect(message("https://example.com")), null);
});

test("moderation detects configured normalized bad words", async () => {
  const service = new ModerationService({
    repository: { async get() { return { filterBadWords: true, badWords: ["đồ ngốc"] }; } },
    client: {}, groups: {}, logger: {}, isPrivileged: async () => false,
  });
  assert.equal((await service.inspect(message("DO NGOC quá"))).reason, "từ cấm");
});

test("moderation spam detector triggers on sixth message", async () => {
  const service = new ModerationService({
    repository: { async get() { return { antiSpam: true }; } },
    client: {}, groups: {}, logger: {}, isPrivileged: async () => false,
  });
  for (let index = 0; index < 5; index++) assert.equal(await service.inspect(message("x")), null);
  assert.equal((await service.inspect(message("x"))).reason, "spam");
});
