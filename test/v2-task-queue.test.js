import assert from "node:assert/strict";
import test from "node:test";
import { TaskQueue } from "../src-v2/core/task-queue.js";

test("closing task queue discards pending references and rejects new work", async () => {
  let release;
  const blocker = new Promise((resolve) => { release = resolve; });
  let pendingRan = false;
  const queue = new TaskQueue({ concurrency: 1, capacity: 10 });
  queue.add(() => blocker);
  queue.add(() => { pendingRan = true; });
  assert.equal(queue.stats.pending, 1);
  assert.equal(queue.close(), 1);
  assert.equal(queue.stats.pending, 0);
  assert.equal(queue.add(() => {}), false);
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pendingRan, false);
});
