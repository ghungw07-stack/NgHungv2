import { ANTI_DELETE_VOICE, ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";
import { getUploadSize, rememberUploadSize } from "../upload-metadata.js";
import { logMediaTiming } from "../../utils/media-timing.js";

export const sendVoiceFactory = apiFactory()((api, appContext, utils) => {
  const directMessageServiceURL = utils.makeURL(`${api.zpwServiceMap.file[0]}/api/message/forward`, {
    nretry: 0,
  });
  const groupMessageServiceURL = utils.makeURL(`${api.zpwServiceMap.file[0]}/api/group/forward`, {
    nretry: 0,
  });
  /**
   * Send a voice to a thread | Gửi voice đến một thread
   *
   * @param {Message} message Tin nhắn gốc | Original message
   * @param {string} voiceUrl URL của voice | URL of the voice
   * @param {number} ttl Thời gian tồn tại của tin nhắn | Message TTL
   * @throws {ZaloApiError}
   */
  return async function sendVoice(message, voiceUrl, ttl = 0) {
    const startedAt = performance.now();
    if (!voiceUrl) throw new ZaloApiError("Missing voice URL");
    const threadId = message.threadId;
    const threadType = message.type;
    const antiDelete = message.antiDelete || ANTI_DELETE_VOICE;
    const clientId = antiDelete ? Date.now() * 10 + Math.floor(Math.random() * (1 - 9 + 1)) + 1 : Date.now();
    let fileSize = getUploadSize(appContext, voiceUrl);
    const sizeCached = fileSize !== undefined;
    let headMs = 0;
    if (!sizeCached) {
      const headStartedAt = performance.now();
      fileSize = 0;
      try {
        const headResponse = await appContext.options.polyfill(voiceUrl, {
          method: "HEAD",
          signal: AbortSignal.timeout(15_000),
        });
        if (headResponse.ok) {
          const length = headResponse.headers.get("content-length");
          const size = length === null ? NaN : Number(length);
          if (Number.isSafeInteger(size) && size >= 0) {
            fileSize = size;
            rememberUploadSize(appContext, voiceUrl, size, 60_000);
          }
        }
      } catch (error) {
        logMediaTiming("voice-head", headStartedAt, { bot: appContext.uid, ok: false });
        throw new ZaloApiError(`Unable to get voice content: ${error.message}`);
      } finally {
        headMs = Math.round(performance.now() - headStartedAt);
      }
    }

    const payload = {
      params: {
        ttl: ttl,
        zsource: -1,
        msgType: 3,
        clientId: String(clientId),
        msgInfo: JSON.stringify({
          voiceUrl: String(voiceUrl),
          m4aUrl: String(voiceUrl),
          fileSize: Number(fileSize),
        }),
      },
    };

    // if (message && message.mention) {
    //     payload.params.mentionInfo = message.mention;
    // }

    let url;
    if (threadType === 0) {
      url = directMessageServiceURL;
      payload.params.toId = String(threadId);
      payload.params.imei = appContext.imei;
    } else if (threadType === 1) {
      url = groupMessageServiceURL;
      payload.params.visibility = 0;
      payload.params.grid = String(threadId);
      payload.params.imei = appContext.imei;
    } else {
      throw new ZaloApiError("Thread type is invalid");
    }
    const encryptedParams = utils.encodeAES(JSON.stringify(payload.params));
    if (!encryptedParams) throw new ZaloApiError("Failed to encrypt message");

    const sendStartedAt = performance.now();
    let ok = false;
    try {
      const response = await utils.requestDirect(url, {
        method: "POST",
        timeout: 30_000,
        body: new URLSearchParams({ params: encryptedParams }),
      });
      const result = await utils.resolve(response);
      ok = true;
      return result;
    } finally {
      logMediaTiming("voice-send", startedAt, {
        bot: appContext.uid, ok, sizeCached, bytes: fileSize, headMs,
        sendMs: Math.round(performance.now() - sendStartedAt),
      });
    }
  };
});
