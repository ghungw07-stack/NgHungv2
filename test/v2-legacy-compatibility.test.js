import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

test("legacy compatibility import cannot execute production bootstrap", () => {
  const source = fs.readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(source, /process\.env\.NGH_LEGACY_LIBRARY !== "1"/);
  const bridge = fs.readFileSync(new URL("../src-v2/compatibility/legacy-commands.js", import.meta.url), "utf8");
  assert.match(bridge, /initializeLegacyCompatibility/);
  assert.doesNotMatch(bridge, /createBot\(/);
});
