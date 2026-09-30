import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

test("writeManagerFile recreates a missing bot log directory", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ngh-manager-file-"));
  const previousLogRoot = process.env.NGH_LOG_ROOT;
  process.env.NGH_LOG_ROOT = temporaryRoot;

  try {
    const moduleUrl = pathToFileURL(path.resolve("src/utils/io-json.js"));
    moduleUrl.searchParams.set("test", `${Date.now()}-${Math.random()}`);
    const { MANAGER_FILE_PATH, readManagerFile, writeManagerFile } = await import(moduleUrl.href);
    const botId = "612651863441394479";
    const expected = { msgRequestReset: { threadId: "123" }, onBotPrivate: false };

    assert.equal(fs.existsSync(path.dirname(MANAGER_FILE_PATH(botId))), false);
    writeManagerFile(botId, expected);
    assert.deepEqual(readManagerFile(botId), { ...expected, blockBot: [] });
    assert.equal(fs.existsSync(`${MANAGER_FILE_PATH(botId)}.tmp`), false);
  } finally {
    if (previousLogRoot === undefined) delete process.env.NGH_LOG_ROOT;
    else process.env.NGH_LOG_ROOT = previousLogRoot;
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
