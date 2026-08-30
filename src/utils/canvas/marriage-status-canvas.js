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

const C = { paper: "#fffaf0", ink: "#432c35", wine: "#8b2942", rose: "#c85b76", gold: "#c89b45", muted: "#806b70" };

async function loadAvatarSafe(url, letter = "?") {
  try {
    if (!url || !isValidUrl(url)) throw new Error("invalid url");
    return await loadImage(url);
  } catch {
    const canvas = createCanvas(320, 320), ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 320, 320);
    gradient.addColorStop(0, "#f7c9d4");
    gradient.addColorStop(1, "#ead7bd");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 320, 320);
    ctx.fillStyle = C.wine;
    ctx.font = "bold 138px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(letter.toUpperCase(), 160, 168);
    return canvas;
  }
}

function pickQuote(days) {
  if (days < 1) return "Hôm nay mình chính thức thuộc về nhau";
  if (days < 7) return "Khởi đầu ngọt ngào của hành trình trăm năm";
  if (days < 30) return "Mỗi ngày bên nhau là một ngày đáng nhớ";
  if (days < 365) return "Cùng vun đắp một mái nhà đầy yêu thương";
  return "Trăm năm đồng hành, vẹn nguyên lời hẹn ước";
}

function formatVNDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function fitText(ctx, text, maxWidth, size, style = "600") {
  do {
    ctx.font = `${style} ${size}px ${getFontCanvas(text)}`;
    size--;
  } while (size > 19 && ctx.measureText(text).width > maxWidth);
}

function drawOrnament(ctx, x, y, mirror = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(mirror, 1);
  ctx.strokeStyle = C.gold;
  ctx.fillStyle = "rgba(200,155,69,.16)";
  ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(32 + i * 28, 14 + i * 15, 19, 8, -0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(42, 8, 64, 42, 112, 56);
  ctx.stroke();
  ctx.restore();
}

function drawAvatar(ctx, image, cx, cy, size) {
  ctx.save();
  ctx.shadowColor = "rgba(65,35,44,.22)";
  ctx.shadowBlur = 22;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2 + 10, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(image, cx - size / 2, cy - size / 2, size, size);
  ctx.restore();
}

/** Dùng cho cả lần vừa xác nhận kết hôn và khi xem lại chứng nhận. */
export async function createMarriageStatusImage(user1Info, user2Info, marriageDateStr) {
  const width = 1200, height = 760;
  const canvas = createCanvas(width, height), ctx = canvas.getContext("2d");
  const marriageDate = new Date(`${marriageDateStr}T00:00:00`);
  const days = Math.max(0, Math.floor((Date.now() - marriageDate.getTime()) / 86400000));
  const name1 = String(user1Info?.name || "Người A").slice(0, 26);
  const name2 = String(user2Info?.name || "Người B").slice(0, 26);
  const [avatar1, avatar2] = await Promise.all([
    loadAvatarSafe(user1Info?.avatar, name1[0] || "A"),
    loadAvatarSafe(user2Info?.avatar, name2[0] || "B"),
  ]);

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#fffdf7");
  bg.addColorStop(.55, C.paper);
  bg.addColorStop(1, "#f8eadf");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 5;
  roundRect(ctx, 22, 22, width - 44, height - 44, 24, false, true);
  ctx.strokeStyle = "rgba(139,41,66,.35)";
  ctx.lineWidth = 2;
  roundRect(ctx, 35, 35, width - 70, height - 70, 18, false, true);
  drawOrnament(ctx, 55, 55);
  drawOrnament(ctx, width - 55, 55, -1);

  ctx.textAlign = "center";
  ctx.fillStyle = C.gold;
  ctx.font = `600 18px ${getFontCanvas("SOC BOT")}`;
  ctx.fillText("SOC BOT  •  CHỨNG NHẬN HẠNH PHÚC", width / 2, 72);
  ctx.fillStyle = C.wine;
  ctx.font = `700 45px ${getFontCanvas("GIẤY CHỨNG NHẬN KẾT HÔN")}`;
  ctx.fillText("GIẤY CHỨNG NHẬN KẾT HÔN", width / 2, 126);
  ctx.fillStyle = C.muted;
  ctx.font = `italic 20px ${getFontCanvas("Hai trái tim một hành trình")}`;
  ctx.fillText("Hai trái tim • Một lời hẹn • Một hành trình", width / 2, 162);

  drawAvatar(ctx, avatar1, 330, 300, 205);
  drawAvatar(ctx, avatar2, 870, 300, 205);
  ctx.fillStyle = "rgba(200,155,69,.13)";
  ctx.beginPath();
  ctx.arc(600, 300, 72, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = C.wine;
  ctx.font = "64px Arial";
  ctx.textBaseline = "middle";
  ctx.fillText("♥", 600, 304);
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = C.ink;
  fitText(ctx, name1, 380, 34);
  ctx.fillText(name1, 330, 438);
  fitText(ctx, name2, 380, 34);
  ctx.fillText(name2, 870, 438);
  ctx.fillStyle = C.rose;
  ctx.font = `italic 25px ${getFontCanvas("nên duyên cùng")}`;
  ctx.fillText("nên duyên cùng", 600, 438);

  ctx.fillStyle = "rgba(255,255,255,.62)";
  roundRect(ctx, 125, 480, 950, 155, 20, true, false);
  ctx.strokeStyle = "rgba(200,155,69,.45)";
  ctx.lineWidth = 2;
  roundRect(ctx, 125, 480, 950, 155, 20, false, true);
  ctx.fillStyle = C.muted;
  ctx.font = `500 19px ${getFontCanvas("NGÀY NÊN DUYÊN")}`;
  ctx.fillText("NGÀY NÊN DUYÊN", 350, 520);
  ctx.fillText("THỜI GIAN ĐỒNG HÀNH", 850, 520);
  ctx.fillStyle = C.wine;
  ctx.font = `700 30px ${getFontCanvas(formatVNDate(marriageDateStr))}`;
  ctx.fillText(formatVNDate(marriageDateStr), 350, 560);
  ctx.fillText(`${days} ngày`, 850, 560);
  ctx.strokeStyle = "rgba(200,155,69,.35)";
  ctx.beginPath();
  ctx.moveTo(600, 505);
  ctx.lineTo(600, 575);
  ctx.stroke();
  const quote = `“${pickQuote(days)}”`;
  ctx.fillStyle = C.ink;
  fitText(ctx, quote, 850, 22, "italic 500");
  ctx.fillText(quote, 600, 612);

  ctx.fillStyle = C.gold;
  ctx.font = `600 17px ${getFontCanvas("Trăm năm hạnh phúc")}`;
  ctx.fillText("TRĂM NĂM HẠNH PHÚC  •  BẠC ĐẦU NGHĨA PHU THÊ", 600, 687);
  ctx.fillStyle = C.muted;
  ctx.font = `14px ${getFontCanvas("Chứng nhận vui")}`;
  ctx.fillText("Chứng nhận vui do SOC BOT tạo", 600, 716);

  const outputDir = "./assets/temp";
  await fs.promises.mkdir(outputDir, { recursive: true });
  const filePath = path.resolve(`${outputDir}/marriagecard_${Date.now()}.png`);
  await fs.promises.writeFile(filePath, canvas.toBuffer("image/png"));
  return filePath;
}

/** Card trạng thái dùng cho các lần xem lại sau ngày xác nhận kết hôn. */
export async function createMarriageCardImage(user1Info, user2Info, marriageDateStr) {
  const width = 1000, height = 586;
  const canvas = createCanvas(width, height), ctx = canvas.getContext("2d");
  const date = new Date(`${marriageDateStr}T00:00:00`);
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
  const name1 = String(user1Info?.name || "Người A").slice(0, 22);
  const name2 = String(user2Info?.name || "Người B").slice(0, 22);
  const [avatar1, avatar2] = await Promise.all([
    loadAvatarSafe(user1Info?.avatar, name1[0] || "A"),
    loadAvatarSafe(user2Info?.avatar, name2[0] || "B"),
  ]);

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#111b3a");
  bg.addColorStop(.5, "#39275f");
  bg.addColorStop(1, "#7a294f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(500, 210, 20, 500, 210, 430);
  glow.addColorStop(0, "rgba(255,112,145,.28)");
  glow.addColorStop(1, "rgba(255,112,145,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(255,255,255,.08)";
  roundRect(ctx, 25, 24, 950, 538, 26, true, false);
  ctx.strokeStyle = "rgba(255,255,255,.14)";
  ctx.lineWidth = 2;
  roundRect(ctx, 25, 24, 950, 538, 26, false, true);
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.font = `700 35px ${getFontCanvas("NHỊP ĐẬP HÔN NHÂN")}`;
  ctx.fillText("NHỊP ĐẬP HÔN NHÂN", 500, 76);
  ctx.fillStyle = "#ff7898";
  ctx.font = `600 15px ${getFontCanvas("SOC BOT")}`;
  ctx.fillText("SOC BOT • LOVE STATUS", 500, 101);

  drawAvatar(ctx, avatar1, 285, 218, 166);
  drawAvatar(ctx, avatar2, 715, 218, 166);

  // Tim vector ở giữa, không phụ thuộc emoji/font hệ thống.
  ctx.save();
  ctx.translate(500, 210);
  ctx.shadowColor = "rgba(0,0,0,.3)";
  ctx.shadowBlur = 18;
  const heart = ctx.createLinearGradient(-70, -60, 70, 80);
  heart.addColorStop(0, "#ffb5a7");
  heart.addColorStop(1, "#ff4f87");
  ctx.fillStyle = heart;
  ctx.beginPath();
  ctx.moveTo(0, 72);
  ctx.bezierCurveTo(-18, 50, -82, 12, -82, -36);
  ctx.bezierCurveTo(-82, -82, -22, -91, 0, -51);
  ctx.bezierCurveTo(22, -91, 82, -82, 82, -36);
  ctx.bezierCurveTo(82, 12, 18, 50, 0, 72);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#4b1734";
  ctx.font = `800 45px ${getFontCanvas(String(days))}`;
  ctx.fillText(String(days), 0, 3);
  ctx.font = `700 16px ${getFontCanvas("NGÀY")}`;
  ctx.fillText("NGÀY", 0, 30);
  ctx.restore();

  ctx.fillStyle = "#fff";
  fitText(ctx, name1, 260, 28);
  ctx.fillText(name1, 285, 333);
  fitText(ctx, name2, 260, 28);
  ctx.fillText(name2, 715, 333);

  ctx.fillStyle = "rgba(8,15,38,.34)";
  roundRect(ctx, 65, 370, 870, 150, 22, true, false);
  ctx.fillStyle = "#d8d9ee";
  ctx.font = `600 22px ${getFontCanvas("Ngày nên duyên")}`;
  ctx.fillText(`Ngày nên duyên  •  ${formatVNDate(marriageDateStr)}`, 500, 414);
  ctx.fillStyle = "#ffd46b";
  ctx.font = `700 30px ${getFontCanvas(`${days} ngày đồng hành`)}`;
  ctx.fillText(`Đã đồng hành ${days} ngày`, 500, 458);
  const quote = pickQuote(days);
  ctx.fillStyle = "#f2eefa";
  fitText(ctx, `“${quote}”`, 760, 20, "italic 500");
  ctx.fillText(`“${quote}”`, 500, 494);
  ctx.fillStyle = "rgba(255,255,255,.45)";
  ctx.font = `13px ${getFontCanvas("Kết quả vui")}`;
  ctx.fillText("Card trạng thái vui • không phải giấy tờ pháp lý", 500, 548);

  const outputDir = "./assets/temp";
  await fs.promises.mkdir(outputDir, { recursive: true });
  const filePath = path.resolve(`${outputDir}/marriagestatus_${Date.now()}.png`);
  await fs.promises.writeFile(filePath, canvas.toBuffer("image/png"));
  return filePath;
}
