import { createCanvas, loadImage } from "canvas";
import path from "path";
import nodeFetch from "node-fetch";
import { FONT_MAIN } from "../format-util.js";
import { writeFilePromise } from "../util.js";

// Helper for rounded rect
function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export async function createDonateQR(uid) {
  const width = 1000;
  const height = 750;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#fdfbf2"; // Very light warm color
  ctx.fillRect(0, 0, width, height);
  
  // Header background
  ctx.save();
  const grad = ctx.createLinearGradient(0, 0, width, 0);
  grad.addColorStop(0, "#48a4c1");
  grad.addColorStop(1, "#206db2");
  
  // Shadow
  ctx.shadowColor = "rgba(0,0,0,0.15)";
  ctx.shadowBlur = 15;
  ctx.shadowOffsetY = 10;
  
  roundedRect(ctx, 40, 40, width - 80, 160, 20);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  // Header Texts
  ctx.fillStyle = "#ffffff";
  ctx.font = `24px "${FONT_MAIN}"`;
  ctx.fillText("CẢM ƠN BẠN ĐÃ ĐỒNG HÀNH", 220, 95);

  ctx.font = `55px "bold ${FONT_MAIN}"`;
  ctx.fillText("ỦNG HỘ CHỦ BOT", 220, 160);

  // Main Card
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.08)";
  ctx.shadowBlur = 25;
  ctx.shadowOffsetY = 10;
  roundedRect(ctx, 40, 240, width - 80, 400, 20);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  // Draw QR
  const transferContent = `DONATE ${uid}`;
  const bankBin = "970448"; // OCB
  const bankAccount = "SEPNGH66300";
  const qrUrl = `https://img.vietqr.io/image/${bankBin}-${bankAccount}-qr_only.png?addInfo=${encodeURIComponent(transferContent)}&accountName=THUE%20BOT`;
  
  try {
    const qrRes = await nodeFetch(qrUrl);
    const qrBuffer = await qrRes.arrayBuffer();
    const qrImage = await loadImage(Buffer.from(qrBuffer));
    // Draw QR on left side
    ctx.drawImage(qrImage, 80, 270, 340, 340);
  } catch (e) {
    console.error("Error fetching QR image", e);
  }

  // Right side info
  ctx.fillStyle = "#2773b7";
  ctx.font = `32px "bold ${FONT_MAIN}"`;
  ctx.fillText("CHUYỂN KHOẢN TỚI", 480, 310);

  // Helper for pill
  function drawPill(y, title, content) {
    ctx.fillStyle = "#f3f8fd";
    roundedRect(ctx, 480, y, 420, 80, 15);
    ctx.fill();
    ctx.fillStyle = "#698197";
    ctx.font = `20px "${FONT_MAIN}"`;
    ctx.fillText(title, 520, y + 35);
    ctx.fillStyle = "#1e2e3e";
    ctx.font = `30px "bold ${FONT_MAIN}"`;
    ctx.fillText(content, 520, y + 65);
  }

  drawPill(340, "Ngân hàng", "OCB (Ngân hàng Phương Đông)");
  drawPill(435, "Số tài khoản", bankAccount);
  drawPill(530, "Nội dung CK (Bắt buộc ghi đúng)", transferContent);

  // Footer text
  ctx.textAlign = "center";
  ctx.fillStyle = "#6b7a8a";
  ctx.font = `22px "bold ${FONT_MAIN}"`;
  ctx.fillText("Mỗi đóng góp giúp bot gánh chi phí VPS, Host Upload và AI hằng tháng", width / 2, 690);
  ctx.font = `18px "${FONT_MAIN}"`;
  ctx.fillText("Thu Hoa Bot Team", width / 2, 720);

  const outPath = path.join(process.cwd(), `game_donate_qr_${uid}.png`);
  await writeFilePromise(outPath, canvas.toBuffer("image/png"));
  return outPath;
}
