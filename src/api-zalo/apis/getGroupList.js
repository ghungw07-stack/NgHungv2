import { apiFactory } from "../utils.js";

export const getGroupListFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.group[0]}/api/group/getlg/v4`);

  /**
   * Lấy danh sách tất cả các nhóm | Get all groups
   *
   * @throws {ZaloApiError}
   */
  return async function getGroupList() {
    return await utils.resolve(await utils.request(serviceURL, { method: "GET" }));
  };
});
