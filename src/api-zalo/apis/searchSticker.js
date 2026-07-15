import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const searchStickerFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.sticker}/api/message/sticker/search`);
  /**
   * Get stickers by keyword | Lấy stickers bằng từ khóa
   *
   * @param keyword Keyword to search for | Từ khóa để tìm kiếm
   * @returns Sticker IDs
   *
   * @throws ZaloApiError
   */
  return async function searchSticker(keyword) {
    if (!keyword) throw new ZaloApiError("Missing keyword");
    const params = {
      keyword: keyword,
      limit: 40,
      srcType: 1,
      imei: appContext.imei,
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
