import assert from "node:assert/strict";
import test from "node:test";
import { CommandRegistry } from "../src-v2/core/commands/registry.js";
import { applyCommandContracts, auditCommandContracts } from "../src-v2/tools/contract-audit.js";

test("contract audit detects aliases permissions cooldown and active state", () => {
  const registry = new CommandRegistry();
  registry.register({ name: "x", permission: "everyone", cooldownMs: 0, execute() {} });
  const rows = auditCommandContracts([{ name: "x", alias: ["xx"], permission: "adminLevelHigh", countdown: 2, active: false }], registry);
  assert.deepEqual(rows.map((row) => row.field), ["alias", "permission", "cooldownMs", "active"]);
});

test("legacy manifest applies authoritative command metadata", () => {
  const registry = new CommandRegistry();
  registry.register({ name: "x", execute() {} });
  const legacy = [{ name: "x", alias: ["xx"], permission: "adminLevelHigh", countdown: 2, active: false }];
  applyCommandContracts(legacy, registry);
  assert.equal(registry.resolve("xx"), registry.resolve("x"));
  assert.equal(registry.resolve("x").permission, "leader");
  assert.equal(registry.resolve("x").cooldownMs, 2_000);
  assert.equal(registry.resolve("x").active, false);
  assert.deepEqual(auditCommandContracts(legacy, registry), []);
});
