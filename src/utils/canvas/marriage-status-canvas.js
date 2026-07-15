import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import { isValidUrl } from "./index.js";
import { roundRect } from "./shape.js";
import { getFontCanvas } from "../format-util.js";

async function loadAvatarSafe(avatarUrl, fallbackLetter = "?") {
  try {
    if (!avatarUrl || !isValidUrl(avatarUrl)) throw new Error("invalid url");
    return await loadImage(avatarUrl);
  } catch {
    const canvas = createCanvas(300, 300);
    const ctx = canvas.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 300, 300);
    g.addColorStop(0, "#ff9a9e");
    g.addColorStop(1, "#fecfef");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 300, 300);
    ctx.fillStyle = "#3a1030";
    ctx.font = "bold 130px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(fallbackLetter, 150, 150);
    return canvas;
  }
}

function pickQuote(days) {
  if (days < 1) return "Vừa mới nên duyên — hãy trân trọng nhé.";
  if (days < 7) return "Tình yêu mới chớm, ngọt như đường 🍬";
  if (days < 30) return "Vẫn còn yêu — tay nắm tay đi tiếp.";
  if (days < 100) return "Mặn nồng như ngày đầu quen nhau 💕";
  if (days < 365) return "Bền vững như kiềng ba chân 💪";
  return "Trăm năm hạnh phúc, mãi mãi bên nhau 👑";
}

function formatVNDate(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return dateStr;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * @param {{name:string, avatar?:string}} user1Info
 * @param {{name:string, avatar?:string}} user2Info
 * @param {string} marriageDateStr - yyyy-mm-dd
 */
export async function createMarriageStatusImage(user1Info, user2Info, marriageDateStr) {
  const width = 900;
  const height = 525;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const marriageDate = new Date(`${marriageDateStr}T00:00:00`);
  const now = new Date();
  const daysTogether = Math.max(0, Math.floor((now - marriageDate) / 86400000));

  // Nền tím than đậm, phẳng
  ctx.fillStyle = "#1b1024";
  ctx.fillRect(0, 0, width, height);

  // Viền ngoài nhẹ
  ctx.save();
  ctx.strokeStyle = "rgba(232,180,255,0.25)";
  ctx.lineWidth = 2;
  roundRect(ctx, 5, 5, width - 10, height - 10, 22, false, true);
  ctx.restore();

  // Tiêu đề nhỏ, letter-spacing giả lập
  ctx.textAlign = "center";
  ctx.fillStyle = "#e8b4ff";
  const titleText = "GIẤY CHỨNG NHẬN KẾT HÔN";
  ctx.font = "20px " + getFontCanvas(titleText);
  drawSpacedText(ctx, titleText, width / 2, 55, 3);

  // ===== Avatar 2 người + badge nhẫn ở giữa =====
  const avatarSize = 180;
  const avatarY = 90;
  const centerY = avatarY + avatarSize / 2;
  const gap = 26; // khoảng hở giữa avatar và badge
  const badgeSize = 96;

  const avatar1CenterX = width / 2 - badgeSize / 2 - gap - avatarSize / 2;
  const avatar2CenterX = width / 2 + badgeSize / 2 + gap + avatarSize / 2;

  const name1 = (user1Info?.name || "Người A").slice(0, 16);
  const name2 = (user2Info?.name || "Người B").slice(0, 16);
  const avatar1 = await loadAvatarSafe(user1Info?.avatar, name1[0] || "A");
  const avatar2 = await loadAvatarSafe(user2Info?.avatar, name2[0] || "B");

  for (const [avatar, cx] of [[avatar1, avatar1CenterX], [avatar2, avatar2CenterX]]) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, centerY, avatarSize / 2 + 4, 0, Math.PI * 2);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, centerY, avatarSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, cx - avatarSize / 2, avatarY, avatarSize, avatarSize);
    ctx.restore();
  }

  // Badge nhẫn cưới ở giữa, đè lên 2 avatar
  ctx.save();
  ctx.beginPath();
  ctx.arc(width / 2, centerY, badgeSize / 2, 0, Math.PI * 2);
  ctx.fillStyle = "#ff4d8d";
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#1b1024";
  ctx.stroke();
  ctx.restore();

  ctx.font = `${Math.round(badgeSize * 0.42)}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("💍", width / 2, centerY + 2);
  ctx.textBaseline = "alphabetic";

  // Tên 2 người
  const nameY = avatarY + avatarSize + 45;
  ctx.fillStyle = "#ffffff";
  ctx.font = "500 26px " + getFontCanvas(name1 + name2);
  ctx.textAlign = "center";
  ctx.fillText(name1, avatar1CenterX, nameY);
  ctx.fillText(name2, avatar2CenterX, nameY);

  // ===== Box thông tin =====
  const boxY = nameY + 30;
  const boxH = height - boxY - 30;
  const boxX = 70;
  const boxW = width - boxX * 2;
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  roundRect(ctx, boxX, boxY, boxW, boxH, 16, true, false);
  ctx.restore();

  const rowPadX = 26;
  let rowY = boxY + 38;

  ctx.textAlign = "left";
  ctx.fillStyle = "#d9c8ea";
  ctx.font = "22px " + getFontCanvas("Ngay cuoi");
  ctx.fillText("Ngày cưới", boxX + rowPadX, rowY);
  ctx.textAlign = "right";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(formatVNDate(marriageDateStr), boxX + boxW - rowPadX, rowY);

  rowY += 34;
  ctx.textAlign = "left";
  ctx.fillStyle = "#d9c8ea";
  ctx.fillText("Đã chung sống", boxX + rowPadX, rowY);
  ctx.textAlign = "right";
  ctx.fillStyle = "#ffd76e";
  ctx.font = "500 22px " + getFontCanvas(`${daysTogether} ngay`);
  ctx.fillText(`${daysTogether} ngày`, boxX + boxW - rowPadX, rowY);

  const quote = pickQuote(daysTogether);
  ctx.textAlign = "center";
  ctx.fillStyle = "#e8b4ff";
  ctx.font = "italic 20px " + getFontCanvas(quote);
  rowY += 46;
  ctx.fillText(`"${quote}"`, width / 2, rowY);

  const outputDir = "./assets/temp";
  await fs.promises.mkdir(outputDir, { recursive: true });
  const filePath = path.resolve(`${outputDir}/marriagecard_${Date.now()}.png`);
  await fs.promises.writeFile(filePath, canvas.toBuffer());
  return filePath;
}

// Vẽ text có giãn khoảng cách chữ (letter-spacing) vì canvas không hỗ trợ sẵn
function drawSpacedText(ctx, text, centerX, y, spacing) {
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const totalWidth = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1);
  let x = centerX - totalWidth / 2;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  for (let i = 0; i < text.length; i++) {
    ctx.fillText(text[i], x, y);
    x += widths[i] + spacing;
  }
  ctx.textAlign = prevAlign;
}