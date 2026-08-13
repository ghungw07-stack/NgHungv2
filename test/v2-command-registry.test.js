import assert from "node:assert/strict";
import test from "node:test";
import { CommandRegistry } from "../src-v2/core/commands/registry.js";

test("registry resolves command aliases", () => {
  const registry = new CommandRegistry().register({ name: "status", aliases: ["uptime"], execute() {} });
  assert.equal(registry.resolve("UPTIME").name, "status");
  assert.equal(registry.list().length, 1);
});

test("registry rejects duplicate aliases", () => {
  const registry = new CommandRegistry().register({ name: "one", aliases: ["same"], execute() {} });
  assert.throws(() => registry.register({ name: "two", aliases: ["same"], execute() {} }), /Trùng command/);
});
