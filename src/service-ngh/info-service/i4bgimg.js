import { removeMention } from "../../utils/format-util.js";
import { getGlobalPrefix } from "../service.js";
import { getUserInfoData } from "./user-info.js";
import axios from "axios";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import os from "os";
import { Canvas as SkiaCanvas, loadImage as loadSkiaImage } from "skia-canvas";
import { getQRProfileUserFactory } from "../../api-zalo/apis/getQRProfileUser.js";

/**
 * Lệnh i4bgimg — reply vào ảnh để tạo card thông tin người dùng
 * với ảnh reply làm avatar trên nền background ngẫu nhiên,
 * định dạng card chia sẻ có nút "Xem thông tin" để mở trang cá nhân Zalo.
 *
 * Cú pháp: reply vào ảnh + {prefix}i4bgimg (hoặc {prefix}i4 img / {prefix}i4 bgimg)
 */
export async function handleI4BgImgCommand(api, message, aliasCommand) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  let content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  content = content.replace(`${prefix}${aliasCommand}`, "").trim();

  const tempPaths = [];

  try {
    // 1. Lấy tin nhắn được reply
    const quote = message.data.quote;
    if (!quote || !quote.attach) {
      await api.sendMessage(
        { msg: "❌ Vui lòng reply vào một tin nhắn có ảnh để sử dụng lệnh này.", quote: message },
        threadId,
        message.type
      );
      return;
    }

    // 2. Trích xuất URL ảnh từ tin nhắn được reply
    let attachData = {};
    try {
      attachData = typeof quote.attach === "string" ? JSON.parse(quote.attach) : quote.attach;
    } catch {
      attachData = {};
    }

    let imageUrl =
      attachData.hdUrl ||
      attachData.href ||
      attachData.oriUrl ||
      attachData.normalUrl ||
      attachData.thumbUrl ||
      attachData.url ||
      attachData.thumb ||
      null;

    if (!imageUrl && attachData.params) {
      try {
        const params = typeof attachData.params === "string" ? JSON.parse(attachData.params) : attachData.params;
        imageUrl =
          params.hd ||
          params.hdUrl ||
          params.normalUrl ||
          params.thumbUrl ||
          params.oriUrl ||
          params.href ||
          params.url ||
          null;
      } catch {}
    }

    if (!imageUrl) {
      await api.sendMessage(
        { msg: "❌ Tin nhắn được reply không chứa ảnh hợp lệ.", quote: message },
        threadId,
        message.type
      );
      return;
    }

    // 3. Lấy thông tin người gửi tin nhắn được reply
    const quoteSenderId = quote.uidFrom || quote.fromUid || senderId;
    const userInfo = await getUserInfoData(api, quoteSenderId);

    const name = userInfo?.name || "Không xác định";
    const gender = cleanGender(userInfo?.genderId ?? userInfo?.gender);
    const uid = userInfo?.uid || quoteSenderId;
    const globalId = userInfo?.globalId || null;

    const infoText = `name: ${name}\ngender: ${gender}\nuid: ${uid}`;
    let profileUrl = globalId
      ? `https://zalo.me/u/${globalId}`
      : `https://zalo.me/${uid}`;

    try {
      const appContext = api?.appContext || api;
      const getQRLink = getQRProfileUserFactory(api, appContext);
      const qrData = await getQRLink(quoteSenderId);
      const qrCodeUrl = qrData?.[quoteSenderId] || qrData?.url || null;
      if (qrCodeUrl && typeof qrCodeUrl === "string" && qrCodeUrl.includes("zalo.me/")) {
        profileUrl = qrCodeUrl;
      }
    } catch {}

    // 4. Chọn background landscape 1920x1080 ngẫu nhiên
    let bgPath = null;
    try {
      const bgDirLandscape = path.resolve("./assets/resources/background/1920x1080");
      const bgDirPortrait = path.resolve("./assets/resources/background/1080x1920");
      const chosenDir = fs.existsSync(bgDirLandscape) ? bgDirLandscape : bgDirPortrait;
      const bgFiles = fs.readdirSync(chosenDir).filter((f) => /\.(png|jpe?g)$/i.test(f));
      if (bgFiles.length > 0) {
        const randomBg = bgFiles[Math.floor(Math.random() * bgFiles.length)];
        bgPath = path.join(chosenDir, randomBg);
      }
    } catch {}

    // 5. Tạo card ảnh dạng landscape tỉ lệ 2:1
    const cardPath = await createBgImgCard(bgPath, imageUrl, name, tempPaths);
    tempPaths.push(cardPath);

    // 6. Upload ảnh card lên Zalo CDN
    let uploadedCardUrl = null;
    try {
      const uploadResult = await api.uploadAttachment([cardPath], threadId, message.type);
      uploadedCardUrl =
        uploadResult?.[0]?.hdUrl ||
        uploadResult?.[0]?.normalUrl ||
        uploadResult?.[0]?.thumbUrl ||
        null;
    } catch (e) {
      console.warn("[i4bgimg] Upload card error:", e.message);
    }

    // 7. Gửi tin nhắn dạng Card chuyển tiếp chuẩn (Text trên + Card ảnh giữa + Nút Xem thông tin dưới)
    let sendSuccess = false;
    if (uploadedCardUrl && typeof api.sendMessageForward === "function") {
      try {
        await api.sendMessageForward(
          {
            msg: infoText,
            title: "Xem thông tin",
            link: profileUrl,
            thumb: uploadedCardUrl,
            desc: "",
            src: "",
          },
          threadId,
          message.type,
          6000000
        );
        sendSuccess = true;
      } catch (e) {
        console.warn("[i4bgimg] sendMessageForward error, fallback to sendCustomLink:", e.message);
      }
    }

    if (!sendSuccess && uploadedCardUrl && typeof api.sendCustomLink === "function") {
      try {
        await api.sendCustomLink(
          {
            msg: infoText,
            href: profileUrl,
            title: "Xem thông tin",
            thumb: uploadedCardUrl,
            src: "zalo.me",
          },
          threadId,
          message.type,
          6000000
        );
        sendSuccess = true;
      } catch (e) {
        console.warn("[i4bgimg] sendCustomLink error:", e.message);
      }
    }

    // Fallback nếu không gửi được link card
    if (!sendSuccess) {
      await api.sendMessage(
        {
          msg: `${infoText}\n\nXem thông tin: ${profileUrl}`,
          attachments: [cardPath],
          ttl: 6000000,
          isUseProphylactic: true,
        },
        threadId,
        message.type
      );
    }
  } catch (error) {
    console.error("[i4bgimg] Lỗi:", error);
    await api.sendMessage(
      {
        msg: "❌ Đã xảy ra lỗi khi tạo ảnh. Vui lòng thử lại sau.",
        quote: message,
      },
      threadId,
      message.type
    );
  } finally {
    for (const p of tempPaths) {
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {}
    }
  }
}

function cleanGender(gender) {
  if (gender === 0 || gender === "0") return "Nam";
  if (gender === 1 || gender === "1") return "Nữ";
  const str = String(gender || "").toLowerCase();
  if (str.includes("nam")) return "Nam";
  if (str.includes("nữ") || str.includes("nu")) return "Nữ";
  return "Không xác định";
}

/**
 * Tạo ảnh card landscape với background + avatar tròn viền trắng + tên người dùng.
 */
async function createBgImgCard(bgPath, avatarUrl, userName, tempPaths) {
  const width = 1000;
  const height = 500;
  const canvas = new SkiaCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // --- 1. Vẽ background ---
  if (bgPath && fs.existsSync(bgPath)) {
    try {
      const bgImg = await loadSkiaImage(bgPath);
      const scale = Math.max(width / bgImg.width, height / bgImg.height);
      const scaledW = bgImg.width * scale;
      const scaledH = bgImg.height * scale;
      const offsetX = (width - scaledW) / 2;
      const offsetY = (height - scaledH) / 2;
      ctx.drawImage(bgImg, offsetX, offsetY, scaledW, scaledH);
    } catch {
      drawFallbackGradient(ctx, width, height);
    }
  } else {
    drawFallbackGradient(ctx, width, height);
  }

  // --- 2. Dark overlay nhẹ giúp text/avatar nổi bật ---
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.fillRect(0, 0, width, height);

  // --- 3. Tải và xử lý avatar tròn ---
  const avatarRadius = 85;
  const avatarX = 180;
  const avatarY = 250;

  let avatarImg = null;
  try {
    const cleanUrl = String(avatarUrl).replace(/\.jxl(\?|$)/gi, ".jpg$1");
    const res = await axios.get(cleanUrl, {
      responseType: "arraybuffer",
      timeout: 15000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://chat.zalo.me/",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });
    const buffer = Buffer.from(res.data);
    try {
      avatarImg = await loadSkiaImage(buffer);
    } catch {
      try {
        const pngBuffer = await sharp(buffer)
          .resize(avatarRadius * 2, avatarRadius * 2, { fit: "cover" })
          .png()
          .toBuffer();
        avatarImg = await loadSkiaImage(pngBuffer);
      } catch (errSharp) {
        console.error("[i4bgimg] Sharp parse error:", errSharp.message);
      }
    }
  } catch (e) {
    console.error("[i4bgimg] Lỗi tải avatar:", e.message);
  }

  // Viền ngoài avatar (trắng nổi bật có đổ bóng)
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarRadius + 4, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  // Clip avatar thành hình tròn
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
  ctx.clip();

  if (avatarImg) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      avatarImg,
      avatarX - avatarRadius,
      avatarY - avatarRadius,
      avatarRadius * 2,
      avatarRadius * 2
    );
  } else {
    ctx.fillStyle = "#374151";
    ctx.fillRect(
      avatarX - avatarRadius,
      avatarY - avatarRadius,
      avatarRadius * 2,
      avatarRadius * 2
    );
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 56px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((userName || "?").charAt(0).toUpperCase(), avatarX, avatarY);
  }
  ctx.restore();

  // --- 4. Vẽ tên người dùng bên cạnh avatar ---
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 44px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  const textX = avatarX + avatarRadius + 30;
  const textY = avatarY;

  let displayName = userName || "Không xác định";
  const maxTextWidth = width - textX - 40;
  while (displayName.length > 3 && ctx.measureText(displayName).width > maxTextWidth) {
    displayName = displayName.slice(0, -4) + "…";
  }

  ctx.fillText(displayName, textX, textY);
  ctx.restore();

  // --- 5. Xuất file ---
  const filePath = path.resolve("./assets/temp/bgimg_card_" + Date.now() + ".png");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, await canvas.toBuffer("png"));
  return filePath;
}

function drawFallbackGradient(ctx, width, height) {
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#1e293b");
  bg.addColorStop(0.5, "#0f172a");
  bg.addColorStop(1, "#334155");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
}
