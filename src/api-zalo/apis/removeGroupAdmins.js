import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const removeGroupAdminsFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.group[0]}/api/group/admins/remove`);

  /**
   * Xóa quản trị viên khỏi nhóm (white key) theo ID. | Remove admin from group (white key) by ID
   *
   * Client phải là chủ sở hữu của nhóm. | Client must be the owner of the group
   *
   * @param {string|string[]} members - Một hoặc nhiều ID quản trị viên cần xóa | One or more admin IDs to remove
   * @param {string|number} groupId - ID của nhóm cần xóa quản trị viên | ID of the group to remove admin
   * @throws {ZaloApiError}
   */
  return async function removeGroupAdmins(groupId, members) {
    if (!groupId) throw new ZaloApiError("Missing groupId");
    if (!members) throw new ZaloApiError("Missing members");

    members = Array.isArray(members) ? members.map(String) : [String(members)];

    const params = {
      grid: String(groupId),
      members: members,
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
