import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const getStickerListKeyWordsFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.sticker}/api/message/sticker/suggest/keywords`);
  /**
   * Get stickers by keyword | Lấy stickers bằng từ khóa
   *
   * @throws ZaloApiError
   */
  return async function getStickerListKeyWords() {
    const params = {
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
