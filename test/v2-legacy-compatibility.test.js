import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

test("legacy compatibility import cannot execute production bootstrap", () => {
  const source = fs.readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(source, /process\.env\.NGH_LEGACY_LIBRARY !== "1"/);
  const bridge = fs.readFileSync(new URL("../src-v2/compatibility/legacy-commands.js", import.meta.url), "utf8");
  assert.match(bridge, /initializeLegacyCompatibility/);
  assert.match(bridge, /apiInstance = \{ api: this\.client\.api, config: this\.botConfig, schedule: \{\} \}/);
  assert.match(bridge, /job\?\.cancel\?\.\(\)/);
  assert.doesNotMatch(bridge, /createBot\(/);
  const client = fs.readFileSync(new URL("../src-v2/infrastructure/zalo/zalo-client.js", import.meta.url), "utf8");
  assert.match(client, /api\.accountInfo =/);
  assert.match(client, /rawProfile\.zaloName/);
});
