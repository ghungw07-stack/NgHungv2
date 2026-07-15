import { apiFactory } from "../utils.js";
import { ZaloApiError } from "../index.js";

export const handleGroupPendingMembersFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.group[0]}/api/group/pending-mems/review`);

  /**
   * Xử lý yêu cầu tham gia nhóm | Handle group pending members
   *
   * @param {string|number} threadId - ID của nhóm | ID of the group
   * @param {string[]} members - Danh sách ID của các thành viên cần xử lý | List of member IDs to handle
   * @param {boolean} [isApprove=true] - Chấp nhận hoặc từ chối yêu cầu | Accept or reject request
   * @throws {ZaloApiError}
   */
  return async function handleGroupPendingMembers(threadId, isApprove = true, membersApprove) {
    if (!threadId) throw new ZaloApiError("Missing threadId");
    const members = membersApprove || (await api.getGroupPendingMembers(threadId));
    if (!members || !members.users) return;
    const listMembers = members.users.map((user) => user.uid);

    const params = {
      grid: String(threadId),
      members: listMembers,
      isApprove: isApprove ? 1 : 0,
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
