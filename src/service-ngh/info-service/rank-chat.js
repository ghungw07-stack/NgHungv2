import schedule from "node-schedule";
import path from "path";
import fs from "node:fs";
import { MessageType } from "zlbotngh";
import { RANK_LIEN_QUAN_RESOURCE_PATH_GLOBAL, rankInfoJsonPath } from "../../utils/io-json.js";
import { removeMention } from "../../utils/format-util.js";
import { getGlobalPrefix } from "../service.js";
import { getMessageCache } from "../../utils/message-cache.js";
import { sendMessageFromSQL } from "../chat-zalo/chat-style/chat-style.js";
import { deleteFile, readFileSync } from "../../utils/util.js";
import { gameTypeCaro } from "../game-service/mini-game/caro-game/index.js";
import { createRankLeaderboard, createRankLeaderboardTotal, createPersonalRankCard, createPersonalRankCardTotal, calculateRank, getRankText } from "../../utils/canvas/rank-leaderboard.js";
import { getUserInfoBasic } from "./user-info.js";


let rankInfoCache = {};
let hasChanges = {};
let lastDailyStatsPruneAt = {};
const rankUserIndexes = new Map();
const rankJournalSeq = new Map();
const rankJournalWriters = new Map();

const TIME_TO_LIVE = 86400000;
const TOP_USERS_LIMIT = 10;
const DAILY_STATS_KEEP_DAYS = 45;
const LOW_INTERACTION_RESET_MS = 15 * 24 * 60 * 60 * 1000;
const VN_TIME_ZONE = "Asia/Ho_Chi_Minh";
const VN_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: VN_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
let cachedCurrentDateKey = "";
let cachedCurrentDateKeyUntil = 0;
// A flush every 50 ms made each active account issue up to 20 append syscalls
// per second. With several accounts on the same disk this created enough I/O
// contention to delay the websocket listener, even though every append was
// asynchronous. Keep the immediate batch-size flush for bursts, but coalesce
// normal chat traffic into one append per second. At most one second of rank
// counters can be lost on an unclean process/host crash; graceful checkpoints
// and high-volume traffic still flush sooner.
const JOURNAL_FLUSH_MS = Math.max(100, Number(process.env.NGH_RANK_JOURNAL_FLUSH_MS) || 1000);
const JOURNAL_BATCH_SIZE = Math.max(10, Number(process.env.NGH_RANK_JOURNAL_BATCH_SIZE) || 500);
const RANK_MESSAGES = {
  NO_DATA: "Chưa có dữ liệu xếp hạng cho nhóm này.",
  HEADER: "🏆 Bảng xếp hạng tương tác top 10:\n\n",
  TODAY_HINT: (prefix) => `\nDùng ${prefix}topchat today để xem tương tác trong hôm nay!`,
};

const rankStar = {
  dong: {
    img: path.join(RANK_LIEN_QUAN_RESOURCE_PATH_GLOBAL, "dong.png"),
    name: "Đồng",
    maxStarInLevel: 3,
    maxLevel: 3,
  },
  bac: {
    img: path.join(RANK_LIEN_QUAN_RESOURCE_PATH_GLOBAL, "bac.png"),
    name: "Bạc",
    maxStarInLevel: 4,
    maxLevel: 3,
  },
  vang: {
    img: path.join(RANK_LIEN_QUAN_RESOURCE_PATH_GLOBAL, "vang.png"),
    name: "Vàng",
    maxStarInLevel: 4,
    maxLevel: 4,
  },
  "bach-kim": {
    img: path.join(RANK_LIEN_QUAN_RESOURCE_PATH_GLOBAL, "bachkim.png"),
    name: "Bạch Kim",
    maxStarInLevel: 5,
    maxLevel: 5,
  },
  "kim-cuong": {
    img: path.join(RANK_LIEN_QUAN_RESOURCE_PATH_GLOBAL, "kimcuong.png"),
    name: "Kim Cương",
    maxStarInLevel: 5,
    maxLevel: 5,
  },
  "tinh-anh": {
    img: path.join(RANK_LIEN_QUAN_RESOURCE_PATH_GLOBAL, "tinhanh.png"),
    name: "Tinh Anh",
    maxStarInLevel: 5,
    maxLevel: 5,
  },
  "cao-thu": {
    title: [
      { name: "Cao Thủ", img: path.join(RANK_LIEN_QUAN_RESOURCE_PATH_GLOBAL, "caothu.png"), belowLevel: 10 },
      { name: "Đại Cao Thủ IV", img: path.join(RANK_LIEN_QUAN_RESOURCE_PATH_GLOBAL, "daicaothu_4.png"), belowLevel: 20 },
      { name: "Đại Cao Thủ III", img: path.join(RANK_LIEN_QUAN_RESOURCE_PATH_GLOBAL, "daicaothu_3.png"), belowLevel: 30 },
      { name: "Đại Cao Thủ II", img: path.join(RANK_LIEN_QUAN_RESOURCE_PATH_GLOBAL, "daicaothu_2.png"), belowLevel: 40 },
      { name: "Đại Cao Thủ I", img: path.join(RANK_LIEN_QUAN_RESOURCE_PATH_GLOBAL, "daicaothu_1.png"), belowLevel: 50 },
      { name: "Chiến Tướng", img: path.join(RANK_LIEN_QUAN_RESOURCE_PATH_GLOBAL, "chientuong.png"), belowLevel: 100 },
      { name: "Chiến Thần", img: path.join(RANK_LIEN_QUAN_RESOURCE_PATH_GLOBAL, "chienthan.png"), belowLevel: 1000 },
      { name: "Thách Đấu I", img: path.join(RANK_LIEN_QUAN_RESOURCE_PATH_GLOBAL, "thachdau_1.png"), belowLevel: 10000 },
      { name: "Thách Đấu II", img: path.join(RANK_LIEN_QUAN_RESOURCE_PATH_GLOBAL, "thachdau_2.png"), belowLevel: 999999 },
    ],
  },
};


function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * Trả về key ngày dạng YYYY-MM-DD theo giờ Việt Nam
 * @param {Date} date
 * @returns {string}
 */
function getDateKeyVN(date = new Date()) {
  const now = Date.now();
  const isCurrentTime = Math.abs(date.getTime() - now) < 1000;
  if (isCurrentTime && now < cachedCurrentDateKeyUntil) return cachedCurrentDateKey;
  const parts = VN_DATE_FORMATTER.formatToParts(date);
  const year = parts.find((p) => p.type === "year").value;
  const month = parts.find((p) => p.type === "month").value;
  const day = parts.find((p) => p.type === "day").value;
  const key = `${year}-${month}-${day}`;
  if (isCurrentTime) {
    cachedCurrentDateKey = key;
    cachedCurrentDateKeyUntil = now + 60_000;
  }
  return key;
}

/**
 * Lấy danh sách các key ngày (YYYY-MM-DD) trong tuần hiện tại (Thứ 2 -> Chủ nhật) theo giờ VN
 * @param {Date} date
 * @returns {string[]}
 */
function getWeekDateKeys(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year").value);
  const month = Number(parts.find((p) => p.type === "month").value);
  const day = Number(parts.find((p) => p.type === "day").value);

  const anchor = new Date(Date.UTC(year, month - 1, day));
  const dow = anchor.getUTCDay(); // 0 = CN, 1 = T2, ...
  const diffToMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(anchor);
  monday.setUTCDate(anchor.getUTCDate() - diffToMonday);

  const keys = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    keys.push(`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`);
  }
  return keys;
}

/**
 * Lấy danh sách các key ngày (YYYY-MM-DD) trong tháng hiện tại theo giờ VN
 * @param {Date} date
 * @returns {string[]}
 */
function getMonthDateKeys(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year").value);
  const month = Number(parts.find((p) => p.type === "month").value);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const keys = [];
  for (let i = 1; i <= daysInMonth; i++) {
    keys.push(`${year}-${pad2(month)}-${pad2(i)}`);
  }
  return keys;
}

/**
 * Xóa dữ liệu thống kê theo ngày đã quá cũ để tránh phình file
 * @param {Object} groupData - rankInfo.groups[groupId]
 */
function pruneDailyStats(groupData) {
  if (!groupData || !groupData.dailyStats) return;
  const cutoff = Date.now() - DAILY_STATS_KEEP_DAYS * 24 * 60 * 60 * 1000;
  for (const key of Object.keys(groupData.dailyStats)) {
    const t = new Date(`${key}T00:00:00Z`).getTime();
    if (!isNaN(t) && t < cutoff) {
      delete groupData.dailyStats[key];
    }
  }
}

/**
 * Gộp thống kê tương tác theo danh sách các key ngày cho một nhóm
 * @param {string} idBot
 * @param {string} groupId
 * @param {string[]} dateKeys
 * @returns {Array} Danh sách user kèm messageCount đã gộp
 */
export function getStatsForDateKeys(idBot, groupId, dateKeys) {
  const rankInfo = getRankInfoCache(idBot);
  const dailyStats = rankInfo.groups[groupId]?.dailyStats || {};
  const aggregate = {};

  for (const key of dateKeys) {
    const dayBucket = dailyStats[key];
    if (!dayBucket) continue;
    for (const [uid, info] of Object.entries(dayBucket)) {
      if (!aggregate[uid]) {
        aggregate[uid] = { id: uid, name: info.name, messageCount: 0 };
      }
      aggregate[uid].messageCount += info.count;
      aggregate[uid].name = info.name;
    }
  }

  return Object.values(aggregate);
}

/**
 * Lấy số tin nhắn trong chu kỳ lọc ít tương tác (tự xoay vòng mỗi 15 ngày).
 */
export function getLowInteractionStats(idBot, groupId) {
  const rankInfo = getRankInfoCache(idBot);
  const groupData = rankInfo.groups[groupId] || (rankInfo.groups[groupId] = { users: [] });
  const now = Date.now();
  let resetAt = Number(groupData.lowInteractionResetAt);
  if (!resetAt) {
    resetAt = now - LOW_INTERACTION_RESET_MS;
    groupData.lowInteractionResetAt = resetAt;
    setHasChange(idBot);
  }

  if (now - resetAt >= LOW_INTERACTION_RESET_MS) {
    resetAt = now;
    groupData.lowInteractionResetAt = resetAt;
    setHasChange(idBot);
  }

  const resetDateStr = new Date(resetAt).toLocaleDateString("en-CA", { timeZone: VN_TIME_ZONE });

  const counts = {};
  for (const [dateKey, dayBucket] of Object.entries(groupData.dailyStats || {})) {
    if (dateKey < resetDateStr) continue;
    for (const [uid, info] of Object.entries(dayBucket || {})) {
      counts[uid] = (counts[uid] || 0) + (Number(info.count) || 0);
    }
  }
  return { resetAt, counts };
}

/** Reset thủ công chu kỳ lọc ít tương tác cho một nhóm. */
export function resetLowInteractionStats(idBot, groupId) {
  const rankInfo = getRankInfoCache(idBot);
  if (!rankInfo.groups[groupId]) rankInfo.groups[groupId] = { users: [] };
  rankInfo.groups[groupId].lowInteractionResetAt = Date.now();
  setHasChange(idBot);
  return rankInfo.groups[groupId].lowInteractionResetAt;
}

export const getRankInfoCache = (idBot) =>
  rankInfoCache[idBot] || {
    groups: {},
  };

function loadRankInfoCache(idBot) {
  rankInfoCache[idBot] = readRankInfo(idBot);
  replayRankJournal(idBot);
}

export function setHasChange(idBot) {
  hasChanges[idBot] = true;
}

function getRankJournalWriter(idBot) {
  const botKey = String(idBot);
  let writer = rankJournalWriters.get(botKey);
  if (!writer) {
    writer = { entries: [], timer: null, chain: Promise.resolve(), snapshotting: false };
    rankJournalWriters.set(botKey, writer);
  }
  return writer;
}

function flushRankJournal(idBot) {
  const writer = getRankJournalWriter(idBot);
  if (writer.timer) {
    clearTimeout(writer.timer);
    writer.timer = null;
  }
  if (writer.snapshotting || writer.entries.length === 0) return writer.chain;
  const batch = writer.entries.splice(0, JOURNAL_BATCH_SIZE).join("");
  writer.chain = writer.chain
    .then(() => fs.promises.appendFile(getRankJournalPath(idBot), batch))
    .catch((error) => console.error("Lỗi ghi journal dự phòng topchat:", error));
  if (writer.entries.length > 0) scheduleRankJournalFlush(idBot);
  return writer.chain;
}

function scheduleRankJournalFlush(idBot) {
  const writer = getRankJournalWriter(idBot);
  if (writer.timer || writer.snapshotting) return;
  writer.timer = setTimeout(() => void flushRankJournal(idBot), JOURNAL_FLUSH_MS);
  writer.timer.unref?.();
}

function enqueueRankJournal(idBot, event) {
  const writer = getRankJournalWriter(idBot);
  writer.entries.push(`${JSON.stringify(event)}\n`);
  if (writer.entries.length >= JOURNAL_BATCH_SIZE) void flushRankJournal(idBot);
  else scheduleRankJournalFlush(idBot);
}

async function saveRankInfoCache(idBot) {
  if (hasChanges[idBot]) {
    const writer = getRankJournalWriter(idBot);
    writer.snapshotting = true;
    if (writer.timer) {
      clearTimeout(writer.timer);
      writer.timer = null;
    }
    // Flush everything queued before the checkpoint. New events stay buffered
    // while the compact snapshot is being committed.
    writer.snapshotting = false;
    await flushRankJournal(idBot);
    writer.snapshotting = true;
    await writer.chain;
    const rankInfo = getRankInfoCache(idBot);
    rankInfo._journalSeq = rankJournalSeq.get(String(idBot)) || Number(rankInfo._journalSeq) || 0;
    if (await writeRankInfo(idBot, rankInfo)) {
      try {
        await fs.promises.writeFile(getRankJournalPath(idBot), "");
        hasChanges[idBot] = false;
      } catch (error) {
        console.error("Lỗi khi dọn journal topchat:", error);
      }
    }
    writer.snapshotting = false;
    if (writer.entries.length > 0) scheduleRankJournalFlush(idBot);
  }
}

function readRankInfo(idBot) {
  try {
    const data = readFileSync(rankInfoJsonPath(idBot));
    return JSON.parse(data);
  } catch (error) {
    console.error("Lỗi khi đọc file rank-info.json:", error);
    return { groups: {} };
  }
}

async function writeRankInfo(idBot, data) {
  try {
    const targetPath = rankInfoJsonPath(idBot);
    const temporaryPath = `${targetPath}.tmp`;
    await fs.promises.writeFile(temporaryPath, JSON.stringify(data));
    await fs.promises.rename(temporaryPath, targetPath);
    return true;
  } catch (error) {
    console.error("Lỗi khi ghi file rank-info.json:", error);
    return false;
  }
}

function getRankJournalPath(idBot) {
  return `${rankInfoJsonPath(idBot)}.journal`;
}

function applyRankEvent(idBot, event) {
  const { groupId, userId, userName, nameGroup, dateKey } = event;
  const rankInfo = getRankInfoCache(idBot);
  if (!rankInfo.groups) rankInfo.groups = {};
  if (!rankInfo.groups[groupId]) rankInfo.groups[groupId] = { users: [] };
  if (rankInfo.groups[groupId].nameGroup !== nameGroup) rankInfo.groups[groupId].nameGroup = nameGroup;

  const indexKey = `${idBot}:${groupId}`;
  let userIndexMap = rankUserIndexes.get(indexKey);
  const users = rankInfo.groups[groupId].users;
  if (!userIndexMap || userIndexMap.size > users.length || users[userIndexMap.get(userId)]?.UID !== userId) {
    userIndexMap = new Map(users.map((user, index) => [user.UID, index]));
    rankUserIndexes.set(indexKey, userIndexMap);
  }
  const userIndex = userIndexMap.get(userId) ?? -1;
  if (userIndex !== -1) {
    users[userIndex].Rank++;
    users[userIndex].UserName = userName;
  } else {
    users.push({ UserName: userName, UID: userId, Rank: 1 });
    userIndexMap.set(userId, users.length - 1);
  }

  const groupData = rankInfo.groups[groupId];
  if (!groupData.dailyStats) groupData.dailyStats = {};
  if (!groupData.dailyStats[dateKey]) groupData.dailyStats[dateKey] = {};
  const dayBucket = groupData.dailyStats[dateKey];
  if (!dayBucket[userId]) dayBucket[userId] = { name: userName, count: 0 };
  dayBucket[userId].count++;
  dayBucket[userId].name = userName;
}

function replayRankJournal(idBot) {
  const botKey = String(idBot);
  const rankInfo = getRankInfoCache(idBot);
  const checkpoint = Number(rankInfo._journalSeq) || 0;
  let latestSeq = checkpoint;
  try {
    const journal = fs.readFileSync(getRankJournalPath(idBot), "utf8");
    for (const line of journal.split("\n")) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        const seq = Number(event.seq) || 0;
        latestSeq = Math.max(latestSeq, seq);
        if (seq > checkpoint) applyRankEvent(idBot, event);
      } catch (error) {
        console.error("Bỏ qua một dòng journal topchat bị lỗi:", error.message);
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") console.error("Lỗi khi đọc journal topchat:", error);
  }
  rankJournalSeq.set(botKey, latestSeq);
  if (latestSeq > checkpoint) setHasChange(idBot);
}

export function updateUserRank(idBot, groupId, userId, userName, nameGroup) {
  const dateKey = getDateKeyVN();
  const botKey = String(idBot);
  const seq = (rankJournalSeq.get(botKey) || Number(getRankInfoCache(idBot)._journalSeq) || 0) + 1;
  const event = { seq, groupId: String(groupId), userId: String(userId), userName, nameGroup, dateKey };
  enqueueRankJournal(idBot, event);
  rankJournalSeq.set(botKey, seq);
  applyRankEvent(idBot, event);

  const now = Date.now();
  const groupData = getRankInfoCache(idBot).groups[groupId];
  if (!lastDailyStatsPruneAt[idBot] || now - lastDailyStatsPruneAt[idBot] > 24 * 60 * 60 * 1000) {
    pruneDailyStats(groupData);
    lastDailyStatsPruneAt[idBot] = now;
  }

  setHasChange(idBot);
}

/**
 * Lấy danh sách top users đã được sắp xếp
 * @param {Array} users - Danh sách users
 * @param {number} limit - Số lượng users cần lấy
 * @returns {Array} Danh sách top users
 */
function getTopUsers(users, limit = TOP_USERS_LIMIT) {
  return [...users].sort((a, b) => b.Rank - a.Rank).slice(0, limit);
}

/**
 * Tạo message xếp hạng
 * @param {Array} topUsers - Danh sách top users
 * @param {string} prefix - Prefix của bot
 * @param {boolean} isTotal - Có phải bảng tổng không
 * @returns {string} Message đã được format
 */
function buildRankMessage(topUsers, prefix, isTotal = false) {
  let message = RANK_MESSAGES.HEADER;

  topUsers.forEach((user, index) => {
    message += `${index + 1}. ${user.UserName}: ${user.Rank} tin nhắn\n`;
  });

  if (isTotal) {
    message += `\nDùng ${prefix}topchat để xem tương tác trong hôm nay!`;
  } else {
    message += RANK_MESSAGES.TODAY_HINT(prefix);
  }

  return message;
}

async function handleRankTextCommand(api, message, period = "today") {
  const { threadId } = message;
  const idBot = api.getBotId();
  let users;
  let periodLabel;

  if (period === "total") {
    users = getGroupUsers(idBot, threadId).map((user) => ({
      UserName: user.UserName,
      Rank: Number(user.Rank) || 0,
    }));
    periodLabel = "từ trước đến nay";
  } else {
    const dateKeys = period === "week"
      ? getWeekDateKeys()
      : period === "month"
        ? getMonthDateKeys()
        : [getDateKeyVN()];
    users = getStatsForDateKeys(idBot, threadId, dateKeys).map((user) => ({
      UserName: user.name,
      Rank: Number(user.messageCount) || 0,
    }));
    periodLabel = period === "week" ? "tuần này" : period === "month" ? "tháng này" : "hôm nay";
  }

  const topUsers = getTopUsers(users.filter((user) => user.Rank > 0));
  if (topUsers.length === 0) return sendNoDataMessage(api, message, threadId);

  let text = `🏆 TOP CHAT ${periodLabel.toUpperCase()}\n\n`;
  topUsers.forEach((user, index) => {
    text += `${index + 1}. ${user.UserName}: ${user.Rank.toLocaleString("vi-VN")} tin nhắn\n`;
  });
  const total = users.reduce((sum, user) => sum + user.Rank, 0);
  text += `\n📊 Tổng: ${total.toLocaleString("vi-VN")} tin nhắn`;

  return api.sendMessage({ msg: text, ttl: 600000, quote: message }, threadId, MessageType.GroupMessage);
}

/**
 * Gửi message khi không có dữ liệu
 * @param {Object} api - API instance
 * @param {Object} message - Message object
 * @param {string} threadId - Thread ID
 */
async function sendNoDataMessage(api, message, threadId) {
  await api.sendMessage({ msg: RANK_MESSAGES.NO_DATA, quote: message }, threadId, MessageType.GroupMessage);
}

/**
 * Lấy danh sách users trong nhóm
 * @param {string} idBot - Bot ID
 * @param {string} threadId - Thread ID
 * @returns {Array} Danh sách users
 */
function getGroupUsers(idBot, threadId) {
  const rankInfo = getRankInfoCache(idBot);
  return rankInfo.groups[threadId]?.users || [];
}

/**
 * Xử lý lệnh xem bảng xếp hạng
 * @param {Object} api - API instance
 * @param {Object} message - Message object
 */
export async function handleRankCommand(api, message) {
  const content = removeMention(message);
  const { threadId } = message;
  const idBot = api.getBotId();
  const prefix = getGlobalPrefix(idBot);

  // Parse arguments sau "topchat"
  const args = content.split(/\s+/).slice(1); // Bỏ "topchat"

  // Kiểm tra lệnh help
  if (args.includes("help")) {
    const helpMessage = `📖 Hướng dẫn sử dụng lệnh ${prefix}topchat:

🔹 ${prefix}topchat
   → Xem bảng xếp hạng tương tác hôm nay (mặc định)

🔹 ${prefix}topchat text
   → Hiện bảng xếp hạng bằng chữ

🔹 ${prefix}topchat all
   → Hiện bảng xếp hạng bằng ảnh

🔹 ${prefix}topchat week
   → Xem bảng xếp hạng tương tác tuần này (Thứ 2 - Chủ nhật)

🔹 ${prefix}topchat month
   → Xem bảng xếp hạng tương tác tháng này

🔹 ${prefix}topchat me / ${prefix}topchat week me / ${prefix}topchat month me
   → Xem rank cá nhân của bạn (hôm nay / tuần này / tháng này)

🔹 ${prefix}topchat @mention
   → Xem rank cá nhân của người được tag trong hôm nay (thêm "week"/"month" để đổi khoảng thời gian)

🔹 ${prefix}topchat total
   → Xem bảng xếp hạng tổng từ trước tới nay
   
🔹 ${prefix}topchat total me
   → Xem rank cá nhân tổng của bạn

🔹 ${prefix}topchat total @mention
   → Xem rank cá nhân tổng của người được tag

💡 Tip: Bạn cũng có thể dùng "global" thay cho "total", "tuan"/"tuần" thay cho "week", "thang"/"tháng" thay cho "month"`;
    await api.sendMessage({ msg: helpMessage, ttl: 600000, quote: message }, threadId, MessageType.GroupMessage);
    return;
  }

  // Kiểm tra mentions
  const mentions = message.data.mentions || [];
  const hasMention = mentions.length > 0;
  const mentionedUid = hasMention ? mentions[0].uid : null;

  // Xác định loại lệnh
  const isTotal = args.includes("total") || args.includes("global");
  const isWeek = args.includes("week") || args.includes("tuan") || args.includes("tuần");
  const isMonth = args.includes("month") || args.includes("thang") || args.includes("tháng");
  const isMe = args.includes("me");
  const isPersonal = isMe || hasMention;

  // Xử lý rank cá nhân
  if (isPersonal) {
    const uid = hasMention ? mentionedUid : message.data.uidFrom;
    if (isTotal) {
      // Rank cá nhân tổng
      return handlePersonalRankTotalCommand(api, message, uid);
    } else if (isWeek) {
      // Rank cá nhân tuần này
      return handlePersonalRankPeriodCommand(api, message, uid, "week");
    } else if (isMonth) {
      // Rank cá nhân tháng này
      return handlePersonalRankPeriodCommand(api, message, uid, "month");
    } else {
      // Rank cá nhân hôm nay
      return handlePersonalRankCommand(api, message, uid);
    }
  }

  if (args.includes("text")) {
    const period = isTotal ? "total" : isWeek ? "week" : isMonth ? "month" : "today";
    return handleRankTextCommand(api, message, period);
  }

  // Xử lý bảng xếp hạng
  if (isTotal) {
    // Bảng xếp hạng tổng (dùng canvas)
    return handleRankTotalCommand(api, message);
  } else if (isWeek) {
    // Bảng xếp hạng tuần này (dùng canvas)
    return handleRankPeriodCommand(api, message, "week");
  } else if (isMonth) {
    // Bảng xếp hạng tháng này (dùng canvas)
    return handleRankPeriodCommand(api, message, "month");
  } else {
    // Bảng xếp hạng hôm nay (dùng canvas)
    return handleRankTodayCommand(api, message);
  }
}

/**
 * Xử lý lệnh xem rank cá nhân
 * @param {Object} api - API instance
 * @param {Object} message - Message object
 * @param {string} uid - UID của user cần xem rank
 */
export async function handlePersonalRankCommand(api, message, uid) {
  let imagePath = null;
  try {
    const { threadId } = message;
    const idBot = api.getBotId();
    // dailyStats được journal cục bộ theo từng tin, không phụ thuộc MongoDB.
    const todayStats = getStatsForDateKeys(idBot, threadId, [getDateKeyVN()]);
    const messageCount = todayStats.find((user) => String(user.id) === String(uid))?.messageCount || 0;

    if (messageCount === 0) {
      await api.sendMessage(
        { msg: "Bạn chưa có tin nhắn nào trong hôm nay 😢", quote: message,ttl:300000 },
        threadId,
        MessageType.GroupMessage
      );
      return;
    }

    // Lấy thông tin user
    const userInfo = await getUserInfoBasic(api, uid);
    const user = {
      id: uid,
      name: userInfo?.displayName || userInfo?.zaloName || "Bạn",
      avatar: userInfo?.avatar,
      messageCount,
    };

    // Tạo card rank cá nhân
    imagePath = await createPersonalRankCard(user, rankStar);
    await sendMessageFromSQL(api, message, {
      success: true,
      message: ``
    }, false, 600000);
    // Gửi ảnh
    await api.sendMessage(
      {
        msg: "",
        attachments: [imagePath],
        quote: message,
        ttl: 6000000,
        isUseProphylactic: true,
      },
      threadId,
      MessageType.GroupMessage
    );
  } catch (error) {
    console.error("Lỗi khi tạo card rank cá nhân:", error);
    await api.sendMessage(
      { msg: `Lỗi khi tạo card rank: ${error.message}`, quote: message },
      message.threadId,
      MessageType.GroupMessage
    );
  } finally {
    await deleteFile(imagePath);
  }
}

/**
 * Xử lý lệnh xem rank cá nhân tổng
 * @param {Object} api - API instance
 * @param {Object} message - Message object
 * @param {string} uid - UID của user cần xem rank
 */
export async function handlePersonalRankTotalCommand(api, message, uid) {
  let imagePath = null;
  try {
    const { threadId } = message;
    const idBot = api.getBotId();

    // Lấy tổng điểm từ rank info
    const rankInfo = getRankInfoCache(idBot);
    const groupUsers = rankInfo.groups[threadId]?.users || [];
    const userRank = groupUsers.find(user => user.UID === uid);

    const totalMessages = userRank ? userRank.Rank : 0;

    if (totalMessages === 0) {
      await api.sendMessage(
        { msg: "Bạn chưa có tin nhắn nào trong nhóm này 😢", quote: message,ttl:300000 },
        threadId,
        MessageType.GroupMessage
      );
      return;
    }

    // Lấy thông tin user
    const userInfo = await getUserInfoBasic(api, uid);
    const user = {
      id: uid,
      name: userInfo?.displayName || userInfo?.zaloName || "Bạn",
      avatar: userInfo?.avatar,
      messageCount: totalMessages,
    };

    // Tạo card rank cá nhân
    imagePath = await createPersonalRankCardTotal(user, rankStar);
    await sendMessageFromSQL(api, message, {
      success: true,
      message: ``
    }, false, 600000);

    // Gửi ảnh
    await api.sendMessage(
      {
        msg: "",
        attachments: [imagePath],
        quote: message,
        ttl: 6000000,
        isUseProphylactic: true,
      },
      threadId,
      MessageType.GroupMessage
    );
  } catch (error) {
    console.error("Lỗi khi tạo card rank cá nhân tổng:", error);
    await api.sendMessage(
      { msg: `Lỗi khi tạo card rank: ${error.message}`, quote: message },
      message.threadId,
      MessageType.GroupMessage
    );
  } finally {
    await deleteFile(imagePath);
  }
}

/**
 * Xử lý lệnh xem bảng xếp hạng hôm nay với canvas
 * @param {Object} api - API instance
 * @param {Object} message - Message object
 */
export async function handleRankTodayCommand(api, message) {
  let imagePath = null;
  try {
    const { threadId } = message;
    const idBot = api.getBotId();
    // Đọc bản dự phòng local thay vì phụ thuộc MongoDB cho bảng hôm nay.
    const users = getStatsForDateKeys(idBot, threadId, [getDateKeyVN()]);

    if (users.length === 0) {
      await api.sendMessage(
        { msg: "Chưa có ai tương tác trong hôm nay 😢", ttl: 60000, quote: message },
        threadId,
        MessageType.GroupMessage
      );
      return;
    }

    // Lấy thông tin nhóm
    const rankInfo = getRankInfoCache(idBot);
    const groupName = rankInfo.groups[threadId]?.nameGroup || "Nhóm";

    // Lấy avatar cho users sử dụng getUserInfoBasic
    try {
      const userPromises = users.map(async (user) => {
        try {
          const userInfo = await getUserInfoBasic(api, user.id);
          if (userInfo && userInfo.avatar) {
            user.avatar = userInfo.avatar;
            user.name = userInfo.displayName || userInfo.zaloName || user.name;
          }
        } catch (error) {
          console.error(`Không thể lấy thông tin user ${user.id}:`, error);
        }
        return user;
      });

      await Promise.all(userPromises);
    } catch (error) {
      console.error("Không thể lấy thông tin users:", error);
    }

    // Tạo ảnh bảng xếp hạng với rankStar config
    imagePath = await createRankLeaderboard(users, groupName, rankStar);
    const totalMessages = users.reduce((sum, u) => sum + u.messageCount, 0);
    await sendMessageFromSQL(api, message, {
      success: true,
      message: `Tổng số tin nhắn trong ngày: ${totalMessages.toLocaleString("vi-VN")}`
    }, false, 600000);
    // Gửi ảnh
    await api.sendMessage(
      {
        msg: "",
        attachments: [imagePath],
        quote: message,
        ttl:6000000,
        isUseProphylactic: true,
      },
      threadId,
      MessageType.GroupMessage
    );
  } catch (error) {
    console.error("Lỗi khi tạo bảng xếp hạng:", error);
    await api.sendMessage(
      { msg: `Lỗi khi tạo bảng xếp hạng: ${error.message}`, quote: message },
      message.threadId,
      MessageType.GroupMessage
    );
  } finally {
    await deleteFile(imagePath);
  }
}



/**
 * Xử lý lệnh xem bảng xếp hạng tổng với canvas
 * @param {Object} api - API instance
 * @param {Object} message - Message object
 */
export async function handleRankTotalCommand(api, message) {
  let imagePath = null;
  try {
    const { threadId } = message;
    const idBot = api.getBotId();

    // Lấy dữ liệu từ rank info (tổng từ trước đến nay)
    const groupUsers = getGroupUsers(idBot, threadId);
    // Chuyển đổi dữ liệu sang format phù hợp với canvas
    const users = groupUsers.map(user => ({
      id: user.UID,
      name: user.UserName,
      messageCount: user.Rank,
    }));
    if (users.length === 0) {
      return sendNoDataMessage(api, message, threadId);
    }

    // Lấy thông tin nhóm
    const rankInfo = getRankInfoCache(idBot);
    const groupName = rankInfo.groups[threadId]?.nameGroup || "Nhóm";

    // Lấy avatar cho users sử dụng getUserInfoBasic
    try {
      const userPromises = users.map(async (user) => {
        try {
          const userInfo = await getUserInfoBasic(api, user.id);
          if (userInfo && userInfo.avatar) {
            user.avatar = userInfo.avatar;
            user.name = userInfo.displayName || userInfo.zaloName || user.name;
          }
        } catch (error) {
          console.error(`Không thể lấy thông tin user ${user.id}:`, error);
        }
        return user;
      });

      await Promise.all(userPromises);
    } catch (error) {
      console.error("Không thể lấy thông tin users:", error);
    }

    imagePath = await createRankLeaderboardTotal(users, groupName, rankStar);
    const totalMessages = users.reduce((sum, u) => sum + u.messageCount, 0);
    await sendMessageFromSQL(api, message, {
      success: true,
      message: `📊 Tổng số tin nhắn từ trước đến nay: ${totalMessages.toLocaleString("vi-VN")}`
    }, false, 600000);

    await api.sendMessage(
      {
        msg: "",
        attachments: [imagePath],
        quote: message,
        ttl:6000000,
        isUseProphylactic: true,
      },
      threadId,
      MessageType.GroupMessage
    );
  } catch (error) {
    console.error("Lỗi khi tạo bảng xếp hạng tổng:", error);
    await api.sendMessage(
      { msg: `Lỗi khi tạo bảng xếp hạng tổng: ${error.message}`, quote: message },
      message.threadId,
      MessageType.GroupMessage
    );
  } finally {
    await deleteFile(imagePath);
  }
}

const PERIOD_CONFIG = {
  week: {
    getDateKeys: getWeekDateKeys,
    leaderboardTitle: "🏆 BXH TƯƠNG TÁC TUẦN NÀY 🏆",
    personalTitle: "Thành Tích Tương Tác Của Bạn Tuần Này",
    label: "tuần này",
    emptyGroupMsg: "Chưa có ai tương tác trong tuần này 😢",
    emptyPersonalMsg: "Bạn chưa có tin nhắn nào trong tuần này 😢",
    totalCaption: (total) => `Tổng số tin nhắn trong tuần: ${total.toLocaleString("vi-VN")}`,
  },
  month: {
    getDateKeys: getMonthDateKeys,
    leaderboardTitle: "🏆 BXH TƯƠNG TÁC THÁNG NÀY 🏆",
    personalTitle: "Thành Tích Tương Tác Của Bạn Tháng Này",
    label: "tháng này",
    emptyGroupMsg: "Chưa có ai tương tác trong tháng này 😢",
    emptyPersonalMsg: "Bạn chưa có tin nhắn nào trong tháng này 😢",
    totalCaption: (total) => `Tổng số tin nhắn trong tháng: ${total.toLocaleString("vi-VN")}`,
  },
};

/**
 * Xử lý lệnh xem bảng xếp hạng theo tuần hoặc tháng
 * @param {Object} api - API instance
 * @param {Object} message - Message object
 * @param {"week"|"month"} period
 */
export async function handleRankPeriodCommand(api, message, period) {
  const config = PERIOD_CONFIG[period];
  let imagePath = null;
  try {
    const { threadId } = message;
    const idBot = api.getBotId();

    const dateKeys = config.getDateKeys();
    const users = getStatsForDateKeys(idBot, threadId, dateKeys);

    if (users.length === 0) {
      await api.sendMessage({ msg: config.emptyGroupMsg, ttl: 60000, quote: message }, threadId, MessageType.GroupMessage);
      return;
    }

    const rankInfo = getRankInfoCache(idBot);
    const groupName = rankInfo.groups[threadId]?.nameGroup || "Nhóm";

    try {
      const userPromises = users.map(async (user) => {
        try {
          const userInfo = await getUserInfoBasic(api, user.id);
          if (userInfo && userInfo.avatar) {
            user.avatar = userInfo.avatar;
            user.name = userInfo.displayName || userInfo.zaloName || user.name;
          }
        } catch (error) {
          console.error(`Không thể lấy thông tin user ${user.id}:`, error);
        }
        return user;
      });

      await Promise.all(userPromises);
    } catch (error) {
      console.error("Không thể lấy thông tin users:", error);
    }

    imagePath = await createRankLeaderboard(users, groupName, rankStar, config.leaderboardTitle);
    const totalMessages = users.reduce((sum, u) => sum + u.messageCount, 0);
    await sendMessageFromSQL(
      api,
      message,
      {
        success: true,
        message: config.totalCaption(totalMessages),
      },
      false,
      600000
    );

    await api.sendMessage(
      {
        msg: "",
        attachments: [imagePath],
        quote: message,
        ttl: 6000000,
        isUseProphylactic: true,
      },
      threadId,
      MessageType.GroupMessage
    );
  } catch (error) {
    console.error(`Lỗi khi tạo bảng xếp hạng ${period}:`, error);
    await api.sendMessage(
      { msg: `Lỗi khi tạo bảng xếp hạng: ${error.message}`, quote: message },
      message.threadId,
      MessageType.GroupMessage
    );
  } finally {
    await deleteFile(imagePath);
  }
}

/**
 * Xử lý lệnh xem rank cá nhân theo tuần hoặc tháng
 * @param {Object} api - API instance
 * @param {Object} message - Message object
 * @param {string} uid - UID của user cần xem rank
 * @param {"week"|"month"} period
 */
export async function handlePersonalRankPeriodCommand(api, message, uid, period) {
  const config = PERIOD_CONFIG[period];
  let imagePath = null;
  try {
    const { threadId } = message;
    const idBot = api.getBotId();

    const dateKeys = config.getDateKeys();
    const users = getStatsForDateKeys(idBot, threadId, dateKeys);
    const userStat = users.find((u) => u.id === uid);
    const messageCount = userStat ? userStat.messageCount : 0;

    if (messageCount === 0) {
      await api.sendMessage(
        { msg: config.emptyPersonalMsg, quote: message, ttl: 300000 },
        threadId,
        MessageType.GroupMessage
      );
      return;
    }

    const userInfo = await getUserInfoBasic(api, uid);
    const user = {
      id: uid,
      name: userInfo?.displayName || userInfo?.zaloName || "Bạn",
      avatar: userInfo?.avatar,
      messageCount,
    };

    imagePath = await createPersonalRankCard(user, rankStar, config.personalTitle);
    await sendMessageFromSQL(
      api,
      message,
      {
        success: true,
        message: ``,
      },
      false,
      600000
    );

    await api.sendMessage(
      {
        msg: "",
        attachments: [imagePath],
        quote: message,
        ttl: 6000000,
        isUseProphylactic: true,
      },
      threadId,
      MessageType.GroupMessage
    );
  } catch (error) {
    console.error(`Lỗi khi tạo card rank cá nhân ${period}:`, error);
    await api.sendMessage(
      { msg: `Lỗi khi tạo card rank: ${error.message}`, quote: message },
      message.threadId,
      MessageType.GroupMessage
    );
  } finally {
    await deleteFile(imagePath);
  }
}

export function getRankMiniGameInfo(idBot, groupId, gameType, userId) {
  const rankInfo = getRankInfoCache(idBot);
  if (!rankInfo || !rankInfo[gameType] || !rankInfo[gameType][groupId] || !rankInfo[gameType][groupId].users) {
    return null;
  }

  const users = rankInfo[gameType][groupId].users;
  if (!users || users.length === 0) return null;

  const userRank = users.find((user) => user.UID === userId);
  if (!userRank) return null;

  if (typeof userRank.Point !== "number") {
    userRank.Point = userRank.Rank;
  }
  if (userRank.Point < 0) userRank.Point = 0;
  return userRank;
}

export function usePointMiniGame(idBot, groupId, gameType, userId, pointUse) {
  const userRank = getRankMiniGameInfo(idBot, groupId, gameType, userId);
  if (!userRank || typeof userRank.Point !== "number" || userRank.Point < pointUse) return false;
  userRank.Point -= pointUse;
  if (userRank.Point < 0) userRank.Point = 0;
  setHasChange(idBot);
  return true;
}

export function updateRankMiniGame(idBot, groupId, userId, userName, nameGroup, gameType, point = 1, args = {}) {
  const rankInfo = getRankInfoCache(idBot);
  if (!rankInfo) rankInfo = {};
  if (!rankInfo[gameType]) rankInfo[gameType] = {};
  if (!rankInfo[gameType][groupId]) rankInfo[gameType][groupId] = { users: [] };
  if (nameGroup && rankInfo[gameType][groupId].nameGroup !== nameGroup)
    rankInfo[gameType][groupId].nameGroup = nameGroup;

  const userIndex = rankInfo[gameType][groupId].users.findIndex((user) => user.UID === userId);
  if (userIndex !== -1) {
    if (typeof rankInfo[gameType][groupId].users[userIndex].Point !== "number") {
      rankInfo[gameType][groupId].users[userIndex].Point = rankInfo[gameType][groupId].users[userIndex].Rank;
    }
    rankInfo[gameType][groupId].users[userIndex].Rank += point;
    rankInfo[gameType][groupId].users[userIndex].UserName = userName;
    if (point > 0) {
      rankInfo[gameType][groupId].users[userIndex].Point += point;
    }
    if (rankInfo[gameType][groupId].users[userIndex].Point < 0) {
      rankInfo[gameType][groupId].users[userIndex].Point = 0;
    }
  } else {
    rankInfo[gameType][groupId].users.push({
      UserName: userName,
      UID: userId,
      Rank: point,
      Point: point < 0 ? 0 : point,
    });
  }

  if (Object.keys(args).length > 0) {
    const user = rankInfo[gameType][groupId].users.find((user) => user.UID === userId);
    user.inventory ??= {};
    for (const [key, value] of Object.entries(args)) {
      user.inventory[key] = (user.inventory[key] || 0) + value;
    }
  }

  setHasChange(idBot);
}

export async function handleRankMiniGameCommand(api, message, gameType) {
  const threadId = message.threadId;
  const idBot = api.getBotId();

  const typeNotUsePoint = [gameTypeCaro];

  const rankInfo = getRankInfoCache(idBot);
  const rankGame = rankInfo[gameType]?.[threadId]?.users || [];

  const sortedUsers = rankGame.sort((a, b) => b.Rank - a.Rank);
  const top10Users = sortedUsers.slice(0, 10);

  let rankMessage = `🏆 Bảng xếp hạng top 10 cao thủ ${gameType} trong nhóm này:\n\n`;
  top10Users.forEach((user, index) => {
    rankMessage += `${index + 1}. ${user.UserName}: ${user.Rank} điểm ${
      typeNotUsePoint.includes(gameType) ? "" : `[Còn ${user.Point || 0}]`
    }\n`;
  });

  const result = {
    success: false,
    message: rankMessage,
  };
  await sendMessageFromSQL(api, message, result, false, TIME_TO_LIVE);
}

export async function analyzeGroupInteractionsByThreadId(api, threadId, caption = "", timeToLive = 0) {
  try {
    const idBot = api.getBotId();
    const messageCache = await getMessageCache(idBot, threadId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfDay = today.getTime();

    const interactions = {};
    let totalMessages = 0;

    if (messageCache) {
      for (const msgId in messageCache) {
        const message = messageCache[msgId];

        if (message.timestamp >= startOfDay && message.timestamp <= Date.now()) {
          const uidFrom = message.uidFrom;
          const dName = message.dName || "Ẩn Danh";

          if (!interactions[uidFrom]) {
            interactions[uidFrom] = {
              name: dName,
              count: 0,
              id: uidFrom,
            };
          }

          interactions[uidFrom].count++;
          totalMessages++;
        }
      }
    }

    const sortedInteractions = Object.entries(interactions)
      .filter(([key, value]) => key !== idBot)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20);

    const messageBotChatStat = Object.entries(interactions).find(([key, value]) => key === idBot);
    totalMessages = messageBotChatStat ? totalMessages - messageBotChatStat[1].count : totalMessages;

    let statsMessage = (caption ? caption + "\n\n" : "") + `📊 Thống kê tương tác của hôm nay:\n`;
    statsMessage += `💬 Tổng số tin nhắn: ${totalMessages}\n\n`;

    if (sortedInteractions.length > 0) {
      statsMessage += `🏆 Top tương tác:\n`;
      sortedInteractions.forEach((item, index) => {
        statsMessage += `${index + 1}. ${item[1].name}: ${item[1].count} tin nhắn\n`;
      });
    } else {
      statsMessage += `Chưa có ai tương tác trong hôm nay 😢\n`;
    }

    await api.sendMessage({ msg: statsMessage, ttl: timeToLive }, threadId, MessageType.GroupMessage);

    return {
      success: true,
      message: statsMessage,
      data: {
        totalMessages,
        interactions: sortedInteractions,
      },
    };
  } catch (error) {
    console.error(`Lỗi khi phân tích tương tác nhóm ${threadId}:`, error);
    return {
      success: false,
      message: `Lỗi khi phân tích tương tác nhóm: ${error.message}`,
      error,
    };
  }
}

export async function initRankSystem(api) {
  const idBot = api.getBotId();
  loadRankInfoCache(idBot);
  // Do not walk every configured group or rewrite the complete snapshot at
  // startup. A rank bucket is created lazily by updateUserRank on the first
  // real message, so startup cost stays independent of the number of groups.

  // Multiple bot accounts used to serialize multi-megabyte snapshots on the
  // same second. Spread them across the minute so JSON serialization and disk
  // writes do not freeze the shared event loop in one large burst.
  const numericBotId = BigInt(String(idBot).replace(/\D/g, "") || "0");
  const saveSecond = Number(numericBotId % 60n);
  const saveMinute = Number((numericBotId / 60n) % 60n);
  // Every message is already appended to the journal. A full multi-megabyte
  // checkpoint every minute only creates periodic CPU spikes; hourly is enough
  // to bound journal replay while keeping the listener smooth.
  api.apiInstance.schedule.saveRankInfo = schedule.scheduleJob(`${saveSecond} ${saveMinute} * * * *`, async () => {
    await saveRankInfoCache(idBot);
  });
}
