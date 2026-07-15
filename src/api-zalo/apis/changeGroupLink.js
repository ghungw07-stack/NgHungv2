import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const changeGroupLinkFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.group[0]}/api/group/link/new`);

  /**
   * Tạo link mới cho nhóm | Create new link for group
   * Client phải là chủ sở hữu/quản trị viên của nhóm | Client must be the owner/admin of the group
   *
   * @param {string|number} groupId - ID của nhóm cần đổi link | ID of the group to change link
   * @throws {ZaloApiError}
   */
  return async function changeGroupLink(groupId) {
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
