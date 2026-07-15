import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const getPendingMemberFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.group[0]}/api/group/pending-mems/list`);

  /**
   * Lấy danh sách người yêu cầu tham gia nhóm | Get group members join request
   *
   * @param {string|number} threadId - ID của nhóm cần lấy danh sách thành viên | ID of the group to get join request list
   * @throws {ZaloApiError}
   */
  return async function getPendingMember(threadId) {
    if (!threadId) throw new ZaloApiError("Missing threadId");

    const params = {
      grid: String(threadId),
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
