import schedule from "node-schedule";
import chalk from "chalk";
import { formatTime, randomIntFromInterval } from "./format-util.js";
import { isAdmin } from "../index.js";
import { getGroupAdmins, getGroupInfoData } from "../service-ngh/info-service/group-info.js";
import { sendMessageWarning } from "../service-ngh/chat-zalo/chat-style/chat-style.js";
import { connection } from "../database/index.js";
import { LRUCache } from "lru-cache";

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
const messageKey = (botId, threadId, msgId) => `${botId}:${threadId}:${msgId}`;
const threadKey = (botId, threadId) => `${botId}:${threadId}`;

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
  try {
    await ensureMessageTable();

    const timestamp = formatTime(new Date());
    const filterData = {
      timestampString: timestamp,
      isUndo: false,
      threadId: data.threadId,
      type: data.type,
      timestamp: data.data.ts,
      ...data.data,
    };

    const msgId = data.data.msgId?.toString();
    if (!msgId) return;

    const payload = JSON.stringify(filterData);

    await connection.execute(
      `INSERT INTO ${MESSAGE_TABLE}
        (botId, threadId, msgId, cliMsgId, msgType, uidFrom, idTo, dName, msgWrapType, ts, ttl, isUndo, timestampString, payload)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
        cliMsgId=VALUES(cliMsgId), msgType=VALUES(msgType), uidFrom=VALUES(uidFrom), idTo=VALUES(idTo),
        dName=VALUES(dName), msgWrapType=VALUES(msgWrapType), ts=VALUES(ts), ttl=VALUES(ttl),
        isUndo=VALUES(isUndo), timestampString=VALUES(timestampString), payload=VALUES(payload)`,
      [
        idBot?.toString() ?? "",
        data.threadId?.toString() ?? "",
        msgId,
        filterData.cliMsgId?.toString() ?? null,
        filterData.msgType ?? null,
        filterData.uidFrom?.toString() ?? null,
        filterData.idTo?.toString() ?? null,
        filterData.dName ?? null,
        filterData.type ?? null,
        Number(filterData.timestamp) || 0,
        Number(filterData.ttl) || 0,
        0,
        filterData.timestampString ?? null,
        payload,
      ]
    );
    messageLru.set(messageKey(idBot, data.threadId, msgId), filterData);
    const cachedThread = threadLru.get(threadKey(idBot, data.threadId));
    if (cachedThread) cachedThread[msgId] = filterData;
  } catch (error) {
    console.error("Lỗi khi ghi message vào SQL:", error);
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

    const since = Date.now() - RETENTION_MS;
    const [rows] = await connection.execute(
      `SELECT msgId, ttl, isUndo, payload FROM ${MESSAGE_TABLE}
       WHERE botId = ? AND threadId = ? AND ts >= ?`,
      [idBot?.toString() ?? "", threadId?.toString() ?? "", since]
    );

    const result = {};
    for (const row of rows) {
      result[row.msgId] = rowToMessage(row);
      messageLru.set(messageKey(idBot, threadId, row.msgId), result[row.msgId]);
    }
    threadLru.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error("Lỗi khi đọc message cache từ SQL:", error);
    return {};
  }
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
    await ensureMessageTable();
    await connection.execute(
      `UPDATE ${MESSAGE_TABLE} SET isUndo = 1 WHERE botId = ? AND threadId = ? AND msgId = ?`,
      [idBot?.toString() ?? "", threadId?.toString() ?? "", msgId?.toString() ?? ""]
    );
    const cacheKey = messageKey(idBot, threadId, msgId);
    const cached = messageLru.get(cacheKey);
    if (cached) cached.isUndo = true;
    const cachedThread = threadLru.get(threadKey(idBot, threadId));
    if (cachedThread?.[msgId]) cachedThread[msgId].isUndo = true;
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

  const jobCleanOldMessages = schedule.scheduleJob("*/10 * * * *", async () => {
    await cleanOldMessages();
  });

  const jobCheckBugCliMsgId = schedule.scheduleJob("*/30 * * * * *", async () => {
    try {
      await checkBugCliMsgId(api);
    } catch (error) {
      console.error(chalk.red("Lỗi nghiêm trọng trong job checkBugCliMsgId:"), error);
    }
  });

  api.apiInstance.schedule.jobCleanOldMessages = jobCleanOldMessages;
  api.apiInstance.schedule.jobCheckBugCliMsgId = jobCheckBugCliMsgId;

  console.log(chalk.magentaBright(`[${botId}] Khởi động service quản lý message log (MongoDB) hoàn tất`));
}
