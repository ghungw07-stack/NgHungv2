import assert from "node:assert/strict";
import test from "node:test";
import { timingSafeEqual } from "../src-v2/web/auth.js";
import { FixedWindowRateLimiter } from "../src-v2/core/rate-limiter.js";
import { WebServer } from "../src-v2/web/server.js";

test("web secrets use length-safe constant comparison", () => {
  assert.equal(timingSafeEqual("secret", "secret"), true);
  assert.equal(timingSafeEqual("secret", "wrong"), false);
  assert.equal(timingSafeEqual("a", "much-longer"), false);
});

test("web rate limiter resets and stays bounded", () => {
  const limiter = new FixedWindowRateLimiter({ limit: 2, windowMs: 1000, maxKeys: 2 });
  assert.equal(limiter.consume("ip", 0).allowed, true);
  assert.equal(limiter.consume("ip", 1).allowed, true);
  assert.equal(limiter.consume("ip", 2).allowed, false);
  assert.equal(limiter.consume("ip", 1001).allowed, true);
});

test("v2 web server exposes a minimal health endpoint", async (t) => {
  const web = new WebServer({
    fleet: { list: () => [], listChildren: () => [] }, scheduler: { size: 0 }, payments: {},
    logger: { info() {}, error() {} }, port: 0, host: "127.0.0.1",
  });
  try { await web.start(); }
  catch (error) {
    if (error.code === "EPERM") { t.skip("Sandbox không cho phép mở cổng local"); return; }
    throw error;
  }
  try {
    const port = web.server.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "ok");
  } finally { await web.stop(); }
});
