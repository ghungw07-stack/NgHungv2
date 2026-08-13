import assert from "node:assert/strict";
import test from "node:test";
import { GroupSettingsRepository } from "../src-v2/modules/group-settings/repository.js";

function databaseWith(doc = null) {
  const collection = {
    async createIndex() {},
    async findOne() { return doc; },
    async findOneAndUpdate(filter, update) { doc = { ...filter, ...(doc || {}), ...update.$set }; return doc; },
  };
  return { collection: () => collection };
}

test("group settings falls back to legacy data and persists patches", async () => {
  const repository = new GroupSettingsRepository({
    database: databaseWith(), botId: "bot", defaultPrefix: "!",
    legacySettings: { bot: { group: { prefix: "." } } },
  });
  await repository.start();
  assert.equal(await repository.getPrefix("group"), ".");
  await repository.patch("group", { prefix: "#" });
  assert.equal(await repository.getPrefix("group"), "#");
});
