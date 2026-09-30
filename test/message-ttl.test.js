import assert from "node:assert/strict";
import test from "node:test";

import { resolveMessageTtl } from "../src/api-zalo/apis/sendMessage.js";

test("TTL mac dinh cua bot van uu tien voi tin nhan thong thuong", () => {
  assert.equal(resolveMessageTtl(300_000, 60_000), 300_000);
});

test("TTL tu web co the bo qua TTL mac dinh cua bot", () => {
  assert.equal(resolveMessageTtl(60_000, 300_000, false), 300_000);
  assert.equal(resolveMessageTtl(60_000, 0, false), 0);
});

test("TTL khong hop le duoc dua ve khong tu huy", () => {
  assert.equal(resolveMessageTtl(0, -1), 0);
  assert.equal(resolveMessageTtl(0, "invalid", false), 0);
});
