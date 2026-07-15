import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const changeFriendAliasFactory = apiFactory()((api, appContext, utils) => {
  const baseServiceURL = `${api.zpwServiceMap.alias[0]}/api/alias/update`;

  /**
   * Đổi biệt danh (alias) của bạn bè | Change friend's alias
   *
   * @param {string} alias Biệt danh mới | New alias (nickname)
   * @param {string} friendId ID của bạn bè | Friend ID
   *
   * @throws {ZaloApiError}
   */
  return async function changeFriendAlias(alias, friendId) {
    if (!alias) throw new ZaloApiError("Missing alias");
    if (!friendId) throw new ZaloApiError("Missing friendId");

    const params = {
      friendId: friendId,
      alias: alias,
      imei: appContext.imei,
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

