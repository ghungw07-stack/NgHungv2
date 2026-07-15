import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const getStickersByKeywordFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.sticker}/api/message/sticker/suggest/stickers`);
  /**
   * Get stickers by keyword | Lấy stickers bằng từ khóa
   *
   * @param keyword Keyword to search for | Từ khóa để tìm kiếm
   * @returns Sticker IDs | ID của stickers
   *
   * @throws {ZaloApiError}
   */
  return async function getStickersByKeyword(keyword) {
    if (!keyword) throw new ZaloApiError("Missing keyword");
    const params = {
      keyword: keyword.toLowerCase(),
      gif: 1,
      guggy: 0,
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
    const suggestions = await utils.resolve(response);
    const stickerIds = [];
    if (suggestions.sugg_sticker)
      suggestions.sugg_sticker.forEach((sticker) =>
        stickerIds.push({
          id: sticker.sticker_id,
          cateId: sticker.cate_id,
          type: sticker.type,
        })
      );
    return stickerIds;
  };
});
