import assert from "node:assert/strict";
import test from "node:test";
import { SafeHttpClient } from "../src-v2/infrastructure/http/safe-http-client.js";

test("safe HTTP client blocks local and unsupported URLs", async () => {
  const client = new SafeHttpClient();
  await assert.rejects(() => client.validate("file:///etc/passwd"), /HTTP/);
  await assert.rejects(() => client.validate("http://127.0.0.1/private"), /nội bộ/);
  await assert.rejects(() => client.validate("http://[::1]/private"), /nội bộ/);
});
