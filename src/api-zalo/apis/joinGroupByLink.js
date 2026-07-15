import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const joinGroupByLinkFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.group[0]}/api/group/link/join`);

  /**
   * Tham gia nhóm thông qua link | Join group by link
   *
   * @param {string} link - Link tham gia nhóm (dạng https://zalo.me/g/xxxxxx) | Link to join group (https://zalo.me/g/xxxxxx)
   * @throws {ZaloApiError}
   */
  return async function joinGroupByLink(link) {
    if (!link) throw new ZaloApiError("Missing link");

    const params = {
      link: link,
      clientLang: appContext.language || "vi",
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
