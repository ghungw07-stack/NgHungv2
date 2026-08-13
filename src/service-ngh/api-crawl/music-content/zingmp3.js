import axios from "axios";
import crypto from "crypto";
import { LRUCache } from "lru-cache";
import { MessageMention } from "zlbotngh";
import { getGlobalPrefix } from "../../service.js";
import { downloadAndConvertAudio } from "../../chat-zalo/chat-special/send-voice/process-audio.js";
import {
  sendMessageCompleteRequest,
  sendMessageFailed,
  sendMessageWarningRequest,
} from "../../chat-zalo/chat-style/chat-style.js";
import { removeMention } from "../../../utils/format-util.js";
import { sendVoiceMusic, sendVoiceMusicNotQuote } from "../../chat-zalo/chat-special/send-voice/send-voice.js";
import { deleteSelectionsMapData, parseQuickSelection, setSelectionsMapData } from "../index.js";
import { getCachedMedia, setCacheData } from "../../../utils/link-platform-cache.js";
import { createSearchResultImage } from "../../../utils/canvas/search-canvas.js";
import { deleteFile, downloadFile } from "../../../utils/util.js";
import { getApiKeys } from "../../../utils/api-key-manager.js";
import { processLrcFile } from "../../../utils/support-read.js";
import { asyncTaskManager } from "../../../utils/async-task.js";
import { createCircleWebp } from "../../chat-zalo/chat-special/send-sticker/create-webp.js";

// Author: NGH
// Description: ZingMP3 API rebuild by N D Q

const PLATFORM = "zingmp3";
const URL = "https://zingmp3.vn";
let API_KEY = "Có Trình Mới Lấy Được API";
let SECRET_KEY = "Có Trình Mới Lấy Được SECRET_KEY";
let idkey = 0;
let cookiePremium;

let VERSION = "1.11.11";
let CTIME = String(Math.floor(Date.now() / 1000));
const p = ["ctime", "id", "type", "page", "count", "version"];

function recheckApiKeyZingMp3() {
  const config = getApiKeys()["ZINGMP3"];
  if (config) {
    idkey += 1;
    if (idkey >= config.listApi.length) idkey = 0;
    const apiKeys = config.listApi[idkey];
    SECRET_KEY = apiKeys.secretKey;
    API_KEY = apiKeys.apiKey;
  }
}

(async () => {
  const config = getApiKeys()["ZINGMP3"];
  if (config) {
    const apiKeys = config.listApi[idkey];
    SECRET_KEY = apiKeys.secretKey;
    API_KEY = apiKeys.apiKey;
    VERSION = config.version;
    cookiePremium = config.cookiePremium ? config.cookiePremium : "";
  }
})();

const TIME_TO_SELECT = 60000;

const musicSelectionsMap = new LRUCache({
  max: 500,
  ttl: TIME_TO_SELECT,
});

function getHash256(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

function getHmac512(str, key) {
  return crypto.createHmac("sha512", key).update(Buffer.from(str, "utf8")).digest("hex");
}

function sortParams(params) {
  const sorted = {};
  Object.keys(params)
    .sort()
    .forEach((key) => {
      sorted[key] = params[key];
    });
  return sorted;
}

function encodeParamsToString(params, separator = "") {
  const encode = encodeURIComponent;
  return Object.keys(params)
    .map((key) => {
      const value = encode(params[key]);
      return value.length > 5000 ? "" : `${encode(key)}=${value}`;
    })
    .filter((param) => param !== "")
    .join(separator);
}

function getStringParams(params) {
  const sortedParams = sortParams(params);
  const filteredParams = {};

  for (const key in sortedParams) {
    if (p.includes(key) && params[key] !== null && params[key] !== undefined && params[key] !== "") {
      filteredParams[key] = sortedParams[key];
    }
  }

  return encodeParamsToString(filteredParams, "");
}

function getSig(path, params) {
  const stringParams = getStringParams(params);
  return getHmac512(path + getHash256(stringParams), SECRET_KEY);
}

let _cachedCookie = null;
let _cookieExpiry = 0;
const COOKIE_TTL = 10 * 60 * 1000; // Cache cookie 10 phút

async function getCookie() {
  if (_cachedCookie && Date.now() < _cookieExpiry) {
    return _cachedCookie;
  }
  try {
    const res = await axios.get(URL, { timeout: 8000 });
    if (res.headers["set-cookie"]) {
      _cachedCookie = res.headers["set-cookie"][1];
      _cookieExpiry = Date.now() + COOKIE_TTL;
      return _cachedCookie;
    }
    return null;
  } catch (error) {
    console.error("Lỗi khi lấy cookie:", error);
    if (_cachedCookie) return _cachedCookie;
    throw error;
  }
}

async function getCookiePremium() {
  try {
    const tmpCookie = cookiePremium;
    if (tmpCookie && !tmpCookie.endsWith(";")) cookiePremium += ";";
    return cookiePremium + (await getCookie());
  } catch (error) {
    console.error("Lỗi khi lấy cookie:", error);
    throw error;
  }
}

async function requestZingMp3(path, params = {}, options = {}) {
  try {
    const cookie = options.cookie || (await getCookie());
    const response = await axios.get(`${URL}${path}`, {
      headers: {
        Cookie: cookie,
      },
      params,
    });
    return response.data;
  } catch (error) {
    console.error("Lỗi request Zing MP3:", error);
    recheckApiKeyZingMp3();
    throw error;
  }
}

export async function chartHomeZingMp3() {
  CTIME = String(Math.floor(Date.now() / 1000));
  const pathChart = "/api/v2/page/get/chart-home";
  const params = {
    ctime: CTIME,
    version: VERSION,
    apiKey: API_KEY,
  };
  return requestZingMp3(pathChart, {
    ...params,
    sig: getSig(pathChart, params),
  });
}

export async function searchMusicZingMp3(keyword, numberMusic) {
  CTIME = String(Math.floor(Date.now() / 1000));
  const pathSearch = "/api/v2/search";
  const params = {
    q: keyword,
    type: "song",
    count: numberMusic || 10,
    allowCorrect: 1,
    ctime: CTIME,
    version: VERSION,
    apiKey: API_KEY,
  };
  return requestZingMp3(pathSearch, {
    ...params,
    sig: getSig(pathSearch, params),
  });
}

export async function getSong(songId) {
  CTIME = String(Math.floor(Date.now() / 1000));
  const pathSong = "/api/v2/page/get/song";
  const params = {
    id: songId,
    ctime: CTIME,
    version: VERSION,
    apiKey: API_KEY,
  };
  return requestZingMp3(pathSong, {
    ...params,
    sig: getSig(pathSong, params),
  });
}

export async function getStreamingSong(songId) {
  CTIME = String(Math.floor(Date.now() / 1000));
  const pathStreaming = "/api/v2/song/get/streaming";
  const params = {
    id: songId,
    ctime: CTIME,
    version: VERSION,
    apiKey: API_KEY,
  };
  return requestZingMp3(
    pathStreaming,
    {
      ...params,
      sig: getSig(pathStreaming, params),
    },
    {
      cookie: await getCookiePremium(),
    }
  );
}

export async function getLyric(songId) {
  CTIME = String(Math.floor(Date.now() / 1000));
  const pathLyric = "/api/v2/lyric/get/lyric";
  const params = {
    id: songId,
    BGId: 0,
    ctime: CTIME,
    version: VERSION,
    apiKey: API_KEY,
  };
  return requestZingMp3(pathLyric, {
    ...params,
    sig: getSig(pathLyric, params),
  });
}

function extractZingMp3Url(keyword) {
  const urlPattern = /https?:\/\/zingmp3\.vn\/[^\s]+/;
  const match = keyword.match(urlPattern);
  return match ? match[0] : null;
}

async function processSongData(songId, songData) {
  const [songInfo, streamingInfo] = await Promise.all([
    songData?.track ? songData.track : getSong(songId),
    getStreamingSong(songId),
  ]);

  if (songInfo.err === -1023) {
    throw new Error(songInfo.msg);
  }

  if (!streamingInfo.data) {
    throw new Error(streamingInfo.msg);
  }

  const isLosssless = songData?.subCommand?.includes("lossless");
  let linkMusic;
  let quality;
  if (isLosssless && streamingInfo.data["lossless"]) {
    quality = "lossless";
    linkMusic = streamingInfo.data["lossless"];
  } else {
    linkMusic = streamingInfo.data["320"];
    quality = "320kbps";
    if (!linkMusic || linkMusic.toLowerCase().includes("vip")) {
      linkMusic = streamingInfo.data["128"];
      quality = "128kbps";
    }
  }

  return {
    songData: songInfo.data,
    linkMusic,
    quality,
  };
}

async function getChartRankInfo(encodeId) {
  try {
    const resultChart = await chartHomeZingMp3();
    let chartData = new Map();

    if (resultChart?.data?.RTChart?.items) {
      resultChart.data.RTChart.items.forEach((item, index) => {
        chartData.set(item.encodeId, {
          rank: index + 1,
          score: item.score,
        });
      });
    }
    return chartData.get(encodeId);
  } catch (error) {
    console.error("Lỗi lấy thông tin chart:", error);
    return null;
  }
}

async function prepareAndSendMusic(api, message, songData, linkMusic, quality, captionCustom) {
  const cachedMusic = await getCachedMedia(PLATFORM, songData.encodeId, quality, songData.title);
  let voiceUrl;

  const thumbnailUrl = songData.thumbnailM.replace(/w\d+_/i, "w1200_");
  // asyncTaskManager.runAsync(thumbnailUrl, () => createCircleWebp(api, message, thumbnailUrl, songData.encodeId));
  if (cachedMusic) {
    voiceUrl = cachedMusic.fileUrl;
  } else {
    const object = {
      caption: `🎶 Chờ lấy nhạc một chút, xong sẽ gọi cho hay.\n\n🎵 ${songData.title}\n🔊 Quality: ${quality}`,
    };
    await sendMessageCompleteRequest(api, message, object, 5000);
    voiceUrl = await downloadAndConvertAudio(linkMusic, api, message, true);
    setCacheData(
      PLATFORM,
      songData.encodeId,
      {
        fileUrl: voiceUrl,
        title: songData.title,
        artist: songData.artistsNames,
      },
      quality
    );
  }

  const stats = [
    songData.listen && `${songData.listen.toLocaleString()} 👂`,
    songData.like && `${songData.like.toLocaleString()} ❤️`,
    songData.rank && `🏆 Top ${songData.rank} BXH`,
  ].filter(Boolean);

  const objectMusic = {
    trackId: songData.encodeId,
    title: songData.title,
    artists: songData.artistsNames,
    like: songData.like,
    listen: songData.listen,
    comment: songData.comment,
    quality: quality,
    isPremium: songData.streamingStatus == 2,
    source: "ZingMP3",
    caption: captionCustom || `> From ZingMP3 <\nNhạc Bạn Chọn Đây!!!`,
    imageUrl: thumbnailUrl,
    voiceUrl: voiceUrl,
    stats: stats,
    rank: songData.rankChart || songData.rank,
    score: songData.score || 0,
  };

  await sendVoiceMusic(api, message, objectMusic);
}

export async function handleZingMp3Command(api, message, aliasCommand) {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  let imagePath = null;

  try {
    const content = removeMention(message);
    const prefix = getGlobalPrefix(api.getBotId());
    const commandContent = content.replace(`${prefix}${aliasCommand}`, "").trim();
    const quickSelection = parseQuickSelection(commandContent);
    const [keyword, numberMusic] = quickSelection.query.split("&&");

    if (!keyword) {
      const object = {
        caption: `Vui lòng nhập từ khóa tìm kiếm\nVí dụ:\n${prefix}${aliasCommand} Bài Hát Cần Tìm`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    const url = extractZingMp3Url(keyword);
    if (url) {
      const encodeId = url.split("/").pop().split(".")[0];
      try {
        const { songData, linkMusic, quality } = await processSongData(encodeId);

        const chartInfo = await getChartRankInfo(encodeId);

        if (chartInfo) {
          songData.rank = chartInfo.rank;
          songData.score = chartInfo.score;
        }

        await prepareAndSendMusic(api, message, songData, linkMusic, quality);
      } catch (error) {
        const object = {
          caption: `Link không hợp lệ hoặc link thuộc thể loại album!` + `\nNguyên Nhân: ${error.message}`,
        };
        await sendMessageWarningRequest(api, message, object, 300000);
      }
      return;
    }

    const result = await searchMusicZingMp3(keyword, numberMusic);
    if (!result.data || !result.data.items || result.data.items.length === 0) {
      const object = {
        caption: `Không tìm thấy bài hát nào với từ khóa: ${keyword}`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    const songs = result.data.items;
    const resultChart = await chartHomeZingMp3();
    let chartData = new Map();

    if (resultChart?.data?.RTChart?.items) {
      resultChart.data.RTChart.items.forEach((item, index) => {
        chartData.set(item.encodeId, {
          rank: index + 1,
          score: item.score,
        });
      });
    }

    const songsWithInfo = await Promise.all(
      songs.map(async (song) => {
        const songInfo = await getSong(song.encodeId);
        const chartInfo = chartData.get(song.encodeId);
        return {
          ...song,
          ...songInfo.data,
          rank: chartInfo?.rank,
        };
      })
    );

    if (quickSelection.selectedIndex !== null) {
      const song = songsWithInfo[quickSelection.selectedIndex];
      if (!song) {
        return await sendMessageWarningRequest(api, message, {
          caption: `Không có kết quả số ${quickSelection.selectedIndex + 1}.`,
        }, 30000);
      }
      await api.addReaction("CLOCK", message);
      return await handleSendTrackZingMp3(api, message, song, quickSelection.option || "");
    }

    let musicListTxt = "Đây là danh sách bài hát trên ZingMP3 mà tôi tìm thấy:\n";
    musicListTxt += "Hãy trả lời tin nhắn này với số index của bài hát bạn muốn nghe!\n";
    musicListTxt += "VD: 1 hoặc 1 lyric|lossless|timelyric...";

    const formattedSongs = songsWithInfo.map((song) => ({
      title: song.title,
      artistsNames: song.artistsNames,
      thumbnailM: song.thumbnailM,
      listen: song.listen,
      like: song.like,
      rankChart: song.rank,
      comment: song.comment,
      isPremium: song.streamingStatus == 2,
    }));

    imagePath = await createSearchResultImage(formattedSongs, api.getBotId());

    const object = {
      caption: musicListTxt,
      imagePath: imagePath,
    };
    const musicListMessage = await sendMessageCompleteRequest(api, message, object, TIME_TO_SELECT);

    const quotedMsgId = musicListMessage?.message?.msgId || musicListMessage?.attachment[0]?.msgId;

    musicSelectionsMap.set(quotedMsgId.toString(), {
      userRequest: senderId,
      collection: songsWithInfo,
      timestamp: Date.now(),
    });
    setSelectionsMapData(senderId, {
      quotedMsgId: quotedMsgId.toString(),
      collection: songsWithInfo,
      timestamp: Date.now(),
      platform: PLATFORM,
    });
  } catch (error) {
    console.error("Lỗi xử lý lệnh ZingMP3:", error);
    await api.sendMessage(
      {
        msg: `${senderName} Đã xảy ra lỗi khi xử lý lệnh của bạn. Vui lòng thử lại sau.`,
        mentions: [MessageMention(senderId, senderName.length, 0)],
        ttl: 30000,
      },
      message.threadId,
      message.type
    );
  } finally {
    if (imagePath) deleteFile(imagePath);
  }
}

export async function handleTopChartZingMp3(api, message, aliasCommand) {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const prefix = getGlobalPrefix(api.getBotId());
  const commandContent = removeMention(message).replace(`${prefix}${aliasCommand}`, "").trim();
  let numberMusic = parseInt(commandContent) || 10;
  let imagePath = null;

  try {
    const result = await chartHomeZingMp3();
    if (!result.data || !result.data.RTChart || !result.data.RTChart.items) {
      throw new Error("Không thể lấy được danh sách bài hát từ ZingMP3");
    }

    const top20Songs = result.data.RTChart.items.slice(0, numberMusic);
    const songsWithRank = await Promise.all(
      top20Songs.map(async (song, index) => {
        const songInfo = await getSong(song.encodeId);
        return {
          ...song,
          ...songInfo.data,
          rankChart: index + 1,
          score: song.score,
        };
      })
    );

    let musicListTxt = `[ TOP ${numberMusic} Bài Hát Hot Nhất ZingMP3 ]\n\n`;
    musicListTxt += "Hãy trả lời tin nhắn này với số thứ tự bài hát bạn muốn nghe!\n\n";

    const formattedSongs = songsWithRank.map((song) => ({
      title: song.title,
      artistsNames: song.artistsNames,
      thumbnailM: song.thumbnailM.replace(/w\d+_/i, "w600_"),
      rankChart: song.rankChart,
      score: song.score,
    }));

    imagePath = await createSearchResultImage(formattedSongs, api.getBotId());

    const object = {
      caption: musicListTxt,
      imagePath: imagePath,
    };

    const musicListMessage = await sendMessageCompleteRequest(api, message, object, TIME_TO_SELECT);

    const quotedMsgId = musicListMessage?.message?.msgId || musicListMessage?.attachment[0]?.msgId;

    musicSelectionsMap.set(quotedMsgId.toString(), {
      userRequest: senderId,
      collection: songsWithRank,
      timestamp: Date.now(),
    });
    setSelectionsMapData(senderId, {
      quotedMsgId: quotedMsgId.toString(),
      collection: songsWithRank,
      timestamp: Date.now(),
      platform: PLATFORM,
    });
  } catch (error) {
    console.error("Lỗi xử lý chart ZingMP3:", error);
    await api.sendMessage(
      {
        msg: `${senderName} Đã xảy ra lỗi khi lấy danh sách bài hát. Vui lòng thử lại sau.`,
        mentions: [MessageMention(senderId, senderName.length, 0)],
        ttl: 30000,
      },
      message.threadId,
      message.type
    );
  } finally {
    if (imagePath) deleteFile(imagePath);
  }
}

export async function handleZingMp3Reply(api, message) {
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
    let selectedIndex = selection.split(" ")[0];
    const subCommand = selection.split(" ").slice(1).join(" ").trim();
    selectedIndex = parseInt(selectedIndex) - 1;
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
    deleteSelectionsMapData(senderId);

    track = collection[selectedIndex];

    return await handleSendTrackZingMp3(api, message, track, subCommand);
  } catch (error) {
    console.error(`Không thể lấy stream URL cho track ${track?.encodeId}:`, error);
    const object = {
      caption: `Không thể lấy bài này, vui lòng thử bài khác!\n` + `Nguyên Nhân: ${error.message}`,
    };
    await sendMessageWarningRequest(api, message, object, 300000);
    return true;
  }
}

export async function handleSendTrackZingMp3(api, message, track, subCommandInput) {
  try {
    const subCommand = subCommandInput?.toLowerCase() || "";
    const { linkMusic, quality } = await processSongData(track.encodeId, { track, subCommand });
    await prepareAndSendMusic(api, message, track, linkMusic, quality);
    const isCallLyric = subCommand.includes("lyric");
    const isShowTime = subCommand.includes("timelyric");
    const lyric = isCallLyric || isShowTime ? await getLyric(track.encodeId) : null;
    if (subCommand) {
      if (isCallLyric || isShowTime) {
        if (lyric.data && lyric.data.sentences) {
          let formattedLyric = "Lời bài hát:\n\n";
          lyric.data.sentences.forEach((sentence) => {
            const line = sentence.words.map((word) => word.data).join(" ");
            if (line.trim()) {
              formattedLyric += line + "\n";
            }
          });
          await api.sendMessage({ msg: formattedLyric, ttl: 3600000 }, message.threadId, message.type);
        } else if (lyric.data && lyric.data.file) {
          let fileLrcPath;
          try {
            fileLrcPath = await downloadFile(lyric.data.file);
            let formattedLyric = "Lời bài hát:\n\n";
            formattedLyric += await processLrcFile(fileLrcPath, isShowTime);
            await api.sendMessage({ msg: formattedLyric, ttl: 3600000 }, message.threadId, message.type);
          } catch {
            await sendMessageFailed(api, message, `Lỗi khi xử lý file lyric từ link: ${lyric.data.file}`, false);
          } finally {
            await deleteFile(fileLrcPath);
          }
        } else {
          await sendMessageFailed(api, message, "Không tìm thấy lời cho bài hát này.", false);
        }
      }
    }
    return true;
  } catch (error) {
    console.error(`Không thể lấy stream URL cho track ${track?.encodeId}:`, error);
    const object = {
      caption: `Không thể lấy bài này, vui lòng thử bài khác!\n` + `Nguyên Nhân: ${error.message}`,
    };
    await sendMessageWarningRequest(api, message, object, 300000);
    await api.addReaction("UNDO", message);
    await api.addReaction("TIEUTAN", message);
    return true;
  }
}

export async function handleRandomChartZingMp3(api, message, caption, timeToLive = 1800000) {
  try {
    const result = await chartHomeZingMp3();
    const chartItems = result.data.RTChart.items;
    // Chỉ lấy random 1 bài từ top 20, không cần fetch info cho tất cả
    const randomIndex = Math.floor(Math.random() * Math.min(20, chartItems.length));
    const randomSong = chartItems[randomIndex];

    // Chỉ fetch info cho bài được chọn
    const songInfo = await getSong(randomSong.encodeId);
    const songData = { ...randomSong, ...songInfo.data, rankChart: randomIndex + 1 };

    let captionFinal = caption || `[ Zing MP3 Chart ]\nChào buổi sáng!\n\n`;
    const streamingInfo = await getStreamingSong(songData.encodeId);
    if (!streamingInfo.data) {
      throw new Error(streamingInfo.msg);
    }

    let linkMusic = streamingInfo.data["320"];
    if (!linkMusic || linkMusic.toLowerCase().includes("vip")) {
      linkMusic = streamingInfo.data["128"];
    }
    const thumbnailUrl = songData.thumbnailM.replace(/w\d+_/i, "w1200_");
    const voiceUrl = await downloadAndConvertAudio(linkMusic, api, message);

    captionFinal += `🎵 Music: ${songData.title}\n👤 Artist: ${songData.artistsNames}\n#Top${
      randomIndex + 1
    }_ZingMP3\n\n`;
    captionFinal += `Cùng thưởng thức bài hát hiện tại đang hot thứ ${randomIndex + 1} trên nền tảng ZingMP3 nào!!!`;

    const stats = [
      songData.listen && `${songData.listen.toLocaleString()} 👂`,
      songData.like && `${songData.like.toLocaleString()} ❤️`,
      songData.rank && `🏆 Top ${songData.rank} BXH`,
    ].filter(Boolean);

    const object = {
      trackId: songData.encodeId,
      title: songData.title,
      artists: songData.artistsNames,
      like: songData.like,
      listen: songData.listen,
      comment: songData.comment,
      source: "ZingMP3",
      caption: captionFinal,
      imageUrl: thumbnailUrl,
      voiceUrl: voiceUrl,
      stats: stats,
      rank: songData.rankChart || songData.rank,
      score: songData.score || 0,
    };

    await sendVoiceMusicNotQuote(api, message, object, timeToLive);
  } catch (error) {
    console.error("Lỗi xử lý chart ZingMP3:", error);
  }
}
