import axios from "axios";
import { getGlobalPrefix } from "../../service.js";
import { removeMention } from "../../../utils/format-util.js";
import { sendMessageCompleteRequest, sendMessageWarningRequest } from "../../chat-zalo/chat-style/chat-style.js";

const CONFIG = {
  serpApiKey: process.env.SERP_API_KEY || "755946e3053bb93b46cd0fcbded4923d597f0565c4a351efefaaf16ea1b02c8e", // TODO: key đã lộ trong source -> đổi key mới, set qua SERP_API_KEY
  serpApiUrl: "https://serpapi.com/search",
  timeout: 15000,
  bannedKeywords: [
    // Từ nhạy cảm tiếng Việt
    "lồn", "l0n", "lon", "l.on", "l*n", "loz", "l0z", "l.z",
    "ngực", "nguc", "nguwc", "ngưc",
    "vú", "vu", "vếu", "veu", "du", "dú",
    "cặc", "cac", "cak", "kak", "cặk", "cứt", "cut", "shit",
    "buồi", "buoi", "b`uoi", "b.uoi",
    "địt", "dit", "đụ", "du", "đ!t", "đyt", "dyt",
    "đéo", "deo", "đít", "dit", "đ!t", "đụ", "du",
    "nứng", "nung", "nug", "nung",
    "bím", "bim", "b!m", "bịm", "bym",
    "chim", "ch1m", "chym",
    "mông", "mong", "m0ng", "m.ong",

    // Từ nhạy cảm tiếng Anh
    "sex", "sexy", "porn", "pornhub", "xxx", "18+",
    "dick", "cock", "penis", "pussy", "vagina", "boob", "breast",
    "nude", "naked", "hentai", "nsfw", "adult", "strip",
    "fuck", "fucking", "fck", "fuk", "fuking",
    "horny", "hot", "erotic", "ero",

    // Cụm từ
    "khiêu dâm", "khieu dam", "làm tình", "lam tinh",
    "gái gọi", "gai goi", "cave", "gái ngành", "gai nganh",
    "phim sex", "clip sex", "anh sex", "ảnh sex",
    "bộ ngực", "bo nguc", "vú to", "vu to",
    "show hàng", "show hang", "lộ hàng", "lo hang",
    "không mặc", "khong mac", "cởi đồ", "coi do",

    // Biến thể và viết tắt
    "ml", "đm", "dm", "vl", "vcl", "vlxx", "vlxxx",
    "cc", "cl", "đcm", "dcm", "cmm", "cdm", "đcmm",
    "s3x", "sexx", "sẽx", "sẽxx"
  ]
};

const searchGoogle = async (query, limit = 20) => {
  try {
    const params = {
      engine: "google",
      q: query,
      api_key: CONFIG.serpApiKey,
      num: limit,
      hl: "vi"
    };

    const response = await axios.get(CONFIG.serpApiUrl, {
      params,
      timeout: CONFIG.timeout
    });

    if (response.status !== 200 || !response.data) {
      console.error(`SerpAPI Error: ${response.status}`);
      return [];
    }

    const data = response.data;
    const organicResults = data.organic_results || [];

    const results = organicResults.slice(0, limit).map((item) => {
      return {
        title: item.title || '',
        link: item.link || item.url || '',
        snippet: item.snippet || item.about_this_result?.source?.description || 'Không có mô tả'
      };
    }).filter((item) => item.title && item.link);

    return results;

  } catch (error) {
    console.error("Lỗi khi tìm kiếm Google qua SerpAPI:", error.message || error);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);
    }
    return [];
  }
};

export async function handleGoogleCommand(api, message, aliasCommand) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const keyword = content.replace(`${prefix}${aliasCommand}`, "").trim();

  try {
    if (!keyword) {
      const object = {
        caption: `Vui lòng nhập từ khóa tìm kiếm\nVí dụ:\n${prefix}${aliasCommand} Nội dung cần tìm`,
      };
      return await sendMessageWarningRequest(api, message, object, 30000);
    }

    // Kiểm tra từ khóa bị cấm
    const queryLower = keyword.toLowerCase();
    const hasBannedKeyword = CONFIG.bannedKeywords.some(bannedKeyword =>
      queryLower.includes(bannedKeyword.toLowerCase()) ||
      queryLower.replace(/\s+/g, '').includes(bannedKeyword.toLowerCase())
    );

    if (hasBannedKeyword) {
      const object = {
        caption: `Từ khóa tìm kiếm này bị cấm!`,
      };
      return await sendMessageWarningRequest(api, message, object, 30000);
    }

    let results = await searchGoogle(keyword);

    if (results.length === 0) {
      const object = {
        caption: `Không tìm thấy kết quả nào cho từ khóa: ${keyword}`,
      };
      return await sendMessageWarningRequest(api, message, object, 30000);
    }

	results = results.slice(0, 10);

    let responseText = `🔎 Kết quả tìm kiếm cho "${keyword}":\n\n`;
    results.forEach((result, index) => {
      responseText += `${index + 1}. ${result.title}\n`;
      responseText += `🔗: ${result.link}\n\n`;
    });

    const object = {
      caption: responseText,
    };

    await sendMessageCompleteRequest(api, message, object, 180000);

  } catch (error) {
    console.error("Lỗi khi xử lý lệnh Google:", error);
    const object = {
      caption: "Đã xảy ra lỗi khi tìm kiếm. Vui lòng thử lại sau!",
    };
    await sendMessageWarningRequest(api, message, object, 30000);
  }
}
