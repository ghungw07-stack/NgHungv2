import { ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

export const sendFriendRequestFactory = apiFactory()((api, appContext, utils) => {
  const serviceURL = utils.makeURL(`${api.zpwServiceMap.friend[0]}/api/friend/sendreq`);

  /**
   * Gửi yêu cầu kết bạn đến một người dùng | Send friend request to a user
   *
   * @param {string|number} userId ID người dùng để gửi yêu cầu kết bạn | User ID to send friend request
   * @param {string} msg Tin nhắn yêu cầu kết bạn | Friend request message
   * @param {string} [language="vi"] Ngôn ngữ phản hồi hoặc giao diện Zalo | Language of the response or Zalo interface
   * @throws {ZaloApiError}
   */
  return async function sendFriendRequest(userId, msg, language = "vi") {
    if (!userId) throw new ZaloApiError("Missing userId");
    if (!msg) throw new ZaloApiError("Missing friend request message");

    const params = {
      toid: userId.toString(),
      msg: msg,
      reqsrc: 30,
      imei: appContext.imei,
      language: language,
      srcParams: JSON.stringify({
        uidTo: userId.toString(),
      }),
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
