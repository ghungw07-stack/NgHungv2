import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const deleteAutoReplyFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.auto_reply[0]}/api/autoreply/delete`);

  /**
   * Xóa auto reply (tự động trả lời) | Delete auto reply
   *
   * @param {number} id ID của auto reply cần xóa
   *
   * @note API này dùng cho zBusiness
   * @throws {ZaloApiError}
   */
  return async function deleteAutoReply(id) {
    if (!id && id !== 0) throw new ZaloApiError("Missing id");
    if (typeof id !== "number") throw new ZaloApiError("id must be a number");

    const params = {
      cliLang: appContext.language || "vi",
      id: id,
    };

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

