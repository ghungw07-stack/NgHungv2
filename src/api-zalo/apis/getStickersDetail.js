import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const getStickersDetailFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.sticker}/api/message/sticker/sticker_detail`);
  /**
   * Get stickers detail by sticker ids | Lấy chi tiết stickers bằng sticker ids
   *
   * @param {string[]} stickerIds Sticker ids
   * @returns {Promise<any[]>} Sticker details
   * @throws {ZaloApiError}
   */
  return async function getStickersDetail(stickerIds) {
    if (!stickerIds) throw new ZaloApiError("Missing sticker id");
    if (!Array.isArray(stickerIds)) stickerIds = [stickerIds];
    if (stickerIds.length == 0) throw new ZaloApiError("Missing sticker id");
    const stickers = [];
    const tasks = stickerIds.map((stickerId) => getStickerDetail(stickerId));
    const tasksResult = await Promise.allSettled(tasks);
    tasksResult.forEach((result) => {
      if (result.status === "fulfilled") stickers.push(result.value);
    });
    return stickers;
  };
  async function getStickerDetail(stickerId) {
    const params = {
      sid: stickerId,
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
  }
});
