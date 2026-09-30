import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { BotChildrenStore } from "../src/manager-bot/bot-children-store.js";

test("bot đã quét QR được khôi phục nếu danh sách tổng bị ghi đè", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ngh-bot-store-"));
  const file = path.join(dir, "manager-bots.json");
  const credentials = new Map([["123", { cookie: "stored-cookie", imei: "stored-imei" }]]);
  const vault = {
    getAll: async () => credentials,
    set: async (scope, id, value) => credentials.set(String(id), value),
    delete: async (scope, id) => credentials.delete(String(id)),
  };
  const store = new BotChildrenStore(file);
  await store.attachCredentialVault(vault);
  store.set("123", { ownerId: "123", idBot: "456", status: "active", timeRemaining: 100_000 });
  await store.setCredentials("123", { cookie: "stored-cookie", imei: "stored-imei" });
  assert.equal(store.saveIfDirty(), false);
  fs.writeFileSync(file, "{}\n");

  const restarted = new BotChildrenStore(file);
  restarted.load();
  await restarted.attachCredentialVault(vault);
  assert.equal(restarted.get("123").idBot, "456");
  assert.equal(restarted.get("123").status, "active");
});

test("bot đã cấp nhưng mất credential không thể xuất hiện lại khi load file cũ", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ngh-bot-store-"));
  const file = path.join(dir, "manager-bots.json");
  const staleBot = { ownerId: "old", idBot: "old-bot", status: "active" };
  const currentBot = { ownerId: "current", idBot: "current-bot", status: "active" };
  const pendingBot = { ownerId: "pending", status: "pending" };
  fs.writeFileSync(file, JSON.stringify({ old: staleBot, current: currentBot, pending: pendingBot }));

  const credentials = new Map([["current", { cookie: "encrypted-runtime-value" }]]);
  const vault = {
    getAll: async () => credentials,
    set: async (scope, id, value) => credentials.set(String(id), value),
    delete: async (scope, id) => credentials.delete(String(id)),
  };
  const store = new BotChildrenStore(file);
  store.load();
  await store.attachCredentialVault(vault);

  assert.deepEqual(Object.keys(store.getAll()).sort(), ["current", "pending"]);

  fs.writeFileSync(file, JSON.stringify({ old: staleBot, current: currentBot, pending: pendingBot }));
  store.load();
  assert.deepEqual(Object.keys(store.getAll()).sort(), ["current", "pending"]);
});

test("metadata bot con được giữ lại khi credential cũ chưa giải mã được", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ngh-bot-store-"));
  const file = path.join(dir, "manager-bots.json");
  fs.writeFileSync(file, JSON.stringify({
    child: { ownerId: "child", idBot: "child-bot", status: "active" },
  }));
  const vault = {
    // null nghĩa là bản ghi vẫn tồn tại nhưng không mở được bằng master key hiện tại.
    getAll: async () => new Map([["child", null]]),
    set: async () => {},
    delete: async () => {},
  };
  const store = new BotChildrenStore(file);
  store.load();
  await store.attachCredentialVault(vault);
  assert.equal(store.get("child").idBot, "child-bot");
});

test("bot đã xóa vĩnh viễn không sống lại dù metadata và credential cũ được phục hồi", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ngh-bot-store-"));
  const file = path.join(dir, "manager-bots.json");
  const removedFile = path.join(dir, "removed-bots.json");
  const staleBot = { ownerId: "old", idBot: "old-bot", status: "active" };
  fs.writeFileSync(file, JSON.stringify({ old: staleBot }));

  const credentials = new Map([["old", { cookie: "restored-credential" }]]);
  const vault = {
    getAll: async () => credentials,
    set: async (scope, id, value) => credentials.set(String(id), value),
    delete: async (scope, id) => credentials.delete(String(id)),
  };
  const store = new BotChildrenStore(file, removedFile);
  store.load();
  await store.attachCredentialVault(vault);
  await store.delete("old");
  store.saveIfDirty();

  fs.writeFileSync(file, JSON.stringify({ old: staleBot }));
  credentials.set("old", { cookie: "restored-again" });

  const restartedStore = new BotChildrenStore(file, removedFile);
  restartedStore.load();
  await restartedStore.attachCredentialVault(vault);

  assert.deepEqual(restartedStore.getAll(), {});
  assert.equal(credentials.has("old"), false);
  assert.throws(() => restartedStore.set("old", staleBot), /đã bị xóa vĩnh viễn/);
});

test("dấu xóa trong Mongo chặn bot sống lại khi cả hai file JSON bị phục hồi", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ngh-bot-store-"));
  const file = path.join(dir, "manager-bots.json");
  const removedFile = path.join(dir, "removed-bots.json");
  const staleBot = { ownerId: "old", idBot: "old-bot", status: "active" };
  fs.writeFileSync(file, JSON.stringify({ old: staleBot }));

  const removedOwners = new Set();
  const removedBots = new Set();
  const credentials = new Map([["old", { cookie: "restored", imei: "imei" }]]);
  const vault = {
    getAll: async () => credentials,
    set: async (scope, id, value) => credentials.set(String(id), value),
    delete: async (scope, id) => credentials.delete(String(id)),
    getRemovedBots: async () => ({ ownerIds: removedOwners, botIds: removedBots }),
    markBotRemoved: async (ownerId, botId) => {
      if (ownerId) removedOwners.add(String(ownerId));
      if (botId) removedBots.add(String(botId));
    },
  };

  const store = new BotChildrenStore(file, removedFile);
  store.load();
  await store.attachCredentialVault(vault);
  await store.delete("old");
  store.saveIfDirty();

  fs.writeFileSync(file, JSON.stringify({ old: staleBot }));
  fs.writeFileSync(removedFile, JSON.stringify({ ownerIds: [], botIds: [] }));
  credentials.set("old", { cookie: "restored-again", imei: "imei" });

  const restartedStore = new BotChildrenStore(file, removedFile);
  restartedStore.load();
  await restartedStore.attachCredentialVault(vault);

  assert.deepEqual(restartedStore.getAll(), {});
  assert.equal(credentials.has("old"), false);
});

test("người dùng có thể chủ động tạo lại bot đã xóa vĩnh viễn", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ngh-bot-store-"));
  const file = path.join(dir, "manager-bots.json");
  const removedFile = path.join(dir, "removed-bots.json");
  const removedOwners = new Set();
  const removedBots = new Set();
  const credentials = new Map([["old", { cookie: "old-cookie", imei: "old-imei" }]]);
  const vault = {
    getAll: async () => credentials,
    set: async (scope, id, value) => credentials.set(String(id), value),
    delete: async (scope, id) => credentials.delete(String(id)),
    getRemovedBots: async () => ({ ownerIds: removedOwners, botIds: removedBots }),
    markBotRemoved: async (ownerId, botId) => {
      if (ownerId) removedOwners.add(String(ownerId));
      if (botId) removedBots.add(String(botId));
    },
    unmarkBotRemoved: async (ownerId, botId) => {
      if (ownerId) removedOwners.delete(String(ownerId));
      if (botId) removedBots.delete(String(botId));
    },
  };

  fs.writeFileSync(file, JSON.stringify({
    old: { ownerId: "old", idBot: "old-bot", status: "active" },
  }));
  const store = new BotChildrenStore(file, removedFile);
  store.load();
  await store.attachCredentialVault(vault);
  await store.delete("old");
  store.saveIfDirty();

  assert.equal(await store.allowRecreate("old"), true);
  store.set("old", { ownerId: "old", status: "pending", recreatedAfterRemoval: true });
  await store.setCredentials("old", { cookie: "new-cookie", imei: "new-imei" });
  await store.allowRecreate("old", "old-bot");
  Object.assign(store.get("old"), { idBot: "old-bot", status: "active" });
  delete store.get("old").recreatedAfterRemoval;
  store.markDirty();
  store.saveIfDirty();

  const restartedStore = new BotChildrenStore(file, removedFile);
  restartedStore.load();
  await restartedStore.attachCredentialVault(vault);

  assert.equal(restartedStore.get("old").idBot, "old-bot");
  assert.equal(credentials.get("old").cookie, "new-cookie");
  assert.equal(removedOwners.has("old"), false);
  assert.equal(removedBots.has("old-bot"), false);
});
