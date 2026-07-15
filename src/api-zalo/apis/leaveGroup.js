import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const leaveGroupFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.group[0]}/api/group/leave`);

  /**
   * Rời khỏi nhóm | Leave group
   *
   * @param {string|string[]} groupIds - ID hoặc danh sách ID của các nhóm muốn rời | ID or list of IDs of the groups to leave
   * @param {boolean} [silent=false] - Rời nhóm một cách im lặng không thông báo | Leave group silently without notification
   * @throws {ZaloApiError}
   */
  return async function leaveGroup(groupIds, silent = false) {
    if (!groupIds) throw new ZaloApiError("Missing groupIds");

    // Chuyển đổi groupId thành mảng nếu là string
    if (!Array.isArray(groupIds)) {
      groupIds = [String(groupIds)];
    } else {
      groupIds = groupIds.map((id) => String(id));
    }

    const params = {
      grids: groupIds,
      imei: appContext.imei,
      silent: silent ? 1 : 0,
      language: appContext.language,
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
