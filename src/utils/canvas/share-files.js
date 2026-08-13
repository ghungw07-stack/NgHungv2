import { Canvas } from "skia-canvas";
import fs from "fs";
import path from "path";
import { tempDir } from "../io-json.js";

const WIDTH = 1080;

function roundRect(ctx, x, y, width, height, radius, fill, stroke = null) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function trimText(ctx, text, maxWidth) {
  const value = String(text || "");
  if (ctx.measureText(value).width <= maxWidth) return value;
  let result = value;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) result = result.slice(0, -1);
  return `${result}…`;
}

function formatBytes(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 ** 3) return `${(size / 1024 ** 2).toFixed(1)} MB`;
  return `${(size / 1024 ** 3).toFixed(1)} GB`;
}

function extensionIcon(fileName) {
  const extension = path.extname(fileName).slice(1).toUpperCase();
  return extension.slice(0, 4) || "FILE";
}

export async function createShareFileListImage(files = [], prefix = ">") {
  const columns = 2;
  const rows = Math.max(1, Math.ceil(files.length / columns));
  const itemHeight = 88;
  const height = Math.max(720, 280 + rows * itemHeight + 115);
  const canvas = new Canvas(WIDTH, height);
  const ctx = canvas.getContext("2d");

  const background = ctx.createLinearGradient(0, 0, WIDTH, height);
  background.addColorStop(0, "#07111F");
  background.addColorStop(0.55, "#101A31");
  background.addColorStop(1, "#160F2A");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, height);

  const glow = ctx.createRadialGradient(900, 40, 10, 900, 40, 520);
  glow.addColorStop(0, "rgba(121,92,255,.34)");
  glow.addColorStop(1, "rgba(121,92,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, 600);

  ctx.textAlign = "left";
  ctx.fillStyle = "#9D8CFF";
  ctx.font = "800 21px Arial";
  ctx.fillText("KHO CHIA SẺ CỦA BOT", 58, 66);
  ctx.fillStyle = "#F8FAFC";
  ctx.font = "900 54px Arial";
  ctx.fillText("DANH SÁCH FILE", 58, 130);
  ctx.fillStyle = "#AEB8CF";
  ctx.font = "600 22px Arial";
  ctx.fillText(`${files.length} file đang được lưu · Chọn bằng số thứ tự`, 58, 171);

  roundRect(ctx, 58, 204, WIDTH - 116, 54, 18, "rgba(157,140,255,.10)", "rgba(157,140,255,.30)");
  ctx.fillStyle = "#D9D4FF";
  ctx.font = "700 18px Arial";
  ctx.fillText(`${prefix}share <số> để nhận file`, 82, 238);
  ctx.textAlign = "right";
  ctx.fillStyle = "#69E0B1";
  ctx.fillText(`Reply file + ${prefix}share add để thêm mới`, WIDTH - 82, 238);

  const cardWidth = 474;
  const gap = 16;
  const startX = 58;
  const startY = 282;
  if (!files.length) {
    roundRect(ctx, 58, startY, WIDTH - 116, 180, 24, "rgba(255,255,255,.04)", "rgba(255,255,255,.12)");
    ctx.textAlign = "center";
    ctx.fillStyle = "#AEB8CF";
    ctx.font = "700 25px Arial";
    ctx.fillText("Kho share chưa có file nào", WIDTH / 2, startY + 82);
    ctx.font = "600 19px Arial";
    ctx.fillText(`Reply một tin nhắn chứa file rồi gõ ${prefix}share add`, WIDTH / 2, startY + 122);
  } else {
    files.forEach((file, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = startX + col * (cardWidth + gap);
      const y = startY + row * itemHeight;
      roundRect(ctx, x, y, cardWidth, 72, 18, "rgba(10,18,35,.82)", "rgba(112,165,255,.24)");

      ctx.beginPath();
      ctx.arc(x + 39, y + 36, 24, 0, Math.PI * 2);
      ctx.fillStyle = index % 2 ? "rgba(112,165,255,.18)" : "rgba(157,140,255,.20)";
      ctx.fill();
      ctx.strokeStyle = index % 2 ? "#70A5FF" : "#9D8CFF";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "900 16px Arial";
      ctx.fillText(String(index + 1), x + 39, y + 42);

      ctx.textAlign = "left";
      ctx.fillStyle = "#F8FAFC";
      ctx.font = "800 21px Arial";
      ctx.fillText(trimText(ctx, file.name, 330), x + 78, y + 30);
      ctx.fillStyle = "#96A2BC";
      ctx.font = "700 15px Arial";
      ctx.fillText(`${extensionIcon(file.name)} · ${formatBytes(file.size)}`, x + 78, y + 55);
    });
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(174,184,207,.75)";
  ctx.font = "600 17px Arial";
  ctx.fillText("File được sắp xếp theo tên để số thứ tự luôn ổn định", WIDTH / 2, height - 48);

  await fs.promises.mkdir(tempDir, { recursive: true });
  const outputPath = path.join(tempDir, `share_files_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.png`);
  await fs.promises.writeFile(outputPath, await canvas.toBuffer("png"));
  return outputPath;
}
