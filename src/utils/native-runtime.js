import os from "node:os";
import sharp from "sharp";

// Native image operations run outside the JS event loop. Their default is to
// use many libvips threads per image, which multiplies badly when several bot
// commands render at once. Keep CPU capacity for sockets, MongoDB and ffmpeg.
const cpuCount = os.availableParallelism?.() || os.cpus().length || 1;
const sharpConcurrency = Math.max(
  1,
  Math.min(cpuCount, Number(process.env.NGH_SHARP_CONCURRENCY) || 2)
);
const sharpCacheMemoryMb = Math.max(16, Number(process.env.NGH_SHARP_CACHE_MEMORY_MB) || 64);

sharp.concurrency(sharpConcurrency);
sharp.cache({
  memory: sharpCacheMemoryMb,
  files: Math.max(0, Number(process.env.NGH_SHARP_CACHE_FILES) || 20),
  items: Math.max(16, Number(process.env.NGH_SHARP_CACHE_ITEMS) || 100),
});

export function getNativeRuntimeStats() {
  return {
    sharpConcurrency,
    sharpCache: sharp.cache(),
  };
}
