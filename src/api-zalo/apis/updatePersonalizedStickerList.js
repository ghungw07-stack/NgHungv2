import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const updatePersonalizedStickerListFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.sticker}/api/message/sticker/personalized/update`);
  /**
   * Update stickers personal | Cập nhật stickers cá nhân
   *
   * @param cateId ID Add Sticker Category
   * @param version Version to update
   *
   * @throws ZaloApiError
   */
  return async function updatePersonalizedStickerList(cateIds, version) {
    if (!cateIds) throw new ZaloApiError("Missing cateIds to update");
    if (!version) throw new ZaloApiError("Missing version to update");

    const params = {
      version: version,
      sticker_cates: cateIds,
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
