import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const blockUserFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.friend[0]}/api/friend/block`);
  /**
   * Chặn tin nhắn từ người dùng theo ID. | Block messages from user by ID
   *
   * @param {string|number} userId - ID của người dùng cần chặn | ID of the user to block
   * @throws {ZaloApiError}
   */
  return async function blockUser(userId) {
    if (!userId) throw new ZaloApiError("Missing userId");

    const params = {
      fid: String(userId),
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

