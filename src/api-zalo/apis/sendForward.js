import { ZaloApiError, MessageType } from "../index.js";
import { apiFactory } from "../utils.js";

export const sendForwardFactory = apiFactory()((api, appContext, utils) => {
  const attachmentDirectForwardURL = utils.makeURL(`${api.zpwServiceMap.file[0]}/api/message/forward`, {
    nretry: "0",
  });
  const attachmentGroupForwardURL = utils.makeURL(`${api.zpwServiceMap.file[0]}/api/group/forward`, {
    nretry: "0",
  });
  /**
   * Gửi tin nhắn chuyển tiếp | Send forward message
   *
   * @param {Message} message Nội Dung Tin Nhắn | Message content
   * @param {string|number} threadId ID Cuộc Trò Chuyện Sẽ Được Chuyển Tiếp | ID of the chat that will be forwarded
   * @param {number} [ttl=0] Thời gian tồn tại của tin nhắn (tùy chọn) | Message TTL (optional)
   * @throws {ZaloApiError}
   */
  return async function sendForward(message, threadId, type, ttl = 0) {
    if (!message) throw new ZaloApiError("Missing message");
    if (!threadId) throw new ZaloApiError("Missing threadId");

    let params;
    let url;
    if (message.imageObject) {
      params = {
        ttl: ttl,
        zsource: 704,
        msgType: "2",
        clientId: Date.now().toString(),
        msgInfo: JSON.stringify({
          title: message.title || "",
          oriUrl: message.imageObject.normalUrl,
          thumbUrl: message.imageObject.thumbUrl,
          hdUrl: message.imageObject.hdUrl,
          width: message.imageObject.width || 400,
          height: message.imageObject.height || 400,
          properties: null,
          hdSize: message.imageObject.totalSize || 0,
          url: message.imageObject.normalUrl + "?jxlstatus=1",
          normalUrl: message.imageObject.normalUrl,
        }),
      };
    } else if (message.videoObject) {
      params = {
        ttl: ttl,
        zsource: 704,
        msgType: "5",
        clientId: Date.now().toString(),
        msgInfo: JSON.stringify({
          videoUrl: message.videoObject.fileUrl,
          thumbUrl: message.videoObject.thumbnailUrl,
          duration: message.videoObject.duration,
          width: message.videoObject.width || 540,
          height: message.videoObject.height || 960,
          fileSize: message.videoObject.totalSize,
          properties: null,
          title: message.title || "",
        }),
      };
    }
    if (message.type === MessageType.DirectMessage) {
      url = attachmentDirectForwardURL;
      params.toId = String(threadId);
    } else {
      url = attachmentGroupForwardURL;
      params.visibility = 0;
      params.grid = String(threadId);
    }
    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt params");

    const response = await utils.request(url, {
      method: "POST",
      body: new URLSearchParams({
        params: encryptedParams,
      }),
    });

    return await utils.resolve(response);
  };
});
