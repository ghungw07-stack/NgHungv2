// do not change any export on this files or the bot will down.



import FormData from "form-data";
import fs from "fs";
import path from "path";
import { ZaloApiError, MessageType } from "../index.js";
import { asyncPool, getFileSize, getImageMetaData, getMd5LargeFileObject, apiFactory } from "../utils.js";
import { readSettingConfig } from "../../utils/io-json.js";
import { rememberUploadSize } from "../upload-metadata.js";
import { logMediaTiming } from "../../utils/media-timing.js";

const DEFAULT_CHUNK_SIZE = 100 * 1024 * 1024;
// Zalo endpoint vẫn áp giới hạn ~512KB cho audio asyncfile, kể cả nhánh file
// lớn. Giữ 256KB để chừa overhead multipart và tránh lỗi 201 khi nhạc dài.
const LARGE_AUDIO_CHUNK_SIZE = 256 * 1024;
const LARGE_AUDIO_CONCURRENCY = Math.max(1, Number(process.env.NGH_LARGE_AUDIO_UPLOAD_CONCURRENCY) || 6);
const MAX_VOICE_UPLOAD_CONCURRENCY = Math.max(1, Number(process.env.NGH_VOICE_UPLOAD_CONCURRENCY) || 6);
const MAX_VOICE_UPLOAD_SIZE = DEFAULT_CHUNK_SIZE;
const DEFAULT_CONCURRENT_CHUNKS = Math.max(1, Number(process.env.NGH_UPLOAD_CHUNK_CONCURRENCY) || 6);
const MAX_CONCURRENT_FILES = Math.max(1, Number(process.env.NGH_UPLOAD_FILE_CONCURRENCY) || 2);
const UPLOAD_CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_UPLOAD_CACHE_ENTRIES = 1000;
const UPLOAD_RATE_LIMIT_COOLDOWN_MS = 15 * 1000;
const uploadSettingConfig = readSettingConfig();
const uploadResultCache = new Map();
const uploadsInFlight = new Map();
const uploadRateLimitedUntil = new Map();

const urlType = {
  image: "photo_original/upload",
  aac: "asyncfile/upload", // Thay voice/upload bằng asyncfile/upload để hỗ trợ file > 512KB
  video: "asyncfile/upload",
  others: "asyncfile/upload",
};

const openFd = (filePath) => new Promise((resolve, reject) => fs.open(filePath, "r", (err, fd) => err ? reject(err) : resolve(fd)));
const closeFd = (fd) => new Promise((resolve) => fs.close(fd, resolve));

const readChunkFd = (fd, start, size) =>
  new Promise((resolve, reject) => {
    const buf = Buffer.allocUnsafe(size);
    fs.read(fd, buf, 0, size, start, (err, bytesRead) => {
      if (err) return reject(err);
      resolve(bytesRead < size ? buf.subarray(0, bytesRead) : buf);
    });
  });

async function getHelperUploadApi(currentBotId) {
  try {
    const { getGlobalApi, apiManager } = await import("../../index.js");
    const mainApi = getGlobalApi?.();
    const mainBotId = String(mainApi?.getBotId?.() || "");
    const currentId = String(currentBotId || "");

    if (mainApi?.uploadAttachment && mainBotId && mainBotId !== currentId) {
      const blockedUntil = uploadRateLimitedUntil.get(mainBotId) || 0;
      if (blockedUntil <= Date.now()) {
        return mainApi;
      }
    }
    for (const manager of Object.values(apiManager?.apiManagerObject || {})) {
      const helper = manager?.apiZalo;
      const helperId = String(helper?.getBotId?.() || "");
      if (helper?.uploadAttachment && helperId && helperId !== currentId) {
        const blockedUntil = uploadRateLimitedUntil.get(helperId) || 0;
        if (blockedUntil <= Date.now()) {
          return helper;
        }
      }
    }
  } catch (err) {
    console.error(`[getHelperUploadApi-error]`, err?.message || err);
  }
  return null;
}

export const uploadAttachmentFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = `${api.zpwServiceMap.file[0]}/api`;

  return async function uploadAttachment(filePaths, threadId, type = MessageType.DirectMessage, configOption = {}) {
    let isUploadCloud = configOption.uploadCloud ?? true;
    let isCloudVoice = configOption.isCloudVoice || false;
    if (!filePaths?.length) throw new ZaloApiError("Missing filePaths");
    if (!threadId) throw new ZaloApiError("Missing threadId");

    const settingConfig = uploadSettingConfig;

    const processFile = async (filePath) => {
      if (!fs.existsSync(filePath)) throw new ZaloApiError("File not found");

      const botId = String(api.getBotId());
      const blockedUntil = uploadRateLimitedUntil.get(botId) || 0;
      if (blockedUntil > Date.now()) {
        if (!configOption.isDelegated) {
          const helper = await getHelperUploadApi(botId);
          if (helper) {
            console.error(`[uploadAttachment-delegate-cooldown] Bot ${botId} đang bị cooldown Zalo 221, chuyển quyền upload qua bot ${helper.getBotId()}`);
            return helper.uploadAttachment([filePath], threadId, type, { ...configOption, isDelegated: true });
          }
        }
        throw new ZaloApiError("Vượt quá số request cho phép", 221);
      }
      if (blockedUntil) uploadRateLimitedUntil.delete(botId);

      const stat = await fs.promises.stat(filePath);
      const cacheKey = [
        api.getBotId(),
        path.resolve(filePath),
        stat.size,
        stat.mtimeMs,
        isUploadCloud ? "cloud" : `${type}:${threadId}`,
        isCloudVoice ? "voice-cloud" : "normal",
      ].join(":");
      const cached = uploadResultCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < UPLOAD_CACHE_TTL_MS) {
        return cached.results.map((item) => ({ ...item }));
      }
      if (cached) uploadResultCache.delete(cacheKey);
      if (uploadsInFlight.has(cacheKey)) {
        const sharedResults = await uploadsInFlight.get(cacheKey);
        return sharedResults.map((item) => ({ ...item }));
      }

      const startedAt = performance.now();
      const timings = { attempts: 0, chunks: 0, chunkMs: 0, checksumMs: 0, callbackMs: 0 };
      let ok = false;
      const uploadPromise = (async () => {
      const fileResults = [];
      let checksumPromise;

      const extFile = path.extname(filePath).slice(1);
      const configuredChunkSize = appContext.settings.features.sharefile.chunk_size_file || DEFAULT_CHUNK_SIZE;
      const isAudio = ["mp3", "aac", "m4a"].includes(extFile.toLowerCase());
      const useRegularFileUpload = isAudio && stat.size > MAX_VOICE_UPLOAD_SIZE;

      // Mấu chốt: Dù dùng asyncfile/upload, nếu fileType="aac" Zalo vẫn giới hạn cực gắt < 512KB.
      // 511KB đôi khi vẫn dính do overhead của multipart/form-data.
      // Dùng 256KB để đảm bảo an toàn tuyệt đối 100%.
      const isVoiceUpload = isAudio && !useRegularFileUpload;
      const MAX_VOICE_CHUNK = 256 * 1024; // 256KB
      const chunkSize = isVoiceUpload ? MAX_VOICE_CHUNK : (useRegularFileUpload ? LARGE_AUDIO_CHUNK_SIZE : configuredChunkSize);

      const useCloudUpload = isUploadCloud || useRegularFileUpload;
      const effectiveCloudId = appContext.idCloud || appContext.uid;
      const canUseCloud = Boolean(useCloudUpload && effectiveCloudId);
      let fileType_ = canUseCloud && (!["mp3", "aac"].includes(extFile) || isCloudVoice || useRegularFileUpload)
        ? MessageType.DirectMessage
        : type;
      let threadId_ = fileType_ === MessageType.DirectMessage && canUseCloud ? effectiveCloudId : threadId;

      const fileName = path.basename(filePath);

      const processUpload = async () => {
        const isGroupMessage = fileType_ == MessageType.GroupMessage;
        const url = `${serviceURL}/${isGroupMessage ? "group" : "message"}/`;
        const query = {
          zpw_ver: appContext.options.apiVersion || 667,
          zpw_type: 30, // Upload endpoint của Zalo Web CDN yêu cầu zpw_type 30
          type: isGroupMessage ? "11" : "2",
        };
        let clientId = Date.now();
        const data = {
          filePath,
          params: {
            imei: appContext.imei,
            isE2EE: 0,
            jxl: 0,
            chunkId: -1,
            clientId: clientId++,
            fileName,
          },
        };

        if (isGroupMessage) data.params.grid = threadId_;
        else data.params.toid = threadId_;

        let totalSize;
        if (["jpg", "jpeg", "png"].includes(extFile)) {
          const imageData = await getImageMetaData(filePath);
          data.fileType = "image";
          data.fileData = imageData;
          totalSize = imageData.totalSize;
        } else if (isAudio && !useRegularFileUpload) {
          totalSize = await getFileSize(filePath);
          data.fileType = "aac";
          data.fileData = { fileName, totalSize };
          data.params.fileType = "aac";
        } else if (isAudio && useRegularFileUpload) {
          totalSize = await getFileSize(filePath);
          data.fileType = "others";
          data.fileData = { fileName, totalSize };
        } else if (["mp4"].includes(extFile)) {
          totalSize = await getFileSize(filePath);
          data.fileType = "video";
          data.fileData = { fileName, totalSize };
        } else {
          totalSize = await getFileSize(filePath);
          data.fileType = "others";
          data.fileData = { fileName, totalSize };
        }

        data.params.totalChunk = Math.ceil(totalSize / chunkSize);
        data.params.totalSize = totalSize;
        timings.chunks = data.params.totalChunk;

        const fd = await openFd(filePath);

        try {
          // Calculate once alongside the network upload, including across retries.
          // Observe errors immediately; awaiting the original promise below still
          // propagates failures without an unhandled rejection during a slow upload.
          if (data.fileType !== "image" && !checksumPromise) {
            const checksumStartedAt = performance.now();
            checksumPromise = getMd5LargeFileObject(filePath, totalSize).finally(() => {
              timings.checksumMs = Math.round(performance.now() - checksumStartedAt);
            });
            void checksumPromise.catch(() => {});
          }
          const concurrentChunks = isVoiceUpload
            ? Math.min(
                data.params.totalChunk,
                Math.max(
                  2,
                  Math.min(
                    MAX_VOICE_UPLOAD_CONCURRENCY,
                    Number(settingConfig["CHUNK_UPLOAD"]) || MAX_VOICE_UPLOAD_CONCURRENCY
                  )
                )
              )
            : Math.min(data.params.totalChunk, Math.max(
                1,
                Math.min(
                  useRegularFileUpload
                    ? LARGE_AUDIO_CONCURRENCY
                    : (Number(settingConfig["CHUNK_UPLOAD"]) || DEFAULT_CONCURRENT_CHUNKS),
                  useRegularFileUpload ? LARGE_AUDIO_CONCURRENCY : 12
                )
              ));

          const uploadChunks = Array.from({ length: data.params.totalChunk }, (_, i) => async () => {
            const start = i * chunkSize;
            const size = Math.min(chunkSize, totalSize - start);
            const chunkBuffer = await readChunkFd(fd, start, size);

            const formData = new FormData();
            formData.append("chunkContent", chunkBuffer, {
              filename: fileName,
              contentType: "application/octet-stream",
            });

            const params = { ...data.params, chunkId: i + 1 };
            const encryptedParams = utils.encodeAES(JSON.stringify(params));
            if (!encryptedParams) throw new ZaloApiError("Failed to encrypt message");

            const response = await utils.requestUpload(
              utils.makeURL(url + urlType[data.fileType], { ...query, params: encryptedParams }),
              formData,
              {
                timeout: Math.max(
                  Number(settingConfig["TIME_OUT_UPLOAD_CHUNK"]) || 0,
                  30_000 + Math.ceil(size / (1024 * 1024)) * 2_000
                ),
              }
            );

            let resData;
            try {
              resData = await utils.resolve(response);
            } catch (err) {
              console.error(`[uploadAttachment-chunk-err] bot=${botId} url=${url + urlType[data.fileType]} status=${response.status} code=${err?.code} err=${err?.message}`);
              throw err;
            }
            return { resData, chunkId: i + 1 };
          });

          const chunksStartedAt = performance.now();
          let chunkResults;
          try {
            chunkResults = await asyncPool(concurrentChunks, uploadChunks, (fn) => fn());
          } finally {
            timings.chunkMs += Math.round(performance.now() - chunksStartedAt);
          }

          const completedFileIds = new Set();
          for (const { resData } of chunkResults) {
            if (!resData) continue;
            if (resData.fileId && resData.fileId != -1) {
              const callbackKey = String(resData.fileId);
              // Several chunks can acknowledge the same file. Its completion
              // event is sent once; waiting for it again stalls until timeout.
              if (completedFileIds.has(callbackKey)) continue;
              completedFileIds.add(callbackKey);
              const callbackTimeout = Math.min(
                30 * 60 * 1000,
                Math.max(120_000, 60_000 + Math.ceil(totalSize / (1024 * 1024)) * 5_000)
              );
              const completeUpload = async (wsData) => {
                fileResults.push({
                  ...data.fileData,
                  ...resData,
                  ...wsData,
                  fileType: data.fileType,
                  checksum: (await (checksumPromise ??= getMd5LargeFileObject(filePath, totalSize))).data,
                });
              };
              const pendingResult = appContext.uploadResults?.get(callbackKey);
              if (pendingResult) {
                appContext.uploadResults.delete(callbackKey);
                await completeUpload(pendingResult);
                continue;
              }
              const callbackStartedAt = performance.now();
              let wsData;
              try {
                wsData = await new Promise((resolve, reject) => {
                  const timeoutId = setTimeout(() => {
                    appContext.uploadCallbacks.delete(callbackKey);
                    reject(new ZaloApiError(`Upload callback timeout (${Math.round(callbackTimeout / 1000)}s)`));
                  }, callbackTimeout);

                  appContext.uploadCallbacks.set(callbackKey, (wsData) => {
                    clearTimeout(timeoutId);
                    appContext.uploadCallbacks.delete(callbackKey);
                    resolve(wsData);
                  }, callbackTimeout + 5_000);
                });
              } finally {
                timings.callbackMs += Math.round(performance.now() - callbackStartedAt);
              }
              await completeUpload(wsData);
            }
            if (resData.photoId && resData.finished) {
              fileResults.push({
                fileType: data.fileType,
                width: data.fileData.width,
                height: data.fileData.height,
                totalSize: data.fileData.totalSize,
                ...resData,
              });
            }
          }
          if (data.fileType === "image" && fileResults.length === 0) {
            throw new ZaloApiError("Upload ảnh không nhận được photoId từ Zalo", 500);
          }
        } finally {
          await closeFd(fd);
        }
      };

      let attempts = 0;
      while (attempts < 3) {
        try {
          timings.attempts++;
          fileResults.length = 0;
          await processUpload();
          break;
        } catch (error) {
          attempts++;
          console.error(`[uploadAttachment-attempt-error] bot=${botId} attempt=${attempts} fileType_=${fileType_} threadId_=${threadId_} code=${error?.code} message=${error?.message}`);
          // Nếu đang upload qua Cloud mà lỗi (hoặc bị rate limit 221), thử fallback sang direct group upload
          if (fileType_ === MessageType.DirectMessage && (threadId_ === appContext.idCloud || threadId_ === appContext.uid) && type === MessageType.GroupMessage) {
            fileType_ = type;
            threadId_ = threadId;
            continue;
          }
          if (Number(error?.code) === 221) {
            uploadRateLimitedUntil.set(botId, Date.now() + UPLOAD_RATE_LIMIT_COOLDOWN_MS);
            if (!configOption.isDelegated) {
              const helper = await getHelperUploadApi(botId);
              if (helper) {
                console.error(`[uploadAttachment-delegate-221] Bot ${botId} gặp lỗi Zalo 221, chuyển quyền upload qua bot ${helper.getBotId()}`);
                try {
                  const delegated = await helper.uploadAttachment([filePath], threadId, type, { ...configOption, isDelegated: true });
                  if (delegated?.length) {
                    fileResults.push(...delegated);
                    return fileResults;
                  }
                } catch (delegateErr) {
                  console.error(`[uploadAttachment-delegate-failed] Helper bot ${helper.getBotId()} upload lỗi:`, delegateErr?.message || delegateErr);
                }
              }
            }
            throw error;
          }
          if (attempts >= 3) throw error;
          await new Promise((resolve) => setTimeout(resolve, attempts * 300));
        }
      }
      return fileResults;
      })();

      uploadsInFlight.set(cacheKey, uploadPromise);
      try {
        const uploaded = await uploadPromise;
        ok = true;
        uploadResultCache.set(cacheKey, { timestamp: Date.now(), results: uploaded });
        if (uploadResultCache.size > MAX_UPLOAD_CACHE_ENTRIES) {
          const oldestKey = uploadResultCache.keys().next().value;
          uploadResultCache.delete(oldestKey);
        }
        return uploaded.map((item) => ({ ...item }));
      } finally {
        uploadsInFlight.delete(cacheKey);
        logMediaTiming("upload", startedAt, { bot: api.getBotId(), ok, bytes: stat.size, ...timings });
      }
    };

    const uploadedFiles = await asyncPool(MAX_CONCURRENT_FILES, filePaths, processFile);
    const results = uploadedFiles.flat();
    for (const result of results) {
      rememberUploadSize(appContext, result.fileUrl, result.totalSize);
      rememberUploadSize(appContext, result.normalUrl, result.totalSize);
    }
    return results;
  };
});
