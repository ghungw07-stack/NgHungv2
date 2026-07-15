import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const getPersonalizedStickerListFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.sticker}/api/message/sticker/personalized/list`);
  /**
   * Get stickers personal | Lấy stickers cá nhân
   *
   * @returns Sticker Data Personal | Dữ liệu stickers cá nhân
   *
   * @throws ZaloApiError
   */
  return async function getPersonalizedStickerList() {
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
