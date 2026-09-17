const USER_WINDOW_MS = 1500;
const USER_MAX = 2;
const THREAD_WINDOW_MS = 1000;
const THREAD_MAX = 8;
const BOT_WINDOW_MS = 1000;
const BOT_MAX = 30;
const IDLE_TTL_MS = 10 * 60 * 1000;

const buckets = new Map();

function getRecent(key, now, windowMs) {
  const recent = (buckets.get(key) || []).filter((time) => now - time < windowMs);
  buckets.set(key, recent);
  return recent;
}

export function allowGameRequest(botId, threadId, userId, now = Date.now()) {
  if (botId == null || threadId == null || userId == null) return false;

  const bot = String(botId);
  const thread = `${bot}:${threadId}`;
  const user = `${thread}:${userId}`;

  const userRequests = getRecent(`game:user:${user}`, now, USER_WINDOW_MS);
  const threadRequests = getRecent(`game:thread:${thread}`, now, THREAD_WINDOW_MS);
  const botRequests = getRecent(`game:bot:${bot}`, now, BOT_WINDOW_MS);
  if (userRequests.length >= USER_MAX || threadRequests.length >= THREAD_MAX || botRequests.length >= BOT_MAX) {
    return false;
  }

  userRequests.push(now);
  threadRequests.push(now);
  botRequests.push(now);
  return true;
}

export function resetGameAdmission() {
  buckets.clear();
}

setInterval(() => {
  const cutoff = Date.now() - IDLE_TTL_MS;
  for (const [key, times] of buckets) {
    if ((times.at(-1) || 0) < cutoff) buckets.delete(key);
  }
}, IDLE_TTL_MS).unref?.();
