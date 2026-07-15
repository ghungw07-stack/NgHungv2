import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const getMemberInGroupFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.profile[0]}/api/social/group/members`);

  /**
   * Lấy thông tin thành viên nhóm | Get group members information
   *
   * @param {string[]} memberIds - Mảng ID của các thành viên cần lấy thông tin | Array of member IDs to get information
   * @throws {ZaloApiError}
   */
  return async function getMemberInGroup(memberIds) {
    if (!memberIds || !Array.isArray(memberIds)) throw new ZaloApiError("Member IDs must be an array");

    const params = {
      friend_pversion_map: memberIds.map((id) => (id.endsWith("_0") ? id : `${id}_0`)),
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
