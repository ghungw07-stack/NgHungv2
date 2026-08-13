import test from "node:test";
import assert from "node:assert/strict";

import {
  BARE_PREFIX_COOLDOWN_MS,
  canUseBarePrefix,
  resetBarePrefixCooldown,
} from "../src/utils/bare-prefix-cooldown.js";

test("prefix không kèm lệnh chỉ được xử lý một lần mỗi 15 giây", () => {
  resetBarePrefixCooldown();

  assert.equal(canUseBarePrefix("bot-1", "user-1", 1_000), true);
  assert.equal(canUseBarePrefix("bot-1", "user-1", 1_001), false);
  assert.equal(canUseBarePrefix("bot-1", "user-1", 1_000 + BARE_PREFIX_COOLDOWN_MS - 1), false);
  assert.equal(canUseBarePrefix("bot-1", "user-1", 1_000 + BARE_PREFIX_COOLDOWN_MS), true);
});

test("cooldown tách riêng theo bot và người dùng", () => {
  resetBarePrefixCooldown();

  assert.equal(canUseBarePrefix("bot-1", "user-1", 1_000), true);
  assert.equal(canUseBarePrefix("bot-1", "user-2", 1_001), true);
  assert.equal(canUseBarePrefix("bot-2", "user-1", 1_001), true);
});
