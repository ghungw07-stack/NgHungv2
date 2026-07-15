import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const addGroupAdminsFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.group[0]}/api/group/admins/add`);
  /**
   * Thêm quản trị viên nhóm (phó nhóm). | Add admin group (silver key)
   * Client phải là chủ sở hữu của nhóm. | Client must be the owner of the group
   *
   * @param {string|string[]} members - Một hoặc nhiều ID thành viên cần thêm làm quản trị viên | One or more member IDs to add as admins
   * @param {string|number} groupId - ID của nhóm cần thêm quản trị viên | ID of the group to add admins
   * @throws {ZaloApiError}
   */
  return async function addGroupAdmins(groupId, members) {
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
