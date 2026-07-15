import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const getAutoReplyListFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.auto_reply[0]}/api/autoreply/list`);

  /**
   * Lấy danh sách auto reply (tự động trả lời) | Get auto reply list
   *
   * @note API này dùng cho zBusiness
   * @throws {ZaloApiError}
   */
  return async function getAutoReplyList() {
    const params = {
      version: 0,
      cliLang: appContext.language || "vi",
    };

    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    const response = await utils.request(utils.makeURL(serviceURL, { params: encryptedParams }), {
      method: "GET",
    });

    return await utils.resolve(response);
  };
});

