import { pingDatabase } from "../database/state.js";
import { getRuntimeQueueStats } from "./runtime-work-queue.js";
import { getBackgroundQueueStats } from "./background-work-queue.js";
import { getNativeRuntimeStats } from "./native-runtime.js";

const DEFAULT_INTERVAL_MS = 60_000;
// Keep this aligned with the queue's default pressure point. Native image and
// media libraries make RSS materially larger than V8 heap usage in this bot.
const DEFAULT_RSS_LIMIT = 2 * 1024 * 1024 * 1024;

const withTimeout = (promise, timeoutMs, label) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs);
    timer.unref?.();
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });

export async function collectRuntimeHealth(api, { databaseTimeoutMs = 3000, ping = pingDatabase } = {}) {
  let database = { ok: false };
  try {
    await withTimeout(ping(), databaseTimeoutMs, "MongoDB ping");
    database = { ok: true };
  } catch (error) {
    database = { ok: false, error: error?.message || String(error) };
  }
  const ws = api?.listener?.ws;
  const memory = process.memoryUsage();
  const queue = getRuntimeQueueStats();
  const queuePendingLimit = Math.max(10, Number(process.env.NGH_QUEUE_WARN_PENDING) || 500);
  const eventLoopWarnMs = Math.max(20, Number(process.env.NGH_EVENT_LOOP_WARN_MS) || 100);
  const runtime = {
    ok: queue.pending < queuePendingLimit && queue.eventLoopP95Ms < eventLoopWarnMs,
    queuePendingLimit,
    eventLoopWarnMs,
  };
  return {
    ok: database.ok && ws?.readyState === 1 && runtime.ok,
    database,
    socket: { ok: ws?.readyState === 1, readyState: ws?.readyState ?? null },
    memory: { rss: memory.rss, heapUsed: memory.heapUsed, external: memory.external },
    queue,
    runtime,
    backgroundQueue: getBackgroundQueueStats(),
    nativeRuntime: getNativeRuntimeStats(),
    timestamp: Date.now(),
  };
}

export function startRuntimeHealthMonitor(api, {
  intervalMs = Number(process.env.NGH_HEALTH_INTERVAL_MS) || DEFAULT_INTERVAL_MS,
  rssLimitBytes = Number(process.env.NGH_RSS_WARN_BYTES) || DEFAULT_RSS_LIMIT,
  onHealth,
  collect = collectRuntimeHealth,
} = {}) {
  let checking = false;
  let unhealthySocketChecks = 0;
  let recoveringSocket = false;
  const check = async () => {
    if (checking) return null;
    checking = true;
    try {
      const health = await collect(api);
      unhealthySocketChecks = health.socket.ok ? 0 : unhealthySocketChecks + 1;
      if (unhealthySocketChecks >= 2 && !recoveringSocket && api?.listener) {
        recoveringSocket = true;
        try {
          api.listener.reset();
          api.listener.start();
          unhealthySocketChecks = 0;
        } finally {
          recoveringSocket = false;
        }
      }
      const memoryPressure = health.queue?.memoryPressure === true ||
        (health.memory.rss >= rssLimitBytes && (health.queue?.systemFreeMemoryRatio ?? 1) < 0.2);
      if (!health.database.ok || memoryPressure || !health.socket.ok || health.runtime?.ok === false) {
        onHealth?.(health);
      }
      return health;
    } finally {
      checking = false;
    }
  };
  const timer = setInterval(() => void check().catch((error) => onHealth?.({ ok: false, error })), intervalMs);
  timer.unref?.();
  return { check, stop: () => clearInterval(timer) };
}
