import test from "node:test";
import assert from "node:assert/strict";
import { resolveQueuedXoSoResult } from "../src/service-ngh/game-service/xoso-nhanh/forced-result.js";

test("kết quả đặt cho kỳ 410 không tác động các kỳ trước", () => {
  const config = { forcedSessionCode: 410, nextBaCang: "008" };
  assert.deepEqual(resolveQueuedXoSoResult(config, 409), {
    de: undefined, baCang: undefined, loNumbers: undefined, consume: false, expired: false,
  });
});

test("kỳ 410 nhận đúng 008 và tiêu thụ thiết lập một lần", () => {
  assert.deepEqual(resolveQueuedXoSoResult({ forcedSessionCode: 410, nextBaCang: "008" }, 410), {
    de: undefined, baCang: "008", loNumbers: undefined, consume: true, expired: false,
  });
});

test("thiết lập quá hạn được dọn thay vì áp vào kỳ sai", () => {
  assert.deepEqual(resolveQueuedXoSoResult({ forcedSessionCode: 410, nextBaCang: "008" }, 411), {
    de: undefined, baCang: undefined, loNumbers: undefined, consume: false, expired: true,
  });
});

test("thiết lập không ghi kỳ vẫn áp dụng cho kỳ kế tiếp như cũ", () => {
  assert.deepEqual(resolveQueuedXoSoResult({ nextDe: "77" }, 500), {
    de: "77", baCang: undefined, loNumbers: undefined, consume: true, expired: false,
  });
});

test("kỳ được chỉ định nhận đủ cặp lô xiên", () => {
  assert.deepEqual(resolveQueuedXoSoResult({ forcedSessionCode: 710, nextLoNumbers: ["77", "65"] }, 710), {
    de: undefined, baCang: undefined, loNumbers: ["77", "65"], consume: true, expired: false,
  });
});
