import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const removeFriendAliasFactory = apiFactory()((api, appContext, utils) => {
  const baseServiceURL = `${api.zpwServiceMap.alias[0]}/api/alias/remove`;

  /**
   * Xóa biệt danh (alias) của bạn bè | Remove friend's alias
   *
   * @param {string} friendId ID của bạn bè | Friend ID
   *
   * @throws {ZaloApiError}
   */
  return async function removeFriendAlias(friendId) {
    if (!friendId) throw new ZaloApiError("Missing friendId");

    const params = {
      friendId: friendId,
    };

    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    const serviceURL = utils.makeURL(baseServiceURL, { params: encryptedParams });
    const response = await utils.request(serviceURL, {
      method: "GET",
    });

    return await utils.resolve(response);
  };
});

