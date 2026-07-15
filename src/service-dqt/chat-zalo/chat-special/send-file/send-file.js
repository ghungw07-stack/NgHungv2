import fs from "fs";
import path from "path";
import { MessageType } from "zlbotdqt";
import { getGlobalPrefix } from "../../../service.js";
import { removeMention } from "../../../../utils/format-util.js";
import {
  sendMessageCompleteRequest,
  sendMessageStateQuote,
  sendMessageWarningRequest,
} from "../../chat-style/chat-style.js";
import { checkLinkIsValid } from "../../../../utils/util.js";
import { handleCheckLinkFromFilesLocal } from "../../../../utils/local-upload-cache.js";
import { FILES_RESOURCE_PATH } from "../../../../utils/io-json.js";

const TIME_24H = 86400000;

export async function handleSendFileCommand(api, message, aliasCommand) {
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const dataFilesPath = FILES_RESOURCE_PATH(botId);
  const content = removeMention(message);
  let keyword = content.replace(`${prefix}${aliasCommand}`, "").trim();
  let text = keyword;

  try {
    if (keyword.trim() === "list") {
      const files = fs.readdirSync(dataFilesPath);
      if (files.length > 0) {
        const fileList = files.map((file, index) => `${index + 1}. ${file}`).join("\n");
        const objectCaption = {
          caption:
            `Đây là những file đã lưu trữ:\n${fileList}` +
            `\n\nDùng lệnh: ${prefix}${aliasCommand} <số thứ tự file> để gửi file`,
        };
        await sendMessageCompleteRequest(api, message, objectCaption, 1800000);
      } else {
        const objectCaption = { caption: `Chưa có file nào được lưu trên bộ nhớ của bot!` };
        await sendMessageCompleteRequest(api, message, objectCaption, 1800000);
      }
      return;
    }

    const index = parseInt(keyword.trim());
    if (!isNaN(index)) {
      const files = fs.readdirSync(dataFilesPath);
      if (index > 0 && index <= files.length) {
        const selectedFile = files[index - 1];
        const fileLocal = await handleCheckLinkFromFilesLocal(selectedFile, api);
        await sendMessageStateQuote(api, message, "Đây là file bạn yêu cầu!", true, TIME_24H, false);
        await api.sendFile(
          message,
          fileLocal.fileUrl,
          TIME_24H,
          fileLocal.fileName,
          fileLocal.totalSize,
          fileLocal.type,
          fileLocal.checksum
        );
        return;
      } else {
        const tempObj = { caption: "Số thứ tự không nằm trong phạm vi danh sách file đã lưu trữ." };
        await sendMessageWarningRequest(api, message, tempObj, 300000);
        return;
      }
    }

    const quote = message.data?.quote;
    if (quote) {
      if (!text) {
        try {
          const parseMessage = JSON.parse(quote.attach);
          text = parseMessage.href || parseMessage.title || quote.msg || null;
        } catch (error) {
          text = quote.msg || null;
        }
      }
    }

    if (!text) {
      const object = {
        caption:
          `Vui lòng reply vào tập tin hoặc nhập link,\n` +
          `Hoặc dùng lệnh: "${prefix}${aliasCommand} list" để xem danh sách file đã lưu trữ trong thư mục files!`,
      };
      await sendMessageWarningRequest(api, message, object, 300000);
      return;
    }

    let linkUpload;
    const fileLocal = await handleCheckLinkFromFilesLocal(text, api);
    if (fileLocal) {
      linkUpload = fileLocal.fileUrl;
    } else {
      linkUpload = text;
    }

    if (await checkLinkIsValid(linkUpload)) {
      await sendMessageStateQuote(api, message, "Đây là file bạn yêu cầu!", true, TIME_24H, false);
      await api.sendFile(message, linkUpload, TIME_24H);
    } else {
      const object = {
        caption: "Link file không hợp lệ hoặc không có file nào có tên tương tự được lưu trong bộ nhớ bot.",
      };
      await sendMessageWarningRequest(api, message, object, 300000);
    }
  } catch (error) {
    console.error("Lỗi khi send file:", error);
    const object = { caption: "Đã xảy ra lỗi khi send file từ nguồn cung cấp." };
    await sendMessageWarningRequest(api, message, object, 300000);
  } finally {
  }
}
