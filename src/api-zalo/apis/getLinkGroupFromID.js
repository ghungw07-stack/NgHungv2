import { apiFactory } from "../utils.js";
import { ZaloApiError } from "../index.js";

export const getLinkGroupFromIDFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.group[0]}/api/group/link/detail`);
  /**
   * Lấy link nhóm từ ID | Get group link from ID
   *
   * @param {string|number} groupId - ID của nhóm cần lấy danh sách thành viên | ID of the group to get link
   * @throws {ZaloApiError}
   */
  return async function getLinkGroupFromID(groupId) {
    if (!groupId) throw new ZaloApiError("Missing groupId");

    const params = {
      grid: String(groupId),
      imei: appContext.imei,
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
