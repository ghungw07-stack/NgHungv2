import fs from "node:fs/promises";
import path from "node:path";
import axios from "axios";
import * as cheerio from "cheerio";
import youtubeDl from "youtube-dl-exec";

import { MessageMention } from "../../api-zalo/index.js";
import { getVideoMetadata } from "../../api-zalo/utils.js";
import {
  sendMessageCompleteRequest,
  sendMessageFailed,
  sendMessageProcessingRequest,
} from "../../service-ngh/chat-zalo/chat-style/chat-style.js";
import { setSelectionsMapData } from "../../service-ngh/api-crawl/index.js";
import { createSearchResultImage } from "../../utils/canvas/search-canvas.js";
import { randomIDTemp, removeMention } from "../../utils/format-util.js";
import { tempDir } from "../../utils/io-json.js";

const PLATFORM_HOSTS = new Set(["xhwide.com", "www.xhwide.com", "vi.xhwide.com"]);
const PLATFORM_XHWIDE = "xhwide";
const RESULT_LIMIT = 10;
const SELECTION_TTL = 60_000;
const BLOCKED_TERMS = /(?:^|\W)(?:under\s*18|minor|teen(?:ager)?|school\s*(?:girl|boy|student)|high\s*school|middle\s*school|child|kid|preteen|lolita|lớp\s*(?:[1-9]|10|11|12)|học\s*sinh|trẻ\s*em|vị\s*thành\s*niên|chưa\s*đủ\s*18)(?:\W|$)/iu;

function getXhwideInput(content, aliasCommand) {
  const aliasPosition = content.toLowerCase().indexOf(String(aliasCommand).toLowerCase());
  const input = (aliasPosition >= 0 ? content.slice(aliasPosition + String(aliasCommand).length) : "").trim();
  if (!input) throw new Error("Hãy nhập từ khóa hoặc link video XHWide.");
  return input;
}

function isXhwideUrl(input) {
  let url;
  try {
    url = new URL(String(input));
  } catch {
    return false;
  }
  return url.protocol === "https:" && PLATFORM_HOSTS.has(url.hostname.toLowerCase());
}

function getXhwideUrl(input) {
  if (!isXhwideUrl(input)) {
    throw new Error("Chỉ hỗ trợ link https://vi.xhwide.com/... (hoặc xhwide.com).");
  }
  return new URL(input).toString();
}

function assertAdultMetadata(info) {
  const metadata = [info?.title, info?.description, ...(info?.tags || []), ...(info?.categories || [])]
    .filter(Boolean)
    .join(" ");
  if (BLOCKED_TERMS.test(metadata)) {
    throw new Error("Video bị chặn bởi bộ lọc an toàn 18+.");
  }
}

async function removeTempFile(filePath) {
  await fs.unlink(filePath).catch(() => {});
}

export async function handleSendXhwideVideo(api, message, selectedVideo) {
  let videoPath;
  try {
    const videoUrl = getXhwideUrl(selectedVideo?.url || selectedVideo);
    await sendMessageProcessingRequest(api, message, { caption: "Đang lấy và upload video từ XHWide..." }, 30_000);

    const info = await youtubeDl(videoUrl, {
      dumpSingleJson: true,
      noPlaylist: true,
      noWarnings: true,
      noCheckCertificates: true,
      socketTimeout: 30,
    });
    assertAdultMetadata(info);

    const extension = info?.ext === "mp4" ? "mp4" : "mp4";
    videoPath = path.join(tempDir, `xhwide_${info?.id || randomIDTemp()}_${randomIDTemp()}.${extension}`);
    await youtubeDl(videoUrl, {
      output: videoPath,
      format: "best[ext=mp4][height<=720]/best[height<=720]/best",
      mergeOutputFormat: "mp4",
      noPlaylist: true,
      noWarnings: true,
      noCheckCertificates: true,
      socketTimeout: 60,
      retries: 3,
    });

    const [uploaded] = await api.uploadAttachment([videoPath], message.threadId, message.type);
    const videoUploadUrl = uploaded?.fileUrl || uploaded?.normalUrl;
    if (!videoUploadUrl) throw new Error("Upload video lên Zalo thất bại.");

    const metadata = await getVideoMetadata(videoPath).catch(() => null);
    const senderId = message.data.gameUid || message.data.uidFrom;
    const senderName = message.data.dName || "Bạn";
    await api.sendVideo({
      videoUrl: videoUploadUrl,
      threadId: message.threadId,
      threadType: message.type,
      thumbnail: info?.thumbnail,
      metaData: metadata,
      message: {
        text: `@${senderName}\n🎬 ${info?.title || "XHWide video"}`,
        mentions: [MessageMention(senderId, senderName.length + 1, 0, false)],
      },
      ttl: 60_000,
    });
  } catch (error) {
    console.error("Lỗi lệnh xhwide:", error?.stderr || error?.message || error);
    throw error;
  } finally {
    if (videoPath) await removeTempFile(videoPath);
  }
}

async function searchXhwideVideos(query) {
  if (BLOCKED_TERMS.test(query)) throw new Error("Từ khóa không phù hợp với nguồn chỉ dành cho người trưởng thành.");
  const searchUrl = `https://vi.xhwide.com/search/${encodeURIComponent(query)}`;
  const { data: html } = await axios.get(searchUrl, {
    timeout: 30_000,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
      "Accept-Language": "vi,en;q=0.8",
    },
  });
  const $ = cheerio.load(html);
  const results = [];
  const seen = new Set();

  $("a[href*='/videos/'], a[href*='/video/']").each((_, element) => {
    if (results.length >= RESULT_LIMIT) return false;
    const href = $(element).attr("href");
    if (!href) return;

    const url = new URL(href, "https://vi.xhwide.com").toString();
    if (!isXhwideUrl(url) || seen.has(url)) return;

    const card = $(element).closest("article, li, [class*='video'], [class*='Video']");
    const image = $(element).find("img").first().add(card.find("img").first()).first();
    const title = (
      $(element).attr("title") ||
      image.attr("alt") ||
      card.find("[class*='title'], [class*='Title'], h1, h2, h3, h4").first().text() ||
      $(element).text()
    ).replace(/\s+/g, " ").trim();
    if (!title || BLOCKED_TERMS.test(title)) return;

    const cardText = card.text().replace(/\s+/g, " ").trim();
    const duration = cardText.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/)?.[0] || "";
    const thumbnail = image.attr("data-src") || image.attr("data-original") || image.attr("src") || "";
    seen.add(url);
    results.push({
      id: url.match(/(\d+)(?:[/?#]|$)/)?.[1] || url,
      title,
      url,
      thumbnail: thumbnail ? new URL(thumbnail, "https://vi.xhwide.com").toString() : "",
      duration,
      uploader: "XHWide",
    });
  });
  return results;
}

export async function handleXhwideCommand(api, message, aliasCommand, isAdminLevelHighest = false) {
  if (!isAdminLevelHighest) {
    await sendMessageFailed(api, message, "Lệnh 18+ này chỉ dành cho super-admin.", false, 30_000);
    return;
  }

  let imagePath;
  try {
    const input = getXhwideInput(removeMention(message), aliasCommand);
    if (isXhwideUrl(input)) {
      await handleSendXhwideVideo(api, message, input);
      return;
    }

    await sendMessageProcessingRequest(api, message, { caption: "Đang tìm video XHWide..." }, 30_000);
    const videos = await searchXhwideVideos(input);
    if (!videos.length) throw new Error("Không tìm thấy video phù hợp.");

    imagePath = await createSearchResultImage(
      videos.map((video) => ({
        title: video.title,
        source: video.uploader,
        durationText: video.duration,
        videoId: video.id,
        thumbnailM: video.thumbnail,
      })),
      api.getBotId()
    );
    const response = await sendMessageCompleteRequest(
      api,
      message,
      { caption: `🎬 Kết quả XHWide: ${input}\nTrả lời số thứ tự để bot gửi video.`, imagePath },
      SELECTION_TTL
    );
    const messageId = response?.message?.msgId || response?.attachment?.[0]?.msgId;
    if (!messageId) throw new Error("Không lấy được ID tin nhắn danh sách.");

    setSelectionsMapData(message.data.uidFrom, {
      platform: PLATFORM_XHWIDE,
      quotedMsgId: String(messageId),
      collection: videos,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("Lỗi tìm video xhwide:", error?.stderr || error?.message || error);
    await sendMessageFailed(api, message, error?.message || "Không thể lấy video XHWide lúc này.", false, 30_000);
  } finally {
    if (imagePath) await removeTempFile(imagePath);
  }
}
