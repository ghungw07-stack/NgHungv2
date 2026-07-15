import fs from "fs";
import path from "path";
import axios from "axios";
import { getCachedMedia, setCacheData } from "./link-platform-cache.js";
import { getGlobalApi } from "../index.js";
import { deleteFile, execAsync } from "./util.js";
import { getVideoMetadata } from "../api-zalo/utils.js";
import {
  FILES_RESOURCE_PATH,
  FILES_RESOURCE_PATH_GLOBAL,
  GIFS_RESOURCE_PATH,
  GIFS_RESOURCE_PATH_GLOBAL,
  IMAGES_RESOURCE_PATH,
  IMAGES_RESOURCE_PATH_GLOBAL,
  STICKERS_RESOURCE_PATH,
  STICKERS_RESOURCE_PATH_GLOBAL,
  tempDir,
  VIDEOS_RESOURCE_PATH,
  VIDEOS_RESOURCE_PATH_GLOBAL,
  VOICES_RESOURCE_PATH,
  VOICES_RESOURCE_PATH_GLOBAL,
} from "./io-json.js";
import { convertToWebp } from "../service-dqt/chat-zalo/chat-special/send-sticker/create-webp.js";
import { uploadAudioFile } from "../service-dqt/chat-zalo/chat-special/send-voice/process-audio.js";
import { getFirstOtherSender } from "./message-cache.js";
import xxhash from "xxhash-wasm";
import { getClientAxios } from "../service-dqt/utilities/browser-launch.js";

const xxhashAPI = await xxhash();
const client = getClientAxios();

async function uploadFileZalo(pathUpload, apiBot, isUpCloud = false) {
  let api, idUpload;
  if (apiBot) {
    api = apiBot;
  } else {
    api = getGlobalApi();
  }
  const idBot = api.getBotId();
  idUpload = await getRandomUid(idBot);
  return api.uploadAttachment([pathUpload], idUpload, 0, { uploadCloud: isUpCloud, isUseProphylactic: true });
}

async function getRandomUid(idBot) {
  return await getFirstOtherSender(idBot, idBot);
}

export const PLATFORM_IMAGE = "ZaloImageCache";
export async function handleCheckLinkFromImageLocal(imageName, apiPush) {
  const api = apiPush ? apiPush : getGlobalApi();
  const dataImagePath = IMAGES_RESOURCE_PATH(api.getBotId());
  const files = fs.readdirSync(dataImagePath);
  let imageFile = files.find((file) => file === imageName);
  if (!imageFile) imageFile = files.find((file) => path.parse(file).name === imageName); //Check Ko Đuôi File
  // if (!imageFile) imageFile = files.find(file => path.parse(file).name.includes(imageName)); //Check Tên File Gần Giống

  if (!imageFile) {

    const filesGlobal = fs.readdirSync(IMAGES_RESOURCE_PATH_GLOBAL);
    imageFile = filesGlobal.find((file) => file === imageName);
    if (!imageFile) imageFile = filesGlobal.find((file) => path.parse(file).name === imageName);
  }

  if (!imageFile) return null;
  const fileExt = path.parse(imageFile).ext.replace(".", "");
  const nameFileImage = path.parse(imageFile).name;
  const imagePath = path.join(dataImagePath, imageFile);

  try {
    const fileHash = await calculateFileHash(imagePath);
    let cachedImage = await getCachedMedia(PLATFORM_IMAGE, nameFileImage, fileExt, nameFileImage);

    if (cachedImage && cachedImage.fileHash === fileHash) {
      return cachedImage;
    } else {
      const linkUploadZalo = await uploadFileZalo(imagePath, api, true);
      const urlFinal = linkUploadZalo[0].fileUrl || linkUploadZalo[0].normalUrl;
      if (urlFinal) {
        setCacheData(
          PLATFORM_IMAGE,
          nameFileImage,
          {
            ...linkUploadZalo[0],
            title: nameFileImage,
            fileUrl: urlFinal,
            fileHash: fileHash,
          },
          fileExt
        );
        cachedImage = await getCachedMedia(PLATFORM_IMAGE, nameFileImage, fileExt, nameFileImage);
        return cachedImage;
      }
    }
    return null;
  } catch (error) {
    console.error(`Lỗi khi get link cache của ảnh ${imageName}:`, error);
    return null;
  }
}

export const PLATFORM_VIDEO = "ZaloVideoCache";
export async function handleCheckLinkFromVideoLocal(videoName, apiPush) {
  const api = apiPush ? apiPush : getGlobalApi();
  const dataVideoPath = VIDEOS_RESOURCE_PATH(api.getBotId());
  const files = fs.readdirSync(dataVideoPath);
  let videoFile = files.find((file) => file === videoName);
  // if (!videoFile) videoFile = files.find(file => path.parse(file).name === imageName); //Check Ko Đuôi File
  // if (!videoFile) videoFile = files.find(file => path.parse(file).name.includes(imageName)); //Check Tên File Gần Giống

  if (!videoFile) {
    const filesGlobal = fs.readdirSync(VIDEOS_RESOURCE_PATH_GLOBAL);
    videoFile = filesGlobal.find((file) => file === videoName);
  }

  if (!videoFile) return null;

  const fileExt = path.parse(videoFile).ext.replace(".", "");
  const nameFileVideo = path.parse(videoFile).name;
  const videoPath = path.join(dataVideoPath, videoFile);

  try {
    const fileHash = await calculateFileHash(videoPath);
    let cachedVideo = await getCachedMedia(PLATFORM_VIDEO, nameFileVideo, fileExt, nameFileVideo);

    if (cachedVideo && cachedVideo.fileHash === fileHash) {
      return cachedVideo;
    } else {
      const linkUploadZalo = await uploadFileZalo(videoPath, api);
      const urlFinal = linkUploadZalo[0].fileUrl || linkUploadZalo[0].normalUrl;
      if (urlFinal) {
        setCacheData(
          PLATFORM_VIDEO,
          nameFileVideo,
          {
            ...linkUploadZalo[0],
            title: nameFileVideo,
            fileUrl: urlFinal,
            fileHash: fileHash,
          },
          fileExt
        );
        cachedVideo = await getCachedMedia(PLATFORM_VIDEO, nameFileVideo, fileExt, nameFileVideo);
        return cachedVideo;
      }
    }
    return null;
  } catch (error) {
    console.error(`Lỗi khi get link cache của video ${videoName}:`, error);
    return null;
  }
}

export const PLATFORM_VOICE = "ZaloVoiceCache";
export async function handleCheckLinkFromVoicesLocal(fileName, apiPush) {
  const api = apiPush ? apiPush : getGlobalApi();
  const dataVoicesPath = VOICES_RESOURCE_PATH(api.getBotId());
  const files = fs.readdirSync(dataVoicesPath);
  let dataFindFile = files.find((file) => file === fileName);
  if (!dataFindFile) dataFindFile = files.find((file) => path.parse(file).name === fileName);
  // if (!dataFindFile) dataFindFile = files.find(file => path.parse(file).name.includes(fileName));

  if (!dataFindFile) {
    const filesGlobal = fs.readdirSync(VOICES_RESOURCE_PATH_GLOBAL);
    dataFindFile = filesGlobal.find((file) => file === fileName);
    if (!dataFindFile) dataFindFile = filesGlobal.find((file) => path.parse(file).name === fileName);
  }

  if (!dataFindFile) return null;

  const fileExt = path.parse(dataFindFile).ext.replace(".", "");
  const nameFileSpecial = path.parse(dataFindFile).name;
  const filePath = path.join(dataVoicesPath, dataFindFile);

  try {
    const fileHash = await calculateFileHash(filePath);
    let cachedVoice = await getCachedMedia(PLATFORM_VOICE, nameFileSpecial, fileExt, nameFileSpecial);

    if (cachedVoice && cachedVoice.fileHash === fileHash) {
      return cachedVoice;
    } else {
      const apiUpload = api || getGlobalApi();
      const idUpload = await getRandomUid(apiUpload.getBotId());
      const urlFinal = await uploadAudioFile(filePath, apiUpload, {
        threadId: idUpload,
        type: 0,
      });
      if (urlFinal) {
        setCacheData(
          PLATFORM_VOICE,
          nameFileSpecial,
          {
            title: nameFileSpecial,
            fileUrl: urlFinal,
            type: fileExt,
            fileHash: fileHash,
          },
          fileExt
        );
        cachedVoice = await getCachedMedia(PLATFORM_VOICE, nameFileSpecial, fileExt, nameFileSpecial);
        return cachedVoice;
      }
    }
    return null;
  } catch (error) {
    console.error(`Lỗi khi get link cache của voice ${fileName}:`, error);
    return null;
  }
}

export const PLATFORM_FILE = "ZaloFileCache";
export async function handleCheckLinkFromFilesLocal(fileName, apiPush) {
  const api = apiPush ? apiPush : getGlobalApi();
  const dataFilesPath = FILES_RESOURCE_PATH(api.getBotId());
  const files = fs.readdirSync(dataFilesPath);
  let dataFindFile = files.find((file) => file === fileName);
  // if (!dataFindFile) dataFindFile = files.find(file => path.parse(file).name === fileName);
  // if (!dataFindFile) dataFindFile = files.find(file => path.parse(file).name.includes(fileName));

  if (!dataFindFile) {
    const filesGlobal = fs.readdirSync(FILES_RESOURCE_PATH_GLOBAL);
    dataFindFile = filesGlobal.find((file) => file === fileName);
  }

  if (!dataFindFile) return null;

  const fileExt = path.parse(dataFindFile).ext.replace(".", "");
  const nameFileSpecial = path.parse(dataFindFile).name;
  const filePath = path.join(dataFilesPath, dataFindFile);

  try {
    const fileHash = await calculateFileHash(filePath);
    let cachedFile = await getCachedMedia(PLATFORM_FILE, nameFileSpecial, fileExt, nameFileSpecial);

    if (cachedFile && cachedFile.fileHash === fileHash) {
      return cachedFile;
    } else {
      const linkUploadZalo = await uploadFileZalo(filePath, api);
      const urlFinal = linkUploadZalo[0].fileUrl || linkUploadZalo[0].normalUrl;
      if (urlFinal) {
        setCacheData(
          PLATFORM_FILE,
          nameFileSpecial,
          {
            ...linkUploadZalo[0],
            title: nameFileSpecial,
            fileUrl: urlFinal,
            type: fileExt,
            fileHash: fileHash,
          },
          fileExt
        );
        cachedFile = await getCachedMedia(PLATFORM_FILE, nameFileSpecial, fileExt, nameFileSpecial);
        return cachedFile;
      }
    }
    return null;
  } catch (error) {
    console.error(`Lỗi khi get link cache của file ${fileName}:`, error);
    return null;
  }
}

export const PLATFORM_STICKER = "ZaloCustomSticker";
export async function handleCheckLinkFromStickersLocal(fileName, apiPush) {
  const api = apiPush ? apiPush : getGlobalApi();
  const dataStickerPath = STICKERS_RESOURCE_PATH(api.getBotId());
  const files = fs.readdirSync(dataStickerPath);
  let dataFindFileSticker;
  // if (!dataFindFileSticker) dataFindFileSticker = files.find(file => file === fileName);
  if (!dataFindFileSticker) dataFindFileSticker = files.find((file) => path.parse(file).name === fileName);
  // if (!dataFindFileSticker) dataFindFileSticker = files.find(file => path.parse(file).name.includes(fileName));

  if (!dataFindFileSticker) {
    const filesGlobal = fs.readdirSync(STICKERS_RESOURCE_PATH_GLOBAL);
    dataFindFileSticker = filesGlobal.find((file) => path.parse(file).name === fileName);
  }

  if (!dataFindFileSticker) return null;

  const fileExt = path.parse(dataFindFileSticker).ext.replace(".", "");
  const nameFileSpecial = path.parse(dataFindFileSticker).name;
  const filePath = path.join(dataStickerPath, dataFindFileSticker);
  let pathWebp = null;

  try {
    const fileHash = await calculateFileHash(filePath);
    let cachedSticker = await getCachedMedia(PLATFORM_STICKER, nameFileSpecial, fileExt, nameFileSpecial);

    if (cachedSticker && cachedSticker.fileHash === fileHash) {
      return cachedSticker;
    } else {
      pathWebp = path.join(tempDir, `sticker_${randomIDTemp()}.webp`);
      let uploadFile = pathWebp;
      if (fileExt === "webp") {
        uploadFile = filePath;
      } else {
        await convertToWebp(filePath, pathWebp);
      }

      const stickerData = await getVideoMetadata(filePath);
      const linkUploadZalo = await uploadFileZalo(uploadFile, api, true);
      const urlFinal = linkUploadZalo[0].fileUrl || linkUploadZalo[0].normalUrl;
      if (urlFinal) {
        setCacheData(
          PLATFORM_STICKER,
          nameFileSpecial,
          {
            ...linkUploadZalo[0],
            title: nameFileSpecial,
            fileUrl: urlFinal,
            type: fileExt,
            ...stickerData,
            fileHash: fileHash,
          },
          fileExt
        );
        cachedSticker = await getCachedMedia(PLATFORM_STICKER, nameFileSpecial, fileExt, nameFileSpecial);
        return cachedSticker;
      }
    }
    return null;
  } catch (error) {
    console.error(`Lỗi khi get link cache của sticker ${fileName}:`, error);
    return null;
  } finally {
    if (pathWebp) await deleteFile(pathWebp);
  }
}

export const PLATFORM_GIF = "ZaloGifCache";
export async function handleCheckLinkFromGifLocal(fileName, apiPush) {
  const api = apiPush ? apiPush : getGlobalApi();
  const dataGifPath = GIFS_RESOURCE_PATH(api.getBotId());
  const files = fs.readdirSync(dataGifPath);
  let gifFile = files.find((file) => file === fileName);
  if (!gifFile) gifFile = files.find((file) => path.parse(file).name === fileName);
  // if (!gifFile) gifFile = files.find(file => path.parse(file).name.includes(fileName));

  if (!gifFile) {
    const filesGlobal = fs.readdirSync(GIFS_RESOURCE_PATH_GLOBAL);
    gifFile = filesGlobal.find((file) => file === fileName);
    if (!gifFile) gifFile = filesGlobal.find((file) => path.parse(file).name === fileName);
  }

  if (!gifFile) return null;

  const fileExt = path.parse(gifFile).ext.replace(".", "");
  const nameFileGif = path.parse(gifFile).name;
  const gifPath = path.join(dataGifPath, gifFile);

  try {
    const fileHash = await calculateFileHash(gifPath);
    let cachedGif = await getCachedMedia(PLATFORM_GIF, nameFileGif, fileExt, nameFileGif);

    if (cachedGif && cachedGif.fileHash === fileHash) {
      return cachedGif;
    } else {
      const linkUploadZalo = await uploadFileZalo(gifPath, api);
      const urlFinal = linkUploadZalo[0].fileUrl || linkUploadZalo[0].normalUrl;
      if (urlFinal) {
        setCacheData(
          PLATFORM_GIF,
          nameFileGif,
          {
            ...linkUploadZalo[0],
            title: nameFileGif,
            fileUrl: urlFinal,
            type: fileExt,
            fileHash: fileHash,
          },
          fileExt
        );
        return await getCachedMedia(PLATFORM_GIF, nameFileGif, fileExt, nameFileGif);
      }
    }
    return null;
  } catch (error) {
    console.error(`Lỗi khi get link cache của gif ${fileName}:`, error);
    return null;
  }
}

export async function calculateFileHash(filePath) {
  try {
    const CHUNK_SIZE = 64 * 1024;
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;

    const h64 = xxhashAPI.h64;

    if (fileSize < CHUNK_SIZE * 2) {
      const content = fs.readFileSync(filePath);
      return h64(content.toString(), BigInt(0xcafebabe)).toString(16);
    }

    const firstChunk = Buffer.alloc(CHUNK_SIZE);
    const lastChunk = Buffer.alloc(CHUNK_SIZE);

    const fd = fs.openSync(filePath, "r");
    try {
      fs.readSync(fd, firstChunk, 0, CHUNK_SIZE, 0);
      fs.readSync(fd, lastChunk, 0, CHUNK_SIZE, fileSize - CHUNK_SIZE);
    } finally {
      fs.closeSync(fd);
    }

    const combinedBuffer = Buffer.concat([Buffer.from(fileSize.toString()), firstChunk, lastChunk]);

    return h64(combinedBuffer.toString(), BigInt(0xcafebabe)).toString(16);
  } catch (error) {
    console.error("Lỗi khi tính hash:", error);
    return Date.now().toString();
  }
}

export async function calculateFileHashFromURLByBuffer(fileURL) {
  try {
    const CHUNK_SIZE = 64 * 1024;
    const { data } = await client.get(fileURL, { responseType: "arraybuffer" });
    const fileBuffer = Buffer.from(data);
    const fileSize = fileBuffer.length;

    const h64 = xxhashAPI.h64;

    if (fileSize < CHUNK_SIZE * 2) {
      return {
        status: "success",
        hashCode: h64(fileBuffer.toString(), BigInt(0xcafebabe)).toString(16),
        data: data,
      };
    }

    const firstChunk = fileBuffer.subarray(0, CHUNK_SIZE);
    const lastChunk = fileBuffer.subarray(fileSize - CHUNK_SIZE, fileSize);

    const combinedBuffer = Buffer.concat([Buffer.from(fileSize.toString()), firstChunk, lastChunk]);

    return {
      status: "success",
      hashCode: h64(combinedBuffer.toString(), BigInt(0xcafebabe)).toString(16),
      data: data,
    };
  } catch (error) {
    console.error("Lỗi khi tính hash:", error);
    return {
      status: "error",
      message: "Lỗi khi tính hash.",
    };
  }
}

export async function calculateFileHashFromURLByStream(fileURL) {
  try {
    const CHUNK_SIZE = 64 * 1024;
    const h64 = xxhashAPI.h64;

    const response = await client.get(fileURL, { responseType: "stream" });
    const stream = response.data;

    let firstChunk = null;
    let lastChunk = null;
    let fileSize = 0;
    let receivedSize = 0;

    const chunks = [];

    return new Promise((resolve, reject) => {
      stream.on("data", (chunk) => {
        receivedSize += chunk.length;
        chunks.push(chunk);

        if (fileSize === 0 && receivedSize >= CHUNK_SIZE) {
          firstChunk = Buffer.concat(chunks).subarray(0, CHUNK_SIZE);
          chunks.length = 0;
        }
      });

      stream.on("end", async () => {
        fileSize = receivedSize;

        if (fileSize < CHUNK_SIZE * 2) {
          const fileBuffer = Buffer.concat(chunks);
          resolve({
            status: "success",
            hashCode: h64(fileBuffer.toString(), BigInt(0xcafebabe)).toString(16),
          });
          return;
        }

        lastChunk = Buffer.concat(chunks).subarray(-CHUNK_SIZE);

        const combinedBuffer = Buffer.concat([Buffer.from(fileSize.toString()), firstChunk, lastChunk]);

        const hashCodeResult = h64(combinedBuffer.toString(), BigInt(0xcafebabe)).toString(16);

        resolve({
          status: "success",
          hashCode: hashCodeResult,
        });
      });

      stream.on("error", (error) => {
        console.error("Lỗi khi tính hash:", error);
        reject({ status: "error", message: "Lỗi khi tính hash." });
      });
    });
  } catch (error) {
    console.error("Lỗi khi tải file:", error);
    return { status: "error", message: "Lỗi khi tải file." };
  }
}
