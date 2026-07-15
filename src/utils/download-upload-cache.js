import { getVideoMetadata } from "../api-zalo/utils.js";
import { downloadVideoFromM3U8 } from "./m3u8/index.js";
import { deleteFile, downloadFile } from "./util.js";

const TIME_CLEANUP = 30 * 60 * 1000;
const TIME_CACHE = 180 * 60 * 1000;

class DownloadsCache {
  constructor() {
    this.downloading = new Map();
    this.cleanupInterval = setInterval(() => this.clear(), TIME_CLEANUP);
  }

  async getDataDownload(api, message, url, option) {
    const { type = "normal", path, headers = {} } = option;
    const cacheKey = this.getCacheKey(url);

    if (this.downloading.has(cacheKey)) {
      const result = await this.downloading.get(cacheKey);
      return result?.response || result;
    }

    const downloadPromise = this.downloadData(api, message, url, type, path, headers);
    this.downloading.set(cacheKey, downloadPromise);

    try {
      const result = await downloadPromise;
      this.downloading.delete(cacheKey);
      return result;
    } catch (error) {
      this.downloading.delete(cacheKey);
      throw error;
    }
  }

  getCacheKey(url) {
    return `${url}`;
  }

  async downloadData(api, message, url, type, tempPath, headers) {
    let dataConvert;
    try {
      switch (type) {
        case "m3u8":
          dataConvert = await downloadVideoFromM3U8(url, tempPath, headers);
          return await uploadsFilmCache.getDataUploadFilm(api, message, dataConvert.paths);
        default:
          const resultPath = await downloadFile(url, tempPath);
          return await uploadsFilmCache.getDataUploadFilm(api, message, [resultPath]);
      }
    } catch (error) {
      const errorObj = new Error(`Error downloading data and upload host zalo from ${url}: ` + error.message);
      errorObj.stage = error.stage ? error.stage : "Download To Local";
      throw errorObj;
    } finally {
      if (dataConvert && dataConvert.paths) {
        for (const path of dataConvert.paths) {
          await deleteFile(path);
        }
      }
    }
  }

  clear() {
    this.downloading.clear();
  }
}

export const downloadsCache = new DownloadsCache();

class UploadsFilmCache {
  constructor() {
    this.cache = new Map();
    this.uploading = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), TIME_CLEANUP);
  }

  async getDataUploadFilm(api, message, paths) {
    if (typeof paths === "string") paths = [paths];
    const cacheKey = this.getCacheKey(paths);

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey).response;
    }

    if (this.uploading.has(cacheKey)) {
      const result = await this.uploading.get(cacheKey);
      return result?.response || result;
    }

    const uploadPromise = this.uploadData(api, message, paths);
    this.uploading.set(cacheKey, uploadPromise);

    try {
      const result = await uploadPromise;
      this.cache.set(cacheKey, {
        response: result,
        timestamp: Date.now(),
      });
      this.uploading.delete(cacheKey);
      return result;
    } catch (error) {
      this.uploading.delete(cacheKey);
      throw error;
    }
  }

  getCacheKey(paths) {
    return `${JSON.stringify(paths)}`;
  }

  async uploadData(api, message, paths) {
    try {
      let listUpload = [];
      for (const path of paths) {
        const [uploadResult, metadataFile] = await Promise.all([
          api.uploadAttachment([path], message.threadId, message.type),
          getVideoMetadata(path),
        ]);

        listUpload.push({ fileUrl: uploadResult[0].fileUrl || uploadResult[0].normalUrl, ...metadataFile });
      }
      return listUpload;
    } catch (error) {
      const errorObj = new Error(`Error uploading data Host Zalo:` + error.message);
      errorObj.stage = "Upload To Zalo";
      throw errorObj;
    } finally {
    }
  }

  cleanup() {
    const now = Date.now();
    for (const [key, data] of this.cache.entries()) {
      if (now - data.timestamp > TIME_CACHE) {
        this.cache.delete(key);
      }
    }
  }

  clear() {
    this.cache.clear();
    this.uploading.clear();
  }
}

export const uploadsFilmCache = new UploadsFilmCache();
