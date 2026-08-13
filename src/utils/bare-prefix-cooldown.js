export const BARE_PREFIX_COOLDOWN_MS = 15_000;

const lastBarePrefixUsage = new Map();
const MAX_TRACKED_USERS = 10_000;

function cleanupExpiredEntries(now) {
  for (const [key, lastUsage] of lastBarePrefixUsage.entries()) {
    if (now - lastUsage >= BARE_PREFIX_COOLDOWN_MS) lastBarePrefixUsage.delete(key);
  }
}

/**
 * Chỉ giới hạn tin nhắn chứa đúng prefix, không áp dụng cho lệnh có nội dung.
 * Lần đầu được xử lý; các lần tiếp theo trong 15 giây bị bỏ qua.
 */
export function canUseBarePrefix(botId, userId, now = Date.now()) {
  if (botId == null || userId == null) return true;

  const key = `${String(botId)}:${String(userId)}`;
  const lastUsage = lastBarePrefixUsage.get(key);
  if (lastUsage !== undefined && now - lastUsage < BARE_PREFIX_COOLDOWN_MS) return false;

  if (lastBarePrefixUsage.size >= MAX_TRACKED_USERS) cleanupExpiredEntries(now);
  lastBarePrefixUsage.set(key, now);
  return true;
}

export function resetBarePrefixCooldown() {
  lastBarePrefixUsage.clear();
}
