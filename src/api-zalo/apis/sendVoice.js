import { ANTI_DELETE_VOICE, ZaloApiError } from "../index.js";
import { apiFactory } from "../utils.js";
import { getUploadSize, rememberUploadSize } from "../upload-metadata.js";
import { logMediaTiming } from "../../utils/media-timing.js";

const voiceSizeProbes = new Map();

function probeVoiceSizeInBackground(appContext, voiceUrl) {
  const probeKey = `${appContext.uid || "unknown"}:${voiceUrl}`;
  if (voiceSizeProbes.has(probeKey)) return voiceSizeProbes.get(probeKey);

  const startedAt = performance.now();
  const probe = (async () => {
    try {
      const response = await appContext.options.polyfill(voiceUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(3_000),
      });
      const size = Number(response?.headers?.get?.("content-length"));
      if (response?.ok && Number.isSafeInteger(size) && size > 0) {
        rememberUploadSize(appContext, voiceUrl, size, 60_000);
      }
      return size;
    } catch {
      return 0;
    } finally {
      voiceSizeProbes.delete(probeKey);
      logMediaTiming("voice-head", startedAt, { bot: appContext.uid, background: true });
    }
  })();
  voiceSizeProbes.set(probeKey, probe);
  return probe;
}

export function resolveVoiceSizeForSend(appContext, voiceUrl) {
  const cachedSize = getUploadSize(appContext, voiceUrl);
  if (cachedSize !== undefined) return { fileSize: cachedSize, sizeCached: true };
  void probeVoiceSizeInBackground(appContext, voiceUrl);
  return { fileSize: 0, sizeCached: false };
}

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
    // The forward endpoint accepts fileSize=0. Do not put a remote HEAD
    // request on the critical send path; remember its result for later sends.
    const { fileSize, sizeCached } = resolveVoiceSizeForSend(appContext, voiceUrl);

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
        bot: appContext.uid, ok, sizeCached, bytes: fileSize, headBackground: !sizeCached,
        sendMs: Math.round(performance.now() - sendStartedAt),
      });
    }
  };
});
