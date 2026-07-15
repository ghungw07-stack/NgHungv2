import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const getRecommendedFriendsFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.friend[0]}/api/friend/recommendsv2/list`);

  /**
   * Lấy danh sách người dùng gợi ý | Get friend recommendations
   *
   * @throws {ZaloApiError}
   */
  return async function getRecommendedFriends() {
    const params = {
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
