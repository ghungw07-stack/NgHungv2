import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const getAvatarUrlProfileFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.profile[0]}/api/social/profile/avatar`);

  /**
   * Lấy avatar người dùng | Get user avatar
   *
   * @param {string|number} userId ID người dùng của danh thiếp | User ID of the card
   * @throws {ZaloApiError}
   */
  return async function getAvatarUrlProfile(userId) {
    if (!userId) throw new ZaloApiError("User ID is not available");

    const params = {
      fid: userId.toString(),
      imei: appContext.imei,
    };

    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    const response = await utils.request(serviceURL, {
      method: "POST",
      body: new URLSearchParams({
        params: encryptedParams,
      }),
    });

    return await utils.resolve(response);
  };
});
