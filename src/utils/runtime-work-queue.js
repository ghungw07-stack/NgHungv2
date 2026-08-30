import { monitorEventLoopDelay } from "node:perf_hooks";
import { freemem, totalmem } from "node:os";

const readPositiveInt = (name, fallback) =>
  Math.max(1, Number.parseInt(process.env[name] || fallback, 10) || fallback);

const maxConcurrency = readPositiveInt("NGH_GLOBAL_MESSAGE_CONCURRENCY", 24);
const minConcurrency = Math.min(maxConcurrency, readPositiveInt("NGH_GLOBAL_MESSAGE_MIN_CONCURRENCY", 6));
const baselineConcurrency = Math.min(
  maxConcurrency,
  Math.max(minConcurrency, readPositiveInt("NGH_GLOBAL_MESSAGE_BASE_CONCURRENCY", 12))
);
const maxBacklog = readPositiveInt("NGH_GLOBAL_MESSAGE_BACKLOG", 10000);
// Ordinary chat/auto-service work is disposable under a flood. Keep most of
// the global backlog free for commands and direct messages so they stay usable.
const maxNormalBacklog = Math.min(
  maxBacklog,
  readPositiveInt("NGH_NORMAL_MESSAGE_BACKLOG", 500)
);
const maxPendingPerKey = readPositiveInt("NGH_MESSAGE_BACKLOG_PER_THREAD", 250);
const taskTimeoutMs = readPositiveInt("NGH_MESSAGE_TASK_TIMEOUT_MS", 120000);
const interactiveReserve = readPositiveInt("NGH_INTERACTIVE_MESSAGE_RESERVE", 2);
// This process normally keeps a sizeable native working set (canvas, sharp,
// ffmpeg and socket buffers). 1.2 GiB was below the observed idle/baseline RSS,
// so the queue stayed at emergency concurrency even while the host had plenty
// of free RAM. Global memory pressure is handled separately by freemem(), and
// deployments with tighter limits can still override this value.
const rssPressureBytes = readPositiveInt("NGH_QUEUE_RSS_PRESSURE_BYTES", 2 * 1024 * 1024 * 1024);
const queues = new Map();
const priorityReadyKeys = [];
const normalReadyKeys = [];
const priorityConcurrentTasks = [];
const normalConcurrentTasks = [];
let priorityReadyHead = 0;
let normalReadyHead = 0;
let priorityConcurrentHead = 0;
let normalConcurrentHead = 0;
const readySet = new Set();
const activeKeys = new Set();
let active = 0;
let pending = 0;
let concurrency = baselineConcurrency;
let eventLoopP95Ms = 0;
let rssBytes = 0;
let systemFreeMemoryRatio = 1;
let dropped = 0;
let droppedNormal = 0;
let timedOut = 0;
let lastInteractiveEnqueueAt = 0;
let idleRecoveryTicks = 0;
const concurrentPendingByKey = new Map();

export function calculateAdaptiveConcurrency({
  current,
  pendingCount,
  activeCount,
  eventLoopMs,
  rss,
  rssLimit,
  freeMemoryRatio,
  idleTicks = 0,
  minimum = minConcurrency,
  baseline = baselineConcurrency,
  maximum = maxConcurrency,
}) {
  const idle = pendingCount === 0 && activeCount === 0;
  const hostMemoryPressure = freeMemoryRatio < 0.1;
  // Native canvas/sharp/buffer allocations make RSS large. An RSS crossing by
  // itself is not pressure while the host still has plenty of available RAM.
  const combinedMemoryPressure = rss >= rssLimit && freeMemoryRatio < 0.2;
  if (hostMemoryPressure || combinedMemoryPressure) {
    return Math.max(minimum, Math.floor(current / 2));
  }
  // An idle queue cannot be causing the observed event-loop spike. Reducing
  // its future capacity here only pins the bot at emergency concurrency after
  // a completed canvas/media task. Restore the healthy baseline gradually so
  // the next command burst does not start artificially throttled.
  if (idle) {
    if (current < baseline && freeMemoryRatio >= 0.15) {
      return Math.min(baseline, current + 1);
    }
    return current;
  }
  if (eventLoopMs > 120) {
    return Math.max(minimum, Math.floor(current / 2));
  }
  if (eventLoopMs > 60) return Math.max(minimum, current - 2);
  if (eventLoopMs < 45 && freeMemoryRatio >= 0.2) {
    const target = pendingCount > 0 ? maximum : baseline;
    const step = pendingCount > current * 2 ? 2 : 1;
    return Math.min(target, current + step);
  }
  return current;
}

function runWithTimeout(task) {
  let timer;
  return Promise.race([
    Promise.resolve().then(task),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        timedOut++;
        reject(new Error(`runtime task timeout after ${taskTimeoutMs}ms`));
      }, taskTimeoutMs);
      timer.unref?.();
    }),
  ]).finally(() => clearTimeout(timer));
}

const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
eventLoopDelay.enable();
setInterval(() => {
  eventLoopP95Ms = Number(eventLoopDelay.percentile(95)) / 1e6;
  rssBytes = process.memoryUsage.rss();
  systemFreeMemoryRatio = freemem() / totalmem();
  eventLoopDelay.reset();
  const isIdle = pending === 0 && active === 0;
  idleRecoveryTicks = isIdle ? idleRecoveryTicks + 1 : 0;
  concurrency = calculateAdaptiveConcurrency({
    current: concurrency,
    pendingCount: pending,
    activeCount: active,
    eventLoopMs: eventLoopP95Ms,
    rss: rssBytes,
    rssLimit: rssPressureBytes,
    freeMemoryRatio: systemFreeMemoryRatio,
    idleTicks: idleRecoveryTicks,
  });
  drain();
}, 1000).unref();

function markReady(key, priority) {
  if (readySet.has(key) || activeKeys.has(key)) return;
  readySet.add(key);
  if (priority > 0) priorityReadyKeys.push(key);
  else normalReadyKeys.push(key);
}

function compactReadyQueue(queue, head) {
  // Do not let already-consumed keys remain referenced forever on a busy bot.
  if (head > 1024 && head * 2 >= queue.length) {
    queue.splice(0, head);
    return 0;
  }
  return head;
}

function takeReadyKey() {
  let key;
  if (priorityReadyHead < priorityReadyKeys.length) {
    key = priorityReadyKeys[priorityReadyHead++];
    priorityReadyHead = compactReadyQueue(priorityReadyKeys, priorityReadyHead);
  } else if (normalReadyHead < normalReadyKeys.length) {
    key = normalReadyKeys[normalReadyHead++];
    normalReadyHead = compactReadyQueue(normalReadyKeys, normalReadyHead);
  }
  return key;
}

function takeConcurrentTask() {
  let item;
  if (priorityConcurrentHead < priorityConcurrentTasks.length) {
    item = priorityConcurrentTasks[priorityConcurrentHead++];
    priorityConcurrentHead = compactReadyQueue(priorityConcurrentTasks, priorityConcurrentHead);
  } else if (normalConcurrentHead < normalConcurrentTasks.length) {
    item = normalConcurrentTasks[normalConcurrentHead++];
    normalConcurrentHead = compactReadyQueue(normalConcurrentTasks, normalConcurrentHead);
  }
  return item;
}

function hasReadyWork() {
  return (
    priorityReadyHead < priorityReadyKeys.length ||
    normalReadyHead < normalReadyKeys.length ||
    priorityConcurrentHead < priorityConcurrentTasks.length ||
    normalConcurrentHead < normalConcurrentTasks.length
  );
}

function hasPriorityWork() {
  return priorityReadyHead < priorityReadyKeys.length || priorityConcurrentHead < priorityConcurrentTasks.length;
}

function startConcurrentTask(item) {
  pending--;
  if (item.key) {
    const remaining = (concurrentPendingByKey.get(item.key) || 1) - 1;
    if (remaining > 0) concurrentPendingByKey.set(item.key, remaining);
    else concurrentPendingByKey.delete(item.key);
  }
  active++;
  runWithTimeout(item.task)
    .then(() => item.resolve(true), () => item.resolve(false))
    .finally(() => {
      active--;
      drain();
    });
}

export function calculateNormalCapacity(workerConcurrency, configuredReserve = interactiveReserve) {
  // Khi adaptive throttling hạ worker count, không để reserve cố định chiếm
  // gần hết pool. Giữ tối đa 25% cho interactive; priority vẫn luôn được lấy
  // trước nên command không mất ưu tiên.
  const adaptiveReserve = Math.min(configuredReserve, Math.max(1, Math.floor(workerConcurrency / 4)));
  return Math.max(1, workerConcurrency - adaptiveReserve);
}

function drain() {
  // Ordinary work may only occupy `concurrency - reserve` workers. The old
  // implementation added the reserve above concurrency and capped it at max;
  // at maximum concurrency that left zero real capacity for a late command.
  const normalCapacity = calculateNormalCapacity(concurrency);
  while (hasReadyWork() && active < concurrency) {
    if (!hasPriorityWork() && active >= normalCapacity) break;
    // Private/direct work keeps priority, regardless of whether it is keyed.
    if (priorityReadyHead >= priorityReadyKeys.length && priorityConcurrentHead < priorityConcurrentTasks.length) {
      startConcurrentTask(takeConcurrentTask());
      continue;
    }
    if (
      priorityReadyHead >= priorityReadyKeys.length &&
      normalReadyHead >= normalReadyKeys.length &&
      normalConcurrentHead < normalConcurrentTasks.length
    ) {
      startConcurrentTask(takeConcurrentTask());
      continue;
    }
    const key = takeReadyKey();
    readySet.delete(key);
    const queue = queues.get(key);
    if (!queue?.length || activeKeys.has(key)) continue;

    const item = queue.shift();
    pending--;
    active++;
    activeKeys.add(key);
    runWithTimeout(item.task)
      .then(() => item.resolve(true), () => item.resolve(false))
      .finally(() => {
        active--;
        activeKeys.delete(key);
        const remaining = queues.get(key);
        if (remaining?.length) markReady(key, remaining[0].priority);
        else queues.delete(key);
        drain();
      });
  }
}

/** Queue dung chung cho moi account, dong thoi giu dung thu tu trong tung group. */
export function enqueueRuntimeTask(key, task, { priority = 0 } = {}) {
  if (pending >= maxBacklog) {
    dropped++;
    return Promise.resolve(false);
  }
  lastInteractiveEnqueueAt = Date.now();
  const normalizedKey = String(key || "global");
  const queue = queues.get(normalizedKey) || [];
  if (queue.length + (activeKeys.has(normalizedKey) ? 1 : 0) >= maxPendingPerKey) {
    dropped++;
    return Promise.resolve(false);
  }
  const promise = new Promise((resolve, reject) => queue.push({ task, resolve, reject, priority }));
  queues.set(normalizedKey, queue);
  pending++;
  markReady(normalizedKey, priority);
  drain();
  return promise;
}


/**
 * Queue for work that does not need ordering by thread. This avoids creating a
 * short-lived Map/array/key for every normal chat message while retaining the
 * same global concurrency and backlog limits.
 */
export function enqueueConcurrentRuntimeTask(task, { priority = 0, key = null } = {}) {
  if (pending >= maxBacklog) {
    dropped++;
    return Promise.resolve(false);
  }
  if (priority <= 0 && pending >= maxNormalBacklog) {
    dropped++;
    droppedNormal++;
    return Promise.resolve(false);
  }
  const normalizedKey = key == null ? null : String(key);
  if (normalizedKey && (concurrentPendingByKey.get(normalizedKey) || 0) >= maxPendingPerKey) {
    dropped++;
    return Promise.resolve(false);
  }
  lastInteractiveEnqueueAt = Date.now();
  const promise = new Promise((resolve) => {
    const item = { task, resolve, priority, key: normalizedKey };
    pending++;
    if (normalizedKey) concurrentPendingByKey.set(normalizedKey, (concurrentPendingByKey.get(normalizedKey) || 0) + 1);
    if (priority > 0) priorityConcurrentTasks.push(item);
    else normalConcurrentTasks.push(item);
    drain();
  });
  return promise;
}

export function getRuntimeQueueStats() {
  return {
    active,
    pending,
    keys: queues.size,
    concurrentKeys: concurrentPendingByKey.size,
    concurrency,
    baselineConcurrency,
    maxConcurrency,
    eventLoopP95Ms,
    rssBytes,
    rssPressureBytes,
    systemFreeMemoryRatio,
    memoryPressure: systemFreeMemoryRatio < 0.1 || (rssBytes >= rssPressureBytes && systemFreeMemoryRatio < 0.2),
    dropped,
    droppedNormal,
    timedOut,
    maxBacklog,
    maxNormalBacklog,
    maxPendingPerKey,
    interactiveReserve,
    normalCapacity: calculateNormalCapacity(concurrency),
  };
}

/**
 * Let bulk/background services yield while interactive traffic is under load.
 * The bounded wait prevents a permanently busy bot from starving maintenance
 * jobs forever; callers should invoke it again before every target.
 */
export async function waitForInteractiveCapacity({
  pendingLimit = Math.max(4, minConcurrency),
  eventLoopLimitMs = 60,
  quietPeriodMs = Math.max(100, Number(process.env.NGH_BACKGROUND_QUIET_PERIOD_MS) || 1500),
  pollMs = 250,
  maxWaitMs = 30_000,
} = {}) {
  const startedAt = Date.now();
  let waitedMs = 0;
  while (
    pending > pendingLimit ||
    eventLoopP95Ms > eventLoopLimitMs ||
    Date.now() - lastInteractiveEnqueueAt < quietPeriodMs
  ) {
    if (Date.now() - startedAt >= maxWaitMs) break;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  waitedMs = Date.now() - startedAt;
  // Always cross a macrotask boundary so socket/message callbacks are not
  // starved by a fast sequence of already-resolved API promises.
  await new Promise((resolve) => setImmediate(resolve));
  return waitedMs;
}
