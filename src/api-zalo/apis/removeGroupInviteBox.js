import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const removeGroupInviteBoxFactory = apiFactory()((api, appContext, utils) => {
  const baseServiceURL = `${api.zpwServiceMap.group[0]}/api/group/inv-box/mdel-inv`;

  /**
   * Xóa lời mời tham gia nhóm khỏi hộp thư (có thể xóa nhiều lời mời)
   * Remove/Reject group invitation from invite box (can remove multiple invitations)
   *
   * @param {string | string[] | number | number[]} groupId ID của nhóm (hoặc mảng ID nhóm) | Group ID (or array of group IDs)
   * @param {boolean} blockFutureInvite Có chặn lời mời trong tương lai từ nhóm này không (mặc định là false) | Block future invites from this group (default: false)
   *
   * @throws {ZaloApiError}
   * 
   * @example
   * // Xóa một lời mời
   * await api.removeGroupInviteBox("123456789");
   * 
   * // Xóa nhiều lời mời
   * await api.removeGroupInviteBox(["123456789", "987654321"]);
   * 
   * // Xóa và chặn lời mời trong tương lai
   * await api.removeGroupInviteBox("123456789", true);
   */
  return async function removeGroupInviteBox(groupId, blockFutureInvite = false) {
    if (!groupId || (Array.isArray(groupId) && groupId.length === 0)) {
      throw new ZaloApiError("Missing groupId");
    }

    const grids = Array.isArray(groupId) ? groupId.map(g => String(g)) : [String(groupId)];

    const params = {
      invitations: JSON.stringify(grids.map((grid) => ({ grid }))),
      block: blockFutureInvite ? 1 : 0,
    };

    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    const serviceURL = utils.makeURL(baseServiceURL, { params: encryptedParams });

    const response = await utils.request(serviceURL, {
      method: "GET",
    });

    return await utils.resolve(response);
  };
});
