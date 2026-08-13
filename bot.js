import { spawn, execSync } from "child_process";
import { ensureLogFiles, logManagerBot } from "./src/utils/io-json.js";
const isWindows = process.platform === "win32";
const RESTART_DELAY_MS = 1000;
const MAX_RESTART_DELAY_MS = 30000;
const STABLE_UPTIME_MS = 60000;
let botProcess = null;
let restartTimer = null;
let isQuitting = false;
let isStopping = false;
let restartAttempts = 0;
let childStartedAt = 0;
function scheduleRestart(reason) {
  if (isQuitting || restartTimer) return;
  const delay = Math.min(RESTART_DELAY_MS * 2 ** restartAttempts, MAX_RESTART_DELAY_MS);
  restartAttempts++;
  logManagerBot(`Scheduling bot restart in ${delay}ms: ${reason}`);
  console.log(`Scheduling bot restart in ${delay}ms: ${reason}`);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    startBot();
  }, delay);
}
function startBot() {
  if (isQuitting) return;
  if (botProcess && botProcess.exitCode === null && !botProcess.killed) return;
  logManagerBot("Bot starting...");
  console.log("Bot starting...");
  if (typeof printBanner === "function") {
    printBanner();
  } else {
    console.warn("printBanner is not defined, skipping banner output.");
  }
  const runtimeEntry = process.env.NGH_RUNTIME_ENTRY || "src-v2/index.js";
  botProcess = spawn(process.execPath, [runtimeEntry], {
    cwd: process.cwd(),
    stdio: "inherit",
    detached: !isWindows,
    env: { ...process.env, V2_LEGACY_COMMANDS: runtimeEntry === "src-v2/index.js" ? "1" : process.env.V2_LEGACY_COMMANDS },
  });
  childStartedAt = Date.now();
  attachBotEvents(botProcess);
  logManagerBot(`Bot started (PID: ${botProcess.pid})`);
  console.log(`Bot started (PID: ${botProcess.pid})`);
}
function stopBot() {
  if (!botProcess || !botProcess.pid) return;
  const pid = botProcess.pid;
  try {
    if (isWindows) {
      execSync(`taskkill /pid ${pid} /t /f`, { stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGTERM");
    }
  } catch {}
}
function restartBot() {
  if (isQuitting) return;
  isStopping = true;
  scheduleRestart("manual restart");
  if (botProcess && botProcess.pid) {
    stopBot();
    return;
  }
  isStopping = false;
  startBot();
}
function attachBotEvents(bot) {
  bot.once("error", (err) => {
    logManagerBot(`Bot error: ${err.message}`);
    console.error("Bot error:", err.message);
    botProcess = null;
    isStopping = false;
    scheduleRestart("child process error");
  });
  bot.once("exit", (code, signal) => {
    logManagerBot(`Bot exited (code: ${code}, signal: ${signal || "none"})`);
    console.log(`Bot exited (code: ${code}, signal: ${signal || "none"})`);
    botProcess = null;
    if (Date.now() - childStartedAt >= STABLE_UPTIME_MS) restartAttempts = 0;
    if (isQuitting) return;
    if (isStopping) {
      isStopping = false;
      return;
    }
    scheduleRestart("unexpected exit");
  });
}
function shutdown(signal) {
  if (isQuitting) return;
  isQuitting = true;
  isStopping = true;
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  logManagerBot(`Supervisor received ${signal}. Shutting down...`);
  console.log(`\n[!] Received ${signal}. Shutting down supervisor...`);
  stopBot();
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", (err) => {
  logManagerBot(`Supervisor uncaughtException: ${err.message}`);
  console.error("Supervisor uncaughtException:", err);
  restartBot();
});
process.on("unhandledRejection", (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  logManagerBot(`Supervisor unhandledRejection: ${message}`);
  console.error("Supervisor unhandledRejection:", reason);
  restartBot();
});
async function bootstrap() {
  await ensureLogFiles();
  startBot();
}
bootstrap().catch((err) => {
  logManagerBot(`Failed to bootstrap supervisor: ${err.message}`);
  console.error("Failed to bootstrap supervisor:", err);
  process.exit(1);
});
