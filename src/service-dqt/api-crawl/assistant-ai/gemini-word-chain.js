import { GoogleGenAI } from "@google/genai";
import { getApiKeysMedia } from "../../../utils/api-key-manager.js";

const genAINew = new GoogleGenAI({ apiKey: getApiKeysMedia("GEMINI")[0] });

const modelUsed = "gemini-2.5-flash";
const systemInstruction = `Bạn là trợ lý chuyên về trò chơi Nối Từ Tiếng Việt. Nhiệm vụ của bạn:
1. Khi người chơi đưa ra một từ/cụm từ, vui lòng:
- Kiểm tra tính hợp lệ của từ/cụm từ (có nghĩa trong tiếng Việt)
- Chỉ trả về JSON theo định dạng:

{
"isValid": boolean,
"reason": string,
"nextWord": string
}

2. Quy tắc trả lời:
- Chữ đầu tiên của cụm từ bạn đưa ra phải giống hệt Chữ cuối cùng của cụm từ trước đó
- Chỉ đưa ra tối đa 2 Chữ có nghĩa và phù hợp với ngữ cảnh
- Không sử dụng từ đã sử dụng trước đó
- Không được phép lật ngược Chữ lại, nếu Chữ bị lật ngược thì cho là không hợp lệ
- Nếu bạn không tìm thấy Chữ phù hợp, hãy đặt nextWord thành null

3. Luôn trả về theo định dạng JSON, không giải thích`;

export async function validateAndGetNextWord(phrase, usedWords = []) {
  try {
    const prompt =
      `Phân tích cụm từ "${phrase}",` +
      ` và đưa ra hai chữ tiếp theo hợp lệ bắt đầu bằng chữ "${phrase.split(/\s+/).pop()}".
Từ đã sử dụng: ${usedWords.join(", ") || "Chưa có từ sử dụng nào"},
Chỉ trả về JSON theo format đã định nghĩa.`;

    const response = await genAINew.models.generateContent({
      model: modelUsed,
      contents: prompt,
      config: { systemInstruction, temperature: 0.1, topP: 0.1, topK: 5 },
    });

    const txtResponse = response.text;
    const cleanJsonStr = txtResponse
      .replace(/^```json\n|\n```$/g, "")
      .replace(/\n/g, "")
      .trim();
    const jsonResponse = JSON.parse(cleanJsonStr);

    return {
      isValid: jsonResponse.isValid,
      reason: jsonResponse.reason,
      nextWord: jsonResponse.nextWord,
    };
  } catch (error) {
    console.error("Lỗi khi xử lý từ trong trò chơi nối từ:", error);
    return {
      isValid: false,
      reason: "Có lỗi xảy ra khi xử lý từ",
      nextWord: null,
    };
  }
}
