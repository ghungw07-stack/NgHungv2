import axios from "axios";
import path from "path";
import { createCanvas, loadImage } from "canvas";
import { isAdmin } from "../../index.js";
import { getUserInfoData } from "../../service-ngh/info-service/user-info.js";
import { sendMessageWarning } from "../../service-ngh/chat-zalo/chat-style/chat-style.js";
import { randomIDTemp } from "../../utils/format-util.js";
import { tempDir } from "../../utils/io-json.js";
import { deleteFile } from "../../utils/util.js";

const BACKGROUND_PATH = path.resolve("assets/images/bantho/background.jpg");

function drawImageCover(ctx, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = Math.max(0, (image.width - sourceWidth) / 2);
  const sourceY = Math.max(0, (image.height - sourceHeight) / 2);
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

async function createBanThoImage(avatarUrl) {
  const avatarResponse = await axios.get(avatarUrl, {
    responseType: "arraybuffer",
    timeout: 20000,
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const [background, avatar] = await Promise.all([
    loadImage(BACKGROUND_PATH),
    loadImage(Buffer.from(avatarResponse.data)),
  ]);
  const canvas = createCanvas(background.width, background.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(background, 0, 0);

  // Mép trong của khung ảnh trong template là một tứ giác hơi nghiêng.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(174, 76);
  ctx.lineTo(309, 75);
  ctx.lineTo(298, 248);
  ctx.lineTo(181, 249);
  ctx.closePath();
  ctx.clip();
  drawImageCover(ctx, avatar, 174, 75, 135, 174);
  ctx.restore();

  const outputPath = path.join(tempDir, `bantho_${randomIDTemp()}.jpg`);
  const output = canvas.toBuffer("image/jpeg", { quality: 0.94 });
  await import("node:fs/promises").then(({ writeFile }) => writeFile(outputPath, output));
  return outputPath;
}

export async function handleBanThoCommand(api, message) {
  const targetId = String(message.data?.mentions?.[0]?.uid || message.data?.uidFrom || "");
  if (!targetId) return;

  // Lệnh mở cho all nhưng không ai được dùng để troll admin cấp cao của bot.
  if (await isAdmin(api.getBotId(), targetId)) {
    await sendMessageWarning(api, message, "Không thể dùng lệnh này với admin cấp cao của bot!", false, 30000);
    return;
  }

  let outputPath;
  try {
    const userInfo = await getUserInfoData(api, targetId);
    const avatarUrl = userInfo?.avatarFull || userInfo?.avatar;
    if (!avatarUrl) {
      await sendMessageWarning(api, message, "Không lấy được avatar của người này!", false, 30000);
      return;
    }
    outputPath = await createBanThoImage(avatarUrl);
    const targetName = userInfo?.name || userInfo?.displayName || "Người dùng";
    const mentionName = targetName.startsWith("@") ? targetName : `@${targetName}`;
    const replyText = `${mentionName} ra đi thanh thản nhé`;
    await api.sendMessage(
      {
        msg: replyText,
        attachments: [outputPath],
        mentions: [{ uid: targetId, pos: 0, len: mentionName.length }],
        ttl: 600000,
        isUseProphylactic: true,
      },
      message.threadId,
      message.type
    );
  } catch (error) {
    console.error("[bantho] Lỗi tạo ảnh:", error?.message || error);
    await sendMessageWarning(api, message, "Không tạo được ảnh bàn thờ, vui lòng thử lại!", false, 30000);
  } finally {
    if (outputPath) deleteFile(outputPath);
  }
}
