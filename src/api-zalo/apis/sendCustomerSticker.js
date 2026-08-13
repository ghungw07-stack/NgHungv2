import { ZaloApiError, MessageType, ANTI_DELETE_STICKER } from "../index.js";
import { apiFactory } from "../utils.js";

function processUrl(url) {
  const urlObj = new URL(url);
  const hostname = urlObj.hostname;
  const pathname = urlObj.pathname;

  if (hostname.endsWith(".dlfl.me") || hostname.includes("zfcloud") || hostname.endsWith("zalo.me") || hostname.endsWith("zdn.vn")) {
    return url;
  } else if (hostname.endsWith(".dlfl.vn")) {
    const newHostname = hostname.replace(".dlfl.vn", ".dlfl.me");
    return `${urlObj.protocol}//${newHostname}${pathname}`;
  } else {
    return `https://fg42.dlfl.me${pathname}`;
  }
}

export const sendCustomStickerFactory = apiFactory()((api, appContext, utils) => {
  const directMessageServiceURL = utils.makeURL(`${api.zpwServiceMap.file[0]}/api/message/photo_url`, {
    nretry: "0",
  });
  const groupMessageServiceURL = utils.makeURL(`${api.zpwServiceMap.file[0]}/api/group/photo_url`, {
    nretry: "0",
  });
  /**
   * Gửi sticker tùy chỉnh (static/animation) đến một cuộc trò chuyện | Send custom sticker (static/animation) to a chat
   *
   * @param {Message} message Tin nhắn để gửi sticker | Message to send sticker
   * @param {string} staticImgUrl URL ảnh tĩnh (png, jpg, jpeg) để tạo sticker | Static image URL (png, jpg, jpeg) to create sticker
   * @param {string} animationImgUrl URL ảnh động (webp) để tạo sticker | Animation image URL (webp) to create sticker
   * @param {number} [width] Chiều rộng của sticker | Width of the sticker
   * @param {number} [height] Chiều cao của sticker | Height of the sticker
   * @param {number} [ttl=0] Thời gian tồn tại của tin nhắn | Message TTL
   * @throws {ZaloApiError}
   */
  return async function sendCustomSticker(
    message,
    staticImgUrl,
    animationImgUrl,
    width = null,
    height = null,
    ttl = 0,
    antiDelete = ANTI_DELETE_STICKER
  ) {
    if (!staticImgUrl) throw new ZaloApiError("Missing static image URL");
    if (!animationImgUrl) throw new ZaloApiError("Missing animation image URL");
    if (!message) throw new ZaloApiError("Missing message");

    const type = message.type;
    const threadId = message.threadId;
    const quote = message.data?.quote;

    width = width ? parseInt(width) : 512;
    height = height ? parseInt(height) : 512;
    const isGroupMessage = type === MessageType.GroupMessage;

    const linkStaticImgUrl = processUrl(staticImgUrl);
    const linkAnimationImgUrl = processUrl(animationImgUrl);
    const clientId = antiDelete ? Date.now() * 10 + Math.floor(Math.random() * (1 - 9 + 1)) + 1 : Date.now();

    const params = {
      clientId: clientId,
      title: "",
      oriUrl: linkStaticImgUrl,
      thumbUrl: linkStaticImgUrl,
      hdUrl: linkStaticImgUrl,
      width,
      height,
      properties: JSON.stringify({
        subType: 0,
        color: -1,
        size: -1,
        type: 3,
        ext: JSON.stringify({
          sSrcStr: "",
          sSrcType: -1,
        }),
      }),
      contentId: Date.now(),
      thumb_height: width,
      thumb_width: height,
      webp: JSON.stringify({
        width,
        height,
        url: linkAnimationImgUrl,
      }),
      jcp: JSON.stringify({
        pStickerType: 1,
      }),
      zsource: -1,
      ttl,
    };

    if (quote) {
      params.refMessage = quote.cliMsgId.toString();
    }

    if (isGroupMessage) {
      params.visibility = 0;
      params.grid = threadId.toString();
    } else {
      params.toId = threadId.toString();
    }

    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt message");

    const finalServiceUrl = new URL(isGroupMessage ? groupMessageServiceURL : directMessageServiceURL);
    const response = await utils.request(finalServiceUrl.toString(), {
      method: "POST",
      body: new URLSearchParams({
        params: encryptedParams,
      }),
    });

    return await utils.resolve(response);
  };
});
