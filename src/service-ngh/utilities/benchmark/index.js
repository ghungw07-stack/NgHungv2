import os from "os";
import { Worker } from "worker_threads";
import { performance } from "perf_hooks";
import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";
import * as cv from "../../../utils/canvas/index.js";
import { loadImageBuffer, deleteFile } from "../../../utils/util.js";
import { FONT_MAIN } from "../../../utils/format-util.js";
import { searchGoogleImages } from "../../api-crawl/google/google-image.js";
import {
  sendMessageCompleteRequest,
  sendMessageFromSQL,
  sendMessageTag,
} from "../../chat-zalo/chat-style/chat-style.js";

const TIME_TO_LIVE_MESSAGE = 600000;
const TEST_DURATION = 10000;

// Quản lý session theo threadId để gộp gửi và timeout
const benchmarkSessions = new Map();
const BENCHMARK_TIMEOUT = 60000; // 60 giây timeout

export class CpuBenchmark {
  constructor(options = {}) {
    this.durationMs = options.durationMs ?? 3000;
    this.cpuCores = os.cpus().length;
    // Leave capacity for the socket/event loop and cap worker fan-out on large
    // servers. This command is diagnostic; it must not make the bot unresponsive.
    const configuredWorkers = Number.parseInt(process.env.NGH_BENCHMARK_WORKERS || "", 10);
    this.workerCount = Math.max(
      1,
      Math.min(
        this.cpuCores,
        Number.isFinite(configuredWorkers) ? configuredWorkers : Math.min(8, Math.max(1, this.cpuCores - 1))
      )
    );
    this.cpuModel = os.cpus()[0].model.trim();
    const totalSpeed = os.cpus().reduce((s, c) => s + (c.speed || 0), 0);
    this.cpuSpeedMHz = Math.round(totalSpeed / this.cpuCores);
  }

  async runSingleThreadBenchmark(durationMs = this.durationMs) {
    return this.createWorker(durationMs);
  }

  createWorker(durationMs) {
    return new Promise((resolve, reject) => {
      const workerFile = new URL("./bench-worker.js", import.meta.url);
      const w = new Worker(workerFile, { workerData: { durationMs } });
      let settled = false;
      w.once("message", (msg) => {
        settled = true;
        resolve(msg.ops);
      });
      w.once("error", (error) => {
        settled = true;
        reject(error);
      });
      w.once("exit", (code) => {
        if (!settled && code !== 0) reject(new Error(`Worker exited with code ${code}`));
        else if (!settled) reject(new Error("Worker exited without a result"));
      });
    });
  }

  async runMultiThreadBenchmark(durationMs = this.durationMs) {
    const workerPromises = [];
    for (let i = 0; i < this.workerCount; i++) {
      workerPromises.push(this.createWorker(durationMs));
    }
    const results = await Promise.all(workerPromises);
    const totalOps = results.reduce((s, v) => s + v, 0);
    return { totalOps, perWorker: results };
  }

  async run() {
    await this.runSingleThreadBenchmark(500);

    // Đo lượng CPU sử dụng trong khoảng thời gian benchmark chính
    const startCpu = process.cpuUsage();
    const startTime = performance.now();

    const singleOps = await this.runSingleThreadBenchmark(this.durationMs);
    const multi = await this.runMultiThreadBenchmark(this.durationMs);

    const elapsedMs = Math.max(1, performance.now() - startTime);
    const diff = process.cpuUsage(startCpu);
    const totalCpuUs = (diff.user || 0) + (diff.system || 0); // microseconds
    const cpuUsagePercent = (totalCpuUs / (elapsedMs * 1000 * this.cpuCores)) * 100;

    const multiOps = multi.totalOps;
    const effectiveCores = Math.max(1, multiOps / Math.max(1, singleOps));

    return {
      single: { ops: singleOps, durationMs: this.durationMs },
      multi: { ops: multiOps, durationMs: this.durationMs },
      effectiveCores,
      cpuModel: this.cpuModel,
      cpuCores: this.cpuCores,
      cpuSpeedMHz: this.cpuSpeedMHz,
      cpuUsagePercent: Number(cpuUsagePercent.toFixed(2)),
    };
  }
}

export async function runBench(options = {}) {
  const bench = new CpuBenchmark(options);
  return bench.run();
}

/**
 * Xử lý lệnh đánh giá hiệu năng CPU với cơ chế session management
 */
export async function handleBenchmarkCommand(api, message) {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const threadId = message.threadId;

  let session = benchmarkSessions.get(threadId);
  if (!session) {
    session = {
      requesters: new Map(),
      promise: null,
      timeout: null,
      imagePath: null,
      started: false,
      firstRequester: { id: senderId, name: senderName },
    };
    benchmarkSessions.set(threadId, session);
  }

  if (!session.requesters.has(senderId)) session.requesters.set(senderId, senderName);

  if (session.started && session.promise) {
    const caption = `Hiện tại bot đang thực hiện đánh giá hiệu năng CPU theo yêu cầu của ${session.firstRequester.name}. Vui lòng đợi kết quả.`;
    await sendMessageCompleteRequest(api, message, { caption: caption }, 30000);
    return;
  }

  session.started = true;
  try {
    await sendMessageCompleteRequest(
      api,
      message,
      { caption: `Vui lòng đợi bot đánh giá hiệu năng CPU...` },
      TEST_DURATION
    );

    const basePromise = createBenchmarkResultImage();
    session.promise = basePromise;

    const timedPromise = Promise.race([
      basePromise,
      new Promise((_, reject) => {
        session.timeout = setTimeout(() => reject(new Error("BENCHMARK_TIMEOUT")), BENCHMARK_TIMEOUT);
      }),
    ]);

    const imagePath = await timedPromise;
    session.imagePath = imagePath;

    let caption = `Đây là kết quả đánh giá hiệu năng CPU của bot!\n`;
    const mentions = [];
    let cursor = caption.length;
    for (const [uid, name] of session.requesters) {
      if (uid === session.firstRequester.id) continue;
      const line = `- ${name}\n`;
      mentions.push({ pos: cursor + 2, uid, len: name.length });
      caption += line;
      cursor += line.length;
    }

    await sendMessageTag(
      api,
      message,
      {
        caption,
        imagePath,
        mentions,
      },
      TIME_TO_LIVE_MESSAGE
    );
  } catch (error) {
    if (error && error.message === "BENCHMARK_TIMEOUT") {
      let caption = `Quá thời gian ${BENCHMARK_TIMEOUT / 1000} giây khi đánh giá hiệu năng CPU. Vui lòng thử lại sau.`;
      const mentions = [];
      let cursor = 0;
      caption += `\n`;
      cursor = caption.length;
      for (const [uid, name] of session.requesters) {
        const line = `- ${name}\n`;
        mentions.push({ pos: cursor + 2, uid, len: name.length });
        caption += line;
        cursor += line.length;
      }
      await sendMessageTag(api, message, { caption, mentions }, 180000);
    } else {
      console.error("Lỗi khi đánh giá hiệu năng CPU:", error);
      await sendMessageCompleteRequest(
        api,
        message,
        { caption: `Đã xảy ra lỗi khi đánh giá hiệu năng CPU. Vui lòng thử lại sau.` },
        30000
      );
    }
  } finally {
    if (session.timeout) clearTimeout(session.timeout);
    if (session.imagePath) deleteFile(session.imagePath);
    benchmarkSessions.delete(threadId);
  }
}

/**
 * Tạo ảnh kết quả benchmark với canvas
 */
export async function createBenchmarkImage(result) {
  const width = 1000;
  const height = 430;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const cpuModel = result.cpuModel;
  const searchQuery = `${cpuModel} Background Wallpaper`;
  const logoSearchQuery = `${cpuModel} logo`;

  const [backgroundImageUrls, logoImageUrls] = await Promise.all([
    searchGoogleImages(searchQuery).catch((error) => {
      console.error("Lỗi khi tìm kiếm ảnh nền:", error);
      return [];
    }),
    searchGoogleImages(logoSearchQuery).catch((error) => {
      console.error("Lỗi khi tìm kiếm logo CPU:", error);
      return [];
    }),
  ]);

  async function loadFirstAvailableBuffer(urls) {
    if (!urls || urls.length === 0) return null;
    for (const url of urls) {
      try {
        const buf = await loadImageBuffer(url);
        if (buf) return buf;
      } catch (err) {
        // console.error("Lỗi khi tải ảnh từ:", url, err);
      }
    }
    return null;
  }

  try {
    const shuffledBackgroundUrls = backgroundImageUrls && backgroundImageUrls.length ? [...backgroundImageUrls].sort(() => Math.random() - 0.5) : [];
    const backgroundBuffer = await loadFirstAvailableBuffer(shuffledBackgroundUrls);
    if (backgroundBuffer) {
      const background = await loadImage(backgroundBuffer);
      const scale = Math.max(width / background.width, height / background.height);
      const bgWidth = background.width * scale;
      const bgHeight = background.height * scale;

      ctx.drawImage(background, (width - bgWidth) / 2, (height - bgHeight) / 2, bgWidth, bgHeight);

      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(0, 0, width, height);
    } else {
      const backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
      backgroundGradient.addColorStop(0, "#1e3a8a");
      backgroundGradient.addColorStop(1, "#111827");
      ctx.fillStyle = backgroundGradient;
      ctx.fillRect(0, 0, width, height);
    }
  } catch (error) {
    console.error("Lỗi khi vẽ background:", error);
    const backgroundGradient = ctx.createLinearGradient(0, 0, 0, height);
    backgroundGradient.addColorStop(0, "#1e3a8a");
    backgroundGradient.addColorStop(1, "#111827");
    ctx.fillStyle = backgroundGradient;
    ctx.fillRect(0, 0, width, height);
  }

  let xLogo = 170;
  let widthLogo = 180;
  let heightLogo = 180;
  let yLogo = 100;

  const borderWidth = 10;
  const gradient = ctx.createLinearGradient(
    xLogo - widthLogo / 2 - borderWidth,
    yLogo - borderWidth,
    xLogo + widthLogo / 2 + borderWidth,
    yLogo + heightLogo + borderWidth
  );

  const rainbowColors = ["#FF0000", "#FF7F00", "#FFFF00", "#00FF00", "#0000FF", "#4B0082", "#9400D3"];
  const shuffledColors = [...rainbowColors].sort(() => Math.random() - 0.5);
  shuffledColors.forEach((color, index) => {
    gradient.addColorStop(index / (shuffledColors.length - 1), color);
  });

  ctx.save();
  ctx.beginPath();
  ctx.arc(xLogo, yLogo + heightLogo / 2, widthLogo / 2 + borderWidth, 0, Math.PI * 2, true);
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(xLogo, yLogo + heightLogo / 2, widthLogo / 2, 0, Math.PI * 2, true);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.restore();

  try {
    async function loadFirstLogo(urls) {
      if (!urls || urls.length === 0) return null;
      for (const url of urls) {
        try {
          const buf = await loadImageBuffer(url);
          if (buf) return buf;
        } catch (err) {
          console.error("Lỗi khi tải logo từ:", url, err);
        }
      }
      return null;
    }

    const logoBuffer = await loadFirstLogo(logoImageUrls);
    if (logoBuffer) {
      const image = await loadImage(logoBuffer);

      ctx.save();
      ctx.beginPath();
      ctx.arc(xLogo, yLogo + heightLogo / 2, widthLogo / 2, 0, Math.PI * 2, true);
      ctx.clip();

      const scale = Math.min((widthLogo * 0.8) / image.width, (heightLogo * 0.8) / image.height);
      const logoWidth = image.width * scale;
      const logoHeight = image.height * scale;

      ctx.drawImage(image, xLogo - logoWidth / 2, yLogo + heightLogo / 2 - logoHeight / 2, logoWidth, logoHeight);
      ctx.restore();
    }
  } catch (error) {
    console.error("Lỗi khi vẽ logo CPU:", error);
  }

  const dataNameLong = cv.handleNameLong(cpuModel, 20);
  ctx.font = "bold 32px Tahoma";
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  const nameY = yLogo + heightLogo + 54;
  if (dataNameLong.totalLines > 1) {
    ctx.font = "bold 24px Tahoma";
    for (let i = 0; i < dataNameLong.totalLines; i++) {
      const line = dataNameLong.lines[i];
      ctx.fillText(line, xLogo, nameY + i * 28);
    }
  } else {
    ctx.fillText(cpuModel, xLogo, nameY);
  }

  let y1 = 60;
  ctx.textAlign = "center";
  ctx.font = "bold 48px " + FONT_MAIN;
  ctx.fillStyle = cv.getRandomGradient(ctx, width);
  ctx.fillText("Kết Quả Benchmark CPU", width / 2, y1);

  const infoStartX = xLogo + widthLogo / 2 + 126;
  let y = y1 + 52;

  const fields = [
    { label: "🧩 Số Lõi CPU Hiện Có", value: `${result.cpuCores}` },
    { label: "💡 Tốc Độ CPU", value: `${result.cpuSpeedMHz}MHz` },
    { label: "💡 CPU Công Suất Test", value: `${result.cpuUsagePercent}%` },
    { label: "🧑‍💻 Đơn luồng", value: `${result.single.ops.toLocaleString("vi-VN")} ops` },
    { label: "🧑‍💻 Đa luồng", value: `${result.multi.ops.toLocaleString("vi-VN")} ops` },
    { label: "💡 Số Lõi Hiệu Quả Ước Tính", value: `${result.effectiveCores.toFixed(2)}` },
    { label: "⏱️ Thời Gian Test", value: `${result.single.durationMs}ms` },
  ];

  ctx.textAlign = "left";
  ctx.font = "bold 28px " + FONT_MAIN;
  for (const field of fields) {
    ctx.fillStyle = cv.getRandomGradient(ctx, width);
    const labelText = field.label + ":";
    const labelWidth = ctx.measureText(labelText).width;
    ctx.fillText(labelText, infoStartX, y);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(" " + field.value, infoStartX + labelWidth, y);
    y += 48;
  }

  const filePath = path.resolve(`./assets/temp/benchmark_${Date.now()}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(filePath));
    out.on("error", reject);
  });
}

async function createBenchmarkResultImage() {
  const result = await runBench();
  return await createBenchmarkImage(result);
}
