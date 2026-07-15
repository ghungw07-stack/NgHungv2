import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const getGroupInfoByLinkFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.group[0]}/api/group/link/ginfo`);

  /**
   * Lấy thông tin nhóm thông qua link | Get group information by link
   *
   * @param {string} link - Link của nhóm (dạng https://zalo.me/g/xxxxxx) | Link of the group (https://zalo.me/g/xxxxxx)
   * @param {object} options - Các tùy chọn | Options
   * @param {number} [options.avatarSize=120] - Kích thước avatar nhóm | Group avatar size
   * @param {number} [options.memberAvatarSize=120] - Kích thước avatar thành viên | Member avatar size
   * @param {number} [options.page=1] - Trang danh sách thành viên | Member list page
   * @throws {ZaloApiError}
   */
  return async function getGroupInfoByLink(link, options = {}) {
    if (!link) throw new ZaloApiError("Missing link");

    const params = {
      link: link,
      avatar_size: options.avatarSize || 120,
      member_avatar_size: options.memberAvatarSize || 120,
      mpage: options.page || 1,
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
