import { ZaloApiError, MessageType } from "../index.js";
import { apiFactory } from "../utils.js";

export const sendBusinessCardFactory = apiFactory()((api, appContext, utils) => {
  const directMessageServiceURL = utils.makeURL(`${api.zpwServiceMap.file[0]}/api/message/forward`);
  const groupMessageServiceURL = utils.makeURL(`${api.zpwServiceMap.file[0]}/api/group/forward`);

  /**
   * Gửi danh thiếp (business card) đến một cuộc trò chuyện | Send business card to a chat
   *
   * @param {Message} message Tin nhắn đến | Message to send
   * @param {string|number} userId ID người dùng của danh thiếp | User ID of the business card
   * @param {string|number} [phone] Số điện thoại kèm theo danh thiếp (tùy chọn) | Phone number of the business card (optional)
   * @param {number} [ttl=0] Thời gian tồn tại của tin nhắn (tùy chọn) | Message TTL (optional)
   * @throws {ZaloApiError}
   */
  return async function sendBusinessCard(message, userId, phone, type, threadId, ttl = 0) {
    if (!userId) throw new ZaloApiError("Missing userId");

    type = message ? message.type : type;
    threadId = message ? message.threadId : threadId;

    const userInfoResponse = await api.getUserInfo(userId);
    const userInfo = userInfoResponse.unchanged_profiles?.[userId] || userInfoResponse.changed_profiles?.[userId];
    if (!userInfo || !userInfo.avatar) {
      throw new ZaloApiError("Không thể lấy avatar của người dùng");
    }

    const avatarUrl = userInfo.avatar;

    const params = {
      ttl: ttl,
      msgType: 6,
      clientId: Date.now().toString(),
      msgInfo: {
        contactUid: userId.toString(),
        qrCodeUrl: avatarUrl,
        avatarUrl: avatarUrl,
      },
    };

    if (phone) {
      params.msgInfo.phone = phone.toString();
    }

    if (type === MessageType.DirectMessage) {
      params.toId = threadId.toString();
      params.imei = appContext.imei;
    } else {
      params.visibility = 0;
      params.grid = threadId.toString();
    }

    params.msgInfo = JSON.stringify(params.msgInfo);

    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    const serviceURL = type === MessageType.DirectMessage ? directMessageServiceURL : groupMessageServiceURL;

    const response = await utils.request(serviceURL, {
      method: "POST",
      body: new URLSearchParams({
        params: encryptedParams,
      }),
    });

    return await utils.resolve(response);
  };
});
