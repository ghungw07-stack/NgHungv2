import assert from "node:assert/strict";
import test from "node:test";

import {
  isInvalidChildCredentialError,
  runChildPostStartTask,
  shouldRetryChildStart,
} from "../src/manager-bot/child-start-policy.js";

test("không tự retry lỗi cookie hoặc credential", () => {
  assert.equal(isInvalidChildCredentialError(new Error("Cookie đăng nhập đã hết hạn")), true);
  assert.equal(shouldRetryChildStart(new Error("Không giải mã được credential bot")), false);
});

test("không retry timeout vì lần login cũ vẫn còn chạy", () => {
  const error = new Error("Khởi động bot quá 900s");
  error.code = "CHILD_START_TIMEOUT";
  assert.equal(shouldRetryChildStart(error), false);
  assert.equal(shouldRetryChildStart("Khởi động bot quá 900s"), false);
});

test("vẫn retry lỗi mạng tạm thời", () => {
  assert.equal(shouldRetryChildStart(new Error("read ECONNRESET")), true);
  assert.equal(shouldRetryChildStart(new Error("Login request failed: ETIMEDOUT")), true);
});

test("tác vụ sau khởi động timeout không ném lỗi ra luồng khởi động", async () => {
  let reportedError;
  const taskResult = runChildPostStartTask(
    () => new Promise(() => {}),
    { timeoutMs: 10, onError: (error) => { reportedError = error; } }
  );

  // Giữ event loop sống trong test vì timer production được unref.
  const result = await Promise.race([
    taskResult,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Test timeout")), 200)),
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "CHILD_POST_START_TIMEOUT");
  assert.equal(reportedError, result.error);
});

test("tác vụ sau khởi động trả kết quả khi hoàn tất", async () => {
  const result = await runChildPostStartTask(async () => "linked", { timeoutMs: 100 });
  assert.deepEqual(result, { ok: true, value: "linked" });
});
