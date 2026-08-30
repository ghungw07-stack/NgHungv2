export const DEFAULT_EXPIRED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function shouldPurgeExpiredBot(botData, now = Date.now(), retentionMs = DEFAULT_EXPIRED_RETENTION_MS) {
  if (!botData || Number(botData.timeRemaining) > 0 || botData.timeRemaining === -1) return false;
  const expiredAt = Number(botData.expiredAt);
  return Number.isFinite(expiredAt) && expiredAt > 0 && now - expiredAt >= retentionMs;
}

export function clearExpiredRetention(botData) {
  if (botData) delete botData.expiredAt;
  return botData;
}
