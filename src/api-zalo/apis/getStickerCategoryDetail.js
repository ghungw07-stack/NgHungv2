import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const getStickerCategoryDetailFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.sticker}/api/message/sticker/category/sticker_detail`);
  /**
   * Get stickers category by cid | Lấy danh mục stickers bằng cid
   *
   * @param keyword Keyword to search for | Từ khóa để tìm kiếm
   * @returns Sticker IDs | ID của stickers
   *
   * @throws ZaloApiError
   */
  return async function getStickerCategoryDetail(cid) {
    if (!cid) throw new ZaloApiError("Missing cid");
    const params = { cid };
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
