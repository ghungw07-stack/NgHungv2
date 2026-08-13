import axios from "axios";
import { getGlobalPrefix } from "../../service.js";
import { getContent } from "../../../utils/format-util.js";
import { getApiKeysMedia } from "../../../utils/api-key-manager.js";

const SIMSIMI_API_URL = "https://wsapi.simsimi.com/190410/talk";
const apiInvalid = [];

export async function chatWithSimsimi(api, message) {
  let content = getContent(message);
  const prefix = getGlobalPrefix(api.getBotId());
  
  const chatMessage = content.replace(`${prefix}chat`, "").trim();

  if (!chatMessage) {
    await api.sendMessage(
      { msg: "Vui lòng nhập nội dung để trò chuyện. Ví dụ: !chat Xin chào", quote: message, ttl: 600000 },
      message.threadId,
      message.type
    );
    return;
  }

  try {
    const simsimiReply = await getSimsimiReply(chatMessage);
    await sendSimsimiReply(api, message, message.threadId, simsimiReply);
  } catch (error) {
    console.error("Lỗi khi gọi API Simsimi:", error.response ? error.response.data : error.message);
    await sendErrorMessage(api, message, message.threadId);
  }
}

async function getSimsimiReply(chatMessage) {
  const simsimiKeys = getApiKeysMedia("SIMSIMI");
  if (apiInvalid.length === simsimiKeys.length) apiInvalid = [];
  for (const apiKey of simsimiKeys) {
    if (apiInvalid.includes(apiKey)) continue;

    try {
      const response = await axios.post(
        SIMSIMI_API_URL,
        {
          utext: chatMessage,
          lang: "vn",
          atext_bad_prob_max: 0.7,
        },
        {
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
        }
      );

      const simsimiReply = response.data.atext;
      if (simsimiReply) {
        return simsimiReply;
      }
    } catch (error) {
      console.warn(`API key ${apiKey} gặp lỗi:`, error);
      apiInvalid.push(apiKey);
      continue;
    }
  }

  console.error("Tất cả API key SIMSIMI đều không khả dụng");
  throw new Error("Không nhận được phản hồi từ Simsimi");
}

async function sendSimsimiReply(api, message, threadId, simsimiReply) {
  let simReply = `Sim: ${simsimiReply}`;
  await api.sendMessage({ msg: simReply, quote: message, ttl: 180000}, threadId, message.type);
}

async function sendErrorMessage(api, message, threadId) {
  await api.sendMessage(
    { msg: "Xin lỗi, tôi không thể trả lời lúc này. Vui lòng thử lại sau.", quote: message },
    threadId,
    message.type
  );
}
