import { ANTI_DELETE_VOICE, ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";

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
    if (!voiceUrl) throw new ZaloApiError("Missing voice URL");
    const threadId = message.threadId;
    const threadType = message.type;
    const antiDelete = message.antiDelete || ANTI_DELETE_VOICE;
    const clientId = antiDelete ? Date.now() * 10 + Math.floor(Math.random() * (1 - 9 + 1)) + 1 : Date.now();
    let fileSize = 0;
    try {
      const headResponse = await appContext.options.polyfill(voiceUrl, { method: "HEAD" });
      if (headResponse.ok) {
        fileSize = parseInt(headResponse.headers.get("content-length")) || 0;
      }
    } catch (error) {
      throw new ZaloApiError(`Unable to get voice content: ${error.message}`);
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

    const response = await utils.request(url, {
      method: "POST",
      body: new URLSearchParams({
        params: encryptedParams,
      }),
    });

    return await utils.resolve(response);
  };
});
