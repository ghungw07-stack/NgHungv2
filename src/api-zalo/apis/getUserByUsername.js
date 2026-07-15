import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const getUserByUsernameFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.friend[0]}/api/friend/search/by-user-name`);
  /**
   * Find user by username | Tìm người dùng bằng tên người dùng
   *
   * @param {string} username Username | Tên người dùng
   * @throws {ZaloApiError}
   */
  return async function getUserByUsername(username) {
    if (!username) throw new ZaloApiError("Missing username");

    const params = {
      user_name: username,
      avatar_size: 240,
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
