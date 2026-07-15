import axios from "axios";
import path from "path";
import { CookieJar } from "tough-cookie";
import { wrapper } from "axios-cookiejar-support";
import * as cheerio from "cheerio";
import schedule from "node-schedule";

import { vos_oaoeuy } from "../../../../utils/format-text.js";
import { readFileSync, writeFileSync } from "../../../../utils/util.js";
import { findDescriptionOfVocabulary } from "../../assistant-ai/gemini.js";
import { JSON_DATA_PATH } from "../../../../utils/io-json.js";

const DATA_WORDS_CRAWL_PATH = path.join(JSON_DATA_PATH, "words-crawl.json");

const dataWordsCrawl = readDataWordsCrawl();
export const getDataWordsCrawl = () => dataWordsCrawl;
export const getDataWordsCrawlByKeyWord = (keyword) => dataWordsCrawl[keyword.toLowerCase()] || {};
let IS_SAVE_DATA = false;

schedule.scheduleJob("*/10 * * * * *", () => {
  if (IS_SAVE_DATA) {
    writeDataWordsCrawl();
    IS_SAVE_DATA = false;
  }
});

export function saveDataWordsCrawl() {
  IS_SAVE_DATA = true;
}

export function readDataWordsCrawl() {
  let config = {};
  try {
    const data = readFileSync(DATA_WORDS_CRAWL_PATH);
    config = JSON.parse(data);
  } catch (error) {
    console.error("Lỗi đọc tệp dataWordsCrawl.json:", error);
    config = {};
  }
  return config;
}

export function writeDataWordsCrawl() {
  try {
    writeFileSync(DATA_WORDS_CRAWL_PATH, JSON.stringify(dataWordsCrawl, null, 2));
  } catch (error) {
    console.error("Lỗi khi ghi file dataWordsCrawl.json:", error);
  }
}

export function addWordCrawlIntoData(keyword, description) {
  const keywordLower = keyword.toLowerCase();
  if (description && !dataWordsCrawl[keywordLower]) return;
  if (!dataWordsCrawl[keywordLower]) dataWordsCrawl[keywordLower] = {};
  if (description) dataWordsCrawl[keywordLower].extract = description;
  saveDataWordsCrawl();
}

export function getRandomKeyword() {
  if (dataWordsCrawl.length < 100) return null;
  const objKey = Object.keys(dataWordsCrawl);
  while (true) {
    const keyRandom = objKey[Math.floor(Math.random() * objKey.length)];
    if (dataWordsCrawl[keyRandom].beginLength) return keyRandom;
  }
}

export async function getDescriptionKeyword(keyword) {
  const keywordLower = keyword.toLowerCase();
  if (!dataWordsCrawl[keywordLower]) dataWordsCrawl[keywordLower] = {};
  const dataKey = dataWordsCrawl[keywordLower];
  if (!dataKey.extract) {
    dataKey.extract = await findDescriptionOfVocabulary(keyword);
    saveDataWordsCrawl();
  }
  return dataKey.extract;
}

export async function setBeginEndKeyword(keyword, { beginLength, endLength }) {
  const keywordLower = vos_oaoeuy(keyword.toLowerCase());
  if (!dataWordsCrawl[keywordLower]) dataWordsCrawl[keywordLower] = {};
  if (beginLength) dataWordsCrawl[keywordLower].beginLength = beginLength;
  if (endLength) dataWordsCrawl[keywordLower].endLength = endLength;
  if (beginLength || endLength) {
    let lastPhrase = keywordLower.split(/\s+/).pop().toLowerCase().trim();
    let listWordEnd = Object.keys(dataWordsCrawl).filter((key) => key.endsWith(" " + lastPhrase));
    for (const keys of listWordEnd) {
      if (beginLength) dataWordsCrawl[keys].beginLength = beginLength;
      if (endLength) dataWordsCrawl[keys].endLength = endLength;
    }
  }
  saveDataWordsCrawl();
}

export function getKeywordLocal(keyword) {
  const keywordLower = keyword.toLowerCase();
  if (!dataWordsCrawl[keywordLower]) return null;
  return dataWordsCrawl[keywordLower];
}

const API_NOITU = "https://noitu.pro";
const API_NOITUONLINE = "https://noituonline.com";
const API_NGONNGUS = "https://s.ngonngu.net";

async function makeApiRequest(url, errorMessage) {
  try {
    const response = await axios.get(url);
    return { success: true, data: response.data };
  } catch (error) {
    console.error(`${errorMessage}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

export async function getWordFromAPI() {
  try {
    const randomKeyword = getRandomKeyword();
    if (randomKeyword) return { text: randomKeyword };

    // Use API
    const response = await axios.get(`${API_NOITU}/init`);
    return response.data;
  } catch (error) {
    console.error("Lỗi khi gọi API từ điển:", error);
    return null;
  }
}

export async function getInitialWord() {
  const randomKeyword = getRandomKeyword();
  if (randomKeyword) return randomKeyword;

  //Use API
  const response = await makeApiRequest(`${API_NOITU}/init`, "Error fetching initial word");

  if (response.success && !response.data.error) {
    const nextWord = response.data.text.toLowerCase().trim();
    return nextWord;
  }
  return null;
}

export async function getWordNoiTuLocal(keyword) {
  let isValid = true;
  const lastPhrase = vos_oaoeuy(keyword.split(/\s+/).pop().toLowerCase().trim());
  let listwordBegin = Object.keys(dataWordsCrawl).filter((key) => key.startsWith(lastPhrase + " "));
  let listWordEnd = Object.keys(dataWordsCrawl).filter((key) => key.endsWith(" " + lastPhrase));
  const getKey = getKeywordLocal(keyword);
  if (!getKey?.beginLength) {
    const dataGetWord = await getNextWordNoiTuV2(lastPhrase);
    if (dataGetWord.end) listWordEnd = dataGetWord.end;
    if (dataGetWord.begin) {
      listwordBegin = dataGetWord.begin;
    } else {
      isValid = false;
    }
  }
  return {
    begin: listwordBegin,
    end: listWordEnd,
    isValid,
  };
}

export async function getNextWordNoiTu(lastPhrase) {
  const keyword = vos_oaoeuy(lastPhrase);
  const response = await makeApiRequest(
    `${API_NOITU}/answer?word=${encodeURIComponent(keyword)}`,
    "Error fetching next word"
  );

  if (response.success && response.data.success) {
    const nextWord = response.data.nextWord.text.toLowerCase().trim();
    return {
      isValid: true,
      reason: response.data.nextWord.chuan,
      nextWord,
      isWin: response.data.win,
    };
  }

  return { isValid: false, reason: "", nextWord: "" };
}

export const getNextWordNoiTuV2 = async (word) => {
  const jar = new CookieJar();
  const client = wrapper(axios.create({ jar }));
  const keyword = vos_oaoeuy(word.split(/\s+/).pop().toLowerCase().trim());

  try {
    const response = await client.get(`${API_NGONNGUS}/words/word-chain/`);

    if (response.status === 200) {
      const $ = cheerio.load(response.data);
      const csrfToken = $('input[name="csrfmiddlewaretoken"]').val();

      if (!csrfToken) {
        throw new Error("Không tìm thấy CSRF token");
      }

      const header = {
        accept: "*/*",
        "accept-language": "vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6",
        "cache-control": "no-cache",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        origin: "https://s.ngonngu.net",
        pragma: "no-cache",
        priority: "u=1, i",
        referer: "https://s.ngonngu.net/words/word-chain/",
        "sec-ch-ua": '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        "x-csrftoken": csrfToken,
        "x-requested-with": "XMLHttpRequest",
      };

      const data = new URLSearchParams({
        syllable: String(keyword),
        tool: "word-chain",
        action: "words_search",
      });

      const postResponse = await client.post(`${API_NGONNGUS}/ajax/`, data, {
        headers: header,
      });

      if (postResponse.status === 200) {
        const responseData = postResponse.data;

        if (responseData.end && responseData.end.length > 0) {
          for (let i = 0; i < responseData.end.length; i++) {
            const wordCount = responseData.end[i].split(" ").length;
            if (wordCount === 2) {
              responseData.end[i] = responseData.end[i].replace("#", "");
              addWordCrawlIntoData(responseData.end[i]);
            } else if (wordCount > 2) {
              responseData.end.splice(i, 1);
              i--;
            }
          }
        }
        if (responseData.begin && responseData.begin.length > 0) {
          for (let i = 0; i < responseData.begin.length; i++) {
            const wordCount = responseData.begin[i].split(" ").length;
            if (wordCount === 2) {
              responseData.begin[i] = responseData.begin[i].replace("#", "");
              addWordCrawlIntoData(responseData.begin[i]);
            } else if (wordCount > 2) {
              responseData.begin.splice(i, 1);
              i--;
            }
          }
        }
        return responseData;
      } else {
        throw new Error(`Lỗi khi gửi request, mã lỗi: ${postResponse.status}`);
      }
    } else {
      throw new Error(`Lỗi khi truy cập, mã lỗi: ${response.status}`);
    }
  } catch (error) {
    throw error;
  }
};

export async function getNextWordNoiTuV3(lastPhrase) {
  const keyword = vos_oaoeuy(lastPhrase);
  const response = await makeApiRequest(
    `${API_NOITUONLINE}/answer/${encodeURIComponent(keyword)}`,
    "Error fetching next word"
  );

  if (response.success && response.data.status) {
    const nextWord = response.data.next;
    return {
      isValid: true,
      nextWord,
      isWin: nextWord === "",
    };
  }

  return { isValid: false, nextWord: "", isWin: false };
}

export async function sohaFindTuDien(keyword) {
  try {
    const response = await axios.get("http://tratu.soha.vn/extensions/curl_suggest.php", {
      params: {
        search: keyword,
        dict: "vn_vn",
      },
      headers: {
        Accept: "*/*",
        "Accept-Language": "vi,vi-VN;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5,zh-TW;q=0.4,zh-CN;q=0.3,zh;q=0.2",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
      },
    });

    const meanMatch = response.data.match(/mean="([^"]*)"/);
    const textMatch = response.data.match(/>([^<]*)<\/rs>/);

    if (meanMatch && textMatch) {
      const meanRaw = meanMatch[1];
      const text = textMatch[1].trim();

      const extract = meanRaw
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/<[^>]*>/g, "")
        .replace("  ", ":")
        .trim();

      return extract;
    } else {
      return null;
    }
  } catch {
    return null;
  }
}
