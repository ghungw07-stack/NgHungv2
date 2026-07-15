import * as cheerio from "cheerio";
import schedule from "node-schedule";
import path from "path";
import { formatSelectionRanges, randomEmoji, randomIDTemp, removeMention } from "../../../utils/format-util.js";
import { getGlobalPrefix } from "../../service.js";
import {
  sendMessageComplete,
  sendMessageCompleteRequest,
  sendMessageFailed,
} from "../../chat-zalo/chat-style/chat-style.js";
import { setSelectionsMapData } from "../index.js";
import { checkExstentionFileRemote, deleteFile, writeFilePromise } from "../../../utils/util.js";
import { tempDir } from "../../../utils/io-json.js";
import sharp from "sharp";
import { MessageMention } from "../../../api-zalo/index.js";
import { getCachedMedia, setCacheData } from "../../../utils/link-platform-cache.js";
import { getClientAxios } from "../../utilities/browser-launch.js";
import { createSearchResultImage } from "../../../utils/canvas/search-canvas.js";
import { downloadsCache } from "../../../utils/download-upload-cache.js";
import { getLinkFileM3U8 } from "../../../utils/m3u8/index.js";

const API_SEARCH_PHIM_URL = "https://phimapi.com/v1/api/tim-kiem";
const API_PHIM = "https://phimapi.com/phim";
const API_SEARCH_DULIEUPHIM = "https://api.dulieuphim.ink/phim-data/v1?name=";
const API_DULIEUPHIM = "https://api.dulieuphim.ink/phim-chi-tiet/v2?slug=";
const TIME_LIVE_MESSAGE = 86400000;

export const PLATFORM_KHOPHIM = "khophim";

const CONFIG = {
  maxResults: 20,
  timeWaitSelection: 60000,
};

const listRequestKhoPhim = new Map();

schedule.scheduleJob("*/5 * * * * *", () => {
  const currentTime = Date.now();
  for (const [msgId, data] of listRequestKhoPhim.entries()) {
    if (currentTime - data.timestamp > CONFIG.timeWaitSelection) {
      listRequestKhoPhim.delete(msgId);
    }
  }
});

export async function findFilmFromKKPHIM(keyword) {
  try {
    const params = {
      keyword,
      page: 1,
      sort_field: "modified.time",
    };

    const client = getClientAxios();
    const response = await client.get(API_SEARCH_PHIM_URL, { params });
    const { data } = response;

    if (data && data.data) {
      const result = data.data.items.map((item) => ({
        id: item._id,
        slug: API_PHIM + "/" + item.slug,
        title: item.name,
        originName: item.origin_name,
        thumbnail: data.data.APP_DOMAIN_CDN_IMAGE + "/" + item.poster_url,
        episode: item.episode_current + `${item.quality ? ` [${item.quality}]` : ""}`,
        typeSub: item.lang || null,
      }));
      return result;
    } else {
      return [];
    }
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh tìm phim Kho Phim: ", error);
    return [];
  }
}

export async function findFilmFromDULIEUPHIM(keyword) {
  try {
    const params = {
      name: keyword,
    };

    const client = getClientAxios();

    async function getDetailPhim(linkFilm) {
      const response = await client.get(linkFilm);
      return response.data;
    }

    const response = await client.get(API_SEARCH_DULIEUPHIM, { params });
    const { data } = response;

    if (data && data.data) {
      const detailPromises = data.data.map(async (item) => {
        const itemDetail = await getDetailPhim(API_DULIEUPHIM + item.slug);
        if (itemDetail.error) return null;
        return {
          id: item.id,
          slug: API_DULIEUPHIM + "/" + item.slug,
          title: item.name,
          thumbnail: itemDetail.poster_url,
          episode: itemDetail.episode_current + `${itemDetail.quality ? ` [${itemDetail.quality}]` : ""}`,
          typeSub: itemDetail.lang || null,
          episodes: itemDetail.episodes,
        };
      });
      const result = (await Promise.all(detailPromises)).filter(Boolean);
      return result;
    } else {
      return [];
    }
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh tìm phim Kho Phim: ", error);
    return [];
  }
}

export async function handleFindKhoPhimCommand(keyword) {
  const [filmsFromKhoPhim, filmsFromDuLieuPhim] = await Promise.all([
    findFilmFromKKPHIM(keyword),
    findFilmFromDULIEUPHIM(keyword),
  ]);

  const finalFilm = [...filmsFromDuLieuPhim];
  const mergedTitles = new Set(filmsFromDuLieuPhim.map((item) => item.title.toLowerCase()));

  for (const item of filmsFromKhoPhim) {
    if (!mergedTitles.has(item.title.toLowerCase())) {
      finalFilm.push(item);
      mergedTitles.add(item.title);
    }
  }

  return finalFilm;
}

export async function handleKhoPhimCommand(api, message, aliasCommand) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  let keyword = content.replace(`${prefix}${aliasCommand}`, "").trim();

  if (!keyword) {
    const capt = "Vui lòng nhập từ khóa cần tìm kiếm...\n" + `Ví dụ: ${prefix}${aliasCommand} One Piece`;
    await sendMessageComplete(api, message, capt, false, 600000);
    return;
  }

  let imagePath;
  try {
    let dataFilm = await handleFindKhoPhimCommand(keyword);
    if (dataFilm && dataFilm.length > 0) {
      // if (dataFilm.length === 1) {
      //   const data = {
      //     userRequest: message.data.uidFrom,
      //     collection: dataFilm,
      //     timestamp: Date.now(),
      //     stage: 1,
      //   };
      //   return await processKhoPhimStageReply(api, message, data, 0);
      // }

      dataFilm = dataFilm.slice(0, CONFIG.maxResults);

      const formattedDataFilm = dataFilm.map((result) => ({
        title: result.title,
        artistsNames: result.episode,
        thumbnailM: result.thumbnail,
      }));

      imagePath = await createSearchResultImage(formattedDataFilm);

      let responseText = `🔎 Kết quả tìm kiếm phim tại Kho Phim:\n`;
      responseText += `Hãy trả lời tin nhắn này với số thứ tự phim bạn muốn xem!`;

      const object = {
        caption: responseText,
        imagePath: imagePath,
      };

      const listMessage = await sendMessageCompleteRequest(api, message, object, CONFIG.timeWaitSelection);
      const quotedMsgId = listMessage?.message?.msgId || listMessage?.attachment[0]?.msgId;

      listRequestKhoPhim.set(quotedMsgId.toString(), {
        userRequest: message.data.uidFrom,
        collection: dataFilm,
        timestamp: Date.now(),
        stage: 1,
      });
      setSelectionsMapData(message.data.uidFrom, {
        quotedMsgId: quotedMsgId.toString(),
        collection: dataFilm,
        timestamp: Date.now(),
        platform: PLATFORM_KHOPHIM,
        stage: 1,
      });
    } else {
      await sendMessageFailed(api, message, "Không tìm thấy phim nào cho từ khóa: " + keyword, false, 30000);
      return;
    }
  } catch (error) {
    let captErr = "Lỗi khi xử lý lệnh xem phim Kho Phim, vui lòng liên hệ Admin để kiểm tra lỗi";
    console.error("Lỗi khi xử lý lệnh xem phim Kho Phim:", error.message);
    await sendMessageFailed(api, message, captErr, false, 30000);
  } finally {
    if (imagePath) await deleteFile(imagePath);
  }
}

export async function handleKhoPhimReply(api, message) {
  const senderId = message.data.uidFrom;
  const idBot = api.getBotId();

  try {
    if (!message.data.quote || !message.data.quote.globalMsgId) return false;

    const quotedMsgId = message.data.quote.globalMsgId.toString();

    if (!listRequestKhoPhim.has(quotedMsgId)) return false;

    const dataFilmHH3D = listRequestKhoPhim.get(quotedMsgId);
    if (dataFilmHH3D.userRequest !== senderId) return false;

    const content = removeMention(message);
    const [index] = content.split(" ");
    let selectedIndex;
    if (dataFilmHH3D.stage === 1) {
      selectedIndex = parseInt(index) - 1;
      if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= dataFilmHH3D.collection.length) {
        await sendMessageFailed(api, message, "Lựa chọn không hợp lệ. Vui lòng chọn lại.", false, 30000);
        return true;
      }
    } else {
      selectedIndex = index;
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
    listRequestKhoPhim.delete(quotedMsgId);

    await processKhoPhimStageReply(api, message, dataFilmHH3D, selectedIndex);
    return true;
  } catch (error) {
    const captErr = "Lỗi khi xử lý lệnh tải phim Kho Phim, vui lòng liên hệ Admin để kiểm tra lỗi";
    console.error("Lỗi khi xử lý phản hồi lệnh tải phim Kho Phim:", error.message);
    await sendMessageFailed(api, message, captErr, false, 30000);
    return true;
  }
}

export async function processKhoPhimStageReply(api, message, dataRequest, selectionFinal) {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  let slugFilm;

  if (dataRequest.stage === 1) {
    const selectedFilm = dataRequest.collection[selectionFinal];
    const typeImage = await checkExstentionFileRemote(selectedFilm.thumbnail);
    const thumbnailPath = path.resolve(tempDir, `${randomIDTemp()}.${"jpg"}`);
    const clientAxios = getClientAxios();

    try {
      const response = await clientAxios.get(selectedFilm.thumbnail, { responseType: "arraybuffer" });

      const buffer = Buffer.from(response.data);
      if (typeImage === "webp") {
        await sharp(buffer).jpeg().toFile(thumbnailPath);
      } else {
        await writeFilePromise(thumbnailPath, buffer);
      }

      try {
        const uploadAttachment = await api.uploadAttachment([thumbnailPath], message.threadId, message.type);
        selectedFilm.thumbnail = uploadAttachment[0].fileUrl || uploadAttachment[0].normalUrl;
      } catch {
        selectedFilm.thumbnail = null;
      }

      let responseMessage;
      let collection = {};
      let keyMovieData = [];

      let data;

      if (selectedFilm.episodes) {
        data = selectedFilm;
      } else {
        const responseFilm = await clientAxios.get(selectedFilm.slug);
        data = responseFilm.data;
      }

      data.episodes[0].server_data.forEach((item) => {
        const episodeTitle = item.name.replace("Tập ", "");
        if (!keyMovieData.includes(episodeTitle)) keyMovieData.push(episodeTitle);
        collection[episodeTitle] = {
          slug: item.name,
          linkM3U8: item.link_m3u8,
        };
      });

      if (keyMovieData.length === 0) {
        const warningCaption = "Không tìm thấy tập phim nào cho phim này.\nVui lòng thử lại với phim khác!";
        await sendMessageFailed(api, message, warningCaption, false, 30000);
        return;
      }

      if (keyMovieData.length === 1) {
        const data = {
          userRequest: message.data.uidFrom,
          selectedFilm: selectedFilm,
          collection,
          timestamp: Date.now(),
          stage: 2,
        };
        return await processKhoPhimStageReply(api, message, data, keyMovieData[0]);
      }

      let episodeResponseText = `🎬 Bạn đã chọn phim: ${selectedFilm.title}\n`;
      episodeResponseText += `📺 Tập Hiện Tại: ${selectedFilm.episode}\n\n`;
      episodeResponseText += `Vui lòng nhập số tập phim mà bạn muốn xem!\n`;
      episodeResponseText += `[${formatSelectionRanges(keyMovieData)}]`;
      responseMessage = await sendMessageCompleteRequest(
        api,
        message,
        { caption: episodeResponseText, imagePath: thumbnailPath },
        CONFIG.timeWaitSelection
      );

      if (responseMessage) {
        const quotedMsgId = responseMessage?.message?.msgId || responseMessage?.attachment[0]?.msgId;
        listRequestKhoPhim.set(quotedMsgId.toString(), {
          userRequest: message.data.uidFrom,
          selectedFilm: selectedFilm,
          collection: collection,
          timestamp: Date.now(),
          stage: 2,
        });
        setSelectionsMapData(message.data.uidFrom, {
          quotedMsgId: quotedMsgId.toString(),
          collection: collection,
          selectedFilm: selectedFilm,
          timestamp: Date.now(),
          platform: PLATFORM_KHOPHIM,
          stage: 2,
        });
      }
      await api.addReaction("UNDO", message);
      await api.addReaction("LIKE", message);
    } catch (error) {
      console.error("Lỗi khi xử lý trạng thái phản hồi 1 của phim từ Kho Phim:", error);
      await api.addReaction("UNDO", message);
      await api.addReaction("TIEUTAN", message);
    } finally {
      await deleteFile(thumbnailPath);
    }
  } else if (dataRequest.stage === 2) {
    const selectedFilm = dataRequest.selectedFilm;
    let urlVideo = [];
    let selectedSlug, uniqueId, cachedVideo, tempFilePath;
    let quality = "Auto";
    try {
      slugFilm = removeMention(message);
      selectedSlug = dataRequest.collection[slugFilm] || dataRequest.collection[selectionFinal];
      if (!selectedSlug) {
        const warningCaption = "Số tập bạn chọn không có trong danh sách phim.\nVui lòng thử lại với tập phim khác!";
        await sendMessageFailed(api, message, warningCaption, false, 30000);
        return;
      }
      uniqueId = selectedFilm.title + ` - Tập ` + slugFilm;
      cachedVideo = await getCachedMedia(PLATFORM_KHOPHIM, uniqueId, quality, uniqueId);
      if (cachedVideo) {
        urlVideo = cachedVideo.fileUrl;
      } else {
        const linkM3U8 = await getLinkFileM3U8(selectedSlug.linkM3U8);

        if (linkM3U8 && linkM3U8.url) {
          tempFilePath = path.join(tempDir, `${randomIDTemp()}.mp4`);
          try {
            let caption = `Đang tiến hành tải phim...!`;
            await sendMessageComplete(api, message, caption, false, 30000);
            try {
              urlVideo = await downloadsCache.getDataDownload(api, message, linkM3U8.url, {
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
          } catch (error) {
            console.log(error);
            const caption = "Không thể lấy dữ liệu của tập phim này, vui lòng thử lại với tập phim khác";
            await sendMessageFailed(api, message, caption, false, 30000);
            return;
          } finally {
            await deleteFile(tempFilePath);
          }
        } else {
          const caption = "Không thể lấy dữ liệu của tập phim này, vui lòng thử lại với tập phim khác";
          await sendMessageFailed(api, message, caption, false, 30000);
          return;
        }

        setCacheData(PLATFORM_KHOPHIM, uniqueId, { fileUrl: urlVideo, title: uniqueId }, quality);
      }

      const typeString = typeof urlVideo === "string";
      if (urlVideo && (typeString || urlVideo.length > 0)) {
        await sendMessageComplete(api, message, ``, false, 60000);
        if (typeString || urlVideo.length === 1) {
          const dataVideo = typeString ? null : urlVideo[0];
          await api.sendVideo({
            videoUrl: typeString ? urlVideo : dataVideo.fileUrl,
            threadId: message.threadId,
            threadType: message.type,
            thumbnail: selectedFilm.thumbnail,
            metaData: dataVideo,
            message: {
              text:
                `🎬 Phim: ${selectedFilm.title}\n` +
                `📺 Tập: ${slugFilm}\n` +
                `🈳|🎧 Chuyển Ngữ: ${selectedFilm.typeSub || "Không Xác Định"}\n` +
                `${randomEmoji()} Chúc bạn xem phim vui vẻ! ${randomEmoji()}`,
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
              thumbnail: selectedFilm.thumbnail,
              metaData: dataVideo,
              message: {
                text:
                  `🎬 Phim: ${selectedFilm.title}\n` +
                  `📺 Tập: ${slugFilm} [Part ${index + 1}]\n` +
                  `🈳|🎧 Chuyển Ngữ: ${selectedFilm.typeSub || "Không Xác Định"}\n` +
                  `${randomEmoji()} Chúc bạn xem phim vui vẻ! ${randomEmoji()}`,
                mentions: [MessageMention(senderId, senderName.length, 2, false)],
              },
              ttl: TIME_LIVE_MESSAGE,
            });
          }
        }
        await api.addReaction("UNDO", message);
        await api.addReaction("LIKE", message);
      } else {
        const warningCaption = "Không thể lấy dữ liệu của tập phim này, vui lòng thử lại với tập phim khác";
        await sendMessageFailed(api, message, warningCaption, false, 180000);
        await api.addReaction("UNDO", message);
        await api.addReaction("TIEUTAN", message);
        return;
      }
    } catch (error) {
      const captErr = "Lỗi khi xử lý lệnh xem phim từ Kho Phim, vui lòng liên hệ Admin để kiểm tra lỗi";
      console.error("Lỗi khi xử lý trạng thái phản hồi 2 của phim từ Kho Phim: ", error);
      await sendMessageFailed(api, message, captErr, false, 30000);
      await api.addReaction("UNDO", message);
      await api.addReaction("TIEUTAN", message);
    }
  }
  return true;
}
