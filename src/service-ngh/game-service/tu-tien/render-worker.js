import { parentPort, workerData } from "worker_threads";
import { renderActionGif, renderBattleGif } from "./index.js";

try {
  const file = workerData.kind === "battle"
    ? await renderBattleGif(workerData.p, workerData.enemy, workerData.result)
    : await renderActionGif(workerData.p, workerData.type, workerData.success);
  parentPort.postMessage({ success: true, file });
} catch (error) {
  parentPort.postMessage({ success: false, error: error?.stack || error?.message || String(error) });
}
