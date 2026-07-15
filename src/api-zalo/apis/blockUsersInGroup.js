import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const blockUsersInGroupFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.group[0]}/api/group/blockedmems/add`);
  /**
   * Chặn thành viên trong nhóm theo ID. | Block members in group by ID
   * Client phải là chủ sở hữu của nhóm. | Client must be the owner of the group
   *
   * @param {string|string[]} members - Một hoặc nhiều ID thành viên cần chặn | One or more member IDs to block
   * @param {string|number} groupId - ID của nhóm cần chặn thành viên | ID of the group to block members
   * @throws {ZaloApiError}
   */
  return async function blockUsersInGroup(groupId, members) {
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
