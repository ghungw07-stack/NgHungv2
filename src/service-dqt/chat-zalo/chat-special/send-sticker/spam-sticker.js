import chalk from "chalk";
import { sendMessageComplete, sendMessageWarning } from "../../chat-style/chat-style.js";
import { dataSticker } from "./main-sticker.js";

const spamStickerIntervals = new Map();
const spamDelays = new Map();
const DEFAULT_DELAY = 1000; 

/**
 * Kiểm tra quyền admin
 */
function checkAdminPermission(api, message, action, isAdmin) {
  if (!isAdmin) {
    sendMessageWarning(api, message, `Chỉ có admin mới được phép sử dụng lệnh ${action}!`, false);
    return false;
  }
  return true;
}

/**
 * Parse delay từ string thành milliseconds
 * @param {string} delayStr - Chuỗi delay (ví dụ: "1s", "0.5s", "1mls", "1p", "1h")
 * @returns {number|null} - Delay tính bằng milliseconds, null nếu không hợp lệ
 */
function parseDelay(delayStr) {
  if (!delayStr || typeof delayStr !== "string") return null;

  const trimmed = delayStr.trim().toLowerCase();
  
  const match = trimmed.match(/^([\d.]+)\s*(mls|ms|s|p|h)$/);
  if (!match) return null;

  const value = parseFloat(match[1]);
  const unit = match[2];

  if (isNaN(value) || value < 0) return null;

  const multipliers = {
    mls: 1,        // 1 mili giây
    ms: 1,         // 1 mili giây (alias)
    s: 1000,       // 1 giây = 1000ms
    p: 60 * 1000, // 1 phút = 60000ms
    h: 60 * 60 * 1000, // 1 giờ = 3600000ms
  };

  const multiplier = multipliers[unit];
  if (!multiplier) return null;

  return Math.round(value * multiplier);
}

/**
 * Format delay từ milliseconds thành string dễ đọc
 * @param {number} delayMs - Delay tính bằng milliseconds
 * @returns {string} - String format (ví dụ: "1s", "500ms", "1.5p")
 */
function formatDelay(delayMs) {
  if (delayMs < 1000) {
    return `${delayMs}ms`;
  } else if (delayMs < 60 * 1000) {
    const seconds = delayMs / 1000;
    return seconds % 1 === 0 ? `${seconds}s` : `${seconds.toFixed(1)}s`;
  } else if (delayMs < 60 * 60 * 1000) {
    const minutes = delayMs / (60 * 1000);
    return minutes % 1 === 0 ? `${minutes}p` : `${minutes.toFixed(1)}p`;
  } else {
    const hours = delayMs / (60 * 60 * 1000);
    return hours % 1 === 0 ? `${hours}h` : `${hours.toFixed(1)}h`;
  }
}

/**
 * Xử lý lệnh spam sticker (bắt đầu spam)
 * @param {Object} api - API instance
 * @param {Object} message - Message object
 * @param {string} cmdPrefix - Command prefix
 * @param {boolean} isAdminUser - Is user admin
 */
export async function handleSpamStickerCommand(api, message, cmdPrefix, isAdminUser) {
  if (!checkAdminPermission(api, message, "spam", isAdminUser)) return;

  const threadId = message.threadId;
  const botId = api.getBotId();
  const spamKey = `${botId}_${threadId}`;

  if (spamStickerIntervals.has(spamKey)) {
    await sendMessageWarning(
      api,
      message,
      "Đã có spam sticker đang chạy! Gửi lệnh 'stop' để dừng trước khi bắt đầu spam mới.",
      false
    );
    return;
  }

  await startSpamSticker(api, message, spamKey, threadId, cmdPrefix);
}

/**
 * Xử lý lệnh set delay cho spam sticker
 * @param {Object} api - API instance
 * @param {Object} message - Message object
 * @param {string} delayStr - Chuỗi delay (ví dụ: "1s", "0.5s", "1mls", "1p", "1h")
 * @param {string} cmdPrefix - Command prefix
 * @param {boolean} isAdminUser - Is user admin
 */
export async function handleSetDelayCommand(api, message, delayStr, cmdPrefix, isAdminUser) {
  if (!checkAdminPermission(api, message, "setdelay", isAdminUser)) return;

  const threadId = message.threadId;
  const botId = api.getBotId();
  const spamKey = `${botId}_${threadId}`;

  if (!delayStr || !delayStr.trim()) {
    const currentDelay = spamDelays.get(spamKey) || DEFAULT_DELAY;
    await sendMessageComplete(
      api,
      message,
      `⏱️ Delay hiện tại: ${formatDelay(currentDelay)}\n\n` +
        `Cách sử dụng: ${cmdPrefix} setdelay|[thời gian]\n` +
        `Ví dụ:\n` +
        `- ${cmdPrefix} setdelay|1mls (1 mili giây)\n` +
        `- ${cmdPrefix} setdelay|0.5s (0.5 giây)\n` +
        `- ${cmdPrefix} setdelay|1s (1 giây)\n` +
        `- ${cmdPrefix} setdelay|1p (1 phút)\n` +
        `- ${cmdPrefix} setdelay|1h (1 giờ)`,
      false
    );
    return;
  }

  const delayMs = parseDelay(delayStr.trim());
  if (delayMs === null) {
    await sendMessageWarning(
      api,
      message,
      `Định dạng delay không hợp lệ!\n\n` +
        `Ví dụ hợp lệ:\n` +
        `- ${cmdPrefix} setdelay|1mls (1 mili giây)\n` +
        `- ${cmdPrefix} setdelay|0.5s (0.5 giây)\n` +
        `- ${cmdPrefix} setdelay|1s (1 giây)\n` +
        `- ${cmdPrefix} setdelay|1p (1 phút)\n` +
        `- ${cmdPrefix} setdelay|1h (1 giờ)`,
      false
    );
    return;
  }

  spamDelays.set(spamKey, delayMs);
  
  await sendMessageComplete(
    api,
    message,
    `✅ Đã set delay: ${formatDelay(delayMs)}\n` +
      `Delay này sẽ được áp dụng cho lần spam tiếp theo.`,
    false
  );
}

async function startSpamSticker(api, message, spamKey, threadId, cmdPrefix) {
  const stickerIds = [21980, 21981, 21982, 21983, 21975, 21977, 21979, 23339, 48233, 48235 ];
  let currentIndex = 0;
  
  const delay = spamDelays.get(spamKey) || DEFAULT_DELAY;

  await sendMessageComplete(
    api,
    message,
    `🚀 Bắt đầu spam sticker\n` +
      `⏱️ Delay: ${formatDelay(delay)}\n` +
      `${cmdPrefix} setdelay|[thời gian]: Set delay cho spam (ví dụ: 1mls, 0.5s, 1s, 1p, 1h)\n` +
      `Gửi lệnh '${cmdPrefix} stop' để dừng spam.`,
    false
  );

  const spamInterval = setInterval(async () => {
    try {
      const stickerId = stickerIds[currentIndex];

      const dataStickerStore = dataSticker.getById(stickerId);
      if (!dataStickerStore) {
        currentIndex = (currentIndex + 1) % stickerIds.length;
        return;
      }

      await api.sendSticker(
        {
          id: dataStickerStore.id,
          cateId: dataStickerStore.cateId,
          type: dataStickerStore.type,
        },
        threadId,
        message.type
      );

      currentIndex = (currentIndex + 1) % stickerIds.length;
    } catch (error) {
      console.error(chalk.red(`Lỗi khi spam sticker:`, error));
      currentIndex = (currentIndex + 1) % stickerIds.length;
    }
  }, delay);

  spamStickerIntervals.set(spamKey, spamInterval);

}

async function stopSpamSticker(api, message, spamKey, threadId) {
  const interval = spamStickerIntervals.get(spamKey);
  if (interval) {
    clearInterval(interval);
    spamStickerIntervals.delete(spamKey);
    await sendMessageComplete(api, message, "✅ Đã dừng spam sticker!", false);
  } else {
    await sendMessageWarning(api, message, "Không có spam sticker nào đang chạy!", false);
  }
}

export async function handleStopSpamCommand(api, message, cmdPrefix) {
  const threadId = message.threadId;
  const botId = api.getBotId();
  const spamKey = `${botId}_${threadId}`;

  if (!spamStickerIntervals.has(spamKey)) {
    await sendMessageWarning(api, message, "Không có spam sticker nào đang chạy!", false);
    return;
  }

  await stopSpamSticker(api, message, spamKey, threadId);
}


