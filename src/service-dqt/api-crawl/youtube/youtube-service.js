import fs from "fs";
import path from "path";

import axios from "axios";
import { JSDOM } from "jsdom";
import schedule from "node-schedule";
import youtubedl from "youtube-dl-exec";
import { promisify } from "util";
import { Worker } from "worker_threads";
import * as cheerio from "cheerio";

import { MessageMention } from "../../../api-zalo/index.js";
import { deleteFile } from "../../../utils/util.js";
import { randomIDTemp, removeMention } from "../../../utils/format-util.js";
import { getGlobalPrefix } from "../../service.js";
import {
  sendMessageCompleteRequest,
  sendMessageProcessingRequest,
  sendMessageWarningRequest,
} from "../../chat-zalo/chat-style/chat-style.js";
import { sendVoiceMusic } from "../../chat-zalo/chat-special/send-voice/send-voice.js";
import { parseQuickSelection, setSelectionsMapData } from "../index.js";
import { getCachedMedia, setCacheData } from "../../../utils/link-platform-cache.js";
import { readSettingConfig, tempDir } from "../../../utils/io-json.js";
import { createSearchResultImage } from "../../../utils/canvas/search-canvas.js";
import { isAdmin } from "../../../index.js";
import { uploadAudioFile, downloadAndConvertAudio } from "../../chat-zalo/chat-special/send-voice/process-audio.js";
import { asyncTaskManager } from "../../../utils/async-task.js";
import { createCircleWebp } from "../../chat-zalo/chat-special/send-sticker/create-webp.js";
import { getClientAxios } from "../../utilities/browser-launch.js";
import { getVideoMetadata } from "../../../api-zalo/utils.js";

// Author: NGH
// Description: Code maintained by NGH

const CONFIG = {
  baseUrl: "https://www.youtube.com",
  searchPath: "/results",
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.1 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  },
  maxResults: 10,
  timeWaitSelection: 60000,
  limitMinute: 90,
};
const PLATFORM_YOUTUBE = "youtube";
export const audioFormat = "bestaudio[filesize<80M]/bestaudio[filesize_approx<80M]/worstaudio[ext=m4a]/worstaudio";
const videoFormat360 = "bestvideo[height<=360][vcodec^=avc1]+bestaudio/best[height<=360][vcodec^=avc1]";
const videoFormat720 =
  "bestvideo[height<=720][fps<=60][vcodec^=avc1]+bestaudio/best[height<=720][fps<=60][vcodec^=avc1]";
const videoFormat1080 =
  "bestvideo[height<=1080][fps<=60][vcodec^=avc1]+bestaudio/best[height<=1080][fps<=60][vcodec^=avc1]";
const videoFormatMax = "bestvideo[vcodec^=avc1]+bestaudio/best[vcodec^=avc1]";
const videoFormatMaxOnly = "bestvideo+bestaudio";

const extractInitialData = (html) => {
  try {
    const dom = new JSDOM(html);
    const scripts = dom.window.document.getElementsByTagName("script");

    for (const script of scripts) {
      const content = script.textContent;
      if (content.includes("var ytInitialData = ")) {
        const startIndex = content.indexOf("var ytInitialData = ") + "var ytInitialData = ".length;
        const endIndex = content.indexOf("};", startIndex);

        if (startIndex === -1 || endIndex === -1) continue;

        let jsonStr = content.substring(startIndex, endIndex + 1);

        jsonStr = jsonStr.replace(/\\x[0-9A-Fa-f]{2}/g, "");
        jsonStr = jsonStr.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");

        try {
          return JSON.parse(jsonStr);
        } catch (parseError) {
          console.error("Lỗi parse JSON:", parseError);
          const ytDataRegex = /ytInitialData\s*=\s*({.+?});\s*</;
          const match = content.match(ytDataRegex);
          if (match && match[1]) {
            return JSON.parse(match[1]);
          }
        }
      }
    }
    return null;
  } catch (error) {
    console.error("Lỗi khi parse dữ liệu YouTube:", error);
    return null;
  }
};

const parseVideoInfo = (item) => {
  try {
    const videoRenderer = item.videoRenderer;
    if (!videoRenderer) return null;

    return {
      videoId: videoRenderer.videoId,
      title: videoRenderer.title?.runs?.[0]?.text || "",
      thumbnail: videoRenderer.thumbnail?.thumbnails?.[0]?.url || "",
      duration: videoRenderer.lengthText?.simpleText || "",
      viewCount: videoRenderer.viewCountText?.simpleText || "",
      publishedTime: videoRenderer.publishedTimeText?.simpleText || "",
      channelName: videoRenderer.ownerText?.runs?.[0]?.text || "",
      channelId: videoRenderer.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || "",
      description: videoRenderer.descriptionSnippet?.runs?.[0]?.text || "",
      url: `https://www.youtube.com/watch?v=${videoRenderer.videoId}`,
    };
  } catch (error) {
    console.error("Lỗi khi parse thông tin video:", error);
    return null;
  }
};

export const searchYouTube = async (query) => {
  try {
    const searchUrl = `${CONFIG.baseUrl}${CONFIG.searchPath}?search_query=${encodeURIComponent(query)}`;

    const response = await axios.get(searchUrl, {
      headers: {
        ...CONFIG.headers,
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        Expires: "0",
      },
      timeout: 10000,
    });

    validateYouTubeResponse(response);

    const initialData = extractInitialData(response.data);
    if (!initialData) throw new Error("Không thể lấy được dữ liệu từ YouTube");

    const items =
      initialData.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]
        ?.itemSectionRenderer?.contents || [];

    const videos = items.map(parseVideoInfo).filter((video) => video !== null && video.videoId && video.title);

    if (videos.length === 0) {
      throw new Error("Không tìm thấy video nào");
    }

    return videos;
  } catch (error) {
    console.error("Lỗi khi tìm kiếm video YouTube:", error.message);
    return [];
  }
};

export const downloadYoutubeVideo = (videoUrl, videoId, format, platform = PLATFORM_YOUTUBE) => {
  const settingConfig = readSettingConfig();
  const PROXY = settingConfig["PROXY_HTTP"] || undefined;
  return new Promise((resolve, reject) => {
    try {
      const ext = format === audioFormat ? "mp3" : "mp4";
      const videoPath = path.join(tempDir, `${platform}_${videoId}_${randomIDTemp()}.${ext}`);
      let options =
        format === audioFormat
          ? {
              output: videoPath,
              format: format,
              noCheckCertificates: true,
              noWarnings: true,
              preferFreeFormats: true,
              bufferSize: "16K",
              proxy: PROXY,
              addHeader: ["referer:youtube.com"],
            }
          : {
              output: videoPath,
              format: format,
              mergeOutputFormat: "mp4",
              noCheckCertificates: true,
              noWarnings: true,
              preferFreeFormats: true,
              bufferSize: "16K",
              proxy: PROXY,
              addHeader: [
                "referer:youtube.com",
                "user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.1 Safari/537.36",
              ],
            };

      if (platform !== PLATFORM_YOUTUBE) {
        options =
          format === audioFormat
            ? {
                output: videoPath,
                extractAudio: true,
                audioFormat: "mp3",
                format: format,
                noCheckCertificates: true,
                noWarnings: true,
                preferFreeFormats: true,
                proxy: PROXY,
                bufferSize: "16K",
              }
            : (options = {
                output: videoPath,
                format: format,
                mergeOutputFormat: "mp4",
                noCheckCertificates: true,
                noWarnings: true,
                preferFreeFormats: true,
                proxy: PROXY,
                bufferSize: "16K",
              });
      }

      const worker = new Worker(new URL("./youtube-download-worker.js", import.meta.url), {
        workerData: { videoUrl, videoPath, options },
      });

      worker.on("message", (result) => {
        if (result.success) {
          resolve(result.videoPath);
        } else {
          reject(new Error(result.error));
        }
      });

      worker.on("error", reject);
      worker.on("exit", (code) => {
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });
    } catch (error) {
      reject(error);
    }
  });
};

async function getYoutubeDirectAudioUrl(videoUrl) {
  try {
    const playerInfo = await getYoutubeVideoInfo(videoUrl);
    if (playerInfo.directAudioUrl) return playerInfo.directAudioUrl;
  } catch {
    // Một số video ẩn URL trong signatureCipher, tiếp tục dùng yt-dlp để giải mã.
  }

  const settingConfig = readSettingConfig();
  const output = await youtubedl(videoUrl, {
    getUrl: true,
    format: audioFormat,
    noPlaylist: true,
    noCheckCertificates: true,
    noWarnings: true,
    proxy: settingConfig["PROXY_HTTP"] || undefined,
    addHeader: [
      "referer:youtube.com",
      "user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127 Safari/537.36",
    ],
  });
  const directUrl = String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^https?:\/\//i.test(line));
  if (!directUrl) throw new Error("YouTube không trả về URL audio trực tiếp");
  return directUrl;
}

const convertDurationToMs = (duration) => {
  try {
    const parts = duration.split(":").reverse();
    let ms = 0;

    if (parts[0]) ms += parseInt(parts[0]) * 1000;
    if (parts[1]) ms += parseInt(parts[1]) * 60 * 1000;
    if (parts[2]) ms += parseInt(parts[2]) * 60 * 60 * 1000;

    return ms;
  } catch (error) {
    console.error("Lỗi khi chuyển đổi thời lượng:", error);
    return 0;
  }
};

const videoSelectionsMap = new Map();

schedule.scheduleJob("*/5 * * * * *", () => {
  const currentTime = Date.now();
  for (const [msgId, data] of videoSelectionsMap.entries()) {
    if (currentTime - data.timestamp > CONFIG.timeWaitSelection) {
      videoSelectionsMap.delete(msgId);
    }
  }
});

const extractYoutubeUrl = (text) => {
  const youtubeRegex =
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]+)(?:\S+)?/i;
  const match = text.match(youtubeRegex);
  return match ? match[0] : null;
};

export const extractYoutubeId = (url) => {
  try {
    let uniqueId = null;

    if (url.includes("?v=")) uniqueId = url.split("?v=")[1];

    if (!uniqueId) {
      const match = url.match(/youtu\.be\/([^?]+)/);
      uniqueId = match ? match[1] : null;
    }

    if (!uniqueId) {
      if (url.includes("/shorts/")) uniqueId = url.split("/shorts/")[1];
      if (uniqueId && uniqueId.includes("?")) {
        uniqueId = uniqueId.split("?")[0];
      }
    }

    if (uniqueId && uniqueId.includes("&")) {
      uniqueId = uniqueId.split("&")[0];
    }

    return uniqueId;
  } catch (error) {
    console.error("Lỗi khi tách YouTube ID:", error);
    return url;
  }
};

export async function handleYoutubeCommand(api, message, aliasCommand, isAdminLevelHighest) {
  const content = removeMention(message);
  const senderId = message.data.uidFrom;
  const prefix = getGlobalPrefix(api.getBotId());
  let imagePath = null;

  try {
    const keyword = content.replace(`${prefix}${aliasCommand}`, "").trim();
    const quickSelection = parseQuickSelection(keyword);

    if (!keyword) {
      const object = {
        caption: `Vui lòng nhập từ khóa tìm kiếm hoặc link\nVí dụ:\n${prefix}${aliasCommand} Nội Dung Cần Tìm`,
      };
      return await sendMessageCompleteRequest(api, message, object, 30000);
    }

    const [query, typeVideo = "normal"] = quickSelection.query.split(" ");

    const url = extractYoutubeUrl(query);
    if (url) {
      let videoPath = null;
      try {
        const videoInfo = await getYoutubeVideoInfo(url);
        if (!videoInfo) {
          throw new Error("Không thể lấy thông tin video");
        }
        await api.addReaction("CLOCK", message);
        await handleSendMediaYoutube(api, message, videoInfo, typeVideo, videoPath, isAdminLevelHighest);

        return true;
      } catch (error) {
        console.error("Lỗi khi xử lý URL video:", error);
        const object = {
          caption: "Có lỗi xảy ra khi xử lý video từ URL!",
        };
        await sendMessageWarningRequest(api, message, object, 30000);
      } finally {
        if (videoPath) await deleteFile(videoPath);
      }
      return;
    }

    const [searchQuery, numberVideo = 10] = quickSelection.query.split("&&");

    let videos = await searchYouTube(searchQuery);

    let limit = parseInt(numberVideo) || CONFIG.maxResults;
    videos = videos.filter((video) => video.duration !== "").slice(0, limit);

    if (videos.length === 0) {
      const object = {
        caption: `Không tìm thấy video phù hợp với cụm từ: ${searchQuery}`,
      };
      return await sendMessageWarningRequest(api, message, object, 30000);
    }

    if (quickSelection.selectedIndex !== null) {
      const video = videos[quickSelection.selectedIndex];
      if (!video) {
        return await sendMessageWarningRequest(api, message, {
          caption: `Không có kết quả số ${quickSelection.selectedIndex + 1}.`,
        }, 30000);
      }
      await api.addReaction("CLOCK", message);
      return await handleSendMediaYoutube(
        api,
        message,
        video,
        quickSelection.option || "default",
        null,
        isAdminLevelHighest
      );
    }

    let videoListText = "Đây là danh sách video tôi tìm thấy từ Youtube:\n";
    videoListText += "Hãy trả lời tin nhắn này với số thứ tự video bạn muốn xem!\n";
    videoListText += "\nVD: Chat 1 hoặc 1 audio|low|high|max";

    imagePath = await createSearchResultImage(
      videos.map((video) => ({
        title: video.title,
        artistsNames: video.channelName,
        thumbnailM: video.thumbnail,
        view: video.viewCount,
        publishedTime: video.publishedTime,
      })),
      api.getBotId()
    );

    const object = {
      caption: videoListText,
      imagePath: imagePath,
    };

    const listMessage = await sendMessageCompleteRequest(api, message, object, CONFIG.timeWaitSelection);

    const quotedMsgId = listMessage?.message?.msgId || listMessage?.attachment[0]?.msgId;

    videoSelectionsMap.set(quotedMsgId.toString(), {
      userRequest: senderId,
      collection: videos,
      timestamp: Date.now(),
    });
    setSelectionsMapData(senderId, {
      quotedMsgId: quotedMsgId.toString(),
      collection: videos,
      timestamp: Date.now(),
      platform: PLATFORM_YOUTUBE,
    });
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh YouTube:", error);
    const object = {
      caption: "Có lỗi xảy ra khi xử lý video!",
    };
    await sendMessageWarningRequest(api, message, object, 30000);
  } finally {
    if (imagePath) deleteFile(imagePath);
  }
}

export const getVideoFormatByQuality = (qualityParam) => {
  switch (qualityParam.toLowerCase()) {
    case "360p":
      return getVideoFormat("low");
    case "1080p":
      return getVideoFormat("high");
    case "max":
      return getVideoFormat("max");
    case "best":
      return getVideoFormat("best");
    case "audio":
      return getVideoFormat("audio");
    default:
      return getVideoFormat("default");
  }
};

export const getVideoFormat = (qualityParam) => {
  switch (qualityParam.toLowerCase()) {
    case "audio":
      return {
        format: audioFormat,
        qualityText: "audio",
        timeNotify: 8000,
      };
    case "low":
      return {
        format: videoFormat360,
        qualityText: "360p",
        timeNotify: 8000,
      };
    case "high":
      return {
        format: videoFormat1080,
        qualityText: "1080p",
        timeNotify: 16000,
      };
    case "max":
      return {
        format: videoFormatMax,
        qualityText: "Cao nhất",
        timeNotify: 24000,
      };
    case "best":
      return {
        format: videoFormatMaxOnly,
        qualityText: "Cao nhất",
        timeNotify: 24000,
      };
    default:
      return {
        format: videoFormat720,
        qualityText: "720p",
        timeNotify: 10000,
      };
  }
};

export async function handleYoutubeReply(api, message, isAdminLevelHighest) {
  const senderId = message.data.uidFrom;
  const idBot = api.getBotId();
  const senderName = message.data.dName;

  try {
    if (!message.data.quote || !message.data.quote.globalMsgId) return false;

    const quotedMsgId = message.data.quote.globalMsgId.toString();
    if (!videoSelectionsMap.has(quotedMsgId)) return false;

    const videoData = videoSelectionsMap.get(quotedMsgId);
    if (videoData.userRequest !== senderId) return false;

    const content = removeMention(message);
    const [index, qualityParam = "default"] = content.split(" ");
    const selectedIndex = parseInt(index) - 1;

    if (isNaN(selectedIndex)) {
      const object = {
        caption: `Lựa chọn không hợp lệ. Vui lòng chọn một số từ danh sách.\nCú pháp: <số> [low/high/audio]\nVí dụ:\n1 - Chất lượng 720p\n1 low - Chất lượng 360p\n1 high - 1080p\n1 audio - Chỉ tải âm thanh`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return true;
    }

    const { collection } = videoSelectionsMap.get(quotedMsgId);
    if (selectedIndex < 0 || selectedIndex >= collection.length) {
      const object = {
        caption: `Số bạn chọn không nằm trong danh sách. Vui lòng chọn lại.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return true;
    }

    const video = collection[selectedIndex];
    let videoPath = null;
    try {
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
      videoSelectionsMap.delete(quotedMsgId);

      return await handleSendMediaYoutube(api, message, video, qualityParam, videoPath, isAdminLevelHighest);
    } catch (error) {
      if (videoPath) await deleteFile(videoPath);
      console.error("Lỗi khi tải video:", error);
      const object = {
        caption: "Có lỗi xảy ra khi xử lý video!",
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return true;
    }
  } catch (error) {
    console.error("Lỗi xử lý reply YouTube:", error);
    const object = {
      caption: `Đã xảy ra lỗi khi xử lý tin nhắn của bạn. Vui lòng thử lại sau.`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return true;
  }
}

const validateYouTubeResponse = (response) => {
  if (!response?.data) {
    throw new Error("Không nhận được dữ liệu từ YouTube");
  }

  if (!response.data.includes("ytInitialData")) {
    throw new Error("Không phải trang kết quả tìm kiếm YouTube");
  }

  return true;
};

const convertPublishedTimeToVietnamese = (publishedTime) => {
  if (!publishedTime) return "Không xác định";

  const timeMap = {
    "second ago": "giây trước",
    "seconds ago": "giây trước",
    "minute ago": "phút trước",
    "minutes ago": "phút trước",
    "hour ago": "giờ trước",
    "hours ago": "giờ trước",
    "day ago": "ngày trước",
    "days ago": "ngày trước",
    "week ago": "tuần trước",
    "weeks ago": "tuần trước",
    "month ago": "tháng trước",
    "months ago": "tháng trước",
    "year ago": "năm trước",
    "years ago": "năm trước",
  };

  let vietnameseTime = publishedTime;
  for (const [eng, viet] of Object.entries(timeMap)) {
    vietnameseTime = vietnameseTime.replace(eng, viet);
  }

  return vietnameseTime;
};

// const formatUploadDateToTimeAgo = (uploadDate) => {
//   try {
//     if (!uploadDate || uploadDate.length !== 8) return "Không xác định";

//     const year = parseInt(uploadDate.substring(0, 4));
//     const month = parseInt(uploadDate.substring(4, 6)) - 1; // JS months are 0-based
//     const day = parseInt(uploadDate.substring(6, 8));

//     const uploadDateTime = new Date(year, month, day);
//     const now = new Date();

//     const diffTime = now - uploadDateTime;
//     const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

//     if (diffDays < 1) return "Hôm nay";
//     if (diffDays === 1) return "Hôm qua";
//     if (diffDays < 7) return `${diffDays} ngày trước`;

//     const diffWeeks = Math.floor(diffDays / 7);
//     if (diffWeeks < 4) return `${diffWeeks} tuần trước`;

//     const diffMonths = Math.floor(diffDays / 30);
//     if (diffMonths < 12) return `${diffMonths} tháng trước`;

//     const diffYears = Math.floor(diffDays / 365);
//     return `${diffYears} năm trước`;
//   } catch (error) {
//     console.error("Lỗi khi format ngày tải lên:", error);
//     return "Không xác định";
//   }
// };

// export const getYoutubeVideoInfo = async (videoUrl) => {
//   try {
//     const options = {
//       dumpSingleJson: true,
//       noWarnings: true,
//       noCallHome: true,
//       noCheckCertificate: true,
//       preferFreeFormats: true,
//       youtubeSkipDashManifest: true,
//     };

//     const videoInfo = await youtubedl(videoUrl, options);

//     if (!videoInfo) {
//       throw new Error("Không thể lấy thông tin video");
//     }

//     return {
//       videoId: videoInfo.id,
//       title: videoInfo.title,
//       description: videoInfo.description,
//       duration: videoInfo.duration,
//       thumbnail: videoInfo.thumbnail,
//       viewCount: videoInfo.view_count.toString(),
//       likeCount: videoInfo.like_count,
//       commentCount: videoInfo.comment_count,
//       channelId: videoInfo.channel_id,
//       channelName: videoInfo.channel,
//       publishedTime: formatUploadDateToTimeAgo(videoInfo.upload_date),
//       categories: videoInfo.categories,
//       tags: videoInfo.tags,
//       isLive: videoInfo.is_live,
//       url: videoInfo.webpage_url,
//     };
//   } catch (error) {
//     console.error("Lỗi khi lấy thông tin video:", error);
//     throw new Error("Không thể lấy thông tin video: " + error.message);
//   }
// };

const formatUploadDateToTimeAgo = (uploadDate) => {
  try {
    if (!uploadDate) return "Không xác định";

    const uploadDateTime = new Date(uploadDate);
    if (isNaN(uploadDateTime.getTime())) return "Không xác định"; // Invalid date

    const now = new Date();
    const diffTime = now - uploadDateTime;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 1) return "Hôm nay";
    if (diffDays === 1) return "Hôm qua";
    if (diffDays < 7) return `${diffDays} ngày trước`;

    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks < 4) return `${diffWeeks} tuần trước`;

    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) return `${diffMonths} tháng trước`;

    const diffYears = Math.floor(diffDays / 365);
    return `${diffYears} năm trước`;
  } catch (error) {
    console.error("Lỗi khi format ngày tải lên:", error);
    return "Không xác định";
  }
};

export const getYoutubeVideoInfo = async (videoUrl) => {
  try {
    const client = getClientAxios();
    const response = await client.get(videoUrl);
    const $ = cheerio.load(response.data);

    const scriptTags = $("script");
    let ytInitialPlayerResponseStr = null;

    scriptTags.each((i, el) => {
      const scriptContent = $(el).html();
      if (scriptContent && scriptContent.includes("var ytInitialPlayerResponse =")) {
        const match = scriptContent.match(/var ytInitialPlayerResponse\s*=\s*(\{.*?\});/s);
        if (match && match[1]) {
          ytInitialPlayerResponseStr = match[1];
          return false;
        }
      }
    });

    if (ytInitialPlayerResponseStr) {
      ytInitialPlayerResponseStr = JSON.parse(ytInitialPlayerResponseStr);
    } else {
      throw new Error("Không thể lấy thông tin video");
    }

    let thumbnails = ytInitialPlayerResponseStr.videoDetails.thumbnail.thumbnails || [];
    let largestThumbnail = thumbnails.reduce((max, thumb) => (thumb.width > (max?.width || 0) ? thumb : max), null);
    const lengthSeconds = parseInt(ytInitialPlayerResponseStr.videoDetails.lengthSeconds) || 0;
    const directAudio = (ytInitialPlayerResponseStr.streamingData?.adaptiveFormats || [])
      .filter((item) => item.url && item.mimeType?.startsWith("audio/"))
      .sort((a, b) => {
        if (lengthSeconds > 1800) {
          // Video > 30 phút: Ưu tiên bitrate thấp nhất để file nhỏ (<100MB) và up nhanh
          return Number(a.bitrate || 0) - Number(b.bitrate || 0);
        }
        // Video ngắn: Ưu tiên bitrate cao nhất
        return Number(b.bitrate || 0) - Number(a.bitrate || 0);
      })[0];

    return {
      videoId: ytInitialPlayerResponseStr.videoDetails.videoId,
      title: ytInitialPlayerResponseStr.videoDetails.title,
      description: ytInitialPlayerResponseStr.videoDetails.shortDescription,
      duration: parseInt(ytInitialPlayerResponseStr.videoDetails.lengthSeconds) * 1000,
      thumbnail: largestThumbnail.url,
      viewCount: ytInitialPlayerResponseStr.videoDetails.viewCount?.toString(),
      likeCount: ytInitialPlayerResponseStr.microformat.playerMicroformatRenderer.likeCount,
      channelId: ytInitialPlayerResponseStr.videoDetails.channelId,
      channelName: ytInitialPlayerResponseStr.videoDetails.author,
      publishedTime: formatUploadDateToTimeAgo(
        ytInitialPlayerResponseStr.microformat.playerMicroformatRenderer.publishDate
      ),
      categories: ytInitialPlayerResponseStr.microformat.playerMicroformatRenderer.category,
      isLive: ytInitialPlayerResponseStr.videoDetails.isLiveContent,
      url: videoUrl,
      directAudioUrl: directAudio?.url || null,
    };
  } catch (error) {
    console.error("Lỗi khi lấy thông tin video:", error);
    throw new Error("Không thể lấy thông tin video: " + error.message);
  }
};

export async function handleSendMediaYoutube(api, message, video, qualityParam, videoPath, isAdminLevelHigh) {
  const { format, qualityText, timeNotify } = getVideoFormat(qualityParam);
  let videoUrl;
  let duration = null;

  let durationMs;
  if (typeof video.duration === "string" && video.duration.includes(":")) {
    durationMs = convertDurationToMs(video.duration);
  } else {
    durationMs = Number(video.duration);
  }
  const maxLimit = format === audioFormat ? 240 : CONFIG.limitMinute; // 4 tiếng cho audio, 90 phút cho video
  if (!isAdminLevelHigh && durationMs > maxLimit * 60 * 1000) {
    return await sendVideoDurationLimitWarning(api, message, video, maxLimit);
  }

  // asyncTaskManager.runAsync(video.thumbnail, () => createCircleWebp(api, message, video.thumbnail, video.videoId));
  const cachedVideo = await getCachedMedia(PLATFORM_YOUTUBE, video.videoId, qualityText, video.title);

  if (cachedVideo) {
    videoUrl = cachedVideo.fileUrl;
    duration = cachedVideo.duration;
  } else {
    const object = {
      caption:
        `Chờ lấy ${qualityText === "audio" ? "nhạc" : "video"} một chút, xong sẽ gọi cho hay.\n\n` +
        `⏳ ${video.title}\n📊 Chất lượng: ${qualityText}`,
    };
    await sendMessageProcessingRequest(api, message, object, timeNotify);

    if (format === audioFormat) {
      try {
        const directAudioUrl = await getYoutubeDirectAudioUrl(video.url);
        videoUrl = await downloadAndConvertAudio(directAudioUrl, api, message, true);
        duration = Math.round(durationMs / 1000);
      } catch (directError) {
        console.warn(`Không lấy được audio trực tiếp, fallback tải file: ${directError.message}`);
      }
    }

    if (!videoUrl) {
      videoPath = await downloadYoutubeVideo(video.url, video.videoId, format);
      if (!fs.existsSync(videoPath)) {
        await api.addReaction("UNDO", message);
        await api.addReaction("TIEUTAN", message);
        throw new Error(`Không thể tải video : ${videoPath}`);
      }

      if (format === audioFormat) {
        videoUrl = await uploadAudioFile(videoPath, api, message);
      } else {
        const uploadVideo = await api.uploadAttachment([videoPath], message.threadId, message.type);
        videoUrl = uploadVideo[0].fileUrl;
      }

      const { duration: getDurationVideo } = await getVideoMetadata(videoPath);
      duration = getDurationVideo;
      await deleteFile(videoPath);
    } else {
      duration ||= Math.round(durationMs / 1000);
    }

    setCacheData(PLATFORM_YOUTUBE, video.videoId, { fileUrl: videoUrl, title: video.title, duration }, qualityText);
  }

  if (format === audioFormat) {
    const object = {
      trackId: video.videoId,
      title: video.title,
      artists: video.channelName,
      source: "Youtube",
      caption: `> From Youtube <\nNhạc Bạn Chọn Đây!!!`,
      imageUrl: video.thumbnail,
      voiceUrl: videoUrl,
      viewCount: video.viewCount,
      publishedTime: convertPublishedTimeToVietnamese(video.publishedTime),
      fastMode: true,
    };
    await sendVoiceMusic(api, message, object);
  } else {
    await api.sendVideo({
      videoUrl: videoUrl,
      threadId: message.threadId,
      threadType: message.type,
      thumbnail: video.thumbnail,
      duration,
      message: {
        text:
          `[ ${message.data.dName} ] \n🎵 Tiêu Đề: ${video.title}\n` +
          `📺 Kênh: ${video.channelName}\n👀 Lượt Xem: ${video.viewCount.replace("views", "")}\n` +
          `📅 Ngày Đăng: ${convertPublishedTimeToVietnamese(video.publishedTime)}\n📊 Chất Lượng: ${qualityText}` +
          `\n[ Watch More On Youtube ]`,
        // mentions: [MessageMention(senderId, senderName.length, 2, false)],
      },
      ttl: isAdminLevelHigh ? 14400000 : 3600000,
    });
    await api.addReaction("UNDO", message);
    await api.addReaction("LIKE", message);
  }

  return true;
}

/**
 * Gửi cảnh báo khi video vượt quá giới hạn thời lượng cho phép.
 * @param {object} api - Đối tượng API để gửi tin nhắn.
 * @param {object} message - Tin nhắn gốc.
 * @param {object} video - Thông tin video (phải có .url).
 * @param {number} limitMinute - Giới hạn phút tối đa.
 * @returns {Promise<any>} Kết quả gửi tin nhắn cảnh báo.
 */
export async function sendVideoDurationLimitWarning(api, message, video, limitMinute = CONFIG.limitMinute) {
  const object = {
    caption:
      `Vì tài nguyên có hạn, không thể lấy video có độ dài hơn ${limitMinute} phút!\n` +
      `Vui lòng chọn lại video khác hoặc truy cập vào link sau để xem đầy đủ: ${video.url}`,
  };
  await api.addReaction("UNDO", message);
  return await sendMessageWarningRequest(api, message, object, 30000);
}
