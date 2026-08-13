import { removeMention } from "../../../utils/format-util.js";
import {
  sendMessageComplete,
  sendMessageFailed,
  sendReplyInChunks,
  sendMessageWarning,
} from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import {
  cleanTvplText,
  extractOfficialDocumentText,
  resolveTvplDocument,
} from "./thuvien-phap-luat-client.js";

const MAX_QUERY_LENGTH = 160;
const TIME_TO_LIVE = 10 * 60 * 1000;

function formatDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function formatDocument(query, document, fullText) {
  const lines = [
    "⚖️ THƯ VIỆN PHÁP LUẬT",
    `🔎 Câu hỏi: ${query}`,
    "",
    `✅ Văn bản phù hợp: ${document.title}`,
  ];
  if (document.documentNumber) lines.push(`📌 Số hiệu: ${document.documentNumber}`);
  if (document.issuedDate) lines.push(`📅 Ban hành: ${formatDate(document.issuedDate)}`);
  if (document.effectiveDate) lines.push(`⏳ Hiệu lực: ${formatDate(document.effectiveDate)}`);
  if (document.relevantArticles) lines.push(`🎮 Phần liên quan game: ${document.relevantArticles}`);
  if (document.url) lines.push(`🔗 TVPL: ${document.url}`);
  if (document.officialUrl) lines.push(`🏛️ Nguồn chính thức: ${document.officialUrl}`);
  lines.push(
    "",
    fullText
      ? `📖 Toàn văn ${fullText.pageCount} trang sẽ được gửi dưới dạng tin nhắn ngay sau đây.`
      : "📖 Không trích xuất được lớp chữ toàn văn từ nguồn chính thức."
  );
  return lines.join("\n");
}

export async function handleTvplCommand(api, message, aliasCommand) {
  const prefix = getGlobalPrefix(api.getBotId());
  const content = String(removeMention(message) || "").trim();
  const firstSpace = content.search(/\s/);
  const query = firstSpace === -1 ? "" : cleanTvplText(content.slice(firstSpace + 1), MAX_QUERY_LENGTH);

  if (!query) {
    await sendMessageWarning(
      api,
      message,
      `Cú pháp: ${prefix}${aliasCommand} <từ khóa hoặc số hiệu văn bản>\nVí dụ: ${prefix}${aliasCommand} Luật Đất đai 2024`,
      true,
      TIME_TO_LIVE
    );
    return;
  }

  try {
    const document = await resolveTvplDocument(query);
    if (!document) {
      await sendMessageWarning(api, message, `Không tìm thấy văn bản phù hợp với “${query}”.`, true, TIME_TO_LIVE);
      return;
    }
    let fullText = null;
    if (document.pdfUrl) {
      fullText = await extractOfficialDocumentText(document.pdfUrl);
    }
    await sendMessageComplete(api, message, formatDocument(query, document, fullText), true, TIME_TO_LIVE);

    if (!fullText?.text) return;
    const heading = [
      `TOÀN VĂN ${document.documentNumber || document.title}`,
      `Nguồn: ${document.source || "Công báo Chính phủ"}`,
      "",
    ].join("\n");
    await sendReplyInChunks(api, message, `${heading}${fullText.text}`, TIME_TO_LIVE);
  } catch (error) {
    console.error("[TVPL] Lỗi tra cứu:", error?.message || error);
    await sendMessageFailed(
      api,
      message,
      "Không thể tra cứu Thư Viện Pháp Luật lúc này. Vui lòng thử lại sau.",
      true,
      TIME_TO_LIVE
    );
  }
}
