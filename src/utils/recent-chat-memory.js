import { LRUCache } from "lru-cache";
import { connection } from "../database/state.js";

const RECENT_CHAT_USERS = Math.max(250, Number(process.env.NGH_RECENT_CHAT_USERS) || 1500);
const RECENT_CHAT_TTL_MS = Math.max(5 * 60_000, Number(process.env.NGH_RECENT_CHAT_TTL_MS) || 2 * 60 * 60_000);
const RECENT_CHAT_PER_USER = Math.max(5, Number(process.env.NGH_RECENT_CHAT_PER_USER) || 20);
const users = new LRUCache({ max: RECENT_CHAT_USERS, ttl: RECENT_CHAT_TTL_MS });

const keyOf = (botId, threadId, uid) => `${botId}:${threadId}:${uid}`;

function primitiveText(value) {
  if (value == null) return "";
  if (!["string", "number", "bigint", "boolean"].includes(typeof value)) return "";
  try {
    return String(value);
  } catch {
    return "";
  }
}

function safeTimestamp(message) {
  const value = message?.timestamp ?? message?.ts;
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") {
    return Date.now();
  }
  try {
    const timestamp = Number(value);
    return Number.isFinite(timestamp) ? timestamp : Date.now();
  } catch {
    return Date.now();
  }
}

export function rememberRecentChat(botId, threadId, message) {
  const uid = primitiveText(message?.uidFrom);
  const content = primitiveText(message?.content ?? message?.msg).replace(/\s+/g, " ").trim();
  if (!uid || !content || content.length > 180 || /^[!./#&*\\-]/.test(content)) return;
  const key = keyOf(botId, threadId, uid);
  const list = users.get(key) || [];
  list.push({ content, time: safeTimestamp(message) });
  if (list.length > RECENT_CHAT_PER_USER) list.splice(0, list.length - RECENT_CHAT_PER_USER);
  users.set(key, list);
}

export function readRecentUserChats(botId, threadId, uid, limit = 8) {
  const list = users.get(keyOf(botId, threadId, uid)) || [];
  return list
    .slice(-Math.max(1, Math.min(RECENT_CHAT_PER_USER, limit)))
    .map((item) => item.content);
}

export async function readRecentUserChatsWithHistory(botId, threadId, uid, limit = 25) {
  const memory = readRecentUserChats(botId, threadId, uid, limit);
  if (memory.length >= Math.min(5, limit) || !connection) return memory;
  try {
    const safeLimit = Math.max(1, Math.min(40, Number(limit) || 25));
    const [rows] = await connection.execute(
      `SELECT payload FROM messages_log
       WHERE botId = ? AND threadId = ? AND uidFrom = ? AND isUndo = 0
       ORDER BY ts DESC LIMIT ${safeLimit}`,
      [String(botId), String(threadId), String(uid)]
    );
    const history = rows
      .map((row) => {
        try {
          const item = JSON.parse(row.payload);
          return String(item?.content || item?.msg || "").replace(/\s+/g, " ").trim();
        } catch {
          return "";
        }
      })
      .filter((text) => text && text.length <= 180 && !/^[!./#&*\\-]/.test(text))
      .reverse();
    return history.length ? history : memory;
  } catch {
    return memory;
  }
}
