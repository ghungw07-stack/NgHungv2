import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";
// Hà Huy Hoàng - dz
export const upgradeGroupToCommunityFactory = apiFactory()((api, appContext, utils) => {
  /**
   * Upgrade group to community | Nâng cấp nhóm thành cộng đồng
   *
   * @param {string|number} groupId Group ID | ID của nhóm
   * @throws {ZaloApiError}
   */
  return async function upgradeGroupToCommunity(groupId) {
    if (!groupId) throw new ZaloApiError("Missing groupId");
    groupId = groupId.toString().replace("g", "");

    const params = {
      grId: groupId,
      language: "vi"
    };

    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    const urlParams = {
      zpw_ver: 655,
      zpw_type: 24,
      params: encryptedParams,
    };

    const serviceURL = utils.makeURL(
      `${api.zpwServiceMap.group[0]}/api/group/upgrade/community`,
      urlParams,
      false 
    );
    const response = await utils.request(serviceURL, {
      method: "GET",
    });

    return await utils.resolve(response);
  };
});

