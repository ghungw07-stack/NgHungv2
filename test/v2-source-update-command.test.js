import assert from "node:assert/strict";
import test from "node:test";
import { CommandRegistry } from "../src-v2/core/commands/registry.js";
import { Permission } from "../src-v2/core/permissions.js";
import { registerSourceUpdateCommand } from "../src-v2/modules/source-update/commands.js";

test("updatecode exists only on main bot and requires leader", async () => {
  const child = new CommandRegistry();
  registerSourceUpdateCommand(child, { updater: {}, identity: { isMain: false } });
  assert.equal(child.resolve("updatecode"), undefined);

  const main = new CommandRegistry();
  registerSourceUpdateCommand(main, { updater: { async push() { return { ok: true, message: "done" }; } }, identity: { isMain: true } });
  assert.equal(main.resolve("github").permission, Permission.LEADER);
  const replies = [];
  await main.resolve("github").execute({ args: ["mô", "tả"], reply: async (text) => replies.push(text) });
  assert.deepEqual(replies, ["Đang kiểm tra và cập nhật code...", "done"]);
});
