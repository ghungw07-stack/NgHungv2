import axios from "axios";
import { JSDOM } from "jsdom";
import { LRUCache } from "lru-cache";
import { getGlobalPrefix } from "../../service.js";
import {
  sendMessageCompleteRequest,
  sendMessageFromSQL,
  sendMessageWarningRequest,
} from "../../chat-zalo/chat-style/chat-style.js";
import { downloadAndConvertAudio, downloadMixcloudWithYtDlp, ensureVoiceUrlExtension } from "../../chat-zalo/chat-special/send-voice/process-audio.js";
import { removeMention } from "../../../utils/format-util.js";
import { sendVoiceMusic } from "../../chat-zalo/chat-special/send-voice/send-voice.js";
import { parseQuickSelection, setSelectionsMapData } from "../index.js";
import { getCachedMedia, setCacheData } from "../../../utils/link-platform-cache.js";
import { deleteFile } from "../../../utils/util.js";
import { createSearchResultImage } from "../../../utils/canvas/search-canvas.js";
import { getApiKeys, setApiKeysMedia } from "../../../utils/api-key-manager.js";
import { asyncTaskManager } from "../../../utils/async-task.js";
import { createCircleWebp } from "../../chat-zalo/chat-special/send-sticker/create-webp.js";
import {
  buildSoundCloudDownloadRelayUrl,
  parseSoundCloudRelayJson,
  resolveSoundCloudArtwork,
  resolveSoundCloudCanvasArtwork,
  resolveSoundCloudArtworkCandidates,
} from "./soundcloud-relay.js";

let clientId;

const PLATFORM = "soundcloud";
const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
];
const TIME_TO_SELECT = 60000;
const SOUNDCLOUD_RELAY = "https://r.jina.ai/http://";
const soundCloudSearchCache = new LRUCache({ max: 200, ttl: 60 * 60_000 });
const soundCloudSearchesInFlight = new Map();
const soundCloudTrackJobs = new Map();
let soundCloudDirectBlockedUntil = 0;

const acceptLanguages = ["en-US,en;q=0.9", "fr-FR,fr;q=0.9", "es-ES,es;q=0.9", "de-DE,de;q=0.9", "zh-CN,zh;q=0.9"];

const getRandomElement = (array) => {
  return array[Math.floor(Math.random() * array.length)];
};

const getHeaders = () => {
  return {
    "User-Agent": getRandomElement(userAgents),
    "Accept-Language": getRandomElement(acceptLanguages),
    Referer: "https://soundcloud.com/",
    "Upgrade-Insecure-Requests": "1",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  };
};

function getSoundCloudRelayUrl(url) {
  const parsed = new URL(url);
  return `${SOUNDCLOUD_RELAY}${parsed.host}${parsed.pathname}${parsed.search}`;
}

async function getSoundCloudJson(url, config = {}) {
  const requestUrl = new URL(url);
  for (const [key, value] of Object.entries(config.params || {})) {
    if (value !== undefined && value !== null && value !== "") requestUrl.searchParams.set(key, String(value));
  }
  const requestRelay = async (signal) => {
    const response = await axios.get(getSoundCloudRelayUrl(requestUrl), {
      headers: { Accept: "text/plain, application/json;q=0.9, */*;q=0.8" },
      timeout: 45_000,
      signal,
    });
    return parseSoundCloudRelayJson(response.data);
  };

  if (Date.now() < soundCloudDirectBlockedUntil) return requestRelay();

  // Race the normal API against a slightly delayed relay. A reachable direct
  // endpoint normally wins without paying relay latency; a blocked endpoint
  // no longer adds its full timeout before the fallback starts.
  const directController = new AbortController();
  const relayController = new AbortController();
  const directRequest = axios.get(url, {
    ...config,
    timeout: Math.min(Number(config.timeout) || 5_000, 5_000),
    signal: directController.signal,
  }).then((response) => response.data).catch((error) => {
    if (!axios.isCancel(error)) {
      soundCloudDirectBlockedUntil = Date.now() + 10 * 60_000;
      console.warn(`[SoundCloud] Kết nối trực tiếp lỗi, tạm ưu tiên Web relay: ${error?.code || error?.message || error}`);
    }
    throw error;
  });
  const relayRequest = new Promise((resolve) => setTimeout(resolve, 180))
    .then(() => requestRelay(relayController.signal));

  try {
    return await Promise.any([directRequest, relayRequest]);
  } finally {
    directController.abort();
    relayController.abort();
  }
}

const getClientId = async () => {
  const apiKeysManager = getApiKeys();
  try {
    const config = apiKeysManager["SOUNDCLOUD"];
    const now = new Date();
    if (config?.clientId) {
      return config.clientId;
    }

    const response = await axios.get("https://soundcloud.com/", {
      headers: getHeaders(),
      timeout: 8_000,
    });

    const dom = new JSDOM(response.data);
    const scriptTags = Array.from(dom.window.document.querySelectorAll("script[crossorigin]"));

    const urls = scriptTags.map((tag) => tag.src).filter((src) => src && src.startsWith("https"));

    if (!urls.length) {
      throw new Error("Không tìm thấy URL script");
    }

    const scriptResponse = await axios.get(urls[urls.length - 1], {
      headers: getHeaders(),
      timeout: 8_000,
    });

    const clientId = scriptResponse.data.split(',client_id:"')[1].split('"')[0];

    apiKeysManager["SOUNDCLOUD"] = {
      clientId: clientId,
      lastUpdate: now.toISOString(),
    };

    setApiKeysMedia(apiKeysManager);

    return clientId;
  } catch (error) {
    console.error(`Không thể lấy client ID: ${error}`);
    try {
      const config = apiKeysManager["SOUNDCLOUD"];
      return config.clientId;
    } catch {
      return "W00nmY7TLer3uyoEo1sWK3Hhke5Ahdl9";
    }
  }
};

async function getMusicInfo(question, limit) {
  limit = limit || 10;
  const cacheKey = `${String(question || "").trim().toLocaleLowerCase("vi")}:${limit}`;
  const cached = soundCloudSearchCache.get(cacheKey);
  if (cached) return cached;
  if (soundCloudSearchesInFlight.has(cacheKey)) return soundCloudSearchesInFlight.get(cacheKey);

  const request = (async () => {
    try {
      const result = await getSoundCloudJson("https://api-v2.soundcloud.com/search/tracks", {
        params: {
          q: question,
          variant_ids: "",
          facet: "genre",
          client_id: clientId,
          limit: limit,
          offset: 0,
          linked_partitioning: 1,
          app_locale: "en",
        },
      });
      if (result?.collection?.length) soundCloudSearchCache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error("Error fetching SoundCloud music info:", error?.message || error);
      return null;
    }
  })();
  soundCloudSearchesInFlight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    soundCloudSearchesInFlight.delete(cacheKey);
  }
}

async function getMusicStreamUrl(trackOrLink, preferProgressive = false) {
  try {
    const headers = getHeaders();
    const data = trackOrLink && typeof trackOrLink === "object" && trackOrLink.media
      ? trackOrLink
      : await getSoundCloudJson("https://api-v2.soundcloud.com/resolve", {
          headers,
          params: { url: String(trackOrLink || ""), client_id: clientId },
        });

    const transcodings = data?.media?.transcodings || [];
    const progressive = transcodings.find((item) => item.format?.protocol === "progressive");
    const hls = transcodings.find(
      (item) => item.format?.protocol === "hls" && item.format?.mime_type?.includes("mp4a")
    ) || transcodings.find((item) => item.format?.protocol === "hls");

    // Long HLS tracks can require hundreds of segment requests. Progressive
    // lets ffmpeg download and encode them in one request.
    const candidates = preferProgressive ? [progressive, hls] : [hls, progressive];
    for (const transcoding of candidates.filter(Boolean)) {
      try {
        const streamData = await getSoundCloudJson(transcoding.url, {
          params: {
            client_id: clientId,
            ...(data.track_authorization && { track_authorization: data.track_authorization }),
          },
          headers,
        });
        if (streamData?.url) {
          return {
            url: streamData.url,
            progressiveUrl: progressive || transcoding,
            protocol: transcoding.format?.protocol,
          };
        }
      } catch (error) {
        console.warn(`[SoundCloud] Lỗi stream ${transcoding.format?.protocol}: ${error.message}`);
      }
    }

    console.error("Không tìm thấy stream SoundCloud dùng được");
    return null;
  } catch (error) {
    console.error("Error getting music stream URL:", error);
    return null;
  }
}

const musicSelectionsMap = new LRUCache({
  max: 500,
  ttl: TIME_TO_SELECT,
});

export function handleMusicCommand(api, message, aliasCommand) {
  return handleMusicCommandPriority(api, message, aliasCommand);
}

async function handleMusicCommandPriority(api, message, aliasCommand) {
  const commandStartedAt = performance.now();
  let imagePath = null;
  try {
    if (!clientId) clientId = await getClientId();
    const content = removeMention(message);
    const senderId = message.data.uidFrom;
    const prefix = getGlobalPrefix(api.getBotId());
    const commandContent = content.replace(`${prefix}${aliasCommand}`, "").trim();
    const quickSelection = parseQuickSelection(commandContent);
    const [question, numberMusic] = quickSelection.query.split("&&");

    if (!question) {
      const object = {
        caption: `Vui lòng nhập từ khóa tìm kiếm\nVí dụ:\n${prefix}${aliasCommand} Bài Hát Cần Tìm`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    const musicInfo = await getMusicInfo(question, parseInt(numberMusic));
    const searchFinishedAt = performance.now();
    if (!musicInfo) {
      await sendMessageWarningRequest(api, message, {
        caption: `SoundCloud đang tạm nghẽn, không thể tìm bài: ${question}. Vui lòng thử lại sau.`,
      }, 30000);
      return;
    }
    if (!musicInfo.collection || musicInfo.collection.length === 0) {
      const object = {
        caption: `Không tìm thấy bài hát nào với từ khóa: ${question}`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    if (quickSelection.selectedIndex !== null) {
      const track = musicInfo.collection[quickSelection.selectedIndex];
      if (!track) {
        await sendMessageWarningRequest(api, message, {
          caption: `Không có kết quả số ${quickSelection.selectedIndex + 1}.`,
        }, 30000);
        return;
      }
      // Feedback is cosmetic; do not put its network round-trip in front of
      // stream resolution and audio conversion.
      void api.addReaction("CLOCK", message).catch(() => {});
      return await handleSendTrackSoundCloud(api, message, track);
    }

    // musicListTxt += musicInfo.collection
    //   .map((music, index) => {
    //     const stats = [
    //       music.playback_count && `${music.playback_count.toLocaleString()} 👂`,
    //       music.likes_count && `${music.likes_count.toLocaleString()} ❤️`,
    //       music.comment_count && `${music.comment_count.toLocaleString()} 💬`
    //     ].filter(Boolean);

    //     return `${index + 1}. ${music.title}${music.user?.username ? ` _ ${music.user.username}` : ""}` +
    //       `${stats.length ? `\n(${stats.join(" | ")})` : ""}`
    //   })
    //   .join("\n\n");

    const songs = musicInfo.collection.map((track) => ({
      title: track.title,
      artistsNames: track.user?.username || "Unknown Artist",
      thumbnailM: resolveSoundCloudCanvasArtwork(track),
      listen: track.playback_count,
      like: track.likes_count,
      comment: track.comment_count,
    }));

    imagePath = await createSearchResultImage(songs, api.getBotId());
    const imageListMessage = await sendMessageCompleteRequest(api, message, {
      caption: "Trả lời tin nhắn này bằng số bài hát bạn muốn nghe.",
      imagePath,
    }, 30000);
    const selectionData = {
      userRequest: senderId,
      collection: musicInfo.collection,
      timestamp: Date.now(),
    };
    const rememberSelectionMessage = (result) => {
      const ids = [
        result?.message?.msgId,
        result?.message?.cliMsgId,
        ...(Array.isArray(result?.attachment) ? result.attachment.flatMap((item) => [item?.msgId, item?.cliMsgId]) : []),
      ].filter(Boolean).map(String);
      for (const id of new Set(ids)) musicSelectionsMap.set(id, selectionData);
      return ids[0] || null;
    };
    const quotedMsgId = rememberSelectionMessage(imageListMessage);
    if (!quotedMsgId) throw new Error("Không nhận được message ID của danh sách SoundCloud");

    setSelectionsMapData(senderId, {
      quotedMsgId,
      collection: musicInfo.collection,
      timestamp: Date.now(),
      platform: PLATFORM,
    });

    console.log(
      `[SoundCloud:search-timing] query=${JSON.stringify(question)} ` +
      `search=${Math.round(searchFinishedAt - commandStartedAt)}ms ` +
      `total=${Math.round(performance.now() - commandStartedAt)}ms`
    );
  } catch (error) {
    console.error("Error handling music command:", error);
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: "Đã xảy ra lỗi khi xử lý lệnh của bạn. Vui lòng thử lại sau.",
      },
      true,
      30000
    );
  } finally {
    if (imagePath) deleteFile(imagePath);
  }
}

export function handleMusicReply(api, message, isAdminLevelHighest) {
  return handleMusicReplyPriority(api, message, isAdminLevelHighest);
}

async function handleMusicReplyPriority(api, message, isAdminLevelHighest) {
  const senderId = message.data.uidFrom;
  const idBot = api.getBotId();
  let track;

  try {
    if (!message.data.quote) return false;

    const quotedMsgId = [message.data.quote.globalMsgId, message.data.quote.cliMsgId]
      .filter(Boolean)
      .map(String)
      .find((id) => musicSelectionsMap.has(id));
    if (!quotedMsgId) return false;
    if (!musicSelectionsMap.has(quotedMsgId)) return false;

    const musicData = musicSelectionsMap.get(quotedMsgId);
    if (musicData.userRequest !== senderId) return false;

    let selection = removeMention(message);
    const selectedIndex = parseInt(selection) - 1;
    if (isNaN(selectedIndex)) {
      const object = {
        caption: `Lựa chọn không hợp lệ. Vui lòng chọn một số từ danh sách.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return true;
    }

    const { collection } = musicSelectionsMap.get(quotedMsgId);
    if (selectedIndex < 0 || selectedIndex >= collection.length) {
      const object = {
        caption: `Số bạn chọn không nằm trong danh sách. Vui lòng chọn lại.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return true;
    }

    track = collection[selectedIndex];
    // if (!isAdminLevelHighest && track.duration > 1800000) {
    //   const object = {
    //     caption: `Thời lượng nhạc vượt quá thời gian tin nhắn tồn tại, vui lòng chọn bài khác.`,
    //   };
    //   await sendMessageWarningRequest(api, message, object, 30000);
    //   return true;
    // }

    const msgDel = {
      type: message.type,
      threadId: message.threadId,
      data: {
        cliMsgId: message.data.quote.cliMsgId,
        msgId: message.data.quote.globalMsgId,
        uidFrom: idBot,
      },
    };
    void Promise.allSettled([
      api.deleteMessage(msgDel, false),
      api.addReaction("CLOCK", message),
    ]);
    // await api.undoMessage(message);
    musicSelectionsMap.delete(quotedMsgId);

    return await handleSendTrackSoundCloud(api, message, track);
  } catch (error) {
    console.error("Error handling music reply:", error);
    const object = {
      caption: `Đã xảy ra lỗi khi xử lý lấy nhạc từ SoundCloud cho bạn, vui lòng thử lại sau.`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return true;
  }
}

export function handleSendTrackSoundCloud(api, message, track) {
  return handleSendTrackSoundCloudPriority(api, message, track);
}

async function handleSendTrackSoundCloudPriority(api, message, track) {
  const startedAt = performance.now();
  const relayDownloadUrl = buildSoundCloudDownloadRelayUrl(track);
  const progressive = track?.media?.transcodings?.find((item) => item.format?.protocol === "progressive");
  const fallbackTranscoding = progressive || track?.media?.transcodings?.[0];
  const streamData = relayDownloadUrl
    ? {
        url: relayDownloadUrl,
        progressiveUrl: fallbackTranscoding || { quality: "sq" },
        protocol: "relay",
      }
    : await getMusicStreamUrl(track, true);
  if (!streamData) {
    const object = {
      caption: `Xin lỗi, không thể lấy được bài hát này về. Vui lòng thử lại bài khác.`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    await api.addReaction("UNDO", message);
    await api.addReaction("TIEUTAN", message);
    return true;
  }

  const cachedMusic = await getCachedMedia(PLATFORM, track.id, streamData.progressiveUrl.quality, track.title);
  const resolvedAt = performance.now();
  let voiceUrl;
  let progressiveUrl;
  let servedFromCache = false;

  const thumbnailUrl = resolveSoundCloudArtwork(track);
  const thumbnailCandidates = resolveSoundCloudArtworkCandidates(track);
  // asyncTaskManager.runAsync(thumbnailUrl, () => createCircleWebp(api, message, thumbnailUrl, track.id));
  // Cache trước bản AAC v1 có thể chứa MP3 được gắn làm voice: gửi thành công
  // nhưng người nhận không nghe được. Không tái sử dụng các entry cũ đó.
  if (cachedMusic?.voiceCodec === "aac-v2") {
    // Repair cloud URLs written by the old uploader before reusing the cache.
    voiceUrl = ensureVoiceUrlExtension(cachedMusic.fileUrl);
    progressiveUrl = cachedMusic.progressiveUrl;
    if (voiceUrl !== cachedMusic.fileUrl) {
      setCacheData(
        PLATFORM,
        track.id,
        { ...cachedMusic, fileUrl: voiceUrl },
        progressiveUrl?.quality || "sq"
      );
    }
    servedFromCache = Boolean(voiceUrl);
  }

  if (!voiceUrl) {
    progressiveUrl = streamData.progressiveUrl;
    const jobKey = `${track.id}:${progressiveUrl?.quality || "sq"}`;
    let trackJob = soundCloudTrackJobs.get(jobKey);
    const ownsJob = !trackJob;
    if (!trackJob) {
      trackJob = (async () => {
        // Normalize once and share the result when several users request the
        // same song concurrently; duplicate ffmpeg and Zalo uploads are costly.
        const uploadedUrl = await downloadAndConvertAudio(streamData.url, api, message, true);
        if (!uploadedUrl) throw new Error(`SoundCloud upload không trả về link voice cho track ${track.id}`);
        setCacheData(
          PLATFORM,
          track.id,
          {
            title: track.title,
            artist: track.user?.username || "Unknown Artist",
            fileUrl: uploadedUrl,
            progressiveUrl: streamData.progressiveUrl,
            voiceCodec: "aac-v2",
          },
          progressiveUrl?.quality || "sq"
        );
        return uploadedUrl;
      })();
      soundCloudTrackJobs.set(jobKey, trackJob);
    }
    try {
      voiceUrl = await trackJob;
    } finally {
      if (ownsJob && soundCloudTrackJobs.get(jobKey) === trackJob) soundCloudTrackJobs.delete(jobKey);
    }
    console.log(
      `[SoundCloud:timing] track=${track.id} protocol=${streamData.protocol} ` +
      `resolve=${((resolvedAt - startedAt) / 1000).toFixed(2)}s ` +
      `download-convert-upload=${((performance.now() - resolvedAt) / 1000).toFixed(2)}s ` +
      `cache=${ownsJob ? "miss" : "shared"}`
    );
  }

  if (servedFromCache) {
    console.log(
      `[SoundCloud:timing] track=${track.id} protocol=${streamData.protocol} ` +
      `resolve=${((resolvedAt - startedAt) / 1000).toFixed(2)}s cache=hit`
    );
  }

  const stats = [
    track.playback_count && `${track.playback_count.toLocaleString()} 👂`,
    track.likes_count && `${track.likes_count.toLocaleString()} ❤️`,
    track.comment_count && `${track.comment_count.toLocaleString()} 💬`,
  ].filter(Boolean);

  const caption = `> From SoundCloud <\nNhạc Bạn Chọn Đây!!!`;

  const objectMusic = {
    trackId: track.id,
    title: track.title,
    artists: track.user?.username || "Unknown Artist",
    like: track.likes_count,
    listen: track.playback_count,
    comment: track.comment_count,
    source: "SoundCloud",
    caption: caption,
    imageUrl: thumbnailUrl,
    imageUrls: thumbnailCandidates,
    voiceUrl: voiceUrl,
    stats: stats,
    quality: progressiveUrl?.quality || "sq",
    directStream: true,
  };
  await sendVoiceMusic(api, message, objectMusic);
  console.log(`[SoundCloud:timing] track=${track.id} total=${((performance.now() - startedAt) / 1000).toFixed(2)}s`);
  return true;
}
