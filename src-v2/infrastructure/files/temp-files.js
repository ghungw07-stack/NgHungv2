import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export class TempFiles {
  constructor({ rootDir, maxAgeMs = 30 * 60_000, logger }) {
    this.directory = path.join(rootDir, "assets", "temp-v2");
    this.maxAgeMs = maxAgeMs;
    this.logger = logger;
  }
  async start() { await fs.mkdir(this.directory, { recursive: true }); await this.cleanup(); }
  path(extension = ".tmp") {
    const safe = /^\.[a-z0-9]{1,8}$/i.test(extension) ? extension : ".tmp";
    return path.join(this.directory, `${Date.now()}-${crypto.randomUUID()}${safe}`);
  }
  async remove(file) {
    const resolved = path.resolve(file);
    if (!resolved.startsWith(path.resolve(this.directory) + path.sep)) throw new Error("Từ chối xóa file ngoài temp-v2");
    await fs.unlink(resolved).catch((error) => { if (error.code !== "ENOENT") throw error; });
  }
  async cleanup(now = Date.now()) {
    const entries = await fs.readdir(this.directory, { withFileTypes: true }).catch(() => []);
    let removed = 0;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const file = path.join(this.directory, entry.name);
      const stat = await fs.stat(file).catch(() => null);
      if (stat && now - stat.mtimeMs > this.maxAgeMs) { await this.remove(file); removed++; }
    }
    if (removed) this.logger?.info("Đã dọn file media tạm", { removed });
    return removed;
  }
  async stop() { await this.cleanup(Date.now() + this.maxAgeMs + 1); }
}
