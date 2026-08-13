import axios from "axios";
import { getGlobalPrefix } from "../../service.js";
import { getContent } from "../../../utils/format-util.js";
import {
  sendMessageFailed,
  sendMessageQuery,
  sendMessageStateQuote,
} from "../../chat-zalo/chat-style/chat-style.js";

const URL_GPT = "https://text.pollinations.ai/";
let dataHistory = [];

export async function callGPTAPI(question, threadId) {
  try {
    const threadHistory = dataHistory.filter(m => m.id === threadId).slice(-10);
    const messages = threadHistory.map(m => ({
      role: m.role,
      content: m.content
    }));
    messages.push({ role: "user", content: question });

    const response = await axios.post(URL_GPT, {
      messages: messages
      // Tuyệt đối không truyền `model` để dùng mặc định (không bị tính phí/402)
    }, {
      headers: { "Content-Type": "application/json" },
      timeout: 30000
    });

    return response.data;
  } catch (error) {
    console.error("Lỗi khi gọi API GPT Pollinations:", error);
    return null;
  }
}

export async function askGPTCommand(api, message, aliasCommand) {
  const content = getContent(message);
  const threadId = message.threadId;
  const prefix = getGlobalPrefix(api.getBotId());

  const question = content.replace(`${prefix}${aliasCommand}`, "").trim();
  
  if (question === "") {
    await sendMessageQuery(api, message, "Vui lòng nhập câu hỏi cần giải đáp!");
    return;
  }
  
  if (question.toLowerCase() === "reset") {
    dataHistory = dataHistory.filter(m => m.id !== threadId);
    await sendMessageStateQuote(api, message, "🔄 Đã làm mới lịch sử cuộc trò chuyện GPT của bạn!", true, 1800000, false);
    return;
  }

  try {
    const replyText = await callGPTAPI(question, threadId);

    if (!replyText || typeof replyText !== 'string' || replyText.trim() === '') {
      throw new Error("Không nhận được phản hồi từ API");
    }

    dataHistory.push({ id: threadId, content: question, role: "user" });
    dataHistory.push({ id: threadId, content: replyText, role: "assistant" });
    if (dataHistory.length > 500) dataHistory = dataHistory.slice(-200);

    await sendMessageStateQuote(api, message, replyText, true, 1800000, false);
  } catch (error) {
    console.error("Lỗi khi xử lý yêu cầu GPT:", error);
    await sendMessageFailed(api, message, "Xin lỗi, có lỗi xảy ra khi xử lý yêu cầu của bạn (API GPT miễn phí hiện đang gặp sự cố).");
  }
}
