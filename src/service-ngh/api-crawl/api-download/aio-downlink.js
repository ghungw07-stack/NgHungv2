import axios from "axios";
import path from "path";
import CryptoJS from "crypto-js";
import { getGlobalPrefix } from "../../service.js";
import { MessageMention } from "../../../api-zalo/index.js";
import {
  sendMessageComplete,
  sendMessageCompleteRequest,
  sendMessageProcessingRequest,
  sendMessageWarningRequest,
} from "../../chat-zalo/chat-style/chat-style.js";
import { downloadFile, deleteFile, getImageInfo, getLocalImageInfo, execAsync } from "../../../utils/util.js";
import { sendVoiceMusic } from "../../chat-zalo/chat-special/send-voice/send-voice.js";
import { capitalizeEachWord, randomIDTemp, removeMention } from "../../../utils/format-util.js";
import { setSelectionsMapData } from "../index.js";
import { getCachedMedia, setCacheData } from "../../../utils/link-platform-cache.js";
import { downloadYoutubeVideo, getVideoFormatByQuality, getYoutubeVideoInfo } from "../youtube/youtube-service.js";
import { clearImagePath } from "../../../utils/canvas/index.js";
import { tempDir } from "../../../utils/io-json.js";
import { downloadAndConvertAudio } from "../../chat-zalo/chat-special/send-voice/process-audio.js";
import { getDataDownloadVideoTiktok } from "../tiktok/tiktok-api.js";
import { sendTikTokVideo } from "../tiktok/tiktok-service.js";
import youtubeDl from "youtube-dl-exec";
import { downloadsCache } from "../../../utils/download-upload-cache.js";
import { getVideoMetadata } from "../../../api-zalo/utils.js";

const TIME_TO_LIVE = 86400000;
const TYPE_AUTO_DETECTED = "autodetected";

const me = {
  J2DOWN_SECRET:
    "U2FsdGVkX18wVfoTqTpAQwAnu9WB9osIMSnldIhYg6rMvFJkhpT6eUM9YqgpTrk41mk8calhYvKyhGF0n26IDXNmtXqI8MjsXtsq0nnAQLROrsBuLnu4Mzu63mpJsGyw",
  BASE_URL: "https://j2download.com/",
  API_URL: "https://api.zm.io.vn/v1/",
  API_URL_DOWNLOAD: "https://cdn.zm.io.vn/download/?url=",
  API_URL_M3U8: "https://api.zm.io.vn/v1/m3u8/",
  SOCKET_ENDPOINT: "https://socket.zm.io.vn/",
};

function secretKey() {
  const decrypted = CryptoJS.AES.decrypt(me.J2DOWN_SECRET, "manhg-api");
  return decrypted.toString(CryptoJS.enc.Utf8);
}

function randomString(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function encryptData(data) {
  const keyHex = CryptoJS.enc.Hex.parse(secretKey());
  const iv = CryptoJS.lib.WordArray.random(16);
  const encrypted = CryptoJS.AES.encrypt(data, keyHex, {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return {
    iv: iv.toString(CryptoJS.enc.Hex),
    k: randomString(11) + "8QXBNv5pHbzFt5QC",
    r: "BRTsfMmf3CuN",
    encryptedData: encrypted.toString(),
  };
}

const MEDIA_TYPES = {
  "tiktok.": "tiktok",
  "douyin.": "douyin",
  "capcut.": "capcut",
  "threads.": "threads",
  "instagram.": "instagram",
  "facebook.": "facebook",
  "fb.": "facebook",
  "espn.": "espn",
  "pinterest.": "pinterest",
  "imdb.": "imdb",
  "imgur.": "imgur",
  "ifunny.": "ifunny",
  "izlesene.": "izlesene",
  "reddit.": "reddit",
  "youtube.": "youtube",
  "youtu.": "youtube",
  "twitter.": "twitter",
  "x.com": "twitter",
  "vimeo.": "vimeo",
  "snapchat.": "snapchat",
  "bilibili.": "bilibili",
  "dailymotion.": "dailymotion",
  "sharechat.": "sharechat",
  "likee.": "likee",
  "linkedin.": "linkedin",
  "tumblr.com": "tumblr",
  "hipi.co.in": "hipi",
  "t.me": "telegram",
  "telegram.": "telegram",
  "getstickerpack.com": "getstickerpack",
  "bitchute.com": "bitchute",
  "febspot.com": "febspot",
  "9gag.com": "9gag",
  "ok.ru": "oke",
  "oke.ru": "oke",
  "vk.com": "vk-vkvideo",
  "vk.ru": "vk-vkvideo",
  "vkvideo.": "vk-vkvideo",
  "rumble.com": "rumble",
  "streamable.com": "streamable",
  "ted.com": "ted",
  "tv.sohu.com": "sohutv",
  "sohu.com": "sohutv",
  "xvideos.": "xvideos",
  "xnxx.": "xnxx",
  "xiaohongshu.": "xiaohongshu",
  "ixigua.": "ixigua",
  "weibo.": "weibo",
  "mp.weixin.qq.com": "wechat",
  "channels.weixin.qq.com": "wechat",
  "weixin.qq.com": "wechat",
  "sina.com": "sina",
  "miaopai.": "miaopai",
  "meipai.": "meipai",
  "xiaoying.tv": "xiaoying",
  "national.video": "national",
  "yingke.": "yingke",
  "soundcloud.": "soundcloud",
  "mixcloud.": "mixcloud",
  "spotify.": "spotify",
  "zingmp3.vn": "zingmp3",
  "bandcamp.": "bandcamp",
};

const getMediaType = (url) => {
  const urlLower = url.toLowerCase();
  return Object.entries(MEDIA_TYPES).find(([domain]) => urlLower.includes(domain))?.[1] || "Unknown";
};

function normalizeDouyinUrl(input) {
  const value = String(input || "").trim();
  const match = value.match(/(?:douyin\.com|jingxuan\.douyin\.com)\/m\/video\/(\d+)/i);
  return match ? `https://www.douyin.com/video/${match[1]}` : value;
}

export const getDataYoutubeVideo = async (url) => {
  let dataDownload = {
    error: false,
    reasonFalse: "",
    url: url,
  };

  try {
    const videoInfo = await getYoutubeVideoInfo(url);
    dataDownload.thumbnail = videoInfo.thumbnail;
    dataDownload.title = videoInfo.title;
    dataDownload.author = videoInfo.channelName;
    dataDownload.duration = videoInfo.duration;
    dataDownload.id = videoInfo.videoId;
  } catch (error) {
    dataDownload.error = true;
    dataDownload.reasonFalse =
      "Link này không hợp lệ hoặc không chứa dữ liệu có thể tải,.. vui lòng thử lại với link khác!";
  }
  return dataDownload;
};

export const getDataDownloadVideoFromYtbDL = async (url, mediaType) => {
  let dataDownload = {
    error: false,
    reasonFalse: "",
    url: url,
  };

  try {
    const options = {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
    };

    const videoInfo = await youtubeDl(url, options);
    dataDownload.thumbnail = videoInfo.thumbnail;
    dataDownload.title = videoInfo.title;
    dataDownload.author = mediaType !== "facebook" ? videoInfo.uploader : null;
    dataDownload.duration = videoInfo.duration * 1000;
    dataDownload.id = videoInfo.id;
    dataDownload.formats = videoInfo.formats;
  } catch (error) {
    dataDownload.error = true;
    dataDownload.reasonFalse = "Link này không hợp lệ,.. thử lại với link khác trong phần chia sẻ!";
  }
  return dataDownload;
};

// SnapTikTok không công bố SDK nhưng endpoint ajaxSearch được frontend công
// khai sử dụng. Chỉ lấy các link MP4/MP3 trong response HTML, không chạy JS.
export const getDataDownloadSnapTik = async (url) => {
  try {
    const response = await axios.post(
      "https://snaptiktok.to/api/ajaxSearch",
      new URLSearchParams({ q: url, cursor: "0", page: "0", lang: "vi" }).toString(),
      { timeout: 20000, headers: { "User-Agent": "Mozilla/5.0", "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" } }
    );
    const payload = response.data;
    if (payload?.status !== "ok" || !payload.data) return null;
    const html = String(payload.data).replace(/&amp;/g, "&").replace(/&#x2F;/g, "/");
    const title = (html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || "").replace(/<[^>]+>/g, "").trim();
    const id = html.match(/id=["']TikTokId["'][^>]*value=["']([^"']+)/i)?.[1] || `snaptik_${Date.now()}`;
    const thumbnail = html.match(/<img[^>]+src=["']([^"']+)/i)?.[1] || null;
    const medias = [...html.matchAll(/<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .map(([, link, label]) => ({ link, label: label.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() }))
      .filter(({ link }) => /(?:\.mp4|mime_type=video_|\.mp3|mime_type=audio_)/i.test(link))
      .map(({ link, label }) => ({
        url: link,
        quality: /mp3|audio_/i.test(link) ? "audio" : (/hd/i.test(label) ? "HD" : "MP4"),
        type: /mp3|audio_/i.test(link) ? "audio" : "video",
        extension: /mp3|audio_/i.test(link) ? "mp3" : "mp4",
        title,
        thumbnail,
      }));
    return medias.length ? { id, title, thumbnail, author: "", duration: 0, medias, getBy: "snaptik" } : null;
  } catch (error) {
    console.warn("SnapTikTok fallback lỗi:", error?.message || error);
    return null;
  }
};

// Chuẩn hóa yt-dlp thành cùng format với AIO để dùng làm fallback đa nền tảng.
// yt-dlp hiện có extractor cho hơn 1.000 website; các URL format là direct URL
// nên bot không phải chờ một dịch vụ trung gian xử lý lại file.
const normalizeYtDlpMedia = (videoInfo) => {
  const formats = Array.isArray(videoInfo?.formats) ? videoInfo.formats : [];
  const medias = formats
    .filter((item) => item?.url && (item.vcodec !== "none" || item.acodec !== "none"))
    .map((item) => ({
      url: item.url,
      quality: item.format_note || item.height ? `${item.format_note || ""}${item.height ? ` ${item.height}p` : ""}`.trim() : item.format_id || "default",
      type: item.vcodec !== "none" ? "video" : "audio",
      extension: item.ext || (item.vcodec !== "none" ? "mp4" : "mp3"),
    }));
  return {
    id: videoInfo.id,
    title: videoInfo.title,
    author: videoInfo.uploader || videoInfo.channel,
    thumbnail: videoInfo.thumbnail,
    duration: Number(videoInfo.duration || 0) * 1000,
    medias,
  };
};

// export const getDataDownloadAIO = async (url) => {
//   try {
//     const { iv, k, r, encryptedData } = encryptData(
//       JSON.stringify({
//         url,
//         unlock: !0,
//       })
//     );
//     const response = await axios.post(
//       `${me.API_URL}social/autolink`,
//       { data: { iv, k, r, encryptedData } },
//       { headers: { token: "eyJ0eXAiOiJqd3QiLCJhbGciOiJIUzI1NiJ9.eyJxxx" } }
//     );
//     return response.data;
//   } catch (err) {
//     console.error(`AIO gặp lỗi:`, err);
//     return null;
//   }
// };

export const getDataDownloadAIO = async (url) => {
  try {
    const apiUrl = `https://api.zeidteam.xyz/media-downloader/atd2?url=${encodeURIComponent(url)}`;
    const response = await axios.get(apiUrl, { timeout: 30000 });
    return response.data;
  } catch (err) {
    console.warn(`AIO Zeidteam lỗi, chuyển sang DownAll:`, err?.message || err);
    return await getDataDownloadVNV(url);
  }
};

// Fallback DownAll của VNV. API trả `data.media`, trong khi luồng tải của bot
// dùng `medias`, nên chuẩn hóa tại đây để mọi nền tảng dùng chung một pipeline.
export const getDataDownloadVNV = async (url) => {
  try {
    const response = await axios.get("https://nqduan.id.vn/api/downall", {
      params: { url },
      timeout: 45000,
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 NGH-Bot/1.5.7" },
    });
    const payload = response.data;
    const data = payload?.data || payload?.result || payload;
    const medias = data?.media || data?.medias || [];
    if (payload?.success === false || !Array.isArray(medias) || medias.length === 0) return null;

    return {
      error: false,
      id: data.id || `${data.source || "vnv"}_${Date.now()}`,
      url,
      title: data.title || "Media tải từ liên kết",
      author: data.author || "Không rõ",
      thumbnail: data.thumbnail || data.cover || null,
      duration: Number(data.duration || 0),
      medias: medias
        .filter((item) => item?.url)
        .map((item) => ({
          ...item,
          type: String(item.type || "video").toLowerCase(),
          quality: item.quality || "default",
          extension: item.extension || (item.type === "audio" ? "mp3" : item.type === "image" ? "jpg" : "mp4"),
          thumbnail: item.thumbnail || data.thumbnail || data.cover || null,
        })),
      getBy: "vnv-downall",
    };
  } catch (error) {
    console.warn("VNV DownAll fallback lỗi:", error?.response?.data?.message || error?.message || error);
    return null;
  }
};

const typeText = (type) => {
  switch (type) {
    case "video":
      return "video";
    case "audio":
      return "nhạc";
    case "image":
      return "ảnh";
    default:
      return "tập tin";
  }
};

const downloadSelectionsMap = new Map();
const TIME_WAIT_SELECTION = 30000;

export async function processAndSendMedia(api, message, mediaData) {
  const { selectedMedia, mediaType, uniqueId, duration, title, author, senderId, senderName } = mediaData;

  const quality = selectedMedia.quality || "default";
  const typeFile = selectedMedia.type.toLowerCase();

  if (mediaType === "tiktok") {
    await sendTikTokVideo(api, message, selectedMedia.dataVideo, false, selectedMedia.quality);
    return;
  }

  if (typeFile === "image") {
    const thumbnailPath = path.resolve(tempDir, `${randomIDTemp()}.${selectedMedia.extension}`);
    const thumbnailUrl = selectedMedia.url;

    if (thumbnailUrl) {
      await downloadFile(thumbnailUrl, thumbnailPath);
    }

    await api.sendMessage(
      {
        msg: `[ ${senderName} ]\n> From ${mediaType} <\n\n👤 Author: ${author}\n🖼️ Caption: ${title}`,
        attachments: [thumbnailPath],
        mentions: [MessageMention(senderId, senderName.length, 2, false)],
        ttl: 6000000
      },
      message.threadId,
      message.type
    );

    if (thumbnailUrl) {
      await clearImagePath(thumbnailPath);
    }
    return;
  }

  if ((mediaType === "youtube" || mediaType === "instagram") && duration) {
    if (duration > 90 * 60 * 1000) {
      const object = {
        caption: "Vì tài nguyên có hạn, không thể lấy video có độ dài hơn 90 phút!\nVui lòng chọn video khác.",
      };
      return await sendMessageWarningRequest(api, message, object, 30000);
    }
    await api.addReaction("UNDO", message);
  }

  const cachedMedia = await getCachedMedia(mediaType, uniqueId, quality, title);
  let videoUrl;

  if (cachedMedia) {
    videoUrl = cachedMedia.fileUrl;
  } else {
    const object = {
      caption: `Chờ lấy ${typeText(typeFile)} một chút, xong sẽ gọi cho hay.\n\n⏳ ${title}\n📊 Chất lượng: ${quality}`,
    };
    await sendMessageProcessingRequest(api, message, object, 8000);

    videoUrl = await categoryDownload(api, message, mediaType, uniqueId, selectedMedia, quality);
    if (!videoUrl) {
      const object = {
        caption: `Không tải được dữ liệu...`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      await api.addReaction("UNDO", message);
      await api.addReaction("TIEUTAN", message);
      return;
    }
  }

  if (typeFile === "audio") {
    const mediaTypeString = capitalizeEachWord(mediaType);
    const object = {
      trackId: uniqueId,
      title: title,
      artists: author,
      source: mediaTypeString,
      caption:
        `> From ${mediaTypeString} <\nNhạc Bạn Chọn Đây!!!\n\n🎵 Music: ${title}\n` +
        `🎥 Nền Tảng: ${capitalizeEachWord(mediaType)}`,
      imageUrl: selectedMedia.thumbnail,
      voiceUrl: videoUrl,
    };

    await sendVoiceMusic(api, message, object);
  } else if (typeFile === "video") {
    const typeString = typeof videoUrl === "string";
    await sendMessageComplete(api, message, ``, false, 60000);
    if (typeString || videoUrl.length === 1) {
      const dataVideo = typeString ? null : videoUrl[0];
      await api.sendVideo({
        videoUrl: typeString ? videoUrl : dataVideo.fileUrl,
        threadId: message.threadId,
        threadType: message.type,
        thumbnail: selectedMedia.thumbnail,
        metaData: dataVideo,
        message: {
          text:
            `[ ${senderName} ]\n` +
            `🎥 Nền Tảng: ${capitalizeEachWord(mediaType)}\n` +
            `🎬 Tiêu Đề: ${title}\n` +
            `${author && author !== "Unknown Author" ? `👤 Người Đăng: ${author}\n` : ""}` +
            `📊 Chất lượng: ${quality}`,
          mentions: [MessageMention(senderId, senderName.length, 2, false)],
        },
        ttl: TIME_TO_LIVE,
      });
    } else {
      for (let index = 0; index < videoUrl.length; index++) {
        const dataVideo = videoUrl[index];
        await api.sendVideo({
          videoUrl: dataVideo.fileUrl,
          threadId: message.threadId,
          threadType: message.type,
          thumbnail: selectedMedia.thumbnail,
          metaData: dataVideo,
          message: {
            text:
              `[ ${senderName} ]\n` +
              `🎥 Nền Tảng: ${capitalizeEachWord(mediaType)}\n` +
              `🎬 Tiêu Đề: ${title}\n` +
              `${author && author !== "Unknown Author" ? `👤 Người Đăng: ${author}\n` : ""}` +
              `📊 Chất lượng: ${quality}` +
              `📺 [Part ${index + 1}]\n`,
            mentions: [MessageMention(senderId, senderName.length, 2, false)],
          },
          ttl: TIME_TO_LIVE,
        });
      }
    }
    await api.addReaction("UNDO", message);
    await api.addReaction("LIKE", message);
  }
}

export async function handleDownloadCommand(api, message, aliasCommand, typeCall = "default") {
  const content = removeMention(message);
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const prefix = getGlobalPrefix(api.getBotId());

  try {
    let query = content.replace(`${prefix}${aliasCommand}`, "").trim();

    if (!query) {
      const quote = message.data?.quote;
      if (quote) {
        try {
          const parseMessage = JSON.parse(quote.attach);
          query = parseMessage.href || parseMessage.title || quote.msg || null;
        } catch (error) {
          query = quote.msg || null;
        }
      }
    }

    if (!query) {
      const object = {
        caption: `Vui lòng nhập link cần tải\nVí dụ:\n${prefix}${aliasCommand} <link>`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return { typeCommand: typeCall };
    }

    try {
      const urlObj = new URL(query.startsWith("http") ? query : "https://" + query);
      if (urlObj.pathname === "/" || urlObj.pathname === "") {
        if (typeCall === TYPE_AUTO_DETECTED) return { typeCommand: typeCall, noAction: true };
        const object = {
          caption: `Link bạn cung cấp là đường dẫn của một trang chủ!!!\nVui lòng nhập đường dẫn cụ thể của nội dung cần tải.`,
        };
        await sendMessageWarningRequest(api, message, object, 30000);
        return { typeCommand: typeCall };
      }
    } catch (e) {}

    // Link Jingxuan dạng /m/video thường bị provider từ chối; đổi về URL video
    // canonical trước khi gọi API/yt-dlp.
    query = normalizeDouyinUrl(query);
    const mediaType = getMediaType(query);
    let dataDownload;
    if (mediaType !== "Unknown") {
      switch (mediaType) {
        case "tiktok":
          dataDownload = await getDataDownloadVideoTiktok(query);
          break;
        case "youtube":
          dataDownload = await getDataYoutubeVideo(query);
          break;
        case "bilibili":
          dataDownload = await getDataDownloadVideoFromYtbDL(query, mediaType);
          break;
        case "facebook":
          dataDownload = await getDataDownloadVideoFromYtbDL(query, mediaType);
          if (dataDownload) {
            dataDownload.getBy = "ytb-dl";
          }
          if (!dataDownload || dataDownload.error) {
            dataDownload = await getDataDownloadAIO(query);
            if (dataDownload) {
              dataDownload.getBy = "aio-download";
            }
          }
          if ((!dataDownload || dataDownload.error || !Array.isArray(dataDownload.medias)) && dataDownload?.getBy !== "ytb-dl") {
            dataDownload = await getDataDownloadVNV(query);
          }
          break;
        default:
          dataDownload = await getDataDownloadAIO(query);
          break;
      }
    }

    // DownAll hỗ trợ thêm các dạng link mà provider cũ không nhận ra, gồm cả
    // link story/reel Facebook nếu phía API bóc tách được nội dung công khai.
    if (
      mediaType !== "tiktok" &&
      mediaType !== "youtube" &&
      (!dataDownload || dataDownload.error || !Array.isArray(dataDownload.medias))
    ) {
      const vnvData = await getDataDownloadVNV(query);
      if (vnvData) dataDownload = vnvData;
    }

    // API miễn phí là tuyến chính cho metadata; nếu hết quota/chậm/lỗi hoặc
    // trả payload không chuẩn thì chuyển ngay sang yt-dlp local, không bỏ cuộc.
    if (
      mediaType !== "Unknown" &&
      (!dataDownload || dataDownload.error || !Array.isArray(dataDownload.medias)) &&
      mediaType !== "tiktok" &&
      mediaType !== "facebook"
    ) {
      const localInfo = await getDataDownloadVideoFromYtbDL(query, mediaType);
      if (localInfo && !localInfo.error) dataDownload = normalizeYtDlpMedia(localInfo);
    }

    if ((mediaType === "douyin" && (!dataDownload || dataDownload.error || !Array.isArray(dataDownload.medias))) ||
        (mediaType === "tiktok" && (!dataDownload || dataDownload.error))) {
      const snapData = await getDataDownloadSnapTik(query);
      if (snapData) dataDownload = snapData;
    }

    if (typeCall === TYPE_AUTO_DETECTED && (!dataDownload || dataDownload.error))
      return { typeCommand: typeCall, noAction: true };

    if (!dataDownload) {
      const object = { caption: `Không hỗ trợ tải dữ liệu từ nền tảng của link mà bạn đã cung cấp.` };
      await sendMessageWarningRequest(api, message, object, 30000);
      return { typeCommand: typeCall };
    }
    if (dataDownload.error) {
      const object = { caption: dataDownload.reasonFalse || `Không tìm thấy dữ liệu có thể tải trong link này.` };
      await sendMessageWarningRequest(api, message, object, 30000);
      return { typeCommand: typeCall };
    }

    const { uniqueId, dataLink } = getMediaDownloadLinks(mediaType, dataDownload, typeCall);

    if (dataLink.length === 0) {
      const object = {
        caption: `Không tìm thấy dữ liệu tải về phù hợp cho link này!\nVui lòng thử lại với link khác.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return { typeCommand: typeCall };
    }

    if (dataLink.length === 1) {
      await processAndSendMedia(api, message, {
        selectedMedia: dataLink[0],
        mediaType,
        uniqueId,
        duration: dataDownload.duration,
        title: dataDownload.title,
        author: dataDownload.author,
        senderId,
        senderName,
      });
      return { typeCommand: typeCall };
    }

    const numCountVideo = dataLink.filter((item) => item.type === "video").length;
    if (numCountVideo === 0) {
      let imageUrls = [];
      let imagePaths = [];
      let voiceUrlsUpload = [];

      for (const item of dataLink.filter((i) => i.type === "audio")) {
        try {
          const voiceUrl = await downloadAndConvertAudio(item.url, api, message);
          voiceUrlsUpload.push(voiceUrl);
        } catch {}
      }

      const imageItems = dataLink.filter((i) => i.type === "image");
      const imageProcessingPromises = imageItems.map(async (item) => {
        try {
          const tempImagePath = path.join(tempDir, `temp_image_${randomIDTemp()}.${item.extension || "jpg"}`);
          await downloadFile(item.url, tempImagePath);
          imagePaths.push(tempImagePath);
          const dataImage = await getLocalImageInfo(tempImagePath);
          if (dataImage) {
            return {
              url: item.url,
              width: dataImage.width,
              height: dataImage.height,
            };
          }
          return null;
        } catch (error) {
          console.error("Lỗi khi xử lý ảnh:", error);
          return null;
        }
      });

      const processedImages = await Promise.all(imageProcessingPromises);
      imageUrls = processedImages.filter((img) => img !== null);

      if (imageUrls.length !== 0 || voiceUrlsUpload.length !== 0) {
        const object = {
          caption:
            `Title: ${dataDownload.title || "Không xác định"}\n` +
            `Author: ${dataDownload.author || ""}\n` +
            `Platform: ${mediaType}\n`,
        };
        await sendMessageCompleteRequest(api, message, object, TIME_TO_LIVE);
        let groupLayout = {
          groupLayoutId: Date.now(),
          totalItemInGroup: imageUrls.length,
          isGroupLayout: imageUrls.length > 1 ? 1 : 0,
        };
        for (const [index, image] of imageUrls.entries()) {
          await api.sendImage(image, message, "", TIME_TO_LIVE, {
            ...groupLayout,
            idInGroup: index + 1,
          });
        }
        for (const voiceUrl of voiceUrlsUpload) await api.sendVoice(message, voiceUrl, TIME_TO_LIVE);
      } else {
        const object = {
          caption: `Không có dữ liệu nào để tải từ link bạn đã cung cấp!`,
        };
        await sendMessageCompleteRequest(api, message, object, TIME_TO_LIVE);
      }
      for (const path of imagePaths) {
        await clearImagePath(path);
      }
      return { typeCommand: typeCall };
    }

    let listText = `Đây là danh sách các phiên bản có sẵn:\n`;
    listText += `Hãy trả lời tin nhắn này với số thứ tự phiên bản bạn muốn tải!\n\n`;
    listText += dataLink
      .map((item, index) => `${index + 1}. ${item.type} - ${item.quality || "Unknown"} (${item.extension})`)
      .join("\n");

    const object = {
      caption: listText,
    };

    const listMessage = await sendMessageCompleteRequest(api, message, object, TIME_WAIT_SELECTION);
    const quotedMsgId = listMessage?.message?.msgId || listMessage?.attachment[0]?.msgId;
    downloadSelectionsMap.set(quotedMsgId.toString(), {
      userRequest: senderId,
      collection: dataLink,
      uniqueId: uniqueId,
      mediaType: mediaType,
      title: dataDownload.title,
      duration: dataDownload.duration || 0,
      author: dataDownload.author || "Unknown Author",
      timestamp: Date.now(),
    });
    setSelectionsMapData(senderId, {
      quotedMsgId: quotedMsgId.toString(),
      collection: dataLink,
      uniqueId: uniqueId,
      mediaType: mediaType,
      title: dataDownload.title,
      duration: dataDownload.duration || 0,
      author: dataDownload.author || "Unknown Author",
      timestamp: Date.now(),
      platform: "downlink",
    });

    return { typeCommand: typeCall };
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh download:", error);
    const object = {
      caption: `Đã xảy ra lỗi khi xử lý lệnh load data download.`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
  }
}

export async function categoryDownload(api, message, platform, uniqueId, selectedMedia, quality) {
  let tempFilePath,
    videoUrl,
    isUpHost = true;
  try {
    switch (platform) {
      case "youtube":
      case "bilibili":
        const { format } = getVideoFormatByQuality(quality);
        tempFilePath = await downloadYoutubeVideo(selectedMedia.url, uniqueId, format, platform);
        break;
      case "threads":
        tempFilePath = path.join(tempDir, `${platform}_${randomIDTemp()}.${selectedMedia.extension}`);
        selectedMedia.url = selectedMedia.url.replace(/:\/\/[^/]+\//, "://scontent.cdninstagram.com/");
        await downloadFile(selectedMedia.url, tempFilePath);
        break;
      case "facebook":
        tempFilePath = path.join(tempDir, `${platform}_${randomIDTemp()}.${selectedMedia.extension}`);
        await downloadFile(selectedMedia.url, tempFilePath);
        break;
      default:
        tempFilePath = path.join(tempDir, `${platform}_${randomIDTemp()}.${selectedMedia.extension}`);
        if (selectedMedia.extension === "m3u8") {
          tempFilePath = path.join(tempDir, `${platform}_${randomIDTemp()}.mp4`);
          videoUrl = await downloadsCache.getDataDownload(api, message, selectedMedia.url, {
            type: "m3u8",
            path: tempFilePath,
          });
          isUpHost = false;
        } else if (selectedMedia.extension === "mp4") {
          const { duration, width, height, totalSize } = await getVideoMetadata(selectedMedia.url);
          videoUrl = [{ fileUrl: selectedMedia.url, duration, width, height, totalSize }];
          isUpHost = false;
        } else {
          await downloadFile(selectedMedia.url, tempFilePath);
        }
        break;
    }

    if (isUpHost) {
      const uploadResult = await api.uploadAttachment([tempFilePath], message.threadId, message.type);
      if (selectedMedia.extension === "mp4") {
        const { duration, width, height, totalSize } = await getVideoMetadata(uploadResult[0].fileUrl);
        videoUrl = [{ fileUrl: uploadResult[0].fileUrl, duration, width, height, totalSize }];
      } else {
        videoUrl = uploadResult[0].fileUrl;
      }
    }

    setCacheData(platform, uniqueId, { fileUrl: videoUrl, title: selectedMedia.title }, quality);

    return videoUrl;
  } catch (error) {
    console.error("Lỗi khi tải video:", error);
    return null;
  } finally {
    await deleteFile(tempFilePath);
  }
}

export async function handleDownloadReply(api, message) {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const idBot = api.getBotId();

  try {
    if (!message.data.quote || !message.data.quote.globalMsgId) return false;

    const quotedMsgId = message.data.quote.globalMsgId.toString();
    if (!downloadSelectionsMap.has(quotedMsgId)) return false;

    const downloadData = downloadSelectionsMap.get(quotedMsgId);
    if (downloadData.userRequest !== senderId) return false;

    const content = removeMention(message);
    const [selection] = content.split(" ");
    const selectedIndex = parseInt(selection) - 1;

    if (isNaN(selectedIndex)) {
      const object = {
        caption: `Lựa chọn không hợp lệ. Vui lòng chọn một số từ danh sách.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return true;
    }

    let { collection, uniqueId, mediaType, title, duration = 0, author } = downloadSelectionsMap.get(quotedMsgId);
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
    downloadSelectionsMap.delete(quotedMsgId);

    await processAndSendMedia(api, message, {
      selectedMedia: collection[selectedIndex],
      mediaType,
      uniqueId,
      duration,
      title,
      author,
      senderId,
      senderName,
    });

    return true;
  } catch (error) {
    console.error("Lỗi xử lý reply download:", error);
    const object = {
      caption: `Đã xảy ra lỗi khi xử lý tin nhắn của bạn. Vui lòng thử lại sau.`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return true;
  }
}

function getMediaDownloadLinks(mediaType, dataDownload, typeCall) {
  let uniqueId;
  const dataLink = [];

  switch (mediaType) {
    case "tiktok":
      uniqueId = dataDownload.id;
      if (dataDownload.getBy === "snaptik" && Array.isArray(dataDownload.medias)) {
        dataDownload.medias.forEach((item) => dataLink.push({ ...item, title: dataDownload.title, thumbnail: item.thumbnail || dataDownload.thumbnail }));
        break;
      }
      let dataDownloadTiktokSelectList;
      if (dataDownload.images) {
        dataDownloadTiktokSelectList = [
          {
            quality: "all",
            type: "image",
            extension: "all",
          },
        ];
      } else {
        if (typeCall === TYPE_AUTO_DETECTED) {
          dataDownloadTiktokSelectList = [
            {
              quality: "540p",
              type: "video",
              extension: "mp4",
            },
          ];
        } else {
          dataDownloadTiktokSelectList = [
            {
              quality: "540p",
              type: "video",
              extension: "mp4",
            },
            {
              quality: "audio",
              type: "audio",
              extension: "mp3",
            },
          ];
        }
      }
      dataDownloadTiktokSelectList.forEach((item) => {
        dataLink.push({
          quality: item.quality,
          type: item.type,
          dataVideo: dataDownload,
          extension: item.extension,
        });
      });
      break;
    case "youtube":
      uniqueId = dataDownload.id;
      let dataDownloadSelectList;
      if (typeCall === TYPE_AUTO_DETECTED) {
        dataDownloadSelectList = [
          {
            url: dataDownload.url,
            quality: "1080p",
            type: "video",
            extension: "mp4",
          },
        ];
      } else {
        dataDownloadSelectList = [
          {
            url: dataDownload.url,
            quality: "720p",
            type: "video",
            extension: "mp4",
          },
          {
            url: dataDownload.url,
            quality: "1080p",
            type: "video",
            extension: "mp4",
          },
          {
            url: dataDownload.url,
            quality: "max",
            type: "video",
            extension: "mp4",
          },
          {
            url: dataDownload.url,
            quality: "audio",
            type: "audio",
            extension: "mp3",
          },
        ];
      }
      dataDownloadSelectList.forEach((item) => {
        dataLink.push({
          url: item.url,
          quality: item.quality,
          type: item.type,
          title: dataDownload.title,
          thumbnail: dataDownload.thumbnail,
          extension: item.extension,
        });
      });
      break;
    case "facebook":
      if (dataDownload.getBy === "ytb-dl") {
        uniqueId = dataDownload.id;
        let formatsVideo = dataDownload.formats.find((item) => item["format_id"] === "hd");
        if (!formatsVideo) formatsVideo = dataDownload.formats.find((item) => item["format_id"] === "sd");
        const dataDownloadFacebookSelectList = [
          {
            url: formatsVideo.url,
            quality: formatsVideo.format_id.toUpperCase(),
            type: "video",
            extension: "mp4",
          },
        ];
        dataDownloadFacebookSelectList.forEach((item) => {
          dataLink.push({
            url: item.url,
            quality: item.quality,
            type: item.type,
            title: dataDownload.title,
            thumbnail: dataDownload.thumbnail,
            extension: item.extension,
          });
        });
      } else {
        uniqueId = dataDownload.id || `${dataDownload.url || dataDownload.title} -> ${dataDownload.duration}`;
        dataDownload.medias.forEach((item) => {
          if (item.quality.toLowerCase() === "hd") {
            dataLink.push({
              url: item.url,
              quality: item.quality,
              type: item.type,
              title: dataDownload.title,
              thumbnail: item.thumbnail || dataDownload.thumbnail,
              extension: item.extension,
            });
          }
        });
      }
      if (dataLink.length === 0) {
        dataDownload.medias.forEach((item) => {
          dataLink.push({
            url: item.url,
            quality: item.quality,
            type: item.type,
            title: dataDownload.title,
            thumbnail: item.thumbnail || dataDownload.thumbnail,
            extension: item.extension,
          });
        });
      }
      break;
    case "bilibili":
      uniqueId = dataDownload.id;
      const dataDownloadBiliBiliSelectList = [
        {
          url: dataDownload.url,
          quality: "max",
          type: "video",
          extension: "mp4",
        },
      ];
      dataDownloadBiliBiliSelectList.forEach((item) => {
        dataLink.push({
          url: item.url,
          quality: item.quality,
          type: item.type,
          title: dataDownload.title,
          thumbnail: dataDownload.thumbnail,
          extension: item.extension,
        });
      });
      break;
    case "douyin":
      uniqueId = dataDownload.id;
      dataDownload.medias.forEach((item) => {
        dataLink.push({
          url: item.url,
          quality: item.quality,
          type: item.type,
          title: dataDownload.title,
          thumbnail: item.thumbnail || dataDownload.thumbnail,
          extension: item.extension,
        });
      });
      break;
    case "threads":
      uniqueId = dataDownload.id;
      dataDownload.medias.forEach((item) => {
        if (item.type.toLowerCase() !== "image") {
          dataLink.push({
            url: item.url,
            quality: item.quality,
            type: item.type,
            title: dataDownload.title,
            thumbnail: item.thumbnail || dataDownload.thumbnail,
            extension: item.extension,
          });
        }
      });
      if (dataLink.length === 0) {
        dataDownload.medias.forEach((item) => {
          dataLink.push({
            url: item.url,
            quality: item.quality,
            type: item.type,
            title: dataDownload.title,
            thumbnail: item.thumbnail || dataDownload.thumbnail,
            extension: item.extension,
          });
        });
      }
      break;
    case "capcut":
      uniqueId =
        dataDownload.id ||
        dataDownload.shortcode ||
        `${dataDownload.url || dataDownload.title} -> ${dataDownload.duration}`;
      if (typeCall === TYPE_AUTO_DETECTED) {
        dataDownload.medias.forEach((item) => {
          if (item.quality.toLowerCase() === "hd no watermark") {
            dataLink.push({
              url: item.url,
              quality: item.quality,
              type: item.type,
              title: dataDownload.title,
              thumbnail: item.thumbnail || dataDownload.thumbnail,
              extension: item.extension,
            });
          }
        });
      } else {
        dataDownload.medias.forEach((item) => {
          dataLink.push({
            url: item.url,
            quality: item.quality,
            type: item.type,
            title: dataDownload.title,
            thumbnail: item.thumbnail || dataDownload.thumbnail,
            extension: item.extension,
          });
        });
      }
      break;
    default:
      uniqueId =
        dataDownload.id ||
        dataDownload.shortcode ||
        `${dataDownload.url || dataDownload.title} -> ${dataDownload.duration}`;
      dataDownload.medias.forEach((item) => {
        dataLink.push({
          url: item.url,
          quality: item.quality,
          type: item.type,
          title: dataDownload.title,
          thumbnail: item.thumbnail || dataDownload.thumbnail,
          extension: item.extension,
        });
      });
      break;
  }

  return { uniqueId, dataLink };
}

export async function getDurationVideo(videoPath) {
  try {
    const metadata = await getVideoMetadata(videoPath);
    return metadata.duration || 0;
  } catch (error) {
    console.error("Lỗi khi lấy thời lượng video:", error);
    return 0;
  }
}
