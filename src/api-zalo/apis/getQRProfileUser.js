import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const getQRProfileUserFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.friend[0]}/api/friend/mget-qr`);

  /**
   * Lấy Link QR của người dùng | Get QR link of user
   *
   * @param {string|number} userId ID người dùng của danh thiếp | User ID of the card
   */
  return async function getQRProfileUser(userId) {
    if (!userId) throw new ZaloApiError("User ID is not available");

    const params = {
      fids: [userId.toString()],
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
