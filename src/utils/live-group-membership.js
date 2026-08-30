import fs from "node:fs";
import path from "node:path";

const snapshots = {};
let writeChain = Promise.resolve();

export function hasAuthoritativeMembership(groups) {
  return Array.isArray(groups?.activeGroupIds) && groups.activeGroupIds.length > 0;
}

export function scheduleMembershipRetry(attempt, callback, options = {}) {
  const maxAttempts = Math.max(1, Number(options.maxAttempts) || 6);
  if (attempt >= maxAttempts) return null;
  const baseDelayMs = Math.max(1000, Number(options.baseDelayMs) || 15000);
  const delayMs = Math.min(baseDelayMs * 2 ** Math.max(0, attempt - 1), 5 * 60 * 1000);
  const timer = setTimeout(callback, delayMs);
  timer.unref?.();
  return timer;
}

export function recordLiveGroupSnapshot(dataRoot, botId, groups, removed = 0) {
  const ids = [...new Set(groups.activeGroupIds.map(String))];
  snapshots[String(botId)] = {
    count: ids.length,
    removedStaleSettings: removed,
    updatedAt: new Date().toISOString(),
  };
  const target = path.join(dataRoot, "data", "live_group_counts.json");
  const temporary = `${target}.tmp`;
  writeChain = writeChain
    .catch(() => {})
    .then(async () => {
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.writeFile(temporary, JSON.stringify(snapshots, null, 2), "utf8");
      await fs.promises.rename(temporary, target);
    });
  return writeChain;
}
