import assert from "node:assert/strict";
import test from "node:test";
import { AdminStore } from "../src-v2/modules/admins/store.js";

test("admin store deduplicates IDs and updates shared config immediately", async () => {
  const data = { bot: ["1"] };
  const store = new AdminStore({ rootDir: "/tmp", data });
  store.save = async () => {};
  await store.set("bot", ["1", "2", "2"]);
  assert.deepEqual(data.bot, ["1", "2"]);
  assert.equal(store.isAdmin("bot", "2"), true);
});
