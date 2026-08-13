import axios from "axios";
import { getGlobalPrefix } from "../../service.js";
import { removeMention } from "../../../utils/format-util.js";
import { sendMessageCompleteRequest, sendMessageWarningRequest } from "../../chat-zalo/chat-style/chat-style.js";

const CONFIG = {
  serpApiKey: process.env.SERP_API_KEY || "755946e3053bb93b46cd0fcbded4923d597f0565c4a351efefaaf16ea1b02c8e", // TODO: key đã lộ trong source -> đổi key mới, set qua SERP_API_KEY
  serpApiUrl: "https://serpapi.com/search",
  timeout: 15000
};

const searchGoogleNews = async (query, gl = "us", hl = "en", limit = 10) => {
  try {
    const params = {
      engine: "google_news",
      q: query,
      gl: gl,
      hl: hl,
      api_key: CONFIG.serpApiKey
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
    const newsResults = data.news_results || [];

    return newsResults.slice(0, limit);

  } catch (error) {
    console.error("Lỗi khi tìm kiếm tin tức qua SerpAPI:", error.message || error);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);
    }
    return [];
  }
};

export async function handleGoogleNewsCommand(api, message, aliasCommand) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const query = content.replace(`${prefix}${aliasCommand}`, "").trim();

  try {
    if (!query) {
      const object = {
        caption: `Vui lòng nhập từ khóa tìm kiếm tin tức\nVí dụ:\n${prefix}${aliasCommand} pizza\n${prefix}${aliasCommand} công nghệ`,
      };
      return await sendMessageWarningRequest(api, message, object, 30000);
    }

    // Xác định ngôn ngữ và quốc gia từ query (có thể mở rộng sau)
    let gl = "us";
    let hl = "en";
    
    // Nếu query có chứa tiếng Việt, dùng tiếng Việt
    const vietnamesePattern = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
    if (vietnamesePattern.test(query)) {
      gl = "vn";
      hl = "vi";
    }

    const newsResults = await searchGoogleNews(query, gl, hl, 10);

    if (newsResults.length === 0) {
      const object = {
        caption: `Không tìm thấy tin tức nào cho từ khóa: ${query}`,
      };
      return await sendMessageWarningRequest(api, message, object, 30000);
    }

    // Format danh sách tin tức
    let responseText = `📰 Tin tức về "${query}"\n\n`;
    
    newsResults.forEach((news, index) => {
      responseText += `${index + 1}. ${news.title || 'Không có tiêu đề'}\n`;
      
      if (news.snippet) {
        responseText += `   ${news.snippet}\n`;
      }
      
      if (news.source) {
        responseText += `   📌 Nguồn: ${news.source}`;
        if (news.date) {
          responseText += ` - ${news.date}`;
        }
        responseText += `\n`;
      }
      
      if (news.link) {
        responseText += `   🔗 ${news.link}\n`;
      }
      
      responseText += `\n`;
    });

    const object = {
      caption: responseText,
    };

    await sendMessageCompleteRequest(api, message, object, 180000);

  } catch (error) {
    console.error("Lỗi khi xử lý lệnh Google News:", error);
    const object = {
      caption: "Đã xảy ra lỗi khi tìm kiếm tin tức. Vui lòng thử lại sau!",
    };
    await sendMessageWarningRequest(api, message, object, 30000);
  }
}

