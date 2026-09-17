import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";

// canvas 2.x uses a native addon that cannot be loaded in multiple worker_threads
// on Windows. A child process isolates it while keeping the bot's event loop free.
export function runRenderJob(payload, { timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = fork(fileURLToPath(new URL("./render-worker.js", import.meta.url)), [], {
      stdio: ["ignore", "ignore", "pipe", "ipc"], execArgv: [], windowsHide: true,
    });
    let reply, stderr = "", settled = false;
    const finish = (error, file) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (error) reject(error); else resolve(file);
    };
    const timer = setTimeout(() => {
      child.kill(); finish(new Error("Render GIF quá thời gian cho phép"));
    }, timeoutMs);
    child.stderr.on("data", chunk => { stderr = (stderr + chunk.toString()).slice(-2000); });
    child.once("message", data => { reply = data; });
    child.once("error", error => { child.kill(); finish(error); });
    child.once("exit", (code, signal) => {
      if (code === 0 && reply?.success && typeof reply.file === "string") finish(null, reply.file);
      else finish(new Error(reply?.error || stderr || `Tiến trình GIF dừng (${signal || code})`));
    });
    child.send(payload, error => { if (error) { child.kill(); finish(error); } });
  });
}
