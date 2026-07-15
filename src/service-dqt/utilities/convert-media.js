import fs from "fs";
import path from "path";
import sharp from "sharp";
import cloudmersiveConvertApiClient from "cloudmersive-convert-api-client";
import { getGlobalPrefix } from "../service.js";
import { removeMention } from "../../utils/format-util.js";
import { getFileTypeRemote, downloadFile, deleteFile, execAsync, TIME_HOUR_24 } from "../../utils/util.js";
import {
  sendMessageCompleteRequest,
  sendMessageProcessingRequest,
  sendMessageWarningRequest,
} from "../chat-zalo/chat-style/chat-style.js";
import { tempDir } from "../../utils/io-json.js";
import { asyncPool } from "../../api-zalo/utils.js";
import { getApiKeysMedia } from "../../utils/api-key-manager.js";
import { downloadsCache } from "../../utils/download-upload-cache.js";

const API_KEY_CLOUDMERSIVE = getApiKeysMedia("CLOUDMERSIVE")[0] || "";

const defaultClient = cloudmersiveConvertApiClient.ApiClient.instance;
const Apikey = defaultClient.authentications["Apikey"];
Apikey.apiKey = API_KEY_CLOUDMERSIVE;

async function convertWithCloudmersive(inputFilePath, outputFilePath, extSource, extResult) {
  const convertApi = new cloudmersiveConvertApiClient.ConvertDocumentApi();
  const inputFile = fs.createReadStream(inputFilePath);

  return new Promise((resolve, reject) => {
    if (["doc", "docx"].includes(extSource) && extResult === "pdf") {
      convertApi.convertDocumentDocxToPdf(inputFile, (error, data) => {
        if (error) {
          return reject("Chuyển đổi thất bại: " + error.message);
        }
        fs.writeFile(outputFilePath, data, (writeError) => {
          if (writeError) {
            return reject("Lỗi khi ghi file kết quả: " + writeError.message);
          }
          resolve();
        });
      });
    } else if (["xls", "xlsx"].includes(extSource) && extResult === "pdf") {
      convertApi.convertDocumentXlsxToPdf(inputFile, (error, data) => {
        if (error) {
          return reject("Chuyển đổi thất bại: " + error.message);
        }
        fs.writeFile(outputFilePath, data, (writeError) => {
          if (writeError) {
            return reject("Lỗi khi ghi file kết quả: " + writeError.message);
          }
          resolve();
        });
      });
    } else if (["ppt", "pptx"].includes(extSource) && extResult === "pdf") {
      convertApi.convertDocumentPptxToPdf(inputFile, (error, data) => {
        if (error) {
          return reject("Chuyển đổi thất bại: " + error.message);
        }
        fs.writeFile(outputFilePath, data, (writeError) => {
          if (writeError) {
            return reject("Lỗi khi ghi file kết quả: " + writeError.message);
          }
          resolve();
        });
      });
    } else if (extSource === "pdf" && extResult === "docx") {
      convertApi.convertDocumentPdfToDocx(inputFile, (error, data) => {
        if (error) {
          return reject("Chuyển đổi thất bại: " + error.message);
        }
        fs.writeFile(outputFilePath, data, (writeError) => {
          if (writeError) {
            return reject("Lỗi khi ghi file kết quả: " + writeError.message);
          }
          resolve();
        });
      });
    } else if (extSource === "pdf" && extResult === "pptx") {
      convertApi.convertDocumentPdfToPptx(inputFile, (error, data) => {
        if (error) {
          return reject("Chuyển đổi thất bại: " + error.message);
        }
        fs.writeFile(outputFilePath, data, (writeError) => {
          if (writeError) {
            return reject("Lỗi khi ghi file kết quả: " + writeError.message);
          }
          resolve();
        });
      });
    } else if (extSource === "pdf" && extResult === "xlsx") {
      convertApi.convertDocumentPdfToXlsx(inputFile, (error, data) => {
        if (error) {
          return reject("Chuyển đổi thất bại: " + error.message);
        }
        fs.writeFile(outputFilePath, data, (writeError) => {
          if (writeError) {
            return reject("Lỗi khi ghi file kết quả: " + writeError.message);
          }
          resolve();
        });
      });
    } else {
      return reject("Không hỗ trợ chuyển đổi giữa định dạng " + extSource + " và " + extResult);
    }
  });
}

export async function processStaticWebp(inputPath, outputPath, outputFormat) {
  let fileHandle;
  try {
    fileHandle = await fs.promises.open(inputPath, "r");
    const fileData = await fileHandle.readFile();
    const metadata = await sharp(fileData).metadata();

    if (metadata.pages && metadata.pages > 1) {
      return { error: true, message: "File WebP là động, không thể xử lý như WebP tĩnh." };
    }

    await sharp(fileData).toFormat(outputFormat).toFile(outputPath);

    return { error: false, outputPath };
  } catch (err) {
    return { error: true, message: err.message.slice(0, 1000) + "..." };
  } finally {
    if (fileHandle) {
      await fileHandle.close();
    }
  }
}

export async function extractWebpFrames(inputPath, outputDir, outputFilePath, extResult) {
  let fileHandle;
  try {
    fs.promises.mkdir(outputDir, { recursive: true });

    fileHandle = await fs.promises.open(inputPath, "r");
    const fileData = await fileHandle.readFile();
    const metadata = await sharp(fileData).metadata();

    if (!metadata.pages) {
      return { error: true, message: "Không thể chuyển đổi webp tĩnh sang định dạng động." };
    }

    const frames = Array.from({ length: metadata.pages }, (_, i) => {
      const framePath = path.join(outputDir, `frame_${i.toString().padStart(4, "0")}.png`);
      return () => sharp(fileData, { page: i }).png().toFile(framePath);
    });

    await asyncPool(5, frames, (fn) => fn());

    switch (extResult) {
      case "gif":
        await combineFramesToGif(outputDir, outputFilePath);
        break;
      case "mkv":
        await combineFramesToMkv(outputDir, outputFilePath);
        break;
      case "avi":
        await combineFramesToAvi(outputDir, outputFilePath);
        break;
      default:
        await combineFramesToMp4(outputDir, outputFilePath);
        break;
    }

    return { error: false };
  } catch (err) {
    return { error: true, message: err.message.slice(0, 1000) + "..." };
  } finally {
    if (fileHandle) {
      await fileHandle.close();
    }
  }
}

export async function combineFramesToMp4(framesDir, outputPath) {
  const ffmpegCommand = `ffmpeg -framerate 30 -i "${framesDir}/frame_%04d.png" -c:v libx264 -pix_fmt yuv420p "${outputPath}"`;
  await execAsync(ffmpegCommand);
}

export async function combineFramesToGif(framesDir, outputPath) {
  const ffmpegCommand =
    `ffmpeg -framerate 30 -i "${framesDir}/frame_%04d.png" -vf "palettegen" -y "${framesDir}/palette.png" && ` +
    `ffmpeg -framerate 30 -i "${framesDir}/frame_%04d.png" -i "${framesDir}/palette.png" -lavfi "paletteuse" -y "${outputPath}"`;
  await execAsync(ffmpegCommand);
}

export async function combineFramesToMkv(framesDir, outputPath) {
  const ffmpegCommand = `ffmpeg -framerate 30 -i "${framesDir}/frame_%04d.png" -c:v libx264 -pix_fmt yuv420p "${outputPath}"`;
  await execAsync(ffmpegCommand);
}

export async function combineFramesToAvi(framesDir, outputPath) {
  const ffmpegCommand = `ffmpeg -framerate 30 -i "${framesDir}/frame_%04d.png" -c:v libxvid -qscale:v 5 "${outputPath}"`;
  await execAsync(ffmpegCommand);
}

export async function handleConvertMediaFile(api, message, aliasCommand) {
  const prefix = getGlobalPrefix(api.getBotId());
  const content = removeMention(message);
  const quote = message.data.quote;
  const tempFiles = [];

  try {
    const args = content.replace(`${prefix}${aliasCommand}`, "").trim().split(" ");
    let url = null;
    let extResult = null;
    let extSource = null;

    if (args.length > 0) {
      extResult = args[0].toLowerCase();
      url = args[1] || null;
    }

    if (!url && quote?.attach) {
      const attachData = JSON.parse(quote.attach);
      url = attachData.href;
    }

    if (!url) {
      const object = {
        caption:
          `Vui lòng cung cấp link media hoặc reply một tin nhắn chứa nội dung cần chuyển đổi` +
          `\nCách dùng: ${prefix}${aliasCommand} <loại định dạng muốn chuyển đổi> <link hoặc quote tin nhắn>` +
          `\nVí dụ:` +
          `\n${prefix}${aliasCommand} mp4 [link]`,
      };
      await sendMessageWarningRequest(api, message, object, 180000);
      return;
    }

    if (!extResult) {
      const object = {
        caption:
          `Vui lòng cung cấp định dạng cần chuyển đổi!` +
          `\nCách dùng: ${prefix}${aliasCommand} <loại định dạng muốn chuyển đổi> <link hoặc quote tin nhắn>` +
          `\nVí dụ:` +
          `\n${prefix}${aliasCommand} mp4 [link]`,
      };
      await sendMessageWarningRequest(api, message, object, 180000);
      return;
    }

    extSource = await getFileTypeRemote(url);
    if (!extSource) {
      const object = {
        caption: `Không thể xác định định dạng của file nguồn!, không thể chuyển đổi định dạng file này...`,
      };
      await sendMessageWarningRequest(api, message, object, 180000);
      return;
    }

    await sendMessageProcessingRequest(api, message, { caption: `⏳ Đang xử lý chuyển đổi...` }, 30000);

    const nameFile = `fileConvert_${Date.now()}.${extResult}`;
    const inputFilePath = path.join(tempDir, `ftempInput_${Date.now()}.${extSource.ext}`);
    const outputFilePath = path.join(tempDir, nameFile);
    tempFiles.push(inputFilePath, outputFilePath);

    await downloadFile(url, inputFilePath);

    switch (`${extSource.ext}`) {
      case "webp":
        const animationExt = ["gif", "mp4", "mkv", "avi"];
        const staticExt = ["png", "jpg", "jpeg"];
        if (animationExt.includes(extResult)) {
          const framesDir = path.join(tempDir, `frames_${Date.now()}`);
          try {
            const result = await extractWebpFrames(inputFilePath, framesDir, outputFilePath, extResult);
            if (result.error) {
              throw new Error(result.message);
            }
          } catch (error) {
            const object = {
              caption: `Lỗi khi chuyển đổi định dạng sang ${extResult}: ${error.message}!`,
            };
            await sendMessageWarningRequest(api, message, object, 30000);
            return;
          } finally {
            await fs.promises.rm(framesDir, { recursive: true, force: true });
          }
        } else if (staticExt.includes(extResult)) {
          try {
            const result = await processStaticWebp(inputFilePath, outputFilePath, extResult);
            if (result.error) {
              throw new Error(result.message);
            }
          } catch (error) {
            const object = {
              caption: `Lỗi khi chuyển đổi định dạng sang ${extResult}: ${error.message}!`,
            };
            await sendMessageWarningRequest(api, message, object, 30000);
            return;
          }
        } else {
          const object = {
            caption: `Không hỗ trợ chuyển đổi từ webp sang định dạng ${extResult}.`,
          };
          await sendMessageWarningRequest(api, message, object, 30000);
          return;
        }
        break;

      case "doc":
      case "docx":
      case "xls":
      case "xlsx":
      case "ppt":
      case "pptx":
      case "pdf":
        try {
          await convertWithCloudmersive(inputFilePath, outputFilePath, extSource.ext, extResult);
        } catch (error) {
          console.error("Lỗi khi chuyển đổi định dạng:", error);
          const object = {
            caption: `Lỗi khi chuyển đổi định dạng từ ${extSource.ext} sang ${extResult}: Không hỗ trợ chuyển đổi giữa hai định dạng!`,
          };
          await sendMessageWarningRequest(api, message, object, 30000);
          return;
        }
        break;

      case "m3u8":
        if (extResult === "mp4") {
          const urlVideo = await downloadsCache.getDataDownload(api, message, inputFilePath, {
            type: "m3u8",
            path: outputFilePath,
          });
          const thumbnail = await api.uploadThumbnailVideo(urlVideo[0].fileUrl);
          await sendMessageCompleteRequest(api, message, { caption: `Đã chuyển đổi M3U8 sang Video!` }, TIME_HOUR_24);
          for (let index = 0; index < urlVideo.length; index++) {
            const dataVideo = urlVideo[index];
            await api.sendVideo({
              videoUrl: dataVideo.fileUrl,
              threadId: message.threadId,
              threadType: message.type,
              thumbnail: thumbnail.url,
              metaData: dataVideo,
              message: {
                text: urlVideo.length > 2 ? `📺 [Part ${index + 1}]` : ``,
              },
              ttl: TIME_HOUR_24,
            });
          }
        } else {
          await sendMessageCompleteRequest(api, message, { caption: `M3U8 chỉ có thể chuyển sang MP4!` }, TIME_HOUR_24);
        }
        return;

      case "gif":
        if (extResult === "webp") {
          const ffmpegCommand = `ffmpeg -i "${inputFilePath}" -loop 0 "${outputFilePath}"`;
          await execAsync(ffmpegCommand);
        } else {
          const ffmpegCommand = `ffmpeg -i "${inputFilePath}" "${outputFilePath}"`;
          await execAsync(ffmpegCommand);
        }
        break;

      default:
        const ffmpegCommand = `ffmpeg -i "${inputFilePath}" "${outputFilePath}"`;
        await execAsync(ffmpegCommand);
        break;
    }

    const uploadResult = await api.uploadAttachment([outputFilePath], message.threadId, message.type);
    if (uploadResult && uploadResult.length > 0) {
      const fileUpload = uploadResult[0];
      const linkUpload = fileUpload.fileUrl || fileUpload.normalUrl;
      const sizeUpload = fileUpload.totalSize || fileUpload.fileSize;
      await sendMessageCompleteRequest(api, message, { caption: `Đây là file đã được chuyển đổi!` }, TIME_HOUR_24);
      await api.sendFile(
        message,
        linkUpload,
        TIME_HOUR_24,
        fileUpload.fileName || nameFile,
        sizeUpload,
        extResult,
        fileUpload.checksum
      );
    } else {
      const object = {
        caption: `Không thể tải lên file đã chuyển đổi!`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
    }
  } catch (error) {
    console.error("Lỗi khi xử lý chuyển đổi:", error);
    const object = {
      caption: `Không thể chuyển đổi định dạng. Vui lòng thử lại với file khác hoặc định dạng khác...`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
  } finally {
    await Promise.all(tempFiles.map((file) => deleteFile(file)));
  }
}
