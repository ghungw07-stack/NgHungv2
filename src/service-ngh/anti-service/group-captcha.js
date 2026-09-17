import { createCanvas } from "canvas";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomInt } from "node:crypto";
import { MessageType } from "../../api-zalo/models/Message.js";
import { GroupEventType } from "../../api-zalo/models/GroupEventType.js";

export const CAPTCHA_TIMEOUT = 5 * 60 * 1000;
const busy = new WeakSet();
const uid = (member) => String(member?.id ?? member);
const displayName = (value) => typeof value === "string" ? value.trim() : "";
const tell = (api, threadId, userId, name, text, attachments = []) => {
  const tag = `@${displayName(name) || "Thành viên"}`;
  return api.sendMessage({
    msg: `${tag} ${text}`,
    attachments,
    mentions: [{ uid: userId, pos: 0, len: tag.length }],
  }, threadId, MessageType.GroupMessage);
};

export function createCaptchaImage() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz";
  const letters = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]);
  const positions = new Set();
  while (positions.size < 2) positions.add(randomInt(letters.length));
  const palette = [
    { name: "ĐEN", hex: "#000000" },
    { name: "ĐỎ", hex: "#d92727" },
    { name: "XANH DƯƠNG", hex: "#1665dc" },
    { name: "XANH LÁ", hex: "#15803d" },
    { name: "TÍM", hex: "#9333c7" },
  ];
  const targetColor = palette[randomInt(palette.length)];
  const colors = palette.filter(color => color !== targetColor);
  const canvas = createCanvas(480, 220);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 480, 220);
  ctx.fillStyle = "#222222";
  ctx.font = "bold 22px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`Nhập ký tự màu ${targetColor.name}`, 240, 32);
  ctx.font = "16px sans-serif";
  ctx.fillText("Theo thứ tự từ trái sang phải", 240, 57);
  for (let i = 0; i < 30; i++) {
    ctx.strokeStyle = "#e5e9f0";
    ctx.beginPath();
    ctx.moveTo(randomInt(480), randomInt(75, 210));
    ctx.lineTo(randomInt(480), randomInt(75, 210));
    ctx.stroke();
  }
  letters.forEach((letter, i) => {
    ctx.save();
    ctx.translate(45 + i * 76, 155 + randomInt(-12, 13));
    ctx.rotate(randomInt(-12, 13) * Math.PI / 180);
    ctx.font = "bold 58px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = positions.has(i) ? targetColor.hex : colors[randomInt(colors.length)].hex;
    ctx.fillText(letter, 0, 0);
    ctx.restore();
  });
  return { answer: letters.filter((_, i) => positions.has(i)).join(""), image: canvas.toBuffer("image/png") };
}

export async function handleCaptchaEvent(api, event, store, now = Date.now()) {
  const config = store.getByID(api.getBotId())[event.threadId];
  if (!config?.captcha) return;
  const pending = config.captchaPending ||= {};
  const members = event.data?.updateMembers || [];
  if ([GroupEventType.LEAVE, GroupEventType.REMOVE_MEMBER, GroupEventType.BLOCK_MEMBER].includes(event.type)) {
    for (const member of members) delete pending[uid(member)];
    if (members.some(member => uid(member) === String(api.getBotId()))) config.captchaPending = {};
    store.setChanged();
    return;
  }
  if (event.type !== GroupEventType.JOIN) return;
  for (const member of members) {
    const userId = uid(member);
    if (userId === String(api.getBotId()) || pending[userId]) continue;
    const challenge = createCaptchaImage();
    const record = { name: displayName(member?.dName) || displayName(member?.displayName) || displayName(member?.name), answer: challenge.answer, attempts: 0, deadline: now + CAPTCHA_TIMEOUT };
    pending[userId] = record;
    store.setChanged();
    let directory;
    try {
      directory = await mkdtemp(path.join(tmpdir(), "group-captcha-"));
      const imagePath = path.join(directory, "captcha.png");
      await writeFile(imagePath, challenge.image);
      await tell(api, event.threadId, userId, record.name,
        "vui lòng xác nhận captcha trong 5 phút", [imagePath]);
    } catch (error) {
      // Không phạt thành viên nếu bot không gửi được yêu cầu xác minh.
      if (pending[userId] === record) delete pending[userId];
      store.setChanged();
      console.error("Không gửi được captcha:", error);
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true });
    }
  }
  await store.save();
}

async function blockPending(api, threadId, userId, config, record, store) {
  if (busy.has(record) || !config.captcha || config.captchaPending?.[userId] !== record) return;
  busy.add(record);
  try {
    const result = await api.blockUsers(threadId, [userId]);
    if (result?.errorMembers?.length) throw new Error("Zalo từ chối chặn thành viên captcha");
    if (config.captchaPending?.[userId] === record) delete config.captchaPending[userId];
    store.setChanged();
    await store.save();
    await api.sendMessage({
      msg: `${displayName(record.name) || "Thành viên"} đã bị chặn khỏi nhóm do ${record.attempts >= 4 ? "nhập sai captcha 4 lần" : "không xác minh captcha trong 5 phút"}.`,
    }, threadId, MessageType.GroupMessage);
  } catch (error) {
    console.error(`[captcha] Không thể xử lý ${userId} tại ${threadId}:`, error);
    // Giữ bản ghi để tác vụ định kỳ thử lại nếu API chặn lỗi.
  } finally {
    busy.delete(record);
  }
}

export async function handleCaptchaMessage(api, message, store, now = Date.now()) {
  const config = store.getByID(api.getBotId())[message.threadId];
  const userId = String(message.data?.uidFrom);
  const record = config?.captcha && config.captchaPending?.[userId];
  if (!record) return false;
  const senderName = displayName(message.data?.dName);
  if (senderName && senderName !== record.name) {
    record.name = senderName;
    store.setChanged();
  }
  const answer = typeof message.data?.content === "string" ? message.data.content.trim().toLowerCase() : "";
  const expired = now >= record.deadline || record.attempts >= 4;
  if (!expired && !busy.has(record) && answer === record.answer) {
    delete config.captchaPending[userId];
    store.setChanged();
    await store.save();
    await tell(api, message.threadId, userId, record.name, "✅ Xác minh captcha thành công!");
    return true;
  }

  // Ghi nhận đáp án trước khi gọi API để tin đến đồng thời không vượt lượt thử.
  const wrongAnswer = Boolean(answer) && !expired && !busy.has(record);
  if (wrongAnswer) {
    record.attempts++;
    store.setChanged();
  }
  // Cả ảnh, sticker, voice và lệnh đều bị xóa khi chưa xác minh.
  try {
    await api.deleteMessage(message, false);
  } catch (error) {
    console.error(`[captcha] Không xóa được tin nhắn của ${userId} tại ${message.threadId}:`, error);
  }
  if (wrongAnswer) await store.save();
  if (!config.captcha || config.captchaPending?.[userId] !== record) return true;
  if (expired || record.attempts >= 4) {
    await blockPending(api, message.threadId, userId, config, record, store);
  } else if (wrongAnswer) {
    await tell(api, message.threadId, userId, record.name, `Sai captcha! Bạn còn ${4 - record.attempts} lần thử.`);
  }
  return true;
}

export async function processCaptchaTimeouts(api, store, now = Date.now()) {
  for (const [threadId, config] of Object.entries(store.getByID(api.getBotId()))) {
    if (!config?.captcha) continue;
    for (const [userId, record] of Object.entries(config.captchaPending || {})) {
      if (now >= record.deadline || record.attempts >= 4) {
        await blockPending(api, threadId, userId, config, record, store);
      }
    }
  }
}
