import axios from "axios";
import * as cheerio from "cheerio";
import { LRUCache } from "lru-cache";
import { MessageMention } from "zlbotngh";
import {
  sendMessageCompleteRequest,
  sendMessageFailed,
  sendMessageWarningRequest,
} from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import http from "http";
import https from "https";
import { downloadAndConvertAudio } from "../../chat-zalo/chat-special/send-voice/process-audio.js";
import { removeMention } from "../../../utils/format-util.js";
import { sendVoiceMusic } from "../../chat-zalo/chat-special/send-voice/send-voice.js";
import { parseQuickSelection, setSelectionsMapData } from "../index.js";
import { getCachedMedia, setCacheData } from "../../../utils/link-platform-cache.js";
import { createSearchResultImage } from "../../../utils/canvas/search-canvas.js";
import { deleteFile } from "../../../utils/util.js";
import { asyncTaskManager } from "../../../utils/async-task.js";
import { createCircleWebp } from "../../chat-zalo/chat-special/send-sticker/create-webp.js";
import { capitalizeWords } from "../../../utils/format-text.js";

const PLATFORM = "nhaccuatui";
const TIME_TO_SELECT = 60000;

class NhacCuaTui {
  constructor() {
    this.baseUrl = "https://graph.nhaccuatui.com";
    this.deviceId = "402a08f1f59b8ffb";
    this.token =
      "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJkdCI6IjE3NTc2NzIzMDAyMDgiLCJuYmYiOjE3NTc2NzIzMDAsImxvZ2luTWV0aG9kIjoiNSIsImV4cGlyZWREYXRlIjoiMCIsImV4cCI6MTc4OTIwODMwMCwiZGV2aWNlaW5mbyI6IntcIkFkSURcIjpcIlwiLFwiQXBwTmFtZVwiOlwiV0VCXCIsXCJBcHBWZXJzaW9uXCI6XCIxXCIsXCJEZXZpY2VJRFwiOlwiNDAyYTA4ZjFmNTliOGZmYlwiLFwiRGV2aWNlTmFtZVwiOlwiXCIsXCJOZXR3b3JrXCI6XCJcIixcIk9zTmFtZVwiOlwiV0VCXCIsXCJPc1ZlcnNpb25cIjpcIldFQlwiLFwiUHJvdmlkZXJcIjpcIk5DVENvcnBcIixcIlVzZXJOYW1lXCI6XCJcIixcImlzVk5cIjpmYWxzZX0iLCJidmVkIjoiMCIsImRldmljZUlkIjoiNDAyYTA4ZjFmNTliOGZmYiIsImlhdCI6MTc1NzY3MjMwMCwidXQiOiIwIn0.f39Ot44bOpNqm26Z-93rVb5suMwzScTLZ9gTAS5qgys";
  }

  getHeaders() {
    const timestamp = Date.now().toString();
    return {
      accept: "*/*",
      "accept-language": "vi,vi-VN;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5,zh-TW;q=0.4,zh-CN;q=0.3,zh;q=0.2",
      authorization: this.token,
      priority: "u=1, i",
      "sec-ch-ua": '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
      timestamp: timestamp,
      "x-nct-appid": "6",
      "x-nct-deviceid": this.deviceId,
      "x-nct-language": "vi",
      "x-nct-os": "web",
      "x-nct-time": timestamp,
      "x-nct-token": this.token,
      "x-nct-userid": "0",
      "x-nct-uuid": this.deviceId,
      "x-nct-version": "1",
      Referer: "https://www.nhaccuatui.com/",
    };
  }

  async searchMusic(keyword) {
    try {
      const encodedKeyword = encodeURIComponent(keyword);
      const timestamp = Date.now();
      const url = `${this.baseUrl}/api/v1/search/song?keyword=${encodedKeyword}&pageindex=1&pagesize=30&correct=false&timestamp=${timestamp}`;

      const response = await axios.post(
        url,
        { keyword: keyword, pageindex: 1, pagesize: 30, isShowLoading: false },
        { headers: this.getHeaders() }
      );

      const results = {
        data: {
          items: [],
        },
      };

      if (response.data && response.data.data && response.data.data.songs) {
        response.data.data.songs.forEach((song) => {
          results.data.items.push({
            id: song.key,
            songLink: song.linkShare,
            title: song.name,
            artistsNames: song.artistName,
            thumbnail: song.image.replace(".jpg", "_600.jpg"),
            streamingStatus: song.statusPlay === 1 ? 1 : 2,
            isOfficial: song.statusPlay === 1,
            maxQuality: capitalizeWords(
              song.streamURL && song.streamURL.some((url) => url.type === "lossless")
                ? "lossless"
                : song.streamURL && song.streamURL.some((url) => url.type === "320")
                ? "320 Kbps"
                : "128 Kbps"
            ),
            duration: song.duration,
            streamURL: song.streamURL,
            qualityDownload: song.qualityDownload,
          });
        });
      }

      return results;
    } catch (error) {
      console.error("Lỗi khi tìm kiếm nhạc:", error);
      return {
        data: {
          items: [],
        },
      };
    }
  }

  async getLyric(songKey) {
    try {
      const timestamp = Date.now();
      const url = `${this.baseUrl}/api/v1/song/lyric/detail?songKey=${songKey}&timestamp=${timestamp}`;

      const response = await axios.get(url, {
        headers: this.getHeaders(),
      });

      return response.data;
    } catch (error) {
      console.error("Lỗi khi lấy lyric:", error);
      return {
        data: null,
        msg: "Không thể lấy lyric",
      };
    }
  }

  processSongData(songInfo, options = {}) {
    const isLosssless = options?.subCommand?.includes("lossless");
    let linkMusic;
    let quality;

    const losslessItem = songInfo.streamURL.find((item) => item.type === "lossless");
    const hqItem = songInfo.streamURL.find((item) => item.type === "320");
    const lqItem = songInfo.streamURL.find((item) => item.type === "128");

    if (isLosssless && losslessItem) {
      quality = losslessItem.typeUI;
      linkMusic = losslessItem.download;
    } else {
      if (hqItem && !hqItem.onlyVIP) {
        linkMusic = hqItem.download;
        quality = hqItem.typeUI;
      } else {
        linkMusic = lqItem.download;
        quality = lqItem.typeUI;
      }
    }

    return {
      songData: songInfo,
      linkMusic,
      quality,
    };
  }

  getSongInfo = async (songData, retryCount = 3) => {
    try {
      const response = await axios.get(songData.songLink, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Linux; Android 13; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36",
          Referer: "https://www.nhaccuatui.com/",
          cookie: "touchEnable=true;",
        },
        maxRedirects: 5,
        timeout: 10000,
        validateStatus: function (status) {
          return status >= 200 && status < 400;
        },
        retry: retryCount,
        retryDelay: (retryCount) => {
          return retryCount * 1000;
        },
      });

      const $ = cheerio.load(response.data);

      let key = null;
      const scripts = $("script").get();
      for (const script of scripts) {
        const content = $(script).html() || "";
        const keyMatch = content.match(/key1=([a-f0-9]{32})/i);
        if (keyMatch && keyMatch[1]) {
          key = keyMatch[1];
          break;
        }
      }

      let xmlUrl = ``;
      if (!key) {
        let foundKeyEncrypt = null;
        $("span#icon-play").each((i, el) => {
          const keyEncrypt = $(el).attr("keyencrypt");
          if (keyEncrypt) {
            foundKeyEncrypt = keyEncrypt;
            return false;
          }
        });
        if (foundKeyEncrypt) {
          xmlUrl = `https://www.nhaccuatui.com/flash/xml?html5=true&key1=${foundKeyEncrypt}`;
        } else {
          console.error("Không tìm thấy key hoặc xmlUrl trong HTML");
          return null;
        }
      } else {
        xmlUrl = `https://www.nhaccuatui.com/flash/xml?html5=true&key1=${key}`;
      }

      const streamUrl = await this.getStreamUrl(xmlUrl);

      return {
        artistsNames: songData.artistsNames,
        thumbnail: songData.thumbnail,
        streamUrl,
      };
    } catch (error) {
      console.error("Lỗi khi lấy thông tin bài hát:", error);

      if (retryCount > 0) {
        console.log(`Thử lại lần ${4 - retryCount}...`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return this.getSongInfo(songData, retryCount - 1);
      }
      return null;
    }
  };

  getStreamUrl = async (xmlUrl, retryCount = 3) => {
    try {
      const getXmlWithRetry = async (attempt = 0) => {
        try {
          const xmlResponse = await axios.get(xmlUrl, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "application/xml,text/xml,*/*",
            },
            timeout: 15000,
            maxRedirects: 5,
            validateStatus: function (status) {
              return status >= 200 && status < 400;
            },
            httpAgent: new http.Agent({ keepAlive: true }),
            httpsAgent: new https.Agent({ keepAlive: true }),
          });
          return xmlResponse;
        } catch (error) {
          if (attempt < 3 && (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT")) {
            console.log(`Retry XML request lần ${attempt + 1}...`);
            await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
            return getXmlWithRetry(attempt + 1);
          }
          throw error;
        }
      };

      const xmlResponse = await getXmlWithRetry();

      const $xml = cheerio.load(xmlResponse.data, {
        xmlMode: true,
      });

      let streamUrl, quality;
      try {
        streamUrl = $xml("locationHQ").text();
        quality = "HQ";
        streamUrl = streamUrl
          .replace(/<!\[CDATA\[|\]\]>/g, "")
          .replace(/[\n\r\t]/g, "")
          .trim();
      } catch {}
      if (!streamUrl) {
        quality = "SQ";
        streamUrl = $xml("location").text();
      }
      streamUrl = streamUrl
        .replace(/<!\[CDATA\[|\]\]>/g, "")
        .replace(/[\n\r\t]/g, "")
        .trim();

      try {
        new URL(streamUrl);
      } catch (e) {
        console.error("Stream URL không hợp lệ:", streamUrl);
        return null;
      }

      return {
        url: streamUrl,
        quality,
      };
    } catch (error) {
      console.error("Lỗi khi lấy stream URL:", error);

      if (retryCount > 0) {
        console.log(`Thử lại toàn bộ quá trình lần ${4 - retryCount}...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return this.getStreamUrl(xmlUrl, retryCount - 1);
      }
      return null;
    }
  };
}

const nhacCuaTuiInstance = new NhacCuaTui();

export async function searchMusicNhacCuaTui(keyword) {
  return nhacCuaTuiInstance.searchMusic(keyword);
}

export async function getLyricNhacCuaTui(songKey) {
  return nhacCuaTuiInstance.getLyric(songKey);
}

const musicSelectionsMap = new LRUCache({
  max: 500,
  ttl: TIME_TO_SELECT,
});

export async function handleNhacCuaTuiCommand(api, message, aliasCommand) {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  let imagePath = null;

  try {
    const content = removeMention(message);
    const prefix = getGlobalPrefix(api.getBotId());
    const commandContent = content.replace(`${prefix}${aliasCommand}`, "").trim();
    const quickSelection = parseQuickSelection(commandContent);
    const [keyword, numberMusic] = quickSelection.query.split("&&");

    if (!keyword) {
      const object = {
        caption: `Vui lòng nhập từ khóa tìm kiếm\nVí dụ:\n${prefix}${aliasCommand} Bài Hát Cần Tìm`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    const result = await nhacCuaTuiInstance.searchMusic(keyword);

    if (!result?.data?.items || result.data.items.length === 0) {
      const object = {
        caption: `Không tìm thấy bài hát nào với từ khóa: ${keyword}`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return;
    }

    const limit = parseInt(numberMusic) || 10;
    const songs = result.data.items.slice(0, limit);
    if (quickSelection.selectedIndex !== null) {
      const song = songs[quickSelection.selectedIndex];
      if (!song) {
        return await sendMessageWarningRequest(api, message, {
          caption: `Không có kết quả số ${quickSelection.selectedIndex + 1}.`,
        }, 30000);
      }
      await api.addReaction("CLOCK", message);
      return await handleSendTrackNhacCuaTui(api, message, song, quickSelection.option || "");
    }
    let musicListTxt = "Đây là danh sách bài hát trên NhacCuaTui mà tôi tìm thấy:\n";
    musicListTxt += "Hãy trả lời tin nhắn này với số index của bài hát bạn muốn nghe!\n";
    musicListTxt += "VD: 1 hoặc 1 lyric hoặc 1 lossless...";

    const songsCustom = songs.map((song) => ({
      title: song.title,
      artistsNames: song.artistsNames,
      thumbnailM: song.thumbnail,
      isOfficial: song.isOfficial,
      maxQuality: song.maxQuality,
    }));
    imagePath = await createSearchResultImage(songsCustom, api.getBotId());

    const object = {
      caption: musicListTxt,
      imagePath: imagePath,
    };
    const musicListMessage = await sendMessageCompleteRequest(api, message, object, TIME_TO_SELECT);

    const quotedMsgId = musicListMessage?.message?.msgId || musicListMessage?.attachment[0]?.msgId;

    musicSelectionsMap.set(quotedMsgId.toString(), {
      userRequest: senderId,
      collection: songs,
      timestamp: Date.now(),
    });
    setSelectionsMapData(senderId, {
      quotedMsgId: quotedMsgId.toString(),
      collection: songs,
      timestamp: Date.now(),
      platform: PLATFORM,
    });
  } catch (error) {
    console.error("Lỗi xử lý lệnh NhacCuaTui:", error);
    await api.sendMessage(
      {
        msg: `${senderName} Đã xảy ra lỗi khi xử lý lệnh của bạn. Vui lòng thử lại sau.`,
        mentions: [MessageMention(senderId, senderName.length, 0)],
        ttl: 30000,
      },
      message.threadId,
      message.type
    );
  } finally {
    if (imagePath) deleteFile(imagePath);
  }
}

export async function handleNhacCuaTuiReply(api, message) {
  const senderId = message.data.uidFrom;
  const idBot = api.getBotId();
  let track;

  try {
    if (!message.data.quote || !message.data.quote.globalMsgId) return false;

    const quotedMsgId = message.data.quote.globalMsgId.toString();
    if (!musicSelectionsMap.has(quotedMsgId)) return false;

    const musicData = musicSelectionsMap.get(quotedMsgId);
    if (musicData.userRequest !== senderId) return false;

    let selection = removeMention(message);
    let selectedIndex = selection.split(" ")[0];
    const subCommand = selection.split(" ").slice(1).join(" ").trim();
    selectedIndex = parseInt(selectedIndex) - 1;
    if (isNaN(selectedIndex)) {
      const object = {
        caption: `Lựa chọn không hợp lệ. Vui lòng chọn một số từ danh sách.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return true;
    }

    const { collection } = musicSelectionsMap.get(quotedMsgId);
    if (selectedIndex < 0 || selectedIndex >= collection.length) {
      const object = {
        caption: `Số bạn chọn không nằm trong danh sách. Vui lòng chọn lại.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return true;
    }

    track = collection[selectedIndex];
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
    musicSelectionsMap.delete(quotedMsgId);

    return await handleSendTrackNhacCuaTui(api, message, track, subCommand);
  } catch (error) {
    console.error("Lỗi xử lý reply NhacCuaTui:", error);
    const object = {
      caption: `Đã xảy ra lỗi khi xử lý lấy nhạc từ NhacCuaTui cho bạn, vui lòng thử lại sau.`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return true;
  }
}

export async function handleSendTrackNhacCuaTui(api, message, songInfo, subCommand) {
  const isCallLyric = subCommand?.includes("lyric");

  if (!songInfo || !songInfo.streamURL) {
    const object = { caption: `Không thể lấy thông tin bài hát này...` };
    await sendMessageFailed(api, message, object.caption, false, 30000);
    await api.addReaction("UNDO", message);
    await api.addReaction("TIEUTAN", message);
    throw new Error("Không thể lấy thông tin bài hát");
  }

  const [lyric, { linkMusic, quality }] = await Promise.all([
    isCallLyric ? nhacCuaTuiInstance.getLyric(songInfo.id) : Promise.resolve(null),
    nhacCuaTuiInstance.processSongData(songInfo, { subCommand }),
  ]);

  const cachedMusic = await getCachedMedia(PLATFORM, songInfo.id, quality, songInfo.title);
  let voiceUrl;

  const object = {
    caption: `Chờ lấy nhạc một chút, xong sẽ gọi cho hay.\n\n⏳ ${songInfo.title}\n🔊 Quality: ${quality}`,
  };

  if (cachedMusic) {
    voiceUrl = cachedMusic.fileUrl;
  } else {
    await sendMessageCompleteRequest(api, message, object, 5000);
    voiceUrl = await downloadAndConvertAudio(linkMusic, api, message, true);
    setCacheData(
      PLATFORM,
      songInfo.id,
      { fileUrl: voiceUrl, title: songInfo.title, artist: songInfo.artistsNames },
      quality
    );
  }

  const caption = `> From NhacCuaTui <\nNhạc Bạn Chọn Đây!!!`;

  const objectMusic = {
    trackId: songInfo.id,
    title: songInfo.title,
    artists: songInfo.artistsNames || "Unknown Artist",
    source: "NhacCuaTui",
    caption: caption,
    imageUrl: songInfo.thumbnail,
    voiceUrl: voiceUrl,
    quality: quality,
  };
  await sendVoiceMusic(api, message, objectMusic);

  if (subCommand && isCallLyric) {
    if (lyric && lyric.data && lyric.data.content) {
      let formattedLyric = "Lời bài hát:\n\n";
      formattedLyric += lyric.data.content;
      await api.sendMessage({ msg: formattedLyric, ttl: 3600000 }, message.threadId, message.type);
    }
  }

  return true;
}
