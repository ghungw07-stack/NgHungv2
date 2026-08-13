import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const unblockMemberFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.group[0]}/api/group/blockedmems/remove`);
  /**
   * Gỡ chặn thành viên trong nhóm theo ID. | Remove block members in group by ID
   * Client phải có quyền gỡ chặn thành viên trong nhóm/cộng đồng.
   * Client must have permission to unblock members in the group/community.
   *
   * @param {string|string[]} members - Một hoặc nhiều ID thành viên cần gỡ chặn | One or more member IDs to remove block
   * @param {string|number} groupId - ID của nhóm cần gỡ chặn thành viên | ID of the group to remove block members
   * @throws {ZaloApiError}
   */
  return async function unblockMember(groupId, members) {
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
