import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateAdaptiveConcurrency,
  isRuntimeMemoryPressure,
} from "../src/utils/runtime-work-queue.js";

const MIB = 1024 * 1024;

test("RSS cao không bóp hàng đợi khi máy chủ vẫn còn nhiều bộ nhớ", () => {
  assert.equal(isRuntimeMemoryPressure({
    rss: 700 * MIB,
    rssLimit: 500 * MIB,
    freeMemoryRatio: 0.48,
  }), false);

  assert.equal(calculateAdaptiveConcurrency({
    current: 2,
    pendingCount: 210,
    activeCount: 2,
    eventLoopMs: 44,
    rss: 700 * MIB,
    rssLimit: 500 * MIB,
    freeMemoryRatio: 0.48,
    minimum: 2,
    baseline: 6,
    maximum: 8,
  }), 4);
});

test("hàng đợi vẫn giảm tải khi RSS cao và bộ nhớ máy chủ sắp hết", () => {
  assert.equal(isRuntimeMemoryPressure({
    rss: 700 * MIB,
    rssLimit: 500 * MIB,
    freeMemoryRatio: 0.15,
  }), true);

  assert.equal(calculateAdaptiveConcurrency({
    current: 8,
    pendingCount: 100,
    activeCount: 8,
    eventLoopMs: 25,
    rss: 700 * MIB,
    rssLimit: 500 * MIB,
    freeMemoryRatio: 0.15,
    minimum: 2,
    baseline: 6,
    maximum: 8,
  }), 4);
});

test("hàng đợi nhàn rỗi phục hồi dần về mức cơ sở", () => {
  assert.equal(calculateAdaptiveConcurrency({
    current: 2,
    pendingCount: 0,
    activeCount: 0,
    eventLoopMs: 25,
    rss: 650 * MIB,
    rssLimit: 500 * MIB,
    freeMemoryRatio: 0.5,
    minimum: 2,
    baseline: 6,
    maximum: 8,
  }), 3);
});
