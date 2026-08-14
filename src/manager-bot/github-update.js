import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PROJECT_DIR = process.cwd();
const PUSH_PATHS = [
  ".gitignore",
  ".nvmrc",
  "README.md",
  "bot.js",
  "ecosystem.config.cjs",
  "package.json",
  "public",
  "read-logs.js",
  "run.bat",
  "src",
  "test",
  "assets/fonts",
  "assets/resources",
];
const NEVER_PUSH_PATHS = [
  "assets/config.json",
  "assets/data",
  "assets/json-data",
  "assets/temp",
  "assets/resources/duoihinhbatchu/checkpoint-dhbc.json",
  "src/commands/send-all/hung-marriages.json",
];

let updateInProgress = false;

async function git(args, options = {}) {
  return execFileAsync("git", args, {
    cwd: PROJECT_DIR,
    timeout: 120_000,
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });
}

async function clearOurStaging() {
  await git(["restore", "--staged", "--", ...PUSH_PATHS]).catch(() => {});
}

async function runTests() {
  const entries = await fs.readdir(path.join(PROJECT_DIR, "test"), { withFileTypes: true });
  const tests = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.js") && !entry.name.startsWith("v2-"))
    .map((entry) => path.join("test", entry.name));
  if (tests.length === 0) return;
  await execFileAsync(process.execPath, ["--test", ...tests], {
    cwd: PROJECT_DIR,
    timeout: 180_000,
    maxBuffer: 10 * 1024 * 1024,
  });
}

function containsSecret(diff) {
  const addedLines = diff
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .join("\n");
  return [
    /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,
    /\bgh[opsu]_[A-Za-z0-9_]{20,}\b/,
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
    /\bAIza[0-9A-Za-z_-]{30,}\b/,
    /\bsk-[A-Za-z0-9_-]{20,}\b/,
  ].some((pattern) => pattern.test(addedLines));
}

function cleanCommitMessage(input) {
  const text = String(input || "").replace(/[\r\n\0]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return text || `Update bot ${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`;
}

export async function updateSourceOnGithub(commitNote) {
  if (updateInProgress) {
    return { ok: false, message: "Đang có một lần cập nhật GitHub khác chạy, thử lại sau." };
  }

  updateInProgress = true;
  let committed = false;
  try {
    await git(["rev-parse", "--is-inside-work-tree"]);

    const stagedBefore = await git(["diff", "--cached", "--name-only"]);
    if (stagedBefore.stdout.trim()) {
      return { ok: false, message: "Git đang có file được stage thủ công. Hãy commit hoặc bỏ stage trước khi dùng lệnh." };
    }

    await git(["fetch", "origin", "main"]);
    const divergence = await git(["rev-list", "--left-right", "--count", "origin/main...HEAD"]);
    const [remoteAhead] = divergence.stdout.trim().split(/\s+/).map(Number);
    if (remoteAhead > 0) {
      return { ok: false, message: "GitHub đang có code mới hơn máy bot. Hãy pull code trước rồi mới cập nhật." };
    }

    await runTests();
    await git(["add", "-A", "--", ...PUSH_PATHS]);
    await git(["restore", "--staged", "--", ...NEVER_PUSH_PATHS]).catch(() => {});

    const stagedFiles = await git(["diff", "--cached", "--name-only"]);
    const files = stagedFiles.stdout.trim().split("\n").filter(Boolean);
    if (files.length === 0) {
      return { ok: true, message: "Không có thay đổi source nào cần đưa lên GitHub." };
    }

    const stagedDiff = await git(["diff", "--cached", "--no-ext-diff", "--unified=0"]);
    if (containsSecret(stagedDiff.stdout)) {
      await clearOurStaging();
      return { ok: false, message: "Đã chặn cập nhật vì phát hiện key/secret trong phần code mới." };
    }

    await git(["commit", "-m", cleanCommitMessage(commitNote)]);
    committed = true;
    await git(["push", "origin", "HEAD:main"]);
    const hash = await git(["rev-parse", "--short", "HEAD"]);
    return {
      ok: true,
      message: `Đã cập nhật GitHub thành công.\nCommit: ${hash.stdout.trim()}\nSố file: ${files.length}`,
    };
  } catch (error) {
    if (!committed) await clearOurStaging();
    const detail = String(error?.stderr || error?.message || error).trim().split("\n").slice(-1)[0];
    return {
      ok: false,
      message: committed
        ? `Đã tạo commit nhưng push GitHub thất bại: ${detail}`
        : `Không thể cập nhật GitHub: ${detail}`,
    };
  } finally {
    updateInProgress = false;
  }
}
