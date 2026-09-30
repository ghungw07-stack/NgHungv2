import { loadImageBuffer } from "./util.js";
import { LRUCache } from "lru-cache";

const TIME_CACHE = 3 * 60 * 1000;
const MAX_CACHE_BYTES = Math.max(
  8 * 1024 * 1024,
  Number(process.env.NGH_IMAGE_BUFFER_CACHE_BYTES) || 32 * 1024 * 1024
);

class ImageBufferCache {
  constructor() {
    // Image buffers live outside the V8 heap. A time-only Map could retain an
    // arbitrary amount of native memory during a burst, making RSS climb even
    // though heap usage looked healthy. Bound both entry count and total bytes.
    this.cache = new LRUCache({
      max: 256,
      maxSize: MAX_CACHE_BYTES,
      ttl: TIME_CACHE,
      updateAgeOnGet: true,
      sizeCalculation: (entry) => Math.max(1, entry?.buffer?.byteLength || 1),
    });
    this.downloading = new Map();
  }

  async getBuffer(url, options = {}) {
    const cacheKey = this.getCacheKey(url, options);
    
    // Kiểm tra cache
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey).buffer;
    }

    // Nếu đang download, đợi kết quả
    if (this.downloading.has(cacheKey)) {
      return (await this.downloading.get(cacheKey));
    }

    // Tạo promise download mới
    const downloadPromise = this.downloadBuffer(url, options);
    this.downloading.set(cacheKey, downloadPromise);

    try {
      const result = await downloadPromise;
      this.cache.set(cacheKey, {
        buffer: result,
        timestamp: Date.now()
      });
      this.downloading.delete(cacheKey);
      return result;
    } catch (error) {
      this.downloading.delete(cacheKey);
      throw error;
    }
  }

  getCacheKey(url, options) {
    const { silent, ...cacheOptions } = options || {};
    return `${url}:${JSON.stringify(cacheOptions)}`;
  }

  async downloadBuffer(url, options) {
    try {
      return await loadImageBuffer(url, options?.headers);
    } catch (error) {
      if (!options?.silent) {
        console.error(`Error downloading image from ${url}:`, error);
      }
      throw error;
    }
  }
  
  cleanup() {
    this.cache.purgeStale();
  }

  clear() {
    this.cache.clear();
    this.downloading.clear();
  }
}

export const imageBufferCache = new ImageBufferCache();
