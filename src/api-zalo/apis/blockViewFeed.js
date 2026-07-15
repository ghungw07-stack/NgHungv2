import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const blockViewFeedFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.friend[0]}/api/friend/feed/block`);

  /**
   * Chặn/Bỏ chặn xem feed của bạn bè | Block/Unblock friend view feed by ID
   *
   * @param {boolean} isBlockFeed true để chặn, false để bỏ chặn | true to block, false to unblock
   * @param {string} userId ID người dùng cần chặn/bỏ chặn | User ID to block/unblock
   *
   * @throws {ZaloApiError}
   */
  return async function blockViewFeed(isBlockFeed, userId) {
    if (!userId) throw new ZaloApiError("Missing userId");

    const params = {
      fid: userId,
      isBlockFeed: isBlockFeed ? 1 : 0,
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

