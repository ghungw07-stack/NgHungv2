import path from "node:path";
import { spawn } from "node:child_process";
import { Semaphore } from "../../core/semaphore.js";

const CONTENT_EXTENSIONS = new Map([
  ["image/jpeg", ".jpg"], ["image/png", ".png"], ["image/webp", ".webp"], ["image/gif", ".gif"],
  ["video/mp4", ".mp4"], ["audio/mpeg", ".mp3"], ["audio/mp4", ".m4a"], ["application/pdf", ".pdf"],
]);

export class MediaService {
  constructor({ http, tempFiles, concurrency = 2 }) {
    this.http = http;
    this.tempFiles = tempFiles;
    this.semaphore = new Semaphore(concurrency, 20);
  }
  extension(url, contentType = "") {
    const fromType = CONTENT_EXTENSIONS.get(contentType.split(";")[0].trim().toLowerCase());
    if (fromType) return fromType;
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : ".bin";
  }
  async sendUrl({ client, threadId, type, url, caption = "" }) {
    return this.semaphore.run(async () => {
      // Tải vào .tmp trước, sau đó đổi tên theo Content-Type để API Zalo nhận đúng loại.
      const initial = this.tempFiles.path(".tmp");
      let finalPath = initial;
      try {
        const downloaded = await this.http.download(url, initial);
        const extension = this.extension(url, downloaded.contentType);
        if (extension !== ".tmp") {
          finalPath = initial.slice(0, -4) + extension;
          await import("node:fs/promises").then((fs) => fs.rename(initial, finalPath));
        }
        return await client.api.sendMessage({ msg: caption, attachments: [finalPath] }, threadId, type);
      } finally {
        await this.tempFiles.remove(finalPath).catch(() => {});
        if (finalPath !== initial) await this.tempFiles.remove(initial).catch(() => {});
      }
    });
  }

  async extractAudio({ client, threadId, type, url }) {
    return this.semaphore.run(async () => {
      const input = this.tempFiles.path(".input");
      const output = this.tempFiles.path(".mp3");
      try {
        await this.http.download(url, input, { maxBytes: 25 * 1024 * 1024, timeoutMs: 25_000 });
        await this.runFfmpeg([
          "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", input,
          "-vn", "-map_metadata", "-1", "-ac", "2", "-ar", "44100", "-b:a", "128k", output,
        ]);
        return await client.api.sendMessage({ msg: "", attachments: [output] }, threadId, type);
      } finally {
        await Promise.all([this.tempFiles.remove(input).catch(() => {}), this.tempFiles.remove(output).catch(() => {})]);
      }
    });
  }

  async convert({ client, threadId, type, url, format }) {
    const profiles = {
      mp3: ["-vn", "-map_metadata", "-1", "-b:a", "128k"],
      mp4: ["-map_metadata", "-1", "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-c:a", "aac", "-movflags", "+faststart"],
      webm: ["-map_metadata", "-1", "-c:v", "libvpx-vp9", "-deadline", "realtime", "-crf", "38", "-b:v", "0", "-c:a", "libopus"],
    };
    if (!profiles[format]) throw new Error("Định dạng đầu ra không được hỗ trợ");
    return this.semaphore.run(async () => {
      const input = this.tempFiles.path(".input"); const output = this.tempFiles.path(`.${format}`);
      try {
        await this.http.download(url, input, { maxBytes: 25 * 1024 * 1024, timeoutMs: 25_000 });
        await this.runFfmpeg(["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", input, ...profiles[format], output], { timeoutMs: 60_000 });
        return await client.api.sendMessage({ msg: `Đã chuyển đổi sang ${format.toUpperCase()}.`, attachments: [output] }, threadId, type);
      } finally {
        await Promise.all([this.tempFiles.remove(input).catch(() => {}), this.tempFiles.remove(output).catch(() => {})]);
      }
    });
  }

  runFfmpeg(args, { timeoutMs = 45_000 } = {}) {
    return new Promise((resolve, reject) => {
      const process = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
      let errorOutput = "";
      process.stderr.on("data", (chunk) => { errorOutput = (errorOutput + chunk).slice(-2_000); });
      const timeout = setTimeout(() => {
        process.kill("SIGKILL");
        reject(new Error("FFmpeg vượt quá thời gian xử lý"));
      }, timeoutMs);
      timeout.unref?.();
      process.once("error", (error) => { clearTimeout(timeout); reject(error); });
      process.once("exit", (code, signal) => {
        clearTimeout(timeout);
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg thất bại (${signal || code}): ${errorOutput || "không có chi tiết"}`));
      });
    });
  }
}
