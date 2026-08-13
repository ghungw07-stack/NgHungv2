import axios from "axios";
import { JSDOM } from "jsdom";
import { LRUCache } from "lru-cache";
import { getGlobalPrefix } from "../../../service.js";
import {
  sendMessageCompleteRequest,
  sendMessageFromSQL,
  sendMessageWarningRequest,
} from "../../../chat-zalo/chat-style/chat-style.js";
import { downloadAndConvertAudio } from "../../../chat-zalo/chat-special/send-voice/process-audio.js";
import { removeMention } from "../../../../utils/format-util.js";
import { sendVoiceMusic } from "../../../chat-zalo/chat-special/send-voice/send-voice.js";
import { parseQuickSelection, setSelectionsMapData } from "../../index.js";
import { getCachedMedia, setCacheData } from "../../../../utils/link-platform-cache.js";
import { checkContentIsLink, deleteFile, downloadFile } from "../../../../utils/util.js";
import { createSearchResultImage } from "../../../../utils/canvas/search-canvas.js";
import { getApiKeys, setApiKeysMedia } from "../../../../utils/api-key-manager.js";
import { asyncTaskManager } from "../../../../utils/async-task.js";
import { createCircleWebp } from "../../../chat-zalo/chat-special/send-sticker/create-webp.js";
import SpotifyAPI from "./spotify-api.js";
import SpotifyDown from "./spotify-download.js";

const spotifyScrapper = new SpotifyAPI(getApiKeys()["SPOTIFY"].cookie);
const spotifyDownload = new SpotifyDown();

const PLATFORM = "spotify";
const TIME_TO_SELECT = 60000;

const musicSelectionsMap = new LRUCache({
  max: 500,
  ttl: TIME_TO_SELECT,
});

export async function handleMusicSpotifyCommand(api, message, aliasCommand) {
  let imagePath = null;
  try {
    const content = removeMention(message);
    const senderId = message.data.uidFrom;
    const prefix = getGlobalPrefix(api.getBotId());
    const commandContent = content.replace(`${prefix}${aliasCommand}`, "").trim();
    const quickSelection = parseQuickSelection(commandContent);
    const [question, numberMusic] = quickSelection.query.split("&&");

    if (checkContentIsLink(question)) {
      return handleDownloadSpotifyLink(api, message, aliasCommand);
    }

    if (!question) {
      const object = {
        caption: `Vui lòng nhập từ khóa tìm kiếm\nVí dụ:\n${prefix}${aliasCommand} Bài Hát Cần Tìm`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    const musicList = await spotifyScrapper.searchTracks(question);
    if (!musicList || musicList.length === 0) {
      const object = {
        caption: `Không tìm thấy bài hát nào với từ khóa: ${question}`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    const limitedMusicList = musicList.slice(0, parseInt(numberMusic) || 10);
    if (quickSelection.selectedIndex !== null) {
      const track = limitedMusicList[quickSelection.selectedIndex];
      if (!track) {
        return await sendMessageWarningRequest(api, message, {
          caption: `Không có kết quả số ${quickSelection.selectedIndex + 1}.`,
        }, 30000);
      }
      await api.addReaction("CLOCK", message);
      return await handleSendTrackSpotify(api, message, track);
    }

    let musicListTxt = "Đây là danh sách bài hát trên Spotify mà tôi tìm thấy:\n";
    musicListTxt += "Hãy trả lời tin nhắn này với số index của bài hát bạn muốn tìm!";

    const songs = limitedMusicList.map((track) => ({
      title: track.title,
      artistsNames: track.artist,
      thumbnailM: track.thumbnail,
      publishedTime: track.duration,
    }));

    imagePath = await createSearchResultImage(songs, api.getBotId());

    const object = {
      caption: musicListTxt,
      imagePath: imagePath,
    };
    const musicListMessage = await sendMessageCompleteRequest(api, message, object, 30000);

    const quotedMsgId = musicListMessage?.message?.msgId || musicListMessage?.attachment[0]?.msgId;
    musicSelectionsMap.set(quotedMsgId.toString(), {
      userRequest: senderId,
      collection: limitedMusicList,
      timestamp: Date.now(),
    });
    setSelectionsMapData(senderId, {
      quotedMsgId: quotedMsgId.toString(),
      collection: limitedMusicList,
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

export async function handleMusicSpotifyReply(api, message) {
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

    return await handleSendTrackSpotify(api, message, track);
  } catch (error) {
    console.error("Error handling music reply:", error);
    const object = {
      caption: `Đã xảy ra lỗi khi xử lý lấy nhạc từ Spotify cho bạn, vui lòng thử lại sau.`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return true;
  }
}

export async function handleSendTrackSpotify(api, message, track) {
  const quality = "128 Kbps";

  const cachedMusic = await getCachedMedia(PLATFORM, track.id, quality, track.title);
  let voiceUrl;

  const thumbnailUrl = track.thumbnail;
  const trackInfoPromise = spotifyScrapper.getTrackInfo(track.uri).catch(() => null);

  if (cachedMusic) {
    voiceUrl = cachedMusic.fileUrl;
  } else {
    const streamData = await spotifyScrapper.getStreamSong(track.id);
    if (!streamData) {
      const object = {
        caption: `Xin lỗi, không thể lấy được bài hát này về. Vui lòng thử lại bài khác.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      await Promise.allSettled([api.addReaction("UNDO", message), api.addReaction("TIEUTAN", message)]);
      return true;
    }
    const object = {
      caption: `Chờ lấy nhạc một chút, xong sẽ gọi cho hay.` + `\n\n⏳ ${track.title}`,
    };
    await sendMessageCompleteRequest(api, message, object, 10000);
    voiceUrl = await downloadAndConvertAudio(streamData, api, message, true);
    setCacheData(
      PLATFORM,
      track.id,
      {
        title: track.title,
        artist: track.artist,
        fileUrl: voiceUrl,
      },
      quality
    );
  }

  const musicInfo = await trackInfoPromise;
  const caption = `> From Spotify <\nNhạc Bạn Chọn Đây!!!`;

  const objectMusic = {
    trackId: track.id,
    title: track.title,
    artists: track.artist,
    source: "Spotify",
    caption: caption,
    imageUrl: thumbnailUrl,
    voiceUrl: voiceUrl,
    quality: quality,
    listen: musicInfo?.data?.trackUnion?.playcount,
  };
  await sendVoiceMusic(api, message, objectMusic);
  return true;
}

export async function handleDownloadSpotifyLink(api, message, aliasCommand) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const link = content.replace(`${prefix}${aliasCommand}`, "").trim();
  const quality = "128Kbps";

  let metaData = null;
  try {
    metaData = await spotifyDownload.getTrackData(link);
  } catch {
    const object = {
      caption: `Xin lỗi, link cung cấp không hợp lệ hoặc không thể tải bài này về, vui lòng thử lại với bài khác.`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    await api.addReaction("UNDO", message);
    await api.addReaction("TIEUTAN", message);
    return true;
  }

  const track = metaData;

  const trackInfoPromise = spotifyScrapper.getTrackInfo(track.uri).catch(() => null);
  const cachedMusic = await getCachedMedia(PLATFORM, track.id, quality, track.name);
  let voiceUrl;

  const thumbnailUrl = track.album.images.reduce(
    (max, item) => (item.height > (max?.height || 0) ? item : max),
    null
  )?.url;
  const artist = track.artists.map((a) => a.name).join(", ") || "Unknown Artist";
  // asyncTaskManager.runAsync(thumbnailUrl, () => createCircleWebp(api, message, thumbnailUrl, track.id));
  if (cachedMusic) {
    voiceUrl = cachedMusic.fileUrl;
  } else {
    let getStream = null;
    try {
      getStream = await spotifyDownload.convertLink(link);
    } catch {
      const object = { caption: `Xin lỗi, không tìm thấy link stream của bài hát này...` };
      await sendMessageWarningRequest(api, message, object, 30000);
      await api.addReaction("UNDO", message);
      await api.addReaction("TIEUTAN", message);
      return true;
    }
    const object = {
      caption: `Chờ lấy nhạc một chút, xong sẽ gọi cho hay.` + `\n\n⏳ ${track.name}`,
    };
    await sendMessageCompleteRequest(api, message, object, 10000);
    voiceUrl = await downloadAndConvertAudio(getStream.url, api, message, true);
    setCacheData(
      PLATFORM,
      track.id,
      {
        title: track.name,
        artist: artist,
        fileUrl: voiceUrl,
      },
      quality
    );
  }

  const musicInfo = await trackInfoPromise;
  const caption = `> From Spotify <\nNhạc Bạn Chọn Đây!!!`;

  const objectMusic = {
    trackId: track.id,
    title: track.name,
    artists: artist,
    source: "Spotify",
    caption: caption,
    imageUrl: thumbnailUrl,
    voiceUrl: voiceUrl,
    quality: quality,
    listen: musicInfo?.data?.trackUnion?.playcount,
  };
  await sendVoiceMusic(api, message, objectMusic);
  return true;
}
