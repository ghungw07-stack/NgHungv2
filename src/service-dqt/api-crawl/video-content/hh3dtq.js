import * as cheerio from "cheerio";
import schedule from "node-schedule";
import path from "path";
import { JSDOM } from "jsdom";
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
import { closeBrowser, getClientAxios, launchBrowser, launchPageBrowserReal } from "../../utilities/browser-launch.js";
import { createSearchResultImage } from "../../../utils/canvas/search-canvas.js";
import { downloadsCache } from "../../../utils/download-upload-cache.js";
import youtubeDl from "youtube-dl-exec";

const URL_HH3D_VIETSUB = "https://bit.ly/hh3d";
let URL_HH3D_VIETSUB_NOW = "https://bit.ly/hh3d";
const URL_HH3D_THUYETMINH = "https://yanhh3d.net";
let URL_HH3D_THUYETMINH_NOW = "https://yanhh3d.vip";
const TIME_LIVE_MESSAGE = 86400000;

export const PLATFORM_HH3D = "hh3dtq";

const CONFIG = {
  maxResults: 10,
  timeWaitSelection: 60000,
};

const listFilmHH3D = new Map();

schedule.scheduleJob("*/5 * * * * *", () => {
  const currentTime = Date.now();
  for (const [msgId, data] of listFilmHH3D.entries()) {
    if (currentTime - data.timestamp > CONFIG.timeWaitSelection) {
      listFilmHH3D.delete(msgId);
    }
  }
});

async function getOriginalHH3DVietSubUrl() {
  try {
    if (URL_HH3D_VIETSUB_NOW !== URL_HH3D_VIETSUB) {
      return URL_HH3D_VIETSUB_NOW;
    }
    const page = await launchPageBrowserReal();
    await page.goto(URL_HH3D_VIETSUB, { waitUntil: "domcontentloaded", timeout: 15000 });
    const finalUrl = page.url();
    if (finalUrl && finalUrl !== URL_HH3D_VIETSUB) {
      URL_HH3D_VIETSUB_NOW = new URL(finalUrl).origin;
    }
    return URL_HH3D_VIETSUB_NOW;
  } catch (error) {
    console.error("Lỗi khi lấy link gốc:", error.message);
    return URL_HH3D_VIETSUB_NOW;
  }
}

async function getOriginalYanHH3DUrl() {
  try {
    const client = getClientAxios();
    const response = await client.get(URL_HH3D_THUYETMINH, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language": "en-US,en;q=0.9,vi;q=0.8",
      },
    });
    const $ = cheerio.load(response.data);

    let newDomain = $(".bt-link").attr("href");

    if (newDomain) {
      if (newDomain.endsWith("/")) newDomain = newDomain.slice(0, -1);
      return newDomain;
    }

    return URL_HH3D_THUYETMINH;
  } catch (error) {
    console.error("Lỗi khi lấy link gốc:", error.message);
    return URL_HH3D_THUYETMINH_NOW;
  }
}

const thuMap = {
  2: "thu-hai",
  3: "thu-ba",
  4: "thu-tu",
  5: "thu-nam",
  6: "thu-sau",
  7: "thu-bay",
  cn: "chu-nhat",
  8: "chu-nhat",
};

const thuMap2 = {
  2: "mon",
  3: "tue",
  4: "wed",
  5: "thu",
  6: "fri",
  7: "sat",
  cn: "sun",
  8: "sun",
};

const thuMap3 = {
  2: "Thứ 2",
  3: "Thứ 3",
  4: "Thứ 4",
  5: "Thứ 5",
  6: "Thứ 6",
  7: "Thứ 7",
  cn: "Chủ nhật",
  8: "Chủ nhật",
};

const typeMap = {
  thm: "thm",
  vsub: "vsub",
  "thuyết minh": "thm",
  vietsub: "vsub",
};

function processContent(content) {
  let thuVSub = null;
  let thuYanTM = null;
  let thuVN = null;
  let thuNum = null;
  let type = "vsub";

  const parts = content.split(/\s+/);

  function getDayOfWeek() {
    const days = ["chu-nhat", "thu-hai", "thu-ba", "thu-tu", "thu-nam", "thu-sau", "thu-bay"];
    const daysEN = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const daysVN = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
    const date = new Date();
    const dayIndex = date.getDay();
    thuNum = dayIndex === 0 ? 8 : dayIndex + 1;
    return { vnO: daysVN[dayIndex], vn: days[dayIndex], en: daysEN[dayIndex] };
  }

  for (const part of parts) {
    if (thuMap[part.toLowerCase()]) {
      thuNum = parseInt(part === "cn" ? 8 : part);
      thuVN = thuMap3[part.toLowerCase()];
      thuVSub = thuMap[part.toLowerCase()];
      thuYanTM = thuMap2[part.toLowerCase()];
      parts.splice(0, parts.indexOf(part) + 1);
      break;
    }
  }

  if (!thuVSub) {
    const { vnO, vn, en } = getDayOfWeek();
    thuVN = vnO;
    thuVSub = vn;
    thuYanTM = en;
  }

  const stringPart = parts.join(" ").toLowerCase();
  if (typeMap[stringPart]) {
    type = typeMap[stringPart];
  }

  return { thuString: thuVN, thuVSub, thuYanTM, type, thuNumber: thuNum };
}

async function extractDataLinkHH3DVietSub(thuVN) {
  const originalUrl = await getOriginalHH3DVietSubUrl();
  const client = getClientAxios();
  const response = await client.get(`${originalUrl}/wp-json/movie-schedule/v1/daily`, {
    params: {
      day: thuVN,
    },
    headers: {
      accept: "*/*",
      "accept-language": "vi,vi-VN;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5,zh-TW;q=0.4,zh-CN;q=0.3,zh;q=0.2",
      priority: "u=1, i",
      referer: `${originalUrl}/lich-chieu/`,
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
    },
  });
  const allMovie = [...response.data?.early_movies, ...response.data?.regular_movies];
  const movieData = [];
  allMovie.forEach((element) => {
    const title = element.title;
    const episode = element.latest_episode;
    const href = element.permalink;
    const thumbnail = element.thumbnail;
    movieData.push({ title, episode, href, thumbnail });
  });

  return movieData;
}

async function extractDataLinkHH3DThuyetMinh(thuEN) {
  try {
    const browser = await launchBrowser();
    const page = await browser.newPage();

    const newUrl = await getOriginalYanHH3DUrl();
    await page.goto(newUrl, { waitUntil: "domcontentloaded" });

    const csrfToken = await page.evaluate(() => {
      return document.querySelector('meta[name="csrf-token"]')?.getAttribute("content");
    });

    if (!csrfToken) {
      console.error("Không tìm thấy CSRF token");
      await page.close();
      return null;
    }

    const response = await page.evaluate(
      async (url, thuEN, csrfToken) => {
        const formData = new URLSearchParams();
        formData.append("days", thuEN);

        const res = await fetch(`${url}/ajax/sever/load-lich-chieu`, {
          method: "POST",
          headers: {
            "X-CSRF-TOKEN": csrfToken,
            Accept: "application/json, text/javascript, */*; q=0.01",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: formData.toString(),
        });

        return res.json();
      },
      newUrl,
      thuEN,
      csrfToken
    );

    await page.close();

    let movieData = [];
    let dom = new JSDOM(response.data);
    let document = dom.window.document;

    document.querySelectorAll(".flw-item").forEach((item) => {
      let titleElement = item.querySelector(".film-name a");
      let episodeElement = item.querySelector(".tick-rate");
      let linkElement = item.querySelector(".film-poster-ahref");

      let title = titleElement ? titleElement.textContent.trim() : "";
      let episode = episodeElement ? episodeElement.textContent.trim() : "";
      let href = linkElement ? linkElement.getAttribute("href") : "";
      const thumbnail = item.querySelector(".film-poster-img")
        ? item.querySelector(".film-poster-img").getAttribute("src") ||
          item.querySelector(".film-poster-img").getAttribute("data-src")
        : "";

      movieData.push({ title, episode, href, thumbnail });
    });

    return movieData;
  } catch (error) {
    console.error("Lỗi trong quá trình crawl hh3d thuyết minh: ", error);
    await closeBrowser();
    return null;
  }
}

export async function handleShowLichHoatHinh3DTrungQuocCommand(api, message, aliasCommand) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const keyword = content.replace(`${prefix}${aliasCommand}`, "").trim();
  let imagePath, tempString;

  try {
    let data = null;
    const [action, link] = keyword.split(" ");
    if (action === "link" && link) {
      URL_HH3D_THUYETMINH_NOW = link;
      await sendMessageCompleteRequest(api, message, { caption: "Cập nhật link active của YANHH3D: " + link }, 1800000);
      return;
    }
    const { thuString, thuYanTM, type, thuNumber } = processContent(keyword);
    if (type === "vsub") {
      data = await extractDataLinkHH3DVietSub(thuMap[thuNumber]);
    } else if (type === "thm") {
      data = await extractDataLinkHH3DThuyetMinh(thuYanTM);
    }
    if (data) {
      const formattedDataFilm = data.map((result) => ({
        title: result.title,
        artistsNames: result.episode,
        thumbnailM: result.thumbnail,
      }));

      imagePath = await createSearchResultImage(formattedDataFilm);

      let responseText =
        `🔎 Lịch phim Hoạt Hình 3D Trung Quốc Ngày "${thuString}" (${type === "vsub" ? "VietSub" : "Thuyết Minh"}):` +
        `\nVui lòng nhập số thứ tự phim bạn muốn xem!`;

      const object = {
        caption: responseText,
        imagePath: imagePath,
      };

      const listMessage = await sendMessageCompleteRequest(api, message, object, CONFIG.timeWaitSelection);
      const quotedMsgId = listMessage?.message?.msgId || listMessage?.attachment[0]?.msgId;

      listFilmHH3D.set(quotedMsgId.toString(), {
        userRequest: message.data.uidFrom,
        collection: data,
        timestamp: Date.now(),
        stage: 1,
        type: type,
      });
      setSelectionsMapData(message.data.uidFrom, {
        quotedMsgId: quotedMsgId.toString(),
        collection: data,
        timestamp: Date.now(),
        platform: PLATFORM_HH3D,
        stage: 1,
        type: type,
      });
    } else {
      tempString = "Hôm nay không có phim nào hoặc quá trình xử lý thông tin xảy ra lỗi!";
      await sendMessageFailed(api, message, tempString, false, 30000);
    }
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh xem lịch hoạt hình 3D Trung Quốc: ", error);
    tempString = "Lỗi khi xử lý lệnh xem lịch hoạt hình 3D Trung Quốc, vui lòng liên hệ Admin để kiểm tra lỗi";
    await sendMessageFailed(api, message, tempString, false, 30000);
  } finally {
    if (imagePath) await deleteFile(imagePath);
  }
}

// ===== Find And Download Film HH3D Trung Quốc =====
export async function handleFindFilmWithVietsubHH3DCommand(keyword) {
  let newUrl;
  try {
    const client = getClientAxios();
    newUrl = await getOriginalHH3DVietSubUrl();
    const response = await client.get(newUrl + "/search/" + keyword);
    const $ = cheerio.load(response.data);
    const movieData = [];

    $(".halim-item").each((index, item) => {
      const element = $(item);
      const href = element.find("a.halim-thumb").attr("href");
      const thumbnail = element.find("img").attr("src");
      const title = element.find("h2.entry-title").text().trim();
      const episode = element.find("span.episode").text().trim();
      const originalTitle = element.find("p.original_title").text().trim();
      const status = element.find("span.status").text().trim();
      movieData.push({ title, href, episode, thumbnail, originalTitle, status });
    });

    return movieData;
  } catch (error) {
    // console.error("Lỗi khi xử lý lệnh tìm phim hoạt hình 3D Trung Quốc Vietsub: ", error);
    try {
      newUrl = newUrl || (await getOriginalHH3DVietSubUrl());
      const page = await launchPageBrowserReal();
      await page.goto(newUrl + "/search/" + encodeURIComponent(keyword), { waitUntil: "domcontentloaded" });

      const movieData = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll(".halim-item"));
        return items.map((item) => {
          const href = item.querySelector("a.halim-thumb")?.getAttribute("href") || "";
          const thumbnail = item.querySelector("img")?.getAttribute("src") || "";
          const title = item.querySelector("h2.entry-title")?.innerText.trim() || "";
          const episode = item.querySelector("span.episode")?.innerText.trim() || "";
          const originalTitle = item.querySelector("p.original_title")?.innerText.trim() || "";
          const status = item.querySelector("span.status")?.innerText.trim() || "";
          return { title, href, episode, thumbnail, originalTitle, status };
        });
      });

      return movieData;
    } catch (err) {
      console.error("Lỗi khi xử lý lệnh tìm phim hoạt hình 3D Trung Quốc Vietsub: ", err);
      return [];
    } finally {
      // await closeBrowserReal();
    }
  }
}

export async function handleFindFilmWithYanHH3DCommand(keyword) {
  try {
    const newUrl = await getOriginalYanHH3DUrl();
    const client = getClientAxios();
    const response = await client.get(newUrl + "/search?keysearch=" + keyword);
    const $ = cheerio.load(response.data);
    const movieData = [];

    $(".film_list-wrap .flw-item").each((index, element) => {
      const title = $(element).find(".film-name").text().trim();
      const href = $(element).find(".film-poster-ahref").attr("href");
      const episode = $(element).find(".tick-rate").text().trim();
      const thumbnail =
        $(element).find(".film-poster-img").attr("src") || $(element).find(".film-poster-img").attr("data-src");
      movieData.push({ title, href, episode, thumbnail });
    });

    return movieData;
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh tìm phim hoạt hình 3D Trung Quốc Thuyết Minh: ", error);
  }
}

export async function handleHoatHinh3DTrungQuocCommand(api, message, aliasCommand) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  let keyword = content.replace(`${prefix}${aliasCommand}`, "").trim();

  let typePhim = "vsub";
  for (const key in typeMap) {
    if (keyword.includes(key)) {
      typePhim = typeMap[key];
      keyword = keyword.replace(key, "").trim();
      break;
    }
  }

  if (!keyword) {
    const capt = "Vui lòng nhập từ khóa cần tìm kiếm...\n" + `Ví dụ: ${prefix}${aliasCommand} Phàm Nhân Tu Tiên`;
    await sendMessageComplete(api, message, capt, false, 600000);
    return;
  }

  let imagePath;
  try {
    let dataFilm = null;
    if (typePhim === "vsub") {
      dataFilm = await handleFindFilmWithVietsubHH3DCommand(keyword);
    }
    if (typePhim === "thm") {
      dataFilm = await handleFindFilmWithYanHH3DCommand(keyword);
    }
    if (dataFilm && dataFilm.length > 0) {
      // if (dataFilm.length === 1) {
      //   const data = {
      //     userRequest: message.data.uidFrom,
      //     collection: dataFilm,
      //     timestamp: Date.now(),
      //     stage: 1,
      //     type: typePhim,
      //   };
      //   return await processStageReply(api, message, data, 0);
      // }

      dataFilm = dataFilm.slice(0, CONFIG.maxResults);

      const formattedDataFilm = dataFilm.map((result) => ({
        title: result.title,
        artistsNames: result.episode,
        thumbnailM: result.thumbnail,
      }));

      imagePath = await createSearchResultImage(formattedDataFilm);

      let responseText = `🔎 Kết quả tìm kiếm phim Hoạt Hình 3D Trung Quốc:\n`;
      responseText += `Hãy trả lời tin nhắn này với số thứ tự phim bạn muốn xem!`;

      const object = {
        caption: responseText,
        imagePath: imagePath,
      };

      const listMessage = await sendMessageCompleteRequest(api, message, object, CONFIG.timeWaitSelection);
      const quotedMsgId = listMessage?.message?.msgId || listMessage?.attachment[0]?.msgId;

      listFilmHH3D.set(quotedMsgId.toString(), {
        userRequest: message.data.uidFrom,
        collection: dataFilm,
        timestamp: Date.now(),
        stage: 1,
        type: typePhim,
      });
      setSelectionsMapData(message.data.uidFrom, {
        quotedMsgId: quotedMsgId.toString(),
        collection: dataFilm,
        timestamp: Date.now(),
        platform: PLATFORM_HH3D,
        stage: 1,
        type: typePhim,
      });
    } else {
      await sendMessageFailed(api, message, "Không tìm thấy phim nào cho từ khóa: " + keyword, false, 30000);
      return;
    }
  } catch (error) {
    let captErr = "Lỗi khi xử lý lệnh xem phim hoạt hình 3D Trung Quốc, vui lòng liên hệ Admin để kiểm tra lỗi";
    console.error("Lỗi khi xử lý lệnh xem phim hoạt hình 3D Trung Quốc:", error.message);
    await sendMessageFailed(api, message, captErr, false, 30000);
  } finally {
    if (imagePath) await deleteFile(imagePath);
  }
}

export async function handleHoatHinh3DTrungQuocThuyetMinhCommand(api, message, aliasCommand) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  let keyword = content.replace(`${prefix}${aliasCommand}`, "").trim();
  const typePhim = "thm";

  if (!keyword) {
    const capt = "Vui lòng nhập từ khóa cần tìm kiếm...\n" + `Ví dụ: ${prefix}${aliasCommand} Tiên Nghịch`;
    await sendMessageComplete(api, message, capt, false, 600000);
    return;
  }

  let imagePath;
  try {
    let dataFilm = await handleFindFilmWithYanHH3DCommand(keyword);

    if (dataFilm && dataFilm.length > 0) {
      // if (dataFilm.length === 1) {
      //   const data = {
      //     userRequest: message.data.uidFrom,
      //     collection: dataFilm,
      //     timestamp: Date.now(),
      //     stage: 1,
      //     type: typePhim,
      //   };
      //   return await processStageReply(api, message, data, 0);
      // }

      dataFilm = dataFilm.slice(0, 10);

      const formattedDataFilm = dataFilm.map((result) => ({
        title: result.title,
        artistsNames: result.episode,
        thumbnailM: result.thumbnail,
      }));

      imagePath = await createSearchResultImage(formattedDataFilm);

      let responseText = `🔎 Kết quả tìm kiếm phim Hoạt Hình 3D Trung Quốc:\n`;
      responseText += `Hãy trả lời tin nhắn này với số thứ tự phim bạn muốn xem!`;

      const object = { caption: responseText, imagePath: imagePath };

      const listMessage = await sendMessageCompleteRequest(api, message, object, CONFIG.timeWaitSelection);
      const quotedMsgId = listMessage?.message?.msgId || listMessage?.attachment[0]?.msgId;

      listFilmHH3D.set(quotedMsgId.toString(), {
        userRequest: message.data.uidFrom,
        collection: dataFilm,
        timestamp: Date.now(),
        stage: 1,
        type: typePhim,
      });
      setSelectionsMapData(message.data.uidFrom, {
        quotedMsgId: quotedMsgId.toString(),
        collection: dataFilm,
        timestamp: Date.now(),
        platform: PLATFORM_HH3D,
        stage: 1,
        type: typePhim,
      });
    } else {
      await sendMessageFailed(api, message, "Không tìm thấy phim nào cho từ khóa: " + keyword, false, 30000);
      return;
    }
  } catch (error) {
    let captErr =
      "Lỗi khi xử lý lệnh xem phim hoạt hình 3D Trung Quốc thuyết minh, vui lòng liên hệ Admin để kiểm tra lỗi";
    console.error("Lỗi khi xử lý lệnh xem phim hoạt hình 3D Trung Quốc thuyết minh:", error.message);
    await sendMessageFailed(api, message, captErr, false, 30000);
  } finally {
    if (imagePath) await deleteFile(imagePath);
  }
}

export async function processStageReply(api, message, dataRequest, selectedIndex) {
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
      let halim_cfg;

      if (dataRequest.type === "thm") {
        const responsePagesFilm = await clientAxios.get(selectedFilm.href);
        let $ = cheerio.load(responsePagesFilm.data);
        const filmButton = $(".film-buttons a.btn-play");
        const filmLink = filmButton.attr("href").trim();

        const responseNewEpisode = await clientAxios.get(filmLink);
        $ = cheerio.load(responseNewEpisode.data);
        const movieData = {};
        let keyMovieData = [];
        let keyMovieDataVietSub = [];
        $(".ssl-item.ep-item").each((index, element) => {
          const linkFilm = $(element).attr("href").trim();
          let episodeTitle = $(element).attr("title").trim().toString();
          let type = "Không xác định";
          if (linkFilm.includes("/sever2/")) {
            episodeTitle += " VS";
            type = "Vietsub";
            if (!keyMovieDataVietSub.includes(episodeTitle)) keyMovieDataVietSub.push(episodeTitle);
          } else {
            type = "Thuyết Minh";
            if (!keyMovieData.includes(episodeTitle)) keyMovieData.push(episodeTitle);
          }
          movieData[episodeTitle] = {
            slug: episodeTitle,
            linkFilm,
            type,
          };
        });

        if (keyMovieData.length === 0) {
          const warningCaption = "Không tìm thấy tập phim nào cho phim này.\nVui lòng thử lại với phim khác!";
          await sendMessageFailed(api, message, warningCaption, false, 30000);
          return;
        }

        collection = movieData;
        if (keyMovieData.length === 1) {
          const data = {
            userRequest: message.data.uidFrom,
            selectedFilm: selectedFilm,
            collection,
            timestamp: Date.now(),
            stage: 2,
            type: dataRequest.type,
            halim_cfg: halim_cfg,
          };
          return await processStageReply(api, message, data, keyMovieData[0]);
        }

        let episodeResponseText = `🎬 Bạn đã chọn phim: ${selectedFilm.title}\n`;
        episodeResponseText += `📺 Số Tập: ${selectedFilm.episode}\n\n`;
        episodeResponseText += `Vui lòng nhập số tập phim mà bạn muốn xem bên dưới!`;
        episodeResponseText +=
          keyMovieData.length > 0 ? `\n\nThuyết Minh: [${formatSelectionRanges(keyMovieData)}]` : ``;
        // episodeResponseText += keyMovieDataVietSub.length > 0 ? `\n\nVietsub: [${keyMovieDataVietSub.join(", ")}]` : ``;
        responseMessage = await sendMessageCompleteRequest(
          api,
          message,
          { caption: episodeResponseText, imagePath: thumbnailPath },
          CONFIG.timeWaitSelection
        );
      } else if (dataRequest.type === "vsub") {
        let responseDataFilm;
        try {
          responseDataFilm = await clientAxios.get(selectedFilm.href, { responseType: "arraybuffer" });
        } catch (error) {
          const page = await launchPageBrowserReal();
          await page.goto(selectedFilm.href, { waitUntil: "domcontentloaded" });
          const response = await page.content();
          responseDataFilm = { data: response };
        }
        const $ = cheerio.load(responseDataFilm.data);

        const scripts = $("script");
        let halimCfgScript = "";

        scripts.each((i, script) => {
          const content = $(script).html();
          if (content && content.includes("var halim_cfg")) {
            halimCfgScript = content;
          }
        });

        if (halimCfgScript) {
          const match = halimCfgScript.split("=");
          if (match && match[1]) {
            halim_cfg = eval("(" + match[1] + ")");
          } else {
            const warningCaption = "Xin lỗi, không tìm thấy khóa dữ liệu của phim này...!";
            await sendMessageFailed(api, message, warningCaption, false, 30000);
            return;
          }
        } else {
          const warningCaption = "Xin lỗi, không tìm thấy khóa dữ liệu của phim này...!";
          await sendMessageFailed(api, message, warningCaption, false, 30000);
          return;
        }

        const movieData = {};
        let keyMovieData = [];
        $(".halim-episode").each((index, element) => {
          const episodeSlug = $(element).find(".halim-btn").attr("data-episode-slug");
          const tapPhim = episodeSlug.replace("tap-", "");
          if (!keyMovieData.includes(tapPhim)) keyMovieData.push(tapPhim);
          movieData[tapPhim] = {
            slug: episodeSlug,
          };
        });

        if (keyMovieData.length === 0) {
          const warningCaption = "Không tìm thấy tập phim nào cho phim này.\nVui lòng thử lại với phim khác!";
          await sendMessageFailed(api, message, warningCaption, false, 30000);
          return;
        }

        collection = movieData;
        if (keyMovieData.length === 1) {
          const data = {
            userRequest: message.data.uidFrom,
            selectedFilm: selectedFilm,
            collection,
            timestamp: Date.now(),
            stage: 2,
            type: dataRequest.type,
            halim_cfg: halim_cfg,
          };
          return await processStageReply(api, message, data, keyMovieData[0]);
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
      }
      if (responseMessage) {
        const quotedMsgId = responseMessage?.message?.msgId || responseMessage?.attachment[0]?.msgId;
        listFilmHH3D.set(quotedMsgId.toString(), {
          userRequest: message.data.uidFrom,
          selectedFilm: selectedFilm,
          collection,
          timestamp: Date.now(),
          stage: 2,
          type: dataRequest.type,
          halim_cfg: halim_cfg,
        });
        setSelectionsMapData(message.data.uidFrom, {
          quotedMsgId: quotedMsgId.toString(),
          collection,
          selectedFilm: selectedFilm,
          timestamp: Date.now(),
          platform: PLATFORM_HH3D,
          stage: 2,
          type: dataRequest.type,
          halim_cfg: halim_cfg,
        });
      }
      await api.addReaction("UNDO", message);
      await api.addReaction("LIKE", message);
    } catch (error) {
      console.error("Lỗi khi xử lý trạng thái phản hồi 1 của phim hoạt hình 3D Trung Quốc:", error.message);
      await api.addReaction("UNDO", message);
      await api.addReaction("TIEUTAN", message);
    } finally {
      await deleteFile(thumbnailPath);
    }
  } else if (dataRequest.stage === 2) {
    const selectedFilm = dataRequest.selectedFilm;
    let urlVideo = [];
    let urlFlim;
    let slugFilm;
    let selectedSlug;
    let uniqueId;
    let quality = "Full HD";
    let cachedVideo;
    try {
      switch (dataRequest.type) {
        case "thm":
          slugFilm = removeMention(message);
          selectedSlug = dataRequest.collection[slugFilm] || dataRequest.collection[selectedIndex];
          if (!selectedSlug) {
            const warningCaption =
              "Số tập bạn chọn không có trong danh sách phim.\nVui lòng thử lại với tập phim khác!";
            await sendMessageFailed(api, message, warningCaption, false, 30000);
            return;
          }
          uniqueId = selectedFilm.title + ` (${dataRequest.type}) - Tập ` + slugFilm;
          cachedVideo = await getCachedMedia(PLATFORM_HH3D, uniqueId, quality, uniqueId);
          if (cachedVideo) {
            urlVideo = cachedVideo.fileUrl;
          } else {
            const sendPlsWaitObj = { caption: "Đang lấy dữ liệu phim, vui lòng chờ xíuuu..." };
            await sendMessageCompleteRequest(api, message, sendPlsWaitObj, 10000);
            urlFlim = selectedSlug.linkFilm;

            const clientAxios = getClientAxios();
            const responseDataFilm = await clientAxios.get(urlFlim);
            let $ = cheerio.load(responseDataFilm.data);

            const scriptTags = $("script");
            let linksObject = [];

            scriptTags.each((index, script) => {
              const scriptContent = $(script).html();
              if (scriptContent && scriptContent.includes("var $checkFbo =")) {
                const regex = /var \$checkLink(\d+) = "(.*?)";/g;
                let match;
                while ((match = regex.exec(scriptContent)) !== null) {
                  const value = match[2];
                  linksObject.push(value);
                }
              }
            });

            let tempFilePath,
              isHaveLink = false;

            for (const linkActive of linksObject) {
              if (linkActive.includes("/play-fb")) {
                const responseFilmNow = await clientAxios.get(linkActive);
                let $ = cheerio.load(responseFilmNow.data);
                const scriptTags = $("script");
                for (const script of scriptTags) {
                  const scriptContent = $(script).html();
                  if (scriptContent && scriptContent.includes("var cccc =")) {
                    const regex = /var cccc = "(.*?)"/;
                    const match = scriptContent.match(regex);
                    if (match && match[1]) {
                      urlVideo = match[1];
                      isHaveLink = true;
                      break;
                    }
                  }
                }
              } else if (linkActive.endsWith("m3u8")) {
                tempFilePath = path.join(tempDir, `${randomIDTemp()}.mp4`);
                try {
                  let linkM3U8 = linkActive;
                  if (!linkM3U8.startsWith("http")) {
                    linkM3U8 = "https://yanhh3d.vip/play-hls-v2/play/" + linkM3U8;
                  }
                  linkM3U8 = linkM3U8.replace("/play/", "/read/");
                  let caption = `Đang tiến hành tải phim...!`;
                  await sendMessageComplete(api, message, caption, false, 30000);
                  try {
                    urlVideo = await downloadsCache.getDataDownload(api, message, linkM3U8, {
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
                    await api.addReaction("UNDO", message);
                    await api.addReaction("TIEUTAN", message);
                    return;
                  }
                  isHaveLink = true;
                } catch (error) {
                  console.log(error);
                  const caption =
                    "Không thể lấy dữ liệu của tập phim này, vui lòng thử lại với tập phim khác" +
                    " hoặc xem phim trực tiếp tại: \nLink phim: " +
                    urlFlim;
                  await sendMessageFailed(api, message, caption, false, 30000);
                  await api.addReaction("UNDO", message);
                  await api.addReaction("TIEUTAN", message);
                  return;
                } finally {
                  await deleteFile(tempFilePath);
                }
              } else if (linkActive.includes("www.facebook.com/plugins")) {
                const [_, linkPluginFacebook] = linkActive.split("href=");
                if (linkPluginFacebook) {
                  const streamLink = await youtubeDl(decodeURIComponent(linkPluginFacebook), {
                    dumpSingleJson: true,
                    noWarnings: true,
                    noCheckCertificate: true,
                    preferFreeFormats: true,
                    youtubeSkipDashManifest: true,
                  });
                  let findLink = streamLink.formats.find((item) => item["format_id"] === "hd");
                  if (findLink) {
                    urlVideo = findLink.url;
                    isHaveLink = true;
                  }
                }
              } else if (linkActive.includes("cdn.ink") || linkActive.includes("hlstream")) {
                tempFilePath = path.join(tempDir, `${randomIDTemp()}.mp4`);
                try {
                  const linkM3U8 = linkActive + "/master.html";
                  let caption = `Đang tiến hành tải phim...!`;
                  await sendMessageComplete(api, message, caption, false, 30000);
                  try {
                    urlVideo = await downloadsCache.getDataDownload(api, message, linkM3U8, {
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
                    await api.addReaction("UNDO", message);
                    await api.addReaction("TIEUTAN", message);
                    return;
                  }
                  isHaveLink = true;
                } catch (error) {
                  console.log(error);
                  const caption =
                    "Không thể lấy dữ liệu của tập phim này, vui lòng thử lại với tập phim khác" +
                    " hoặc xem phim trực tiếp tại: \nLink phim: " +
                    urlFlim;
                  await sendMessageFailed(api, message, caption, false, 30000);
                  await api.addReaction("UNDO", message);
                  await api.addReaction("TIEUTAN", message);
                  return;
                } finally {
                  await deleteFile(tempFilePath);
                }
              }
              if (isHaveLink) break;
            }

            if (!isHaveLink) {
              const caption =
                "Không thể lấy dữ liệu của tập phim này, vui lòng thử lại với tập phim khác" +
                " hoặc xem phim trực tiếp tại: \nLink phim: " +
                urlFlim;
              await sendMessageFailed(api, message, caption, false, 30000);
              await api.addReaction("UNDO", message);
              await api.addReaction("TIEUTAN", message);
              return;
            }

            setCacheData(PLATFORM_HH3D, uniqueId, { fileUrl: urlVideo, title: uniqueId }, quality);
          }
          break;

        case "vsub":
          slugFilm = removeMention(message);
          selectedSlug = dataRequest.collection[slugFilm] || dataRequest.collection[selectedIndex];
          if (!selectedSlug) {
            const warningCaption =
              "Số tập bạn chọn không có trong danh sách phim.\nVui lòng thử lại với tập phim khác!";
            await sendMessageFailed(api, message, warningCaption, false, 30000);
            return;
          }
          uniqueId = selectedFilm.title + ` (${dataRequest.type}) - Tập ` + slugFilm;
          cachedVideo = await getCachedMedia(PLATFORM_HH3D, uniqueId, quality, uniqueId);
          if (cachedVideo) {
            urlVideo = cachedVideo.fileUrl;
          } else {
            const halim_cfg = dataRequest.halim_cfg;
            urlFlim = halim_cfg.post_url + `/${selectedSlug.slug}-sv1.html`;
            const clientAxios = getClientAxios();
            let response;
            const subsvIds = ["", "1", "2", "3", "4"];
            let tempFilePath;

            let complete = false;
            let caption = `Đang tiến hành tải phim...!`;
            await sendMessageComplete(api, message, caption, false, 30000);
            for (const subId of subsvIds) {
              try {
                try {
                  response = await clientAxios.get(`${URL_HH3D_VIETSUB_NOW}/wp-content/themes/halimmovies/player.php`, {
                    params: {
                      episode_slug: selectedSlug.slug,
                      server_id: "1",
                      subsv_id: subId,
                      post_id: halim_cfg.post_id,
                    },
                  });
                } catch (error) {
                  const page = await launchPageBrowserReal();
                  await page.goto(
                    `${URL_HH3D_VIETSUB_NOW}/wp-content/themes/halimmovies/player.php?episode_slug=${selectedSlug.slug}&server_id=1&subsv_id=${subId}&post_id=${halim_cfg.post_id}`,
                    { waitUntil: "domcontentloaded" }
                  );
                  const html = await page.content();
                  const match = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
                  if (!match) throw new Error("Không tìm thấy dữ liệu JSON trong trang player.php");
                  response = { data: JSON.parse(match[1]) };
                }
                tempFilePath = path.join(tempDir, `${randomIDTemp()}.mp4`);
                urlVideo = await downloadsCache.getDataDownload(api, message, response.data.file, {
                  type: "m3u8",
                  path: tempFilePath,
                  headers: {
                    "sec-ch-ua": '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
                    "sec-ch-ua-mobile": "?0",
                    "sec-ch-ua-platform": '"Windows"',
                    Referer: `${URL_HH3D_VIETSUB_NOW}`,
                  },
                });
                setCacheData(PLATFORM_HH3D, uniqueId, { fileUrl: urlVideo, title: uniqueId }, quality);
                complete = true;
                break;
              } catch (error) {
                console.error(
                  `Lỗi khi xử lý phim ${selectedFilm.title} với server ${subId ? subId : "default"}: `,
                  error
                );
              } finally {
                await deleteFile(tempFilePath);
              }
            }
            if (!complete) {
              const warningCaption =
                `Có lỗi xảy ra khi xử lý dữ liệu, vui lòng thử lại sau hoặc liên hệ Admin Bot Leader nếu lỗi chưa được khắc phục..., ` +
                "\n\nHoặc vui lòng xem phim trực tiếp tại: \nLink phim: " +
                urlFlim;
              await sendMessageFailed(api, message, warningCaption, false, 180000);
              await api.addReaction("UNDO", message);
              await api.addReaction("TIEUTAN", message);
              return;
            }
          }
          break;
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
                `🈳|🎧 Chuyển Ngữ: ${
                  dataRequest.type === "thm"
                    ? selectedSlug.type || "Không xác định"
                    : dataRequest.type === "vsub"
                    ? "Vietsub"
                    : "Không xác định"
                }\n` +
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
                  `🈳|🎧 Chuyển Ngữ: ${
                    dataRequest.type === "thm"
                      ? "Thuyết Minh"
                      : dataRequest.type === "vsub"
                      ? "Vietsub"
                      : "Không xác định"
                  }\n` +
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
      const captErr = "Lỗi khi xử lý lệnh xem phim hoạt hình 3D Trung Quốc, vui lòng liên hệ Admin để kiểm tra lỗi";
      console.error("Lỗi khi xử lý trạng thái phản hồi 2 của phim hoạt hình 3D Trung Quốc: ", error);
      await sendMessageFailed(api, message, captErr, false, 30000);
      await api.addReaction("UNDO", message);
      await api.addReaction("TIEUTAN", message);
    }
  }
  return true;
}

export async function handleHoatHinh3DReply(api, message) {
  const senderId = message.data.uidFrom;
  const idBot = api.getBotId();

  try {
    if (!message.data.quote || !message.data.quote.globalMsgId) return false;

    const quotedMsgId = message.data.quote.globalMsgId.toString();

    if (!listFilmHH3D.has(quotedMsgId)) return false;

    const dataFilmHH3D = listFilmHH3D.get(quotedMsgId);
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
    listFilmHH3D.delete(quotedMsgId);

    await processStageReply(api, message, dataFilmHH3D, selectedIndex);
    return true;
  } catch (error) {
    const captErr = "Lỗi khi xử lý lệnh xem phim hoạt hình 3D Trung Quốc, vui lòng liên hệ Admin để kiểm tra lỗi";
    console.error("Lỗi khi xử lý phản hồi lệnh phim hoạt hình 3D Trung Quốc:", error.message);
    await sendMessageFailed(api, message, captErr, false, 30000);
    return true;
  }
}
