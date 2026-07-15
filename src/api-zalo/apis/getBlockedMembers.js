import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const getBlockedMembersFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.group[0]}/api/group/blockedmems/list`);

  /**
   * Lấy danh sách người dùng bị chặn trong nhóm | Get group block list
   *
   * @param {string|number} groupId - ID của nhóm cần lấy danh sách thành viên | ID of the group to get block list
   * @throws {ZaloApiError}
   */
  return async function getBlockedMembers(groupId, page = 1) {
    if (!groupId) throw new ZaloApiError("Missing groupId");

    const params = {
      grid: String(groupId),
      page,
      count: 50,
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
