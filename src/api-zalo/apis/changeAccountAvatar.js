import FormData from "form-data";
import fs from "fs";
import { ZaloApiError } from "../index.js";
import { apiFactory, getFullTimeFromMilisecond, getImageMetaData } from "../utils.js";

export const changeAccountAvatarFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.file[0]}/api/profile/upavatar`);
  /**
   * Change account avatar | Thay đổi ảnh đại diện tài khoản
   *
   * @param {string} avatarSource Path to the image file | Đường dẫn đến tệp ảnh
   * @throws {ZaloApiError}
   */
  return async function changeAccountAvatar(avatarSource) {
    if (!avatarSource) throw new ZaloApiError("Missing avatarSource");

    const imageMetaData = await getImageMetaData(avatarSource);
    const fileSize = imageMetaData.totalSize || 0;

    const params = {
      avatarSize: 120,
      clientId: String(appContext.uid + getFullTimeFromMilisecond(new Date().getTime())),
      language: appContext.language || "vi",
      metaData: JSON.stringify({
        origin: {
          width: imageMetaData.width || 1080,
          height: imageMetaData.height || 1080,
        },
        processed: {
          width: imageMetaData.width || 1080,
          height: imageMetaData.height || 1080,
          size: fileSize,
        },
      }),
    };

    const avatarData = fs.readFileSync(avatarSource);
    const formData = new FormData();
    formData.append("fileContent", avatarData, {
      filename: "blob",
      contentType: "image/jpeg",
    });

    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    const response = await utils.request(
      utils.makeURL(serviceURL, {
        params: encryptedParams,
      }),
      {
        method: "POST",
        headers: formData.getHeaders(),
        body: formData.getBuffer(),
      }
    );

    return await utils.resolve(response);
  };
});

