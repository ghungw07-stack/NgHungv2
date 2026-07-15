import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const removeMemberFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.group[0]}/api/group/kickout`);
  /**
   * Remove user from existing group | Remove user from existing group
   *
   * @param groupId Group ID | Group ID
   * @param members User ID or list of user IDs to remove | User ID or list of user IDs to remove
   *
   * @throws {ZaloApiError}
   */
  return async function removeMember(groupId, members) {
    if (!groupId) throw new ZaloApiError("Missing groupId");
    if (!members) throw new ZaloApiError("Missing members");
    if (!Array.isArray(members)) members = [members];
    const params = {
      grid: groupId,
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
