import test from "node:test";
import assert from "node:assert/strict";
import {
  isGroupMessageLogEnabled,
  shouldCacheIncomingMessage,
} from "../src/utils/message-routing.js";

test("group message logging is enabled by default and only disabled explicitly", () => {
  assert.equal(isGroupMessageLogEnabled(undefined), true);
  assert.equal(isGroupMessageLogEnabled("1"), true);
  assert.equal(isGroupMessageLogEnabled("0"), false);
});

test("group messages are cached when group logging is enabled", () => {
  assert.equal(shouldCacheIncomingMessage(1, 1, true), true);
  assert.equal(shouldCacheIncomingMessage(1, 1, false), false);
  assert.equal(shouldCacheIncomingMessage(0, 1, false), true);
});
