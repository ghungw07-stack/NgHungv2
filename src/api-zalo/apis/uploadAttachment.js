// do not change any export on this files or the bot will down.



import FormData from "form-data";
import fs from "fs";
import path from "path";
import { ZaloApiError, MessageType } from "../index.js";
import { asyncPool, encodeAES, getFileSize, getImageMetaData, getMd5LargeFileObject, apiFactory } from "../utils.js";
import { measureTime } from "../../utils/util.js";
import { readSettingConfig } from "../../utils/io-json.js";

const DEFAULT_CHUNK_SIZE = 100 * 1024 * 1024;
const DEFAULT_CONCURRENT_CHUNKS = 512;

const urlType = {
  image: "photo_original/upload",
  aac: "voice/upload",
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
    let isUploadCloud = configOption.uploadCloud || true;
    let isCloudVoice = configOption.isCloudVoice || false;
    if (!filePaths?.length) throw new ZaloApiError("Missing filePaths");
    if (!threadId) throw new ZaloApiError("Missing threadId");

    const settingConfig = readSettingConfig();
    const results = [];

    const processFile = async (filePath) => {
      if (!fs.existsSync(filePath)) throw new ZaloApiError("File not found");

      const extFile = path.extname(filePath).slice(1);
      const chunkSize = appContext.settings.features.sharefile.chunk_size_file || DEFAULT_CHUNK_SIZE;

      let fileType_ = type;
      let threadId_ = threadId;
      if (isUploadCloud && (!["mp3", "aac"].includes(extFile) || isCloudVoice)) {
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
        } else if (["mp3"].includes(extFile)) {
          totalSize = await getFileSize(filePath);
          data.fileType = "aac";
          data.fileData = { fileName, totalSize };
          data.params.fileType = "aac";
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
          const concurrentChunks = settingConfig["CHUNK_UPLOAD"] || DEFAULT_CONCURRENT_CHUNKS;

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
                timeout: settingConfig["TIME_OUT_UPLOAD_CHUNK"],
              }
            );

            const resData = await utils.resolve(response);
            return { resData, chunkId: i + 1 };
          });

          const chunkResults = await asyncPool(concurrentChunks, uploadChunks, (fn) => fn());

          for (const { resData } of chunkResults) {
            if (!resData) continue;
            if (resData.fileId && resData.fileId != -1) {
              await new Promise((resolve) => {
                appContext.uploadCallbacks.set(resData.fileId, async (wsData) => {
                  results.push({
                    ...data.fileData,
                    ...resData,
                    ...wsData,
                    fileType: data.fileType,
                    checksum: (await getMd5LargeFileObject(data.filePath, data.fileData.totalSize)).data,
                  });
                  resolve();
                });
              });
            }
            if (resData.photoId && resData.finished) {
              results.push({
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
        }
      }
    };

    await Promise.all(filePaths.map(processFile));

    return results;
  };
});