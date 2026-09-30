import test from "node:test";
import assert from "node:assert/strict";

import {
  request,
  withZaloRequestPriority,
  withoutZaloRequestPriority,
} from "../src/api-zalo/utils.js";

test("interactive requests use reserved slots while cosmetic work stays normal", async () => {
  const started = [];
  const releases = [];
  const appContext = {
    cookie: "zpw_sek=test",
    userAgent: "test-agent",
    options: {
      polyfill: async (url) => {
        started.push(url);
        await new Promise((resolve) => releases.push(resolve));
        return { headers: { has: () => false } };
      },
    },
  };

  const normal = Array.from({ length: 11 }, (_, index) =>
    request(appContext, `https://example.test/normal-${index}`, {})
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(started.length, 10);

  const priority = withZaloRequestPriority(() =>
    request(appContext, "https://example.test/priority", {})
  );
  const cosmetic = withZaloRequestPriority(() =>
    withoutZaloRequestPriority(() => request(appContext, "https://example.test/cosmetic", {}))
  );
  await new Promise((resolve) => setImmediate(resolve));

  assert.ok(started.includes("https://example.test/priority"));
  assert.ok(!started.includes("https://example.test/cosmetic"));

  while (releases.length) releases.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  while (releases.length) releases.shift()();
  await Promise.all([...normal, priority, cosmetic]);
});
