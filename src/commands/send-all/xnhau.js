import { getLatestVideos, getVideoDetails, searchVideos } from "../../../apixnhau.js";
import { removeMention } from "../../utils/format-util.js";
import { MessageMention } from "../../api-zalo/index.js";
import {
  sendMessageCompleteRequest,
  sendMessageFailed,
  sendMessageProcessingRequest,
} from "../../service-ngh/chat-zalo/chat-style/chat-style.js";
import { createSearchResultImage } from "../../utils/canvas/search-canvas.js";
import { deleteFile, downloadVideoWithFFmpeg } from "../../utils/util.js";
import { getVideoMetadata } from "../../api-zalo/utils.js";
import { tempDir } from "../../utils/io-json.js";
import { randomIDTemp } from "../../utils/format-util.js";
import { parseQuickSelection, setSelectionsMapData } from "../../service-ngh/api-crawl/index.js";
import path from "node:path";
import schedule from "node-schedule";

const CONFIG = {
  maxResults: 10,
  timeWaitSelection: 60_000,
};
const PLATFORM_XNHAU = "xnhau";
const TTL = CONFIG.timeWaitSelection;
const RESULT_LIMIT = CONFIG.maxResults;
const videoSelectionsMap = new Map();

function cleanupSelections(now = Date.now()) {
  for (const [messageId, data] of videoSelectionsMap) {
    if (now - data.timestamp >= TTL) videoSelectionsMap.delete(messageId);
  }
}

schedule.scheduleJob("*/5 * * * * *", cleanupSelections);

function selectBestSource(sources) {
  return [...sources].sort((a, b) => {
    if (a.format !== b.format) return a.format === "hls" ? -1 : 1;
    return (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0);
  })[0];
}

export async function handleSendXNhauVideo(api, message, selectedVideo) {
  const video = selectedVideo?.sources?.length
    ? selectedVideo
    : await getVideoDetails(selectedVideo?.url || selectedVideo?.id);
  const source = selectBestSource(video.sources || []);
  if (!source) throw new Error("Video không có nguồn phát công khai");

  const senderName = message.data.dName;
  const senderId = message.data.gameUid || message.data.uidFrom;
  const videoPath = path.join(tempDir, `xnhau_${randomIDTemp()}.mp4`);
  try {
    await sendMessageProcessingRequest(api, message, { caption: `Đang tải và upload video ${source.quality}...` }, 30_000);
    await downloadVideoWithFFmpeg(source.url, videoPath, {
      Referer: video.pageUrl || "https://www.pornhub.com/",
      "User-Agent": "Mozilla/5.0",
    });
    const [uploaded] = await api.uploadAttachment([videoPath], message.threadId, message.type);
    const videoUrl = uploaded?.fileUrl || uploaded?.normalUrl;
    if (!videoUrl) throw new Error("Upload video lên Zalo thất bại");
    const metadata = await getVideoMetadata(videoPath).catch(() => null);
    await api.sendVideo({
      videoUrl,
      threadId: message.threadId,
      threadType: message.type,
      thumbnail: video.thumbnail,
      metaData: metadata,
      message: {
        text: `@${senderName}\n🎬 ${video.title}\n📺 ${source.quality}`,
        mentions: [MessageMention(senderId, senderName.length + 1, 0, false)],
      },
      ttl: TTL,
    });
  } finally {
    await deleteFile(videoPath).catch(() => {});
  }
}

export async function handleXNhauCommand(api, message, aliasCommand, isAdminLevelHighest = false) {
  const content = removeMention(message);
  const aliasIndex = content.toLowerCase().indexOf(String(aliasCommand).toLowerCase());
  const input = aliasIndex >= 0 ? content.slice(aliasIndex + String(aliasCommand).length).trim() : "";
  const quickSelection = parseQuickSelection(input);

  if (!isAdminLevelHighest) {
    await sendMessageFailed(api, message, "Lệnh 18+ này chỉ dành cho super-admin.", false, 30_000);
    return;
  }

  await sendMessageProcessingRequest(api, message, { caption: "Đang lấy dữ liệu từ API 18+ đã xác minh..." }, 30_000);

  let imagePath;
  try {
    if (/^https?:\/\/(?:www\.)?pornhub\.com\/view_video\.php\?[^\s]*viewkey=/i.test(input)) {
      const video = await getVideoDetails(input);
      await handleSendXNhauVideo(api, message, video);
      return;
    }

    const pageMatch = quickSelection.query.match(/^page\s+(\d+)$/i);
    const videos = pageMatch
      ? await getLatestVideos({ page: Number(pageMatch[1]), limit: RESULT_LIMIT })
      : quickSelection.query
        ? await searchVideos(quickSelection.query, { limit: RESULT_LIMIT })
        : await getLatestVideos({ limit: RESULT_LIMIT });

    if (!videos.length) {
      await sendMessageFailed(api, message, "Không tìm thấy video phù hợp.", false, 30_000);
      return;
    }

    if (quickSelection.selectedIndex !== null) {
      const video = videos[quickSelection.selectedIndex];
      if (!video) {
        await sendMessageFailed(api, message, `Không có kết quả số ${quickSelection.selectedIndex + 1}.`, false, 30_000);
        return;
      }
      await api.addReaction("CLOCK", message);
      await handleSendXNhauVideo(api, message, video);
      return;
    }

    const canvasItems = videos.map((video) => ({
      title: video.title,
      source: "Nguồn 18+ đã xác minh",
      durationText: video.duration,
      videoId: video.id,
      thumbnailM: video.thumbnail,
    }));
    imagePath = await createSearchResultImage(canvasItems, api.getBotId());
    const response = await sendMessageCompleteRequest(
      api,
      message,
      {
        caption: `🎬 ${input || "Video mới"}\nGửi số thứ tự để bot gửi video.`,
        imagePath,
      },
      CONFIG.timeWaitSelection
    );
    const messageId = response?.message?.msgId || response?.attachment?.[0]?.msgId;
    if (!messageId) throw new Error("Không lấy được ID tin nhắn danh sách");

    cleanupSelections();
    const selectionData = {
      userRequest: message.data.uidFrom,
      collection: videos,
      quotedMsgId: messageId.toString(),
      cliMsgId: response?.message?.cliMsgId || response?.attachment?.[0]?.cliMsgId,
      timestamp: Date.now(),
    };
    videoSelectionsMap.set(messageId.toString(), selectionData);
    setSelectionsMapData(message.data.uidFrom, {
      quotedMsgId: messageId.toString(),
      collection: videos,
      timestamp: Date.now(),
      platform: PLATFORM_XNHAU,
    });
  } catch (error) {
    console.error("Lỗi lệnh xnhau:", error.response?.status || error.message);
    await sendMessageFailed(api, message, "Không thể lấy dữ liệu từ API 18+ lúc này.", false, 30_000);
  } finally {
    if (imagePath) await deleteFile(imagePath);
  }
}

async function sendSelectedVideo(api, message, selectionData, selectedIndex) {
  try {
    await api.deleteMessage({
      type: message.type,
      threadId: message.threadId,
      data: {
        cliMsgId: selectionData.cliMsgId || message.data?.quote?.cliMsgId || Date.now(),
        msgId: selectionData.quotedMsgId,
        uidFrom: api.getBotId(),
      },
    }, false);
  } catch {}

  videoSelectionsMap.delete(selectionData.quotedMsgId);
  await api.addReaction("CLOCK", message);
  await handleSendXNhauVideo(api, message, selectionData.collection[selectedIndex]);
  await api.addReaction("LIKE", message);
  return true;
}

export async function handleXNhauReply(api, message) {
  const senderId = message.data.uidFrom;
  try {
    if (!message.data.quote || !message.data.quote.globalMsgId) return false;

    cleanupSelections();
    const quotedMsgId = message.data.quote.globalMsgId.toString();
    if (!videoSelectionsMap.has(quotedMsgId)) return false;

    const videoData = videoSelectionsMap.get(quotedMsgId);
    if (videoData.userRequest !== senderId) return false;

    const selection = removeMention(message);
    const selectedIndex = parseInt(selection) - 1;
    if (isNaN(selectedIndex)) {
      await sendMessageFailed(api, message, "Lựa chọn không hợp lệ. Vui lòng chọn một số từ danh sách.", false, 30_000);
      return true;
    }

    const { collection } = videoSelectionsMap.get(quotedMsgId);
    if (selectedIndex < 0 || selectedIndex >= collection.length) {
      await sendMessageFailed(api, message, "Số bạn chọn không nằm trong danh sách. Vui lòng chọn lại.", false, 30_000);
      return true;
    }

    return await sendSelectedVideo(api, message, videoData, selectedIndex);
  } catch (error) {
    console.error("Lỗi gửi video xnhau:", error.response?.status || error.message);
    await sendMessageFailed(api, message, "Không thể gửi video đã chọn.", false, 30_000);
    return true;
  }
}
