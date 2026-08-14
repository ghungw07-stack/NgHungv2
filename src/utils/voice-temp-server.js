import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import os from "os";
import path from "path";

const voiceDir = path.join(os.tmpdir(), "ngh-voice-temp");
const entries = new Map();
// Zalo thường fetch và re-host voice ngay sau khi gửi; 30 phút đủ cho retry
// nhưng tránh giữ các file nhạc dài trên VPS quá lâu.
const TTL_MS = 30 * 60 * 1000;

export async function registerVoiceTempFile(sourcePath) {
  await cleanupExpiredVoiceFiles();
  await fsp.mkdir(voiceDir, { recursive: true });
  const token = crypto.randomBytes(18).toString("hex");
  const ext = path.extname(sourcePath).toLowerCase() || ".aac";
  const targetPath = path.join(voiceDir, `${token}${ext}`);
  await fsp.copyFile(sourcePath, targetPath);
  const expiresAt = Date.now() + TTL_MS;
  entries.set(token, { path: targetPath, expiresAt });
  setTimeout(() => removeVoiceTempFile(token), TTL_MS).unref();
  return token;
}

async function cleanupExpiredVoiceFiles() {
  const now = Date.now();
  await Promise.all(
    [...entries].filter(([, entry]) => entry.expiresAt <= now).map(([token]) => removeVoiceTempFile(token))
  );
  const names = await fsp.readdir(voiceDir).catch(() => []);
  await Promise.all(names.map(async (name) => {
    const filePath = path.join(voiceDir, name);
    const stat = await fsp.stat(filePath).catch(() => null);
    if (stat && now - stat.mtimeMs > TTL_MS) await fsp.rm(filePath, { force: true }).catch(() => {});
  }));
}

export function getVoiceTempFile(token) {
  const entry = entries.get(String(token || ""));
  if (!entry || entry.expiresAt <= Date.now()) {
    void removeVoiceTempFile(token);
    return null;
  }
  return entry;
}

export async function removeVoiceTempFile(token) {
  const key = String(token || "");
  const entry = entries.get(key);
  entries.delete(key);
  if (entry) await fsp.rm(entry.path, { force: true }).catch(() => {});
}

export function streamVoiceTempFile(entry, response) {
  const stream = fs.createReadStream(entry.path);
  stream.on("error", () => response.destroy());
  stream.pipe(response);
}
