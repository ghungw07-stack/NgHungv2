import { parentPort, workerData } from "node:worker_threads";
import { renderCrashReplay, renderCrashHistory } from "./renderer.js";

try {
  const file = workerData.kind === "history"
    ? await renderCrashHistory(workerData.data, workerData.outputPath)
    : await renderCrashReplay(workerData.data, workerData.outputPath);
  parentPort.postMessage({ file });
} catch (error) {
  parentPort.postMessage({ error: error.message });
}
