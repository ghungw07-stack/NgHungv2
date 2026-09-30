import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import test from "node:test";
import { hashReadableFile } from "../src/api-zalo/remote-file-checksum.js";

test("file URL checksum hashes chunks without buffering the whole file", async () => {
  const pieces = [Buffer.alloc(1024 * 1024, 1), Buffer.alloc(1024 * 1024, 2), Buffer.from("tail")];
  const expected = createHash("md5").update(Buffer.concat(pieces)).digest("hex");
  const result = await hashReadableFile(Readable.from(pieces));
  assert.equal(result.data, expected);
  assert.equal(result.currentChunk, 2);
});
