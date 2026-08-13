import { createCanvas } from "canvas";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { getNextApiKeyMedia } from "../../../utils/api-key-manager.js";
import { getGlobalPrefix } from "../../service.js";
import { removeMention } from "../../../utils/format-util.js";
import {
  sendMessageCompleteRequest,
  sendMessageWarningRequest,
  sendMessageImageTag,
} from "../../chat-zalo/chat-style/chat-style.js";
import { tempDir } from "../../../utils/io-json.js";
import { randomIDTemp } from "../../../utils/format-util.js";
import { writeFilePromise, deleteFile } from "../../../utils/util.js";

const MODEL = "gemini-3.6-flash";

const systemInstruction = `Bạn là trợ lý tìm kiếm thông minh. Nhiệm vụ của bạn là tìm kiếm và tổng hợp thông tin về câu hỏi được đưa ra.

YÊU CẦU:
- Trả lời NGẮN GỌN nhưng ĐỦ Ý, tập trung vào thông tin quan trọng nhất
- Sử dụng kiến thức hiện tại của bạn để cung cấp thông tin chính xác
- Tổ chức thông tin thành các phần rõ ràng, dễ đọc

ĐỊNH DẠNG ĐẦU RA (JSON):
{
  "intro": "Đoạn giới thiệu ngắn gọn về chủ đề (1-2 câu)",
  "sections": [
    {
      "title": "Tiêu đề phần",
      "snippet": "Nội dung ngắn gọn, có thể là danh sách bullet points hoặc đoạn văn"
    }
  ],
  "conclusion": "Đoạn kết luận ngắn gọn (1 câu, tùy chọn)"
}

QUY TẮC:
- "intro": 1-2 câu giới thiệu, không dài dòng
- "sections": không giới hạn số phần, mỗi phần có tiêu đề rõ ràng và nội dung đầy đủ
- "snippet" có thể là danh sách bullet points (mỗi dòng một ý) hoặc đoạn văn
- "conclusion": 1 câu tóm tắt hoặc khuyến nghị (có thể để trống)
- Không giới hạn độ dài nội dung, cung cấp thông tin đầy đủ nhất có thể
- Luôn trả về JSON hợp lệ, KHÔNG markdown, KHÔNG giải thích thêm`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isHttp503(err) {
  const status = err?.status || err?.code || err?.response?.status;
  if (status === 503) return true;
  const msg = String(err?.message || "");
  return msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("Service Unavailable");
}

async function generateContentWithRetry(payload) {
  const genAI = new GoogleGenAI({ apiKey: getNextApiKeyMedia("GEMINI") });
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

const searchWithGemini = async (query) => {
  try {
    const now = new Date();
    const vietnamTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
    const timeInfo = vietnamTime.toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "long"
    });
    
    const prompt = `Thời gian hiện tại ở Việt Nam: ${timeInfo}\n\nTìm kiếm và tổng hợp thông tin về: ${query}\n\nHãy cung cấp thông tin ngắn gọn nhưng đủ ý, tổ chức thành các phần rõ ràng. Nếu câu hỏi liên quan đến thời gian, ngày tháng hiện tại, hãy sử dụng thông tin thời gian đã cung cấp ở trên.`;

    const response = await generateContentWithRetry({
      model: MODEL,
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        maxOutputTokens: 8192,
      },
    });

    const text = response.text
      ?.replace(/^```json\n|\n```$/g, "")
      ?.replace(/^```\n|\n```$/g, "")
      ?.trim();

    if (!text) {
      return {
        sections: [],
        intro: '',
        conclusion: ''
      };
    }

    try {
      const parsed = JSON.parse(text);
      return {
        intro: parsed.intro || '',
        sections: Array.isArray(parsed.sections) ? parsed.sections : [],
        conclusion: parsed.conclusion || ''
      };
    } catch (parseError) {
      console.error("Lỗi parse JSON từ Gemini:", parseError);
      return {
        intro: text,
        sections: [{
          title: "Thông tin",
          snippet: text
        }],
        conclusion: ''
      };
    }
  } catch (error) {
    console.error("Lỗi khi tìm kiếm với Gemini:", error.message || error);
    return {
      sections: [],
      intro: '',
      conclusion: ''
    };
  }
};

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  
  words.forEach(word => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  });
  if (currentLine) lines.push(currentLine);
  return lines;
}

const createGoogleAISearchCanvas = async (keyword, data, senderName) => {
  const results = data.sections || (Array.isArray(data) ? data : []);
  const introText = data.intro || '';
  const conclusionText = data.conclusion || '';
  const width = 900;
  const padding = 60;
  const bgColor = "#FFFFFF";
  const textColor = "#000000";
  const lineHeight = 32;
  const sectionSpacing = 30;
  const bulletSpacing = 20;
  const paragraphSpacing = 25;
  
  let tempCanvas = createCanvas(width, 1);
  let tempCtx = tempCanvas.getContext("2d");
  const maxTextWidth = width - padding * 2;
  
  let totalHeight = padding * 2;
  
  const finalIntroText = introText || `Thông tin về "${keyword}":`;
  const sections = results.filter(r => r && r.title && r.snippet);
  
  tempCtx.font = "24px Arial";
  const introLines = wrapText(tempCtx, finalIntroText, maxTextWidth);
  totalHeight += introLines.length * lineHeight + paragraphSpacing;
  
  tempCtx.font = "bold 26px Arial";
  sections.forEach((result) => {
    const sectionTitle = `${result.title || 'Không có tiêu đề'}`;
    const titleLines = wrapText(tempCtx, sectionTitle, maxTextWidth);
    totalHeight += titleLines.length * 35 + sectionSpacing;
    
    if (result.snippet) {
      tempCtx.font = "24px Arial";
      const snippet = String(result.snippet || '').trim();
      const bulletPoints = snippet.split(/[•\-\*]/).filter(p => p.trim().length > 0);
      
      if (bulletPoints.length > 0) {
        bulletPoints.forEach(bullet => {
          const bulletText = bullet.trim();
          const lines = wrapText(tempCtx, bulletText, maxTextWidth - 40);
          totalHeight += lines.length * lineHeight + bulletSpacing;
        });
      } else {
        const lines = wrapText(tempCtx, snippet, maxTextWidth - 40);
        totalHeight += lines.length * lineHeight + bulletSpacing;
      }
    }
    totalHeight += sectionSpacing;
  });
  
  const finalConclusionText = conclusionText || '';
  if (finalConclusionText) {
    tempCtx.font = "24px Arial";
    const conclusionLines = wrapText(tempCtx, finalConclusionText, maxTextWidth);
    totalHeight += conclusionLines.length * lineHeight + paragraphSpacing;
  }
  
  const height = totalHeight;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);
  
  let y = padding;
  ctx.fillStyle = textColor;
  ctx.textAlign = "left";
  
  ctx.font = "24px Arial";
  introLines.forEach((line, idx) => {
    ctx.fillText(line, padding, y + (idx * lineHeight));
  });
  y += introLines.length * lineHeight + paragraphSpacing;
  
  sections.forEach((result, index) => {
    ctx.fillStyle = textColor;
    ctx.font = "bold 26px Arial";
    const sectionTitle = `${index + 1}. ${result.title || 'Không có tiêu đề'}`;
    const titleLines = wrapText(ctx, sectionTitle, maxTextWidth);
    
    titleLines.forEach((line, idx) => {
      ctx.fillText(line, padding, y + (idx * 35));
    });
    y += titleLines.length * 35 + sectionSpacing;
    
    if (result.snippet) {
      ctx.font = "24px Arial";
      const snippet = String(result.snippet || '').trim();
      const bulletPoints = snippet.split(/[•\-\*]/).filter(p => p.trim().length > 0);
      
      if (bulletPoints.length > 0) {
        bulletPoints.forEach(bullet => {
          const bulletText = bullet.trim();
          const lines = wrapText(ctx, bulletText, maxTextWidth - 40);
          
          lines.forEach((line, lineIdx) => {
            if (lineIdx === 0) {
              ctx.fillText('•', padding, y);
              const colonIndex = line.indexOf(':');
              if (colonIndex > 0 && colonIndex < 80) {
                const itemName = line.substring(0, colonIndex).trim();
                const itemDesc = line.substring(colonIndex + 1).trim();
                
                ctx.font = "bold 24px Arial";
                let x = padding + 25;
                ctx.fillText(itemName + ':', x, y);
                x += ctx.measureText(itemName + ':').width;
                
                ctx.font = "24px Arial";
                if (itemDesc) {
                  ctx.fillText(itemDesc, x, y);
                }
              } else {
                ctx.fillText(line, padding + 25, y);
              }
            } else {
              ctx.fillText(line, padding + 25, y);
            }
            y += lineHeight;
          });
          y += bulletSpacing;
        });
      } else {
        const lines = wrapText(ctx, snippet, maxTextWidth - 40);
        lines.forEach((line) => {
          ctx.fillText(line, padding + 25, y);
          y += lineHeight;
        });
        y += bulletSpacing;
      }
    }
    y += sectionSpacing;
  });
  
  if (finalConclusionText) {
    ctx.font = "24px Arial";
    const conclusionLines = wrapText(ctx, finalConclusionText, maxTextWidth);
    conclusionLines.forEach((line, idx) => {
      ctx.fillText(line, padding, y + (idx * lineHeight));
    });
  }
  
  const fileName = `google_ai_search_${randomIDTemp()}.png`;
  const filePath = path.join(tempDir, fileName);
  const buffer = canvas.toBuffer("image/png");
  await writeFilePromise(filePath, buffer);
  
  return filePath;
};

export async function handleGoogleAISearchCommand(api, message, aliasCommand) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const keyword = content.replace(`${prefix}${aliasCommand}`, "").trim();
  const senderName = message.data?.dName || "Người dùng";
  let imagePath = null;

  try {
    if (!keyword) {
      const object = {
        caption: `Vui lòng nhập từ khóa tìm kiếm\nVí dụ:\n${prefix}${aliasCommand} Nội dung cần tìm và phân tích`,
      };
      return await sendMessageWarningRequest(api, message, object, 30000);
    }

    const results = await searchWithGemini(keyword);

    if (!results || !results.sections || results.sections.length === 0) {
      const object = {
        caption: `Không tìm thấy kết quả nào cho từ khóa: ${keyword}`,
      };
      return await sendMessageWarningRequest(api, message, object, 30000);
    }

    imagePath = await createGoogleAISearchCanvas(keyword, results, senderName);

    const result = {
      caption: `⭐ Google AI Search: Kết quả phân tích cho "${keyword}"`,
      imagePath: imagePath,
    };

    await sendMessageImageTag(api, message, result, 30000000);

  } catch (error) {
    console.error("Lỗi khi xử lý lệnh Google AI Search:", error);
    const object = {
      caption: "Đã xảy ra lỗi khi tìm kiếm và phân tích. Vui lòng thử lại sau!",
    };
    await sendMessageWarningRequest(api, message, object, 30000);
  } finally {
    if (imagePath) {
      try {
        await deleteFile(imagePath);
      } catch (deleteError) {
        console.error("Lỗi khi xóa file:", deleteError);
      }
    }
  }
}
