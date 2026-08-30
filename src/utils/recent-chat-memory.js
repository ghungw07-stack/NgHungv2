import { LRUCache } from "lru-cache";
import { connection } from "../database/state.js";

const users = new LRUCache({ max: 5000, ttl: 24 * 60 * 60 * 1000 });

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
  if (list.length > 40) list.splice(0, list.length - 40);
  users.set(key, list);
}

export function readRecentUserChats(botId, threadId, uid, limit = 8) {
  const list = users.get(keyOf(botId, threadId, uid)) || [];
  return list
    .slice(-Math.max(1, Math.min(40, limit)))
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
