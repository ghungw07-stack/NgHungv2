import axios from "axios";
import * as cheerio from "cheerio";
import schedule from "node-schedule";
import path from "path";
import { randomIDTemp, removeMention } from "../../../utils/format-util.js";
import { getGlobalPrefix } from "../../service.js";
import {
  sendMessageComplete,
  sendMessageCompleteRequest,
  sendMessageFailed,
  sendMessageStateQuote,
} from "../../chat-zalo/chat-style/chat-style.js";
import { setSelectionsMapData } from "../index.js";
import { deleteFile } from "../../../utils/util.js";
import { clearPage, getClientAxios, launchBrowser } from "../../utilities/browser-launch.js";
import { createSearchResultImage } from "../../../utils/canvas/search-canvas.js";
import { getCachedMedia, setCacheData } from "../../../utils/link-platform-cache.js";
import { tempDir } from "../../../utils/io-json.js";
import { MessageMention } from "../../../api-zalo/index.js";
import { downloadsCache } from "../../../utils/download-upload-cache.js";

export const PLATFORM_CLIPPHOT = "cliphot";
const URL_CLIP_PHOT_NET = "https://clipphot.org/";
const URL_MOBIBLOB = "https://mobiblogtv.skin/";
const HOST_UPLOAD_STREAM = "https://xfast.sbs";
const TIME_LIVE_MESSAGE = 30 * 60 * 1000;

const CONSTANT_CLIPPHOT_NAME = "clipphot";
const CONSTANT_MOBIBLOG_NAME = "mobiblog";
const SOURCE_CLIPHOT = [CONSTANT_CLIPPHOT_NAME, CONSTANT_MOBIBLOG_NAME];

const CONFIG = {
  maxResults: 20,
  timeWaitSelection: 60000,
};

const listRequestInfo = new Map();

schedule.scheduleJob("*/5 * * * * *", () => {
  const currentTime = Date.now();
  for (const [msgId, data] of listRequestInfo.entries()) {
    if (currentTime - data.timestamp > CONFIG.timeWaitSelection) {
      listRequestInfo.delete(msgId);
    }
  }
});

// ===== Tra Cuu New Clipphot =====
export async function handleCheckNewClipPhot(pageNum, numLimit) {
  try {
    const browser = await launchBrowser();
    const page = await browser.newPage();
    await page.goto(`${URL_CLIP_PHOT_NET}page/${pageNum}`, { waitUntil: "domcontentloaded" });
    const results = await page.evaluate((numLimit) => {
      const posts = Array.from(document.querySelectorAll("#recent-content > div"));
      const result = posts.map((post) => ({
        id: post.id,
        link: post.querySelector(".thumbnail-link")?.href,
        thumbnail: post.querySelector("img")?.src,
        title: post.querySelector(".entry-title a")?.innerText,
        date: post.querySelector(".entry-date")?.innerText,
      }));
      return result.filter((e) => e.id.startsWith("post-")).slice(0, numLimit);
    }, numLimit);
    return results;
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh tìm ClipHot:", error.message);
    return [];
  } finally {
    await clearPage();
  }
}

export async function handleCheckFindClipPhot(keyword) {
  try {
    const url = `${URL_CLIP_PHOT_NET}?s=${keyword}`;
    const client = getClientAxios();
    const response = await client.get(url);
    const $ = cheerio.load(response.data);
    const videos = [];
    $("#recent-content > div[id^='post-']").each((_, el) => {
      const id = $(el).attr("id") || "";
      const aTag = $(el).find("a.thumbnail-link");
      const link = aTag.attr("href") || "";
      const imgTag = aTag.find("img");
      const thumbnail = imgTag.attr("src") || "";
      const title = $(el).find("h2.entry-title a").text().trim();
      const date = $(el).find(".entry-meta .entry-date").text().trim();
      videos.push({ id, title, link, thumbnail, date });
    });
    return videos;
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh tìm từ khóa ClipPhot:", error.message);
    return [];
  }
}

// ===== Tra Cuu MobiBlog=====
export async function handleCheckPageMobiBlog(page) {
  try {
    const url = `${URL_MOBIBLOB}page/${page}`;
    const client = getClientAxios();
    const response = await client.get(url);
    const $ = cheerio.load(response.data);
    const videos = [];
    $(".videos-list article").each((index, element) => {
      // const id = $(element).attr("data-video-uid");
      // const postId = $(element).attr("data-post-id");
      const id = $(element).attr("data-post-id") + "-mobiblob";
      const link = $(element).find("a").attr("href");
      const thumbnail = $(element).find("img").attr("data-src");
      const title = $(element).find("a").attr("title");
      videos.push({ id, title, link, thumbnail });
    });
    return videos;
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh tìm Trang MobiBlog:", error.message);
    return [];
  }
}

export async function handleCheckFindMobiBlog(keyword) {
  try {
    const url = `${URL_MOBIBLOB}?s=${keyword}`;
    const client = getClientAxios();
    const response = await client.get(url);
    const $ = cheerio.load(response.data);
    const videos = [];
    $("article").each((index, element) => {
      // const id = $(element).attr("data-video-uid");
      // const postId = $(element).attr("data-post-id");
      const id = $(element).attr("data-post-id") + "-mobiblob";
      const link = $(element).find("a").attr("href");
      const thumbnail = $(element).find("img").attr("data-src");
      const title = $(element).find("a").attr("title");
      videos.push({ id, title, link, thumbnail });
    });
    return videos;
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh tìm từ khóa MobiBlog:", error.message);
    return [];
  }
}

export async function handleCheckClipphotCommand(api, message, aliasCommand) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const keyword = content.replace(`${prefix}${aliasCommand}`, "").trim();
  let imagePath;

  if (!keyword) {
    const caption =
      `📖 *Hướng dẫn sử dụng lệnh ClipHot:*` +
      `\n\n🔹 *Cú pháp chung:*` +
      `\n   ${prefix}${aliasCommand} [nguồn cung cấp]` +
      `\n\n🔹 *Các nguồn hiện tại:*` +
      `\n   ${SOURCE_CLIPHOT.join(", ")}` +
      `\n\n🔹 *Hướng Dẫn Cụ Thể:*` +
      `\n   - *Tìm theo trang:*` +
      `\n     ${prefix}${aliasCommand} [nguồn cung cấp] page (số trang)` +
      `\n   - *Tìm theo từ khóa:*` +
      `\n     ${prefix}${aliasCommand} [nguồn cung cấp] find (keyword)`;
    await sendMessageComplete(api, message, caption, false, 180000);
    return;
  }

  const args = keyword.split(" ");
  const typeSource = args[0] || CONSTANT_CLIPPHOT_NAME;
  const limit = CONFIG.maxResults;
  let responseText,
    listMessage,
    quotedMsgId,
    dataClipHot = [],
    notifyNotFindVideo;

  try {
    if (typeSource === CONSTANT_CLIPPHOT_NAME) {
      const subCommand = args[1] || "page";
      if (subCommand === "page") {
        let page = parseInt(args[2]) || 1;
        if (page > 10) page = 10;
        dataClipHot = await handleCheckNewClipPhot(page, limit);
        responseText = `🔎 Danh sách clip của trang ${page}!`;
        notifyNotFindVideo = `Không tìm thấy clip nào trong trang ${page}`;
      } else if (subCommand === "find") {
        let keyword = args.slice(2).join(" ");
        dataClipHot = await handleCheckFindClipPhot(keyword);
        responseText = `🔎 Danh sách clip được tìm thấy với từ khóa: ${keyword}!`;
        notifyNotFindVideo = `Không tìm thấy clip nào với từ khóa: ${keyword}`;
      } else {
        let keyword = args.slice(1).join(" ");
        dataClipHot = await handleCheckFindClipPhot(keyword);
        responseText = `🔎 Danh sách clip được tìm thấy với từ khóa: ${keyword}!`;
        notifyNotFindVideo = `Không tìm thấy clip nào với từ khóa: ${keyword}`;
      }
      if (dataClipHot.length > 0) {
        const formattedDataClip = dataClipHot.map((result) => ({
          title: result.title,
          artistsNames: result.date,
          thumbnailM: result.thumbnail,
        }));

        imagePath = await createSearchResultImage(formattedDataClip);

        responseText =
          `🔎 Đây là danh sách clip gần đây được đăng tải...` + `\nVui lòng nhập số thứ tự clip bạn muốn xem!`;

        const object = {
          caption: responseText,
          imagePath: imagePath,
        };

        listMessage = await sendMessageCompleteRequest(api, message, object, CONFIG.timeWaitSelection);
        quotedMsgId = listMessage?.message?.msgId || listMessage?.attachment[0]?.msgId;
      } else {
        await sendMessageFailed(api, message, "Không tìm thấy clip nào hoặc lỗi API", false, 30000);
        return;
      }
    } else if (typeSource == CONSTANT_MOBIBLOG_NAME) {
      const subCommand = args[1] || "page";
      if (subCommand === "page") {
        let page = parseInt(args[2]) || 1;
        if (page > 5) page = 5;
        dataClipHot = await handleCheckPageMobiBlog(page);
        responseText = `🔎 Danh sách clip của trang ${page}!`;
        notifyNotFindVideo = `Không tìm thấy clip nào trong trang ${page}`;
      } else if (subCommand === "find") {
        let keyword = args.slice(2).join(" ");
        dataClipHot = await handleCheckFindMobiBlog(keyword);
        responseText = `🔎 Danh sách clip được tìm thấy với từ khóa: ${keyword}!`;
        notifyNotFindVideo = `Không tìm thấy clip nào với từ khóa: ${keyword}`;
      } else {
        let keyword = args.slice(1).join(" ");
        dataClipHot = await handleCheckFindMobiBlog(keyword);
        responseText = `🔎 Danh sách clip được tìm thấy với từ khóa: ${keyword}!`;
        notifyNotFindVideo = `Không tìm thấy clip nào với từ khóa: ${keyword}`;
      }
      if (dataClipHot.length > 0) {
        const formattedDataClip = dataClipHot.map((result) => ({
          title: result.title,
          artistsNames: "",
          thumbnailM: result.thumbnail,
        }));

        imagePath = await createSearchResultImage(formattedDataClip);

        const object = {
          caption: responseText,
          imagePath: imagePath,
        };

        listMessage = await sendMessageCompleteRequest(api, message, object, CONFIG.timeWaitSelection);
        quotedMsgId = listMessage?.message?.msgId || listMessage?.attachment[0]?.msgId;
      } else {
        await sendMessageFailed(api, message, notifyNotFindVideo, false, 30000);
        return;
      }
    } else {
      const caption =
        `📖 *Không tìm thấy nguồn bạn yêu cầu:*` +
        `\n\n🔹 *Cú pháp chung:*` +
        `\n   ${prefix}${aliasCommand} [nguồn cung cấp]` +
        `\n\n🔹 *Các nguồn hiện tại:*` +
        `\n   ${SOURCE_CLIPHOT.join(", ")}`;
      await sendMessageComplete(api, message, caption, false, 180000);
      return;
    }

    listRequestInfo.set(quotedMsgId.toString(), {
      userRequest: message.data.uidFrom,
      collection: dataClipHot,
      timestamp: Date.now(),
      type: typeSource,
    });
    setSelectionsMapData(message.data.uidFrom, {
      quotedMsgId: quotedMsgId.toString(),
      collection: dataClipHot,
      timestamp: Date.now(),
      platform: PLATFORM_CLIPPHOT,
      type: typeSource,
    });
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh gọi cliphot:", error);
    const caption = "Lỗi khi xử lý lệnh gọi cliphot, vui lòng thử lại sau!";
    await sendMessageFailed(api, message, caption, false, 30000);
  } finally {
    if (imagePath) await deleteFile(imagePath);
  }
}

export async function handleChooseClipphotReply(api, message) {
  const senderId = message.data.uidFrom;
  const idBot = api.getBotId();

  try {
    if (!message.data.quote || !message.data.quote.globalMsgId) return false;

    const quotedMsgId = message.data.quote.globalMsgId.toString();

    if (!listRequestInfo.has(quotedMsgId)) return false;

    const dataRequestClip = listRequestInfo.get(quotedMsgId);
    if (dataRequestClip.userRequest !== senderId) return false;

    const content = removeMention(message);
    const [index] = content.split(" ");
    const selectedIndex = parseInt(index) - 1;
    if (dataRequestClip.stage === 1) {
      if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= dataRequestClip.collection.length) {
        await sendMessageFailed(api, message, "Lựa chọn không hợp lệ. Vui lòng chọn lại.", false, 30000);
        return true;
      }
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
    listRequestInfo.delete(quotedMsgId);

    await processStageClipHot(api, message, dataRequestClip, selectedIndex);
    return true;
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh gọi cliphot:", error);
    const caption = "Lỗi khi xử lý lệnh gọi cliphot, vui lòng thử lại sau!";
    await sendMessageFailed(api, message, caption, false, 30000);
    return true;
  }
}

export async function processStageClipHot(api, message, dataRequest, selectedIndex) {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  let tempFilePath,
    urlVideo = [],
    cachedVideo;
  const clipSelection = dataRequest.collection[selectedIndex];
  let uniqueId = clipSelection.id;
  let quality = "default";
  let m3u8Link = null;

  try {
    cachedVideo = await getCachedMedia(PLATFORM_CLIPPHOT, uniqueId, quality, uniqueId);

    if (cachedVideo) {
      urlVideo = cachedVideo.fileUrl;
    } else {
      const obj = {
        caption: "Đang lấy dữ liệu clip, vui lòng chờ xíuuu...\n* Nhìn ngó xung quanh, coi chừng bị gank *",
      };
      await sendMessageCompleteRequest(api, message, obj, 10000);
      const client = getClientAxios();

      if (dataRequest.type === CONSTANT_MOBIBLOG_NAME) {
        const getEmbedData = await client.get(clipSelection.link);
        const $ = cheerio.load(getEmbedData.data);

        const scriptContent = $("script#play-script-js-extra").html();
        let src = null;

        if (scriptContent) {
          const match = scriptContent.match(/var iframeUrls = \["(.*?)"\]/);
          if (match && match[1]) {
            src = match[1].replace(/\\\//g, "/");
          }
        }

        if (src && src.includes("/play/?link=")) {
          const encodedLink = src.split("/play/?link=")[1];
          const decodedLink = decodeURIComponent(encodedLink);

          if (decodedLink) {
            const url = new URL(decodedLink);
            const { hostname, pathname } = url;
            const videoId = decodedLink.split("/").pop();
            m3u8Link = `https://${hostname}/storage/video/${videoId}/hls/tt.m3u8`;
          }
        }
      } else if (dataRequest.type === CONSTANT_CLIPPHOT_NAME) {
        const browser = await launchBrowser();
        const page = await browser.newPage();

        await page.goto(URL_CLIP_PHOT_NET, { waitUntil: "domcontentloaded" });

        const responseData = await page.evaluate(
          async (URL_CLIP_PHOT_NET, clipSelection) => {
            const formData = new URLSearchParams();
            formData.append("mv_id", clipSelection.id.replace("post-", ""));
            formData.append("action", "imdb_source");
            formData.append("cache", "true");

            const response = await fetch(`${URL_CLIP_PHOT_NET}wp-admin/admin-ajax.php`, {
              method: "POST",
              headers: {
                accept: "*/*",
                "accept-language": "vi-VN,vi;q=0.9",
                "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                origin: URL_CLIP_PHOT_NET,
                "x-requested-with": "XMLHttpRequest",
              },
              body: formData.toString(),
            });

            return await response.json();
          },
          URL_CLIP_PHOT_NET,
          clipSelection
        );
        const getEmbedData = await client.get(responseData.data);
        const $ = cheerio.load(getEmbedData.data);

        $("script").each((i, el) => {
          const scriptContent = $(el).html();

          if (scriptContent && scriptContent.includes("file_play")) {
            const match = scriptContent.match(/["'](\/media\/[^"']+\.m3u8)["']/);
            if (match && match[1]) {
              m3u8Link = match[1];
              m3u8Link = HOST_UPLOAD_STREAM + m3u8Link;
            }
          }
        });
      }

      if (m3u8Link) {
        tempFilePath = path.join(tempDir, `${clipSelection.id}-${randomIDTemp()}.mp4`);
        try {
          urlVideo = await downloadsCache.getDataDownload(api, message, m3u8Link, {
            type: "m3u8",
            path: tempFilePath,
          });
        } catch (error) {
          console.error(error);
          const stageString = error?.stage
            ? error.stage === "Download To Local"
              ? "tải dữ liệu"
              : "upload dữ liệu lên máy chủ Zalo"
            : "xử lý dữ liệu";
          const warningCaption = `Có lỗi xảy ra khi ${stageString}, vui lòng thử lại sau hoặc liên hệ Admin Bot Leader nếu lỗi chưa được khắc phục...`;
          await sendMessageFailed(api, message, warningCaption, true, 180000);
          return;
        }
        setCacheData(PLATFORM_CLIPPHOT, uniqueId, { fileUrl: urlVideo, title: uniqueId }, quality);
      } else {
        const caption = "Không tìm thấy dữ liệu tải clip mà bạn đã chọn, vui lòng thử lại sau..!";
        await sendMessageFailed(api, message, caption, false, 30000);
        return;
      }
    }

    const typeString = typeof urlVideo === "string";
    if (urlVideo && (typeString || urlVideo.length > 0)) {
      await sendMessageComplete(api, message, ``, false, TIME_LIVE_MESSAGE);
      if (typeString || urlVideo.length === 1) {
        const dataVideo = typeString ? null : urlVideo[0];
        await api.sendVideo({
          videoUrl: typeString ? urlVideo : dataVideo.fileUrl,
          threadId: message.threadId,
          threadType: message.type,
          thumbnail: clipSelection.thumbnail,
          metaData: dataVideo,
          message: {
            text:
              `[ ${senderName} ]\n` +
              `🎬 Clip: ${clipSelection.title}\n` +
              `🚨 Xem clip nhớ nhìn ngó xung quanh cẩn thận hết cứu...! 🚨`,
            mentions: [MessageMention(senderId, senderName.length, 2, false)],
          },
          ttl: TIME_LIVE_MESSAGE,
        });
      } else {
        for (let index = 0; index < urlVideo.length; index++) {
          const dataVideo = urlVideo[index];
          await api.sendVideo({
            videoUrl: dataVideo.fileUrl,
            threadId: message.threadId,
            threadType: message.type,
            thumbnail: clipSelection.thumbnail,
            metaData: dataVideo,
            message: {
              text:
                `[ ${senderName} ]\n` +
                `🎬 Clip: ${clipSelection.title} [Part ${index + 1}]\n` +
                `🚨 Xem clip nhớ nhìn ngó xung quanh cẩn thận hết cứu...! 🚨`,
              mentions: [MessageMention(senderId, senderName.length, 2, false)],
            },
            ttl: TIME_LIVE_MESSAGE,
          });
        }
      }
      await api.addReaction("UNDO", message);
      await api.addReaction("LIKE", message);
    } else {
      const warningCaption = "Không thể lấy dữ liệu của clip này, vui lòng thử lại sau!";
      await sendMessageFailed(api, message, warningCaption, false, 180000);
      await api.addReaction("UNDO", message);
      await api.addReaction("TIEUTAN", message);
      return;
    }
  } catch (error) {
    console.error("Lỗi khi lấy dữ liệu clip:", error);
    const warningCaption = "Không thể lấy dữ liệu của clip này, vui lòng liên hệ Bot Leader để kiểm tra lỗi!";
    await sendMessageFailed(api, message, warningCaption, false, 30000);
    await api.addReaction("UNDO", message);
    await api.addReaction("TIEUTAN", message);
  } finally {
    if (tempFilePath) await deleteFile(tempFilePath);
    await clearPage();
  }

  return true;
}
