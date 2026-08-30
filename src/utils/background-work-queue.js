const readPositiveInt = (name, fallback) =>
  Math.max(1, Number.parseInt(process.env[name] || fallback, 10) || fallback);

const maxConcurrency = readPositiveInt("NGH_BACKGROUND_CONCURRENCY", 1);
const maxBacklog = readPositiveInt("NGH_BACKGROUND_BACKLOG", 100);
const queue = [];
const queuedKeys = new Set();
const activeKeys = new Set();
let active = 0;

function drain() {
  while (active < maxConcurrency && queue.length > 0) {
    const item = queue.shift();
    queuedKeys.delete(item.key);
    activeKeys.add(item.key);
    active++;

    // setImmediate gives message/socket callbacks a chance to run before a
    // potentially large broadcast starts doing work.
    setImmediate(() => {
      Promise.resolve()
        .then(item.task)
        .then(item.resolve, item.reject)
        .finally(() => {
          active--;
          activeKeys.delete(item.key);
          drain();
        });
    });
  }
}

/**
 * Queue long-running, non-interactive jobs separately from the message queue.
 * A stable key prevents a scheduled run and a manual run of the same service
 * from overlapping and competing for the Zalo connection.
 */
export function enqueueBackgroundTask(key, task) {
  const normalizedKey = String(key || "background");
  if (queuedKeys.has(normalizedKey) || activeKeys.has(normalizedKey)) {
    return { accepted: false, reason: "already-running", promise: null };
  }
  if (queue.length >= maxBacklog) {
    return { accepted: false, reason: "backlog-full", promise: null };
  }

  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  // Background errors must be observable by callers without becoming an
  // unhandled rejection when a scheduled caller intentionally does not wait.
  promise.catch(() => {});
  queuedKeys.add(normalizedKey);
  queue.push({ key: normalizedKey, task, resolve, reject });
  drain();
  return { accepted: true, reason: null, promise };
}

export function getBackgroundQueueStats() {
  return {
    active,
    pending: queue.length,
    maxConcurrency,
    maxBacklog,
    activeKeys: [...activeKeys],
  };
}
