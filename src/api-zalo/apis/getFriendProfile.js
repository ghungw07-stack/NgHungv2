import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const getFriendProfileFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.profile[0]}/api/social/friend/getprofiles/v2`);
  /**
   * Lấy thông tin người dùng Zalo | Get user info
   *
   * @param userId ID người dùng Zalo hoặc mảng các ID | User ID of Zalo or array of IDs
   *
   * @throws ZaloApiError
   */
  return async function getFriendProfile(userId) {
    if (!userId) throw new ZaloApiError("Missing userId");

    const params = {
      phonebook_version: Math.floor(Date.now() / 1000),
      friend_pversion_map: [],
      avatar_size: 120,
      language: "vi",
      show_online_status: 1,
      imei: appContext.imei,
    };

    if (Array.isArray(userId)) {
      params.friend_pversion_map = userId.map((id) => `${id}_0`);
    } else {
      params.friend_pversion_map.push(`${userId}_0`);
    }

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
