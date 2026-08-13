import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { TempFiles } from "../src-v2/infrastructure/files/temp-files.js";

test("temp manager only removes managed files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ngh-v2-"));
  const manager = new TempFiles({ rootDir: root, maxAgeMs: 1 });
  await manager.start();
  const file = manager.path(".jpg");
  await fs.writeFile(file, "x");
  await manager.stop();
  await assert.rejects(() => fs.access(file));
  await assert.rejects(() => manager.remove(path.join(root, "outside.txt")), /Từ chối/);
});
