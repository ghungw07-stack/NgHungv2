import fs from "fs";
import sharp from "sharp";
import FormData from "form-data";
import { ZaloApiError } from "../index.js";
import { apiFactory, getVideoMetadata } from "../utils.js";

export const uploadThumbnailFactory = apiFactory()((api, appContext, utils) => {
  const directMessageServiceURL = utils.makeURL(`${api.zpwServiceMap.file[0]}/api/message/upthumb`, {
    nretry: "0",
  });

  const groupMessageServiceURL = utils.makeURL(`${api.zpwServiceMap.file[0]}/api/group/upthumb`, {
    nretry: "0",
  });

  /**
   * Upload thumbnail | Tải ảnh thumbnail
   *
   * @param {string} filePath Đường dẫn đến file | Path to the file
   * @returns {Promise<object>} Kết quả trả về từ API | Result from API
   */
  return async function uploadThumbnail(filePath) {
    if (!filePath) throw new ZaloApiError("Missing file path");

    let formData = new FormData();
    let fileHandle, dimensions;
    try {
      fileHandle = await fs.promises.open(filePath, "r");
      const fileContent = await fileHandle.readFile();
      let buffer = await sharp(fileContent).png().toBuffer();
      formData.append("fileContent", buffer, {
        filename: "blob",
        contentType: "image/png",
      });
      dimensions = await getVideoMetadata(filePath);
    } finally {
      if (fileHandle) await fileHandle.close();
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

    return {
      ...(await utils.resolve(response)),
      width: dimensions.width || null,
      height: dimensions.height || null,
    };
  };
});
