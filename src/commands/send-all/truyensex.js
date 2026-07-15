import axios from "axios";
import * as cheerio from "cheerio";
import { removeMention } from "../../utils/format-util.js";
import { MessageType } from "zlbotdqt";
import {
  sendMessageCompleteRequest,
  sendMessageWarningRequest,
  sendMessageProcessingRequest
} from "../../service-dqt/chat-zalo/chat-style/chat-style.js";
import {
  setSelectionsMapData,
  deleteSelectionsMapData,
  getSelectionsMapData,
} from "../../service-dqt/api-crawl/index.js";

// Trạng thái lưu lựa chọn
const BASE_URL = "https://truyensexvl.com";
const PLATFORM = "truyensexvl";

export async function searchTruyenVL() {
  try {
    const { data } = await axios.get(BASE_URL);
    const $ = cheerio.load(data);
    const results = [];

    $(".td_module_flex").each((_, el) => {
      const title = $(el).find("h3 a").attr("title")?.trim();
      const href = $(el).find("h3 a").attr("href")?.trim();
      const excerpt = $(el).find(".td-excerpt").text().trim();
      if (title && href) results.push({ title, href, excerpt });
    });

    return results;
  } catch (err) {
    console.error("Lỗi khi tìm truyện:", err.message);
    return [];
  }
}

export async function handleTruyenSexVLCommand(api, message, aliasCommand) {
  const senderId = message.data.uidFrom;

  try {
    const stories = await searchTruyenVL();
    if (!stories.length) {
      await sendMessageWarningRequest(api, message, {
        caption: "Không tìm thấy truyện nào.",
      }, 30000);
      return;
    }

    const list = stories.map((s, i) => `${i + 1}. ${s.title}`).join("\n");

    const response = await sendMessageCompleteRequest(api, message, {
      caption: `📚 Danh sách truyện:\n\n${list}\n\nHãy trả lời số để xem nội dung.`,
    }, 60000);

    const msgId = response?.message?.msgId || response?.attachment?.[0]?.msgId;
    const cliMsgId = response?.message?.cliMsgId || response?.attachment?.[0]?.cliMsgId;

    setSelectionsMapData(senderId, {
      platform: PLATFORM,
      quotedMsgId: msgId?.toString(),
      cliMsgId: cliMsgId?.toString(),
      collection: stories,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error("Lỗi command truyensexvl:", err.message);
    await sendMessageWarningRequest(api, message, {
      caption: "Có lỗi xảy ra khi xử lý yêu cầu.",
    }, 30000);
  }
}

export async function handleTruyenSexVLReply(api, message) {
  const senderId = message.data.uidFrom;
  const quotedMsgId = message.data.quote?.globalMsgId?.toString();
  const cliMsgId = message.data.quote?.cliMsgId;

  const stored = getSelectionsMapData().get(senderId);
  if (!stored || stored.platform !== PLATFORM || stored.quotedMsgId !== quotedMsgId) return false;

  try {
    const selection = removeMention(message).trim();
    if (!/^\d+$/.test(selection)) return false;

    const index = parseInt(selection) - 1;
    const { collection } = stored;
    if (index < 0 || index >= collection.length) {
      await sendMessageWarningRequest(api, message, {
        caption: "Số không hợp lệ, vui lòng chọn lại.",
      }, 30000);
      return true;
    }

    deleteSelectionsMapData(senderId);
    return await handleSendTruyenSexVLDetail(api, message, collection[index]);
  } catch (err) {
    console.error("Lỗi khi xử lý reply:", err.message);
    return true;
  }
}
export async function handleSendTruyenSexVLDetail(api, message, selected) {
  const senderId = message.data?.uidFrom;

  if (!senderId || !selected?.href) return false;

  try {
    const { data } = await axios.get(selected.href);
    const $ = cheerio.load(data);
    const paragraphs = $(".ndtruyen p").map((_, el) => $(el).text().trim()).get();

    if (!paragraphs.length) {
      await sendMessageWarningRequest(api, message, {
        caption: "Không tìm thấy nội dung truyện.",
      }, 30000);
      return true;
    }

    const fullText = paragraphs.join("\n\n");
    const chunkSize = 1500;

    for (let i = 0; i < fullText.length; i += chunkSize) {
      const chunk = fullText.slice(i, i + chunkSize);
      await api.sendMessage({
        msg: chunk,
        ttl: 3600000,
      }, senderId, MessageType.DirectMessage);
    }

    await sendMessageCompleteRequest(api, message, {
      caption: `Đã gửi truyện: ${selected.title}, vào tin nhắn riêng...`,
    }, 30000);

    return true;
  } catch (err) {
    console.error("Lỗi lấy truyện chi tiết:", err.message);
    await sendMessageWarningRequest(api, message, {
      caption: "❌ Chặn tin nhắn người lạ, không gửi được hoặc không lấy được truyện.",
    }, 30000);
    return false;
  }
}
