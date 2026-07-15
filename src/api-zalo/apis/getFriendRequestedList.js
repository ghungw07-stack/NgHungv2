import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const getFriendRequestListFactory = apiFactory()((api, appContext, utils) => {
  /**
   * Get list of incoming friend requests (people who sent friend requests to you)
   * Lấy danh sách lời mời kết bạn đến (người đã gửi lời mời kết bạn đến bạn)
   * Endpoint: /api/friend/recommendsv2/list
   * 
   * @returns {Promise<Object>} Response chứa danh sách lời mời kết bạn đến
   * @throws {ZaloApiError}
   * 
   * @example
   * const result = await api.getFriendRequestList();
   * // result.data = [{ userId, displayName, avatar, recommTime, recommInfo, ... }]
   */
  return async function getFriendRequestList() {

    let baseServiceURL = api.zpwServiceMap.friend[0];
    
    if (baseServiceURL.startsWith("https//")) {
      baseServiceURL = baseServiceURL.replace("https//", "https://");
    }
    
    const serviceURL = `${baseServiceURL}/api/friend/recommendsv2/list`;
    
    const url = new URL(serviceURL);
    url.searchParams.set('zpw_ver', String(appContext.options.apiVersion || 667));
    url.searchParams.set('zpw_type', String(appContext.options.typeLogin || 30));

    const params = {
      imei: appContext.imei,
    };

    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    const finalURL = new URL(url.toString());
    finalURL.searchParams.set('params', encryptedParams);

    const response = await utils.request(finalURL.toString(), {
      method: "GET",
    });

    const result = await utils.resolve(response, (res) => res);
    
    
    if (result && result.data) {
      let recommItems = null;
      
      if (Array.isArray(result.data.recommItems)) {
        recommItems = result.data.recommItems;
      } else if (Array.isArray(result.data)) {
        recommItems = result.data;
      } else if (result.data.list && Array.isArray(result.data.list)) {
        recommItems = result.data.list;
      }
      
      if (recommItems && recommItems.length > 0) {

        const friendRequests = recommItems
          .filter(item => {
            const dataInfo = item.dataInfo || item;
            const recommType = dataInfo.recommType || item.recommType;
            const isMatch = recommType === 2;
            
            if (!isMatch && recommType !== undefined) {
            }
            
            return isMatch;
          })
          .map(item => {
            const info = item.dataInfo || item;
            return {
              userId: info.userId || info.uid,
              uid: info.userId || info.uid, 
              displayName: info.displayName || info.zaloName || "Người dùng",
              zaloName: info.zaloName || info.displayName || "Người dùng",
              avatar: info.avatar,
              recommTime: info.recommTime,
              recommInfo: {
                message: info.recommInfo?.message || item.recommInfo?.message || "Xin chào!",
                source: info.recommInfo?.source || item.recommInfo?.source
              }
            };
          });

        return { ...result, data: friendRequests };
      } else {
        if (recommItems === null) {
        }
      }
    } else {
    }

    return { ...result, data: [] };
  };
});
