import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import { isValidUrl } from "./index.js";
import { roundRect } from "./shape.js";
import { getFontCanvas } from "../format-util.js";

function wrapText(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function loadAvatarSafe(avatarUrl) {
  try {
    if (!avatarUrl || !isValidUrl(avatarUrl)) throw new Error("invalid url");
    return await loadImage(avatarUrl);
  } catch {
    const canvas = createCanvas(200, 200);
    const ctx = canvas.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 200, 200);
    g.addColorStop(0, "#ffd76e");
    g.addColorStop(1, "#ff8a3d");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 200, 200);
    ctx.fillStyle = "#3a2400";
    ctx.font = "bold 90px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", 100, 100);
    return canvas;
  }
}

// Màu chủ đạo theo mốc % (dùng cho số % và thanh tiến trình)
function percentColor(percent) {
  if (percent >= 70) return { main: "#ff4d6d", from: "#ff4d6d", to: "#ffd76e" };
  if (percent >= 35) return { main: "#ff8a3d", from: "#ff8a3d", to: "#ffd76e" };
  return { main: "#ff8a3d", from: "#ff8a3d", to: "#ffd76e" };
}

/**
 * @param {{name:string, avatar?:string, gender?:string, birthday?:string}} userInfo
 * @param {string} traitLabel - vd: "Độ Dâm", "IQ", "Gay"...
 * @param {number} percent - 0-100
 * @param {string} comment - nhận xét
 */
export async function createTraitCheckImage(userInfo, traitLabel, percent, comment) {
  const width = 900;
  const height = 480;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Nền tối phẳng
  ctx.fillStyle = "#12131a";
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 2;
  roundRect(ctx, 5, 5, width - 10, height - 10, 22, false, true);
  ctx.restore();

  const padX = 50;
  const colors = percentColor(percent);

  // ===== Header: avatar + tên/gender/birthday + % =====
  const avatarSize = 100;
  const avatarX = padX;
  const avatarY = 40;
  const avatar = await loadAvatarSafe(userInfo?.avatar);

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 3, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
  ctx.restore();

  const textX = avatarX + avatarSize + 26;
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  const displayName = (userInfo?.name || "Người dùng").slice(0, 24);
  ctx.font = "500 30px " + getFontCanvas(displayName);
  ctx.fillText(displayName, textX, avatarY + 42);

  const genderText = userInfo?.gender || "Không xác định";
  let birthdayText = userInfo?.birthday && userInfo.birthday !== "Ẩn" ? userInfo.birthday : "Ẩn";
  const shortBirthday = /^\d{2}\/\d{2}\/\d{4}$/.test(birthdayText) ? birthdayText.slice(0, 5) : birthdayText;
  const subText = `${genderText} · ${shortBirthday}`;
  ctx.font = "22px " + getFontCanvas(subText);
  ctx.fillStyle = "#9a98a8";
  ctx.fillText(subText, textX, avatarY + 76);

  ctx.textAlign = "right";
  ctx.fillStyle = colors.main;
  const percentText = `${percent}%`;
  ctx.font = "500 46px " + getFontCanvas(percentText);
  ctx.fillText(percentText, width - padX, avatarY + 58);

  // ===== Thanh tiến trình =====
  const barLabelY = avatarY + avatarSize + 55;
  const barY = barLabelY + 14;
  const barH = 14;
  const barW = width - padX * 2;

  ctx.textAlign = "left";
  ctx.fillStyle = "#9a98a8";
  const labelText = `PHÂN TÍCH ${traitLabel.toUpperCase()}`;
  ctx.font = "20px " + getFontCanvas(labelText);
  ctx.fillText(labelText, padX, barLabelY);

  ctx.textAlign = "right";
  const fractionText = `${percent} / 100`;
  ctx.font = "20px " + getFontCanvas(fractionText);
  ctx.fillText(fractionText, width - padX, barLabelY);

  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  roundRect(ctx, padX, barY, barW, barH, barH / 2, true, false);
  ctx.restore();

  const filledW = Math.max(barH, (barW * Math.min(100, Math.max(0, percent))) / 100);
  ctx.save();
  const barGrad = ctx.createLinearGradient(padX, 0, padX + filledW, 0);
  barGrad.addColorStop(0, colors.from);
  barGrad.addColorStop(1, colors.to);
  ctx.fillStyle = barGrad;
  roundRect(ctx, padX, barY, filledW, barH, barH / 2, true, false);
  ctx.restore();

  // ===== Box nhận xét =====
  const boxY = barY + barH + 34;
  const boxH = height - boxY - 60;
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  roundRect(ctx, padX, boxY, barW, boxH, 16, true, false);
  ctx.restore();

  ctx.textAlign = "left";
  ctx.fillStyle = "#ffd76e";
  ctx.font = "500 22px " + getFontCanvas("NHAN XET");
  ctx.fillText("Nhận xét", padX + 24, boxY + 38);

  ctx.fillStyle = "#e3e2ea";
  ctx.font = "22px " + getFontCanvas(comment);
  const lines = wrapText(ctx, comment, barW - 48);
  let lineY = boxY + 72;
  for (const line of lines.slice(0, 4)) {
    ctx.fillText(line, padX + 24, lineY);
    lineY += 30;
  }

  // ===== Timestamp =====
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const createdText = `Tạo lúc ${pad(now.getHours())}:${pad(now.getMinutes())} · ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
  ctx.textAlign = "right";
  ctx.fillStyle = "#5f5d70";
  ctx.font = "18px " + getFontCanvas(createdText);
  ctx.fillText(createdText, width - padX, height - 26);

  const outputDir = "./assets/temp";
  await fs.promises.mkdir(outputDir, { recursive: true });
  const filePath = path.resolve(`${outputDir}/traitcard_${Date.now()}.png`);
  await fs.promises.writeFile(filePath, canvas.toBuffer());
  return filePath;
}