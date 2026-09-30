import { spawn, execSync } from "child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { ensureLogFiles, logManagerBot } from "./src/utils/io-json.js";

// PM2 có thể gọi thẳng bot.js thay vì qua npm script. Nạp file key riêng ở
// supervisor để worker con luôn nhận được master key sau reboot/pm2 resurrect.
// Biến được PM2 truyền trực tiếp vẫn có độ ưu tiên cao nhất; giữa các file thì
// file đứng sau ghi đè file đứng trước, giống nhiều --env-file của Node.
const inheritedEnvKeys = new Set(Object.keys(process.env));
for (const envFile of [".env", ".env.credentials", ".env.scavio"]) {
  try {
    const fileEnv = parseEnv(readFileSync(envFile, "utf8"));
    for (const [key, value] of Object.entries(fileEnv)) {
      if (!inheritedEnvKeys.has(key)) process.env[key] = value;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const isWindows = process.platform === "win32";
const RESTART_DELAY_MS = 1000;
const MAX_RESTART_DELAY_MS = 30000;
const STABLE_UPTIME_MS = 60000;
// Bound each tab/process by default so several bot instances cannot let V8
// reserve the majority of host RAM. Set NGH_CHILD_MAX_OLD_SPACE_MB=0 to opt out.
const configuredHeapMb = process.env.NGH_CHILD_MAX_OLD_SPACE_MB;
const CHILD_MAX_OLD_SPACE_MB = configuredHeapMb === "0"
  ? 0
  : Math.max(256, Number(configuredHeapMb) || 384);
const configuredRssRestartMb = Number(process.env.NGH_CHILD_RSS_RESTART_MB);
const CHILD_RSS_RESTART_MB = configuredRssRestartMb === 0
  ? 0
  : Math.max(512, configuredRssRestartMb || 600);
let botProcess = null;
let restartTimer = null;
let isQuitting = false;
let isStopping = false;
let restartAttempts = 0;
let childStartedAt = 0;
let rssLimitBreaches = 0;

function readChildRssMb() {
  if (!botProcess?.pid || isWindows) return 0;
  try {
    const status = readFileSync(`/proc/${botProcess.pid}/status`, "utf8");
    return Number(status.match(/^VmRSS:\s+(\d+)\s+kB$/m)?.[1] || 0) / 1024;
  } catch {
    return 0;
  }
}

// Native canvas/image allocations are outside V8's heap limit. Restart only
// after three consecutive high-RSS samples so short render peaks are allowed,
// while a real leak cannot consume the whole VPS indefinitely.
const memoryGuardTimer = setInterval(() => {
  if (!CHILD_RSS_RESTART_MB || isQuitting || isStopping) return;
  const rssMb = readChildRssMb();
  rssLimitBreaches = rssMb >= CHILD_RSS_RESTART_MB ? rssLimitBreaches + 1 : 0;
  if (rssLimitBreaches < 3) return;
  rssLimitBreaches = 0;
  logManagerBot(`Restarting bot after sustained RSS ${Math.round(rssMb)}MB (limit ${CHILD_RSS_RESTART_MB}MB)`);
  restartBot();
}, 30_000);
memoryGuardTimer.unref?.();
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
  const runtimeEntry = process.env.NGH_RUNTIME_ENTRY || "src/index.js";
  const nodeArgs = CHILD_MAX_OLD_SPACE_MB > 0
    ? ["--expose-gc", `--max-old-space-size=${CHILD_MAX_OLD_SPACE_MB}`, runtimeEntry]
    : ["--expose-gc", runtimeEntry];
  botProcess = spawn(process.execPath, nodeArgs, {
    cwd: process.cwd(),
    stdio: "inherit",
    detached: !isWindows,
    // Canvas/Sharp allocate native buffers outside V8. A small number of
    // malloc arenas limits RSS growth from thread-local allocator caches.
    env: {
      ...process.env,
      MALLOC_ARENA_MAX: process.env.MALLOC_ARENA_MAX || "2",
      MALLOC_TRIM_THRESHOLD_: process.env.MALLOC_TRIM_THRESHOLD_ || "131072",
    },
  });
  childStartedAt = Date.now();
  rssLimitBreaches = 0;
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
  if (isQuitting || isStopping) return;
  if (botProcess?.pid && botProcess.exitCode === null) {
    // Wait until the old worker has actually exited before scheduling the
    // replacement. Scheduling here races with startBot(), which still sees
    // the old process alive and silently skips the restart.
    isStopping = true;
    stopBot();
    return;
  }
  botProcess = null;
  scheduleRestart("manual restart");
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
      scheduleRestart("requested restart");
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
  clearInterval(memoryGuardTimer);
  logManagerBot(`Supervisor received ${signal}. Shutting down...`);
  console.log(`\n[!] Received ${signal}. Shutting down supervisor...`);
  const child = botProcess;
  stopBot();
  if (!child || child.exitCode !== null) {
    process.exit(0);
    return;
  }

  // Let src/index.js finish its graceful flush before PM2 considers the
  // supervisor stopped. Exiting immediately can orphan the child briefly,
  // allowing stale in-memory JSON to overwrite a freshly restored bot entry.
  const forceExitTimer = setTimeout(() => {
    try {
      if (!isWindows && child.pid) process.kill(-child.pid, "SIGKILL");
    } catch {}
    process.exit(0);
  }, 10_000);
  forceExitTimer.unref?.();
  child.once("exit", () => {
    clearTimeout(forceExitTimer);
    process.exit(0);
  });
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
