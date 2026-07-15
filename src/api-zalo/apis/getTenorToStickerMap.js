import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const getTenorToStickerMapFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.sticker}/api/message/sticker/tenor/mapping`);
  /**
   * Get stickers by keyword | Lấy stickers bằng từ khóa
   *
   * @param keyword Keyword to search for | Từ khóa để tìm kiếm
   * @returns Sticker IDs | ID của stickers
   *
   * @throws ZaloApiError
   */
  return async function getTenorToStickerMap(keyword) {
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
    const tenorStickerMap = await utils.resolve(response);
    const stickerTenorMap = [];
    if (tenorStickerMap.tenor_sticker_map)
      tenorStickerMap.tenor_sticker_map.forEach((tenorSticker) =>
        stickerTenorMap.push({
          id: tenorSticker.id,
          cid: tenorSticker.cid,
          eid: tenorSticker.eid,
        })
      );
    return stickerTenorMap;
  };
});
