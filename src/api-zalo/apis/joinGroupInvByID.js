import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const joinGroupByIDFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.group[0]}/api/group/inv-box/join`);

  /**
   * Tham gia nhóm được mời thông qua id | Join group invited by id
   *
   * @param {string} id - ID nhóm
   * @throws {ZaloApiError}
   */
  return async function joinGroupByID(id) {
    if (!id) throw new ZaloApiError("ID is not available");

    const params = {
      grid: id,
      lang: appContext.language || "vi",
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
