import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const searchGifFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.sticker}/api/message/giphy/search`);

  /**
   * Lấy avatar người dùng | Get user avatar
   *
   * @param {string} keyword Từ khóa tìm kím gif | Keyword to search for gif
   */
  return async function searchGif(keyword) {
    if (!keyword) throw new ZaloApiError("Keyword is miss");

    const params = { keyword: keyword, offset: 0, limit: 10 };

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
