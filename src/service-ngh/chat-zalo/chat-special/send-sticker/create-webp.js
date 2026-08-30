import ffmpeg from "fluent-ffmpeg";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { Readable } from "stream";
import { tempDir } from "../../../../utils/io-json.js";
import { getVideoMetadata } from "../../../../api-zalo/utils.js";
import { checkExstentionFileRemote, deleteFile, downloadFile, execAsync } from "../../../../utils/util.js";
import { spawn } from "child_process";
import { getNameServer, sendMessageCompleteRequest, sendMessageWarningRequest } from "../../chat-style/chat-style.js";
import { getCachedMedia, setCacheData } from "../../../../utils/link-platform-cache.js";
import { randomIDTemp } from "../../../../utils/format-util.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const QUANTITY_CORE = os.cpus().length;
export const PLATFORM_CIRCLE_WEPB = "CIRCLE_WEBP";

export const FRAME_RATE = 10;
export const TIME_CIRCLE = 4;
export const TOTAL_FRAME = TIME_CIRCLE * FRAME_RATE;

const arrUpload = [];

export async function createCircleWebp(api, message, imageUrl, idImage, timeCircleSeconds = TIME_CIRCLE) {
  const validTime = Math.max(0.5, Math.min(15, timeCircleSeconds || TIME_CIRCLE));
  const cacheKey = `${idImage}_t${validTime}`;
  let cachedCircle = await getCachedMedia(PLATFORM_CIRCLE_WEPB, cacheKey, "webp");
  if (cachedCircle) return cachedCircle;

  if (arrUpload.includes(cacheKey)) return null;
  arrUpload.push(cacheKey);

  // const object = {
  //   caption: `Đang khởi tạo đĩa nhạc cho bài hát này...`,
  // };
  // await sendMessageCompleteRequest(api, message, object, 20000);
  const ext = await checkExstentionFileRemote(imageUrl);
  const idRandom = randomIDTemp();
  const downloadedImage = path.join(tempDir, `original_${idRandom}.${ext}`);
  const outputWebp = path.join(tempDir, `circle_${idRandom}.webp`);
  try {
    await downloadFile(imageUrl, downloadedImage);

    const size = 512;
    const totalFrames = Math.round(validTime * FRAME_RATE);

    let startTime, endTime, duration;
    const workers = [];
    const workerPath = path.join(__dirname, "frame-worker.js");
    const startFrame = 0;
    const endFrame = totalFrames;

    const childProcess = spawn("node", [workerPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        WORKER_DATA: JSON.stringify({
          downloadedImage,
          startFrame,
          endFrame,
          size,
          totalFrames,
          resultPath: outputWebp,
          FRAME_RATE,
        }),
      },
    });

    workers.push(
      new Promise((resolve, reject) => {
        childProcess.stdout.on("end", () => {
          resolve();
        });

        childProcess.on("error", reject);
        childProcess.on("exit", (code) => {
          if (code !== 0) {
            reject(new Error(`Child process exited with code ${code}`));
          }
        });
      })
    );

    startTime = performance.now();
    await Promise.all(workers);
    endTime = performance.now();
    duration = (endTime - startTime) / 1000;
    if (duration.toFixed(2) > 1) {
      console.log(`⏱️ Thời gian xử lý Webp: ${duration.toFixed(2)} giây`);
    }

    const [linkUploadZalo, stickerData] = await Promise.all([
      api.uploadAttachment([outputWebp], message.threadId, message.type, { uploadCloud: true }),
      getVideoMetadata(outputWebp),
    ]);

    let finalUrl = linkUploadZalo[0].fileUrl || linkUploadZalo[0].normalUrl;
    finalUrl += `.webp`;

    setCacheData(PLATFORM_CIRCLE_WEPB, cacheKey, { ...linkUploadZalo[0], url: finalUrl, stickerData }, "webp");
    return {
      url: finalUrl,
      stickerData: stickerData,
    };
  } catch (error) {
    console.error("Lỗi khi tạo Webp:", error);
    throw error;
  } finally {
    arrUpload.splice(arrUpload.indexOf(cacheKey), 1);
    await deleteFile(downloadedImage);
    await deleteFile(outputWebp);
  }
}

export async function convertToWebpMulti(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .inputOptions(["-framerate", "20"])
      .outputOptions([
        "-c:v",
        "libwebp",
        "-lossless",
        "0",
        "-compression_level",
        "1",
        "-q:v",
        "50",
        "-loop",
        "0",
        "-preset",
        "default",
        "-cpu-used",
        "5",
        "-deadline",
        "realtime",
        "-threads",
        "auto",
        "-vsync",
        "0",
        "-t",
        "8",
      ])
      .save(outputPath)
      .on("end", () => {
        resolve(true);
      })
      .on("error", (err) => {
        console.error("Lỗi khi chuyển đổi sang WebP:", err.message);
        reject(false);
      });
  });
}

export async function createImageWebp(api, message, imageUrl, idImage) {
  const ext = await checkExstentionFileRemote(imageUrl);
  const downloadedImage = path.join(tempDir, `original_${idImage}.${ext}`);
  const outputWebp = path.join(tempDir, `circle_${idImage}.webp`);
  try {
    await downloadFile(imageUrl, downloadedImage);

    const size = 512;
    const circleMask = Buffer.from(`
            <svg width="${size}" height="${size}">
                <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/>
            </svg>
        `);

    const imageBuffer = await fs.promises.readFile(downloadedImage);
    await sharp(imageBuffer)
      .resize(size, size, { fit: "cover", position: "center" })
      .composite([{ input: circleMask, blend: "dest-in" }])
      .toFile(outputWebp);

    const [linkUploadZalo, stickerData] = await Promise.all([
      api.uploadAttachment([outputWebp], message.threadId, message.type, { uploadCloud: true }),
      getVideoMetadata(outputWebp),
    ]);

    let finalUrl = linkUploadZalo[0].fileUrl || linkUploadZalo[0].normalUrl;
    finalUrl += `.webp`;

    return {
      path: outputWebp,
      url: finalUrl,
      stickerData: stickerData,
    };
  } catch (error) {
    console.error("Lỗi khi tạo Webp:", error);
    const object = {
      caption: `Đã xảy ra lỗi khi xử lý hình ảnh!`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return null;
  } finally {
    await deleteFile(downloadedImage);
    await deleteFile(outputWebp);
  }
}

export async function convertToWebpWithRoundedCorners(inputPath, outputPath, borderRadius) {
  try {
    const isCircle = borderRadius === 50;

    let fileHandle = await fs.promises.open(inputPath, "r");
    const fileContent = await fileHandle.readFile();
    let sharpInstance = sharp(fileContent);
    await fileHandle.close();

    const metadata = await sharpInstance.metadata();
    const width = metadata.width || 512;
    const height = metadata.height || width;
    const actualRadius = isCircle ? width / 2 : Math.round((borderRadius / 100) * width);

    if (isCircle) {
      const circleMask = Buffer.from(`
        <svg width="${width}" height="${width}">
          <circle cx="${width / 2}" cy="${width / 2}" r="${width / 2}" fill="white"/>
        </svg>
      `);

      await sharpInstance
        .resize(width, width, { fit: "cover", position: "center" })
        .composite([{ input: circleMask, blend: "dest-in" }])
        .webp({ lossless: false, quality: 60, reductionEffort: 6 })
        .toFile(outputPath);
    } else {
      const roundedCornerMask = Buffer.from(`
        <svg width="${width}" height="${height}">
          <rect x="0" y="0" width="${width}" height="${height}" rx="${actualRadius}" ry="${actualRadius}" fill="white"/>
        </svg>
      `);

      await sharpInstance
        .resize(width, height, { fit: "cover", position: "center" })
        .composite([{ input: roundedCornerMask, blend: "dest-in" }])
        .webp({ lossless: false, quality: 60, reductionEffort: 6 })
        .toFile(outputPath);
    }

    return true;
  } catch (err) {
    console.error("Lỗi khi xử lý bo góc:", err);
    throw err;
  }
}

export async function convertToWebp(inputPath, outputPath, roundedCorners) {
  // if (roundedCorners && roundedCorners > 0) { }

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        "-vf",
        "scale=512:-2:flags=fast_bilinear",
        "-c:v",
        "libwebp",
        "-lossless",
        "0",
        "-compression_level",
        "6",
        "-q:v",
        "60",
        "-loop",
        "0",
        "-preset",
        "default",
        "-cpu-used",
        "4",
        "-deadline",
        "realtime",
        "-threads",
        "auto",
        "-an",
        "-vsync",
        "0",
      ])
      .save(outputPath)
      .on("end", () => {
        resolve(true);
      })
      .on("error", (err) => {
        console.error("Lỗi khi chuyển đổi sang WebP:", err);
        reject(false);
      });
  });
}

/**
 * Giống convertToWebp nhưng cho phép chèn thêm các filter (zoom, pixel, cat, speed)
 * do sticker-effects.js sinh ra. Dùng cho video khi người dùng truyền z(x), pixel(size), cat, sp(x).
 */
export async function convertToWebpWithEffects(inputPath, outputPath, options) {
  const videoFilters = (options && options.videoFilters) || [];
  const speedFilter = (options && options.speedFilter) || null;
  const vfChain = [...videoFilters, ...(speedFilter ? [speedFilter] : [])].join(",");

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        "-vf",
        vfChain,
        "-c:v",
        "libwebp",
        "-lossless",
        "0",
        "-compression_level",
        "6",
        "-q:v",
        "60",
        "-loop",
        "0",
        "-preset",
        "default",
        "-cpu-used",
        "4",
        "-deadline",
        "realtime",
        "-threads",
        "auto",
        "-an",
        "-vsync",
        "0",
      ])
      .save(outputPath)
      .on("end", () => {
        resolve(true);
      })
      .on("error", (err) => {
        console.error("Lỗi khi chuyển đổi sang WebP (effects):", err);
        reject(false);
      });
  });
}
