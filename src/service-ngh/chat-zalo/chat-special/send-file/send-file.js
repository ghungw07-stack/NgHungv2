import fs from "fs";
import path from "path";
import axios from "axios";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { MessageSendType } from "zlbotngh";
import { getGlobalPrefix } from "../../../service.js";
import { removeMention } from "../../../../utils/format-util.js";
import { createShareFileListImage } from "../../../../utils/canvas/share-files.js";
import {
  sendMessageCompleteRequest,
  sendMessageStateQuote,
  sendMessageWarningRequest,
} from "../../chat-style/chat-style.js";
import { checkLinkIsValid } from "../../../../utils/util.js";
import { handleCheckLinkFromFilesLocal } from "../../../../utils/local-upload-cache.js";
import { FILES_RESOURCE_PATH } from "../../../../utils/io-json.js";

const TIME_24H = 86400000;
const MAX_SHARE_FILE_BYTES = 100 * 1024 * 1024;
const MAX_SHARE_STORAGE_BYTES = 2 * 1024 * 1024 * 1024;

function getStoredFiles(dataFilesPath) {
  return fs
    .readdirSync(dataFilesPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort((first, second) => first.localeCompare(second, "vi", { numeric: true, sensitivity: "base" }));
}

function getStoredSize(dataFilesPath) {
  return getStoredFiles(dataFilesPath).reduce(
    (total, fileName) => total + fs.statSync(path.join(dataFilesPath, fileName)).size,
    0
  );
}

function parseObject(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function safeFileName(value, fallbackExtension = "") {
  const rawName = path.basename(String(value || "").trim()) || `share_${Date.now()}`;
  const cleaned = rawName.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").replace(/^\.+/, "").trim();
  const name = cleaned || `share_${Date.now()}`;
  const currentExtension = path.extname(name).slice(0, 20);
  const extension = currentExtension || (fallbackExtension ? `.${fallbackExtension.replace(/^\./, "").slice(0, 19)}` : "");
  const baseName = path.basename(name, currentExtension).slice(0, 160) || `share_${Date.now()}`;
  return `${baseName}${extension}`;
}

function uniqueFilePath(directory, fileName) {
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);
  let candidate = path.join(directory, fileName);
  let suffix = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(directory, `${baseName}_${suffix}${extension}`);
    suffix += 1;
  }
  return candidate;
}

async function downloadShareFile(url, destination, declaredSize = 0) {
  if (declaredSize > MAX_SHARE_FILE_BYTES) throw new Error("FILE_TOO_LARGE");
  const storedSize = getStoredSize(path.dirname(destination));
  if (storedSize + declaredSize > MAX_SHARE_STORAGE_BYTES) throw new Error("STORAGE_FULL");
  const response = await axios.get(url, { responseType: "stream", timeout: 60_000, maxRedirects: 5 });
  const contentLength = Number(response.headers["content-length"]) || 0;
  if (contentLength > MAX_SHARE_FILE_BYTES) {
    response.data.destroy();
    throw new Error("FILE_TOO_LARGE");
  }
  let downloaded = 0;
  const limiter = new Transform({
    transform(chunk, encoding, callback) {
      downloaded += chunk.length;
      if (downloaded > MAX_SHARE_FILE_BYTES) callback(new Error("FILE_TOO_LARGE"));
      else callback(null, chunk);
    },
  });
  try {
    await pipeline(response.data, limiter, fs.createWriteStream(destination, { flags: "wx" }));
    if (storedSize + fs.statSync(destination).size > MAX_SHARE_STORAGE_BYTES) throw new Error("STORAGE_FULL");
  } catch (error) {
    await fs.promises.unlink(destination).catch(() => {});
    throw error;
  }
}

async function sendShareListImage(api, message, files, prefix) {
  let imagePath = null;
  try {
    const items = files.map((name) => ({ name, size: fs.statSync(path.join(FILES_RESOURCE_PATH(api.getBotId()), name)).size }));
    imagePath = await createShareFileListImage(items, prefix);
    await api.sendMessage(
      { msg: `📁 Kho share có ${files.length} file`, attachments: [imagePath], ttl: 30 * 60_000 },
      message.threadId,
      message.type
    );
  } finally {
    if (imagePath) await fs.promises.unlink(imagePath).catch(() => {});
  }
}

export async function handleSendFileCommand(api, message, aliasCommand, isAdminLevelHighest = false) {
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const dataFilesPath = FILES_RESOURCE_PATH(botId);
  const content = removeMention(message);
  let keyword = content.replace(`${prefix}${aliasCommand}`, "").trim();
  let text = keyword;

  try {
    await fs.promises.mkdir(dataFilesPath, { recursive: true });
    if (!keyword.trim() || keyword.trim().toLowerCase() === "list") {
      const files = getStoredFiles(dataFilesPath);
      await sendShareListImage(api, message, files, prefix);
      return;
    }

    if (keyword.trim().toLowerCase() === "add") {
      if (api.apiManager?.isMainBot !== true || !isAdminLevelHighest) {
        await sendMessageWarningRequest(
          api,
          message,
          { caption: "Bạn Đéo Đủ Quyền" },
          300000
        );
        return;
      }

      const quote = message.data?.quote;
      if (!quote?.attach || String(quote.cliMsgType) !== String(MessageSendType["share.file"])) {
        await sendMessageWarningRequest(
          api,
          message,
          { caption: `Hãy reply đúng tin nhắn chứa file rồi dùng ${prefix}${aliasCommand} add.` },
          300000
        );
        return;
      }

      const attachment = parseObject(quote.attach);
      const params = parseObject(attachment.params);
      const fileUrl = attachment.href || attachment.normalUrl;
      if (!fileUrl) {
        await sendMessageWarningRequest(api, message, { caption: "Không lấy được đường dẫn file từ tin nhắn reply." }, 300000);
        return;
      }

      const extension = params.fileExt || path.extname(attachment.title || "").slice(1);
      const fileName = safeFileName(attachment.title || params.fileName || params.name || quote.msg, extension);
      const destination = uniqueFilePath(dataFilesPath, fileName);
      try {
        await downloadShareFile(fileUrl, destination, Number(params.fileSize) || 0);
      } catch (error) {
        const caption = error?.message === "FILE_TOO_LARGE"
          ? "File vượt quá giới hạn 100 MB của kho share."
          : error?.message === "STORAGE_FULL"
            ? "Kho share đã đạt giới hạn lưu trữ 2 GB."
          : "Không tải được file từ tin nhắn reply. Vui lòng thử lại.";
        await sendMessageWarningRequest(api, message, { caption }, 300000);
        return;
      }

      const updatedFiles = getStoredFiles(dataFilesPath);
      const savedName = path.basename(destination);
      const savedIndex = updatedFiles.indexOf(savedName) + 1;
      await sendMessageCompleteRequest(
        api,
        message,
        { caption: `✅ Đã thêm “${savedName}” vào kho share ở vị trí số ${savedIndex}.` },
        300000
      );
      return;
    }

    const indexText = keyword.trim();
    if (/^\d+$/.test(indexText)) {
      const index = Number.parseInt(indexText, 10);
      const files = getStoredFiles(dataFilesPath);
      if (index > 0 && index <= files.length) {
        const selectedFile = files[index - 1];
        const fileLocal = await handleCheckLinkFromFilesLocal(selectedFile, api);
        if (!fileLocal?.fileUrl) {
          await sendMessageWarningRequest(api, message, { caption: "Không thể chuẩn bị file để gửi. Vui lòng thử lại." }, 300000);
          return;
        }
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
