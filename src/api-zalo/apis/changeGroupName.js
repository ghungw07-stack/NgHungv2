import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const changeGroupNameFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.group[0]}/api/group/updateinfo`);
  /**
   * Change group name | Thay đổi tên nhóm
   *
   * @param {string|number} groupId Group ID | ID của nhóm
   * @param {string} name New group name | Tên nhóm mới
   * @throws {ZaloApiError}
   */
  return async function changeGroupName(groupId, name) {
    if (!groupId) throw new ZaloApiError("Missing groupId");
    if (!name) throw new ZaloApiError("Name is not blank");
    const params = {
      grid: groupId,
      gname: name,
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
