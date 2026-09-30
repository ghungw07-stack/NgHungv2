import { createCanvas, loadImage } from "canvas";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { tempDir } from "../../../../utils/io-json.js";
import { checkExstentionFileRemote, deleteFile, downloadFile } from "../../../../utils/util.js";
import { getCachedMedia, setCacheData } from "../../../../utils/link-platform-cache.js";
import { randomIDTemp } from "../../../../utils/format-util.js";
import { getVideoMetadata } from "../../../../api-zalo/utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

export const PLATFORM_VINYL_CARD          = "VINYL_CARD";
export const PLATFORM_VINYL_CARD_SPINNING = "VINYL_CARD_SPIN";

// Default animation config
const VINYL_FRAME_RATE = 24;
const VINYL_TIME_SEC   = 5;

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Vẽ đường path hình chữ nhật bo góc */
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Vẽ đĩa vinyl tại tâm (cx, cy), bán kính r.
 * Ảnh `photo` sẽ được dùng làm nhãn trung tâm.
 */
function drawVinylRecord(ctx, cx, cy, r, photo) {
  ctx.save();

  // Đổ bóng dưới đĩa
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx + 4, cy + 6, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.filter = "blur(8px)";
  ctx.fill();
  ctx.restore();

  // Thân đĩa - đen vinyl
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#0a0a0a";
  ctx.fill();

  // Highlight ánh sáng top-left (matte vinyl)
  const shine = ctx.createRadialGradient(
    cx - r * 0.4, cy - r * 0.4, r * 0.05,
    cx, cy, r
  );
  shine.addColorStop(0, "rgba(255,255,255,0.14)");
  shine.addColorStop(0.45, "rgba(255,255,255,0.03)");
  shine.addColorStop(1, "rgba(0,0,0,0)");
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = shine;
  ctx.fill();

  // Rãnh đĩa (concentric grooves)
  const grooves = 32;
  for (let i = 1; i <= grooves; i++) {
    const gr = r * (0.32 + (0.65 * i) / grooves);
    if (gr >= r) break;
    ctx.beginPath();
    ctx.arc(cx, cy, gr, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${i % 5 === 0 ? 0.10 : 0.035})`;
    ctx.lineWidth = i % 5 === 0 ? 0.9 : 0.6;
    ctx.stroke();
  }

  // Viền ngoài cùng
  ctx.beginPath();
  ctx.arc(cx, cy, r - 1.5, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // ── Nhãn trung tâm (ảnh tròn) ──
  const labelR = Math.round(r * 0.34);

  if (photo) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, labelR, 0, Math.PI * 2);
    ctx.clip();
    const scale = Math.max((labelR * 2) / photo.width, (labelR * 2) / photo.height);
    const sw = photo.width * scale;
    const sh = photo.height * scale;
    ctx.drawImage(photo, cx - sw / 2, cy - sh / 2, sw, sh);
    ctx.restore();
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, labelR, 0, Math.PI * 2);
    ctx.fillStyle = "#c62828";
    ctx.fill();
  }

  // Viền nhãn
  ctx.beginPath();
  ctx.arc(cx, cy, labelR, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Lỗ trung tâm
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fillStyle = "#000";
  ctx.fill();

  ctx.restore();
}

// ──────────────────────────────────────────────
// Main export
// ──────────────────────────────────────────────

/**
 * Tạo ảnh vinyl card: nền tối bo góc + ảnh (trái) + đĩa vinyl (phải).
 * Trả về { url, stickerData } sau khi upload lên Zalo.
 *
 * @param {object} api
 * @param {object} message
 * @param {string} imageUrl  - URL ảnh gốc
 * @param {string} idImage   - ID dùng để cache
 */
export async function createVinylCard(api, message, imageUrl, idImage) {
  const cacheKey = `vinyl_${idImage}`;
  const cached = await getCachedMedia(PLATFORM_VINYL_CARD, cacheKey, "webp");
  if (cached) return cached;

  // Layout — canvas vuông, ảnh to hơn đĩa, bo góc nhiều hơn
  const CANVAS_W   = 600;
  const CANVAS_H   = 600;
  const BG_RADIUS  = 20;
  const PHOTO_SIZE = 420;
  const PHOTO_RAD  = 32;                                   // bo góc rõ
  const PHOTO_X    = 20;
  const PHOTO_Y    = (CANVAS_H - PHOTO_SIZE) / 2;
  const RECORD_R   = 178;                                  // đĩa to
  const RECORD_CX  = CANVAS_W - RECORD_R - 4;              // sát mép phải, chừa 4px cho viền không bị cắt
  const RECORD_CY  = CANVAS_H / 2;

  const idRandom       = randomIDTemp();
  const ext            = await checkExstentionFileRemote(imageUrl);
  const downloadedFile = path.join(tempDir, `vinyl_orig_${idRandom}.${ext}`);
  const outputPng      = path.join(tempDir, `vinyl_card_${idRandom}.png`);
  const outputWebp     = path.join(tempDir, `vinyl_card_${idRandom}.webp`);

  try {
    await downloadFile(imageUrl, downloadedFile);
    const photo = await loadImage(downloadedFile);

    const canvas = createCanvas(CANVAS_W, CANVAS_H);
    const ctx    = canvas.getContext("2d");

    // ── Đĩa vinyl (vẽ trước, nằm sau ảnh; lòi ra ngoài bên phải) ──
    drawVinylRecord(ctx, RECORD_CX, RECORD_CY, RECORD_R, photo);

    // ── Ảnh bìa (trái) — đè lên nửa trái của đĩa ──
    ctx.save();
    roundRectPath(ctx, PHOTO_X, PHOTO_Y, PHOTO_SIZE, PHOTO_SIZE, PHOTO_RAD);
    ctx.clip();
    const scale = Math.max(PHOTO_SIZE / photo.width, PHOTO_SIZE / photo.height);
    const sw = photo.width * scale;
    const sh = photo.height * scale;
    ctx.drawImage(
      photo,
      PHOTO_X + (PHOTO_SIZE - sw) / 2,
      PHOTO_Y + (PHOTO_SIZE - sh) / 2,
      sw, sh
    );
    ctx.restore();

    // ── Xuất PNG → WebP ──
    const buffer = canvas.toBuffer("image/png");
    await fs.promises.writeFile(outputPng, buffer);
    await sharp(outputPng).webp({ quality: 88, effort: 4 }).toFile(outputWebp);

    // ── Upload lên Zalo ──
    const [linkUpload, stickerData] = await Promise.all([
      api.uploadAttachment([outputWebp], message.threadId, message.type, { uploadCloud: true }),
      getVideoMetadata(outputWebp),
    ]);

    let finalUrl = linkUpload[0].fileUrl || linkUpload[0].normalUrl;
    finalUrl += ".webp";

    const result = { url: finalUrl, stickerData };
    setCacheData(PLATFORM_VINYL_CARD, cacheKey, result, "webp");
    return result;
  } catch (error) {
    console.error("[VinylCard] Lỗi khi tạo vinyl card:", error);
    throw error;
  } finally {
    await deleteFile(downloadedFile);
    await deleteFile(outputPng);
    await deleteFile(outputWebp);
  }
}

// ──────────────────────────────────────────────
// Animated version: vinyl xoay liên tục
// ──────────────────────────────────────────────

/**
 * Tạo vinyl card animated: ảnh bên trái đứng yên, đĩa bên phải xoay liên tục.
 * Trả về { url, stickerData } sau khi upload.
 *
 * @param {object} api
 * @param {object} message
 * @param {string} imageUrl
 * @param {string} idImage
 * @param {number} [timeSeconds=5] - Thời gian 1 vòng quay (0.5–15)
 */
export async function createVinylCardSpinning(api, message, imageUrl, idImage, timeSeconds = VINYL_TIME_SEC) {
  const validTime = Math.max(0.5, Math.min(15, timeSeconds || VINYL_TIME_SEC));
  const cacheKey = `vinylSpin_${idImage}_t${validTime}`;
  const cached = await getCachedMedia(PLATFORM_VINYL_CARD_SPINNING, cacheKey, "webp");
  if (cached) return cached;

  // Layout — canvas vuông, ảnh to hơn đĩa
  const CANVAS_W = 600, CANVAS_H = 600, PHOTO_SIZE = 420, PHOTO_X = 20, RECORD_R = 178;
  const layout = {
    CANVAS_W,
    CANVAS_H,
    BG_RADIUS:  20,
    PHOTO_X,
    PHOTO_Y:    (CANVAS_H - PHOTO_SIZE) / 2,
    PHOTO_SIZE,
    PHOTO_RAD:  32,
    RECORD_R,
    RECORD_CX:  CANVAS_W - RECORD_R - 4,
    RECORD_CY:  CANVAS_H / 2,
  };

  const totalFrames = Math.round(validTime * VINYL_FRAME_RATE);

  const idRandom       = randomIDTemp();
  const ext            = await checkExstentionFileRemote(imageUrl);
  const downloadedFile = path.join(tempDir, `vinyl_orig_${idRandom}.${ext}`);
  const outputWebp     = path.join(tempDir, `vinyl_spin_${idRandom}.webp`);

  try {
    await downloadFile(imageUrl, downloadedFile);

    const workerPath = path.join(__dirname, "vinyl-frame-worker.js");
    const childProcess = spawn("node", [workerPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        WORKER_DATA: JSON.stringify({
          downloadedImage: downloadedFile,
          totalFrames,
          resultPath: outputWebp,
          FRAME_RATE: VINYL_FRAME_RATE,
          layout,
        }),
      },
    });

    childProcess.stderr.on("data", (chunk) => {
      const msg = chunk.toString();
      if (msg.trim()) console.error("[VinylWorker]", msg.trim());
    });

    await new Promise((resolve, reject) => {
      childProcess.on("error", reject);
      childProcess.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Vinyl worker exited with code ${code}`));
      });
    });

    if (!fs.existsSync(outputWebp)) {
      throw new Error("Không tạo được file vinyl webp");
    }

    const [linkUpload, stickerData] = await Promise.all([
      api.uploadAttachment([outputWebp], message.threadId, message.type, { uploadCloud: true }),
      getVideoMetadata(outputWebp),
    ]);

    let finalUrl = linkUpload[0].fileUrl || linkUpload[0].normalUrl;
    finalUrl += ".webp";

    const result = { url: finalUrl, stickerData };
    setCacheData(PLATFORM_VINYL_CARD_SPINNING, cacheKey, result, "webp");
    return result;
  } catch (error) {
    console.error("[VinylCardSpinning] Lỗi:", error);
    throw error;
  } finally {
    await deleteFile(downloadedFile);
    await deleteFile(outputWebp);
  }
}

