import axios from "axios";
import * as cheerio from "cheerio";
import schedule from "node-schedule";
import toughCookie from "tough-cookie";
import path, { resolve } from "path";
import sharp from "sharp";
import { formatSelectionRanges, randomEmoji, randomIDTemp, removeMention } from "../../../utils/format-util.js";
import { getGlobalPrefix } from "../../service.js";
import {
  sendMessageComplete,
  sendMessageCompleteRequest,
  sendMessageFailed,
} from "../../chat-zalo/chat-style/chat-style.js";
import { setSelectionsMapData } from "../index.js";
import {
  checkExstentionFileRemote,
  deleteFile,
  getLocalImageInfo,
  uploadTempFile,
  writeFilePromise,
} from "../../../utils/util.js";
import { tempDir } from "../../../utils/io-json.js";
import { getClientAxios } from "../../utilities/browser-launch.js";
import { createSearchResultImage } from "../../../utils/canvas/search-canvas.js";
import { fileTypeFromBuffer } from "file-type";
import { sendReactionWaitingCountdown } from "../../../commands/manager-command/check-countdown.js";
import { findRecentMessages } from "../../../commands/bot-manager/recent-message.js";

class TruyenHentaiScraper {
  constructor(ctx) {
    this.ctx = ctx;
    this.baseUrl = "https://hentaivn.cx/";
    this.headers = () => {
      return {
        accept: "text/html, */*; q=0.01",
        "accept-language": "vi,vi-VN;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5,zh-TW;q=0.4,zh-CN;q=0.3,zh;q=0.2",
        priority: "u=1, i",
        "sec-ch-ua": '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
        "x-requested-with": "XMLHttpRequest",
        cookie: this.ctx.cookie.getCookieStringSync(this.baseUrl),
      };
    };
    this.axios = getClientAxios();
    this.request = (url, options = {}) => {
      return this.axios.get(url, {
        options,
        headers: this.headers(),
      });
    };
  }

  async search(keyword) {
    const response = await this.axios.get(`${this.baseUrl}`, {
      params: { s: keyword, post_type: "wp-manga" },
      headers: this.headers,
    });

    const setCookies = response.headers["set-cookie"];
    if (setCookies && setCookies.length) {
      setCookies.forEach((cookieStr) => {
        this.ctx.cookie.setCookieSync(cookieStr, this.baseUrl);
      });
    }

    const $ = cheerio.load(response.data);
    const results = [];
    $(".row.c-tabs-item__content").each((_, el) => {
      const $el = $(el);
      const a = $el.find(".tab-thumb a");
      const url = a.attr("href");
      const title = a.attr("title") || $el.find(".post-title a").text().trim();
      const img = a.find("img");
      const thumbnail = img.attr("data-src");
      const alternative = $el.find(".post-content_item.mg_alternative .summary-content").text().trim();
      const authors = $el
        .find(".post-content_item.mg_author .summary-content a")
        .map((i, e) => $(e).text().trim())
        .get();
      const genres = $el
        .find(".post-content_item.mg_genres .summary-content a")
        .map((i, e) => $(e).text().trim())
        .get();
      const status = $el.find(".post-content_item.mg_status .summary-content").text().trim();
      const latestChapter = $el.find(".meta-item.latest-chap .chapter a").text().trim();
      const postDate = $el.find(".meta-item.post-on .font-meta").text().trim();
      const rating = $el.find(".meta-item.rating .score").text().trim();
      const genresFilter = ["Hentai Không che", "Truyện Màu", "18+", "Lãng Mạn", "Oneshot"];
      const sortedGenres = [
        ...genres.filter((g) => genresFilter.includes(g)),
        ...genres.filter((g) => !genresFilter.includes(g)),
      ];
      const caption = (!authors || authors.length === 0 ? "Ẩn" : authors.join(", ")) + " - " + sortedGenres.join(", ");
      results.push({
        title,
        url,
        thumbnail,
        alternative,
        authors: caption,
        genres,
        status,
        chapter: latestChapter,
        postDate,
        rating,
      });
    });
    return results;
  }

  async getChapterList(slugUrl) {
    this.headers.cookie = this.ctx.cookie.getCookieStringSync(this.baseUrl);
    const detailRes = await this.axios.get(slugUrl, { headers: this.headers() });
    const $detail = cheerio.load(detailRes.data);

    const chapters = [];
    $detail("ul.main.version-chap.no-volumn li.wp-manga-chapter").each((_, el) => {
      const $el = $detail(el);
      const a = $el.find("a");
      const href = a.attr("href");
      const chapterText = a.text().trim();
      const chapter_num = chapterText;
      const release_date = $el.find(".chapter-release-date i").text().trim();
      chapters.push({
        chapter_num,
        url: href,
        release_date,
      });
    });

    return chapters; //.sort((a, b) => a.chapter_num - b.chapter_num);
  }

  async getChapterImages(linkPage) {
    this.headers.cookie = this.ctx.cookie.getCookieStringSync(this.baseUrl);
    const responseSelected = await this.axios.get(linkPage, {
      headers: {
        "Upgrade-Insecure-Requests": "1",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
        "sec-ch-ua": '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
      },
    });

    const $chapter = cheerio.load(responseSelected.data);
    // Chỉ lấy thẻ .reading-content đầu tiên và toàn bộ ảnh .webp trong đó
    const imageLinks = [];
    const readingContent = $chapter(".reading-content").first();
    readingContent.find("img.wp-manga-chapter-img").each((_, el) => {
      let url = $chapter(el).attr("src") || "";
      url = url.trim();
      if (url.endsWith(".webp") || url.endsWith(".jpg") || url.endsWith(".jpeg") || url.endsWith(".png")) {
        imageLinks.push(url);
      }
    });
    return imageLinks;
  }

  async downloadImages(imageLinks, dir = tempDir) {
    const downloadPromises = imageLinks.map(async (imageUrl, idx) => {
      try {
        const imagePath = path.join(dir, `image_${idx}_${randomIDTemp()}.jpg`);
        const imageResponse = await this.axios.get(imageUrl, {
          responseType: "arraybuffer",
          headers: this.headers(),
        });

        const buffer = Buffer.from(imageResponse.data);
        await sharp(buffer).jpeg().toFile(imagePath);

        return imagePath;
      } catch (error) {
        console.error(`Lỗi khi tải link: ${imageUrl}`, error);
        return null;
      }
    });

    return await Promise.all(downloadPromises);
  }
}

const TIME_TO_LIVE = 86400000;

export const createContext = () => ({
  cookie: new toughCookie.CookieJar(),
});

const ctx = createContext();
const scraper = new TruyenHentaiScraper(ctx);

export const PLATFORM_TRUYEN_HENTAI = "truyen_hentai";

const CONFIG = {
  maxResults: 20,
  timeWaitSelection: 60000,
};

const listRequestHentai = new Map();
const RELATED_EXPIRE_TIME = 300000;

schedule.scheduleJob("*/5 * * * * *", () => {
  const currentTime = Date.now();
  for (const [msgId, data] of listRequestHentai.entries()) {
    if (currentTime - data.timestamp > CONFIG.timeWaitSelection) {
      listRequestHentai.delete(msgId);
    }
  }
  for (const [msgId, data] of chapterComicsMap.entries()) {
    if (currentTime - data.timestamp > RELATED_EXPIRE_TIME) {
      chapterComicsMap.delete(msgId);
    }
  }
});

export async function handleTruyenHentaiCommand(api, message, aliasCommand) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  let keyword = content.replace(`${prefix}${aliasCommand}`, "").trim();

  if (!keyword) {
    const capt =
      "Vui lòng nhập từ khóa cần tìm kiếm...\n" + `Ví dụ: ${prefix}${aliasCommand} Seikatsu mo Teiso Kannen mo`;
    await sendMessageComplete(api, message, capt, false, 600000);
    return;
  }

  let imagePath;
  try {
    let dataFindComic = await scraper.search(keyword);
    if (dataFindComic && dataFindComic.length > 0) {
      // if (dataFindComic.length === 1) {
      //   const data = {
      //     userRequest: message.data.uidFrom,
      //     collection: dataFindComic,
      //     timestamp: Date.now(),
      //     stage: 1,
      //   };
      //   return await processTruyenHentaiStageReply(api, message, data, 0);
      // }

      dataFindComic = dataFindComic.slice(0, CONFIG.maxResults);

      const formattedDataFilm = dataFindComic.map((result) => ({
        title: result.title,
        artistsNames: result.authors,
        thumbnailM: result.thumbnail,
      }));

      imagePath = await createSearchResultImage(formattedDataFilm);

      let responseText = `🔎 Kết quả tìm kiếm truyện Hentai:\n`;
      responseText += `Hãy trả lời tin nhắn này với số thứ tự truyện bạn muốn xem!`;

      const object = {
        caption: responseText,
        imagePath: imagePath,
      };

      const listMessage = await sendMessageCompleteRequest(api, message, object, CONFIG.timeWaitSelection);
      const quotedMsgId = listMessage?.message?.msgId || listMessage?.attachment[0]?.msgId;

      listRequestHentai.set(quotedMsgId.toString(), {
        userRequest: message.data.uidFrom,
        collection: dataFindComic,
        timestamp: Date.now(),
        stage: 1,
      });
      setSelectionsMapData(message.data.uidFrom, {
        quotedMsgId: quotedMsgId.toString(),
        collection: dataFindComic,
        timestamp: Date.now(),
        platform: PLATFORM_TRUYEN_HENTAI,
        stage: 1,
      });
    } else {
      await sendMessageFailed(api, message, "Không tìm thấy truyện nào cho từ khóa: " + keyword, false, 30000);
      return;
    }
  } catch (error) {
    let captErr = "Lỗi khi xử lý lệnh xem truyện tại Hentai, vui lòng liên hệ Admin để kiểm tra lỗi";
    console.error("Lỗi khi xử lý lệnh xem Hentai:", error.message);
    await sendMessageFailed(api, message, captErr, false, 30000);
  } finally {
    if (imagePath) await deleteFile(imagePath);
  }
}

export async function handleTruyenHentaiReply(api, message) {
  const senderId = message.data.uidFrom;
  const idBot = api.getBotId();

  try {
    if (!message.data.quote || !message.data.quote.globalMsgId) return false;

    const quotedMsgId = message.data.quote.globalMsgId.toString();

    if (!listRequestHentai.has(quotedMsgId)) return false;

    const dataComics = listRequestHentai.get(quotedMsgId);
    if (dataComics.userRequest !== senderId) return false;

    const content = removeMention(message);
    const [index] = content.split(" ");
    const selectedIndex = parseInt(index) - 1;
    if (dataComics.stage === 1) {
      if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= dataComics.collection.length) {
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
    listRequestHentai.delete(quotedMsgId);

    await processTruyenHentaiStageReply(api, message, dataComics, selectedIndex);
    return true;
  } catch (error) {
    const captErr = "Lỗi khi xử lý lệnh xem truyện tại Hentai, vui lòng liên hệ Admin để kiểm tra lỗi";
    console.error("Lỗi khi xử lý phản hồi lệnh xem truyện tại Hentai:", error.message);
    await sendMessageFailed(api, message, captErr, false, 30000);
    return true;
  }
}

export async function processTruyenHentaiStageReply(api, message, dataRequest, selectedIndex) {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;

  if (dataRequest.stage === 1) {
    const selectedComic = dataRequest.collection[selectedIndex];
    const thumbnailPath = path.resolve(tempDir, `${randomIDTemp()}.${"jpg"}`);

    try {
      const response = await scraper.axios.get(selectedComic.thumbnail, {
        responseType: "arraybuffer",
        headers: scraper.headers(),
      });

      const bufferCopy = Buffer.from(response.data);
      const typeImage = await fileTypeFromBuffer(bufferCopy);
      const buffer = Buffer.from(response.data);
      if (typeImage.ext === "webp") {
        await sharp(buffer).jpeg().toFile(thumbnailPath);
      } else {
        await writeFilePromise(thumbnailPath, buffer);
      }

      let responseMessage;
      let collection = {},
        keyMovieData = [];

      const chapterList = await scraper.getChapterList(selectedComic.url);

      chapterList.forEach((item) => {
        if (!keyMovieData.includes(item.chapter_num)) keyMovieData.push(item.chapter_num);
        collection[item.chapter_num] = {
          ...item,
        };
      });

      if (keyMovieData.length === 0) {
        const warningCaption = "Không tìm thấy chapter nào cho truyện này.\nVui lòng thử lại với truyện khác!";
        await sendMessageFailed(api, message, warningCaption, false, 30000);
        return;
      }

      if (keyMovieData.length === 1) {
        const data = {
          userRequest: message.data.uidFrom,
          selectedComic: selectedComic,
          collection: collection,
          timestamp: Date.now(),
          stage: 2,
        };
        return await processTruyenHentaiStageReply(api, message, data, keyMovieData[0]);
      }

      let episodeResponseText = `🎬 Bạn đã chọn truyện: ${selectedComic.title}\n`;
      episodeResponseText += `📺 Chapter: ${selectedComic.chapter}\n\n`;
      episodeResponseText += `Vui lòng nhập chapter mà bạn muốn xem!\n`;
      episodeResponseText += `[${formatSelectionRanges(keyMovieData)}]`;
      responseMessage = await sendMessageCompleteRequest(
        api,
        message,
        { caption: episodeResponseText, imagePath: thumbnailPath },
        CONFIG.timeWaitSelection
      );

      if (responseMessage) {
        const quotedMsgId = responseMessage?.message?.msgId || responseMessage?.attachment[0]?.msgId;
        listRequestHentai.set(quotedMsgId.toString(), {
          userRequest: message.data.uidFrom,
          selectedComic: selectedComic,
          collection,
          timestamp: Date.now(),
          stage: 2,
        });
        setSelectionsMapData(message.data.uidFrom, {
          quotedMsgId: quotedMsgId.toString(),
          collection,
          selectedComic: selectedComic,
          timestamp: Date.now(),
          platform: PLATFORM_TRUYEN_HENTAI,
          stage: 2,
        });
      }
      await api.addReaction("UNDO", message);
      await api.addReaction("LIKE", message);
    } catch (error) {
      console.error("Lỗi khi xử lý trạng thái phản hồi 1 của Hentai:", error);
      await api.addReaction("UNDO", message);
      await api.addReaction("TIEUTAN", message);
    } finally {
      await deleteFile(thumbnailPath);
    }
  } else if (dataRequest.stage === 2) {
    const selectedComic = dataRequest.selectedComic;
    let slugComic, selectedSlug, imageUrls, tempFilePaths;
    try {
      slugComic = removeMention(message);
      selectedSlug = dataRequest.collection[slugComic] || dataRequest.collection[selectedIndex];
      if (!selectedSlug) {
        const warningCaption = "Số chapter bạn chọn không có trong danh sách.\nVui lòng thử lại với chapter khác!";
        await sendMessageFailed(api, message, warningCaption, false, 30000);
        return;
      }

      const imageLinks = await scraper.getChapterImages(selectedSlug.url);
      tempFilePaths = await scraper.downloadImages(imageLinks);
      tempFilePaths = tempFilePaths.filter((img) => img !== null);

      const imageProcessingPromises = tempFilePaths.map(async (item) => {
        try {
          const tempFile = await uploadTempFile(item, 2, { api, message });
          const dataImage = await getLocalImageInfo(item);
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
      await mangaQueue.addToQueue({
        api,
        message,
        comic: selectedComic,
        chapter: selectedSlug,
        imageUrls,
        tempFilePaths,
        senderId,
        chapterOfComic: dataRequest.collection,
        TIME_TO_LIVE,
        PLATFORM_TRUYEN_HENTAI,
      });
      await api.addReaction("UNDO", message);
      await api.addReaction("LIKE", message);
    } catch (error) {
      const captErr = "Lỗi khi xử lý lệnh xem truyện tranh từ Hentai, vui lòng liên hệ Admin để kiểm tra lỗi";
      console.error("Lỗi khi xử lý trạng thái phản hồi 2 của truyện từ Hentai: ", error);
      await sendMessageFailed(api, message, captErr, false, 30000);
      await api.addReaction("UNDO", message);
      await api.addReaction("TIEUTAN", message);
    } finally {
      if (tempFilePaths) {
        for (const item of tempFilePaths) {
          await deleteFile(item);
        }
      }
    }
  }
  return true;
}

export async function handleNextChapterTruyenHentaiReaction(api, reaction) {
  let tempFilePaths = null,
    imageUrls;
  try {
    const msgId = reaction.data?.content?.rMsg[0]?.gMsgID?.toString() || "";
    if (!msgId) return false;
    if (!chapterComicsMap.has(msgId)) return false;

    const relatedData = chapterComicsMap.get(msgId);
    const senderId = reaction.data.uidFrom;
    if (senderId !== relatedData.senderId) return false;

    const rType = reaction.data.content.rType;
    if (rType !== 5) return false;
    chapterComicsMap.delete(msgId);

    const { comic, chapterOfComic, nowChapter, message, senderName } = relatedData;

    function findNextChapter(data, nowChapter) {
      const next = Object.values(data)
        .filter((item) => item.chapter_num > nowChapter.chapter_num)
        .sort((a, b) => a.chapter_num - b.chapter_num)[0];
      return next || null;
    }

    const nextChapter = findNextChapter(chapterOfComic, nowChapter);

    if (nextChapter) {
      const notify = `Tiến hành lấy chapter tiếp theo, vui lòng chờ xíu...!`;
      await sendMessageCompleteRequest(api, message, { caption: notify }, 15000);

      const imageLinks = await scraper.getChapterImages(comic.comicInfo, nextChapter);
      tempFilePaths = await scraper.downloadImages(imageLinks);
      tempFilePaths = tempFilePaths.filter((img) => img !== null);

      const imageProcessingPromises = tempFilePaths.map(async (item) => {
        try {
          const tempFile = await uploadTempFile(item, 2, { api, message });
          const dataImage = await getLocalImageInfo(item);
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

      await mangaQueue.addToQueue({
        api,
        message,
        comic,
        chapter: nextChapter,
        imageUrls,
        tempFilePaths,
        senderId,
        chapterOfComic,
        TIME_TO_LIVE,
        PLATFORM_TRUYEN_HENTAI,
      });
    } else {
      const caption = `Đây đã là chapter mới nhất hiện tại...!`;
      await sendMessageCompleteRequest(api, message, { caption }, 300000);
    }

    return true;
  } catch (error) {
    console.error("Lỗi khi xử lý reaction Comics:", error);
    return false;
  } finally {
    if (tempFilePaths) {
      for (const item of tempFilePaths) {
        await deleteFile(item);
      }
    }
  }
}

// ==========================================================
class MangaQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
  }

  async addToQueue(task) {
    this.queue.push(task);
    if (!this.isProcessing) {
      await this.processQueue();
    }
  }

  async processQueue() {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const task = this.queue.shift();

    try {
      await this.sendMangaChapter(task);
    } catch (error) {
      console.error("Error processing manga task:", error);
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
    await this.processQueue();
  }

  async sendMangaChapter({
    api,
    message,
    comic,
    chapter,
    imageUrls,
    tempFilePaths,
    senderId,
    chapterOfComic,
    TIME_TO_LIVE,
    PLATFORM_TRUYEN_HENTAI,
  }) {
    try {
      const caption =
        `Comic: ${comic.title}` +
        `\nChapter: ${chapter.chapter_num}` +
        `\n${randomEmoji()} Chúc bạn đọc truyện vui vẻ! ${randomEmoji()}`;

      await sendMessageComplete(api, message, caption, false, TIME_TO_LIVE);

      const groupLayout = {
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

      if (chapterOfComic && Object.keys(chapterOfComic).length > 1) {
        const relatedChapter =
          `Sau 15 giây, trong 10 phút tiếp theo:` + `\nThả tim tin nhắn này để next chapter tiếp theo nhé!`;

        const sentMessage = await sendMessageComplete(api, message, relatedChapter, false, 600000);

        const fnAfterCountdown = () => {
          chapterComicsMap.set(sentMessage.message.msgId.toString(), {
            timestamp: Date.now(),
            threadId: message.threadId,
            type: message.type,
            message,
            senderId,
            comic,
            chapterOfComic,
            nowChapter: chapter,
          });
        };

        let msgSent = await findRecentMessages(api, message, sentMessage.message.msgId.toString());
        msgSent = {
          ...message,
          data: { ...msgSent },
        };

        await sendReactionWaitingCountdown(api, msgSent, 15, PLATFORM_TRUYEN_HENTAI, fnAfterCountdown);
      }
    } finally {
      if (tempFilePaths) {
        for (const item of tempFilePaths) {
          await deleteFile(item);
        }
      }
    }
  }
}

export const mangaQueue = new MangaQueue();
export const chapterComicsMap = new Map();