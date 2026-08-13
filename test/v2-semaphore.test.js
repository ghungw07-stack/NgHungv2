import assert from "node:assert/strict";
import test from "node:test";
import { Semaphore } from "../src-v2/core/semaphore.js";

test("semaphore limits concurrent heavy tasks", async () => {
  const semaphore = new Semaphore(2, 10);
  let active = 0, peak = 0;
  await Promise.all(Array.from({ length: 6 }, (_, index) => semaphore.run(async () => {
    active++; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return index;
  })));
  assert.equal(peak, 2);
  assert.deepEqual(semaphore.stats, { active: 0, waiting: 0 });
});
