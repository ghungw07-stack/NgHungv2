import { spawn } from "child_process";
import { Canvas, loadImage } from "skia-canvas";
import { asyncPool } from "../../../../api-zalo/utils.js";

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

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
 * Vẽ đĩa vinyl đầy đủ (kèm nhãn ảnh) lên canvas vinyl-only,
 * tâm canvas tại (size/2, size/2). Khi rotate canvas này thì cả đĩa + nhãn cùng quay.
 */
function buildVinylSprite(size, photo) {
  const cv = new Canvas(size, size);
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 1;

  // Thân đĩa - đen vinyl
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#0a0a0a";
  ctx.fill();

  // Highlight top-left (matte)
  const shine = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.4, r * 0.05, cx, cy, r);
  shine.addColorStop(0, "rgba(255,255,255,0.14)");
  shine.addColorStop(0.45, "rgba(255,255,255,0.03)");
  shine.addColorStop(1, "rgba(0,0,0,0)");
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = shine;
  ctx.fill();

  // Rãnh đĩa concentric
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

  // Vài đường sáng dài giúp nhìn rõ chuyển động xoay
  for (let i = 0; i < 3; i++) {
    const gr = r * (0.45 + i * 0.2);
    ctx.beginPath();
    ctx.arc(cx, cy, gr, -Math.PI / 7, Math.PI / 7);
    ctx.strokeStyle = "rgba(255,255,255,0.20)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  // Viền ngoài
  ctx.beginPath();
  ctx.arc(cx, cy, r - 1.5, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Nhãn (ảnh tròn ở giữa)
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
  }

  // Viền nhãn
  ctx.beginPath();
  ctx.arc(cx, cy, labelR, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Lỗ tâm
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fillStyle = "#000";
  ctx.fill();

  return cv;
}

/**
 * Tạo canvas card tĩnh (bg + ảnh trái + viền) — đè lên đĩa khi compose.
 */
function buildCardCanvas(opts, photo) {
  const { CANVAS_W, CANVAS_H, PHOTO_X, PHOTO_Y, PHOTO_SIZE, PHOTO_RAD } = opts;
  const cv = new Canvas(CANVAS_W, CANVAS_H);
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Chỉ ảnh bìa (nền trong suốt)
  ctx.save();
  roundRectPath(ctx, PHOTO_X, PHOTO_Y, PHOTO_SIZE, PHOTO_SIZE, PHOTO_RAD);
  ctx.clip();
  const scale = Math.max(PHOTO_SIZE / photo.width, PHOTO_SIZE / photo.height);
  const sw = photo.width * scale;
  const sh = photo.height * scale;
  ctx.drawImage(photo, PHOTO_X + (PHOTO_SIZE - sw) / 2, PHOTO_Y + (PHOTO_SIZE - sh) / 2, sw, sh);
  ctx.restore();

  return cv;
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────

async function processFrames() {
  const workerData = JSON.parse(process.env.WORKER_DATA);
  const { downloadedImage, totalFrames, resultPath, FRAME_RATE, layout } = workerData;

  try {
    const photo = await loadImage(downloadedImage);

    const VINYL_SIZE = layout.RECORD_R * 2;
    const CANVAS_W = layout.CANVAS_W || layout.CARD_W;
    const CANVAS_H = layout.CANVAS_H || layout.CARD_H;
    const cardCanvas = buildCardCanvas(layout, photo);
    const vinylSprite = buildVinylSprite(VINYL_SIZE, photo);

    const segmentBuffers = new Array(totalFrames).fill(null);
    const ffmpegArgs = [
      "-f", "image2pipe",
      "-framerate", FRAME_RATE.toString(),
      "-i", "-",
      "-fps_mode", "passthrough",          // Giữ nguyên frame, không dedupe
      "-loop", "0",
      "-c:v", "libwebp",
      "-preset", "picture",
      "-lossless", "0",
      "-q:v", "75",
      "-pix_fmt", "yuva420p",
      "-an",
      resultPath,
    ];

    const ffmpegProcess = spawn("ffmpeg", ffmpegArgs, { stdio: ["pipe", "inherit", "inherit"] });
    let nextWriteIndex = 0;

    const writeInOrderToFfmpeg = async () => {
      while (nextWriteIndex < totalFrames) {
        try {
          while (segmentBuffers[nextWriteIndex]) {
            ffmpegProcess.stdin.write(segmentBuffers[nextWriteIndex]);
            segmentBuffers[nextWriteIndex] = null;
            nextWriteIndex++;
          }
          if (nextWriteIndex === totalFrames) {
            ffmpegProcess.stdin.end();
            await new Promise((resolve, reject) => {
              ffmpegProcess.on("exit", (code) => {
                if (code === 0) resolve();
                else reject(new Error(`FFmpeg exited with code ${code}`));
              });
              ffmpegProcess.on("error", reject);
            });
            break;
          }
        } catch (error) {
          try { ffmpegProcess.stdin.end(); } catch (_) {}
          throw error;
        }
        await new Promise((r) => setTimeout(r, 50));
      }
    };

    const degToRad = Math.PI / 180;

    // Tạo "factory" lazy - mỗi item là HÀM trả về promise, asyncPool gọi mới chạy
    const frameTasks = Array.from({ length: totalFrames }, (_, i) => async () => {
      try {
        const angle = ((i * 360) / totalFrames) * degToRad;

        const finalCanvas = new Canvas(CANVAS_W, CANVAS_H);
        const ctx = finalCanvas.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        // 1. Đĩa xoay (vẽ trước, lòi ra ngoài card bên phải)
        ctx.save();
        ctx.translate(layout.RECORD_CX, layout.RECORD_CY);
        ctx.rotate(angle);
        ctx.drawImage(vinylSprite, -layout.RECORD_R, -layout.RECORD_R, VINYL_SIZE, VINYL_SIZE);
        ctx.restore();

        // 2. Card (bg + ảnh trái) đè lên nửa trái của đĩa
        ctx.drawImage(cardCanvas, 0, 0);

        segmentBuffers[i] = await finalCanvas.toBuffer("image/png");
      } catch (err) {
        // Frame fail: throw để abort worker thay vì kẹt vô tận ở writer
        console.error(`[VinylWorker] Frame ${i} failed:`, err?.message || err);
        throw err;
      }
    });

    await Promise.all([
      writeInOrderToFfmpeg(),
      asyncPool(8, frameTasks, (task) => task()),
    ]);
  } catch (error) {
    console.error("VinylWorker error:", error);
    process.exit(1);
  }
}

processFrames();

