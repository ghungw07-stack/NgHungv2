import assert from "node:assert/strict";
import test from "node:test";
import { parseDuration } from "../src-v2/modules/reminders/service.js";
import { cleanHost } from "../src-v2/modules/basic-tools/commands.js";

test("reminder duration accepts bounded human units", () => {
  assert.equal(parseDuration("10s"), 10_000);
  assert.equal(parseDuration("5m"), 300_000);
  assert.equal(parseDuration("2h"), 7_200_000);
  assert.equal(parseDuration("1d"), 86_400_000);
  assert.equal(parseDuration("5s"), null);
  assert.equal(parseDuration("31d"), null);
});

test("host parser strips URL paths without accepting malformed hosts", () => {
  assert.equal(cleanHost("https://example.com/a"), "example.com");
  assert.equal(cleanHost("example.com"), "example.com");
  assert.equal(cleanHost("%"), null);
});
