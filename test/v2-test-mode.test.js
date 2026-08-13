import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

test("v2 test mode uses isolated web port and main-bot-only flag", () => {
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(pkg.scripts["start:v2:test"], /PORT=3100/);
  assert.match(pkg.scripts["start:v2:test"], /V2_MAIN_ONLY=1/);
});

test("production start and supervisor default to v2 compatibility runtime", () => {
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(pkg.scripts.start, /V2_LEGACY_COMMANDS=1 node src-v2\/index\.js/);
  assert.equal(pkg.scripts["start:legacy"], "node src/index.js");
  const supervisor = fs.readFileSync(new URL("../bot.js", import.meta.url), "utf8");
  assert.match(supervisor, /NGH_RUNTIME_ENTRY \|\| "src-v2\/index\.js"/);
});
