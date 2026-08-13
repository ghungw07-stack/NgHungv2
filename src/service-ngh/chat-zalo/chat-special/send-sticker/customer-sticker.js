import fs from "fs";
import path from "path";
import { getNameServer, sendMessageCompleteRequest, sendMessageFailed } from "../../chat-style/chat-style.js";
import { getCachedMedia, setCacheData } from "../../../../utils/link-platform-cache.js";
import { STICKERS_RESOURCE_PATH, tempDir } from "../../../../utils/io-json.js";
import { getVideoMetadata } from "../../../../api-zalo/utils.js";
import { convertToWebp } from "./create-webp.js";
import { deleteFile } from "../../../../utils/util.js";
import { getGlobalPrefix } from "../../../service.js";
import { randomIDTemp, removeMention } from "../../../../utils/format-util.js";
import { PLATFORM_STICKER } from "../../../../utils/local-upload-cache.js";

export async function handleSendLocalSticker(api, message, aliasCommand) {
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const content = removeMention(message);
  const keyword = content.replace(prefix + aliasCommand, "").trim();
  const dataStickerPath = STICKERS_RESOURCE_PATH(botId);

  if (!keyword) {
    const files = fs.readdirSync(dataStickerPath);
    const fileList = files
      .map((file, index) => `${index + 1}. ${path.parse(file).name} [${path.parse(file).ext.replace(".", "")}]`)
      .join("\n");
    await sendMessageCompleteRequest(
      api,
      message,
      {
        caption:
          `Đây là những sticker đã lưu trữ:\n${fileList}` +
          `\n\nDùng lệnh: ${prefix}${aliasCommand} <tên sticker> để gửi sticker`,
      },
      1800000
    );
    return;
  }

  await sendLocalSticker(api, message, keyword);
}

export async function sendLocalSticker(api, message, keyword, ttl = 0) {
  const botId = api.getBotId();
  const dataStickerPath = STICKERS_RESOURCE_PATH(botId);
  const files = fs.readdirSync(dataStickerPath);
  let stickerFile;

  const index = parseInt(keyword);
  if (!isNaN(index) && index > 0 && index <= files.length) {
    stickerFile = files[index - 1];
  } else {
    stickerFile = files.find((file) => file === keyword);
    if (!stickerFile) stickerFile = files.find((file) => path.parse(file).name === keyword);
  }

  if (!stickerFile) {
    await sendMessageFailed(
      api,
      message,
      "Trong danh sách lưu trữ không có tên sticker này hoặc số thứ tự không hợp lệ",
      false
    );
    return;
  }

  const fileExt = path.parse(stickerFile).ext.replace(".", "");
  const nameFileSticker = path.parse(stickerFile).name;
  const stickerPath = path.join(dataStickerPath, stickerFile);
  let pathWebp = null;

  try {
    let cachedVideo = await getCachedMedia(PLATFORM_STICKER, nameFileSticker, fileExt, nameFileSticker);
    let webpUrl;
    let width;
    let height;
    if (cachedVideo) {
      webpUrl = cachedVideo.fileUrl;
      width = cachedVideo.width;
      height = cachedVideo.height;
    } else {
      pathWebp = path.join(tempDir, `sticker_${randomIDTemp()}.webp`);
      let uploadFile = pathWebp;
      if (fileExt === "webp") {
        uploadFile = stickerPath;
      } else {
        await convertToWebp(stickerPath, pathWebp);
      }
      const linkUploadZalo = await api.uploadAttachment([uploadFile], message.threadId, message.type, {
        uploadCloud: true,
      });
      webpUrl = linkUploadZalo[0].fileUrl || linkUploadZalo[0].normalUrl;
      webpUrl += `.webp`;

      const stickerData = await getVideoMetadata(stickerPath);
      width = stickerData.width;
      height = stickerData.height;
      setCacheData(
        PLATFORM_STICKER,
        nameFileSticker,
        {
          fileUrl: webpUrl,
          title: nameFileSticker,
          width: width,
          height: height,
          duration: stickerData.duration,
        },
        fileExt
      );
    }

    await api.sendCustomSticker(message, webpUrl, webpUrl, width, height, ttl);
  } catch (error) {
    console.error("Lỗi khi gửi sticker:", error);
  } finally {
    if (pathWebp) await deleteFile(pathWebp);
  }
}
