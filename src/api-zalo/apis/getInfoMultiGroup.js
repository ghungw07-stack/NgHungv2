import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const getInfoMultiGroupFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.group[0]}/api/group/getmg-v2`);
  /**
   * Get group information | Lấy thông tin nhóm
   *
   * @param groupId Group ID or list of group IDs | ID của nhóm hoặc danh sách ID của các nhóm
   *
   * @throws {ZaloApiError}
   */
  return async function getInfoMultiGroup(groupIds) {
    if (!groupIds) throw new ZaloApiError("Missing groupId");
    if (!Array.isArray(groupIds)) groupIds = [groupIds];

    let params = {
      gridVerMap: {},
    };
    for (const id of groupIds) {
      params.gridVerMap[id] = 0;
    }
    params.gridVerMap = JSON.stringify(params.gridVerMap);
    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt message");
    const response = await utils.request(serviceURL, {
      method: "POST",
      body: new URLSearchParams({
        params: encryptedParams,
      }),
    });
    return await utils.resolve(response);
  };
});
