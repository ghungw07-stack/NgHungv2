import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const getGroupInvitationListFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.group[0]}/api/group/inv-box/list`);
  /**
   * Get group list invite box | Lấy danh sách nhóm mời
   *
   * @throws ZaloApiError
   */
  return async function getGroupInvitationList() {
    let params = {
      mpage: 1,
      page: 0,
      invPerPage: 12,
      mcount: 10,
      lastGroupId: null,
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
