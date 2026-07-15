import jsQR from "jsqr";
import { createCanvas, loadImage } from "canvas";
import { imageBufferCache } from "../../utils/image-buffer-cache.js";
import { getGlobalPrefix } from "../service.js";
import { removeMention } from "../../utils/format-util.js";
import { checkExstentionFileRemote, checkLinkIsValid } from "../../utils/util.js";
import { sendMessageCompleteRequest, sendMessageWarningRequest } from "../chat-zalo/chat-style/chat-style.js";

const TIME_SHOW_SCAN_QR = 600000;
/**
 * Quét và phân tích nội dung QR code từ hình ảnh
 * @param {string} imageUrl Đường dẫn đến file ảnh
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function scanQRCode(imageUrl, options = {}) {
  try {
    const imageBuffer = await imageBufferCache.getBuffer(imageUrl, options);
    const image = await loadImage(imageBuffer);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, image.width, image.height);

    const code = jsQR(imageData.data, imageData.width, imageData.height);

    if (!code) {
      return {
        success: false,
        error: "Không tìm thấy QRCode trong ảnh"
      };
    }

    const qrData = parseQRContent(code.data);

    return {
      success: true,
      data: qrData
    };

  } catch (error) {
    if (!options?.silent) {
      console.error("Lỗi khi quét mã QRCode:", error);
    }
    return {
      success: false,
      error: "Lỗi khi xử lý ảnh QRCode"
    };
  }
}

/**
 * Phân tích nội dung trong mã QR
 */
function parseQRContent(content) {
  try {
    if (content.includes("bankid=")) {
      const params = new URLSearchParams(content);

      return {
        type: "bank_transfer",
        bankId: params.get("bankid"),
        accountNumber: params.get("account"),
        accountName: params.get("name")
      };
    }

    return {
      type: "text",
      content: content
    };

  } catch (error) {
    console.error("Lỗi khi phân tích nội dung QRCode:", error);
    return {
      type: "unknown",
      content: content
    };
  }
}

/**
 * Xử lý lệnh quét QR code
 */
export async function handleScanQRCommand(api, message, aliasCommand) {
  const prefix = getGlobalPrefix(api.getBotId());
  const content = removeMention(message);
  let text = content.replace(`${prefix}${aliasCommand}`, "").trim();

  const quote = message.data?.quote;
  if (quote) {
    try {
      const parseMessage = JSON.parse(quote.attach);
      const href = parseMessage?.href;
      if (href) {
        text = href;
      }
    } catch (error) {
    }
  }

  if (!text) {
    const object = {
      caption: `Vui lòng reply tin nhắn chứa nội dung hoặc link QRCode cần quét!`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return;
  }

  const ext = await checkExstentionFileRemote(text);
  if (ext !== "png" && ext !== "jpg" && ext !== "jpeg") {
    const object = {
      caption: `Link hoặc định dạng file không phải là QRCode!`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return;
  }

  const result = await scanQRCode(text);
  if (!result.success) {
    const object = {
      caption: `Không tìm thấy QRCode trong ảnh!`,
    };
    await sendMessageCompleteRequest(api, message, object, 30000);
    return;
  }

  if (await checkLinkIsValid(result.data.content)) {
    const ext = await checkExstentionFileRemote(result.data.content);
    if (ext === "png" || ext === "jpg" || ext === "jpeg") {
      await sendMessageCompleteRequest(api, message, { caption: "Quét Ảnh Từ QRCode Thành Công!" }, TIME_SHOW_SCAN_QR);
      await api.sendImage(result.data.content,
        message,
        "",
        TIME_SHOW_SCAN_QR
      );
    } else if (ext === "mp4") {
      await sendMessageCompleteRequest(api, message, { caption: "Quét Video Từ QRCode Thành Công!" }, TIME_SHOW_SCAN_QR);
      await api.sendVideo({
        videoUrl: result.data.content,
        thumbnail: "",
        threadId: message.threadId,
        threadType: message.type,
        message: { text: "" },
        ttl: TIME_SHOW_SCAN_QR,
      });
    } else if (ext === "gif") {
      await sendMessageCompleteRequest(api, message, { caption: "Quét Gif Từ QRCode Thành Công!" }, TIME_SHOW_SCAN_QR);
      await api.sendGif(result.data.content,
        message,
        "",
        TIME_SHOW_SCAN_QR);
    } else if (ext === "webp") {
      await sendMessageCompleteRequest(api, message, { caption: "Quét Sticker Từ QRCode Thành Công!" }, TIME_SHOW_SCAN_QR);
      await api.sendCustomSticker(
        message,
        result.data.content,
        result.data.content,
        null,
        null,
        TIME_SHOW_SCAN_QR
      );
    } else if (ext === "aac" || ext === "mp3" || ext === "m4a") {
      await sendMessageCompleteRequest(api, message, { caption: "Quét Voice Từ QRCode Thành Công!" }, TIME_SHOW_SCAN_QR);
      await api.sendVoice(
        { threadId: message.threadId, type: message.type },
        result.data.content,
        TIME_SHOW_SCAN_QR
      );
    } else if (ext === "apk" || ext === "ipa" || ext === "zip" || ext === "rar" || ext === "7z" || ext === "tar" || ext === "gz" || ext === "bz2" || ext === "xz") {
      await sendMessageCompleteRequest(api, message, { caption: "Quét File Từ QRCode Thành Công!" }, TIME_SHOW_SCAN_QR);
      await api.sendFile(message, result.data.content, TIME_SHOW_SCAN_QR, result.data.content, null, ext, null);
    } else {
      await sendMessageCompleteRequest(api, message, { caption: `Quét QRCode Hoàn Tất, Nội Dung:\n${result.data.content}` }, TIME_SHOW_SCAN_QR);
    }
  } else {
    await sendMessageCompleteRequest(api, message, { caption: `Quét QRCode Hoàn Tất, Nội Dung:\n${result.data.content}` }, TIME_SHOW_SCAN_QR);
  }
}