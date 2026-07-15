import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const changeGroupOwnerFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.group[0]}/api/group/change-owner`);

  /**
   * Thay đổi chủ sở hữu nhóm (yellow key) theo ID. | Change group owner (yellow key) by ID
   * Client phải là chủ sở hữu của nhóm. | Client must be the owner of the group
   *
   * @param {string|number} newAdminId - ID của thành viên sẽ trở thành chủ sở hữu mới | ID of the member to become new owner
   * @param {string|number} groupId - ID của nhóm cần thay đổi chủ sở hữu | ID of the group to change owner
   * @throws {ZaloApiError}
   */
  return async function changeGroupOwner(groupId, newAdminId) {
    if (!groupId) throw new ZaloApiError("Missing groupId");
    if (!newAdminId) throw new ZaloApiError("Missing newAdminId");

    const params = {
      grid: String(groupId),
      newAdminId: String(newAdminId),
      imei: appContext.imei,
      language: "vi",
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
