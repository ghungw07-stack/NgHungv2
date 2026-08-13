import assert from "node:assert/strict";
import test from "node:test";
import { EventBus } from "../src-v2/core/events/event-bus.js";

test("event bus respects priority and stop propagation", async () => {
  const calls = [];
  const bus = new EventBus({ error() {} });
  bus.on("message", "last", () => calls.push("last"), { priority: 0 });
  bus.on("message", "first", () => { calls.push("first"); return { stop: true }; }, { priority: 10 });
  await bus.emit("message", {});
  assert.deepEqual(calls, ["first"]);
});

test("event handler errors are isolated", async () => {
  let completed = false;
  const bus = new EventBus({ error() {} });
  bus.on("message", "broken", () => { throw new Error("boom"); }, { priority: 10 });
  bus.on("message", "healthy", () => { completed = true; });
  await bus.emit("message", {});
  assert.equal(completed, true);
});
