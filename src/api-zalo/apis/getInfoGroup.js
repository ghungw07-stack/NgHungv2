import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const getInfoGroupFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.group[0]}/api/group/getgi`);
  /**
   * Get group information | Lấy thông tin một nhóm
   *
   * @param groupId Group ID | ID của nhóm
   *
   * @throws {ZaloApiError}
   */
  return async function getInfoGroup(groupId) {
    if (!groupId) throw new ZaloApiError("Missing groupId");
    groupId = groupId.replace("g", "");

    let params = {
      grid: groupId,
      avatar_size: 120,
      member_avatar_size: 120,
    };
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
