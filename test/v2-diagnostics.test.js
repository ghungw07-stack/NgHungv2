import assert from "node:assert/strict";
import test from "node:test";
import { DiagnosticsService } from "../src-v2/modules/diagnostics/service.js";
import { mbps } from "../src-v2/modules/diagnostics/commands.js";

test("benchmark runs outside the main thread and returns bounded result", async () => {
  const service = new DiagnosticsService();
  const started = Date.now();
  const result = await service.benchmark(250);
  assert.ok(result.operations > 0);
  assert.ok(Date.now() - started < 3_000);
  assert.ok(result.cores >= 1);
});

test("speed bandwidth is converted from bytes to megabits", () => {
  assert.equal(mbps(12_500_000), "100.00");
});
