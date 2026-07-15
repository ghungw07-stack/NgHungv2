import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const undoFriendRequestFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.friend[0]}/api/friend/undo`);

  /**
   * Undo send a friend request to a user | Hủy lời mời kết bạn đã gửi
   *
   * @param {string} friendId - Friend ID to undo request | ID người dùng cần hủy lời mời
   *
   * @throws {ZaloApiError}
   */
  return async function undoFriendRequest(friendId) {
    if (!friendId) throw new ZaloApiError("Missing friendId");

    const params = {
      fid: friendId,
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

