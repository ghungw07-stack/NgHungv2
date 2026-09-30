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
import { findRecentMessages } from "../../../commands/bot-manager/recent-message.js";

const URL_LAUPHIM = "https://phim.wbug.qzz.io";
const TIME_LIVE_MESSAGE = 86400000;

export const PLATFORM_LAUPHIM = "lauphim";

const CONFIG = {
  maxResults: 10,
  timeWaitSelection: 60000,
  optionCacheTime: 10 * 60 * 1000,
};

// Helper: xoá tin nhắn của bot (thay cho ./delete-message-cache.js không tồn tại)
async function deleteBotMessage(api, message, msgId) {
  if (!msgId) return;
  try {
    const recent = await findRecentMessages(api, message, msgId).catch(() => null);
    const msgDel = {
      type: message.type,
      threadId: message.threadId,
      data: {
        cliMsgId: recent?.cliMsgId || message.data?.quote?.cliMsgId || Date.now(),
        msgId: String(msgId),
        uidFrom: api.getBotId(),
      },
    };
    await api.deleteMessage(msgDel, false);
  } catch {}
}

const FALLBACK_GENRES = [
  "Hành Động", "Miền Tây", "Trẻ Em", "Lịch Sử", "Cổ Trang", "Chiến Tranh", "Viễn Tưởng",
  "Kinh Dị", "Tài Liệu", "Bí Ẩn", "Phim 18+", "Tình Cảm", "Tâm Lý", "Thể Thao",
  "Phiêu Lưu", "Âm Nhạc", "Gia Đình", "Học Đường", "Hài Hước", "Hình Sự", "Võ Thuật",
  "Khoa Học", "Thần Thoại", "Chính Kịch", "Kinh Điển", "Phim Ngắn",
];

const FALLBACK_COUNTRIES = [
  "Việt Nam", "Trung Quốc", "Thái Lan", "Hồng Kông", "Pháp", "Đức", "Hà Lan", "Mexico",
  "Thụy Điển", "Philippines", "Đan Mạch", "Thụy Sĩ", "Ukraina", "Hàn Quốc", "Âu Mỹ",
  "Ấn Độ", "Canada", "Tây Ban Nha", "Indonesia", "Ba Lan", "Malaysia", "Bồ Đào Nha",
  "UAE", "Châu Phi", "Ả Rập Xê Út", "Nhật Bản", "Đài Loan", "Anh", "Quốc Gia Khác",
  "Thổ Nhĩ Kỳ", "Nga", "Úc", "Brazil", "Ý", "Na Uy", "Nam Phi",
];

const listFilmLauPhim = new Map();
let optionsCache = {
  genres: FALLBACK_GENRES,
  countries: FALLBACK_COUNTRIES,
  timestamp: 0,
};

schedule.scheduleJob("*/5 * * * * *", () => {
  const currentTime = Date.now();
  for (const [msgId, data] of listFilmLauPhim.entries()) {
    if (currentTime - data.timestamp > CONFIG.timeWaitSelection) {
      listFilmLauPhim.delete(msgId);
    }
  }
});

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractPageSuffix(input) {
  let keyword = String(input || "").trim();
  let page = 1;
  let limit = CONFIG.maxResults;

  const suffixMatch = keyword.match(/\s*&&\s*(\d+)\s*$/);
  if (suffixMatch) {
    limit = Math.max(1, parseInt(suffixMatch[1], 10) || CONFIG.maxResults);
    keyword = keyword.slice(0, suffixMatch.index).trim();
  }

  const pageMatch = keyword.match(/\s+page\s+(\d+)\s*$/i);
  if (pageMatch) {
    page = Math.max(1, parseInt(pageMatch[1], 10) || page);
    keyword = keyword.slice(0, pageMatch.index).trim();
  }

  return { keyword, page, limit };
}

function getNamesFromList(list) {
  return Array.isArray(list) ? list.map((item) => item?.name || item).filter(Boolean) : [];
}

function normalizeFilmItem(item) {
  const title = decodeHtmlEntities(item?.name || item?.title || "");
  const originalTitle = decodeHtmlEntities(item?.original_name || item?.originalTitle || "");
  const genres = getNamesFromList(item?.genres || item?.category?.genre?.list);
  const countries = getNamesFromList(item?.countries || item?.category?.country?.list);
  const years = getNamesFromList(item?.years || item?.category?.year?.list);
  const formats = getNamesFromList(item?.formats || item?.category?.format?.list);
  const episode = [item?.current_episode, item?.quality, item?.language].filter(Boolean).join(" | ");

  return {
    id: item?.id || item?.slug || title,
    slug: item?.slug,
    title,
    originalTitle,
    thumbnail: item?.thumb_url || item?.poster_url || item?.thumbnail || "",
    poster: item?.poster_url || item?.thumb_url || item?.thumbnail || "",
    episode,
    currentEpisode: item?.current_episode || "",
    quality: item?.quality || "",
    language: item?.language || "",
    time: item?.time || "",
    rating: item?.rating || 0,
    views: item?.views || 0,
    genres,
    countries,
    years,
    formats,
  };
}

function getFilmMeta(item) {
  return [
    item.episode,
    item.originalTitle,
    item.countries?.length ? item.countries.join(", ") : "",
    item.years?.length ? item.years.join(", ") : "",
  ]
    .filter(Boolean)
    .join(" - ");
}

function findOptionByInput(input, options) {
  const normalizedInput = normalizeText(input);
  if (!normalizedInput) return null;

  return (
    options.find((option) => normalizeText(option) === normalizedInput) ||
    options.find((option) => normalizeText(option) === `phim ${normalizedInput}`) ||
    null
  );
}

function stripInputPrefix(keyword, prefixes) {
  const normalizedKeyword = normalizeText(keyword);
  for (const prefix of prefixes) {
    const normalizedPrefix = normalizeText(prefix);
    if (normalizedKeyword === normalizedPrefix) return "";
    if (normalizedKeyword.startsWith(`${normalizedPrefix} `)) {
      return keyword.split(/\s+/).slice(prefix.split(/\s+/).length).join(" ").trim();
    }
  }
  return keyword;
}

async function getLauPhimOptions() {
  if (Date.now() - optionsCache.timestamp < CONFIG.optionCacheTime) {
    return optionsCache;
  }

  try {
    const client = getClientAxios();
    const [genresResponse, countriesResponse] = await Promise.all([
      client.get(`${URL_LAUPHIM}/api/genres`),
      client.get(`${URL_LAUPHIM}/api/countries`),
    ]);

    optionsCache = {
      genres: Array.isArray(genresResponse.data) && genresResponse.data.length ? genresResponse.data : FALLBACK_GENRES,
      countries:
        Array.isArray(countriesResponse.data) && countriesResponse.data.length
          ? countriesResponse.data
          : FALLBACK_COUNTRIES,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error("Lỗi khi lấy danh mục LauPhim:", error.message);
    optionsCache = {
      genres: FALLBACK_GENRES,
      countries: FALLBACK_COUNTRIES,
      timestamp: Date.now(),
    };
  }

  return optionsCache;
}

async function parseLauPhimInput(rawKeyword) {
  const { keyword, page, limit } = extractPageSuffix(rawKeyword);
  const normalizedKeyword = normalizeText(keyword);
  const { genres, countries } = await getLauPhimOptions();

  if (!normalizedKeyword) {
    return { type: "latest", page, limit, label: "Phim mới cập nhật" };
  }

  if (["help", "huong dan", "hdsd"].includes(normalizedKeyword)) {
    return { type: "help", page, limit, label: "Hướng dẫn" };
  }

  if (["thinh hanh", "trending", "hot", "popular", "top"].includes(normalizedKeyword)) {
    return { type: "trending", page, limit, label: "Phim thịnh hành" };
  }

  if (["phim le", "le", "movie", "single"].includes(normalizedKeyword)) {
    return { type: "format", value: "phim-lẻ", page, limit, label: "Phim lẻ" };
  }

  if (["phim bo", "bo", "series"].includes(normalizedKeyword)) {
    return { type: "format", value: "phim-bộ", page, limit, label: "Phim bộ" };
  }

  if (["xem chung", "watch party", "watchparty", "room", "phong"].includes(normalizedKeyword)) {
    return { type: "watch-party", page, limit, label: "Phòng xem chung" };
  }

  const genreKeyword = stripInputPrefix(keyword, ["thể loại", "the loai", "genre", "tl"]);
  const matchedGenre = findOptionByInput(genreKeyword, genres);
  if (matchedGenre) {
    return { type: "genre", value: matchedGenre, page, limit, label: `Thể loại ${matchedGenre}` };
  }

  const countryKeyword = stripInputPrefix(keyword, ["quốc gia", "quoc gia", "country", "qg"]);
  const matchedCountry = findOptionByInput(countryKeyword, countries);
  if (matchedCountry) {
    return { type: "country", value: matchedCountry, page, limit, label: `Quốc gia ${matchedCountry}` };
  }

  return { type: "search", value: keyword, page, limit, label: `Từ khóa "${keyword}"` };
}

async function fetchFilteredFilms(params) {
  const client = getClientAxios();
  const response = await client.get(`${URL_LAUPHIM}/api/films/filter`, {
    params: { page: 1, limit: CONFIG.maxResults, ...params },
  });
  return (response.data?.films || []).map(normalizeFilmItem);
}

async function fetchSearchFilms(keyword, page, limit) {
  const client = getClientAxios();
  const response = await client.get(`${URL_LAUPHIM}/api/films/search`, {
    params: { q: keyword, page, limit: limit || CONFIG.maxResults },
  });
  return (response.data?.films || []).map(normalizeFilmItem);
}

async function fetchFilmDetail(slug) {
  if (!slug) throw new Error("Thiếu slug phim LauPhim");
  const client = getClientAxios();
  const response = await client.get(`${URL_LAUPHIM}/api/films/${slug}`);
  const movie = response.data?.movie || response.data?.data?.movie || response.data?.data || response.data;
  if (!movie || !movie.slug) throw new Error("Không tìm thấy thông tin phim LauPhim");
  return movie;
}

async function fetchWatchPartyRooms(page, limit) {
  const client = getClientAxios();
  const requestLimit = limit || CONFIG.maxResults;
  const response = await client.get(`${URL_LAUPHIM}/api/watch-party/rooms`, {
    params: { page, limit: requestLimit },
  });

  const rooms = Array.isArray(response.data?.rooms) ? response.data.rooms : [];
  const start = rooms.length > requestLimit ? (page - 1) * requestLimit : 0;
  const selectedRooms = rooms.length > requestLimit ? rooms.slice(start, start + requestLimit) : rooms;

  const roomFilms = await Promise.all(
    selectedRooms.map(async (room) => {
      let movie = null;
      try {
        if (room.currentFilmSlug) movie = await fetchFilmDetail(room.currentFilmSlug);
      } catch (error) {
        console.error("Lỗi khi lấy phim trong phòng xem chung LauPhim:", error.message);
      }

      const film = movie ? normalizeFilmItem(movie) : null;
      return {
        kind: "watch-party-room",
        id: room.id || `room-${room.roomNumber}`,
        title: room.name || `Phòng xem chung #${room.roomNumber || ""}`.trim(),
        originalTitle: film?.title || room.currentFilmSlug || "",
        thumbnail: film?.thumbnail || film?.poster || "",
        poster: film?.poster || film?.thumbnail || "",
        slug: room.currentFilmSlug,
        currentEpisodeSlug: room.currentEpisodeSlug,
        currentEpisodeName: room.currentEpisodeName,
        currentServerIdx: Number.isInteger(room.currentServerIdx) ? room.currentServerIdx : 0,
        roomLink: room.id ? `${URL_LAUPHIM}/xem-chung/phong/${room.id}` : URL_LAUPHIM + "/xem-chung",
        episode: [
          film?.title || room.currentFilmSlug,
          room.currentEpisodeName,
          `${room.memberCount || 0}/${room.memberLimit || "?"} người`,
          room.status === "open" ? "Đang mở" : room.status,
        ]
          .filter(Boolean)
          .join(" | "),
      };
    })
  );

  return roomFilms.filter((room) => room.slug);
}

async function fetchLauPhimByRequest(request) {
  switch (request.type) {
    case "latest":
      return fetchFilteredFilms({ sort: "latest", page: request.page, limit: request.limit });
    case "trending":
      return fetchFilteredFilms({ sort: "popular", page: request.page, limit: request.limit });
    case "format":
      return fetchFilteredFilms({ format: request.value, page: request.page, limit: request.limit });
    case "genre":
      return fetchFilteredFilms({ genre: request.value, page: request.page, limit: request.limit });
    case "country":
      return fetchFilteredFilms({ country: request.value, page: request.page, limit: request.limit });
    case "watch-party":
      return fetchWatchPartyRooms(request.page, request.limit);
    case "search":
      return fetchSearchFilms(request.value, request.page, request.limit);
    default:
      return [];
  }
}

function normalizeEpisodeKey(value) {
  const raw = String(value || "").trim();
  const normalized = normalizeText(raw);
  const episodeMatch =
    normalized.match(/(?:^|\s)(?:tap|ep|episode)\s*0*(\d+)(?:\s|$)/) || normalized.match(/^0*(\d+)$/);
  if (episodeMatch) return String(parseInt(episodeMatch[1], 10));
  return raw;
}

function getPlayableUrl(episode) {
  if (episode?.m3u8) return episode.m3u8;
  if (episode?.embed) {
    try {
      const url = new URL(episode.embed);
      const sourceUrl = url.searchParams.get("url");
      if (sourceUrl) return decodeURIComponent(sourceUrl);
    } catch {
      return episode.embed;
    }
  }
  return "";
}

function buildEpisodeCollection(movie, preferredServerIdx = 0) {
  const collection = {};
  const keyMovieData = [];
  const servers = Array.isArray(movie?.episodes) ? movie.episodes : [];
  const serverIndexes = [];

  if (servers[preferredServerIdx]) serverIndexes.push(preferredServerIdx);
  servers.forEach((_, index) => {
    if (!serverIndexes.includes(index)) serverIndexes.push(index);
  });

  for (const serverIndex of serverIndexes) {
    const server = servers[serverIndex];
    const items = Array.isArray(server?.items) ? server.items : [];

    for (const item of items) {
      const key = normalizeEpisodeKey(item.name || item.slug);
      const playableUrl = getPlayableUrl(item);
      if (!key || (!playableUrl && collection[key])) continue;

      if (!collection[key]) keyMovieData.push(key);
      if (!collection[key] || (!getPlayableUrl(collection[key]) && playableUrl)) {
        collection[key] = {
          ...item,
          key,
          episodeName: item.name || key,
          serverName: server.server_name || `Server ${serverIndex + 1}`,
          m3u8: playableUrl,
        };
      }
      if (item.name && !collection[item.name]) collection[item.name] = collection[key];
      if (item.slug && !collection[item.slug]) collection[item.slug] = collection[key];
    }
  }

  return { collection, keyMovieData };
}

function findEpisodeKeyBySlug(collection, episodeSlug) {
  if (!episodeSlug) return null;
  return Object.keys(collection).find((key) => collection[key]?.slug === episodeSlug) || null;
}

function getEpisodeSelection(collection, selection) {
  const raw = String(selection || "").trim();
  const normalizedKey = normalizeEpisodeKey(raw);
  return collection[raw] || collection[normalizedKey] || collection[raw.toUpperCase()] || collection[raw.toLowerCase()];
}

async function downloadThumbnail(thumbnailUrl) {
  if (!thumbnailUrl) return null;
  const thumbnailPath = path.resolve(tempDir, `${randomIDTemp()}.jpg`);
  try {
    const client = getClientAxios();
    const typeImage = await checkExstentionFileRemote(thumbnailUrl);
    const response = await client.get(thumbnailUrl, { responseType: "arraybuffer" });
    const buffer = Buffer.from(response.data);
    if (typeImage === "webp") {
      await sharp(buffer).jpeg().toFile(thumbnailPath);
    } else {
      await writeFilePromise(thumbnailPath, buffer);
    }
    return thumbnailPath;
  } catch (error) {
    console.error("Lỗi khi tải thumbnail LauPhim:", error.message);
    await deleteFile(thumbnailPath);
    return null;
  }
}

function getWatchUrl(movieSlug, episodeSlug) {
  if (!movieSlug || !episodeSlug) return URL_LAUPHIM;
  return `${URL_LAUPHIM}/xem/${movieSlug}/${episodeSlug}`;
}

async function sendLauPhimHelp(api, message, aliasCommand) {
  const prefix = getGlobalPrefix(api.getBotId());
  const caption =
    `Hướng dẫn dùng lệnh LauPhim:\n` +
    `${prefix}${aliasCommand} ước gì anh ta bị sét đánh\n` +
    `${prefix}${aliasCommand} hành động&&2\n` +
    `${prefix}${aliasCommand} quốc gia trung quốc&&3\n` +
    `${prefix}${aliasCommand} thịnh hành&&1\n` +
    `${prefix}${aliasCommand} phim lẻ&&1\n` +
    `${prefix}${aliasCommand} phim bộ&&1\n` +
    `${prefix}${aliasCommand} xem chung`;
  await sendMessageComplete(api, message, caption, false, 180000);
}

export async function handleLauPhimCommand(api, message, aliasCommand) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const keyword = content.replace(`${prefix}${aliasCommand}`, "").trim();

  let imagePath;
  try {
    const request = await parseLauPhimInput(keyword);

    if (request.type === "help") {
      await sendLauPhimHelp(api, message, aliasCommand);
      return;
    }

    let dataFilm = await fetchLauPhimByRequest(request);

    if (dataFilm && dataFilm.length > 0) {
      dataFilm = dataFilm.slice(0, request.limit);

      const formattedDataFilm = dataFilm.map((result) => ({
        title: result.title,
        artistsNames: getFilmMeta(result) || "Lẩu Phim",
        thumbnailM: result.thumbnail || result.poster,
      }));

      imagePath = await createSearchResultImage(formattedDataFilm);

      let responseText = `🔎 Kết quả LauPhim - ${request.label} (trang ${request.page}):\n`;
      responseText += `Hãy trả lời tin nhắn này với số thứ tự phim bạn muốn xem!`;

      const listMessage = await sendMessageCompleteRequest(
        api,
        message,
        { caption: responseText, imagePath },
        CONFIG.timeWaitSelection
      );
      const quotedMsgId = listMessage?.message?.msgId || listMessage?.attachment?.[0]?.msgId;

      listFilmLauPhim.set(quotedMsgId.toString(), {
        userRequest: message.data.uidFrom,
        collection: dataFilm,
        timestamp: Date.now(),
        stage: 1,
      });
      setSelectionsMapData(message.data.uidFrom, {
        quotedMsgId: quotedMsgId.toString(),
        collection: dataFilm,
        timestamp: Date.now(),
        platform: PLATFORM_LAUPHIM,
        stage: 1,
      });
    } else {
      await sendMessageFailed(api, message, `Không tìm thấy kết quả LauPhim cho: ${keyword || "phim mới"}`, false, 30000);
    }
  } catch (error) {
    const captErr = "Lỗi khi xử lý lệnh xem phim LauPhim, vui lòng liên hệ Admin để kiểm tra lỗi";
    console.error("Lỗi khi xử lý lệnh xem phim LauPhim:", error);
    await sendMessageFailed(api, message, captErr, false, 30000);
  } finally {
    if (imagePath) await deleteFile(imagePath);
  }
}

export async function processLauPhimStageReply(api, message, dataRequest, selectionFinal) {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;

  if (dataRequest.stage === 1) {
    const selectedFilmRequest = dataRequest.collection[selectionFinal];
    let thumbnailPath = null;

    try {
      const movie = await fetchFilmDetail(selectedFilmRequest.slug);
      const selectedFilm = {
        ...selectedFilmRequest,
        ...normalizeFilmItem(movie),
        slug: movie.slug,
      };
      const { collection, keyMovieData } = buildEpisodeCollection(
        movie,
        selectedFilmRequest.kind === "watch-party-room" ? selectedFilmRequest.currentServerIdx : 0
      );

      if (keyMovieData.length === 0) {
        await sendMessageFailed(api, message, "Không tìm thấy tập phim nào cho phim này.\nVui lòng thử lại với phim khác!", false, 30000);
        return true;
      }

      const preferredEpisodeKey =
        selectedFilmRequest.kind === "watch-party-room"
          ? findEpisodeKeyBySlug(collection, selectedFilmRequest.currentEpisodeSlug)
          : null;

      if (preferredEpisodeKey || keyMovieData.length === 1) {
        return await processLauPhimStageReply(
          api,
          message,
          {
            userRequest: message.data.uidFrom,
            selectedFilm,
            collection,
            timestamp: Date.now(),
            stage: 2,
          },
          preferredEpisodeKey || keyMovieData[0]
        );
      }

      thumbnailPath = await downloadThumbnail(selectedFilm.poster || selectedFilm.thumbnail);

      let episodeResponseText = `🎬 Bạn đã chọn phim: ${selectedFilm.title}\n`;
      episodeResponseText += `📺 Tập hiện tại: ${selectedFilm.currentEpisode || selectedFilm.episode || "Đang cập nhật"}\n\n`;
      episodeResponseText += `Vui lòng nhập số tập phim mà bạn muốn xem!\n`;
      episodeResponseText += `[${formatSelectionRanges(keyMovieData)}]`;

      const responseMessage = await sendMessageCompleteRequest(
        api,
        message,
        thumbnailPath ? { caption: episodeResponseText, imagePath: thumbnailPath } : { caption: episodeResponseText },
        CONFIG.timeWaitSelection
      );

      if (responseMessage) {
        const quotedMsgId = responseMessage?.message?.msgId || responseMessage?.attachment?.[0]?.msgId;
        listFilmLauPhim.set(quotedMsgId.toString(), {
          userRequest: message.data.uidFrom,
          selectedFilm,
          collection,
          timestamp: Date.now(),
          stage: 2,
        });
        setSelectionsMapData(message.data.uidFrom, {
          quotedMsgId: quotedMsgId.toString(),
          collection,
          selectedFilm,
          timestamp: Date.now(),
          platform: PLATFORM_LAUPHIM,
          stage: 2,
        });
      }

      await api.addReaction("UNDO", message);
      await api.addReaction("LIKE", message);
    } catch (error) {
      console.error("Lỗi khi xử lý trạng thái phản hồi 1 của LauPhim:", error);
      await sendMessageFailed(api, message, "Không thể lấy danh sách tập phim LauPhim, vui lòng thử lại sau.", false, 30000);
      await api.addReaction("UNDO", message);
      await api.addReaction("TIEUTAN", message);
    } finally {
      if (thumbnailPath) await deleteFile(thumbnailPath);
    }
  } else if (dataRequest.stage === 2) {
    const selectedFilm = dataRequest.selectedFilm;
    const slugFilm = String(selectionFinal !== undefined && selectionFinal !== null ? selectionFinal : removeMention(message)).trim();
    const selectedSlug = getEpisodeSelection(dataRequest.collection, slugFilm);
    let urlVideo = [];
    let tempFilePath = null;
    const quality = selectedFilm.quality || "Auto";

    if (!selectedSlug) {
      const warningCaption = "Số tập bạn chọn không có trong danh sách phim.\nVui lòng thử lại với tập phim khác!";
      await sendMessageFailed(api, message, warningCaption, false, 30000);
      return true;
    }

    const linkM3U8 = getPlayableUrl(selectedSlug);
    const watchUrl = getWatchUrl(selectedFilm.slug, selectedSlug.slug);

    if (!linkM3U8) {
      const caption =
        "Không thể lấy dữ liệu của tập phim này, vui lòng thử lại với tập phim khác" +
        "\nHoặc xem phim trực tiếp tại:\n" +
        watchUrl;
      await sendMessageFailed(api, message, caption, false, 30000);
      await api.addReaction("UNDO", message);
      await api.addReaction("TIEUTAN", message);
      return true;
    }

    try {
      const episodeName = selectedSlug.episodeName || selectedSlug.name || slugFilm;
      const uniqueId = `${selectedFilm.title} - ${episodeName}`;
      const cachedVideo = await getCachedMedia(PLATFORM_LAUPHIM, uniqueId, quality, uniqueId);

      if (cachedVideo) {
        urlVideo = cachedVideo.fileUrl;
      } else {
        await sendMessageComplete(api, message, "Đang tiến hành tải phim...!", false, 30000);
        tempFilePath = path.join(tempDir, `${randomIDTemp()}.mp4`);

        try {
          const finalLinkM3U8 = linkM3U8.includes(".m3u8") ? await getLinkFileM3U8(linkM3U8) : null;
          const downloadUrl = finalLinkM3U8?.url || linkM3U8;
          const downloadType = finalLinkM3U8?.type || (downloadUrl.includes(".m3u8") ? "m3u8" : "mp4");

          urlVideo = await downloadsCache.getDataDownload(api, message, downloadUrl, {
            type: downloadType,
            path: tempFilePath,
            headers: {
              Referer: selectedSlug.embed || "https://player.phimapi.com/",
              Origin: URL_LAUPHIM,
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
            },
          });
        } catch (error) {
          console.error("Lỗi khi tải phim LauPhim:", error);
          const stageString = error?.stage
            ? error.stage === "Download To Local"
              ? "tải dữ liệu"
              : "upload dữ liệu lên máy chủ Zalo"
            : "xử lý dữ liệu";
          const warningCaption =
            `Có lỗi xảy ra khi ${stageString}, vui lòng thử lại sau hoặc liên hệ Admin Bot Leader nếu lỗi chưa được khắc phục...` +
            "\n\nHoặc vui lòng xem phim trực tiếp tại:\n" +
            watchUrl;
          await sendMessageFailed(api, message, warningCaption, false, 180000);
          await api.addReaction("UNDO", message);
          await api.addReaction("TIEUTAN", message);
          return true;
        } finally {
          if (tempFilePath) await deleteFile(tempFilePath);
        }

        setCacheData(PLATFORM_LAUPHIM, uniqueId, { fileUrl: urlVideo, title: uniqueId }, quality);
      }

      const typeString = typeof urlVideo === "string";
      if (urlVideo && (typeString || urlVideo.length > 0)) {
        await sendMessageComplete(api, message, "", false, 60000);
        if (typeString || urlVideo.length === 1) {
          const dataVideo = typeString ? null : urlVideo[0];
          await api.sendVideo({
            videoUrl: typeString ? urlVideo : dataVideo.fileUrl,
            threadId: message.threadId,
            threadType: message.type,
            thumbnail: selectedFilm.thumbnail || selectedFilm.poster,
            metaData: dataVideo,
            message: {
              text:
                `🎬 Phim: ${selectedFilm.title}\n` +
                `📺 Tập: ${selectedSlug.episodeName || selectedSlug.name || slugFilm}\n` +
                `🈳|🎧 Chuyển Ngữ: ${selectedFilm.language || "Không xác định"}\n` +
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
              thumbnail: selectedFilm.thumbnail || selectedFilm.poster,
              metaData: dataVideo,
              message: {
                text:
                  `🎬 Phim: ${selectedFilm.title}\n` +
                  `📺 Tập: ${selectedSlug.episodeName || selectedSlug.name || slugFilm} [Part ${index + 1}]\n` +
                  `🈳|🎧 Chuyển Ngữ: ${selectedFilm.language || "Không xác định"}\n` +
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
          "\nHoặc xem phim trực tiếp tại:\n" +
          watchUrl;
        await sendMessageFailed(api, message, warningCaption, false, 180000);
        await api.addReaction("UNDO", message);
        await api.addReaction("TIEUTAN", message);
      }
    } catch (error) {
      const captErr = "Lỗi khi xử lý lệnh xem phim từ LauPhim, vui lòng liên hệ Admin để kiểm tra lỗi";
      console.error("Lỗi khi xử lý trạng thái phản hồi 2 của LauPhim:", error);
      await sendMessageFailed(api, message, captErr, false, 30000);
      await api.addReaction("UNDO", message);
      await api.addReaction("TIEUTAN", message);
    }
  }

  return true;
}

export async function handleLauPhimReply(api, message) {
  const senderId = message.data.uidFrom;

  try {
    if (!message.data.quote || !message.data.quote.globalMsgId) return false;

    const quotedMsgId = message.data.quote.globalMsgId.toString();
    if (!listFilmLauPhim.has(quotedMsgId)) return false;

    const dataFilm = listFilmLauPhim.get(quotedMsgId);
    if (dataFilm.userRequest !== senderId) return false;

    const content = removeMention(message);
    let selectionFinal;

    if (dataFilm.stage === 1) {
      const selectedIndex = parseInt(content.split(" ")[0], 10) - 1;
      if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= dataFilm.collection.length) {
        await sendMessageFailed(api, message, "Lựa chọn không hợp lệ. Vui lòng chọn lại.", false, 30000);
        return true;
      }
      selectionFinal = selectedIndex;
    } else {
      selectionFinal = content.trim();
    }

    await deleteBotMessage(api, message, quotedMsgId);
    await api.addReaction("CLOCK", message);
    listFilmLauPhim.delete(quotedMsgId);

    await processLauPhimStageReply(api, message, dataFilm, selectionFinal);
    return true;
  } catch (error) {
    console.error("Lỗi khi xử lý phản hồi LauPhim:", error.message);
    await sendMessageFailed(api, message, "Lỗi khi xử lý phản hồi LauPhim, vui lòng thử lại sau.", false, 30000);
    return true;
  }
}

