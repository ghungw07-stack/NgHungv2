import crypto from "node:crypto";
import { parentPort, workerData } from "node:worker_threads";
import { performance } from "node:perf_hooks";

const deadline = performance.now() + Math.min(1_500, Math.max(250, Number(workerData.durationMs) || 1_000));
let operations = 0;
while (performance.now() < deadline) {
  crypto.createHash("sha256").update(String(operations)).digest();
  operations++;
}
parentPort.postMessage({ operations });
