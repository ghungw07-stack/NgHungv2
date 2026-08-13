import { spawn } from "node:child_process";

const SOURCE_PATHS = [
  ":(glob)src/**/*.js", ":(glob)src/**/*.mjs", ":(glob)src/**/*.cjs",
  ":(glob)src/**/*.html", ":(glob)src/**/*.css",
  "src-v2", "test", "package.json", "package-lock.json", "README.md",
];

function run(command, args, { cwd, timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (chunk) => { stdout = (stdout + chunk).slice(-20_000); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-20_000); });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${command} thất bại (${signal || code}): ${(stderr || stdout).trim().slice(-1000)}`));
    });
  });
}

export class SourceUpdateService {
  #running = false;
  constructor({ rootDir, logger }) { Object.assign(this, { rootDir, logger }); }

  async push(message) {
    if (this.#running) return { ok: false, message: "Một lượt cập nhật khác đang chạy." };
    this.#running = true;
    try {
      await run("npm", ["test"], { cwd: this.rootDir, timeoutMs: 180_000 });
      await run("git", ["add", "--", ...SOURCE_PATHS], { cwd: this.rootDir });
      try {
        await run("git", ["diff", "--cached", "--quiet", "--", ...SOURCE_PATHS], { cwd: this.rootDir });
        return { ok: true, message: "Không có thay đổi source để cập nhật." };
      } catch (error) {
        if (!error.message.includes("(1)")) throw error;
      }
      const safeMessage = String(message || "Cập nhật code từ NGH Bot").replace(/[\r\n\0]/g, " ").trim().slice(0, 120);
      await run("git", ["commit", "-m", safeMessage, "--", ...SOURCE_PATHS], { cwd: this.rootDir });
      const output = await run("git", ["push", "origin", "HEAD"], { cwd: this.rootDir, timeoutMs: 180_000 });
      this.logger.info("Leader đã cập nhật source lên GitHub");
      return { ok: true, message: `Đã cập nhật code lên GitHub.${output ? `\n${output}` : ""}` };
    } catch (error) {
      this.logger.error("Tự cập nhật GitHub thất bại", { error: error.message });
      return { ok: false, message: error.message };
    } finally {
      this.#running = false;
    }
  }
}
