// do not change any export on this files or the bot will down.



import FormData from "form-data";
import fs from "fs";
import path from "path";
import { ZaloApiError, MessageType } from "../index.js";
import { asyncPool, encodeAES, getFileSize, getImageMetaData, getMd5LargeFileObject, apiFactory } from "../utils.js";
import { measureTime } from "../../utils/util.js";
import { readSettingConfig } from "../../utils/io-json.js";

const DEFAULT_CHUNK_SIZE = 100 * 1024 * 1024;
const LARGE_AUDIO_CHUNK_SIZE = 8 * 1024 * 1024;
const LARGE_AUDIO_CONCURRENCY = 20;
const MAX_VOICE_UPLOAD_CONCURRENCY = 12;
const MAX_VOICE_UPLOAD_SIZE = DEFAULT_CHUNK_SIZE;
const DEFAULT_CONCURRENT_CHUNKS = 12;
const MAX_CONCURRENT_FILES = 4;
const UPLOAD_CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_UPLOAD_CACHE_ENTRIES = 1000;
const uploadSettingConfig = readSettingConfig();
const uploadResultCache = new Map();
const uploadsInFlight = new Map();

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

      const uploadPromise = (async () => {
      const fileResults = [];

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

      let fileType_ = type;
      let threadId_ = threadId;
      if (useCloudUpload && (!["mp3", "aac"].includes(extFile) || isCloudVoice || useRegularFileUpload)) {
        fileType_ = MessageType.DirectMessage;
        threadId_ = appContext.idCloud;
      }

      const isGroupMessage = fileType_ == MessageType.GroupMessage;
      const url = `${serviceURL}/${isGroupMessage ? "group" : "message"}/`;
      const query = {
        zpw_ver: appContext.options.apiVersion,
        zpw_type: appContext.options.typeLogin,
        type: isGroupMessage ? "11" : "2",
      };

      const fileName = path.basename(filePath);

      const processUpload = async () => {
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

        const fd = await openFd(filePath);

        try {
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

            const response = await utils.request(
              utils.makeURL(url + urlType[data.fileType], { ...query, params: encryptedParams }),
              {
                method: "POST",
                headers: formData.getHeaders(),
                body: formData.getBuffer(),
                timeout: Math.max(
                  Number(settingConfig["TIME_OUT_UPLOAD_CHUNK"]) || 0,
                  30_000 + Math.ceil(size / (1024 * 1024)) * 2_000
                ),
              }
            );

            const resData = await utils.resolve(response);
            return { resData, chunkId: i + 1 };
          });

          const chunkResults = await asyncPool(concurrentChunks, uploadChunks, (fn) => fn());

          for (const { resData } of chunkResults) {
            if (!resData) continue;
            if (resData.fileId && resData.fileId != -1) {
              const callbackKey = String(resData.fileId);
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
                  checksum: (await getMd5LargeFileObject(data.filePath, data.fileData.totalSize)).data,
                });
              };
              const pendingResult = appContext.uploadResults?.get(callbackKey);
              if (pendingResult) {
                appContext.uploadResults.delete(callbackKey);
                await completeUpload(pendingResult);
                continue;
              }
              await new Promise((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                  appContext.uploadCallbacks.delete(callbackKey);
                  reject(new ZaloApiError(`Upload callback timeout (${Math.round(callbackTimeout / 1000)}s)`));
                }, callbackTimeout);

                appContext.uploadCallbacks.set(callbackKey, async (wsData) => {
                  clearTimeout(timeoutId);
                  try {
                    await completeUpload(wsData);
                    resolve();
                  } catch (error) {
                    reject(error);
                  }
                }, callbackTimeout + 5_000);
              });
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
        } finally {
          await closeFd(fd);
        }
      };

      let attempts = 0;
      while (attempts < 3) {
        try {
          await processUpload();
          break;
        } catch (error) {
          attempts++;
          if (attempts >= 3) throw error;
          await new Promise((resolve) => setTimeout(resolve, attempts * 300));
        }
      }
      return fileResults;
      })();

      uploadsInFlight.set(cacheKey, uploadPromise);
      try {
        const uploaded = await uploadPromise;
        uploadResultCache.set(cacheKey, { timestamp: Date.now(), results: uploaded });
        if (uploadResultCache.size > MAX_UPLOAD_CACHE_ENTRIES) {
          const oldestKey = uploadResultCache.keys().next().value;
          uploadResultCache.delete(oldestKey);
        }
        return uploaded.map((item) => ({ ...item }));
      } finally {
        uploadsInFlight.delete(cacheKey);
      }
    };

    const uploadedFiles = await asyncPool(MAX_CONCURRENT_FILES, filePaths, processFile);
    return uploadedFiles.flat();
  };
});
