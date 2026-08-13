import assert from "node:assert/strict";
import test from "node:test";
import { MediaService } from "../src-v2/modules/media/service.js";

test("media service resolves safe file extensions", () => {
  const media = new MediaService({ http: {}, tempFiles: {} });
  assert.equal(media.extension("https://example.com/file", "image/png"), ".png");
  assert.equal(media.extension("https://example.com/video.mp4", ""), ".mp4");
  assert.equal(media.extension("https://example.com/no-extension", ""), ".bin");
});
