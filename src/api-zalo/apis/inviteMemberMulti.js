import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const inviteMemberMultiFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.group[0]}/api/group/invite/v2`);
  /**
   * Add user to existing group | Thêm thành viên vào nhóm hiện có
   *
   * @param groupId Group ID | ID của nhóm
   * @param members User ID or list of user IDs to add | ID thành viên hoặc danh sách ID thành viên để thêm
   *
   * @throws {ZaloApiError}
   */
  return async function inviteMemberMulti(groupId, members) {
    if (!groupId) throw new ZaloApiError("Missing groupId");
    if (!members) throw new ZaloApiError("Missing members");
    if (!Array.isArray(members)) members = [members];
    const params = {
      grid: groupId,
      members: members,
      membersTypes: members.map(() => -1),
      imei: appContext.imei,
      clientLang: appContext.language,
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
