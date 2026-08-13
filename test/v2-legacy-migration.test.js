import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLegacyGroupSettings } from "../src-v2/modules/migrations/legacy-migration.js";
import { GroupSettingsRepository } from "../src-v2/modules/group-settings/repository.js";

test("legacy moderation names are normalized without losing other settings", () => {
  const value = normalizeLegacyGroupSettings({ antigif: true, antiforward: true, antiPhotoVideo: true, welcomeGroup: true, updateGroupSnapshot: { secret: 1 } });
  assert.equal(value.antiGif, true);
  assert.equal(value.antiForward, true);
  assert.equal(value.antiPhoto, true);
  assert.equal(value.antiVideo, true);
  assert.equal(value.welcomeGroup, true);
  assert.equal(value.updateGroupSnapshot, undefined);
});

test("group settings repository recognizes direct legacy thread map", async () => {
  const collection = { async createIndex() {}, async findOne() { return null; } };
  const repository = new GroupSettingsRepository({
    database: { collection: () => collection }, botId: "bot", defaultPrefix: "!",
    legacySettings: { thread1: { prefix: ".", antiSpam: true } },
  });
  await repository.start();
  assert.equal(await repository.getPrefix("thread1"), ".");
  assert.equal((await repository.get("thread1")).antiSpam, true);
});
