import axios from "axios";
import { getGlobalPrefix } from "../../service.js";
import { getContent } from "../../../utils/format-util.js";
import {
  sendMessageFailed,
  sendMessageComplete,
  sendMessageQuery,
  sendMessageStateQuote,
} from "../../chat-zalo/chat-style/chat-style.js";
import { isAdmin } from "../../../index.js";
import {
  getAIProviderConfig,
  isAIProviderConfigured,
  requestConfiguredAI,
  updateAIProviderFromCommand,
} from "./ai-provider-config.js";

const URL_GPT = "https://text.pollinations.ai/";
let dataHistory = [];
const providerHistory = new Map();

function providerHelp(prefix, aliasCommand) {
  const command = `${prefix}${aliasCommand} config`;
  return [
    "Cấu hình GPT/OpenAI-compatible riêng cho bot:",
    `${command} set apiKey <key>`,
    `${command} set baseURL <url>`,
    `${command} set model <tên model>`,
    `${command} set instruction <system prompt>`,
    `${command} show`,
    `${command} clear`,
    "Nên gửi lệnh chứa API key trong tin nhắn riêng với bot.",
    "Ví dụ OpenAI: baseURL https://api.openai.com/v1",
  ].join("\n");
}

export async function callGPTAPI(question, threadId, botId = null) {
  try {
    if (botId && isAIProviderConfigured(botId, "gpt")) {
      const historyKey = `${botId}:${threadId}`;
      const history = providerHistory.get(historyKey) || [];
      const config = getAIProviderConfig(botId, "gpt");
      const userMessage = { role: "user", content: question };
      const messages = [
        {
          role: "system",
          content: config.instruction || "Bạn là trợ lý GPT, trả lời rõ ràng, chính xác và ưu tiên tiếng Việt.",
        },
        ...history,
        userMessage,
      ];
      const reply = await requestConfiguredAI({ botId, service: "gpt", messages });
      const nextHistory = [...history, userMessage, { role: "assistant", content: reply }].slice(-20);
      providerHistory.set(historyKey, nextHistory);
      return reply;
    }

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
  
  const args = question.split(/\s+/);
  if (args[0]?.toLowerCase() === "config") {
    if (!isAdmin(api.getBotId(), message.data.uidFrom)) {
      await sendMessageFailed(api, message, "Chỉ quản trị viên cấp cao mới được cấu hình API AI.");
      return;
    }
    try {
      const result = updateAIProviderFromCommand(api.getBotId(), "gpt", args.slice(1));
      if (result.action === "help") {
        await sendMessageComplete(api, message, providerHelp(prefix, aliasCommand), false, 300000);
        return;
      }
      if (result.sensitive) {
        try { await api.deleteMessage(message, false); } catch {}
      }
      if (result.action === "clear") {
        for (const key of providerHistory.keys()) {
          if (key.startsWith(`${api.getBotId()}:`)) providerHistory.delete(key);
        }
      }
      await sendMessageComplete(api, message, result.text, false, 300000);
    } catch (error) {
      await sendMessageFailed(api, message, error.message, true, 300000);
    }
    return;
  }

  if (question.toLowerCase() === "reset") {
    dataHistory = dataHistory.filter(m => m.id !== threadId);
    providerHistory.delete(`${api.getBotId()}:${threadId}:${message.data.uidFrom}`);
    await sendMessageStateQuote(api, message, "🔄 Đã làm mới lịch sử cuộc trò chuyện GPT của bạn!", true, 1800000, false);
    return;
  }

  try {
    const historyKey = `${threadId}:${message.data.uidFrom}`;
    const replyText = await callGPTAPI(question, historyKey, api.getBotId());

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
