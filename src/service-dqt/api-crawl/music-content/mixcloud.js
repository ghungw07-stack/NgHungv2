import axios from "axios";
import { LRUCache } from "lru-cache";
import youtubeDl from "youtube-dl-exec";
import { getGlobalPrefix } from "../../service.js";
import {
  sendMessageCompleteRequest,
  sendMessageFromSQL,
  sendMessageWarningRequest,
} from "../../chat-zalo/chat-style/chat-style.js";
import { removeMention } from "../../../utils/format-util.js";
import { sendVoiceMusic } from "../../chat-zalo/chat-special/send-voice/send-voice.js";
import { parseQuickSelection, setSelectionsMapData } from "../index.js";
import { getCachedMedia, setCacheData } from "../../../utils/link-platform-cache.js";
import { deleteFile } from "../../../utils/util.js";
import { createSearchResultImage } from "../../../utils/canvas/search-canvas.js";
import { asyncTaskManager } from "../../../utils/async-task.js";
import { createCircleWebp } from "../../chat-zalo/chat-special/send-sticker/create-webp.js";
import { extractAudioFromM3U8, downloadMixcloudWithYtDlp } from "../../chat-zalo/chat-special/send-voice/process-audio.js";

const PLATFORM = "mixcloud";
const TIME_TO_SELECT = 60000;

const musicSelectionsMap = new LRUCache({
  max: 500,
  ttl: TIME_TO_SELECT,
});

async function searchMixcloudCloudcasts(query, limit = 10) {
  try {
    const response = await axios.get("https://api.mixcloud.com/search/", {
      params: {
        q: query,
        type: "cloudcast",
        limit,
      },
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching mixcloud search:", error);
    return null;
  }
}

async function getMixcloudStreamInfo(link) {
  try {
    const info = await youtubeDl(link, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
    });

    if (!info || !info.formats || info.formats.length === 0) {
      return null;
    }

    const audioFormats = info.formats.filter(
      (f) => f.acodec && f.acodec !== "none" && (!f.vcodec || f.vcodec === "none")
    );

    let chosen =
      audioFormats.find((f) => !(f.protocol || "").includes("m3u8") && !(f.format_id || "").includes("hls")) ||
      audioFormats.find((f) => (f.protocol || "").includes("http") && !(f.protocol || "").includes("m3u8")) ||
      audioFormats.find((f) => (f.protocol || "").includes("m3u8")) ||
      audioFormats.find((f) => (f.format_id || "").includes("hls")) ||
      audioFormats[0];

    if (!chosen) {
      chosen = info.formats.find((f) => f.acodec && f.acodec !== "none") || info.formats[0];
    }

    if (!chosen) return null;

    return {
      url: chosen.url,
      isM3U8: (chosen.protocol || "").includes("m3u8") || (chosen.ext || "").includes("m3u8"),
      quality: chosen.format_note || chosen.abr || "default",
    };
  } catch (error) {
    console.error("Error getting Mixcloud stream info:", error);
    return null;
  }
}

export async function handleMixcloudCommand(api, message, aliasCommand) {
  let imagePath = null;
  try {
    const content = removeMention(message);
    const senderId = message.data.uidFrom;
    const prefix = getGlobalPrefix(api.botId || api.getBotId());
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

    const limit = Math.min(parseInt(numberMusic) || 10, 50);
    const searchResult = await searchMixcloudCloudcasts(question, limit);

    if (!searchResult || !Array.isArray(searchResult.data) || searchResult.data.length === 0) {
      const object = {
        caption: `Không tìm thấy bài nào với từ khóa: ${question}`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    if (quickSelection.selectedIndex !== null) {
      const track = searchResult.data[quickSelection.selectedIndex];
      if (!track) {
        return await sendMessageWarningRequest(api, message, {
          caption: `Không có kết quả số ${quickSelection.selectedIndex + 1}.`,
        }, 30000);
      }
      await api.addReaction("CLOCK", message);
      return await handleSendTrackMixcloud(api, message, track);
    }

    let musicListTxt = "Đây là danh sách cloudcast trên Mixcloud mà tôi tìm thấy:\n";
    musicListTxt += "Hãy trả lời tin nhắn này với số index của cloudcast bạn muốn nghe!";

    const songs = searchResult.data.map((item) => ({
      title: item.name,
      artistsNames: item.user?.name || item.user?.username || "Unknown Artist",
      thumbnailM:
        item.pictures?.extra_large ||
        item.pictures?.["1024wx1024h"] ||
        item.pictures?.large ||
        item.pictures?.medium ||
        null,
      listen: item.play_count,
      like: item.favorite_count,
      comment: item.comment_count,
    }));

    imagePath = await createSearchResultImage(songs, api.getBotId());

    const object = {
      caption: musicListTxt,
      imagePath: imagePath,
    };
    const musicListMessage = await sendMessageCompleteRequest(api, message, object, TIME_TO_SELECT);

    const quotedMsgId = musicListMessage?.message?.msgId || musicListMessage?.attachment?.[0]?.msgId;
    if (!quotedMsgId) return;

    musicSelectionsMap.set(quotedMsgId.toString(), {
      userRequest: senderId,
      collection: searchResult.data,
      timestamp: Date.now(),
    });

    setSelectionsMapData(senderId, {
      quotedMsgId: quotedMsgId.toString(),
      collection: searchResult.data,
      timestamp: Date.now(),
      platform: PLATFORM,
    });
  } catch (error) {
    console.error("Error handling mixcloud command:", error);
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: "Đã xảy ra lỗi khi xử lý lệnh Mixcloud của bạn. Vui lòng thử lại sau.",
      },
      true,
      30000
    );
  } finally {
    if (imagePath) deleteFile(imagePath);
  }
}
export async function handleMixcloudReply(api, message, isAdminLevelHighest) {
  const senderId = message.data.uidFrom;
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

    const idBot = api.getBotId();
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
    musicSelectionsMap.delete(quotedMsgId);

    return await handleSendTrackMixcloud(api, message, track);
    return true;
  } catch (error) {
    console.error("Error handling music reply:", error);
    const object = {
      caption: `Đã xảy ra lỗi khi xử lý lấy nhạc từ Mixcloud cho bạn, vui lòng thử lại sau.`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return true;
  }
}
export async function handleSendTrackMixcloud(api, message, track) {
  if (!track || !track.url) {
    const object = {
      caption: `Xin lỗi, không thể lấy được thông tin cloudcast này. Vui lòng thử lại bài khác.`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    await api.addReaction("UNDO", message);
    await api.addReaction("TIEUTAN", message);
    return true;
  }

  const trackId = track.key || track.slug || track.url;
  const trackTitle = track.name || "Unknown Title";
  const artistName = track.user?.name || track.user?.username || "Unknown Artist";

  const cachedMusic = await getCachedMedia(PLATFORM, trackId, "default", trackTitle);
  let voiceUrl;
  let quality = "default";

  const thumbnailUrl =
    track.pictures?.extra_large ||
    track.pictures?.["1024wx1024h"] ||
    track.pictures?.large ||
    track.pictures?.medium ||
    track.pictures?.medium_mobile ||
    null;

  const object = {
    caption: `Chờ lấy nhạc một chút, xong sẽ gọi cho hay.\n\n⏳ ${trackTitle}`,
  };

  try {
    if (cachedMusic) {
      voiceUrl = cachedMusic.fileUrl;
      quality = cachedMusic.progressiveUrl?.quality || cachedMusic.quality || "default";
    } else {
      await sendMessageCompleteRequest(api, message, object, 10000);

      const streamInfo = await getMixcloudStreamInfo(track.url);
      if (!streamInfo || !streamInfo.url) {
        const warnObj = {
          caption: `Xin lỗi, không thể lấy được stream cho cloudcast này. Vui lòng thử lại bài khác.`,
        };
        await sendMessageWarningRequest(api, message, warnObj, 30000);
        await api.addReaction("UNDO", message);
        await api.addReaction("TIEUTAN", message);
        return true;
      }

      quality = streamInfo.quality || "default";

      try {
        try {
          voiceUrl = await downloadMixcloudWithYtDlp(track.url, api, message, true);
        } catch (ytDlpError) {

          if (streamInfo.isM3U8 || streamInfo.url.endsWith(".m3u8")) {
            voiceUrl = await extractAudioFromM3U8(streamInfo.url, api, message, 0, true);
          } else {
            const directInfo = await youtubeDl(track.url, {
              extractAudio: true,
              audioFormat: "mp3",
              audioQuality: 0,
              dumpSingleJson: true,
              noCheckCertificates: true,
              noWarnings: true,
              preferFreeFormats: true,
            });

            const audioFormat =
              (directInfo.formats || []).find((f) => f.acodec && f.acodec !== "none" && (!f.vcodec || f.vcodec === "none")) ||
              null;

            if (!audioFormat || !audioFormat.url) {
              throw new Error("Không tìm thấy định dạng audio phù hợp để tải.");
            }

            const { downloadAndConvertAudio } = await import(
              "../../chat-zalo/chat-special/send-voice/process-audio.js"
            );
            voiceUrl = await downloadAndConvertAudio(audioFormat.url, api, message, true);
          }
        }
      } catch (error) {
        console.error("Error when downloading Mixcloud via m3u8/ffmpeg:", error);
        const warnObj = {
          caption: `Xin lỗi, đã xảy ra lỗi khi tải cloudcast từ Mixcloud.\nVui lòng thử lại bài khác.`,
        };
        await sendMessageWarningRequest(api, message, warnObj, 30000);
        await api.addReaction("UNDO", message);
        await api.addReaction("TIEUTAN", message);
        return true;
      }

      setCacheData(
        PLATFORM,
        trackId,
        {
          title: trackTitle,
          artist: artistName,
          fileUrl: voiceUrl,
          quality: quality,
        },
        "default"
      );
    }

    // if (thumbnailUrl) {
    //   asyncTaskManager.runAsync(thumbnailUrl, () => createCircleWebp(api, message, thumbnailUrl, trackId));
    // }

    const stats = [
      track.play_count && `${track.play_count.toLocaleString()} 👂`,
      track.favorite_count && `${track.favorite_count.toLocaleString()} ❤️`,
      track.comment_count && `${track.comment_count.toLocaleString()} 💬`,
      track.listener_count && `${track.listener_count.toLocaleString()} 👤`,
    ].filter(Boolean);

    const caption = `> From Mixcloud <\nNhạc Bạn Chọn Đây!!!`;

    const objectMusic = {
      trackId: trackId,
      title: trackTitle,
      artists: artistName,
      like: track.favorite_count,
      listen: track.play_count,
      comment: track.comment_count,
      source: "Mixcloud",
      caption: caption,
      imageUrl: thumbnailUrl,
      voiceUrl: voiceUrl,
      stats: stats,
      quality: quality,
    };

    await sendVoiceMusic(api, message, objectMusic);
    return true;
  } catch (error) {
    console.error("Error handling send Mixcloud track:", error);
    const object = {
      caption: `Đã xảy ra lỗi khi xử lý lấy nhạc từ Mixcloud cho bạn, vui lòng thử lại sau.`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return true;
  }
}
