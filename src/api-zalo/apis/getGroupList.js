import { apiFactory } from "../utils.js";

export const getGroupListFactory = apiFactory()((api, appContext, utils) => {
  // Zalo serves the group membership list from group_poll. Older sessions may
  // not expose that key, so keep group as a compatibility fallback.
  const firstService = (value) => Array.isArray(value) ? value[0] : value;
  const groupListServices = [...new Set([
    firstService(api.zpwServiceMap.group_poll),
    firstService(api.zpwServiceMap.group),
  ].filter(Boolean))];

  /**
   * Lấy danh sách tất cả các nhóm | Get all groups
   *
   * @throws {ZaloApiError}
   */
  return async function getGroupList() {
    let lastError;
    for (const service of groupListServices) {
      try {
        const serviceURL = utils.makeURL(`${service}/api/group/getlg/v4`);
        return await utils.resolve(await utils.request(serviceURL, { method: "GET" }));
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("Missing group list service URL");
  };
});
