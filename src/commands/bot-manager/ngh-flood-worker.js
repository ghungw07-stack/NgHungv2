/**
 * NGH Flood Worker — chạy trong worker_thread riêng biệt
 * Rate: 20 actions/10ms = 2000/s — đủ mạnh, không OOM main thread
 */
import { parentPort } from "worker_threads";

const ACTIONS = [
  "junk",
  "junk",
  "junk",
  "reaction_LIKE",
  "reaction_HAHA",
  "reaction_UNDO",
  "junk",
  "delete",
  "undo",
  "junk",
  "heartbeat",
  "getRecent",
  "getInfo",
];

let running = true;

parentPort.on("message", (msg) => {
  if (msg === "stop") running = false;
});

// Bắt unhandledRejection để worker không chết thầm
process.on("unhandledRejection", () => {});

(async () => {
  let idx = 0;
  while (running) {
    try {
      for (let i = 0; i < 20 && running; i++) {
        parentPort.postMessage({ type: "action", action: ACTIONS[idx % ACTIONS.length] });
        idx++;
      }
    } catch (_) {
      // parentPort.postMessage bị lỗi → bỏ qua, tiếp tục loop
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  try { parentPort.postMessage({ type: "done" }); } catch (_) {}
})();
