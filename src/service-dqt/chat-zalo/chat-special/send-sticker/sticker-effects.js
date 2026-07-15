import fs from "fs";
import path from "path";
import sharp from "sharp";
import { createCanvas } from "canvas";
import { tempDir } from "../../../../utils/io-json.js";
import { randomIDTemp } from "../../../../utils/format-util.js";

/**
 * ============================================================
 *  BỔ SUNG CÁC ĐỐI SỐ CHO LỆNH !stk
 *  - text <nội dung> : Tạo sticker chữ
 *  - z(x)            : Zoom in/out           (vd: z1.5, z0.7)
 *  - sp(x)           : Tăng/giảm tốc độ video (vd: sp2, sp0.5)
 *  - pixel(size)     : Hiệu ứng pixel hóa     (vd: pixel8, pixel16)
 *  - cat             : Ép sticker về đúng khung 512x512
 *  - spin            : Alias của sd/spindisk đã có sẵn (xử lý ở convert-sticker.js)
 * ============================================================
 */

// ------------------------------------------------------------------
// Parse danh sách args (đã split theo dấu cách) thành object option
// Đặt trong 1 hàm dùng chung để convert-sticker.js gọi lại cho gọn.
// ------------------------------------------------------------------
export function parseExtraStickerArgs(args = []) {
  const result = {
    zoomFactor: null, // number | null
    speedFactor: null, // number | null
    pixelSize: null, // number | null
    isCat: false,
  };

  const zoomRegex = /^z(\d+(?:\.\d+)?)$/i;
  const speedRegex = /^sp(\d+(?:\.\d+)?)$/i;
  const pixelRegex = /^pixel(\d+)?$/i;
  const catRegex = /^cat$/i;

  for (const rawArg of args) {
    const arg = rawArg.trim();
    if (!arg) continue;

    let match;
    if ((match = arg.match(zoomRegex))) {
      let value = parseFloat(match[1]);
      if (!isNaN(value)) {
        // Giới hạn hợp lý để tránh phá hình / quá tải xử lý
        value = Math.min(Math.max(value, 0.3), 3);
        result.zoomFactor = value;
      }
    } else if ((match = arg.match(speedRegex))) {
      let value = parseFloat(match[1]);
      if (!isNaN(value)) {
        value = Math.min(Math.max(value, 0.25), 4);
        result.speedFactor = value;
      }
    } else if ((match = arg.match(pixelRegex))) {
      let value = match[1] ? parseInt(match[1]) : 8;
      if (!isNaN(value)) {
        value = Math.min(Math.max(value, 2), 64);
        result.pixelSize = value;
      }
    } else if (catRegex.test(arg)) {
      result.isCat = true;
    }
  }

  return result;
}

// ------------------------------------------------------------------
// ẢNH TĨNH / ẢNH ĐỘNG DẠNG PNG-JPG-WEBP: xử lý bằng sharp
// Áp dụng theo thứ tự: cat (crop vuông 512) -> zoom -> pixelate
// rồi trả về buffer PNG để convert-sticker.js tiếp tục xử lý bo góc + webp
// ------------------------------------------------------------------
export async function applyImageEffects(inputPath, { zoomFactor, pixelSize, isCat } = {}) {
  let pipeline = sharp(inputPath, { animated: true });
  const metadata = await pipeline.metadata();
  const width = metadata.width || 512;
  const height = metadata.height || width;

  // 1. cat: ép về khung vuông 512x512 (cover, crop giữa ảnh)
  if (isCat) {
    pipeline = pipeline.resize(512, 512, { fit: "cover", position: "center" });
  }

  // 2. zoom: >1 zoom in (crop vùng giữa rồi phóng to lại), <1 zoom out (thu nhỏ + đệm nền trong suốt)
  if (zoomFactor && zoomFactor !== 1) {
    const baseW = isCat ? 512 : width;
    const baseH = isCat ? 512 : height;

    if (zoomFactor > 1) {
      const cropW = Math.round(baseW / zoomFactor);
      const cropH = Math.round(baseH / zoomFactor);
      pipeline = pipeline
        .resize(baseW, baseH, { fit: "cover", position: "center" })
        .extract({
          left: Math.round((baseW - cropW) / 2),
          top: Math.round((baseH - cropH) / 2),
          width: cropW,
          height: cropH,
        })
        .resize(baseW, baseH, { fit: "fill" });
    } else {
      // zoom out: thu nhỏ nội dung rồi đặt giữa canvas trong suốt kích thước gốc
      const newW = Math.round(baseW * zoomFactor);
      const newH = Math.round(baseH * zoomFactor);
      const resizedBuffer = await pipeline
        .resize(baseW, baseH, { fit: "cover", position: "center" })
        .resize(newW, newH, { fit: "fill" })
        .toBuffer();

      pipeline = sharp({
        create: {
          width: baseW,
          height: baseH,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      }).composite([
        {
          input: resizedBuffer,
          left: Math.round((baseW - newW) / 2),
          top: Math.round((baseH - newH) / 2),
        },
      ]);
    }
  }

  // 3. pixel: pixel hóa bằng cách thu nhỏ rồi phóng to lại với kernel "nearest"
  if (pixelSize && pixelSize > 1) {
    const currentMeta = await pipeline.clone().metadata().catch(() => null);
    const baseW = currentMeta?.width || (isCat ? 512 : width);
    const baseH = currentMeta?.height || (isCat ? 512 : height);
    const smallW = Math.max(1, Math.round(baseW / pixelSize));
    const smallH = Math.max(1, Math.round(baseH / pixelSize));

    const smallBuffer = await pipeline
      .resize(smallW, smallH, { kernel: "nearest" })
      .toBuffer();

    pipeline = sharp(smallBuffer).resize(baseW, baseH, { kernel: "nearest" });
  }

  return pipeline.png().toBuffer();
}

// ------------------------------------------------------------------
// VIDEO: xây dựng chuỗi filter ffmpeg dùng chung với convertToWebp
// Trả về mảng string filter để nối bằng dấu phẩy vào "-vf"
// ------------------------------------------------------------------
export function buildVideoEffectFilters({ zoomFactor, pixelSize, isCat } = {}) {
  const filters = [];

  // scale nền: nếu cat thì ép vuông 512x512, ngược lại giữ tỉ lệ scale về 512 chiều rộng
  if (isCat) {
    filters.push("scale=512:512:force_original_aspect_ratio=increase:flags=fast_bilinear", "crop=512:512");
  } else {
    filters.push("scale=512:-2:flags=fast_bilinear");
  }

  if (zoomFactor && zoomFactor !== 1) {
    if (zoomFactor > 1) {
      // zoom in: crop vùng giữa theo tỉ lệ rồi scale lại đúng kích thước hiện tại
      filters.push(`crop=iw/${zoomFactor}:ih/${zoomFactor}`, `scale=iw*${zoomFactor}:ih*${zoomFactor}`);
    } else {
      // zoom out: thu nhỏ rồi pad viền đen về lại kích thước cũ (video không hỗ trợ alpha)
      filters.push(
        `scale=iw*${zoomFactor}:ih*${zoomFactor}`,
        `pad=iw/${zoomFactor}:ih/${zoomFactor}:(ow-iw)/2:(oh-ih)/2:color=black@0`
      );
    }
  }

  if (pixelSize && pixelSize > 1) {
    filters.push(`scale=iw/${pixelSize}:ih/${pixelSize}:flags=neighbor`, `scale=iw*${pixelSize}:ih*${pixelSize}:flags=neighbor`);
  }

  return filters;
}

export function buildSpeedFilter(speedFactor) {
  if (!speedFactor || speedFactor === 1) return null;
  // setpts < 1 giá trị = chạy nhanh hơn (chia PTS) -> setpts=PTS/speedFactor
  return `setpts=PTS/${speedFactor}`;
}

// ------------------------------------------------------------------
// STICKER CHỮ: !stk text <nội dung>
// Vẽ nội dung chữ lên canvas 512x512, tự wrap dòng, tự co cỡ chữ.
// ------------------------------------------------------------------
const BACKGROUND_GRADIENTS = [
  ["#FF6B6B", "#556270"],
  ["#42275a", "#734b6d"],
  ["#0F2027", "#2C5364"],
  ["#c31432", "#240b36"],
  ["#1D976C", "#93F9B9"],
  ["#000000", "#434343"],
];

function wrapCanvasText(ctx, text, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

export async function createTextStickerBuffer(text) {
  const size = 512;
  const padding = 48;
  const maxWidth = size - padding * 2;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // nền gradient random
  const [colorA, colorB] = BACKGROUND_GRADIENTS[Math.floor(Math.random() * BACKGROUND_GRADIENTS.length)];
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, colorA);
  gradient.addColorStop(1, colorB);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // Tìm cỡ chữ lớn nhất vừa khung (giảm dần cho tới khi vừa số dòng cho phép)
  let fontSize = 84;
  let lines = [];
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  while (fontSize >= 24) {
    ctx.font = `bold ${fontSize}px sans-serif`;
    lines = wrapCanvasText(ctx, text, maxWidth);
    const totalHeight = lines.length * (fontSize * 1.25);
    if (totalHeight <= size - padding * 2) break;
    fontSize -= 4;
  }

  ctx.font = `bold ${fontSize}px sans-serif`;
  const lineHeight = fontSize * 1.25;
  const startY = size / 2 - ((lines.length - 1) * lineHeight) / 2;

  // đổ bóng nhẹ cho chữ dễ đọc
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = "#FFFFFF";

  lines.forEach((line, i) => {
    ctx.fillText(line, size / 2, startY + i * lineHeight);
  });

  return canvas.toBuffer("image/png");
}

export async function createTextStickerWebp(text) {
  const pngBuffer = await createTextStickerBuffer(text);
  const outputPath = path.join(tempDir, `sticker_text_${randomIDTemp()}.webp`);
  await sharp(pngBuffer).webp({ lossless: false, quality: 85, reductionEffort: 6 }).toFile(outputPath);
  return outputPath;
}