import axios from "axios";
import { MessageMention } from "zlbotdqt";
import fs from "fs";
import path from "path";
import { removeMention } from "../../../../utils/format-util.js";
import { handleCheckLinkFromVideoLocal } from "../../../../utils/local-upload-cache.js";
import { getGlobalPrefix } from "../../../service.js";
import {
  sendMessageCompleteRequest,
  sendMessageStateQuote,
  sendMessageWarning,
  sendMessageWarningRequest,
} from "../../chat-style/chat-style.js";
import {
  checkLinkIsValid,
  deleteFile,
  downloadAndSaveVideo,
  downloadFile,
  downloadVideoWithFFmpeg,
  readFileSync,
  writeFileSync,
} from "../../../../utils/util.js";
import { VIDEOS_RESOURCE_PATH } from "../../../../utils/io-json.js";
import { getVideoMetadata } from "../../../../api-zalo/utils.js";
import { getCachedMedia, setCacheData } from "../../../../utils/link-platform-cache.js";
import { isAdmin } from "../../../../index.js";

const PLATFORM = "VideoTemplate";
const CONFIG = {
  baseDataPath: path.resolve(
    process.cwd(),
    "src",
    "service-dqt",
    "chat-zalo",
    "chat-special",
    "data-send"
  ),
  maxRetries: 100,
  checkTimeout: 5000,
  retryDelay: 1000,
  timeToLiveSendVideo: 86400000,
};

// Cấu hình video
const VIDEO_TYPES = {
  girl: {
    variants: {
      default: { source: "vdgirl.txt", ttl: 300000 },
      sexy: { source: "vdsexy.txt", ttl: 60000, type: "Sexy" },
    },
  },
  sexy: {
    variants: {
      default: { source: "vdsexy.txt", ttl: 60000, type: "Sexy" },
    },
  },
  anime: {
    variants: {
      default: { source: "vdanime.txt", ttl: 300000, type: "Anime" },
    },
  },
  boy: {
    variants: {
      default: { source: "vdboy.txt", ttl: 300000 },
    },
  },  
  tet: {
      variants: {
        default: { source: "vdtet.txt", ttl: 300000 },
      },
  }, 
  cosplay: {
    variants: {
      default: { source: "vdcos.txt", ttl: 300000, type: "Cosplay" },
    },
  },
  chill: {
    variants: {
      default: { source: "vdchill.txt", ttl: 300000 },
    },
  },
  vuto: {
    variants: {
      default: { source: "vdvuto.txt", ttl: 300000 },
    },
  },
  sad: {
    variants: {
      default: { source: "vdsad.txt", ttl: 300000 },
    },
  },  
  sex: {
    variants: {
      default: { source: "vdsex.txt", ttl: 60000, type: "Sếch" },
    },
  },
};

const KEYWORD_MAPPING = {
  girl: {
    sexy: ["sexy", "hot", "gợi cảm"],
  },
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getDataVideoFromUrl = async (api, message, url) => {
  let pathDownload;
  let videoData;
  const botId = api.getBotId();
  const senderId = message?.data?.uidFrom || botId;
  const isAdminLevelHighest = isAdmin(botId, senderId);

  try {
    videoData = await getCachedMedia(PLATFORM, url, "mp4", url);
    if (videoData) {
      return videoData;
    } else {
      if (isAdminLevelHighest) {
        pathDownload = await downloadAndSaveVideo(url);
        const uploadResult = await api.uploadAttachment([pathDownload], message.threadId, message.type, { isUseProphylactic: true });
        const linkUpload = uploadResult[0].fileUrl;
        const dataVideo = await getVideoMetadata(linkUpload);
        if (!dataVideo || dataVideo.error) {
          throw new Error("Link die không thể get data Video Link: " + url);
        }
        setCacheData(PLATFORM, url, { fileUrl: linkUpload, title: url, ...dataVideo }, "mp4");
        videoData = await getCachedMedia(PLATFORM, url, "mp4", linkUpload);
        return videoData;
      } else {
        const metaData = await Promise.race([
          getVideoMetadata(url),
          delay(CONFIG.checkTimeout).then(() => {
            throw new Error("Timeout khi kiểm tra URL -> Chuyển qua link khác");
          }),
        ]);
        if (!metaData || dataVideo.error) {
          throw new Error("Link die không thể get data Video" + url);
        }
        return {
          fileUrl: url,
          ...metaData,
        };
      }
    }
  } catch (error) {
    return null;
  } finally {
    await deleteFile(pathDownload);
  }
};

async function handleApiSourceVideo(api, message, config, senderName, senderId) {
  const filePath = path.join(CONFIG.baseDataPath, config.variantConfig.source);
  let videoLinks = readFileSync(filePath, "utf-8");
  videoLinks = videoLinks.split("\n").filter(Boolean);
  let isDieLink = false;

  while (videoLinks.length > 0) {
    const randomIndex = Math.floor(Math.random() * videoLinks.length);
    const videoUrl = videoLinks[randomIndex].trim();

    const metaData = await getDataVideoFromUrl(api, message, videoUrl);

    try {
      if (metaData) {
        await api.sendVideo({
          videoUrl: metaData.fileUrl,
          threadId: message.threadId,
          threadType: message.type,
          message: {
            text: `[ ${senderName} ] ${config.variant != "default" ? `( ${config.variant} )` : ""}`,
            mentions: [MessageMention(senderId, senderName.length, 2, false)],
          },
          ttl: config.ttl,
          metaData,
        });
        return true;
      } else {
        videoLinks.splice(randomIndex, 1);
        isDieLink = true;
      }
    } catch (error) {
      console.error("Lỗi khi gửi video:", error);
    } finally {
      if (isDieLink) {
        writeFileSync(filePath, videoLinks.join("\n"));
      }
    }
  }

  return false;
}

// Xử lý video từ source API
async function handleApiExternalVideo(api, message, config, senderName, senderId) {
  let retryCount = 0;

  while (retryCount < CONFIG.maxRetries) {
    try {
      const response = await axios.get(config.variantConfig.api);
      if (response.status !== 200) throw new Error("Không thể lấy dữ liệu từ source");

      let videoUrl = response.data.data || response.data.url;
      videoUrl = videoUrl.trim();
      const metaData = await getDataVideoFromUrl(api, message, videoUrl);

      if (metaData) {
        await api.sendVideo({
          videoUrl: metaData.fileUrl,
          threadId: message.threadId,
          threadType: message.type,
          message: {
            text: `[ ${senderName} ] ${config.variant != "default" ? `( ${config.variant} )` : ""}`,
            mentions: [MessageMention(senderId, senderName.length, 2, false)],
          },
          ttl: config.ttl,
          metaData,
        });
        return true;
      }
    } catch (error) {
      console.error(`Lỗi lần ${retryCount + 1}:`, error);
    }

    retryCount++;
    await delay(CONFIG.retryDelay);
  }

  return false;
}

// Hàm chính xử lý video command
export const handleVideoCommand = async (api, message, type) => {
  const idBot = api.getBotId();
  const { dName: senderName, uidFrom: senderId } = message.data;
  const content = removeMention(message);
  const isAdminLevelHighest = isAdmin(idBot, senderId);

  // Lấy config cho loại video
  const config = (() => {
    const typeConfig = VIDEO_TYPES[type];
    if (!typeConfig) return null;

    let variant = "default";
    const typeKeywords = KEYWORD_MAPPING[type];

    if (typeKeywords && content) {
      const normalizedContent = content.toLowerCase();
      for (const [variantName, keywords] of Object.entries(typeKeywords)) {
        if (keywords.some((keyword) => normalizedContent.includes(keyword))) {
          variant = variantName;
          break;
        }
      }
    }

    const variantConfig = typeConfig.variants[variant];
    if (!variantConfig) {
      const defaultConfig = typeConfig.variants.default;
      if (!defaultConfig) return null;

      return {
        variantConfig: defaultConfig,
        ttl: defaultConfig.ttl,
        variant: defaultConfig.type || variant,
      };
    }

    return {
      variantConfig,
      ttl: variantConfig.ttl,
      variant: variantConfig.type || variant,
    };
  })();

  if (!config) return;

  let success = false;

  if (!isAdminLevelHighest && config.variant === VIDEO_TYPES["sex"].variants.default.type) {
    await sendMessageWarning(api, message, `Chỉ có quản trị cấp cao mới được yêu cầu coi cái này...!`);
    return;
  }

  if (config.variantConfig.api) {
    success = await handleApiExternalVideo(api, message, config, senderName, senderId);
  } else if (config.variantConfig.source) {
    success = await handleApiSourceVideo(api, message, config, senderName, senderId);
  }

  if (!success) {
    await api.sendMessage(
      {
        msg: "Đã xảy ra lỗi khi xử lý lệnh video. Vui lòng thử lại sau.",
        quote: message,
      },
      message.threadId,
      message.type
    );
  }
};

export async function sendRandomGirlVideo(api, message, caption, type, ttl = 0) {
  let nameFile = "vdgirl.txt";
  if (type == "anime") nameFile = "vdanime.txt";
  if (type == "cosplay") nameFile = "vdcos.txt";
  if (type == "sexy") nameFile = "vdsexy.txt";
  if (type == "tet") nameFile = "vdtet.txt";
  if (type == "boy") nameFile = "vdboy.txt";
  if (type == "sad") nameFile = "vdsad.txt";
  if (type == "chill") nameFile = "vdchill.txt";
  const filePath = path.join(CONFIG.baseDataPath, nameFile);
  let videoLinks = readFileSync(filePath, "utf-8");
  videoLinks = videoLinks.split("\n").filter(Boolean);

  while (videoLinks.length > 0) {
    const randomIndex = Math.floor(Math.random() * videoLinks.length);
    const videoUrl = videoLinks[randomIndex].trim();

    const metaData = await getDataVideoFromUrl(api, message, videoUrl);

    if (metaData) {
      try {
        await api.sendVideo({
          videoUrl: metaData.fileUrl,
          threadId: message.threadId,
          threadType: message.type,
          message: {
            text: caption,
          },
          ttl: ttl,
          metaData,
        });
        return true;
      } catch (error) {
        console.error("Lỗi khi gửi video:", error);
        return false;
      }
    } else {
      videoLinks.splice(randomIndex, 1);
    }
  }

  return false;
}

/**
 * Xử lý lệnh send video
 */
export async function handleSendVideoCommand(api, message, aliasCommand) {
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const dataVideoPath = VIDEOS_RESOURCE_PATH(botId);
  const content = removeMention(message);
  let keyword = content.replace(`${prefix}${aliasCommand}`, "");
  let text = keyword;

  text = text.trim();
  const senderName = message.data.dName;
  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  const type = message.type;

  try {
    if (keyword.trim() === "list") {
      const files = fs.readdirSync(dataVideoPath);
      if (files.length > 0) {
        const fileList = files.map((file, index) => `${index + 1}. ${file}`).join("\n");
        await sendMessageCompleteRequest(
          api,
          message,
          {
            caption:
              `Đây là những video đã lưu trữ:\n${fileList}` +
              `\n\nDùng lệnh: ${prefix}${aliasCommand} <số thứ tự video> để gửi video`,
          },
          1800000
        );
      } else {
        await sendMessageCompleteRequest(
          api,
          message,
          {
            caption: `Chưa có video nào được lưu trên bộ nhớ của bot!`,
          },
          1800000
        );
      }
      return;
    }

    const index = parseInt(keyword.trim());
    if (!isNaN(index)) {
      const files = fs.readdirSync(dataVideoPath);
      if (index > 0 && index <= files.length) {
        const selectedFile = files[index - 1];
        const fileLocal = await handleCheckLinkFromVideoLocal(selectedFile, api);
        if (fileLocal) {
          await sendMessageStateQuote(
            api,
            message,
            "Đây là video bạn yêu cầu!",
            true,
            CONFIG.timeToLiveSendVideo,
            false
          );
          await api.sendVideo({
            videoUrl: fileLocal.fileUrl,
            threadId: message.threadId,
            threadType: message.type,
            message: {
              text: ``,
              // mentions: [MessageMention(senderId, senderName.length, 2, false)],
            },
            ttl: CONFIG.timeToLiveSendVideo,
          });
        }
        return;
      } else {
        await sendMessageWarningRequest(
          api,
          message,
          {
            caption: "Số thứ tự không nằm trong phạm vi danh sách video đã lưu trữ.",
          },
          300000
        );
        return;
      }
    }

    const quote = message.data?.quote;
    if (quote) {
      if (!text) {
        try {
          const parseMessage = JSON.parse(quote.attach);
          text = parseMessage.href || parseMessage.title || quote.msg || null;
        } catch (error) {
          text = quote.msg || null;
        }
      }
    }

    if (!text) {
      const object = {
        caption:
          `Vui lòng reply vào video hoặc nhập link,\n` +
          `Hoặc dùng lệnh: "${prefix}${aliasCommand}  list" để xem danh sách video đã lưu trữ trong thư mục video!`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    let linkUpload;
    let type = 0;
    const fileLocal = await handleCheckLinkFromVideoLocal(text, api);
    if (fileLocal) {
      linkUpload = fileLocal.fileUrl;
      type = 1;
    } else {
      linkUpload = text;
      type = 0;
    }

    const dataVideo = await getVideoMetadata(linkUpload);
    if (dataVideo && !dataVideo.error) {
      const thumbnail = await api.uploadThumbnailVideo(linkUpload);
      await sendMessageStateQuote(api, message, "Đây là video bạn yêu cầu!", true, CONFIG.timeToLiveSendVideo, false);
      await api.sendVideo({
        videoUrl: linkUpload,
        threadId: message.threadId,
        threadType: message.type,
        message: {
          text: ``,
          // mentions: [MessageMention(senderId, senderName.length, 2, false)],
        },
        ttl: CONFIG.timeToLiveSendVideo,
        metaData: dataVideo,
        thumbnail: thumbnail?.url,
      });
    } else {
      const object = {
        caption:
          type === 0
            ? "Link video yêu cầu không thể truy cập"
            : "Lỗi truy cập link video cục bộ từ tập tin lưu trữ, vui lòng thử lại.",
      };
      await sendMessageWarningRequest(api, message, object, 30000);
    }
  } catch (error) {
    console.error("Lỗi khi send video:", error);
    const object = {
      caption: "Đã xảy ra lỗi khi send video từ nguồn cung cấp.",
    };
    await sendMessageWarningRequest(api, message, object, 30000);
  } finally {
  }
}
