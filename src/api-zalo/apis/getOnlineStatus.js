import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const getOnlineStatusFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.profile[0]}/api/social/profile/lastOnline`);
  /**
   * get Online Status | Lấy trạng thái online của người dùng
   *
   * @param {string} userId ID người dùng | User ID
   * @throws {ZaloApiError}
   */
  return async function getOnlineStatus(userId) {
    if (!userId) throw new ZaloApiError("Missing userId");
    const params = {
      uid: userId,
      conv_type: 1,
      imei: appContext.imei,
    };
    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt message");
    const response = await utils.request(serviceURL, {
      method: "POST",
      body: new URLSearchParams({
        params: encryptedParams,
      }),
    });
    return await utils.resolve(response);
  };
});
