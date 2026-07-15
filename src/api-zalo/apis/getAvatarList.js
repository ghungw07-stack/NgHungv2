import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const getAvatarListFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.profile[0]}/api/social/avatar-list`);

  /**
   * Get avatar list | Lấy danh sách avatar
   *
   * @param {number} count - The number of avatars to fetch (default: 50) | Số lượng avatar cần lấy (mặc định: 50)
   * @param {number} page - The page number to fetch (default: 1) | Số trang cần lấy (mặc định: 1)
   *
   * @throws {ZaloApiError}
   */
  return async function getAvatarList(count = 50, page = 1) {
    const params = {
      page,
      albumId: "0",
      count,
      imei: appContext.imei,
    };

    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    const response = await utils.request(utils.makeURL(serviceURL, { params: encryptedParams }), {
      method: "GET",
    });

    return await utils.resolve(response);
  };
});

