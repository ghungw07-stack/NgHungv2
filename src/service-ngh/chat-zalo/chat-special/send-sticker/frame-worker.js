import { spawn } from "child_process";
import { Canvas, loadImage } from "skia-canvas";
import { asyncPool } from "../../../../api-zalo/utils.js";

async function processFrames() {
  const workerData = JSON.parse(process.env.WORKER_DATA);
  const { downloadedImage, startFrame, endFrame, size, totalFrames, resultPath, FRAME_RATE } = workerData;

  try {
    const segmentBuffers = new Array(totalFrames).fill(null);
    const ffmpegArgs = [
      "-f",
      "image2pipe",
      "-framerate",
      FRAME_RATE.toString(),
      "-i",
      "-",
      "-loop",
      "0",
      "-c:v",
      "libwebp",
      "-preset",
      "picture",
      "-lossless",
      "0",
      "-q:v",
      "75",
      "-pix_fmt",
      "yuva420p",
      resultPath,
    ];

    const ffmpegProcess = spawn("ffmpeg", ffmpegArgs, {
      stdio: ["pipe", "inherit", "inherit"],
    });
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
              ffmpegProcess.on("exit", (code, signal) => {
                if (code === 0) {
                  resolve();
                } else {
                  reject(new Error(`FFmpeg exited with code ${code} and signal ${signal}`));
                }
              });

              ffmpegProcess.on("error", (err) => {
                reject(err);
              });
            });
            break;
          }
        } catch (error) {
          try {
            ffmpegProcess.stdin.end();
          } catch (e) {}
          throw new Error("❌ Lỗi khi ghi vào ffmpeg:", error);
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    };

    const originalImage = await loadImage(downloadedImage);

    const resizedCanvas = new Canvas(size, size);
    const resizedCtx = resizedCanvas.getContext("2d");
    resizedCtx.imageSmoothingEnabled = true;
    resizedCtx.imageSmoothingQuality = "high";

    const scale = Math.max(size / originalImage.width, size / originalImage.height);
    const scaledWidth = originalImage.width * scale;
    const scaledHeight = originalImage.height * scale;
    const x = (size - scaledWidth) / 2;
    const y = (size - scaledHeight) / 2;
    resizedCtx.drawImage(originalImage, x, y, scaledWidth, scaledHeight);

    const maskCanvas = new Canvas(size, size);
    const maskCtx = maskCanvas.getContext("2d");

    maskCtx.imageSmoothingEnabled = true;
    maskCtx.imageSmoothingQuality = "high";

    const gradient = maskCtx.createRadialGradient(size / 2, size / 2, size / 2 - 2, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "white");
    gradient.addColorStop(0.95, "white");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

    maskCtx.beginPath();
    maskCtx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2, true);
    maskCtx.fillStyle = gradient;
    maskCtx.fill();

    const degToRad = Math.PI / 180;

    function interpolateHue(hue1, hue2, t) {
      let d = hue2 - hue1;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      return (hue1 + d * t + 360) % 360;
    }

    const startHue = 120; // Green
    const midHue = 170; // Turquoise
    const endHue = 120; // Back to green

    const framePromises = Array.from({ length: endFrame - startFrame }, (_, index) => {
      const i = startFrame + index;
      return (async () => {
        const angle = (((i * 360) / totalFrames) * Math.PI) / 180;
        const rotatedSize = Math.abs(size * Math.cos(angle)) + Math.abs(size * Math.sin(angle));
        const offset = (rotatedSize - size) / 2;

        const rotateCanvas = new Canvas(rotatedSize, rotatedSize);
        const rotateCtx = rotateCanvas.getContext("2d");

        rotateCtx.imageSmoothingEnabled = true;
        rotateCtx.imageSmoothingQuality = "high";

        rotateCtx.save();
        rotateCtx.translate(rotatedSize / 2, rotatedSize / 2);
        rotateCtx.rotate(((i * 360) / totalFrames) * degToRad);
        rotateCtx.drawImage(resizedCanvas, -size / 2, -size / 2, size, size);
        rotateCtx.restore();

        const finalCanvas = new Canvas(size, size);
        const finalCtx = finalCanvas.getContext("2d");

        finalCtx.imageSmoothingEnabled = true;
        finalCtx.imageSmoothingQuality = "high";

        finalCtx.drawImage(rotateCanvas, offset, offset, size, size, 0, 0, size, size);

        finalCtx.globalCompositeOperation = "destination-in";
        finalCtx.drawImage(maskCanvas, 0, 0);

        finalCtx.globalCompositeOperation = "source-over";
        finalCtx.lineWidth = 8;

        let strokeHue;
        if (i <= totalFrames / 2) {
          const t = i / (totalFrames / 2);
          strokeHue = interpolateHue(startHue, midHue, t);
        } else {
          const t = (i - totalFrames / 2) / (totalFrames / 2);
          strokeHue = interpolateHue(midHue, endHue, t);
        }
        const saturation = Math.floor(Math.random() * 5) + 95;
        const lightness = Math.floor(Math.random() * 5) + 80;
        finalCtx.strokeStyle = `hsl(${strokeHue}, ${saturation}%, ${lightness}%)`;

        finalCtx.beginPath();
        finalCtx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2, true);
        finalCtx.stroke();

        const frameBuffer = await finalCanvas.toBuffer("image/png");

        segmentBuffers[i] = frameBuffer;
      })();
    });

    await Promise.all([
      writeInOrderToFfmpeg(),
      asyncPool(
        30,
        framePromises.map((fn) => () => fn),
        (fn) => fn()
      ),
    ]);
  } catch (error) {
    console.error("Worker error:", error);
    process.exit(1);
  }
}

processFrames();
