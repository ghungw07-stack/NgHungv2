import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';
import axios from "axios";
import sharp from "sharp";
import { getGlobalPrefix } from '../../service-dqt/service.js';
import { removeMention } from "../../utils/format-util.js";
import { checkExstentionFileRemote, checkLinkIsValid } from "../../utils/util.js";
import { sendMessageStateQuote,sendMessageCompleteRequest } from '../../service-dqt/chat-zalo/chat-style/chat-style.js';
import { scanQRCode } from "../../service-dqt/utilities/qr-scan.js";
import { AwesomeQR } from "awesome-qr";
const TIME_SHOW_SCAN_QR = 600000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Author : Hà Huy Hoàng
// Description: Pexels Image code by H H H BOT

export const COLOR_RED = "db342e";
export const COLOR_YELLOW = "f7b503";
export const COLOR_PINK = "FF1493";
export const COLOR_GREEN = "15a85f";
export const SIZE_18 = "18";
export const SIZE_16 = "14";
export const IS_BOLD = true;

export async function handleQrcodeCommand(api, message) {
  const threadId = message.threadId;
  const quote = message.data?.quote;
  const senderName = message.data?.dName || "Người dùng";
  const senderId = message.data?.uidFrom;
  let qrContent;

  if (quote) {
    if (quote.msg) {
      qrContent = quote.msg;
    } else if (quote.attach) {
      try {
        const attachData = JSON.parse(quote.attach);
        qrContent =
          attachData.href ||
          attachData.thumbUrl ||
          attachData.title ||
          "Dữ liệu không xác định.";
      } catch (error) {
        console.error("Lỗi xử lý dữ liệu attach:", error);
        await sendMessageStateQuote(
          api,
          message,
          "Lỗi xử lý dữ liệu từ tin nhắn reply!",
          false,
          30000
        );
        return;
      }
    } else {
      qrContent = "Dữ liệu không xác định.";
    }
  } else {
    const content = message.data?.content?.trim();
    if (!content || content.split(" ").length < 2) {
      await sendMessageStateQuote(
        api,
        message,
        "Vui lòng nhập nội dung hoặc reply một tin nhắn hợp lệ!",
        false,
        30000
      );
      return;
    }
    qrContent = content.split(" ").slice(1).join(" ");
  }

  const tempDir = path.resolve(__dirname, "cache");
  await fs.mkdir(tempDir, { recursive: true });

  const uniqueSuffix = Date.now();
  const avatarFilePath = path.resolve(tempDir, `avatar_${uniqueSuffix}.png`);
  const resizedAvatarPath = path.resolve(
    tempDir,
    `avatar_resized_${uniqueSuffix}.png`
  );
  const qrFilePath = path.resolve(tempDir, `qrcode_${uniqueSuffix}.png`);

  try {
    const userInfoResponse = await api.getUserInfo(senderId);
    const userInfo =
      userInfoResponse.unchanged_profiles?.[senderId] ||
      userInfoResponse.changed_profiles?.[senderId];
    if (!userInfo || !userInfo.avatar) {
      await sendMessageStateQuote(
        api,
        message,
        "Không thể lấy thông tin người dùng hoặc ảnh đại diện!",
        false,
        30000
      );
      return;
    }

    const avatarUrl = userInfo.avatar;
    const avatarResponse = await axios.get(avatarUrl, {
      responseType: "arraybuffer",
    });
    await fs.writeFile(avatarFilePath, avatarResponse.data);

    const logoSize = 100;
    await sharp(avatarFilePath)
      .resize(logoSize, logoSize)
      .png()
      .toFile(resizedAvatarPath);

    const buffer = await new AwesomeQR({
      text: qrContent,
      size: 500,
      margin: 20,
      dotScale: 1,
      logoImage: resizedAvatarPath,
      logoScale: 0.2,
      logoCornerRadius: 50,
    }).draw();

    await fs.writeFile(qrFilePath, buffer);

    await api.sendMessage(
      {
        msg: `@${senderName}\nQR Code của bạn đã được tạo!`,
        mentions: [{ uid: senderId, pos: 0, len: senderName.length + 1 }],
        attachments: [qrFilePath],
        ttl: 5000000,
      },
      threadId,
      message.type
    );
  } catch (error) {
    console.error("Lỗi khi tạo QR Code:", error.message);
    await sendMessageStateQuote(
      api,
      message,
      `Lỗi khi tạo QR Code: ${error.message}`,
      false,
      30000
    );
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      await fs.rm(avatarFilePath, { force: true });
    } catch (error) {}
    try {
      await fs.rm(resizedAvatarPath, { force: true });
    } catch (error) {}
    try {
      await fs.rm(qrFilePath, { force: true });
    } catch (error) {}
  }
}
// Hàm chính để xử lý quét QR Code
export async function handleScanQrcodeCommand(api, message, aliasCommand) {
  const prefix = getGlobalPrefix();
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
      caption: `Link hoặc định dạng file Không phải là QRCode!`,
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

  if (checkLinkIsValid(result.data.content)) {
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