import { Worker } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

let queue = Promise.resolve(), depth = 0;

export function renderMayBay(kind, data) {
  if (depth >= 8) return Promise.reject(new Error("Hàng chờ ảnh máy bay đang đầy"));
  depth++;
  const outputPath = path.resolve("assets/temp", `maybay_${randomUUID()}.${kind === "history" ? "png" : "gif"}`);
  const task = queue.then(() => new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./render-worker.js", import.meta.url), { workerData: { kind, data, outputPath }, execArgv: [] });
    let finished = false;
    const finish = (error, file) => {
      if (finished) return;
      finished = true; clearTimeout(timeout);
      void worker.terminate();
      if (error) { void fs.unlink(outputPath).catch(() => {}); reject(error); }
      else resolve(file);
    };
    const timeout = setTimeout(() => finish(new Error("Vẽ ảnh máy bay quá thời gian")), 45_000);
    worker.once("message", result => finish(result.error ? new Error(result.error) : null, result.file));
    worker.once("error", error => finish(error));
    worker.once("exit", code => { if (!finished) finish(new Error(`Worker máy bay dừng (${code})`)); });
  }));
  queue = task.catch(() => {}).finally(() => { depth--; });
  return task;
}
