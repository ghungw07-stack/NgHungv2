import axios from "axios";
import { getGlobalPrefix } from "../../service.js";
import { getContent } from "../../../utils/format-util.js";
import {
  sendMessageComplete,
  sendMessageFailed,
  sendMessageQuery,
  sendMessageStateQuote,
} from "../../chat-zalo/chat-style/chat-style.js";

const URL_GPT = "https://api.zeidteam.xyz/ai/chatgpt4";

const dataHistory = [
  { id: "3752177841722099050", content: "Em tên Kim, xăm family lên trym", role: "user" },
  { id: "3752177841722099051", content: "OK, em hiểu rồi", role: "assistant" },
];

export async function callGPTAPI(question) {
  try {
    const response = await axios.get(URL_GPT, {
      params: {
        prompt: question
      },
      timeout: 30000
    });

    const data = response.data;
    
    // Kiểm tra status và trả về response
    if (data.status && data.response) {
      return data.response;
    }
    
    return null;
  } catch (error) {
    console.error("Lỗi khi gọi API GPT:", error);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);
    }
    return null;
  }
}

export async function askGPTCommand(api, message, aliasCommand) {
  const content = getContent(message);
  const threadId = message.threadId;
  const userId = message.data.uidFrom;
  const prefix = getGlobalPrefix(api.getBotId());

  const question = content.replace(`${prefix}${aliasCommand}`, "").trim();
  if (question === "") {
    await sendMessageQuery(api, message, "Vui lòng nhập câu hỏi cần giải đáp!");
    return;
  }

  try {
    const replyText = await callGPTAPI(question);

    if (!replyText) {
      throw new Error("Không nhận được phản hồi từ API");
    }
    dataHistory.push({
      id: threadId,
      content: question,
      role: "user",
    });
    dataHistory.push({
      id: threadId,
      content: replyText,
      role: "assistant",
    });

    await sendMessageStateQuote(api, message, replyText, true, 1800000, false);
  } catch (error) {
    console.error("Lỗi khi xử lý yêu cầu GPT:", error);
    await sendMessageFailed(api, message, "Xin lỗi, có lỗi xảy ra khi xử lý yêu cầu của bạn.");
  }
}
