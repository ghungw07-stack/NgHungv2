import assert from "node:assert/strict";
import test from "node:test";

import { resolveWebImageInfo } from "../src/api-zalo/apis/sendImage.js";

test("web image metadata requests for the same URL are deduplicated and cached", async () => {
  let calls = 0;
  let finish;
  const loader = async () => {
    calls++;
    return await new Promise((resolve) => { finish = resolve; });
  };
  const url = `https://image.example.test/${Date.now()}.jpg`;
  const first = resolveWebImageInfo(url, loader);
  const second = resolveWebImageInfo(url, loader);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);

  finish({ width: 1280, height: 720, totalSize: 12345 });
  assert.deepEqual(await first, { width: 1280, height: 720, totalSize: 12345 });
  assert.deepEqual(await second, { width: 1280, height: 720, totalSize: 12345 });
  assert.deepEqual(await resolveWebImageInfo(url, loader), {
    width: 1280,
    height: 720,
    totalSize: 12345,
  });
  assert.equal(calls, 1);
});
