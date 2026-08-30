import schedule from "node-schedule";
import chalk from "chalk";
import { formatTime, randomIntFromInterval } from "./format-util.js";
import { isAdmin } from "../index.js";
import { getGroupAdmins, getGroupInfoData } from "../service-ngh/info-service/group-info.js";
import { sendMessageWarning } from "../service-ngh/chat-zalo/chat-style/chat-style.js";
import { connection } from "../database/index.js";
import { LRUCache } from "lru-cache";
import { rememberRecentChat } from "./recent-chat-memory.js";

/**
 * ============================================================================
 *  QUẢN LÝ LOG TIN NHẮN - LƯU TRÊN MONGODB (không giữ cache RAM lâu dài)
 * ============================================================================
 * Toàn bộ log tin nhắn được lưu vào collection `messages_log` thay vì
 * giữ trong RAM + ghi đè file message.json mỗi 30 giây như trước. Mỗi lần cần
 * đọc, code sẽ query trực tiếp MongoDB để giữ mức dùng RAM thấp.
 *
 * Giữ lại (mặc định) 24 giờ dữ liệu, có job dọn dẹp định kỳ.
 * ============================================================================
 */

export const MESSAGE_TABLE = "messages_log";
export const RETENTION_MS = 24 * 60 * 60 * 1000; // 24 giờ

let tableReady = false;
const messageLru = new LRUCache({ max: 5000, ttl: 3 * 60 * 1000 });
const threadLru = new LRUCache({ max: 100, ttl: 60 * 1000 });
const MAX_MESSAGES_PER_THREAD = Math.max(100, Number(process.env.NGH_MESSAGE_MEMORY_PER_THREAD) || 1000);
const MESSAGE_QUERY_LIMIT = Math.max(100, Number(process.env.NGH_MESSAGE_QUERY_LIMIT) || 2000);
const messageKey = (botId, threadId, msgId) => `${botId}:${threadId}:${msgId}`;
const threadKey = (botId, threadId) => `${botId}:${threadId}`;
const writeQueue = [];
const WRITE_BATCH_SIZE = Math.max(1, Number(process.env.NGH_CACHE_WRITE_BATCH_SIZE) || 200);
const WRITE_BACKLOG = Math.max(1000, Number(process.env.NGH_CACHE_WRITE_BACKLOG) || 20000);
const WRITE_FLUSH_MS = Math.max(5, Number(process.env.NGH_CACHE_WRITE_FLUSH_MS) || 15);
const WRITE_RETRY_MS = Math.max(250, Number(process.env.NGH_CACHE_WRITE_RETRY_MS) || 1000);
let writeFlushTimer = null;
let writeFlushing = false;
let persistencePausedUntil = 0;
let globalMessageCleanupJob = null;
const OVERLOAD_PAUSE_MS = Math.max(5000, Number(process.env.NGH_CACHE_OVERLOAD_PAUSE_MS) || 30000);
// Persist by default because topchat and moderation need message history after
// the short in-memory cache expires. Set the variable to "0" only when a
// deliberately stateless runtime is required.
const PERSIST_MESSAGE_CACHE = process.env.NGH_MESSAGE_CACHE_PERSIST !== "0";

function buildCacheEntry(data) {
  const msgId = data?.data?.msgId?.toString();
  if (!msgId) return null;
  return {
    msgId,
    filterData: {
      timestampString: formatTime(new Date()),
      isUndo: false,
      threadId: data.threadId,
      type: data.type,
      timestamp: data.data.ts,
      ...data.data,
    },
  };
}

function cacheMessageInMemory(idBot, data) {
  const entry = buildCacheEntry(data);
  if (!entry) return false;
  const { msgId, filterData } = entry;
  messageLru.set(messageKey(idBot, data.threadId, msgId), filterData);
  const cacheKey = threadKey(idBot, data.threadId);
  const cachedThread = threadLru.get(cacheKey) || {};
  cachedThread[msgId] = filterData;
  trimThreadCache(cachedThread);
  threadLru.set(cacheKey, cachedThread);
  rememberRecentChat(idBot, data.threadId, filterData);
  return true;
}

function trimThreadCache(cachedThread) {
  const keys = Object.keys(cachedThread);
  if (keys.length <= MAX_MESSAGES_PER_THREAD) return;
  // Trim in batches so a hot thread does not sort the object on every message.
  keys.sort((a, b) => Number(cachedThread[b]?.timestamp || cachedThread[b]?.ts || 0) -
    Number(cachedThread[a]?.timestamp || cachedThread[a]?.ts || 0));
  for (const key of keys.slice(MAX_MESSAGES_PER_THREAD)) delete cachedThread[key];
}

export function enqueueMessageCache(idBot, data, { persist = true } = {}) {
  if (!PERSIST_MESSAGE_CACHE || !persist) return cacheMessageInMemory(idBot, data);
  // Mongo pool overload must not feed itself by endlessly retrying optional
  // history writes. Keep the recent message in RAM and let interactive DB work
  // recover before persistence resumes.
  if (Date.now() < persistencePausedUntil) return cacheMessageInMemory(idBot, data);
  if (writeQueue.length >= WRITE_BACKLOG) return cacheMessageInMemory(idBot, data);
  writeQueue.push({ idBot, data });
  if (!writeFlushTimer) {
    writeFlushTimer = setTimeout(flushMessageWrites, WRITE_FLUSH_MS);
    writeFlushTimer.unref?.();
  }
  return true;
}

async function flushMessageWrites() {
  writeFlushTimer = null;
  if (writeFlushing || writeQueue.length === 0) return;
  writeFlushing = true;
  const batch = writeQueue.splice(0, WRITE_BATCH_SIZE);
  let shouldRetry = false;
  try {
    const grouped = new Map();
    for (const item of batch) {
      const key = item.idBot?.toString() ?? "";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item.data);
    }
    const results = await Promise.all(
      [...grouped].map(([botId, messages]) => updateMessageCacheBatch(botId, messages))
    );
    shouldRetry = results.some((result) => result === false);
    if (shouldRetry) writeQueue.unshift(...batch);
  } finally {
    writeFlushing = false;
    if (writeQueue.length > 0 && !writeFlushTimer) {
      writeFlushTimer = setTimeout(flushMessageWrites, shouldRetry ? WRITE_RETRY_MS : WRITE_FLUSH_MS);
      writeFlushTimer.unref?.();
    }
  }
}

async function ensureMessageTable() {
  if (tableReady) return;
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS ${MESSAGE_TABLE} (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      botId VARCHAR(64) NOT NULL,
      threadId VARCHAR(64) NOT NULL,
      msgId VARCHAR(64) NOT NULL,
      cliMsgId VARCHAR(64) DEFAULT NULL,
      msgType VARCHAR(64) DEFAULT NULL,
      uidFrom VARCHAR(64) DEFAULT NULL,
      idTo VARCHAR(64) DEFAULT NULL,
      dName VARCHAR(255) DEFAULT NULL,
      msgWrapType VARCHAR(32) DEFAULT NULL,
      ts BIGINT DEFAULT 0,
      ttl BIGINT DEFAULT 0,
      isUndo TINYINT(1) DEFAULT 0,
      timestampString VARCHAR(64) DEFAULT NULL,
      payload LONGTEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_bot_thread_msg (botId, threadId, msgId),
      KEY idx_thread_ts (botId, threadId, ts),
      KEY idx_bot_uid (botId, uidFrom),
      KEY idx_ts (ts)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  tableReady = true;
}

/**
 * Ghi 1 tin nhắn vào SQL (thay cho updateMessageCache cũ - lưu file RAM/JSON).
 * Giữ nguyên tên hàm + cách gọi để hạn chế thay đổi ở nơi gọi (index.js).
 */
export async function updateMessageCache(idBot, data) {
  return updateMessageCacheBatch(idBot, [data]);
}

export async function updateMessageCacheBatch(idBot, messages) {
  try {
    await ensureMessageTable();
    const botId = idBot?.toString() ?? "";
    const entries = messages.flatMap((data) => {
      const entry = buildCacheEntry(data);
      return entry ? [{ data, ...entry }] : [];
    });
    if (entries.length === 0) return true;

    await connection.collection(MESSAGE_TABLE).bulkWrite(entries.map(({ data, msgId, filterData }) => ({
      updateOne: {
        filter: { botId, threadId: data.threadId?.toString() ?? "", msgId },
        update: {
          $set: {
            botId,
            threadId: data.threadId?.toString() ?? "",
            msgId,
            cliMsgId: filterData.cliMsgId?.toString() ?? null,
            msgType: filterData.msgType ?? null,
            uidFrom: filterData.uidFrom?.toString() ?? null,
            idTo: filterData.idTo?.toString() ?? null,
            dName: filterData.dName ?? null,
            msgWrapType: filterData.type ?? null,
            ts: Number(filterData.timestamp) || 0,
            ttl: Number(filterData.ttl) || 0,
            isUndo: false,
            timestampString: filterData.timestampString ?? null,
            payload: JSON.stringify(filterData),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        upsert: true,
      },
    })), { ordered: false });

    for (const { data, msgId, filterData } of entries) {
      messageLru.set(messageKey(botId, data.threadId, msgId), filterData);
      const cacheKey = threadKey(botId, data.threadId);
      const cachedThread = threadLru.get(cacheKey) || {};
      cachedThread[msgId] = filterData;
      trimThreadCache(cachedThread);
      threadLru.set(cacheKey, cachedThread);
      rememberRecentChat(botId, data.threadId, filterData);
    }
    return true;
  } catch (error) {
    console.error("Lỗi khi ghi message vào SQL:", error);
    const errorText = `${error?.name || ""} ${error?.message || error}`;
    if (/wait.?queue|checking out a connection|connection pool/i.test(errorText)) {
      persistencePausedUntil = Date.now() + OVERLOAD_PAUSE_MS;
      for (const data of messages) cacheMessageInMemory(idBot, data);
      // This cache is best-effort. Treat the batch as consumed so the retry
      // loop does not keep MongoDB saturated and stall actual bot commands.
      return true;
    }
    return false;
  }
}

function rowToMessage(row) {
  const obj = JSON.parse(row.payload);
  obj.isUndo = !!row.isUndo;
  obj.ttl = row.ttl;
  return obj;
}

/**
 * Lấy toàn bộ tin nhắn (trong khoảng RETENTION_MS gần nhất) của 1 thread.
 * Trả về dạng { [msgId]: message } giống hệt cache RAM cũ để hạn chế thay đổi logic ở nơi gọi.
 */
export async function getMessageCache(idBot, threadId) {
  try {
    await ensureMessageTable();
    if (!threadId) return {};
    const cacheKey = threadKey(idBot, threadId);
    const cached = threadLru.get(cacheKey);
    if (cached) return cached;
    if (!PERSIST_MESSAGE_CACHE) return {};

    const since = Date.now() - RETENTION_MS;
    const [rows] = await connection.execute(
      `SELECT msgId, ttl, isUndo, payload FROM ${MESSAGE_TABLE}
       WHERE botId = ? AND threadId = ? AND ts >= ? ORDER BY ts DESC LIMIT ${MESSAGE_QUERY_LIMIT}`,
      [idBot?.toString() ?? "", threadId?.toString() ?? "", since]
    );

    const result = {};
    for (const row of rows) {
      result[row.msgId] = rowToMessage(row);
      messageLru.set(messageKey(idBot, threadId, row.msgId), result[row.msgId]);
    }
    trimThreadCache(result);
    threadLru.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error("Lỗi khi đọc message cache từ SQL:", error);
    return {};
  }
}

// Chỉ đọc cache RAM hiện có, không chạm database; dùng cho tác vụ cần phản hồi nhanh.
export function getRecentUserMessagesFromMemory(idBot, threadId, uid, limit = 8) {
  const cached = threadLru.get(threadKey(idBot, threadId));
  if (!cached) return [];
  return Object.values(cached)
    .filter((item) => String(item?.uidFrom) === String(uid))
    .sort((a, b) => Number(b.timestamp || b.ts || 0) - Number(a.timestamp || a.ts || 0))
    .map((item) => String(item?.content || item?.msg || "").replace(/\s+/g, " ").trim())
    .filter((text) => text && text.length <= 180 && !/^[!./#&*\\-]/.test(text))
    .slice(0, Math.max(1, Math.min(12, limit)))
    .reverse();
}

/**
 * Lấy đúng 1 tin nhắn theo threadId + msgId (nhẹ hơn getMessageCache khi chỉ cần 1 tin).
 */
export async function getMessageByThreadAndMsgId(idBot, threadId, msgId) {
  try {
    if (!threadId || !msgId) return null;
    const cacheKey = messageKey(idBot, threadId, msgId);
    const cached = messageLru.get(cacheKey);
    if (cached) return cached;
    if (!PERSIST_MESSAGE_CACHE) return null;
    await ensureMessageTable();

    const [rows] = await connection.execute(
      `SELECT ttl, isUndo, payload FROM ${MESSAGE_TABLE}
       WHERE botId = ? AND threadId = ? AND msgId = ? LIMIT 1`,
      [idBot?.toString() ?? "", threadId?.toString() ?? "", msgId?.toString() ?? ""]
    );

    if (rows.length === 0) return null;
    const message = rowToMessage(rows[0]);
    messageLru.set(cacheKey, message);
    return message;
  } catch (error) {
    console.error("Lỗi khi đọc 1 message từ SQL:", error);
    return null;
  }
}

/**
 * Đánh dấu 1 tin nhắn đã bị thu hồi (undo) - trước đây là mutate object trong RAM,
 * giờ phải ghi lại xuống SQL để không mất trạng thái.
 */
export async function markMessageUndo(idBot, threadId, msgId) {
  try {
    if (!threadId || !msgId) return;
    const cacheKey = messageKey(idBot, threadId, msgId);
    const cached = messageLru.get(cacheKey);
    if (cached) cached.isUndo = true;
    const cachedThread = threadLru.get(threadKey(idBot, threadId));
    if (cachedThread?.[msgId]) cachedThread[msgId].isUndo = true;
    if (!PERSIST_MESSAGE_CACHE) return;
    await ensureMessageTable();
    await connection.execute(
      `UPDATE ${MESSAGE_TABLE} SET isUndo = 1 WHERE botId = ? AND threadId = ? AND msgId = ?`,
      [idBot?.toString() ?? "", threadId?.toString() ?? "", msgId?.toString() ?? ""]
    );
  } catch (error) {
    console.error("Lỗi khi đánh dấu tin nhắn đã thu hồi:", error);
  }
}

/**
 * Tìm 1 uidFrom bất kỳ (không phải chính bot) từng nhắn trong bất kỳ thread nào của bot này.
 * Dùng để random 1 uid "an toàn" khi upload file (thay cho quét toàn bộ RAM cache cũ).
 */
export async function getFirstOtherSender(idBot, excludeUid) {
  try {
    if (!PERSIST_MESSAGE_CACHE) return undefined;
    await ensureMessageTable();
    const [rows] = await connection.execute(
      `SELECT uidFrom FROM ${MESSAGE_TABLE}
       WHERE botId = ? AND uidFrom IS NOT NULL AND uidFrom <> '' AND uidFrom <> ?
       ORDER BY ts DESC LIMIT 1`,
      [idBot?.toString() ?? "", excludeUid?.toString() ?? ""]
    );
    return rows.length > 0 ? rows[0].uidFrom : undefined;
  } catch (error) {
    console.error("Lỗi khi tìm uidFrom ngẫu nhiên:", error);
    return undefined;
  }
}

/**
 * Dọn dẹp tin nhắn quá hạn (> RETENTION_MS) trong SQL, xoá theo lô để tránh khoá bảng lâu.
 */
async function cleanOldMessages() {
  try {
    const since = Date.now() - RETENTION_MS;
    const BATCH = 5000;
    let affected;
    do {
      const [result] = await connection.execute(`DELETE FROM ${MESSAGE_TABLE} WHERE ts < ? LIMIT ${BATCH}`, [since]);
      affected = result.affectedRows;
    } while (affected >= BATCH);
  } catch (error) {
    console.error("Lỗi khi dọn dẹp message log cũ:", error);
  }
}

/**
 * Phát hiện bug/spam client (trùng cliMsgId nhiều lần, hoặc TTL bất thường thấp).
 * Trước đây quét toàn bộ RAM cache mỗi 5s; giờ chỉ SELECT 1 cửa sổ thời gian ngắn
 * (65 giây gần nhất) từ SQL - vẫn giữ đúng logic gốc (đếm liên tiếp trong khung thời gian)
 * nhưng không phải quét toàn bộ dữ liệu 24h nữa.
 */
async function checkBugCliMsgId(api) {
  const idBot = api.getBotId();
  const TIME_CHECK_BUG_MSG = 60 * 1000;
  const MIN_DUPLICATES_MSG = 10;
  const TIME_CHECK_BUG_TTL = 30 * 1000;
  const MIN_DUPLICATES_TTL = 3;
  const MAX_TTL = 5000;
  const WINDOW_MS = 65 * 1000;

  const since = Date.now() - WINDOW_MS;
  const [rows] = await connection.execute(
    `SELECT threadId, msgId, cliMsgId, uidFrom, ts, ttl, msgType FROM ${MESSAGE_TABLE}
     WHERE botId = ? AND ts >= ? AND (msgType = 'webchat' OR (ttl > 0 AND ttl < ?))
     ORDER BY ts`,
    [idBot?.toString() ?? "", since, MAX_TTL]
  );

  // Gom theo threadId, giữ format tương tự messageCache[threadId][msgId] cũ
  const byThread = {};
  for (const row of rows) {
    if (!byThread[row.threadId]) byThread[row.threadId] = {};
    byThread[row.threadId][row.msgId] = row;
  }

  for (const threadId in byThread) {
    const messages = byThread[threadId];

    const messageGroups = {};
    const ttlGroups = {};

    for (const msgId in messages) {
      const message = messages[msgId];
      const cliMsgId = message.cliMsgId;
      const uidFrom = message.uidFrom;
      const timestamp = message.ts;
      const msgType = message.msgType;
      const ttl = message.ttl || 0;

      if (!cliMsgId || !uidFrom || !timestamp || msgType !== "webchat") continue;

      const uniqueKey = `${uidFrom}:${cliMsgId}`;

      if (!messageGroups[uniqueKey]) {
        messageGroups[uniqueKey] = [];
      }
      messageGroups[uniqueKey].push({ msgId, timestamp, ttl });

      if (ttl > 0 && ttl < MAX_TTL) {
        if (!ttlGroups[uidFrom]) {
          ttlGroups[uidFrom] = [];
        }
        ttlGroups[uidFrom].push({ msgId, timestamp });
      }
    }

    const duplicates = {};
    for (const uniqueKey in messageGroups) {
      const group = messageGroups[uniqueKey];
      if (group.length >= MIN_DUPLICATES_MSG) {
        group.sort((a, b) => a.timestamp - b.timestamp);

        let duplicateCount = 1;
        for (let i = 0; i < group.length - 1; i++) {
          const currentMsg = group[i];
          const nextMsg = group[i + 1];

          if (nextMsg.timestamp - currentMsg.timestamp <= TIME_CHECK_BUG_MSG) {
            duplicateCount++;
            if (duplicateCount >= MIN_DUPLICATES_MSG) {
              duplicates[uniqueKey] = group.map((item) => item.msgId);
              break;
            }
          } else {
            duplicateCount = 1;
          }
        }
      }
    }

    const ttlViolations = {};
    for (const uidFrom in ttlGroups) {
      const group = ttlGroups[uidFrom];
      if (group.length >= MIN_DUPLICATES_TTL) {
        group.sort((a, b) => a.timestamp - b.timestamp);

        let ttlCount = 1;
        for (let i = 0; i < group.length - 1; i++) {
          const currentMsg = group[i];
          const nextMsg = group[i + 1];

          if (nextMsg.timestamp - currentMsg.timestamp <= TIME_CHECK_BUG_TTL) {
            ttlCount++;
            if (ttlCount >= MIN_DUPLICATES_TTL) {
              ttlViolations[uidFrom] = group.map((item) => item.msgId);
              break;
            }
          } else {
            ttlCount = 1;
          }
        }
      }
    }

    const duplicateKeys = Object.keys(duplicates);
    if (duplicateKeys.length > 0) {
      for (const uniqueKey of duplicateKeys) {
        const [uidFrom, cliMsgId] = uniqueKey.split(":");

        if (uidFrom !== idBot) {
          console.log(
            `Phát Hiện Bug (${"trùng lặp"}) -> uidFrom: ${uidFrom}, cliMsgId: ${cliMsgId}, msgType: webchat, các msgId: ${duplicates[
              uniqueKey
            ].join(", ")}`
          );
          const msgTargetId = duplicates[uniqueKey][0];
          const msgTargetRow = byThread[threadId][msgTargetId];
          const threadIdMsgDuplicate = msgTargetRow.threadId;
          const groupInfo = await getGroupInfoData(api, threadIdMsgDuplicate);
          const groupAdmins = await getGroupAdmins(groupInfo);
          const botIsAdminBox = groupAdmins.includes(idBot.toString());
          if (botIsAdminBox) {
            const targetIsAdminBox = isAdmin(api.getBotId(), uidFrom, threadIdMsgDuplicate, groupAdmins);
            if (!targetIsAdminBox) {
              const msgTargetFull = await getMessageByThreadAndMsgId(idBot, threadIdMsgDuplicate, msgTargetId);
              if (msgTargetFull) {
                msgTargetFull.data = { ...msgTargetFull };
                await sendMessageWarning(
                  api,
                  msgTargetFull,
                  `Phát hiện hành vi bất thường... tiến hành block đối tượng!!!`,
                  true,
                  86400000
                );
              }
              try {
                await api.blockUsers(threadIdMsgDuplicate, [uidFrom]);
                console.log(`Đã block user ${uidFrom} trong nhóm ${threadIdMsgDuplicate}`);
              } catch (error) {
                if (error.code === 165) {
                  console.log(`Nhóm ${threadIdMsgDuplicate} không có thành viên (code 165), bỏ qua block user ${uidFrom}`);
                } else {
                  console.error(`Lỗi khi block user ${uidFrom} trong nhóm ${threadIdMsgDuplicate}:`, error);
                }
              }
            }
          }
        }

        const random = randomIntFromInterval(1000, 9999);
        const renameOps = duplicates[uniqueKey].map((msgId, index) => {
          const newCliMsgId = `${cliMsgId}-${random}-${index + 1}`;
          return connection.execute(
            `UPDATE ${MESSAGE_TABLE} SET cliMsgId = ? WHERE botId = ? AND threadId = ? AND msgId = ?`,
            [newCliMsgId, idBot?.toString() ?? "", threadId, msgId]
          );
        });
        await Promise.all(renameOps).catch((error) => console.error("Lỗi khi cập nhật cliMsgId:", error));
      }
    }

    if (Object.keys(ttlViolations).length > 0) {
      for (const uidFrom in ttlViolations) {
        console.log(`Phát Hiện Bug (TTL thấp) -> uidFrom: ${uidFrom}, các msgId: ${ttlViolations[uidFrom].join(", ")}`);

        if (uidFrom !== idBot) {
          const msgTargetId = ttlViolations[uidFrom][0];
          const msgTargetRow = byThread[threadId][msgTargetId];
          const threadIdMsgDuplicate = msgTargetRow.threadId;
          const groupInfo = await getGroupInfoData(api, threadIdMsgDuplicate);
          const groupAdmins = await getGroupAdmins(groupInfo);
          const botIsAdminBox = groupAdmins.includes(idBot.toString());

          if (botIsAdminBox) {
            const targetIsAdminBox = isAdmin(api.getBotId(), uidFrom, threadIdMsgDuplicate, groupAdmins);
            if (!targetIsAdminBox) {
              const msgTargetFull = await getMessageByThreadAndMsgId(idBot, threadIdMsgDuplicate, msgTargetId);
              if (msgTargetFull) {
                msgTargetFull.data = { ...msgTargetFull };
                await sendMessageWarning(
                  api,
                  msgTargetFull,
                  `Phát hiện tin nhắn tự xóa bất thường... tiến hành block đối tượng!!!`,
                  true,
                  86400000
                );
              }
              try {
                await api.blockUsers(threadIdMsgDuplicate, [uidFrom]);
                console.log(`Đã block user ${uidFrom} trong nhóm ${threadIdMsgDuplicate}`);
              } catch (error) {
                if (error.code === 165) {
                  console.log(`Nhóm ${threadIdMsgDuplicate} không có thành viên (code 165), bỏ qua block user ${uidFrom}`);
                } else {
                  console.error(`Lỗi khi block user ${uidFrom} trong nhóm ${threadIdMsgDuplicate}:`, error);
                }
              }
            }
          }
        }

        const ttlOps = ttlViolations[uidFrom].map((msgId) =>
          connection.execute(`UPDATE ${MESSAGE_TABLE} SET ttl = -1 WHERE botId = ? AND threadId = ? AND msgId = ?`, [
            idBot?.toString() ?? "",
            threadId,
            msgId,
          ])
        );
        await Promise.all(ttlOps).catch((error) => console.error("Lỗi khi cập nhật ttl:", error));
      }
    }
  }
}

export async function initializeCacheMessageService(api) {
  const botId = api.getBotId();
  await ensureMessageTable();

  // Bảng dùng chung cho mọi bot: chỉ cần một job cleanup, không đăng ký lại
  // theo từng account rồi cùng quét DB tại đúng một thời điểm.
  if (!globalMessageCleanupJob) {
    globalMessageCleanupJob = schedule.scheduleJob("*/10 * * * *", async () => {
      await cleanOldMessages();
    });
  }

  // Scanner này phục vụ moderation log nhóm. Khi group log tắt, chạy SELECT
  // mỗi 30 giây cho từng bot chỉ làm nghẽn Mongo mà không có dữ liệu để xử lý.
  if (process.env.NGH_MESSAGE_BUG_SCAN === "1") {
    api.apiInstance.schedule.jobCheckBugCliMsgId = schedule.scheduleJob("*/30 * * * * *", async () => {
      try {
        await checkBugCliMsgId(api);
      } catch (error) {
        console.error(chalk.red("Lỗi nghiêm trọng trong job checkBugCliMsgId:"), error);
      }
    });
  }

  console.log(chalk.magentaBright(`[${botId}] Khởi động service quản lý message log (MongoDB) hoàn tất`));
}
