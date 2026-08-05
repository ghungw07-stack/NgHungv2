import axios from "axios";
import { JSDOM } from "jsdom";
import { LRUCache } from "lru-cache";
import { getGlobalPrefix } from "../../service.js";
import {
  sendMessageCompleteRequest,
  sendMessageFromSQL,
  sendMessageWarningRequest,
} from "../../chat-zalo/chat-style/chat-style.js";
import { downloadAndConvertAudio, downloadMixcloudWithYtDlp } from "../../chat-zalo/chat-special/send-voice/process-audio.js";
import { searchYouTube, getYoutubeVideoInfo } from "../youtube/youtube-service.js";
import { removeMention } from "../../../utils/format-util.js";
import { sendVoiceMusic } from "../../chat-zalo/chat-special/send-voice/send-voice.js";
import { setSelectionsMapData } from "../index.js";
import { getCachedMedia, setCacheData } from "../../../utils/link-platform-cache.js";
import { deleteFile } from "../../../utils/util.js";
import { createSearchResultImage } from "../../../utils/canvas/search-canvas.js";
import { getApiKeys, setApiKeysMedia } from "../../../utils/api-key-manager.js";
import { asyncTaskManager } from "../../../utils/async-task.js";
import { createCircleWebp } from "../../chat-zalo/chat-special/send-sticker/create-webp.js";

let clientId;

const PLATFORM = "soundcloud";
const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
];
const TIME_TO_SELECT = 60000;

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

const getClientId = async () => {
  const apiKeysManager = getApiKeys();
  try {
    const config = apiKeysManager["SOUNDCLOUD"];
    const lastUpdate = new Date(config.lastUpdate);
    const now = new Date();

    const daysDiff = (now - lastUpdate) / (1000 * 60 * 60 * 24);

    if (daysDiff < 3 && config.clientId) {
      return config.clientId;
    }

    const response = await axios.get("https://soundcloud.com/", {
      headers: getHeaders(),
    });

    const dom = new JSDOM(response.data);
    const scriptTags = Array.from(dom.window.document.querySelectorAll("script[crossorigin]"));

    const urls = scriptTags.map((tag) => tag.src).filter((src) => src && src.startsWith("https"));

    if (!urls.length) {
      throw new Error("Không tìm thấy URL script");
    }

    const scriptResponse = await axios.get(urls[urls.length - 1], {
      headers: getHeaders(),
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
  try {
    const response = await axios.get("https://api-v2.soundcloud.com/search/tracks", {
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
    return response.data;
  } catch (error) {
    console.error("Error fetching music info:", error);
    return null;
  }
}

async function getMusicStreamUrl(link) {
  try {
    const headers = getHeaders();
    const apiUrl = `https://api-v2.soundcloud.com/resolve?url=${link}&client_id=${clientId}`;

    const response = await axios.get(apiUrl, { headers });
    const data = response.data;

    const progressiveUrl = data?.media?.transcodings?.find((t) => t.format.protocol === "progressive");

    if (!progressiveUrl) {
      console.error("Không tìm thấy URL hoàn thiện của đoạn âm thanh này");
      return null;
    }

    const streamResponse = await axios.get(
      `${progressiveUrl.url}?client_id=${clientId}&track_authorization=${data.track_authorization}`,
      {
        headers,
      }
    );

    return {
      url: streamResponse.data.url,
      progressiveUrl,
    };
  } catch (error) {
    console.error("Error getting music stream URL:", error);
    return null;
  }
}

const musicSelectionsMap = new LRUCache({
  max: 500,
  ttl: TIME_TO_SELECT,
});

export async function handleMusicCommand(api, message, aliasCommand) {
  let imagePath = null;
  try {
    if (!clientId) clientId = await getClientId();
    const content = removeMention(message);
    const senderId = message.data.uidFrom;
    const prefix = getGlobalPrefix(api.getBotId());
    const commandContent = content.replace(`${prefix}${aliasCommand}`, "").trim();
    const [question, numberMusic] = commandContent.split("&&");

    if (!question) {
      const object = {
        caption: `Vui lòng nhập từ khóa tìm kiếm\nVí dụ:\n${prefix}${aliasCommand} Bài Hát Cần Tìm`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    const musicInfo = await getMusicInfo(question, parseInt(numberMusic));
    if (!musicInfo || !musicInfo.collection || musicInfo.collection.length === 0) {
      const object = {
        caption: `Không tìm thấy bài hát nào với từ khóa: ${question}`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    let musicListTxt = "Đây là danh sách bài hát trên SoundCloud mà tôi tìm thấy:\n";
    musicListTxt += "Hãy trả lời tin nhắn này với số index của bài hát bạn muốn tìm!";
    musicInfo.collection = musicInfo.collection.filter((track) => track.artwork_url);

    if (musicInfo.collection.length === 0) {
      const object = {
        caption: `Không tìm thấy bài hát nào với từ khóa: ${question}`,
      };
      await sendMessageWarningRequest(api, message, object, TIME_TO_SELECT);
      return;
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
      thumbnailM: track.artwork_url?.replace("-large", "-t500x500") || null,
      listen: track.playback_count,
      like: track.likes_count,
      comment: track.comment_count,
    }));

    imagePath = await createSearchResultImage(songs);

    const object = {
      caption: musicListTxt,
      imagePath: imagePath,
    };
    const musicListMessage = await sendMessageCompleteRequest(api, message, object, 30000);

    const quotedMsgId = musicListMessage?.message?.msgId || musicListMessage?.attachment[0]?.msgId;
    musicSelectionsMap.set(quotedMsgId.toString(), {
      userRequest: senderId,
      collection: musicInfo.collection,
      timestamp: Date.now(),
    });
    setSelectionsMapData(senderId, {
      quotedMsgId: quotedMsgId.toString(),
      collection: musicInfo.collection,
      timestamp: Date.now(),
      platform: PLATFORM,
    });
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

export async function handleMusicReply(api, message, isAdminLevelHighest) {
  const senderId = message.data.uidFrom;
  const idBot = api.getBotId();
  let track;

  try {
    if (!message.data.quote || !message.data.quote.globalMsgId) return false;

    const quotedMsgId = message.data.quote.globalMsgId.toString();
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
    await api.deleteMessage(msgDel, false);
    await api.addReaction("CLOCK", message);
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

export async function handleSendTrackSoundCloud(api, message, track) {
  const streamData = await getMusicStreamUrl(track.permalink_url);
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
  let voiceUrl;
  let progressiveUrl;

  const object = {
    caption: `Chờ lấy nhạc một chút, xong sẽ gọi cho hay.` + `\n\n⏳ ${track.title}`,
  };

  const thumbnailUrl = track.artwork_url?.replace("-large", "-t500x500");
  // asyncTaskManager.runAsync(thumbnailUrl, () => createCircleWebp(api, message, thumbnailUrl, track.id));
  if (cachedMusic) {
    voiceUrl = cachedMusic.fileUrl;
    progressiveUrl = cachedMusic.progressiveUrl;
  } else {
    await sendMessageCompleteRequest(api, message, object, 10000);
    progressiveUrl = streamData.progressiveUrl;

    const hlsM4a = track.media?.transcodings?.find(t => t.format.protocol === "hls" && t.format.mime_type.includes("mp4a"));
    let m3u8Url = null;
    if (hlsM4a) {
      try {
        const streamResponse = await axios.get(`${hlsM4a.url}?client_id=${track.client_id || "TwElDfIgW9RpAzLMUSy9g1VvI2Kao7my"}&track_authorization=${track.track_authorization}`);
        m3u8Url = streamResponse.data.url;
      } catch (e) {
        console.warn("Lỗi lấy HLS url:", e.message);
      }
    }
    
    // Luôn ưu tiên dùng HLS M3U8 để lấy chuẩn AAC mà không cần chuyển đổi
    const finalDownloadUrl = m3u8Url || streamData.url;
    voiceUrl = await downloadAndConvertAudio(finalDownloadUrl, api, message, true);
    
    setCacheData(
      PLATFORM,
      track.id,
      {
        title: track.title,
        artist: track.user?.username || "Unknown Artist",
        fileUrl: voiceUrl,
        progressiveUrl: streamData.progressiveUrl,
      },
      progressiveUrl.quality
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
    voiceUrl: voiceUrl,
    stats: stats,
    quality: progressiveUrl.quality,
  };
  await sendVoiceMusic(api, message, objectMusic);
  return true;
}
