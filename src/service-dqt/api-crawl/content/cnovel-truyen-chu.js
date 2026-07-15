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
  sendMessageInChunks,
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
import { getMessageByThreadAndMsgId } from "../../../utils/message-cache.js";
import { sendReactionWaitingCountdown } from "../../../commands/manager-command/check-countdown.js";
import { capitalizeWords } from "../../../utils/format-text.js";

class CnovelClient {
  constructor() {
    this.baseUrl = "https://cnovel.net/api";
    this.headers = {
      accept: "*/*",
      "accept-language": "vi,vi-VN;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5,zh-TW;q=0.4,zh-CN;q=0.3,zh;q=0.2",
      Referer: "https://cnovel.net/",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    };
    this.axios = getClientAxios();
  }

  async search(keyword, limit = 10) {
    const response = await this.axios.get(`${this.baseUrl}/search`, {
      params: { file: "text", type: "album", limit, string: keyword },
      headers: this.headers,
    });
    return response.data.map((item) => {
      const parsedInfo = JSON.parse(item.info);
      return {
        ...item,
        info: parsedInfo,
        thumbnail: "https://cnovel.net/assets/tmp/album/" + parsedInfo.avatar,
        title: capitalizeWords(parsedInfo.name),
      };
    });
  }

  async getChapterList(albumId, chapterCount) {
    const response = await this.axios.get(`${this.baseUrl}/chapter_list`, {
      params: { album: albumId, page: "1", limit: chapterCount, v: "4v20" },
      headers: this.headers,
    });
    return response.data.map((item) => ({
      ...item,
      info: JSON.parse(item.info),
    }));
  }

  async getChapterText(chapterId) {
    const response = await this.axios.get(`${this.baseUrl}/chapter_image`, {
      params: { chapter: chapterId },
      headers: this.headers,
    });
    const htmlText = response.data.text;
    const $ = cheerio.load(htmlText);
    return $("p")
      .map((_, el) => $(el).text())
      .get()
      .join("\n");
  }
}

const TIME_TO_LIVE = 86400000;

const cnClient = new CnovelClient();

export const PLATFORM_CNOVEL = "cnovelTruyenChu";

const CONFIG = {
  maxResults: 10,
  timeWaitSelection: 60000,
};

const listRequestCNovelTruyenChu = new Map();
const RELATED_EXPIRE_TIME = 300000;

schedule.scheduleJob("*/5 * * * * *", () => {
  const currentTime = Date.now();
  for (const [msgId, data] of listRequestCNovelTruyenChu.entries()) {
    if (currentTime - data.timestamp > CONFIG.timeWaitSelection) {
      listRequestCNovelTruyenChu.delete(msgId);
    }
  }
  for (const [msgId, data] of chapterComicsMap.entries()) {
    if (currentTime - data.timestamp > RELATED_EXPIRE_TIME) {
      chapterComicsMap.delete(msgId);
    }
  }
});

export async function handleCNovelTruyenChuCommand(api, message, aliasCommand) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  let keyword = content.replace(`${prefix}${aliasCommand}`, "").trim();

  if (!keyword) {
    const capt = "Vui lòng nhập từ khóa cần tìm kiếm...\n" + `Ví dụ: ${prefix}${aliasCommand} Tiên Nghịch`;
    await sendMessageComplete(api, message, capt, false, 600000);
    return;
  }

  let imagePath;
  try {
    let dataFindComic = await cnClient.search(keyword);
    if (dataFindComic && dataFindComic.length > 0) {
      if (dataFindComic.length === 1) {
        const data = {
          userRequest: message.data.uidFrom,
          collection: dataFindComic,
          timestamp: Date.now(),
          stage: 1,
        };
        return await processCNovelTruyenChuStageReply(api, message, data, 0);
      }

      dataFindComic = dataFindComic.slice(0, CONFIG.maxResults);

      const formattedDataFilm = dataFindComic.map((result) => ({
        title: result.title,
        artistsNames: `Total Chapter: ${result.info.chapter.last}`,
        thumbnailM: result.thumbnail,
        headers: cnClient.headers,
      }));

      imagePath = await createSearchResultImage(formattedDataFilm);

      let responseText = `🔎 Kết quả tìm kiếm truyện chữ:\n`;
      responseText += `Hãy trả lời tin nhắn này với số thứ tự truyện bạn muốn xem!`;

      const object = {
        caption: responseText,
        imagePath: imagePath,
      };

      const listMessage = await sendMessageCompleteRequest(api, message, object, CONFIG.timeWaitSelection);
      const quotedMsgId = listMessage?.message?.msgId || listMessage?.attachment[0]?.msgId;

      listRequestCNovelTruyenChu.set(quotedMsgId.toString(), {
        userRequest: message.data.uidFrom,
        collection: dataFindComic,
        timestamp: Date.now(),
        stage: 1,
      });
      setSelectionsMapData(message.data.uidFrom, {
        quotedMsgId: quotedMsgId.toString(),
        collection: dataFindComic,
        timestamp: Date.now(),
        platform: PLATFORM_CNOVEL,
        stage: 1,
      });
    } else {
      await sendMessageFailed(api, message, "Không tìm thấy truyện nào cho từ khóa: " + keyword, false, 30000);
      return;
    }
  } catch (error) {
    let captErr = "Lỗi khi xử lý lệnh xem truyện chữ, vui lòng liên hệ Admin để kiểm tra lỗi";
    console.error("Lỗi khi xử lý lệnh xem truyện chữ:", error.message);
    await sendMessageFailed(api, message, captErr, false, 30000);
  } finally {
    if (imagePath) await deleteFile(imagePath);
  }
}

export async function handleCNovelTruyenChuReply(api, message) {
  const senderId = message.data.uidFrom;
  const idBot = api.getBotId();

  try {
    if (!message.data.quote || !message.data.quote.globalMsgId) return false;

    const quotedMsgId = message.data.quote.globalMsgId.toString();

    if (!listRequestCNovelTruyenChu.has(quotedMsgId)) return false;

    const dataComics = listRequestCNovelTruyenChu.get(quotedMsgId);
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
    listRequestCNovelTruyenChu.delete(quotedMsgId);

    await processCNovelTruyenChuStageReply(api, message, dataComics, selectedIndex);
    return true;
  } catch (error) {
    const captErr = "Lỗi khi xử lý lấy truyện chữ, vui lòng liên hệ Admin để kiểm tra lỗi";
    console.error("Lỗi khi xử lý phản hồi lệnh lấy truyện chữ:", error.message);
    await sendMessageFailed(api, message, captErr, false, 30000);
    return true;
  }
}

export async function processCNovelTruyenChuStageReply(api, message, dataRequest, selectedIndex) {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;

  if (dataRequest.stage === 1) {
    const selectedComic = dataRequest.collection[selectedIndex];
    const thumbnailPath = path.resolve(tempDir, `${randomIDTemp()}.${"jpg"}`);

    try {
      const response = await cnClient.axios.get(selectedComic.thumbnail, {
        responseType: "arraybuffer",
        headers: cnClient.headers,
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

      const chapter = selectedComic.info.chapter.last;
      const chapterList = await cnClient.getChapterList(selectedComic.id_album, chapter);

      chapterList.forEach((item) => {
        if (!keyMovieData.includes(item.info.num)) keyMovieData.push(item.info.num);
        collection[item.info.num] = {
          ...item,
        };
      });

      let episodeResponseText = `🎬 Bạn đã chọn truyện: ${selectedComic.title}\n`;
      episodeResponseText += `📺 Chapter: ${chapter}\n\n`;
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
        listRequestCNovelTruyenChu.set(quotedMsgId.toString(), {
          userRequest: message.data.uidFrom,
          selectedComic: selectedComic,
          collection: collection,
          timestamp: Date.now(),
          stage: 2,
        });
        setSelectionsMapData(message.data.uidFrom, {
          quotedMsgId: quotedMsgId.toString(),
          collection: collection,
          selectedComic: selectedComic,
          timestamp: Date.now(),
          platform: PLATFORM_CNOVEL,
          stage: 2,
        });
      }
      await api.addReaction("UNDO", message);
      await api.addReaction("LIKE", message);
    } catch (error) {
      console.error("Lỗi khi xử lý trạng thái phản hồi 1 của Cnovel:", error);
      await api.addReaction("UNDO", message);
      await api.addReaction("TIEUTAN", message);
    } finally {
      await deleteFile(thumbnailPath);
    }
  } else if (dataRequest.stage === 2) {
    const selectedComic = dataRequest.selectedComic;
    let slugComic, selectedSlug;
    try {
      slugComic = removeMention(message);
      selectedSlug = dataRequest.collection[slugComic];
      if (!selectedSlug) {
        const warningCaption = "Số chapter bạn chọn không có trong danh sách.\nVui lòng thử lại với chapter khác!";
        await sendMessageFailed(api, message, warningCaption, false, 30000);
        return;
      }
      const contentChapter = await cnClient.getChapterText(selectedSlug.id_chapter);
      await mangaQueue.addToQueue({
        api,
        message,
        comic: selectedComic,
        chapter: selectedSlug,
        contentChapter,
        senderId,
        chapterOfComic: dataRequest.collection,
        TIME_TO_LIVE,
        PLATFORM_CNOVEL,
      });
      await api.addReaction("UNDO", message);
      await api.addReaction("LIKE", message);
    } catch (error) {
      const captErr = "Lỗi khi xử lý lệnh xem truyện tranh, vui lòng liên hệ Admin để kiểm tra lỗi";
      console.error("Lỗi khi xử lý trạng thái phản hồi 2 của truyện chữ: ", error);
      await sendMessageFailed(api, message, captErr, false, 30000);
      await api.addReaction("UNDO", message);
      await api.addReaction("TIEUTAN", message);
    }
  }
  return true;
}

export async function handleNextChapterCNovelReaction(api, reaction) {
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
        .filter((item) => item.info.num > nowChapter.info.num)
        .sort((a, b) => a.info.num - b.info.num)[0];
      return next || null;
    }

    const nextChapter = findNextChapter(chapterOfComic, nowChapter);

    if (nextChapter) {
      const notify = `Tiến hành lấy chapter tiếp theo, vui lòng chờ xíu...!`;
      await sendMessageCompleteRequest(api, message, { caption: notify }, 10000);

      const contentChapter = await cnClient.getChapterText(nextChapter.id_chapter);
      await mangaQueue.addToQueue({
        api,
        message,
        comic,
        chapter: nextChapter,
        contentChapter,
        senderId,
        chapterOfComic,
        TIME_TO_LIVE,
        PLATFORM_CNOVEL,
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
    contentChapter,
    senderId,
    chapterOfComic,
    TIME_TO_LIVE,
    PLATFORM_CNOVEL,
  }) {
    try {
      const caption =
        `Comic: ${comic.title}` +
        `\nChapter: ${chapter.info.num}` +
        `\n${randomEmoji()} Chúc bạn đọc truyện vui vẻ! ${randomEmoji()}`;

      await sendMessageComplete(api, message, caption, false, TIME_TO_LIVE);
      await sendMessageInChunks(api, message, contentChapter, TIME_TO_LIVE);

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

      await new Promise((resolve) => setTimeout(resolve, 3000));
      const msgGroupCache = await getMessageByThreadAndMsgId(
        api.getBotId(),
        message.threadId,
        sentMessage.message.msgId.toString()
      );
      msgGroupCache.data = { ...msgGroupCache };

      await sendReactionWaitingCountdown(api, msgGroupCache, 12, PLATFORM_CNOVEL, fnAfterCountdown);
    } finally {
    }
  }
}

export const mangaQueue = new MangaQueue();
export const chapterComicsMap = new Map();
