import FormData from "form-data";
import { ZaloApiError } from "../index.js";
import { apiFactory, getFullTimeFromMilisecond, getImageMetaData } from "../utils.js";
import { readFileSync } from "../../utils/util.js";

export const changeGroupAvatarFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.file[0]}/api/group/upavatar`);
  /**
   * Change group avatar | Thay đổi ảnh đại diện nhóm
   *
   * @param {string|number} groupId Group ID | ID của nhóm
   * @param {string} avatarPath Path to the image file | Đường dẫn đến tệp ảnh
   * @throws {ZaloApiError}
   */
  return async function changeGroupAvatar(groupId, avatarPath) {
    if (!groupId) throw new ZaloApiError("Missing groupId");
    if (!avatarPath) throw new ZaloApiError("Missing avatarPath");
    const params = {
      grid: groupId,
      avatarSize: 120,
      clientId: `g${groupId}${getFullTimeFromMilisecond(new Date().getTime())}`,
      imei: appContext.imei,
    };
    const imageMetaData = await getImageMetaData(avatarPath);
    params.originWidth = imageMetaData.width || 1080;
    params.originHeight = imageMetaData.height || 1080;
    const formData = new FormData();
    formData.append("fileContent", readFileSync(avatarPath), {
      filename: "blob",
      contentType: "image/jpeg",
    });
    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");
    const response = await utils.request(serviceURL + `&params=${encodeURIComponent(encryptedParams)}`, {
      method: "POST",
      headers: formData.getHeaders(),
      body: formData.getBuffer(),
    });
    return await utils.resolve(response);
  };
});
