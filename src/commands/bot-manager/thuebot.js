import schedule from "node-schedule";
import { isAdmin } from "../../index.js";
import { groupSettingsAll } from "../../automations/event-send-msg.js";
import { parseTime, removeMention } from "../../utils/format-util.js";
import { sendMessageWarning } from "../../service-ngh/chat-zalo/chat-style/chat-style.js";

const jobs = new Map();

function rentalKey(botId, threadId) {
  return `${String(botId)}:${String(threadId)}`;
}

function clearRentalJob(botId, threadId) {
  const key = rentalKey(botId, threadId);
  const job = jobs.get(key);
  if (job) job.cancel();
  jobs.delete(key);
}

async function saveSettings() {
  groupSettingsAll.setChanged();
  await groupSettingsAll.save();
}

export function isRentalAdmin(botId, userId, threadId) {
  if (!botId || !userId || !threadId) return false;
  const setting = groupSettingsAll.getByID(botId)?.[threadId];
  const rental = setting?.rentalBot;
  return Boolean(
    rental &&
      String(rental.userId) === String(userId) &&
      Number(rental.expiresAt) > Date.now()
  );
}

export function scheduleRentalExpiry(api, threadId, rental) {
  const botId = api.getBotId();
  clearRentalJob(botId, threadId);
  if (!rental || !Number.isFinite(Number(rental.expiresAt))) return;
  const job = schedule.scheduleJob(new Date(Number(rental.expiresAt)), async () => {
    try {
      await api.leaveGroup(threadId, true);
    } catch (error) {
      console.error(`[thuebot] Không thể tự out nhóm ${threadId}:`, error?.message || error);
    } finally {
      const setting = groupSettingsAll.getByID(botId)?.[threadId];
      if (setting?.rentalBot && String(setting.rentalBot.expiresAt) === String(rental.expiresAt)) {
        delete setting.rentalBot;
        await saveSettings();
      }
      jobs.delete(rentalKey(botId, threadId));
    }
  });
  jobs.set(rentalKey(botId, threadId), job);
}

export async function handleThueBotCommand(api, message, groupSettings) {
  const senderId = String(message.data?.uidFrom || "");
  const mainBotId = String(api.apiManager?.idBotMainWithBot || "");
  const isMainAccount = api.apiManager?.isMainBot === true || senderId === mainBotId;
  if (!isMainAccount || !isAdmin(api.getBotId(), senderId)) {
    await sendMessageWarning(api, message, "Chỉ mainbot mới được sử dụng lệnh thuebot!", false, 30000);
    return;
  }
  if (!message.threadId || message.type !== 1) {
    await sendMessageWarning(api, message, "Lệnh này chỉ dùng trong nhóm!", false, 30000);
    return;
  }

  const mention = message.data?.mentions?.[0];
  const durationText = removeMention(message).replace(/^\s+|\s+$/gu, "").split(/\s+/u).at(-1) || "";
  const durationMs = parseTime(durationText, 0);
  if (!mention?.uid || !durationText || !Number.isFinite(durationMs) || durationMs <= 0) {
    await sendMessageWarning(api, message, "Dùng: thuebot @người_thuê <thời gian> (ví dụ: thuebot @A 7d)", false, 30000);
    return;
  }

  const targetId = String(mention.uid);
  const targetName = String(mention.name || mention.dName || targetId).replace(/^@+/u, "");
  const setting = groupSettings[message.threadId] || (groupSettings[message.threadId] = {});
  const rental = {
    userId: targetId,
    userName: targetName,
    expiresAt: Date.now() + durationMs,
    createdBy: senderId,
    botId: String(api.getBotId()),
  };
  setting.rentalBot = rental;
  await saveSettings();
  scheduleRentalExpiry(api, message.threadId, rental);
  const notice = `✅ Đã cho thuê bot cho @${targetName} trong ${durationText}. Hết hạn bot sẽ tự rời nhóm.`;
  const mentionText = `@${targetName}`;
  await api.sendMessage(
    {
      msg: notice,
      mentions: [{ uid: targetId, pos: notice.indexOf(mentionText), len: mentionText.length }],
      quote: message,
      ttl: 60000,
    },
    message.threadId,
    message.type
  );
}
