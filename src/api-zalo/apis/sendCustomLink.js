import { ZaloApiError, MessageType } from "../index.js";
import { apiFactory } from "../utils.js";

export const sendCustomLinkFactory = apiFactory()((api, appContext, utils) => {
  const serviceURLs = {
    [MessageType.DirectMessage]: utils.makeURL(`${api.zpwServiceMap.chat[0]}/api/message/link`, {
      nretry: 0,
    }),
    [MessageType.GroupMessage]: utils.makeURL(`${api.zpwServiceMap.group[0]}/api/group/sendlink`, {
      nretry: 0,
    }),
  };

  /**
   * Gửi link preview tùy chỉnh đến một thread | Send custom link preview to thread
   *
   * @param {Object} options Thông tin link { msg, href, title, desc, thumb, src }
   * @param {number} threadId ID của người dùng/nhóm | ID of the user/group
   * @param {MessageType} type Loại thread (DirectMessage/GroupMessage)
   * @param {number} ttl Thời gian tự hủy tin nhắn (tùy chọn)
   * @throws {ZaloApiError}
   */
  return async function sendCustomLink(options, threadId, type = MessageType.DirectMessage, ttl = 0) {
    if (!options?.href) throw new ZaloApiError("Missing href");
    if (!threadId) throw new ZaloApiError("Missing threadId");

    const isGroupMessage = type === MessageType.GroupMessage;

    const params = {
      msg: options.msg || "",
      href: options.href,
      src: options.src || new URL(options.href.startsWith("http") ? options.href : `https://${options.href}`).hostname || "zalo.me",
      title: options.title || "",
      desc: options.desc || "",
      thumb: options.thumb || "",
      type: 0,
      media: JSON.stringify({
        type: 1,
        count: 0,
        mediaTitle: "",
        artist: "",
        streamUrl: "",
        stream_icon: "",
      }),
      ttl: ttl,
      clientId: Date.now(),
      mentionInfo: options.mentions ? JSON.stringify(options.mentions) : isGroupMessage ? "[]" : "",
    };

    if (isGroupMessage) {
      params.grid = String(threadId);
      params.imei = appContext.imei;
      params.visibility = 0;
    } else {
      params.toId = String(threadId);
    }

    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt message");

    const response = await utils.request(serviceURLs[type], {
      method: "POST",
      body: new URLSearchParams({ params: encryptedParams }),
    });

    return await utils.resolve(response);
  };
});
