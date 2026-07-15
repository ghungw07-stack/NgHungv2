import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const getFriendBlockListFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.friend[0]}/api/friend/blocklistv2`);

  /**
   * Lấy danh sách bạn bè bị chặn | Get friend block list
   *
   * @param {number} page - Số trang (mặc định: 1) | Page number (default: 1)
   * @param {number} count - Số lượng mục trên mỗi trang (mặc định: 50) | Number of items per page (default: 50)
   * @throws {ZaloApiError}
   */
  return async function getFriendBlockList(page = 1) {
    const params = {
      page,
      count: 50,
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

