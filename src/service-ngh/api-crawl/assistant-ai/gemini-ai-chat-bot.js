import { GoogleGenAI } from "@google/genai";
import { getNextApiKeyMedia } from "../../../utils/api-key-manager.js";
import { Queue } from "../../utilities/queue.js";

const createGeminiClient = () => new GoogleGenAI({ apiKey: getNextApiKeyMedia("GEMINI") });
const MODEL_CHAT = "gemini-3.6-flash";
const MODEL_INTENT = "gemini-2.5-flash-lite";

const systemInstructionChat = `Bạn là trợ lý trò chuyện thân thiện và súc tích. Luôn đi thẳng trọng tâm, không dài dòng.

Bạn tên là Raiden Shogun (còn có tên gọi khác là Ei), một nhân vật trong game Genshin Impact

ĐỊNH DẠNG VÀO/RA BẮT BUỘC:
- Đầu vào là một chuỗi JSON hợp lệ có dạng:
  { "senderName": "Tên người gửi", "question": "Nội dung cần hỏi", "currentTime": "Thời gian hiện tại (định dạng dd/mm/yyyy, hh:mm:ss)" }
- Bạn sẽ nhận được thông tin "currentTime" cho biết thời gian hiện tại theo múi giờ Việt Nam. Hãy sử dụng thông tin này khi người dùng hỏi về thời gian, ngày giờ, hoặc các câu hỏi liên quan đến thời điểm hiện tại.
- Đầu ra luôn là JSON hợp lệ, KHÔNG markdown, KHÔNG giải thích thêm, chỉ theo mẫu:
  { "content": "câu trả lời ngắn gọn, thân thiện, đúng trọng tâm" }

QUY TẮC PHONG CÁCH:
- Giọng điệu gần gũi, tích cực, tôn trọng.
- Ưu tiên trả lời bằng ngôn ngữ của câu hỏi; nếu là tiếng Việt thì trả lời tiếng Việt.
- Nếu câu hỏi mơ hồ, đặt một câu hỏi làm rõ NGẮN GỌN trong \"content\".
- Không xuất thêm trường nào khác ngoài \"content\".`;

const systemInstructionIntent = `Bạn là bộ phân tích ý định, phân loại và trích xuất câu truy vấn ngắn gọn.

YÊU CẦU ĐẦU RA:
- Luôn trả về JSON hợp lệ, KHÔNG markdown, KHÔNG giải thích thêm.
- Cấu trúc JSON cố định:
  {
    "action": "search|play|ask|other",
    "platform": "youtube|soundcloud|zingmp3|tiktok|pinterest|null",
    "query": "câu truy vấn ngắn gọn, đã làm sạch",
    "confidence": 0.0
  }

QUY TẮC:
- Ưu tiên trích xuất \"query\" ngắn gọn, đúng trọng tâm, bỏ từ đệm.
- Chỉ chọn \"platform\" nếu có bằng chứng rõ ràng, nếu không đặt null.
- \"confidence\" là số thực 0..1 phản ánh mức tự tin.
- Không thêm trường nào khác.`;

const chatSessionsAssistant = new Map();
const MAX_IDLE_TIME = 30 * 60 * 1000;
const userQueues = new Map(); // userId -> Queue

function isHttp503(err) {
  const status = err?.status || err?.code || err?.response?.status;
  if (status === 503) return true;
  const msg = String(err?.message || "");
  return msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("Service Unavailable");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateContentWithRetry(payload) {
  const genAI = createGeminiClient();
  try {
    return await genAI.models.generateContent(payload);
  } catch (e) {
    if (isHttp503(e)) {
      await sleep(3000);
      return await genAI.models.generateContent(payload);
    }
    throw e;
  }
}

function getChatSessionAssistant(userId) {
  if (!chatSessionsAssistant.has(userId)) {
    const genAI = createGeminiClient();
    const chat = genAI.chats.create({
      model: MODEL_CHAT,
      config: {
        systemInstruction: systemInstructionChat,
        maxOutputTokens: 1024,
      },
    });
    chatSessionsAssistant.set(userId, { chat, lastInteraction: Date.now() });
  }
  return chatSessionsAssistant.get(userId);
}

function cleanupOldSessionsAssistant() {
  const now = Date.now();
  for (const [userId, session] of chatSessionsAssistant.entries()) {
    if (now - session.lastInteraction > MAX_IDLE_TIME) {
      chatSessionsAssistant.delete(userId);
    }
  }
}

function isBadSessionError(err) {
  const status = err?.status || err?.code || err?.response?.status;
  const msg = String(err?.message || "");
  return status === 400 || status === 503 || msg.includes("INVALID_ARGUMENT") || msg.includes("UNAVAILABLE");
}

async function chatSendMessageWithRetryAssistant(session, payload) {
  try {
    return await session.chat.sendMessage({ message: payload.message });
  } catch (e) {
    if (isHttp503(e)) {
      await sleep(3000);
      return await session.chat.sendMessage({ message: payload.message });
    }
    throw e;
  }
}

export async function chatWithGeminiAssistant(message) {
  const userId = message?.data?.uidFrom;
  const senderName = message?.data?.dName || "User";
  const text = message?.data?.content || "";
  if (!userId) return "";

  if (!userQueues.has(userId)) {
    const q = new Queue();
    userQueues.set(userId, q);
  }

  const queue = userQueues.get(userId);

  queue.setProcessingInterval(3000 + Math.floor(Math.random() * 3000));

  return await queue.addTask(async () => {
    try {
      const session = getChatSessionAssistant(userId);
      session.lastInteraction = Date.now();
      const now = new Date();
      const vietnamTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
      const currentTime = vietnamTime.toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      });
      
      const inputJson = JSON.stringify({ 
        senderName, 
        question: text,
        currentTime: currentTime
      });
      const result = await chatSendMessageWithRetryAssistant(session, { message: inputJson });
      const response = result.text;
      const cleaned = response
        ?.replace(/^```json\n|\n```$/g, "")
        ?.replace(/^```\n|\n```$/g, "")
        ?.trim();
      cleanupOldSessionsAssistant();
      return cleaned || response;
    } catch (error) {
      if (isBadSessionError(error)) {
        chatSessionsAssistant.delete(userId);
      }
      throw error;
    }
  });
}

// Nhẹ nhàng: chỉ gọi khi phát hiện có từ khoá hành động
// actions: mảng từ khoá kích hoạt (ví dụ: ["tìm", "kiếm", "phát", "mở", ...])
export async function detectIntentSmart(content, actions = []) {
  const contentLower = String(content || "").toLowerCase();
  const hasActionKeyword = actions.some((kw) => contentLower.includes(kw));
  if (!hasActionKeyword) {
    return { shouldAnalyze: false };
  }

  const response = await generateContentWithRetry({
    model: MODEL_INTENT,
    contents: String(content || ""),
    config: { systemInstruction: systemInstructionIntent, temperature: 0.1, topP: 0.1, topK: 5 },
  });

  const txt = response.text
    .replace(/^```json\n|\n```$/g, "")
    .replace(/^```\n|\n```$/g, "")
    .trim();

  try {
    const obj = JSON.parse(txt);
    return { shouldAnalyze: true, ...obj };
  } catch {
    return { shouldAnalyze: true, action: "other", platform: null, query: content, confidence: 0.0 };
  }
}

export default {
  chatWithGeminiAssistant,
  detectIntentSmart,
};
