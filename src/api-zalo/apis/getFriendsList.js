import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const getFriendsListFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.profile[0]}/api/social/friend/getfriends`);
  /**
   * Lấy danh sách tất cả bạn bè | Get all friends
   *
   * @throws {ZaloApiError}
   */
  return async function getFriendsList(count = 20000, page = 1) {
    const params = {
      incInvalid: 1,
      page,
      count,
      avatar_size: 120,
      actiontime: 0,
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
