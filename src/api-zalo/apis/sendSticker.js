import { ZaloApiError, MessageType, ANTI_DELETE_STICKER } from "../index.js";
import { apiFactory } from "../utils.js";

export const sendStickerFactory = apiFactory()((api, appContext, utils) => {
  const directMessageServiceURL = utils.makeURL(`${api.zpwServiceMap.chat[0]}/api/message/sticker`);
  const groupMessageServiceURL = utils.makeURL(`${api.zpwServiceMap.group[0]}/api/group/sticker`);
  /**
   * Send a sticker to a thread | Gửi sticker đến một thread
   *
   * @param sticker Sticker object | Object sticker
   * @param threadId group or user id | ID của nhóm hoặc người dùng
   * @param type Message type (DirectMessage or GroupMessage) | Loại tin nhắn (DirectMessage or GroupMessage)
   *
   * @throws {ZaloApiError}
   */
  return async function sendSticker(sticker, threadId, type = MessageType.DirectMessage, ttl = 0) {
    if (!sticker) throw new ZaloApiError("Missing sticker");
    if (!threadId) throw new ZaloApiError("Missing threadId");
    const isGroupMessage = type === MessageType.GroupMessage;
    const antiDelete = sticker.antiDelete || ANTI_DELETE_STICKER;
    const clientId = antiDelete ? Date.now() * 10 + Math.floor(Math.random() * (1 - 9 + 1)) + 1 : Date.now();
    const params = {
      stickerId: sticker.id,
      cateId: sticker.cateId,
      type: sticker.type,
      clientId: clientId,
      imei: appContext.imei,
      zsource: 101,
      toid: isGroupMessage ? undefined : threadId,
      grid: isGroupMessage ? threadId : undefined,
      ttl: ttl,
    };
    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt message");
    const finalServiceUrl = new URL(isGroupMessage ? groupMessageServiceURL : directMessageServiceURL);
    finalServiceUrl.searchParams.append("nretry", "0");
    const response = await utils.request(finalServiceUrl.toString(), {
      method: "POST",
      body: new URLSearchParams({
        params: encryptedParams,
      }),
    });
    return await utils.resolve(response);
  };
});
