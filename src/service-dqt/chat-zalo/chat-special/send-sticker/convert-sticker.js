import fs from "fs";
import path from "path";
import { checkExstentionFileRemote, deleteFile, downloadFile, getFileTypeRemote } from "../../../../utils/util.js";
import { tempDir } from "../../../../utils/io-json.js";
import { randomIDTemp, removeMention } from "../../../../utils/format-util.js";
import { analyzeLinks, getVideoMetadata } from "../../../../api-zalo/utils.js";
import { isAdmin } from "../../../../index.js";
import {
  convertToWebp,
  convertToWebpWithEffects,
  convertToWebpWithRoundedCorners,
  createCircleWebp,
  TIME_CIRCLE,
} from "./create-webp.js";
import { removeBackground } from "../../../utilities/remove-background.js";
import {
  applyImageEffects,
  buildSpeedFilter,
  buildVideoEffectFilters,
  createTextStickerWebp,
  createAnimatedTextStickerWebp,
  parseExtraStickerArgs,
} from "./sticker-effects.js";
import {
  getNameServer,
  sendMessageComplete,
  sendMessageFailed,
  sendMessageWarning,
} from "../../chat-style/chat-style.js";
import { getGlobalPrefix } from "../../../service.js";
import {
  calculateFileHash,
  calculateFileHashFromURLByBuffer,
  calculateFileHashFromURLByStream,
  PLATFORM_STICKER,
} from "../../../../utils/local-upload-cache.js";
import { getCachedMedia, setCacheData } from "../../../../utils/link-platform-cache.js";

/**
 * Kiểm tra URL có phải là media hợp lệ không
 */
export async function isValidMediaUrl(url) {
  try {
    const type = await getFileTypeRemote(url);
    const ext = type.ext;
    if (!ext) return { isValid: false, isVideo: false, type };
    if (ext === "mp4" || ext === "mov" || ext === "webm") {
      return { isValid: true, isVideo: true, type };
    } else if (ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "gif" || ext === "webp") {
      return { isValid: true, isVideo: false, type };
    } else {
      return { isValid: false, isVideo: false };
    }
  } catch (error) {
    console.error("Lỗi khi kiểm tra URL:", error);
    return { isValid: false, isVideo: false };
  }
}

/**
 * Kiểm tra xem file webp có phải là webp động hay không
 */
async function isAnimatedWebp(filePath) {
  try {
    const buffer = await fs.promises.readFile(filePath);

    // Webp động sẽ có chuỗi "ANIM" trong header
    const isAnimated = buffer.includes("ANIM") || buffer.toString().includes("ANIM") || buffer.indexOf("ANMF") !== -1;

    return isAnimated;
  } catch (error) {
    console.error("Lỗi khi kiểm tra webp động:", error);
    return true; // Nếu có lỗi, xử lý như webp động để an toàn
  }
}

/**
 * Xử lý tạo và gửi sticker từ URL hoặc local path
 */
export async function processAndSendSticker(
  api,
  message,
  mediaSource,
  valueObject = { roundedCorners: 0, isXoaPhong: false }
) {
  const botId = api.getBotId();
  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  const isAdminBot = isAdmin(botId, senderId, threadId);

  const mediaCheck = await isValidMediaUrl(mediaSource);
  if (!mediaCheck.isValid) {
    console.error("URL không hợp lệ:", mediaSource);
    await sendMessageFailed(api, message, "Không hỗ trợ định dạng trong nội dung bạn cung cấp!", true);
    return;
  }

  let ext = mediaCheck.type.ext;
  const tempPath = path.join(tempDir, `sticker_${randomIDTemp()}.png`);
  let pathSticker = path.join(tempDir, `sticker_${randomIDTemp()}.${ext}`);
  let pathWebp = path.join(tempDir, `sticker_${randomIDTemp()}.webp`);
  let isLocalFile = false;
  let roundedCorners = valueObject.roundedCorners;
  let isXoaPhong = valueObject.isXoaPhong;
  let isSpindisk = valueObject.isSpindisk;
  let timeCircleSeconds = valueObject.timeCircleSeconds || TIME_CIRCLE;
  let zoomFactor = valueObject.zoomFactor || null;
  let speedFactor = valueObject.speedFactor || null;
  let pixelSize = valueObject.pixelSize || null;
  let isCat = !!valueObject.isCat;
  const isAi = !!valueObject.isAi;
  if (isAi) {
    isXoaPhong = true;
    isCat = true;
  }
  let rotation = valueObject.rotation || null;
  let flipHorizontal = !!valueObject.flipHorizontal;
  let flipVertical = !!valueObject.flipVertical;
  if (isSpindisk && speedFactor && speedFactor !== 1) {
    timeCircleSeconds = Math.max(0.5, Math.min(15, timeCircleSeconds / speedFactor));
  }
  // if (
  //   decodedUrl.includes("media-ten.z-cdn.me") ||
  //   (decodedUrl.includes("zfcloud") && mediaCheck.type.ext === "webp")
  // ) {
  //   await processMediaToSticker(api, message, decodedUrl, mediaCheck.type.ext);
  //   return;
  // }

  const isVideo = mediaCheck.isVideo;

  if (isXoaPhong && isVideo) {
    await sendMessageWarning(api, message, `Chưa hỗ trợ xóa phong cho sticker video!`, false);
    return;
  }

  if (isSpindisk && isVideo) {
    await sendMessageWarning(api, message, `Chưa hỗ trợ tạo spindisk cho sticker video!`, false);
    return;
  }

  if (!isAdminBot && mediaCheck.isVideo) {
    const metaData = await getVideoMetadata(mediaSource);
    if (!metaData.duration || metaData.duration === 0) {
      const tempContent = `Không kiểm tra được thời lượng video của nội dung cần chuyển đổi.`;
      await sendMessageWarning(api, message, tempContent, false);
      return;
    } else if (metaData.duration > 60000) {
      await sendMessageWarning(api, message, `Hà Huy Hoàng chưa cho phép thành viên tạo sticker video quá 60 giây.`, false);
      return;
    }
  }

  let keyType = mediaCheck.type.ext;
  if (isXoaPhong) keyType += "xp";
  if (isAi) keyType += "ai";
  if (roundedCorners) keyType += roundedCorners;
  if (isSpindisk) keyType += `sd${timeCircleSeconds}`;
  if (zoomFactor) keyType += `z${zoomFactor}`;
  if (pixelSize) keyType += `px${pixelSize}`;
  if (isCat) keyType += `cat`;
  if (speedFactor) keyType += `sp${speedFactor}`;
  if (rotation) keyType += `rot${rotation}`;
  if (flipHorizontal) keyType += "fh";
  if (flipVertical) keyType += "fv";
  const resultFileHash = await calculateFileHashFromURLByBuffer(mediaSource);

  if (resultFileHash.status !== "success") {
    const tempContent = `Không kiểm tra được nội dung cần chuyển đổi, vui lòng thử lại sau.`;
    await sendMessageWarning(api, message, tempContent, false);
    return;
  }

  const fileHash = resultFileHash.hashCode;
  let cachedSticker = await getCachedMedia(PLATFORM_STICKER, fileHash, keyType);

  let subText = "";
  subText += isXoaPhong ? `\nĐã áp dụng xóa phông!` : "";
  subText += isSpindisk ? `\nThời lượng vòng quay: ${Number(timeCircleSeconds.toFixed(2))}s` : "";
  subText += isSpindisk && speedFactor ? `\nTốc độ quay: x${speedFactor}` : "";

  try {
    if (!cachedSticker) {
      await sendMessageComplete(api, message, `Tiến hành tạo sticker, vui lòng chờ một chút.`, true, 6000);
      if (isSpindisk) {
        const spindiskResult = await createCircleWebp(api, message, mediaSource, fileHash, timeCircleSeconds);
        if (!spindiskResult) {
          await sendMessageFailed(
            api,
            message,
            `Không thể tạo spindisk cho nội dung này, vui lòng thử lại sau...`,
            true
          );
          return;
        }
        cachedSticker = {
          fileUrl: spindiskResult.url,
          caption: subText,
          width: spindiskResult.stickerData.width,
          height: spindiskResult.stickerData.height,
          type: mediaCheck.type.ext,
          ...spindiskResult.stickerData,
        };
      } else {  
      let mediaConvertSticker;

      if (isXoaPhong) {
        const imageData = await removeBackground(mediaSource);
        if (!imageData) {
          await sendMessageFailed(
            api,
            message,
            `Không thể xóa phông nội dung này ở thời điểm hiện tại, vui lòng thử lại sau...`,
            true
          );
          return;
        }
        fs.writeFileSync(tempPath, imageData);
        mediaConvertSticker = tempPath;
      } else {
        mediaConvertSticker = mediaSource;
      }
      try {
        await fs.promises.access(mediaConvertSticker);
        isLocalFile = true;
      } catch {
        isLocalFile = false;
      }

      if (!isLocalFile) {
        fs.writeFileSync(pathSticker, resultFileHash.data);
      } else {
        pathSticker = mediaConvertSticker;
        ext = path.extname(pathSticker).toLowerCase().substring(1);
      }

      const hasExtraVisualEffects = !!(zoomFactor || pixelSize || isCat || rotation || flipHorizontal || flipVertical);

      if (isVideo && (hasExtraVisualEffects || speedFactor)) {
        // Video: xử lý zoom/pixel/cat/speed bằng chuỗi filter ffmpeg riêng
        const videoFilters = buildVideoEffectFilters({ zoomFactor, pixelSize, isCat, rotation, flipHorizontal, flipVertical });
        const speedFilter = buildSpeedFilter(speedFactor);
        await convertToWebpWithEffects(pathSticker, pathWebp, { videoFilters, speedFilter });
        if (zoomFactor) subText += `\nZoom: x${zoomFactor}`;
        if (pixelSize) subText += `\nHiệu ứng pixel: ${pixelSize}`;
        if (isCat) subText += `\nĐã ép khung 512x512`;
        if (speedFactor) subText += `\nTốc độ: x${speedFactor}`;
        if (rotation) subText += `\nXoay: ${rotation}°`;
        if (flipHorizontal) subText += `\nLật ngang`;
        if (flipVertical) subText += `\nLật dọc`;
      } else {
        if (!isVideo && speedFactor) {
          // sp chỉ có tác dụng với video, bỏ qua với ảnh tĩnh
          subText += `\n(Lưu ý: đối số sp chỉ áp dụng cho video, ảnh tĩnh sẽ bỏ qua)`;
        }

        if (!isVideo && hasExtraVisualEffects) {
          // Ảnh: áp dụng zoom/pixel/cat bằng sharp rồi trả về PNG để tiếp tục pipeline bo góc + webp như cũ
          const effectBuffer = await applyImageEffects(pathSticker, { zoomFactor, pixelSize, isCat, rotation, flipHorizontal, flipVertical });
          const effectPngPath = path.join(tempDir, `sticker_effect_${randomIDTemp()}.png`);
          fs.writeFileSync(effectPngPath, effectBuffer);
          const preEffectPath = pathSticker;
          if (!isLocalFile && preEffectPath !== effectPngPath) {
            deleteFile(preEffectPath);
          }
          pathSticker = effectPngPath;
          ext = "png";

          if (zoomFactor) subText += `\nZoom: x${zoomFactor}`;
          if (pixelSize) subText += `\nHiệu ứng pixel: ${pixelSize}`;
          if (isCat) subText += `\nĐã ép khung 512x512`;
          if (rotation) subText += `\nXoay: ${rotation}°`;
          if (flipHorizontal) subText += `\nLật ngang`;
          if (flipVertical) subText += `\nLật dọc`;
        }

        if (ext === "webp" && roundedCorners > 0) {
          const isAnimated = await isAnimatedWebp(pathSticker);
          if (!isAnimated) {
            await convertToWebpWithRoundedCorners(pathSticker, pathWebp, roundedCorners);
            subText += `\nBo cong sticker: ${roundedCorners}%`;
          } else {
            await convertToWebp(pathSticker, pathWebp, roundedCorners);
          }
        } else if ((ext === "jpg" || ext === "jpeg" || ext === "png") && roundedCorners > 0) {
          await convertToWebpWithRoundedCorners(pathSticker, pathWebp, roundedCorners);
          subText += `\nBo cong sticker: ${roundedCorners}%`;
        } else if (ext === "webp") {
          pathWebp = pathSticker;
        } else {
          await convertToWebp(pathSticker, pathWebp, roundedCorners);
          // subText += roundedCorners > 0 ? `\nBo cong sticker: ${roundedCorners}%` : "";
        }
      }

      const [linkUploadZalo, stickerData] = await Promise.all([
        api.uploadAttachment([pathWebp], message.threadId, message.type, { uploadCloud: true }),
        getVideoMetadata(pathWebp),
      ]);

      let finalUrl = linkUploadZalo[0].fileUrl || linkUploadZalo[0].normalUrl;
      if (finalUrl) {
        finalUrl += `.webp`;
        setCacheData(
          PLATFORM_STICKER,
          fileHash,
          {
            caption: subText,
            fileUrl: finalUrl,
            type: mediaCheck.type.ext,
            ...stickerData,
          },
          keyType
        );
        cachedSticker = await getCachedMedia(PLATFORM_STICKER, fileHash, keyType);
      }
    }
  }
    const completedCaption = (`Sticker của bạn đây!` + (cachedSticker.caption || "")).trim();
    await sendMessageComplete(api, message, completedCaption, true, 300000);
    await api.sendCustomSticker(
      message,
      cachedSticker.fileUrl,
      cachedSticker.fileUrl,
      cachedSticker.width,
      cachedSticker.height,
      6000000
    );

    return true;
  } catch (error) {
    console.error("Lỗi khi xử lý sticker:", error);
    const errorMessage = `Đã xảy ra lỗi khi tạo sticker: ${error.message}`;
    await sendMessageFailed(api, message, errorMessage, true, 300000);
    throw error;
  } finally {
    await Promise.all([deleteFile(pathSticker), deleteFile(pathWebp), deleteFile(tempPath)]);
  }
}

// Hàm xử lý media và chuyển đổi thành sticker
async function processMediaToSticker(api, message, mediaUrl, ext) {
  try {
    const tempPath = path.join(tempDir, `sticker_${randomIDTemp()}.${ext}`);
    try {
      await downloadFile(mediaUrl, tempPath);
      const stickerData = await getVideoMetadata(tempPath);
      await sendMessageComplete(api, message, `Xử lý chuyển đổi sticker hoàn tất!`, false);
      await api.sendCustomSticker(message, mediaUrl, mediaUrl, stickerData.width, stickerData.height);
    } catch (error) {
      await sendMessageWarning(api, message, "Đã xảy ra lỗi khi xử lý data: " + error.message, false);
    } finally {
      deleteFile(tempPath);
    }
  } catch (error) {
    await sendMessageWarning(api, message, "Đã xảy ra lỗi trong quá trình xử lý: " + error.message, false);
  }
}

const STICKER_HELP_CAPTION =
  `Hãy reply vào tin nhắn chứa ảnh hoặc video hoặc cung cấp link content hợp lệ để tạo sticker.\n` +
  ` Đối số đặc biệt: \n` +
  `   text <nội dung>: Tạo sticker chữ\n` +
  `   textvd <màu> <nội dung>: Tạo sticker chữ chạy\n` +
  `      Màu: rainbow | đỏ | xanh | vàng | hồng | cam | tím | trắng\n` +
  `   ai: Tách nền thông minh và căn khung sticker\n` +
  `   xp: Xóa Phông\n` +
  `   -r(%): Bo cong sticker (Max 50%)\n` +
  `   z(x): Zoom in/out (vd: z1.5, z0.7)\n` +
  `   sp(x): Tăng/giảm tốc độ video hoặc spin (vd: sp2, sp0.5)\n` +
  `   pixel(size): Tạo hiệu ứng pixel (vd: pixel8)\n` +
  `   spin hoặc sd(s): Tạo sticker xoay tròn (Min 0.5s, Max 15s)\n` +
  `   cat: Ép sticker về đúng khung 512x512\n` +
  `   rot(số): Xoay theo góc độ (vd: rot90, rot-45, rot10.5)\n` +
  `   fh: Lật ngang | fv: Lật dọc\n`;

/**
 * Xử lý lệnh tạo sticker chữ: !stk text <nội dung>
 */
async function handleTextStickerCommand(api, message, textContent, animatedColor = null) {
  if (!textContent || !textContent.trim()) {
    await sendMessageWarning(api, message, `Vui lòng nhập nội dung chữ cần tạo sticker!\nVí dụ: !stk text Chào bạn`, false);
    return;
  }

  let pathWebp = null;
  try {
    await sendMessageComplete(api, message, `Đang tạo sticker chữ, vui lòng chờ một chút.`, true, 6000);
    pathWebp = animatedColor
      ? await createAnimatedTextStickerWebp(textContent.trim().slice(0, 120), animatedColor)
      : await createTextStickerWebp(textContent.trim().slice(0, 120));

    const [linkUploadZalo, stickerData] = await Promise.all([
      api.uploadAttachment([pathWebp], message.threadId, message.type, { uploadCloud: true }),
      getVideoMetadata(pathWebp),
    ]);

    let finalUrl = linkUploadZalo[0].fileUrl || linkUploadZalo[0].normalUrl;
    if (!finalUrl) {
      throw new Error("Không upload được sticker chữ lên server");
    }
    finalUrl += `.webp`;

    await sendMessageComplete(api, message, `Sticker chữ của bạn đây!`, true, 300000);
    await api.sendCustomSticker(message, finalUrl, finalUrl, stickerData.width, stickerData.height, 6000000);
  } catch (error) {
    console.error("Lỗi khi tạo sticker chữ:", error);
    await sendMessageFailed(api, message, `Lỗi khi tạo sticker chữ -> ${error.message}`, true, 300000);
  } finally {
    if (pathWebp) deleteFile(pathWebp);
  }
}

/**
 * Xử lý lệnh tạo sticker
 */
export async function handleConvertStickerCommand(api, message, aliasCommand) {
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const content = removeMention(message);
  let keyword = content.replace(`${prefix}${aliasCommand}`, "").trim();

  if (/^textvd(\s|$)/i.test(keyword)) {
    const [, color = "rainbow", ...textParts] = keyword.split(/\s+/);
    await handleTextStickerCommand(api, message, textParts.join(" "), color);
    return;
  }

  // Đối số "text <nội dung>": tạo sticker chữ, không cần ảnh/video/link nguồn
  if (/^text(\s|$)/i.test(keyword)) {
    const textContent = keyword.replace(/^text\s*/i, "");
    await handleTextStickerCommand(api, message, textContent);
    return;
  }

  const args = keyword.trim().split(/\s+/).filter(Boolean);
  const isAi = args.some((arg) => arg.toLowerCase() === "ai");

  let linkContent = "";
  const detectedLinkInContent = analyzeLinks(keyword);
  if (detectedLinkInContent.count > 0) {
    linkContent = detectedLinkInContent.links[0];
  }

  const quote = message.data?.quote;
  if (quote) {
    if (!linkContent) {
      try {
        const parseMessage = JSON.parse(quote.attach);
        linkContent = parseMessage.href || parseMessage.title || quote.msg || null;
      } catch (error) {
        linkContent = analyzeLinks(quote.msg).links[0] || null;
      }
    }
  }

  if (!linkContent) {
    await sendMessageWarning(api, message, STICKER_HELP_CAPTION, false);
    return;
  }

  try {
    const decodedUrl = decodeURIComponent(linkContent.replace(/\\\//g, "/"));

    let roundedCorners = 0;
    let isXoaPhong;
    let isSpindisk = false;
    let timeCircleSeconds = TIME_CIRCLE;
    const roundedCornersRegex = /^-?r(\d+)?$/;
    const spindiskRegex = /^(sd|spin|spindisk)([\d.]+)?$/i;

    args.forEach((arg) => {
      const match = arg.match(roundedCornersRegex);
      if (match) {
        roundedCorners = 6;
        if (match[1]) {
          const percent = parseInt(match[1]);
          if (!isNaN(percent)) {
            roundedCorners = percent > 50 ? 50 : percent < 0 ? 0 : percent;
          }
        }
      } else if (arg.startsWith("xp")) {
        isXoaPhong = true;
      } else {
        const sdMatch = arg.match(spindiskRegex);
        if (sdMatch) {
          isSpindisk = true;
          if (sdMatch[2]) {
            const sec = parseFloat(sdMatch[2]);
            if (!isNaN(sec) && sec >= 0.5 && sec <= 15) {
              timeCircleSeconds = sec;
            }
          }
        }
      }
    });

    // z(x) / sp(x) / pixel(size) / cat
    const { zoomFactor, speedFactor, pixelSize, isCat, rotation, flipHorizontal, flipVertical } = parseExtraStickerArgs(args);

    await processAndSendSticker(api, message, decodedUrl, {
      roundedCorners,
      isXoaPhong,
      isSpindisk,
      timeCircleSeconds,
      zoomFactor,
      speedFactor,
      pixelSize,
      isCat,
      rotation,
      flipHorizontal,
      flipVertical,
      isAi,
    });
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh sticker:", error);
    await sendMessageFailed(api, message, `Lỗi Khi Xử Lý Lệnh Sticker -> ${error.message}`, true, 300000);
  }
}
