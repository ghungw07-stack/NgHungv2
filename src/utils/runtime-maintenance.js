import fs from "node:fs/promises";
import path from "node:path";

const HOUR_MS = 60 * 60 * 1000;

const positiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

async function walkRegularFiles(root) {
  const files = [];
  const pending = [path.resolve(root)];
  while (pending.length) {
    const current = pending.pop();
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      continue;
    }
    for (const entry of entries) {
      const target = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile()) files.push(target);
    }
  }
  return files;
}

export async function cleanupTempDirectory({
  directory,
  now = Date.now(),
  maxAgeMs = positiveNumber(process.env.NGH_TEMP_MAX_AGE_MS, 24 * HOUR_MS),
  dryRun = false,
} = {}) {
  if (!directory) throw new Error("cleanupTempDirectory requires a directory");
  const root = path.resolve(directory);
  const files = await walkRegularFiles(root);
  let removedFiles = 0;
  let removedBytes = 0;
  for (const file of files) {
    const resolved = path.resolve(file);
    if (resolved === root || !resolved.startsWith(`${root}${path.sep}`)) continue;
    let stat;
    try {
      stat = await fs.lstat(resolved);
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink() || now - stat.mtimeMs < maxAgeMs) continue;
    if (!dryRun) await fs.unlink(resolved);
    removedFiles++;
    removedBytes += stat.size;
  }
  return { scannedFiles: files.length, removedFiles, removedBytes };
}

export async function trimMessageLogs({
  directory,
  maxBytes = positiveNumber(process.env.NGH_MESSAGE_LOG_MAX_BYTES, 25 * 1024 * 1024),
  keepBytes = positiveNumber(process.env.NGH_MESSAGE_LOG_KEEP_BYTES, 2 * 1024 * 1024),
  dryRun = false,
} = {}) {
  if (!directory) throw new Error("trimMessageLogs requires a directory");
  const files = (await walkRegularFiles(directory)).filter((file) => path.basename(file) === "message.txt");
  let trimmedFiles = 0;
  let reclaimedBytes = 0;
  for (const file of files) {
    const stat = await fs.stat(file);
    if (stat.size <= maxBytes) continue;
    const bytesToKeep = Math.min(stat.size, keepBytes);
    if (!dryRun) {
      const handle = await fs.open(file, "r+");
      try {
        const tail = Buffer.allocUnsafe(bytesToKeep);
        await handle.read(tail, 0, bytesToKeep, stat.size - bytesToKeep);
        await handle.truncate(0);
        await handle.write(tail, 0, tail.length, 0);
      } finally {
        await handle.close();
      }
    }
    trimmedFiles++;
    reclaimedBytes += stat.size - bytesToKeep;
  }
  return { scannedFiles: files.length, trimmedFiles, reclaimedBytes };
}

export function startRuntimeMaintenance({ tempDirectory, logDirectory, onResult, intervalMs } = {}) {
  const run = async () => {
    const [temp, logs] = await Promise.all([
      cleanupTempDirectory({ directory: tempDirectory }),
      logDirectory ? trimMessageLogs({ directory: logDirectory }) : Promise.resolve(null),
    ]);
    const result = { temp, logs };
    onResult?.(result);
    return result;
  };
  const timer = setInterval(() => void run().catch((error) => onResult?.({ error })), positiveNumber(intervalMs, HOUR_MS));
  timer.unref?.();
  return { run, stop: () => clearInterval(timer) };
}
