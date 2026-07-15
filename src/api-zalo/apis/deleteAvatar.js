import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const deleteAvatarFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.profile[0]}/api/social/del-avatars`);

  /**
   * Delete avatar from avatar list | Xóa avatar từ danh sách avatar
   *
   * @param {string|string[]} photoId - Avatar photo ID(s) to delete - can be a single string or array of strings | ID ảnh avatar cần xóa - có thể là một chuỗi hoặc mảng chuỗi
   *
   * @throws {ZaloApiError}
   */
  return async function deleteAvatar(photoId) {
    if (!photoId) throw new ZaloApiError("Missing photoId");

    const photoIds = Array.isArray(photoId) ? photoId : [photoId];
    const delPhotos = photoIds.map((id) => ({ photoId: id }));

    const params = {
      delPhotos: JSON.stringify(delPhotos),
      imei: appContext.imei,
    };

    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    const response = await utils.request(utils.makeURL(serviceURL, { params: encryptedParams }), {
      method: "GET",
    });

    return await utils.resolve(response);
  };
});

