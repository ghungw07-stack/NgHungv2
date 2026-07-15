import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const reuseAvatarFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.profile[0]}/api/social/reuse-avatar`);

  /**
   * Reuse avatar | Sử dụng lại avatar
   *
   * @param {string} photoId - Photo ID from getAvatarList API | Photo ID từ API getAvatarList
   *
   * @throws {ZaloApiError}
   */
  return async function reuseAvatar(photoId) {
    if (!photoId) throw new ZaloApiError("Missing photoId");

    const params = {
      photoId: photoId,
      isPostSocial: 0,
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

