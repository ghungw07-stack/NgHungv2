import { getGlobalPrefix } from "../../service.js";
import { getContent } from "../../../utils/format-util.js";
import { callGeminiAPIGlobal } from "../assistant-ai/gemini.js";

export async function translateCommand(api, message, aliasCommand) {
  const content = getContent(message);
  const threadId = message.threadId;
  const prefix = getGlobalPrefix(api.getBotId());
  const command = content.replace(`${prefix}${aliasCommand}`, "").trim();

  if (command) {
    const parts = command.split("&&");
    if (parts.length > 1) {
      const textToTranslate = parts[0];
      const targetLanguage = parts[1];

      try {
        const translatedText = await translateWithGemini(textToTranslate, targetLanguage);
        const responseMessage = `Kết quả dịch cho: ${textToTranslate}\n\nBản dịch (${targetLanguage}): ${translatedText}`;

        await api.sendMessage({ msg: responseMessage, quote: message, ttl: 600000 }, threadId, message.type);
      } catch (error) {
        console.error("Lỗi khi dịch:", error);
        await api.sendMessage(
          {
            msg: "Vì vấn đề nào đó, tôi không dịch được từ này.",
            quote: message,
            ttl: 60000
          },
          threadId,
          message.type
        );
      }
    } else if (parts.length == 1) {
      const textToTranslate = parts[0];
      const targetLanguage = "vietnamese";
      try {
        const translatedText = await translateWithGemini(textToTranslate, targetLanguage);
        const responseMessage = `Kết quả dịch cho: ${textToTranslate}\n\nBản dịch (${targetLanguage}): ${translatedText}`;

        await api.sendMessage({ msg: responseMessage, quote: message, ttl: 6000000 }, threadId, message.type);
      } catch (error) {
        await api.sendMessage(
          {
            msg: "Vì vấn đề nào đó, tôi không dịch được từ này.",
            quote: message,
            ttl: 600000
          },
          threadId,
          message.type
        );
      }
    }
  } else {
    await api.sendMessage(
      {
        msg: `Sử dụng: ${prefix}${aliasCommand} [nội dung cần dịch]&&(ngôn ngữ dịch)`,
        quote: message,
        ttl: 60000
      },
      threadId,
      message.type
    );
    return;
  }
}

export async function translateWithGemini(text, targetLanguage) {
  const prompt =
    `Dịch giúp tôi cụm từ "${text}" sang ngôn ngữ ${targetLanguage}` +
    `, chỉ đưa ra kết quả, không giải thích gì thêm, nếu kết quả là (Nhật, Hàn, Trung hoặc các tiếng không thuộc lating) thì thêm chú thích phiên âm`;
  const replyText = await callGeminiAPIGlobal(prompt);

  return replyText;
}
