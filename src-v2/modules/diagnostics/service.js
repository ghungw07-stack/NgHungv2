import os from "node:os";
import { Worker } from "node:worker_threads";
import { Semaphore } from "../../core/semaphore.js";

export class DiagnosticsService {
  constructor() { this.semaphore = new Semaphore(1, 3); }
  benchmark(durationMs = 1_000) {
    return this.semaphore.run(() => new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const worker = new Worker(new URL("./benchmark-worker.js", import.meta.url), { workerData: { durationMs } });
      const timeout = setTimeout(() => { worker.terminate(); reject(new Error("Benchmark quá thời gian")); }, 3_000);
      timeout.unref?.();
      worker.once("message", ({ operations }) => {
        clearTimeout(timeout);
        resolve({ operations, elapsedMs: Date.now() - startedAt, cpu: os.cpus()[0]?.model?.trim() || "Không rõ", cores: os.cpus().length });
      });
      worker.once("error", (error) => { clearTimeout(timeout); reject(error); });
    }));
  }
  speedtest() {
    return this.semaphore.run(async () => {
      const { default: speedTest } = await import("speedtest-net");
      const cancel = speedTest.makeCancel();
      let timer;
      try {
        return await Promise.race([
          speedTest({ acceptLicense: true, acceptGdpr: true, cancel }),
          new Promise((_, reject) => { timer = setTimeout(() => { cancel(); reject(new Error("Speedtest quá thời gian")); }, 45_000); timer.unref?.(); }),
        ]);
      } finally { clearTimeout(timer); }
    });
  }
}
