import { ZaloApiError, MessageType, ANTI_DELETE_VIDEO } from "../index.js";
import { apiFactory, getVideoMetadata } from "../utils.js";
import { logMediaTiming } from "../../utils/media-timing.js";

export const sendVideoFactory = apiFactory()((api, appContext, utils) => {
  const directMessageServiceURL = utils.makeURL(`${api.zpwServiceMap.file[0]}/api/message/forward`, {
    nretry: 0,
  });
  const groupMessageServiceURL = utils.makeURL(`${api.zpwServiceMap.file[0]}/api/group/forward`, {
    nretry: 0,
  });
  function handleMentions(type, msg, mentions) {
    let totalMentionLen = 0;
    const mentionsFinal =
      Array.isArray(mentions) && type == MessageType.GroupMessage
        ? mentions
            .filter((m) => m.pos >= 0 && m.uid && m.len > 0)
            .map((m) => {
              totalMentionLen += m.len;
              return {
                pos: m.pos,
                uid: m.uid,
                len: m.len,
                type: m.uid == "-1" ? 1 : 0,
              };
            })
        : [];
    if (totalMentionLen > msg.length) {
      throw new ZaloApiError("Invalid mentions: total mention characters exceed message length");
    }
    return {
      mentionsFinal,
      msgFinal: msg,
    };
  }

  /**
   * Send a video to a thread | Gửi video đến một thread
   *
   * @param {string} videoUrl URL của video | URL of the video
   * @param {string} threadId ID của nhóm hoặc người dùng | ID of the user/group
   * @param {string} threadType Loại tin nhắn (DirectMessage or GroupMessage) | Type of message (DirectMessage or GroupMessage)
   * @param {Message} message Tin nhắn gốc | Original message
   * @param {string} thumbnail URL của ảnh thumbnail | URL of the thumbnail image
   * @param {number} ttl Thời gian tồn tại của tin nhắn | Message TTL
   * @param {number} duration Độ dài của video | Video duration
   * @param {Object} metaData Meta data của video | Video meta data
   * @param {boolean} antiDelete Chống xóa tin nhắn | Anti delete message
   * @throws {ZaloApiError}
   */
  return async function sendVideo({
    videoUrl,
    threadId,
    threadType,
    message = null,
    thumbnail = null,
    ttl = 0,
    duration = 1000,
    metaData = null,
    antiDelete = ANTI_DELETE_VIDEO,
  }) {
    const startedAt = performance.now();
    let width = 1280;
    let height = 720;
    let thumbnailUrl = thumbnail || null;
    let fileSize = 0;
    const prepareStartedAt = performance.now();
    // ffprobe and thumbnail extraction both read the same video source. Start
    // them together so Web sends pay the slower operation, not their sum.
    const [metadataResult, thumbnailResult] = await Promise.allSettled([
      metaData ? Promise.resolve(metaData) : getVideoMetadata(videoUrl),
      thumbnail ? Promise.resolve({ url: thumbnail }) : api.uploadThumbnailVideo(videoUrl),
    ]);
    if (metadataResult.status === "fulfilled" && metadataResult.value) {
      const prepared = metadataResult.value;
      duration = prepared.duration || duration;
      width = prepared.width || width;
      height = prepared.height || height;
      fileSize = prepared.totalSize || fileSize;
    }
    if (thumbnailResult.status === "fulfilled" && thumbnailResult.value?.url) {
      thumbnailUrl = thumbnailResult.value.url;
    } else if (!thumbnailUrl) {
      thumbnailUrl = videoUrl.replace(/\.[^/.]+$/, ".jpg") || null;
    }
    const prepareMs = Math.round(performance.now() - prepareStartedAt);

    const clientId = antiDelete ? Date.now() * 10 + Math.floor(Math.random() * (1 - 9 + 1)) + 1 : Date.now();
    const payload = {
      params: {
        clientId: String(clientId),
        ttl: ttl,
        zsource: 704,
        msgType: 5,
        msgInfo: JSON.stringify({
          videoUrl: String(videoUrl),
          thumbUrl: String(thumbnailUrl),
          duration: Number(duration),
          width: Number(width),
          height: Number(height),
          fileSize: Number(fileSize),
          properties: {
            color: -1,
            size: -1,
            type: 1003,
            subType: 0,
            ext: {
              sSrcType: -1,
              sSrcStr: "",
              msg_warning_type: 0,
            },
          },
          title: message ? message.text : "",
        }),
      },
    };

    if (message && message.mentions) {
      const { mentionsFinal } = handleMentions(threadType, message.text, message.mentions);
      payload.params.mentionInfo = JSON.stringify(mentionsFinal);
    }

    let url;
    if (threadType === MessageType.DirectMessage) {
      url = directMessageServiceURL;
      payload.params.toId = String(threadId);
      payload.params.imei = appContext.imei;
    } else if (threadType === MessageType.GroupMessage) {
      url = groupMessageServiceURL;
      payload.params.visibility = 0;
      payload.params.grid = String(threadId);
      payload.params.imei = appContext.imei;
    } else {
      throw new ZaloApiError("Thread type is invalid");
    }

    const encryptedParams = utils.encodeAES(JSON.stringify(payload.params));
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
      logMediaTiming("video-send", startedAt, {
        bot: appContext.uid,
        ok,
        prepareMs,
        metadataProvided: Boolean(metaData),
        thumbnailProvided: Boolean(thumbnail),
      });
    }
  };
});
