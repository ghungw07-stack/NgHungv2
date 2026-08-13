import path from "node:path";
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
}
