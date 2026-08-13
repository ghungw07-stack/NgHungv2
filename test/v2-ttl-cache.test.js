import assert from "node:assert/strict";
import test from "node:test";
import { TtlCache } from "../src-v2/core/ttl-cache.js";

test("ttl cache expires entries and stays bounded", () => {
  const cache = new TtlCache({ ttlMs: 10, maxSize: 2 });
  cache.add("a", 0);
  assert.equal(cache.has("a", 5), true);
  assert.equal(cache.has("a", 11), false);
  cache.add("b", 20);
  cache.add("c", 20);
  cache.add("d", 20);
  assert.ok(cache.size <= 2);
});
