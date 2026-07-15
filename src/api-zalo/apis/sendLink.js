import { ZaloApiError, MessageType } from "../index.js";
import { apiFactory } from "../utils.js";

export const sendLinkFactory = apiFactory()((api, appContext, utils) => {
  const serviceURLs = {
    [MessageType.DirectMessage]: utils.makeURL(`${api.zpwServiceMap.chat[0]}/api/message/link`, {
      nretry: 0,
    }),
    [MessageType.GroupMessage]: utils.makeURL(`${api.zpwServiceMap.group[0]}/api/group/sendlink`, {
      nretry: 0,
    }),
  };
  /**
   * Gửi link đến một thread | Send link to a thread
   *
   * @param {String} content Nội dung tin nhắn | Message content
   * @param {String} link Link URL | Link URL
   * @param {number} threadId ID của người dùng/nhóm | ID of the user/group
   * @param {MessageType} type Loại thread (DirectMessage/GroupMessage) | Type of thread (DirectMessage/GroupMessage)
   * @param {number} ttl Thời gian tự hủy tin nhắn (tùy chọn) | Message TTL (optional)
   * @throws {ZaloApiError}
   */
  return async function sendLink(content, link, threadId, type = MessageType.DirectMessage, ttl = 0) {
    if (!link) throw new ZaloApiError("Missing link");
    if (!threadId) throw new ZaloApiError("Missing threadId");
    const linkData = await api.parseLink(link);
    if (!linkData) throw new ZaloApiError("Invalid link");
    const isGroupMessage = type === MessageType.GroupMessage;

    const params = {
      msg: content || "",
      href: linkData.data.href,
      src: linkData.data.src || new URL(linkData.data.href).hostname,
      title: linkData.data.title || "",
      desc: linkData.data.desc || "",
      thumb: linkData.data.thumb || "",
      type: 0,
      media: JSON.stringify({
        type: linkData.data.media.type,
        count: linkData.data.media.count,
        mediaTitle: linkData.data.media.mediaTitle,
        artist: linkData.data.media.artist,
        streamUrl: linkData.data.media.streamUrl,
        stream_icon: linkData.data.media.stream_icon,
      }),
      ttl: ttl,
      clientId: Date.now(),
      mentionInfo: linkData.data.mentions ? JSON.stringify(linkData.data.mentions) : isGroupMessage ? "[]" : "",
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
