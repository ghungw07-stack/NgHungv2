import { createCanvas } from "canvas";
import gtts from "gtts";
import { randomInt } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { connection } from "../../database/state.js";
import { sendMessageFromSQL, sendMessageFromSQLImage } from "../chat-zalo/chat-style/chat-style.js";
import { uploadAudioFile } from "../chat-zalo/chat-special/send-voice/process-audio.js";
import { getCurrentPrivateGameServer } from "./private-game-server.js";

export const GAME_CAPTCHA_WINDOW_MS = 30_000;
export const GAME_CAPTCHA_ACTION_LIMIT = 7;
export const GAME_CAPTCHA_BYPASS_LIMIT = 4;
export const GAME_CAPTCHA_TTL_MS = 10 * 60_000;
export const GAME_CAPTCHA_LOCK_MS = 30 * 60_000;

const COLLECTION = "game_captcha_challenges";
const actionWindows = new Map();
// Một UID chỉ cần được nhớ trong cửa sổ 30 giây. Dọn theo lô để không tạo
// một timer riêng cho mỗi người chơi và không giữ UID mãi trong RAM.
const actionWindowCleanup = setInterval(() => {
  const cutoff = Date.now() - GAME_CAPTCHA_WINDOW_MS;
  for (const [playerId, timestamps] of actionWindows) {
    if (timestamps[timestamps.length - 1] < cutoff) actionWindows.delete(playerId);
  }
}, GAME_CAPTCHA_WINDOW_MS);
actionWindowCleanup.unref?.();

function sendStyled(api, message, text, success = false, ttl = 60_000) {
  return sendMessageFromSQL(api, message, { success, message: text }, false, ttl);
}

function canonicalPlayerId(id) {
  const normalized = String(id || "").replace(/_0$/u, "");
  const cache = globalThis.__nghPlayerAliasCache;
  const privateServer = getCurrentPrivateGameServer();
  if (privateServer?.serverId) {
    const prefix = `private:${privateServer.serverId}:`;
    if (normalized.startsWith(prefix)) return normalized;
    const scopedId = `${prefix}${normalized}`;
    return cache?.get?.(scopedId) || scopedId;
  }
  return cache?.get?.(normalized) || normalized;
}

function waitText(milliseconds) {
  const minutes = Math.max(1, Math.ceil(milliseconds / 60_000));
  return `${minutes} phút`;
}

export function nextGameCaptchaWindow(timestamps, now = Date.now()) {
  const recent = timestamps.filter((time) => now - time < GAME_CAPTCHA_WINDOW_MS);
  recent.push(now);
  return { timestamps: recent, triggered: recent.length > GAME_CAPTCHA_ACTION_LIMIT };
}

export function createGameCaptchaImage(existingAnswer = "") {
  const answer = /^\d{6}$/u.test(existingAnswer)
    ? existingAnswer
    : Array.from({ length: 6 }, () => String(randomInt(10))).join("");
  const canvas = createCanvas(480, 220);
  const ctx = canvas.getContext("2d");
  const colors = ["#111827", "#c0262d", "#1456c0", "#087f5b", "#7e22ce"];

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 480, 220);
  ctx.fillStyle = "#222222";
  ctx.font = "bold 22px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Nhập 6 số để tiếp tục chơi game", 240, 34);
  ctx.font = "16px sans-serif";
  ctx.fillText("Không thấy ảnh? Gửi: mã", 240, 59);

  for (let index = 0; index < 32; index++) {
    ctx.strokeStyle = colors[randomInt(colors.length)];
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.moveTo(randomInt(480), randomInt(75, 215));
    ctx.lineTo(randomInt(480), randomInt(75, 215));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  [...answer].forEach((digit, index) => {
    ctx.save();
    ctx.translate(48 + index * 76, 163 + randomInt(-12, 13));
    ctx.rotate(randomInt(-13, 14) * Math.PI / 180);
    ctx.font = "bold 62px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = colors[randomInt(colors.length)];
    ctx.fillText(digit, 0, 0);
    ctx.restore();
  });

  return { answer, image: canvas.toBuffer("image/png") };
}

async function sendChallenge(api, message, image) {
  const directory = await mkdtemp(path.join(tmpdir(), "game-captcha-"));
  const imagePath = path.join(directory, "captcha.png");
  try {
    await writeFile(imagePath, image);
    const sent = await sendMessageFromSQLImage(api, message, {
      success: false,
      message: "🛡️ CAPTCHA GAME\nBạn thao tác game quá nhanh. Nhập 6 số trong ảnh để tiếp tục.\nKhông thấy ảnh? Gửi: mã\nSpam thêm 4 lệnh game khi chưa giải sẽ bị khóa game 30 phút.",
    }, false, imagePath, GAME_CAPTCHA_TTL_MS, true);
    if (!sent) throw new Error("Zalo không gửi được ảnh captcha");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function createVoice(answer, api, message) {
  const names = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
  const text = `Mã xác minh game là: ${[...answer].map((digit) => names[Number(digit)]).join(", ")}.`;
  const directory = await mkdtemp(path.join(tmpdir(), "game-captcha-voice-"));
  const audioPath = path.join(directory, "captcha.mp3");
  try {
    await new Promise((resolve, reject) => new gtts(text, "vi").save(audioPath, (error) => error ? reject(error) : resolve()));
    const voiceUrl = await uploadAudioFile(audioPath, api, message);
    await api.sendVoice(message, voiceUrl, GAME_CAPTCHA_TTL_MS);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function collection() {
  return connection.collection(COLLECTION);
}

export async function enforceGameCaptcha(api, message, now = Date.now()) {
  if (message.__gameCaptchaCountedAt && now - message.__gameCaptchaCountedAt < 2_000) {
    delete message.__gameCaptchaCountedAt;
    return true;
  }
  const precheck = message.__gameCaptchaPrecheck;
  const precheckedPlayerId = precheck && now - precheck.at < 2_000 ? precheck.playerId : null;
  const playerId = precheckedPlayerId || canonicalPlayerId(message.data?.uidFrom);
  if (!playerId) return true;

  const challenges = collection();
  if (!precheckedPlayerId && !(await guardGameCaptcha(api, message, now))) return false;
  const record = precheckedPlayerId ? null : await challenges.findOne({ playerId });
  if (record) await challenges.deleteOne({ playerId });
  delete message.__gameCaptchaPrecheck;

  const window = nextGameCaptchaWindow(actionWindows.get(playerId) || [], now);
  actionWindows.set(playerId, window.timestamps);
  if (!window.triggered) {
    message.__gameCaptchaCountedAt = now;
    return true;
  }

  const challenge = createGameCaptchaImage();
  const challengeUntil = new Date(now + GAME_CAPTCHA_TTL_MS);
  await challenges.updateOne(
    { playerId },
    { $set: { playerId, answer: challenge.answer, challengeUntil, expiresAt: challengeUntil, attempts: 0, gameAttempts: 0, updatedAt: new Date(now) } },
    { upsert: true }
  );
  actionWindows.delete(playerId);
  try {
    await sendChallenge(api, message, challenge.image);
    return false;
  } catch (error) {
    await challenges.deleteOne({ playerId });
    console.error("Không gửi được captcha game:", error);
    return true;
  }
}

export async function guardGameCaptcha(api, message, now = Date.now()) {
  const playerId = canonicalPlayerId(message.data?.uidFrom);
  if (!playerId) return true;
  const challenges = collection();
  const record = await challenges.findOne({ playerId });
  if (record?.lockedUntil && new Date(record.lockedUntil).getTime() > now) {
    await sendStyled(api, message, `🔒 Tài khoản game đang bị khóa do bỏ qua captcha. Thử lại sau ${waitText(new Date(record.lockedUntil).getTime() - now)}.`);
    return false;
  }

  if (record?.answer && new Date(record.challengeUntil).getTime() > now) {
    const gameAttempts = Math.max(0, Number(record.gameAttempts) || 0) + 1;
    if (gameAttempts < GAME_CAPTCHA_BYPASS_LIMIT) {
      await challenges.updateOne({ playerId }, { $set: { gameAttempts, updatedAt: new Date(now) } });
      await sendStyled(api, message, "Xác thực captcha để chơi tiếp\nGửi mã để xem lại captcha");
      return false;
    }
    const lockedUntil = new Date(now + GAME_CAPTCHA_LOCK_MS);
    await challenges.updateOne({ playerId }, { $set: { lockedUntil, expiresAt: lockedUntil, answer: null, challengeUntil: null, gameAttempts, updatedAt: new Date(now) } });
    actionWindows.delete(playerId);
    await sendStyled(api, message, `🔒 Bạn tiếp tục dùng lệnh game khi chưa giải captcha. Tài khoản bị khóa game ${waitText(GAME_CAPTCHA_LOCK_MS)}.`);
    return false;
  }

  if (record) await challenges.deleteOne({ playerId });
  message.__gameCaptchaPrecheck = { playerId, at: now };
  return true;
}

export async function handleGameCaptchaMessage(api, message, now = Date.now()) {
  const content = typeof message.data?.content === "string" ? message.data.content.trim().toLowerCase() : "";
  const wantsHelp = /^(?:mã|ma|voice|captcha)$/iu.test(content);
  const isAnswer = /^\d{6}$/u.test(content);
  if (!wantsHelp && !isAnswer) return false;

  const playerId = canonicalPlayerId(message.data?.uidFrom);
  if (!playerId || !connection) return false;
  const challenges = collection();
  const record = await challenges.findOne({ playerId });
  if (!record) return false;

  const lockedUntil = record.lockedUntil ? new Date(record.lockedUntil).getTime() : 0;
  if (lockedUntil > now) {
    await sendStyled(api, message, `🔒 Tài khoản game còn bị khóa ${waitText(lockedUntil - now)}.`);
    return true;
  }
  if (!record.answer || new Date(record.challengeUntil).getTime() <= now) {
    await challenges.deleteOne({ playerId });
    return false;
  }

  if (wantsHelp) {
    let imageSent = false;
    let voiceSent = false;
    try {
      await sendChallenge(api, message, createGameCaptchaImage(record.answer).image);
      imageSent = true;
    } catch (error) {
      console.error("Không gửi lại được ảnh captcha game:", error);
    }
    try {
      await createVoice(record.answer, api, message);
      voiceSent = true;
    } catch (error) {
      console.error("Không gửi được voice captcha game:", error);
    }
    if (!imageSent && !voiceSent) await sendStyled(api, message, "Không gửi lại được captcha lúc này. Hãy thử gửi `mã` lại.");
    else if (!imageSent) await sendStyled(api, message, "🔊 Đã gửi voice captcha; ảnh đang lỗi tải.", true);
    else if (!voiceSent) await sendStyled(api, message, "🖼️ Đã gửi lại ảnh captcha; voice đang lỗi tạo.", true);
    return true;
  }

  if (content === record.answer) {
    await challenges.deleteOne({ playerId });
    actionWindows.delete(playerId);
    await sendStyled(api, message, "✅ Giải captcha thành công. Bạn có thể tiếp tục chơi game.", true);
    return true;
  }

  await challenges.updateOne({ playerId }, { $inc: { attempts: 1 }, $set: { updatedAt: new Date(now) } });
  await sendStyled(api, message, "❌ Sai captcha. Nhập lại 6 số trong ảnh hoặc gửi `mã` để nghe voice.");
  return true;
}
