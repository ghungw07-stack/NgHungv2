import assert from "node:assert/strict";
import test from "node:test";
import { CommandRegistry } from "../src-v2/core/commands/registry.js";
import { compareCommandParity } from "../src-v2/tools/parity.js";

test("parity report distinguishes canonical alias and missing commands", () => {
  const registry = new CommandRegistry().register({ name: "weather", aliases: ["thoitiet"], execute() {} });
  const report = compareCommandParity([{ name: "weather" }, { name: "thoitiet" }, { name: "unknown" }], registry);
  assert.equal(report.canonical, 1);
  assert.equal(report.alias, 1);
  assert.deepEqual(report.missing, ["unknown"]);
});
