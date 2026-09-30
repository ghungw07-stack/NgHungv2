import { ZaloApiError, MessageType } from "../index.js";
import { apiFactory } from "../utils.js";
import { getImageInfo } from "../../utils/util.js";
import { LRUCache } from "lru-cache";
import { logMediaTiming } from "../../utils/media-timing.js";

const imageInfoCache = new LRUCache({ max: 1000, ttl: 30 * 60_000 });
const imageInfoInFlight = new Map();

export async function resolveWebImageInfo(imageUrl, loader = getImageInfo) {
  const key = String(imageUrl || "");
  const cached = imageInfoCache.get(key);
  if (cached) return { ...cached };
  if (imageInfoInFlight.has(key)) return { ...(await imageInfoInFlight.get(key)) };

  const request = Promise.resolve().then(() => loader(key));
  imageInfoInFlight.set(key, request);
  try {
    const result = await request;
    if (result?.width && result?.height) imageInfoCache.set(key, { ...result });
    return result;
  } finally {
    if (imageInfoInFlight.get(key) === request) imageInfoInFlight.delete(key);
  }
}

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
    const startedAt = performance.now();
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
      dataImage = await resolveWebImageInfo(imageUrl);
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
      hdUrl: imageUrl,
      toid: threadType === MessageType.DirectMessage ? String(threadId) : undefined,
      grid: threadType === MessageType.GroupMessage ? String(threadId) : undefined,
      oriUrl: threadType === MessageType.GroupMessage ? imageUrl : undefined,
      normalUrl: threadType === MessageType.DirectMessage ? imageUrl : undefined,
      hdSize: String(dataImage.totalSize || 0),
      zsource: -1,
      jcp: JSON.stringify({
        sendSource: 1,
        convertible: "jxl",
        is_original: 0,
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
    let ok = false;
    try {
      const response = await utils.request(url, {
        method: "POST",
        body: new URLSearchParams({
          params: encryptedParams,
        }),
      });
      const result = await utils.resolve(response);
      ok = true;
      return result;
    } finally {
      logMediaTiming("image-send", startedAt, {
        bot: appContext.uid,
        ok,
        metadataProvided: Boolean(image?.width && image?.height),
      });
    }
  };
});
