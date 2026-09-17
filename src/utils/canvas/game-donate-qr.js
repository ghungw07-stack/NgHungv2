import { createCanvas, loadImage } from "canvas";
import path from "path";
import nodeFetch from "node-fetch";
import { FONT_MAIN } from "../format-util.js";
import { writeFilePromise } from "../util.js";
import { getActiveCanvasStyle } from "./theme.js";
import { renderQrStyle } from "./qr-style-renderers.js";

// Helper for rounded rect
function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawGlassCard(ctx, x, y, w, h, radius = 16, borderColor = "rgba(255, 255, 255, 0.12)", bgColor = "rgba(255, 255, 255, 0.04)") {
  ctx.save();
  roundedRect(ctx, x, y, w, h, radius);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

export async function createDonateQR(uid, options = {}) {
  const activeStyle = getActiveCanvasStyle();
  const transferContent = String(options.transferContent || `DONATE ${uid}`);
  const amount = Math.max(0, Math.floor(Number(options.amount) || 0));
  const title = String(options.title || "ỦNG HỘ CHỦ BOT");
  const subtitle = String(options.subtitle || "Cảm ơn bạn đã đồng hành");
  const footer = String(options.footer || "Mỗi đóng góp giúp bot duy trì VPS, upload và AI hằng tháng");
  const bankBin = "970448";
  const bankAccount = "SEPNGH66300";
  const amountQuery = amount ? `&amount=${amount}` : "";
  const qrUrl = `https://img.vietqr.io/image/${bankBin}-${bankAccount}-qr_only.png?addInfo=${encodeURIComponent(transferContent)}&accountName=THUE%20BOT${amountQuery}`;

  if (activeStyle !== 1) {
    try {
      const qrRes = await nodeFetch(qrUrl);
      const qrBuffer = await qrRes.arrayBuffer();
      const qrImage = await loadImage(Buffer.from(qrBuffer));
      const styledCanvas = renderQrStyle(activeStyle, {
        qrImage,
        kicker: "MYBOT • DONATION GATEWAY",
        title,
        subtitle,
        label: "NỘI DUNG CHUYỂN KHOẢN",
        value: transferContent,
        secondaryLabel: "OCB • SỐ TÀI KHOẢN",
        secondaryValue: bankAccount,
        footer,
      });
      const outPath = path.join(process.cwd(), `game_donate_qr_${uid}.png`);
      await writeFilePromise(outPath, styledCanvas.toBuffer("image/png"));
      return outPath;
    } catch (error) {
      console.error("Error fetching styled QR image", error);
    }
  }

  // Clean, Minimalist Modern Theme
  const width = 920;
  const height = 520;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // 1. Sleek Dark Slate Background
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, "#0f172a");
  bgGrad.addColorStop(1, "#090d16");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Subtle ambient glow
  const glow = ctx.createRadialGradient(width * 0.8, 80, 10, width * 0.8, 80, 300);
  glow.addColorStop(0, "rgba(56, 189, 248, 0.08)");
  glow.addColorStop(1, "rgba(56, 189, 248, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  // Card Outer Border
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1.5;
  roundedRect(ctx, 1, 1, width - 2, height - 2, 20);
  ctx.stroke();
  ctx.restore();

  // 2. Left Side: Clean QR Container
  const qrBoxX = 36;
  const qrBoxY = 36;
  const qrBoxSize = 448;

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 8;
  roundedRect(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 20);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  // Draw QR image
  const qrSize = 390;
  const qrX = qrBoxX + (qrBoxSize - qrSize) / 2;
  const qrY = qrBoxY + (qrBoxSize - qrSize) / 2;

  try {
    const qrRes = await nodeFetch(qrUrl);
    const qrBuffer = await qrRes.arrayBuffer();
    const qrImage = await loadImage(Buffer.from(qrBuffer));
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);
  } catch (e) {
    console.error("Error fetching QR image", e);
  }

  // 3. Right Side: Clean Payment Info
  const rightX = 520;
  const rightW = width - rightX - 40;

  // Header
  ctx.fillStyle = "#38bdf8";
  ctx.font = "bold 13px Poppins, BeVietnamPro, sans-serif";
  ctx.fillText("ỦNG HỘ HỆ THỐNG", rightX, 68);

  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 28px BeVietnamPro, sans-serif";
  ctx.fillText(title, rightX, 104);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "14px BeVietnamPro, sans-serif";
  ctx.fillText(subtitle, rightX, 130);

  // Subtle divider
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rightX, 150);
  ctx.lineTo(rightX + rightW, 150);
  ctx.stroke();

  // Row 1: Ngân hàng
  const r1Y = 175;
  ctx.fillStyle = "#64748b";
  ctx.font = "12px BeVietnamPro, sans-serif";
  ctx.fillText("NGÂN HÀNG THỤ HƯỞNG", rightX, r1Y);

  ctx.fillStyle = "#f1f5f9";
  ctx.font = "bold 18px BeVietnamPro, sans-serif";
  ctx.fillText("OCB (Ngân hàng Phương Đông)", rightX, r1Y + 24);

  // Row 2: Số tài khoản
  const r2Y = 238;
  ctx.fillStyle = "#64748b";
  ctx.font = "12px BeVietnamPro, sans-serif";
  ctx.fillText("SỐ TÀI KHOẢN (CHỦ TK: THUÊ BOT)", rightX, r2Y);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 26px Poppins, BeVietnamPro, sans-serif";
  ctx.fillText(bankAccount, rightX, r2Y + 28);

  // Row 3: Nội dung chuyển khoản (Clean Box)
  const r3Y = 308;
  ctx.fillStyle = "#f59e0b";
  ctx.font = "bold 12px BeVietnamPro, sans-serif";
  ctx.fillText("NỘI DUNG CHUYỂN KHOẢN (GHI CHÍNH XÁC)", rightX, r3Y);

  const memoBoxY = r3Y + 12;
  const memoBoxH = 50;
  roundedRect(ctx, rightX, memoBoxY, rightW, memoBoxH, 10);
  ctx.fillStyle = "rgba(245, 158, 11, 0.1)";
  ctx.fill();
  ctx.strokeStyle = "rgba(245, 158, 11, 0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = "#fbbf24";
  ctx.font = "bold 22px Poppins, BeVietnamPro, sans-serif";
  ctx.fillText(transferContent, rightX + 16, memoBoxY + 32);

  // Divider
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rightX, 420);
  ctx.lineTo(rightX + rightW, 420);
  ctx.stroke();

  // Footer note
  ctx.fillStyle = "#64748b";
  ctx.font = "13px BeVietnamPro, sans-serif";
  ctx.fillText("Hệ thống tự động nhận diện và xử lý sau 30s – 1 phút.", rightX, 448);
  ctx.fillStyle = "#475569";
  ctx.font = "12px BeVietnamPro, sans-serif";
  ctx.fillText("Cảm ơn bạn đã đồng hành & duy trì máy chủ bot!", rightX, 468);

  const outPath = path.join(process.cwd(), `game_donate_qr_${uid}.png`);
  await writeFilePromise(outPath, canvas.toBuffer("image/png"));
  return outPath;
}
