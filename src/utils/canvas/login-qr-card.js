import path from "node:path";
import { fileURLToPath } from "node:url";
import jsQR from "jsqr";
import { Canvas, FontLibrary, loadImage } from "skia-canvas";
import { loadImage as loadNodeImage } from "canvas";
import { getActiveCanvasStyle } from "./theme.js";
import { renderQrStyle } from "./qr-style-renderers.js";

export const LOGIN_QR_CARD_WIDTH = 600;
export const LOGIN_QR_CARD_HEIGHT = 750;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontDirectory = path.resolve(__dirname, "../../../assets/fonts");
const FONT_FAMILY = "Manrope";

try {
  FontLibrary.use(FONT_FAMILY, [
    path.join(fontDirectory, "Manrope-Regular.ttf"),
    path.join(fontDirectory, "Manrope-SemiBold.ttf"),
    path.join(fontDirectory, "Manrope-Bold.ttf"),
  ]);
} catch (error) {
  console.warn("[Login QR] Không thể nạp font Manrope:", error?.message || error);
}

function roundedRect(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}

function toImageBuffer(imageInput) {
  if (Buffer.isBuffer(imageInput)) return imageInput;
  if (imageInput instanceof Uint8Array) return Buffer.from(imageInput);

  if (typeof imageInput === "string") {
    const normalized = imageInput.trim();
    const base64 = normalized.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "");
    if (!base64) throw new TypeError("Ảnh QR Zalo không có dữ liệu.");
    return Buffer.from(base64, "base64");
  }

  throw new TypeError("Ảnh QR Zalo phải là buffer hoặc chuỗi base64.");
}

function drawBackground(ctx) {
  const background = ctx.createLinearGradient(0, 0, LOGIN_QR_CARD_WIDTH, LOGIN_QR_CARD_HEIGHT);
  background.addColorStop(0, "#100A24");
  background.addColorStop(0.52, "#35134F");
  background.addColorStop(1, "#6B244D");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, LOGIN_QR_CARD_WIDTH, LOGIN_QR_CARD_HEIGHT);

  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = "#A855F7";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(170, 0);
  ctx.bezierCurveTo(130, 92, 116, 185, 0, 214);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 0.13;
  ctx.fillStyle = "#F4C76B";
  ctx.beginPath();
  ctx.moveTo(430, 0);
  ctx.lineTo(600, 0);
  ctx.lineTo(600, 250);
  ctx.bezierCurveTo(505, 202, 392, 136, 430, 0);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 0.1;
  ctx.fillStyle = "#F4C76B";
  ctx.beginPath();
  ctx.arc(535, 695, 190, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.12;
  ctx.fillStyle = "#A855F7";
  ctx.beginPath();
  ctx.arc(30, 690, 150, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawExpiryBadge(ctx, expiresInSeconds) {
  const badgeX = 177;
  const badgeY = 696;
  const badgeWidth = 246;
  const badgeHeight = 36;

  ctx.save();
  roundedRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, badgeHeight / 2);
  ctx.fillStyle = "rgba(15, 8, 32, 0.72)";
  ctx.fill();
  ctx.strokeStyle = "rgba(244, 199, 107, 0.58)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const lockX = badgeX + 24;
  const lockY = badgeY + 12;
  ctx.strokeStyle = "#FFE7A8";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(lockX, lockY, 4.5, Math.PI, 0);
  ctx.stroke();
  roundedRect(ctx, lockX - 6.5, lockY, 13, 11, 2.5);
  ctx.stroke();

  ctx.fillStyle = "#FFE7A8";
  ctx.font = `600 15px ${FONT_FAMILY}, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(`Mã hết hạn sau ${expiresInSeconds} giây`, badgeX + 42, badgeY + badgeHeight / 2 + 0.5);
  ctx.restore();
}

function mixChannel(start, end, amount) {
  return Math.round(start + (end - start) * amount);
}

/**
 * Đổi màu phần mực của QR nhưng không thay đổi cấu trúc module hay quiet zone.
 * Nếu jsQR không đọc lại được kết quả, vùng QR sẽ tự khôi phục về ảnh gốc.
 */
function recolorQrModulesSafely(ctx, x, y, width, height) {
  const styled = ctx.getImageData(x, y, width, height);
  const pixels = styled.data;
  const originalDecoded = jsQR(pixels, styled.width, styled.height, {
    inversionAttempts: "dontInvert",
  });

  for (let pixelY = 0; pixelY < height; pixelY += 1) {
    for (let pixelX = 0; pixelX < width; pixelX += 1) {
      const offset = (pixelY * width + pixelX) * 4;
      if (pixels[offset + 3] === 0) continue;

      // Khoảng cách tới màu trắng nhận diện được cả module đen lẫn finder màu.
      const ink = Math.max(
        255 - pixels[offset],
        255 - pixels[offset + 1],
        255 - pixels[offset + 2]
      ) / 255;
      if (ink < 0.08) continue;

      const amount = Math.min(1, (pixelX * 0.55 + pixelY * 0.45) / Math.max(1, width - 1));
      const targetRed = mixChannel(23, 113, amount);
      const targetGreen = mixChannel(16, 24, amount);
      const targetBlue = mixChannel(61, 88, amount);
      const coverage = Math.min(1, ink * 1.2);

      pixels[offset] = mixChannel(255, targetRed, coverage);
      pixels[offset + 1] = mixChannel(255, targetGreen, coverage);
      pixels[offset + 2] = mixChannel(255, targetBlue, coverage);
    }
  }

  const decoded = jsQR(styled.data, styled.width, styled.height, {
    inversionAttempts: "dontInvert",
  });

  if (!decoded || (originalDecoded && decoded.data !== originalDecoded.data)) return false;
  ctx.putImageData(styled, x, y);
  return true;
}

/**
 * Tạo card QR đăng nhập dùng chung cho `getlogin` và `mybot qrlogin`.
 * Giữ nguyên cấu trúc/payload QR của Zalo, chỉ đổi màu khi quét kiểm tra lại thành công.
 */
export async function createLoginQRCardBuffer(qrImageInput, options = {}) {
  const requestedExpiry = Number(options.expiresInSeconds);
  const expiresInSeconds = Number.isFinite(requestedExpiry)
    ? Math.max(1, Math.round(requestedExpiry))
    : 100;
  let qrImage;
  let qrImageBuffer;
  try {
    qrImageBuffer = toImageBuffer(qrImageInput);
    qrImage = await loadImage(qrImageBuffer);
  } catch (error) {
    throw new Error(`Ảnh QR Zalo không hợp lệ: ${error?.message || error}`);
  }

  const activeStyle = getActiveCanvasStyle();
  if (activeStyle !== 1) {
    const nodeQrImage = await loadNodeImage(qrImageBuffer);
    const styledCanvas = renderQrStyle(activeStyle, {
      qrImage: nodeQrImage,
      kicker: "MYBOT • SECURE LOGIN",
      title: "ĐĂNG NHẬP ZALO",
      subtitle: "Mở Zalo và dùng camera trong ứng dụng để quét",
      label: "HƯỚNG DẪN",
      value: "Mở Zalo → Quét mã QR",
      secondaryLabel: "BẢO MẬT",
      secondaryValue: "Không chia sẻ mã này",
      footer: "QR đăng nhập được tạo riêng cho phiên hiện tại",
      expiry: `Mã hết hạn sau ${expiresInSeconds} giây`,
    });
    return styledCanvas.toBuffer("image/png");
  }

  const canvas = new Canvas(LOGIN_QR_CARD_WIDTH, LOGIN_QR_CARD_HEIGHT);
  const ctx = canvas.getContext("2d");
  drawBackground(ctx);

  const cardX = 58;
  const cardY = 78;
  const cardSize = 484;
  const qrAreaX = 90;
  const qrAreaY = 110;
  const qrAreaSize = 420;

  ctx.save();
  ctx.shadowColor = "rgba(7, 3, 20, 0.48)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 13;
  roundedRect(ctx, cardX, cardY, cardSize, cardSize, 25);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.restore();

  roundedRect(ctx, cardX, cardY, cardSize, cardSize, 25);
  ctx.strokeStyle = "rgba(244, 199, 107, 0.42)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Giữ nguyên quiet zone trong ảnh gốc và chừa thêm 32 px trắng sạch quanh ảnh.
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(qrAreaX, qrAreaY, qrAreaSize, qrAreaSize);

  const qrScale = Math.min(qrAreaSize / qrImage.width, qrAreaSize / qrImage.height);
  const qrWidth = Math.max(1, Math.round(qrImage.width * qrScale));
  const qrHeight = Math.max(1, Math.round(qrImage.height * qrScale));
  const qrX = Math.round(qrAreaX + (qrAreaSize - qrWidth) / 2);
  const qrY = Math.round(qrAreaY + (qrAreaSize - qrHeight) / 2);

  // Không nội suy để các module QR luôn sắc nét sau khi resize.
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrImage, qrX, qrY, qrWidth, qrHeight);
  ctx.imageSmoothingEnabled = true;
  recolorQrModulesSafely(ctx, qrAreaX, qrAreaY, qrAreaSize, qrAreaSize);

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(0, 0, 0, 0.42)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = "#FFF8E7";
  ctx.font = `700 28px ${FONT_FAMILY}, sans-serif`;
  ctx.fillText("Mở Zalo → Quét mã QR", LOGIN_QR_CARD_WIDTH / 2, 632);

  ctx.shadowColor = "rgba(0, 0, 0, 0.42)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 1.5;
  ctx.fillStyle = "#E9DDF2";
  ctx.font = `400 18px ${FONT_FAMILY}, sans-serif`;
  ctx.fillText("Dùng camera trong ứng dụng Zalo để quét", LOGIN_QR_CARD_WIDTH / 2, 671);
  ctx.restore();

  drawExpiryBadge(ctx, expiresInSeconds);
  return await canvas.toBuffer("png");
}
