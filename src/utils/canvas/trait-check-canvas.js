import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import { roundRect } from "./shape.js";
import { getFontCanvas } from "../format-util.js";

function isValidUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/), lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

async function loadAvatarSafe(url, letter) {
  try {
    if (!url || !isValidUrl(url)) throw new Error("invalid avatar");
    return await Promise.race([
      loadImage(url),
      new Promise((_, reject) => setTimeout(() => reject(new Error("avatar timeout")), 4000)),
    ]);
  } catch {
    const canvas = createCanvas(220, 220), ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 220, 220);
    gradient.addColorStop(0, "#55d6be");
    gradient.addColorStop(1, "#7067cf");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 220, 220);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 96px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(letter || "?", 110, 116);
    return canvas;
  }
}

function fitFont(ctx, text, maxWidth, size, weight = "700") {
  do {
    ctx.font = `${weight} ${size}px ${getFontCanvas(text)}`;
    size--;
  } while (size > 20 && ctx.measureText(text).width > maxWidth);
}

function genderLabel(value) {
  const text = String(value || "Không rõ").toLowerCase();
  if (text === "male" || text.includes("nam")) return "Nam";
  if (text === "female" || text.includes("nữ") || text.includes("nu")) return "Nữ";
  return String(value || "Không rõ");
}

export async function createTraitCheckImage(userInfo, traitLabel, percent, comment) {
  const width = 900, height = 570;
  const canvas = createCanvas(width, height), ctx = canvas.getContext("2d");
  const name = String(userInfo?.name || "Người dùng").slice(0, 25);
  const avatar = await loadAvatarSafe(userInfo?.avatar, name[0]?.toUpperCase());
  const accent = percent >= 70 ? "#ff647c" : percent >= 35 ? "#ffb45b" : "#55d6be";

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#17213f");
  bg.addColorStop(.5, "#35265f");
  bg.addColorStop(1, "#1b5364");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(760, 70, 10, 760, 70, 360);
  glow.addColorStop(0, "rgba(255,100,124,.28)");
  glow.addColorStop(1, "rgba(255,100,124,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  // Khối hồ sơ và điểm số: lấy cảm hứng từ mẫu nhưng đổi palette và hình khối.
  ctx.fillStyle = "rgba(255,255,255,.09)";
  roundRect(ctx, 28, 28, 844, 200, 24, true, false);
  ctx.strokeStyle = "rgba(255,255,255,.13)";
  ctx.lineWidth = 2;
  roundRect(ctx, 28, 28, 844, 200, 24, false, true);

  ctx.save();
  ctx.beginPath();
  ctx.arc(118, 128, 68, 0, Math.PI * 2);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(118, 128, 61, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(avatar, 57, 67, 122, 122);
  ctx.restore();

  ctx.textAlign = "left";
  ctx.fillStyle = "#fff";
  fitFont(ctx, name, 330, 34);
  ctx.fillText(name, 210, 95);
  const gender = genderLabel(userInfo?.gender);
  const birthday = userInfo?.birthday && userInfo.birthday !== "Ẩn" ? userInfo.birthday : "Ẩn ngày sinh";
  ctx.fillStyle = "#d8d7ea";
  ctx.font = `600 21px ${getFontCanvas(gender + birthday)}`;
  ctx.fillText(`◉ ${gender}    ✦ ${birthday}`, 210, 135);
  const now = new Date(), pad = n => String(n).padStart(2, "0");
  const created = `Tạo lúc ${pad(now.getHours())}:${pad(now.getMinutes())} • ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
  ctx.fillStyle = "#aaa9c4";
  ctx.font = `18px ${getFontCanvas(created)}`;
  ctx.fillText(`▣ ${created}`, 210, 174);

  const scoreGradient = ctx.createLinearGradient(610, 54, 842, 200);
  scoreGradient.addColorStop(0, "#ffffff");
  scoreGradient.addColorStop(1, "#eefdf9");
  ctx.fillStyle = scoreGradient;
  ctx.shadowColor = "rgba(0,0,0,.22)";
  ctx.shadowBlur = 16;
  roundRect(ctx, 615, 52, 225, 150, 22, true, false);
  ctx.shadowBlur = 0;
  ctx.textAlign = "center";
  ctx.fillStyle = "#35265f";
  ctx.font = `800 74px ${getFontCanvas(`${percent}%`)}`;
  ctx.fillText(`${percent}%`, 727, 151);
  ctx.fillStyle = "#77718d";
  ctx.font = `600 15px ${getFontCanvas("CHỈ SỐ VUI")}`;
  ctx.fillText("CHỈ SỐ VUI • AI", 727, 180);

  const banner = ctx.createLinearGradient(28, 0, 872, 0);
  banner.addColorStop(0, "#55d6be");
  banner.addColorStop(.5, "#7067cf");
  banner.addColorStop(1, "#ff647c");
  ctx.fillStyle = banner;
  roundRect(ctx, 28, 240, 844, 58, 15, true, false);
  ctx.fillStyle = "#fff";
  ctx.font = `700 25px ${getFontCanvas(traitLabel)}`;
  fitFont(ctx, `✦ PHÂN TÍCH ĐỘ ${String(traitLabel).toUpperCase()} ✦`, 790, 25);
  ctx.fillText(`✦ PHÂN TÍCH ĐỘ ${String(traitLabel).toUpperCase()} ✦`, 450, 278);

  ctx.fillStyle = "rgba(255,255,255,.1)";
  roundRect(ctx, 28, 312, 844, 220, 22, true, false);
  ctx.strokeStyle = "rgba(255,255,255,.12)";
  roundRect(ctx, 28, 312, 844, 220, 22, false, true);
  ctx.fillStyle = accent;
  ctx.font = `700 23px ${getFontCanvas("AI ĐÁNH GIÁ")}`;
  ctx.fillText("✦  AI ĐÁNH GIÁ", 450, 356);
  ctx.fillStyle = "#f6f5fb";
  ctx.font = `600 22px ${getFontCanvas(comment)}`;
  const lines = wrapText(ctx, comment, 770).slice(0, 4);
  let y = 400;
  for (const line of lines) {
    ctx.fillText(line, 450, y);
    y += 31;
  }
  ctx.fillStyle = "rgba(255,255,255,.5)";
  ctx.font = `14px ${getFontCanvas("Kết quả giải trí")}`;
  ctx.fillText("Kết quả ngẫu nhiên chỉ mang tính giải trí, không đánh giá con người thật.", 450, 516);

  const outputDir = "./assets/temp";
  await fs.promises.mkdir(outputDir, { recursive: true });
  const filePath = path.resolve(`${outputDir}/traitcard_${Date.now()}.png`);
  await fs.promises.writeFile(filePath, canvas.toBuffer("image/png"));
  return filePath;
}
