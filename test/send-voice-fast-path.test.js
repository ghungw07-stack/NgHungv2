import assert from "node:assert/strict";
import test from "node:test";

import { resolveVoiceSizeForSend } from "../src/api-zalo/apis/sendVoice.js";
import { getUploadSize, rememberUploadSize } from "../src/api-zalo/upload-metadata.js";

test("unknown voice size does not wait for the remote HEAD probe", async () => {
  let finishHead;
  let headCalls = 0;
  const context = {
    uid: "bot-test",
    options: {
      polyfill: async () => {
        headCalls++;
        return await new Promise((resolve) => { finishHead = resolve; });
      },
    },
  };
  const voiceUrl = "https://voice.example.test/track.aac";

  assert.deepEqual(resolveVoiceSizeForSend(context, voiceUrl), {
    fileSize: 0,
    sizeCached: false,
  });
  assert.equal(headCalls, 1);

  finishHead({
    ok: true,
    headers: { get: (name) => name === "content-length" ? "123456" : null },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(getUploadSize(context, voiceUrl), 123456);
});

test("known voice size is reused without another HEAD probe", () => {
  let headCalls = 0;
  const context = {
    uid: "bot-test",
    options: { polyfill: async () => { headCalls++; } },
  };
  const voiceUrl = "https://voice.example.test/cached.aac";
  rememberUploadSize(context, voiceUrl, 654321);

  assert.deepEqual(resolveVoiceSizeForSend(context, voiceUrl), {
    fileSize: 654321,
    sizeCached: true,
  });
  assert.equal(headCalls, 0);
});
