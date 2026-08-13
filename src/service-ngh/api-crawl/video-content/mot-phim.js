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

// ==================================== MOT CHILL ==================================== \\
const URL_MOTPHIM = "https://Motchill.Fm";
let URL_MOTPHIM_NOW = "https://Motchill.Fm";
const TIME_LIVE_MESSAGE = 86400000;

export const PLATFORM_MOTPHIM = "motphim";

const CONFIG = {
  maxResults: 20,
  timeWaitSelection: 60000,
};

const listRequestFilmMotPhim = new Map();

schedule.scheduleJob("*/5 * * * * *", () => {
  const currentTime = Date.now();
  for (const [msgId, data] of listRequestFilmMotPhim.entries()) {
    if (currentTime - data.timestamp > CONFIG.timeWaitSelection) {
      listRequestFilmMotPhim.delete(msgId);
    }
  }
});

async function getOriginalMotPhimUrl() {
  try {
    const client = getClientAxios();
    if (URL_MOTPHIM_NOW !== URL_MOTPHIM) {
      return URL_MOTPHIM_NOW;
    }
    const response = await client.head(URL_MOTPHIM, {
      maxRedirects: 5,
      timeout: 10000,
    });

    if (response.headers.link) {
      const match = response.headers.link.match(/<(https?:\/\/[^>]+)>/);
      URL_MOTPHIM_NOW = new URL(match[1]).origin;
    }
    return URL_MOTPHIM_NOW;
  } catch (error) {
    console.error("Lỗi khi lấy link gốc:", error.message);
    return URL_MOTPHIM_NOW;
  }
}

async function getMotPhimLinksM3U8(linkPage) {
  try {
    const client = getClientAxios();
    const responsePagesFilm = await client.get(linkPage);
    let $ = cheerio.load(responsePagesFilm.data);
    const filmLinks = $("a.streaming-server")
      .map((_, element) => $(element).attr("data-link").trim())
      .get();

    for (const filmLink of filmLinks) {
      const finalUrl = await getLinkFileM3U8(filmLink);
      if (finalUrl && finalUrl.url) {
        return finalUrl;
      }
    }

    throw new Error("Không tìm được link m3u8");
  } catch (err) {
    console.error("Lỗi khi get link anime: ", err);
    return null;
  }
}

export async function handleFindFilmMotPhimCommand(keyword) {
  try {
    const client = getClientAxios();
    const newUrl = await getOriginalMotPhimUrl();
    const response = await client.get(newUrl + `?s=${keyword}`);
    const $ = cheerio.load(response.data);
    const movieData = [];

    $(".list-films.film-new li.item").each((_, element) => {
      const episode = $(element).find("span.label").text().trim();

      const aTag = $(element).find("a").first();
      const href = aTag.attr("href");
      const title = aTag.attr("title") || $(element).find(".name-title a").text().trim();

      const thumbnail = newUrl + $(element).find("img").attr("data-original");
      const originalTitle = $(element).find(".original-title-home").text().trim();

      movieData.push({ title, href, thumbnail, originalTitle, episode });
    });

    const responseAjax = await client.post(
      `${newUrl}/wp-admin/admin-ajax.php`,
      new URLSearchParams({
        action: "search_film",
        keyword: keyword,
        limit: "20",
      })
    );

    let movieDataAjax = responseAjax.data.map((element) => ({
      title: element.title,
      href: element.slug,
      thumbnail: newUrl + element.image,
      originalTitle: element.original_title,
      episode: `Tập ${element.total_episode}`,
    }));

    const unifiedMovieData = [...movieDataAjax];

    movieData.forEach((item) => {
      const existing = unifiedMovieData.find((movie) => movie.title === item.title);
      if (existing) {
        Object.assign(existing, item);
      } else {
        unifiedMovieData.push(item);
      }
    });

    return unifiedMovieData;
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh tìm phim MotPhim: ", error);
    URL_MOTPHIM_NOW = URL_MOTPHIM;
  }
}

export async function handleMotPhimCommand(api, message, aliasCommand) {
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
    let dataFilm = await handleFindFilmMotPhimCommand(keyword);
    if (dataFilm && dataFilm.length > 0) {
      // if (dataFilm.length === 1) {
      //   const data = {
      //     userRequest: message.data.uidFrom,
      //     collection: dataFilm,
      //     timestamp: Date.now(),
      //     stage: 1,
      //   };
      //   return await processMotPhimStageReply(api, message, data, 0);
      // }

      dataFilm = dataFilm.slice(0, CONFIG.maxResults);

      const formattedDataFilm = dataFilm.map((result) => ({
        title: result.title,
        artistsNames: result.episode,
        thumbnailM: result.thumbnail,
      }));

      imagePath = await createSearchResultImage(formattedDataFilm, api.getBotId());

      let responseText = `🔎 Kết quả tìm kiếm phim tại MotPhim:\n`;
      responseText += `Hãy trả lời tin nhắn này với số thứ tự phim bạn muốn xem!`;

      const object = {
        caption: responseText,
        imagePath: imagePath,
      };

      const listMessage = await sendMessageCompleteRequest(api, message, object, CONFIG.timeWaitSelection);
      const quotedMsgId = listMessage?.message?.msgId || listMessage?.attachment[0]?.msgId;

      listRequestFilmMotPhim.set(quotedMsgId.toString(), {
        userRequest: message.data.uidFrom,
        collection: dataFilm,
        timestamp: Date.now(),
        stage: 1,
      });
      setSelectionsMapData(message.data.uidFrom, {
        quotedMsgId: quotedMsgId.toString(),
        collection: dataFilm,
        timestamp: Date.now(),
        platform: PLATFORM_MOTPHIM,
        stage: 1,
      });
    } else {
      await sendMessageFailed(api, message, "Không tìm thấy phim nào cho từ khóa: " + keyword, false, 30000);
      return;
    }
  } catch (error) {
    let captErr = "Lỗi khi xử lý lệnh xem phim MotPhim, vui lòng liên hệ Admin để kiểm tra lỗi";
    console.error("Lỗi khi xử lý lệnh xem phim MotPhim:", error.message);
    await sendMessageFailed(api, message, captErr, false, 30000);
  } finally {
    if (imagePath) await deleteFile(imagePath);
  }
}

export async function handleMotPhimReply(api, message) {
  const senderId = message.data.uidFrom;
  const idBot = api.getBotId();

  try {
    if (!message.data.quote || !message.data.quote.globalMsgId) return false;

    const quotedMsgId = message.data.quote.globalMsgId.toString();

    if (!listRequestFilmMotPhim.has(quotedMsgId)) return false;

    const dataFilmHH3D = listRequestFilmMotPhim.get(quotedMsgId);
    if (dataFilmHH3D.userRequest !== senderId) return false;

    const content = removeMention(message);
    const [index] = content.split(" ");
    const selectedIndex = parseInt(index) - 1;
    if (dataFilmHH3D.stage === 1) {
      if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= dataFilmHH3D.collection.length) {
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
    listRequestFilmMotPhim.delete(quotedMsgId);

    await processMotPhimStageReply(api, message, dataFilmHH3D, selectedIndex);
    return true;
  } catch (error) {
    const captErr = "Lỗi khi xử lý lệnh tải phim MotPhim, vui lòng liên hệ Admin để kiểm tra lỗi";
    console.error("Lỗi khi xử lý phản hồi lệnh tải phim MotPhim:", error.message);
    await sendMessageFailed(api, message, captErr, false, 30000);
    return true;
  }
}

export async function processMotPhimStageReply(api, message, dataRequest, selectedIndex) {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;

  if (dataRequest.stage === 1) {
    const selectedFilm = dataRequest.collection[selectedIndex];
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

      let responseMessage;
      let collection;

      const responsePagesFilm = await clientAxios.get(selectedFilm.href);
      let $ = cheerio.load(responsePagesFilm.data);
      const filmLink = $(".btn-stream-link").attr("href").trim();

      const responseNewEpisode = await clientAxios.get(filmLink);
      $ = cheerio.load(responseNewEpisode.data);
      const movieDataEpisode = {};
      let keyMovieData = [];
      $(".list-episode a").each((index, element) => {
        const episodeTitle = $(element).text().trim();
        if (!keyMovieData.includes(episodeTitle)) keyMovieData.push(episodeTitle);
        const linkFilm = $(element).attr("href").trim();
        movieDataEpisode[episodeTitle] = {
          slug: episodeTitle,
          linkFilm,
        };
      });

      if (keyMovieData.length === 0) {
        const warningCaption = "Không tìm thấy tập phim nào cho phim này.\nVui lòng thử lại với phim khác!";
        await sendMessageFailed(api, message, warningCaption, false, 30000);
        return;
      }

      collection = movieDataEpisode;
      if (keyMovieData.length === 1) {
        const data = {
          userRequest: message.data.uidFrom,
          selectedFilm: selectedFilm,
          collection,
          timestamp: Date.now(),
          stage: 2,
        };
        return await processMotPhimStageReply(api, message, data, keyMovieData[0]);
      }

      let episodeResponseText = `🎬 Bạn đã chọn phim: ${selectedFilm.title}\n`;
      episodeResponseText += `📺 Số Tập: ${selectedFilm.episode}\n\n`;
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
        listRequestFilmMotPhim.set(quotedMsgId.toString(), {
          userRequest: message.data.uidFrom,
          selectedFilm: selectedFilm,
          collection,
          timestamp: Date.now(),
          stage: 2,
        });
        setSelectionsMapData(message.data.uidFrom, {
          quotedMsgId: quotedMsgId.toString(),
          collection,
          selectedFilm: selectedFilm,
          timestamp: Date.now(),
          platform: PLATFORM_MOTPHIM,
          stage: 2,
        });
      }
      await api.addReaction("UNDO", message);
      await api.addReaction("LIKE", message);
    } catch (error) {
      console.error("Lỗi khi xử lý trạng thái phản hồi 1 của MotPhim:", error);
      await api.addReaction("UNDO", message);
      await api.addReaction("TIEUTAN", message);
    } finally {
      await deleteFile(thumbnailPath);
    }
  } else if (dataRequest.stage === 2) {
    const selectedFilm = dataRequest.selectedFilm;
    let urlVideo = [];
    let urlFlim, slugFilm, selectedSlug, uniqueId, cachedVideo, tempFilePath;
    let quality = "Full HD";
    try {
      slugFilm = removeMention(message);
      selectedSlug = dataRequest.collection[slugFilm] || dataRequest.collection[selectedIndex];
      if (!selectedSlug) {
        const warningCaption = "Số tập bạn chọn không có trong danh sách phim.\nVui lòng thử lại với tập phim khác!";
        await sendMessageFailed(api, message, warningCaption, false, 30000);
        return;
      }
      uniqueId = selectedFilm.title + ` - Tập ` + slugFilm;
      cachedVideo = await getCachedMedia(PLATFORM_MOTPHIM, uniqueId, quality, uniqueId);
      if (cachedVideo) {
        urlVideo = cachedVideo.fileUrl;
      } else {
        urlFlim = selectedSlug.linkFilm;
        const linkM3U8 = await getMotPhimLinksM3U8(urlFlim);

        if (linkM3U8 && linkM3U8.url) {
          tempFilePath = path.join(tempDir, `${randomIDTemp()}.mp4`);
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
            const warningCaption =
              `Có lỗi xảy ra khi ${stageString}, vui lòng thử lại sau hoặc liên hệ Admin Bot Leader nếu lỗi chưa được khắc phục..., ` +
              "\n\nHoặc vui lòng xem phim trực tiếp tại: \nLink phim: " +
              urlFlim;
            await sendMessageFailed(api, message, warningCaption, false, 180000);
            return;
          }
        } else {
          const caption =
            "Không thể lấy dữ liệu của tập phim này, vui lòng thử lại với tập phim khác" +
            " hoặc xem phim trực tiếp tại: \nLink phim: " +
            urlFlim;
          await sendMessageFailed(api, message, caption, false, 30000);
          return;
        }

        setCacheData(PLATFORM_MOTPHIM, uniqueId, { fileUrl: urlVideo, title: uniqueId }, quality);
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
                `🈳|🎧 Chuyển Ngữ: ${slugFilm.includes("TM") ? "Thuyết Minh" : "Vietsub"}\n` +
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
                  `🈳|🎧 Chuyển Ngữ: ${slugFilm.includes("TM") ? "Thuyết Minh" : "Vietsub"}\n` +
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
        const warningCaption =
          "Không thể lấy dữ liệu của tập phim này, vui lòng thử lại với tập phim khác" +
          " hoặc xem phim trực tiếp tại: \nLink phim: " +
          urlFlim;
        await sendMessageFailed(api, message, warningCaption, false, 180000);
        await api.addReaction("UNDO", message);
        await api.addReaction("TIEUTAN", message);
        return;
      }
    } catch (error) {
      const captErr = "Lỗi khi xử lý lệnh xem phim từ MotPhim, vui lòng liên hệ Admin để kiểm tra lỗi";
      console.error("Lỗi khi xử lý trạng thái phản hồi 2 của phim từ MotPhim: ", error);
      await sendMessageFailed(api, message, captErr, false, 30000);
      await api.addReaction("UNDO", message);
      await api.addReaction("TIEUTAN", message);
    }
  }
  return true;
}
