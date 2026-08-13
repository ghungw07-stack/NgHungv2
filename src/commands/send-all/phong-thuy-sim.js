import axios from "axios";
import { sendMessageStateQuote } from "../../service-ngh/chat-zalo/chat-style/chat-style.js";
import { MultiMsgStyle, MessageStyle, MessageType } from "../../api-zalo/index.js";

export const COLOR_RED = "db342e";
export const COLOR_YELLOW = "f7b503";
export const COLOR_GREEN = "15a85f";
export const SIZE_18 = "18";
export const SIZE_16 = "12";
export const IS_BOLD = true;

export async function handleCheckSimPhongThuyCommand(api, message) {
  const threadId = message.threadId;
  const senderId = message.data?.uidFrom;
  const senderName = message.data?.dName || "Người dùng";
  const content = message.data?.content?.trim();
  if (!content || content.split(" ").length < 2) {
    await sendMessageStateQuote(api, message, "Vui lòng nhập 4 số cuối sau lệnh", false, 30000);
    return;
  }

  const simTail = content.split(" ")[1].trim();
  const url = "https://simphongthuyuytin.com/phong-thuy-4-so-duoi";
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Referer": "https://simphongthuyuytin.com/",
  };
  try {
    const response = await axios.get(url, {
      headers,
      params: { sodienthoai: simTail },
    });
    if (response.status === 200) {
      const cheerio = await import("cheerio");
      const $ = cheerio.load(response.data);
      const fourLastDigits = $(".ket-qua h2").first().text().replace("4 số cuối: ", "").trim();
      const numberLogic = $(".ket-qua h2").eq(1).text().replace("Số lý: ", "").trim();
      const comment = $(".ket-qua h3").first().text().trim();
      const conclusion = $(".ket-qua h3 span").text().trim();

      if (fourLastDigits && numberLogic && comment && conclusion) {
        const summary = `
✨ Kết quả phong thủy:
4 số cuối: ${fourLastDigits}
Số lý: ${numberLogic}
Ý nghĩa: ${comment}
Kết luận: ${conclusion}
        `;
        const styledMessage = MultiMsgStyle([
          MessageStyle(senderName.length + 1, summary.length, COLOR_GREEN, SIZE_16, IS_BOLD),
        ]);
        await api.sendMessage(
          {
            msg: `@${senderName}\n${summary}`,
            mentions: [{ uid: senderId, pos: 0, len: senderName.length + 1 }],
            style: styledMessage,
            ttl: 3000000,
          },
          threadId,
          message.type
        );
      } else {
        await sendMessageStateQuote(api, message, "❌ Không tìm thấy thông tin phong thủy cho số này.", false, 30000);
      }
    } else {
      await sendMessageStateQuote(api, message, `❌ Lỗi: HTTP ${response.status}`, false, 30000);
    }
  } catch (error) {
    console.error("Lỗi khi kiểm tra phong thủy:", error.message);
    await sendMessageStateQuote(api, message, `❌ Lỗi khi kiểm tra phong thủy: ${error.message}`, false, 30000);
  }
}
