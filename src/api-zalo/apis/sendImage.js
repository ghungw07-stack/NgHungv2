import { ZaloApiError, MessageType } from "../index.js";
import { apiFactory } from "../utils.js";
import { getImageInfo } from "../../utils/util.js";

export const sendImageFactory = apiFactory()((api, appContext, utils) => {
  const directMessageServiceURL = utils.makeURL(`${api.zpwServiceMap.file[0]}/api/message/photo_original/send`, {
    nretry: "0",
  });

  const groupMessageServiceURL = utils.makeURL(`${api.zpwServiceMap.file[0]}/api/group/photo_original/send`, {
    nretry: "0",
  });

  /**
   * Gửi ảnh từ URL | Send image from URL
   *
   * @param {string} imageUrl URL của ảnh | URL of the image
   * @param {object} message Tin Nhắn | Message
   * @param {string} caption Tiêu đề của ảnh | Caption of the image
   * @param {number} [ttl=0] Ttl của tin nhắn | Message TTL
   * @throws {ZaloApiError}
   */
  return async function sendImage(
    image,
    message,
    caption = "",
    ttl = 0,
    groupLayout = {
      groupLayoutId: undefined,
      totalItemInGroup: undefined,
      isGroupLayout: undefined,
      idInGroup: undefined,
    }
  ) {
    if (!image) throw new ZaloApiError("Missing image");
    if (!message) throw new ZaloApiError("Missing message object");

    let imageUrl;
    let dataImage;
    if (typeof image === "string") {
      imageUrl = image;
    } else {
      imageUrl = image.url || image.normalUrl;
    }
    if (!image.width || !image.height) {
      dataImage = await getImageInfo(imageUrl);
    } else {
      dataImage = image;
    }
    if (!dataImage) throw new ZaloApiError("Failed to get image info");
    if (dataImage.totalSize && dataImage.totalSize < 1024) throw new ZaloApiError("Ảnh quá nhỏ");

    const threadId = message.threadId;
    const threadType = message.type;

    const params = {
      photoId: Math.floor(Date.now() / 1000),
      clientId: Date.now().toString(),
      desc: caption,
      width: dataImage.width || 500,
      height: dataImage.height || 500,
      ...groupLayout,
      rawUrl: imageUrl,
      thumbUrl: dataImage.thumbUrl || imageUrl,
      hdUrl: dataImage.hdUrl || imageUrl,
      toid: threadType === MessageType.DirectMessage ? String(threadId) : undefined,
      grid: threadType === MessageType.GroupMessage ? String(threadId) : undefined,
      oriUrl: threadType === MessageType.GroupMessage ? imageUrl : undefined,
      normalUrl: threadType === MessageType.DirectMessage ? imageUrl : undefined,
      hdSize: String(dataImage.totalSize || 0),
      zsource: -1,
      jcp: JSON.stringify({
        sendSource: 1,
        convertible: "jxl",
      }),
      ttl: ttl,
      imei: appContext.imei,
    };
    for (const key in params) {
      if (params[key] === undefined) delete params[key];
    }
    if (message.mentions) {
      params.mentionInfo = JSON.stringify(message.mentions);
    }

    const url = threadType === MessageType.GroupMessage ? groupMessageServiceURL : directMessageServiceURL;

    const encryptedParams = utils.encodeAES(JSON.stringify(params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt message");
    const response = await utils.request(url, {
      method: "POST",
      body: new URLSearchParams({
        params: encryptedParams,
      }),
    });

    return await utils.resolve(response);
  };
});
