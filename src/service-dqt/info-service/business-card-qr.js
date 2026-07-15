import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { createCanvas, loadImage } from "canvas";
import { getUserInfoData } from "../info-service/user-info.js";
import { getQRProfileUserFactory } from "../../api-zalo/apis/getQRProfileUser.js";
import {
  sendMessageCompleteRequest,
  sendMessageWarningRequest,
} from "../chat-zalo/chat-style/chat-style.js";
import { tempDir } from "../../utils/io-json.js";
import { deleteFile } from "../../utils/util.js";


async function ensureTempDir() {
  if (!tempDir) throw new Error("tempDir is not defined");
  await fs.promises.mkdir(tempDir, { recursive: true });
}

async function downloadImageTemp(url, prefix, uid) {
  await ensureTempDir();
  const filePath = path.join(tempDir, `${prefix}_${uid}_${Date.now()}.png`);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Không tải được ảnh (${res.status})`);

  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(filePath, buffer);
  return filePath;
}

async function drawBusinessCardQR(userInfo, qrPath, uid) {
  await ensureTempDir();

  const width = 700;
  const height = 900;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0b6edc";
  ctx.fillRect(0, 0, width, height);

  const boxX = 40;
  const boxY = 140;
  const boxWidth = width - 80;
  const boxHeight = height - 200;
  const radius = 30;

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(boxX + radius, boxY);
  ctx.lineTo(boxX + boxWidth - radius, boxY);
  ctx.quadraticCurveTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + radius);
  ctx.lineTo(boxX + boxWidth, boxY + boxHeight - radius);
  ctx.quadraticCurveTo(boxX + boxWidth, boxY + boxHeight, boxX + boxWidth - radius, boxY + boxHeight);
  ctx.lineTo(boxX + radius, boxY + boxHeight);
  ctx.quadraticCurveTo(boxX, boxY + boxHeight, boxX, boxY + boxHeight - radius);
  ctx.lineTo(boxX, boxY + radius);
  ctx.quadraticCurveTo(boxX, boxY, boxX + radius, boxY);
  ctx.closePath();
  ctx.fill();

  const avatarSize = 120;
  const avatarCenterX = width / 2;
  const avatarCenterY = boxY;

  let avatarLoaded = null;
  let avatarPath = null;
  if (userInfo.avatar) {
    try {
      avatarPath = await downloadImageTemp(userInfo.avatar, "avatar", uid);
      avatarLoaded = await loadImage(avatarPath);
    } catch (e) {
      console.error("Không load được avatar:", e.message);
      avatarLoaded = null;
    }
  }

  const ringRadius = avatarSize / 2 + 6;
  const grad = ctx.createLinearGradient(
    avatarCenterX - ringRadius,
    avatarCenterY - ringRadius,
    avatarCenterX + ringRadius,
    avatarCenterY + ringRadius
  );
  grad.addColorStop(0, "#FF0000");
  grad.addColorStop(0.17, "#FF7F00");
  grad.addColorStop(0.33, "#FFFF00");
  grad.addColorStop(0.5, "#00FF00");
  grad.addColorStop(0.67, "#0000FF");
  grad.addColorStop(0.83, "#4B0082");
  grad.addColorStop(1, "#8B00FF");

  ctx.beginPath();
  ctx.arc(avatarCenterX, avatarCenterY, ringRadius, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarCenterX, avatarCenterY, avatarSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  if (avatarLoaded) {
    ctx.drawImage(
      avatarLoaded,
      avatarCenterX - avatarSize / 2,
      avatarCenterY - avatarSize / 2,
      avatarSize,
      avatarSize
    );
  }
  ctx.restore();

  ctx.fillStyle = "#000000";
  ctx.font = "bold 28px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(userInfo.name || `Người dùng`, width / 2, boxY + 120);

  const qrLoaded = await loadImage(qrPath);
  const qrMaxSize = 400;
  const marginBottom = 120;
  const availableHeight = boxHeight - 220 - marginBottom;
  const qrSize = Math.min(qrMaxSize, availableHeight);

  ctx.drawImage(qrLoaded, width / 2 - qrSize / 2, boxY + 160, qrSize, qrSize);

  const g2 = ctx.createLinearGradient(width / 2 - 140, 0, width / 2 + 140, 0);
  g2.addColorStop(0, "#8BC34A");
  g2.addColorStop(0.5, "#E91E63");
  g2.addColorStop(1, "#2196F3");
  ctx.fillStyle = g2;
  ctx.font = "bold 34px sans-serif";
  ctx.fillText("Hãy kết bạn với tôi", width / 2, height - 150);

  ctx.fillStyle = "#555";
  ctx.font = "24px sans-serif";
  ctx.fillText("Mở Zalo bấm nút quét QR để kết bạn", width / 2, height - 110);

  const filePath = path.join(tempDir, `business_card_${uid}_${Date.now()}.png`);
  const buffer = canvas.toBuffer("image/png");
  await fs.promises.writeFile(filePath, buffer);

  try {
    if (avatarPath && fs.existsSync(avatarPath)) await deleteFile(avatarPath);
  } catch { }

  return filePath;
}

export async function userBussinessCardQrCommand(api, message) {
  let targetUserIds = [];
  const mentions = message.data?.mentions || message.mentions;

  if (mentions) {
    if (Array.isArray(mentions) && mentions.length > 0) {
      targetUserIds = mentions.map((m) => m?.uid).filter(Boolean);
    } else if (typeof mentions === "object") {
      const keys = Object.keys(mentions).filter((k) => /^\d+$/.test(k));
      if (keys.length > 0) {
        targetUserIds = keys;
      } else {
        for (const v of Object.values(mentions)) {
          if (v && typeof v === "object" && v.uid) targetUserIds.push(v.uid);
        }
      }
    }
  }

  if (targetUserIds.length === 0) {
    const senderId =
      message?.sender?.id ||
      message?.data?.uidFrom ||
      message?.uidFrom ||
      message?.data?.fromUid ||
      null;
    if (senderId) targetUserIds.push(senderId);
  }

  if (targetUserIds.length === 0) {
    await sendMessageWarningRequest(api, message, {
      caption: "❌ Không xác định được ID người gửi/tag!",
    });
    return;
  }

  for (const userId of targetUserIds) {
    let qrPath = null;
    let cardPath = null;
    try {
    const appContext = api?.appContext || api; 
    const getQRLink = getQRProfileUserFactory(api, appContext);
    const qrData = await getQRLink(userId);
      const qrCodeUrl = qrData?.[userId] || qrData?.url || null;
      if (!qrCodeUrl) throw new Error(`Không lấy được QR cho user ${userId}`);

      qrPath = await downloadImageTemp(qrCodeUrl, "qrzalo", userId);
      const userInfo = await getUserInfoData(api, userId);
      cardPath = await drawBusinessCardQR(userInfo, qrPath, userId);

      await sendMessageCompleteRequest(api, message, { caption: ``, imagePath: cardPath }, 600000);
    } catch (err) {
      console.error("Lỗi gửi Business Card QR:", err);
      await sendMessageWarningRequest(api, message, {
        caption: `⚠️ Không thể gửi QR cho user ${userId}: ${err.message}`,
      });
    } finally {
      try {
        if (qrPath && fs.existsSync(qrPath)) await deleteFile(qrPath);
      } catch { }
      try {
        if (cardPath && fs.existsSync(cardPath)) await deleteFile(cardPath);
      } catch { }
    }
  }
}
