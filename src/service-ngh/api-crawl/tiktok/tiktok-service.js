import axios from "axios";
import schedule from "node-schedule";
import fs from "fs";
import path from "path";

import { getGlobalPrefix } from "../../service.js";
import { MessageMention } from "../../../api-zalo/index.js";
import {
  sendMessageCompleteRequest,
  sendMessageProcessingRequest,
  sendMessageWarningRequest,
} from "../../chat-zalo/chat-style/chat-style.js";
import { randomIDTemp, removeMention } from "../../../utils/format-util.js";
import { parseQuickSelection } from "../index.js";
import { getCachedMedia, setCacheData } from "../../../utils/link-platform-cache.js";
import { deleteFile, downloadFile, getLocalImageInfo, uploadTempFile } from "../../../utils/util.js";
import { createSearchResultImage } from "../../../utils/canvas/search-canvas.js";
import {
  getDataDownloadOriginal,
  getDataDownloadVideoTiktok,
  getTiktokPostByUsername,
  getTiktokRelated,
  searchTiktok,
} from "./tiktok-api.js";
import { readSettingConfig, tempDir } from "../../../utils/io-json.js";
import { sendVoiceMusic } from "../../chat-zalo/chat-special/send-voice/send-voice.js";
import { downloadAndConvertAudio } from "../../chat-zalo/chat-special/send-voice/process-audio.js";
import { clearImagePath } from "../../../utils/canvas/index.js";
import HttpsProxyAgent from "https-proxy-agent";
import { asyncTaskManager } from "../../../utils/async-task.js";
import { createCircleWebp } from "../../chat-zalo/chat-special/send-sticker/create-webp.js";

const PLATFORM = "tiktok";
const TIME_WAIT_SELECTION = 60000;
const RELATED_EXPIRE_TIME = 180000;
const HISTORY_EXPIRE_TIME = 3600000;
const TIME_TO_LIVE = 86400000;
const GET_RELATED_VIDEO = 30;

const relatedVideosMap = new Map();
const userVideoHistoryMap = new Map();

const headers = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "*/*",
  "Accept-Encoding": "identity;q=1, *;q=0",
  "Accept-Language": "en-US,en;q=0.9,vi;q=0.8",
  Cookie:
    "_ttp=2p0lHkLPkuuzPy4n9kNCgaqVBFM; tt_chain_token=tioPB+Lui7TvHuzUPNaOHg==; passport_csrf_token=3dfb5a52d5a68f4d5c9bba4538577dfe; passport_csrf_token_default=3dfb5a52d5a68f4d5c9bba4538577dfe; odin_tt=0a5b7e2bc3c60961f0e9463f055e859c8ca0059ae611097cd3dd3f4f259a70c0ec1343ec5dfb12f6361658cbac0ad226f69c1b6cba2089e7f174c7f9388708e449330d0c262c38701c9381fc9a679cae; tt_csrf_token=tRUs25Em-weSrPLvFd61dOW1c5-DwHMbLe8s; s_v_web_id=verify_m5acgd9w_JQLaQCy0_pzpQ_43RZ_BC6o_vhFGHinP4BkJ; ak_bmsc=B383BD0641AA3966BA5467E50FF743C7~000000000000000000000000000000~YAAQb/rSFwVwPRWUAQAAt4m1FRogp3ca2+A8RMlIQ3bVPFbQk32wMIqddY1DgYAkQSrPhPOfWeY09XH9dzjEP/JHNDoF6+1dNfEjFHRPX4UJDFn8vLT0S6np7j/Ln3P7MWvpipgWl4Yv2sbPa6WhsVKHincBk25EcDsuCtubK1wbOQhhDuTXz5/1BD33+zDu3UHgFTB4R/QwxQknEurgT7ejJW+ORo8kt7RlyJW8Re4JTaQbi4KQKQAWl6B6g4D0bWTWGNG5mQn7z7x6O2TDr7gqzidqpNaQ7vKBEs9To5+RcCdvLtOY2zh4f0cD9h+Mrdfkw70ZEt2vi8Sq4zwWwPI5N7WqxvMffMr1vIYBb6bg8Kw62daAZXS4/y3GNRhtimAAq+fnZYB0; bm_sv=C410BFCD013A0C5B8520B329617A1E60~YAAQb/rSF3t8PRWUAQAANe+2FRrx1PREwDh+ViFkDQN6KWGFhaqf+srNGuaupb219rQJ6LqNeKq3o7xTExLzyYYZEfZKrBGnxCcnCSVFz2dXens26fDnmkgY83OYLDclwx+oJyhCBUdPq/CayUnzV9LiOgmoBYpHoDaxG8d6bBsFPuJUuQDBKzDLufGHtbAFzaiiF/AALmC7GeblyI734eWFTU/4NBIme2NvBGQSzaEjqtAGsj+mReMGduvAPgKg~1; ttwid=1%7CaIhJLRa4fvQV5lLYGHleEtravH48pseLFrAf8dwU0ik%7C1735531098%7C93b50b3458c149dc9b6c3b6d7684bb03da5e87ae81d41b52ce2e116eb6927ca1; msToken=OOe0-h21TyN659uHZ5rOZxo4MdlgKsxjPdzEowUi26NgWYUSyN49-R3BEdKoII-GndXvAcqHuWRTe4Rma4ZnoqWcqkm3IO_qLXCP_9sLSPrq57_1K9cT8Lw3LAMXtyNfadDjwQRTQzYO2-NnE5vt7VXB9edV",
};

schedule.scheduleJob("*/5 * * * * *", () => {
  const currentTime = Date.now();
  for (const [msgId, data] of relatedVideosMap.entries()) {
    if (currentTime - data.timestamp > RELATED_EXPIRE_TIME) {
      relatedVideosMap.delete(msgId);
    }
  }
  for (const [userId, data] of userVideoHistoryMap.entries()) {
    if (currentTime - data.timestamp > HISTORY_EXPIRE_TIME) {
      userVideoHistoryMap.delete(userId);
    }
  }
});

export async function sendTikTokVideo(api, message, videoData, isRandom = false, typeVideo = "540p") {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  let tempFilePath = null;
  const uniqueIdAuthor = videoData.author.uniqueId || videoData.author.unique_id || videoData.author.username;

  try {
    if (videoData.images) {
      let imageUrls = [];
      let imagePaths = [];
      let voiceUrlsUpload = [];

      try {
        const voiceUrl = await downloadAndConvertAudio(videoData.music.url, api, message);
        voiceUrlsUpload.push(voiceUrl);
      } catch {}

      try {
        const imageProcessingPromises = videoData.images.map(async (item) => {
          try {
            const tempImagePath = path.join(tempDir, `temp_image_${randomIDTemp()}.jpg`);
            await downloadFile(item, tempImagePath);
            const tempFile = await uploadTempFile(tempImagePath, 2, { api, message });
            imagePaths.push(tempImagePath);
            const dataImage = await getLocalImageInfo(tempImagePath);
            if (dataImage) {
              return {
                url: tempFile || item,
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
              `Title: ${videoData.desc}\n` +
              `Author: ${videoData.author.nickname}\n` +
              `💗 Thả tim để nhận nội dung ngẫu nhiên khác từ author này`,
          };
          const sentMessage = await sendMessageCompleteRequest(api, message, object, TIME_TO_LIVE);

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
          relatedVideosMap.set(sentMessage.message.msgId.toString(), {
            videos: null,
            uniqueIdAuthor,
            timestamp: Date.now(),
            threadId: message.threadId,
            type: message.type,
            senderId,
            senderName,
            message,
          });
        } else {
          const object = {
            caption: `Không có dữ liệu nào để tải từ link bạn đã cung cấp!`,
          };
          await sendMessageCompleteRequest(api, message, object, TIME_TO_LIVE);
        }
      } catch {
      } finally {
        for (const path of imagePaths) {
          await clearImagePath(path);
        }
      }
      return;
    }

    const uniqueId = videoData.id;
    const description = videoData.desc;
    const cachedVideo = await getCachedMedia(PLATFORM, uniqueId, typeVideo, description);
    let videoUrl;

    // asyncTaskManager.runAsync(videoData.music.cover, () => createCircleWebp(api, message, videoData.music.cover, uniqueId));

    if (cachedVideo) {
      videoUrl = cachedVideo.fileUrl;
    } else {
      if (!isRandom) {
        const object = {
          caption:
            `Chờ lấy ${typeVideo === "audio" ? "nhạc" : "video"}` +
            ` một chút, xong sẽ gọi cho hay!\n📊 Chất lượng: ${typeVideo}`,
        };
        await sendMessageProcessingRequest(api, message, object, 8000);
      }
      if (typeVideo === "audio") {
        tempFilePath = path.join(tempDir, `${uniqueId}_${randomIDTemp()}.mp3`);
        if (videoData.music.url) {
          tempFilePath = await downloadFile(videoData.music.url, tempFilePath);
        } else {
          const data = await getDataDownloadOriginal(null, uniqueId);
          if (data) {
            tempFilePath = await downloadFile(data.music.url, tempFilePath);
          }
        }
      } else {
        try {
          tempFilePath = await downloadVideoTiktok(videoData.video.url || videoData.video.playAddr);
        } catch (error) {
          const data = await getDataDownloadOriginal(null, uniqueId);
          if (data) {
            tempFilePath = await downloadVideoTiktok(data.video.url);
          }
        }
      }
      const uploadResult = await api.uploadAttachment([tempFilePath], message.threadId, message.type);
      videoUrl = uploadResult[0].fileUrl;
      await deleteFile(tempFilePath);

      setCacheData(PLATFORM, uniqueId, { fileUrl: videoUrl, title: description }, typeVideo);
    }

    if (typeVideo === "audio") {
      const object = {
        trackId: uniqueId,
        title: videoData.music.title,
        artists: videoData.music.author,
        source: "Tiktok",
        caption: `> From Tiktok <\nNhạc Bạn Chọn Đâyy!!!`,
        imageUrl: videoData.music.cover,
        voiceUrl: videoUrl,
        listen: videoData.stat.playCount,
        like: videoData.stat.diggCount,
        comment: videoData.stat.commentCount,
      };
      await sendVoiceMusic(api, message, object);
    } else {
      const sentMessage = await api.sendVideo({
        videoUrl,
        threadId: message.threadId,
        threadType: message.type,
        thumbnail: videoData.video.cover,
        message: {
          text:
            `[ ${senderName} ]\n` +
            `Author: [${uniqueIdAuthor}] ${videoData.author.nickname}\n` +
            `Description: ${description.length > 240 ? description.slice(0, 240) + "..." : description}\n` +
            `📊 Chất lượng: ${typeVideo}\n` +
            `💗 Thả tim để nhận nội dung ngẫu nhiên khác từ author này`,
          mentions: [MessageMention(senderId, senderName.length, 2, false)],
        },
        ttl: TIME_TO_LIVE,
      });

      await api.addReaction("UNDO", message);
      await api.addReaction("LIKE", message);

      relatedVideosMap.set(sentMessage.msgId.toString(), {
        videos: null,
        uniqueIdAuthor,
        timestamp: Date.now(),
        threadId: message.threadId,
        type: message.type,
        senderId,
        senderName,
        message,
      });
    }
    return true;
  } catch (error) {
    await api.addReaction("UNDO", message);
    await api.addReaction("TIEUTAN", message);
    throw error;
  } finally {
    if (tempFilePath) deleteFile(tempFilePath);
  }
}

export async function sendTikTokVideoFromReact(api, message, videoData, typeVideo = "540p") {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  let tempFilePath = null;
  let sentMessage;
  const uniqueIdAuthor = videoData.author.uniqueId || videoData.author.unique_id || videoData.author.username;

  try {
    if (videoData.images) {
      let imageUrls = [];
      let imagePaths = [];
      let voiceUrlsUpload = [];

      try {
        const voiceUrl = await downloadAndConvertAudio(videoData.music.url, api, message);
        voiceUrlsUpload.push(voiceUrl);
      } catch {}

      const imageProcessingPromises = videoData.images.map(async (item) => {
        try {
          const tempImagePath = path.join(tempDir, `temp_image_${randomIDTemp()}.jpg`);
          await downloadFile(item, tempImagePath);
          const tempFile = await uploadTempFile(tempImagePath, 2, { api, message });
          imagePaths.push(tempImagePath);
          const dataImage = await getLocalImageInfo(tempImagePath);
          if (dataImage) {
            return {
              url: tempFile || item,
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
            `Title: ${videoData.desc}\n` +
            `Author: ${videoData.author.nickname}\n` +
            `💗 Thả tim để nhận nội dung ngẫu nhiên khác từ author này`,
        };
        sentMessage = await sendMessageCompleteRequest(api, message, object, TIME_TO_LIVE);

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
      return;
    }

    const uniqueId = videoData.id;
    const description = videoData.desc;
    const cachedVideo = await getCachedMedia(PLATFORM, uniqueId, typeVideo, description);
    let videoUrl;

    // asyncTaskManager.runAsync(videoData.music.cover, () => createCircleWebp(api, message, videoData.music.cover, uniqueId));

    if (cachedVideo) {
      videoUrl = cachedVideo.fileUrl;
    } else {
      if (typeVideo === "audio") {
        tempFilePath = path.join(tempDir, `${uniqueId}_${randomIDTemp()}.mp3`);
        if (videoData.music.url) {
          tempFilePath = await downloadFile(videoData.music.url, tempFilePath);
        } else {
          const data = await getDataDownloadOriginal(null, uniqueId);
          if (data) {
            tempFilePath = await downloadFile(data.music.url, tempFilePath);
          }
        }
      } else {
        try {
          tempFilePath = await downloadVideoTiktok(videoData.video.url || videoData.video.playAddr);
        } catch (error) {
          const data = await getDataDownloadOriginal(null, uniqueId);
          if (data) {
            tempFilePath = await downloadVideoTiktok(data.video.url);
          }
        }
      }
      const uploadResult = await api.uploadAttachment([tempFilePath], message.threadId, message.type);
      videoUrl = uploadResult[0].fileUrl;
      await deleteFile(tempFilePath);

      setCacheData(PLATFORM, uniqueId, { fileUrl: videoUrl, title: description }, typeVideo);
    }

    if (typeVideo === "audio") {
      const object = {
        trackId: uniqueId,
        title: videoData.music.title,
        artists: videoData.music.author,
        source: "Tiktok",
        caption: `> From Tiktok <\nNhạc Bạn Chọn Đâyy!!!`,
        imageUrl: videoData.music.cover,
        voiceUrl: videoUrl,
        listen: videoData.stat.playCount,
        like: videoData.stat.diggCount,
        comment: videoData.stat.commentCount,
      };
      await sendVoiceMusic(api, message, object);
    } else {
      sentMessage = await api.sendVideo({
        videoUrl,
        threadId: message.threadId,
        threadType: message.type,
        thumbnail: videoData.video.cover,
        message: {
          text:
            `[ ${senderName} ]\n` +
            `Author: [${uniqueIdAuthor}] ${videoData.author.nickname}\n` +
            `Description: ${description.length > 240 ? description.slice(0, 240) + "..." : description}\n` +
            `📊 Chất lượng: ${typeVideo}\n` +
            `💗 Thả tim để nhận nội dung ngẫu nhiên khác từ author này`,
          mentions: [MessageMention(senderId, senderName.length, 2, false)],
        },
        ttl: TIME_TO_LIVE,
      });

      await api.addReaction("UNDO", message);
      await api.addReaction("LIKE", message);
    }
    return sentMessage;
  } catch (error) {
    await api.addReaction("UNDO", message);
    await api.addReaction("TIEUTAN", message);
    throw error;
  } finally {
    deleteFile(tempFilePath);
  }
}

export async function getRandomVideoFromArray(api, message, array) {
  const randomIndex = Math.floor(Math.random() * array.length);
  const randomVideo = array[randomIndex];

  const description = randomVideo.desc;
  const cachedVideo = await getCachedMedia(PLATFORM, description, "540p", description);
  let videoUrl;
  let tempFilePath = null;

  if (cachedVideo) {
    videoUrl = cachedVideo.fileUrl;
  } else {
    try {
      tempFilePath = await downloadVideoTiktok(randomVideo.video.url || randomVideo.video.playAddr);
      const uploadResult = await api.uploadAttachment([tempFilePath], message.threadId, message.type);
      videoUrl = uploadResult[0].fileUrl;
      setCacheData(PLATFORM, description, { fileUrl: videoUrl }, "540p", description);
    } catch (error) {
      throw error;
    } finally {
      deleteFile(tempFilePath);
    }
  }

  return videoUrl;
}

const extractTikTokUrl = (text) => {
  const tiktokRegex = /https?:\/\/((?:vm|vt|www)\.)?tiktok\.com\/[^\s]+/i;
  const match = text.match(tiktokRegex);
  return match ? match[0] : null;
};

export async function handleTikTokCommand(api, message, command) {
  const content = removeMention(message);
  const senderId = message.data.uidFrom;
  const prefix = getGlobalPrefix(api.getBotId());
  let imagePath = null;

  try {
    const keyword = content.replace(`${prefix}${command}`, "").trim();
    const quickSelection = parseQuickSelection(keyword);

    if (!keyword) {
      const object = {
        caption: `Vui lòng nhập từ khóa tìm kiếm hoặc link tiktok\nVí dụ:\n${prefix}${command} nội dung cần tìm`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    const [query, typeVideo = "normal"] = quickSelection.query.split(" ");

    const tiktokUrl = extractTikTokUrl(query);
    if (tiktokUrl) {
      const videoData = await getDataDownloadVideoTiktok(tiktokUrl);
      if (videoData) {
        if (typeVideo === "audio") {
          await sendTikTokVideo(api, message, videoData, false, typeVideo);
        } else {
          await sendTikTokVideo(api, message, videoData, false, videoData.video.quality);
        }
      } else {
        const object = {
          caption: `Không thể tải video từ link này. Vui lòng kiểm tra lại link hoặc thử link khác.`,
        };
        await sendMessageWarningRequest(api, message, object, 30000);
      }
      return;
    }

    const videos = await searchTiktok(quickSelection.query);

    if (videos && videos.length > 0) {
      if (quickSelection.selectedIndex !== null) {
        const selectedVideo = videos[quickSelection.selectedIndex];
        if (!selectedVideo) {
          return await sendMessageWarningRequest(api, message, {
            caption: `Không có kết quả số ${quickSelection.selectedIndex + 1}.`,
          }, 30000);
        }
        const qualityType = quickSelection.option === "audio"
          ? "audio"
          : selectedVideo.video.quality;
        await api.addReaction("CLOCK", message);
        await sendTikTokVideo(api, message, selectedVideo, false, qualityType);
        return true;
      }
      let videoListText = "Đây là danh sách video tôi tìm thấy trên Tiktok:\n";
      videoListText += `Dùng cú pháp tìm nhanh để chọn video: từ khóa >> số`;
      videoListText += `\nVD: mèo >>1 hoặc mèo >>1 audio`;

      imagePath = await createSearchResultImage(
        videos.map((video) => ({
          title: video.desc || "No description",
          artistsNames: `${video.author.nickname} (@${video.author.uniqueId || video.author.unique_id})`,
          thumbnailM: video.video.cover,
          listen: video.stat.playCount || 0,
          like: video.stat.diggCount || 0,
          comment: video.stat.commentCount || 0,
        })),
        api.getBotId()
      );

      const object = {
        caption: videoListText,
        imagePath: imagePath,
      };
      await sendMessageCompleteRequest(api, message, object, TIME_WAIT_SELECTION);

    } else {
      const object = {
        caption: `Không tìm được video phù hợp.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
    }
  } catch (error) {
    console.error("Lỗi khi xử lý tìm kiếm TikTok:", error);
    const object = {
      caption: `Đã xảy ra lỗi khi tìm kiếm video TikTok, vui lòng thử lại sau.`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
  } finally {
    if (imagePath) deleteFile(imagePath);
  }
}

export async function downloadVideoTiktok(videoUrl) {
  const settingConfig = readSettingConfig();
  const USE_PROXY = settingConfig["USE_PROXY"] || false;
  const PROXY = settingConfig["PROXY_HTTP"] || "";
  const videoResponse = await axios.get(videoUrl, {
    headers: {
      ...headers,
    },
    httpsAgent:
      (USE_PROXY && (PROXY.startsWith("http") || PROXY.startsWith("https") ? new HttpsProxyAgent(PROXY) : undefined)) ||
      undefined,
    responseType: "arraybuffer",
    maxRedirects: 5,
  });

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  const tempFilePath = path.join(tempDir, `tiktok_${randomIDTemp()}.mp4`);
  fs.writeFileSync(tempFilePath, videoResponse.data);

  return tempFilePath;
}

function getUnseenVideo(videos, userId) {
  if (!userVideoHistoryMap.has(userId)) {
    userVideoHistoryMap.set(userId, {
      videoIds: new Set(),
      timestamp: Date.now(),
    });
  }

  const userHistory = userVideoHistoryMap.get(userId);
  const unseenVideos = videos.filter((video) => !userHistory.videoIds.has(video.id));

  if (unseenVideos.length === 0) {
    userHistory.videoIds.clear();
    return videos[Math.floor(Math.random() * videos.length)];
  }

  const randomVideo = unseenVideos[Math.floor(Math.random() * unseenVideos.length)];
  userHistory.videoIds.add(randomVideo.id);
  userHistory.timestamp = Date.now();

  return randomVideo;
}

export async function handleTikTokReaction(api, reaction) {
  let tempFilePath = null;
  try {
    const msgId = reaction.data?.content?.rMsg[0]?.gMsgID?.toString() || "";
    if (!msgId) return false;
    if (!relatedVideosMap.has(msgId)) return false;

    const relatedData = relatedVideosMap.get(msgId);
    const senderId = reaction.data.uidFrom;
    if (senderId !== relatedData.senderId) return false;

    const rType = reaction.data.content.rType;
    if (rType !== 5) return false;
    relatedVideosMap.delete(msgId);
    let {
      videos,
      threadId,
      type,
      uniqueIdAuthor,
      senderId: senderIdOriginal,
      senderName: senderNameOriginal,
      message,
    } = relatedData;

    if (!videos) {
      const relatedVideos = await getTiktokPostByUsername(uniqueIdAuthor, GET_RELATED_VIDEO);
      if (relatedVideos && relatedVideos.status === "success") {
        videos = relatedVideos.result;
      } else {
        const object = {
          caption: `Không tìm thấy video liên quan nào từ author này.`,
        };
        await sendMessageWarningRequest(api, message, object, 30000);
        return;
      }
    }

    const randomVideo = getUnseenVideo(videos, senderIdOriginal);
    const sentMessage = await sendTikTokVideoFromReact(api, message, randomVideo);
    if (sentMessage) {
      relatedVideosMap.set(sentMessage.msgId.toString(), {
        videos: videos,
        timestamp: Date.now(),
        threadId: threadId,
        type: type,
        senderId: senderIdOriginal,
        senderName: senderNameOriginal,
        message,
      });
    }

    return true;
  } catch (error) {
    console.error("Lỗi khi xử lý reaction TikTok:", error);
    return false;
  } finally {
    if (tempFilePath) deleteFile(tempFilePath);
  }
}
