import fs from "fs";
import path from "path";
import FormData from "form-data";
import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";
import { randomIntFromInterval } from "../../utils/format-util.js";
import { deleteFile, execAsync } from "../../utils/util.js";
import { tempDir } from "../../utils/io-json.js";

export const uploadThumbnailVideoFactory = apiFactory()((api, appContext, utils) => {
  const directMessageServiceURL = utils.makeURL(`${api.zpwServiceMap.file[0]}/api/message/upthumb`, {
    nretry: "0",
  });

  const groupMessageServiceURL = utils.makeURL(`${api.zpwServiceMap.file[0]}/api/group/upthumb`, {
    nretry: "0",
  });

  /**
   * Upload thumbnail video | Tải ảnh thumbnail video
   *
   * @param {string} filePath Đường dẫn đến file | Path to the file
   * @returns {Promise<object>} Kết quả trả về từ API | Result from API
   */
  return async function uploadThumbnailVideo(fileSource) {
    if (!fileSource) throw new ZaloApiError("Missing file source");

    const tempThumbnail = path.join(tempDir, `thumbnail_${Date.now() + randomIntFromInterval(1000, 9999)}.jpg`);
    const ffmpegCommand = [
      "ffmpeg",
      "-i",
      `"${fileSource}"`,
      "-ss",
      "00:00:02",
      "-vframes",
      "1",
      `"${tempThumbnail}"`,
    ].join(" ");

    let formData = new FormData();
    let fileHandle;
    try {
      await execAsync(ffmpegCommand);
      fileHandle = await fs.promises.open(tempThumbnail, "r");
      const fileContent = await fileHandle.readFile();
      formData.append("fileContent", fileContent, {
        filename: "blob",
        contentType: "image/jpeg",
      });
    } finally {
      if (fileHandle) await fileHandle.close();
      await deleteFile(tempThumbnail);
    }

    const params = {
      clientId: Date.now(),
      imei: appContext.imei,
    };
    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt message");

    let response = await utils.request(
      utils.makeURL(directMessageServiceURL + "upthumb?", { params: encryptedParams }, false),
      {
        method: "POST",
        headers: formData.getHeaders(),
        body: formData.getBuffer(),
      }
    );
    return await utils.resolve(response);
  };
});
