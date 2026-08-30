import { MessageType } from "zlbotngh";
import { MuteAction } from "../../api-zalo/apis/setMute.js";
import * as cv from "../../utils/canvas/index.js";
import { createListImage } from "../../utils/canvas/list-form-v1.js";
import { getUserInfoBasic, getUserInfoData, getUsersInfoBasic } from "../../service-ngh/info-service/user-info.js";
import {
  sendMessageComplete,
  sendMessageCompleteRequest,
  sendMessageWarning,
  sendMessageQuery,
} from "../../service-ngh/chat-zalo/chat-style/chat-style.js";
import {
  sendMessageFromSQL,
  sendMessageInsufficientAuthority,
  sendMessageStateQuote,
} from "../../service-ngh/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-ngh/service.js";
import { getCommandConfig, isAdmin, isBotLeader, apiManager } from "../../index.js";
import { FONT_MAIN, randomIDTemp, removeMention } from "../../utils/format-util.js";
import { chunkArray } from "../../utils/util.js";
import { createCanvas, loadImage } from "canvas";
import path from "path";
import fs from "fs";
import { tempDir } from "../../utils/io-json.js";
import { deleteFile } from "../../utils/util.js";
import { groupSettingsAll } from "../../automations/event-send-msg.js";
import { managerDataCache } from "./active-bot.js";
import { getGroupInfoData } from "../../service-ngh/info-service/group-info.js";
import {
  getLowInteractionStats,
  resetLowInteractionStats,
} from "../../service-ngh/info-service/rank-chat.js";
import {
  addBlockTarget,
  getBlockTargets,
  scanAndBlockEverywhere,
  renderTargetListImage,
  removeTargetsByRefs,
} from "./target-enforcement.js";
import { fileURLToPath } from "url";
import { LRUCache } from "lru-cache";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TIME_REGEX = /^(\d{1,2}):(\d{2})$/;
const LOCK_CHAT_TIME_ZONE = "Asia/Ho_Chi_Minh";
const lockChatTimers = new Map();
const BLOCK_LIST_SESSION_TTL = 10 * 60 * 1000;
const blockListReplySessions = new LRUCache({ max: 500, ttl: BLOCK_LIST_SESSION_TTL });

function getSentMessageIds(result) {
  return [
    result?.message?.msgId,
    result?.message?.cliMsgId,
    ...(result?.attachment || []).flatMap((item) => [item?.msgId, item?.cliMsgId]),
  ].filter((id) => id !== undefined && id !== null).map(String);
}

function getQuotedMessageIds(message) {
  const quote = message.data?.quote;
  if (!quote) return [];
  return [quote.globalMsgId, quote.msgId, quote.cliMsgId]
    .filter((id) => id !== undefined && id !== null)
    .map(String);
}

/** Hiển thị thành viên ít tương tác, dạng text 25 người mỗi trang. */
async function handleLowInteractionMembers(api, message, groupInfo, args, aliasCommand) {
  const prefix = getGlobalPrefix(api.getBotId());
  const action = String(args[0] || "").toLowerCase();
  if (["reset", "rs", "clear"].includes(action)) {
    const resetAt = resetLowInteractionStats(api.getBotId(), message.threadId);
    await sendMessageComplete(
      api,
      message,
      `✅ Đã reset bộ lọc tương tác của nhóm.\nChu kỳ mới bắt đầu: ${new Date(resetAt).toLocaleString("vi-VN")}`,
      false,
      60000
    );
    return;
  }

  const rawPage = Number.parseInt(args[0], 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize = 25;

  try {
    const fullGroupInfo = await getGroupInfoData(api, message.threadId);
    const memberIds = [...new Set((fullGroupInfo?.memVerList || [])
      .map((id) => String(id).replace(/_0$/, ""))
      .filter((id) => id && id !== String(api.getBotId())))];

    if (!memberIds.length) {
      await sendMessageWarning(api, message, "Không lấy được danh sách thành viên trong nhóm.", false);
      return;
    }

    const { resetAt, counts } = getLowInteractionStats(api.getBotId(), message.threadId);
    const members = memberIds.map((id) => {
      return { id, name: id, count: Number(counts[id]) || 0 };
    });

    // Lấy tên mới nhất theo batch; lỗi một profile không làm hỏng cả danh sách.
    for (let i = 0; i < memberIds.length; i += 50) {
      try {
        const profiles = await getUsersInfoBasic(api, memberIds.slice(i, i + 50));
        for (const member of members.slice(i, i + 50)) {
          const profile = profiles?.[member.id];
          member.name = profile?.displayName || profile?.zaloName || member.name;
        }
      } catch (error) {
        console.warn(`[stg noactive] Không lấy được tên thành viên: ${error.message}`);
      }
    }

    members.sort((a, b) => a.count - b.count || a.name.localeCompare(b.name, "vi"));
    const totalPages = Math.max(1, Math.ceil(members.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const current = members.slice(start, start + pageSize);
    const lines = current.map((member, index) =>
      `${start + index + 1}. ${member.name} — ${member.count} tin nhắn`
    );
    const groupName = fullGroupInfo?.name || groupInfo?.name || "nhóm";
    const caption =
      `📉 THÀNH VIÊN ÍT TƯƠNG TÁC — ${groupName}\n` +
      `Trang ${safePage}/${totalPages} · Tổng ${members.length} thành viên\n` +
      `Chu kỳ: từ ${new Date(resetAt).toLocaleDateString("vi-VN")} (15 ngày)\n\n` +
      lines.join("\n") +
      `\n\nDùng ${prefix}${aliasCommand} noactive ${safePage < totalPages ? safePage + 1 : 1} để xem trang tiếp theo.`;
    await sendMessageComplete(api, message, caption, false, 300000);
  } catch (error) {
    console.error("[stg noactive] Lỗi:", error);
    await sendMessageWarning(api, message, `Không thể lấy danh sách ít tương tác: ${error.message}`, false);
  }
}

function clearLockChatTimer(threadId) {
  const timers = lockChatTimers.get(threadId);
  if (timers?.timeoutIds?.length) {
    for (const id of timers.timeoutIds) {
      clearTimeout(id);
    }
  }
  lockChatTimers.delete(threadId);
}

function scheduleLockChatToggle(api, message, threadId, settings, nextValue, delayMs, groupTypeString, customText) {
  const timeoutId = setTimeout(async () => {
    try {
      const updatedSettings = { ...settings, lockSendMsg: nextValue };
      await api.changeGroupSetting(threadId, updatedSettings);
    } catch (error) {
      console.error("Lỗi khi tự động chuyển trạng thái lockchat:", error);
    }
  }, delayMs);

  const now = Date.now();
  const existing = lockChatTimers.get(threadId)?.timeoutIds || [];
  lockChatTimers.set(threadId, { timeoutIds: [...existing, timeoutId], expiresAt: now + delayMs, nextValue });
}

function parseTimeToDelay(timeStr) {
  const match = TIME_REGEX.exec(timeStr);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  const now = new Date();
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);
  if (target <= now) {
    target.setDate(target.getDate() + 1); // sang ngày tiếp theo
  }
  return target.getTime() - now.getTime();
}

function isTimeFormat(str) {
  return !!str && TIME_REGEX.test(str);
}

function getTimeInZone(timeZone = LOCK_CHAT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.hour}:${values.minute}`;
}

function timeToMinutes(time) {
  const match = TIME_REGEX.exec(time || "");
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function isInsideLockChatWindow(currentTime, lockTime, unlockTime) {
  const current = timeToMinutes(currentTime);
  const lock = timeToMinutes(lockTime);
  const unlock = timeToMinutes(unlockTime);
  if (current === null || lock === null || unlock === null || lock === unlock) return false;
  return lock < unlock ? current >= lock && current < unlock : current >= lock || current < unlock;
}

function getDelayFromSchedule(raw) {
  if (!raw) return null;
  if (isTimeFormat(raw)) return parseTimeToDelay(raw);
  const minutes = parseInt(raw, 10);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return minutes * 60 * 1000;
}

export async function handleCreateGroup(api, message) {
  const content = removeMention(message);
  const senderId = message.data.uidFrom;
  const prefix = getGlobalPrefix(api.getBotId());
  
  const args = content.slice(prefix.length).trim().split(/\s+/);
  args.shift();
  
  if (args.length < 1) {
    await sendMessageWarning(
      api, 
      message, 
      `Cú pháp: ${prefix}creategroup <tên_nhóm> [@thành_viên1] [@thành_viên2]...\nVí dụ: ${prefix}creategroup "Nhóm Test" @user1 @user2`, 
      false
    );
    return;
  }
  
  const groupName = args[0];
  const mentions = message.data.mentions || [];
  const members = mentions.map(mention => mention.uid);
  
  if (!members.includes(senderId)) {
    members.push(senderId);
  }
  
  try {
    const result = await api.createGroup({
      name: groupName,
      members: members
    });
    
    if (result && result.groupId) {
      await sendMessageComplete(
        api, 
        message, 
        `✅ Đã tạo nhóm "${groupName}" thành công!\n🆔 ID nhóm: ${result.groupId}\n👥 Số thành viên: ${members.length}`, 
        true, 
        300000
      );
    } else {
      await sendMessageWarning(api, message, "❌ Không thể tạo nhóm. Vui lòng thử lại sau!", false);
    }
  } catch (error) {
    console.error("Lỗi khi tạo nhóm:", error);
    await sendMessageWarning(api, message, `❌ Lỗi khi tạo nhóm: ${error.message}`, false);
  }
}
export async function handleKick(api, message, groupInfo, groupSettings) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const idBot = api.getBotId();
  const ownerIsKeyGold = idBot === groupInfo.creatorId;
  const isSelf = idBot === senderId;
  const prefix = getGlobalPrefix(idBot);
  const mentions = message.data.mentions || [];

  const rawContent = removeMention(message).trim();
  const afterPrefix = rawContent.startsWith(prefix) ? rawContent.slice(prefix.length).trim() : rawContent;
  const tokens = afterPrefix.split(/\s+/).filter(Boolean);
  const subCommand = tokens[1]?.toLowerCase();

  // UID gõ tay trực tiếp (không @mention), ví dụ: kick 1234567890123
  const rawUidArgs = tokens.slice(1).filter((t) => /^\d{6,}$/.test(t));

  if (subCommand === "target" || subCommand === "list" || subCommand === "remove") {
    await sendMessageWarning(
      api,
      message,
      `Đã bỏ chế độ kick target. Dùng ${prefix}target add @mention hoặc ${prefix}target add all @mention.`,
      false
    );
    return;
  }

  // ------- Hành vi kick mặc định: hỗ trợ cả @mention lẫn UID gõ tay -------
  if (mentions.length === 0 && rawUidArgs.length === 0) {
    await sendMessageWarning(api, message, ":D Bạn muốn kick ai? 🚀", false);
    return;
  }

  const uids = [];
  const UserDataMentions = [];

  const candidateIds = [...new Set([...mentions.map((m) => m.uid), ...rawUidArgs])];

  for (const targetId of candidateIds) {
    if (isAdmin(idBot, targetId, threadId)) {
      await sendMessageWarning(api, message, "Bạn không thể yêu cầu kick quản trị bot được 🚀", false);
      continue;
    }
    if (ownerIsKeyGold && !isSelf) {
      if (groupInfo.adminIds.includes(targetId)) {
        await sendMessageWarning(
          api,
          message,
          "Bạn không có quyền yêu cầu Trưởng Nhóm đuổi phó nhóm ra khỏi cộng đồng!",
          true
        );
        continue;
      }
    }
    uids.push(targetId);
    try {
      const userInfo = await getUserInfoData(api, targetId);
      if (userInfo) {
        UserDataMentions.push(userInfo);
      }
    } catch (error) {
      console.error(`Không thể lấy thông tin cho người dùng ${targetId}:`, error);
    }
  }

  if (uids.length === 0) {
    return;
  }

  try {
    const result = await api.removeUserFromGroup(threadId, uids);
    if (result.errorMembers.length > 0) {
      await sendMessageWarning(api, message, "Ném Đây Cái Key Vàng 🔑, Tôi Kick Cho Bạn Xem :D 🚀", false);
      return;
    }

    const names = UserDataMentions.map((u) => u.name || `ID ${u.uid}`);
    await sendMessageComplete(
      api,
      message,
      `✅ Đã kick ${names.length ? names.join(", ") : uids.join(", ")} khỏi nhóm.`,
      false,
      60000
    );
  } catch (error) {
    console.error("Chắc Chắn Là Đã Có Lỗi Gì Đó :D", error);
    await sendMessageWarning(api, message, "Ném Đây Cái Key Vàng 🔑, Tôi Kick Cho Bạn Xem :D 🚀", false);
  }
}
export async function handleKickAll(api, message, groupInfo, groupSettings) {
  const threadId = message.threadId;
  const groupName = groupInfo.name;
  const senderName = message.data.dName;
  const senderId = message.data.uidFrom;
  const idBot = api.getBotId();
  const ownerIsKeyGold = idBot === groupInfo.creatorId;
  const isSelf = idBot === senderId;

  try {
    const fullGroupInfo = await getGroupInfoData(api, threadId);
    const memVerList = fullGroupInfo.memVerList || [];
    
    if (memVerList.length === 0) {
      await sendMessageWarning(api, message, "Không có thành viên nào trong nhóm để kick! 🚀", false);
      return;
    }

    const allMemberIds = memVerList.map((member) => member.replace(/_0$/, ""));
    const adminIds = fullGroupInfo.adminIds || [];
    const creatorId = fullGroupInfo.creatorId;
    const allAdminIds = [...new Set([creatorId, ...adminIds])];
    
    const uidsToKick = [];

    for (const memberId of allMemberIds) {
      if (memberId === idBot) continue;
      if (isAdmin(idBot, memberId, threadId)) continue;
      if (allAdminIds.includes(memberId)) continue;
      uidsToKick.push(memberId);
    }

    if (uidsToKick.length === 0) {
      await sendMessageWarning(api, message, "Không có thành viên nào để kick (chỉ có bot, admin bot, key vàng và key bạc)! 🚀", false);
      return;
    }
    const batchSize = 100;
    const batches = chunkArray(uidsToKick, batchSize);
    let totalKicked = 0;
    let totalErrors = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      try {
        const result = await api.removeUserFromGroup(threadId, batch);
        
        if (result.errorMembers && result.errorMembers.length > 0) {
          totalErrors += result.errorMembers.length;
        }
        totalKicked += batch.length - (result.errorMembers?.length || 0);
        if (i < batches.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } catch (error) {
        if (error.code === 166 || error.message?.includes("Không đủ quyền")) {
          console.error(`Lỗi quyền khi kick batch ${i + 1}, thử kick từng thành viên...`);
          for (const memberId of batch) {
            try {
              const result = await api.removeUserFromGroup(threadId, [memberId]);
              if (result.errorMembers && result.errorMembers.length > 0) {
                totalErrors++;
              } else {
                totalKicked++;
              }
              await new Promise((resolve) => setTimeout(resolve, 200));
            } catch (singleError) {
              console.error(`Lỗi khi kick thành viên ${memberId}:`, singleError);
              totalErrors++;
            }
          }
        } else {
          console.error(`Lỗi khi kick batch ${i + 1}:`, error);
          totalErrors += batch.length;
        }
      }
    }

  } catch (error) {
    console.error("Lỗi khi kick all:", error);
    await sendMessageWarning(api, message, "Ném Đây Cái Key Vàng 🔑, Tôi Kick All Cho Bạn Xem :D 🚀", false);
  }
}
export async function handleBlock(api, message, groupInfo, groupSettings) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const idBot = api.getBotId();
  const ownerIsKeyGold = idBot === groupInfo.creatorId;
  const isSelf = idBot === senderId;
  const prefix = getGlobalPrefix(idBot);
  const mentions = message.data.mentions || [];

  const rawContent = removeMention(message).trim();
  const afterPrefix = rawContent.startsWith(prefix) ? rawContent.slice(prefix.length).trim() : rawContent;
  const tokens = afterPrefix.split(/\s+/).filter(Boolean);
  const subCommand = tokens[1]?.toLowerCase();

  // UID gõ tay trực tiếp (không @mention), ví dụ: block 1234567890123
  const rawUidArgs = tokens.slice(1).filter((t) => /^\d{6,}$/.test(t));

  if (subCommand === "list" || subCommand === "remove") {
    const groupTypeString = groupInfo.groupType === 1 ? "Nhóm" : "Cộng Đồng";
    const args = tokens.slice(1);
    await handleGroupBlockList(api, message, args, "block", groupTypeString);
    return;
  }

  if (subCommand === "target") {
    await sendMessageWarning(
      api,
      message,
      `Đã bỏ chế độ block target. Dùng ${prefix}target add @mention hoặc ${prefix}target add all @mention.`,
      false
    );
    return;
  }

  // ------- Hành vi block mặc định: hỗ trợ cả @mention lẫn UID gõ tay -------
  if (mentions.length === 0 && rawUidArgs.length === 0) {
    await sendMessageWarning(api, message, ":D Bạn muốn chặn ai? 🚀", false);
    return;
  }

  const uids = [];
  const UserDataMentions = [];

  const candidateIds = [...new Set([...mentions.map((m) => m.uid), ...rawUidArgs])];

  for (const targetId of candidateIds) {
    if (isAdmin(idBot, targetId, threadId)) {
      await sendMessageWarning(api, message, "Bạn không thể yêu cầu block quản trị bot được 🚀", false);
      continue;
    }
    if (ownerIsKeyGold && !isSelf) {
      if (groupInfo.adminIds.includes(targetId)) {
        await sendMessageWarning(
          api,
          message,
          "Bạn không có quyền yêu cầu Trưởng Nhóm đuổi phó nhóm ra khỏi cộng đồng!",
          true
        );
        continue;
      }
    }
    uids.push(targetId);
    try {
      const userInfo = await getUserInfoData(api, targetId);
      if (userInfo) {
        UserDataMentions.push(userInfo);
      }
    } catch (error) {
      console.error(`Không thể lấy thông tin cho người dùng ${targetId}:`, error);
    }
  }

  if (uids.length === 0) {
    return;
  }

  try {
    const result = await api.blockUsers(threadId, uids);
    if (result.errorMembers && result.errorMembers.length > 0) {
      await sendMessageWarning(api, message, "Ném Đây Cái Key Vàng 🔑, Tôi Block Cho Bạn Xem :D 🚀", false);
      return;
    }

    const names = UserDataMentions.map((u) => u.name || `ID ${u.uid}`);
    await sendMessageComplete(
      api,
      message,
      `✅ Đã block ${names.length ? names.join(", ") : uids.join(", ")} trong nhóm.`,
      false,
      60000
    );
  } catch (error) {
    console.error("Chắc Chắn Là Đã Có Lỗi Gì Đó :D", error);
    await sendMessageWarning(api, message, "Ném Đây Cái Key Vàng 🔑, Tôi Block Cho Bạn Xem :D 🚀", false);
  }
}

/**
 * target add @tag       -> block và theo dõi target trong nhóm hiện tại
 * target add all @tag   -> block và theo dõi target trong tất cả nhóm bot có quyền
 * target list/remove    -> xem hoặc gỡ target
 */
export async function handleTarget(api, message) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const idBot = api.getBotId();
  const prefix = getGlobalPrefix(idBot);
  const mentions = message.data.mentions || [];

  const rawContent = removeMention(message).trim();
  const afterPrefix = rawContent.startsWith(prefix) ? rawContent.slice(prefix.length).trim() : rawContent;
  const tokens = afterPrefix.split(/\s+/).filter(Boolean);
  const subCommand = tokens[1]?.toLowerCase();

  if (!subCommand || subCommand === "list") {
    const blockTargets = getBlockTargets(api);
    if (!blockTargets.length) {
      await sendMessageComplete(api, message, "📭 Danh sách target đang trống.", false, 60000);
      return;
    }
    let imagePath = null;
    try {
      imagePath = await renderTargetListImage(api, blockTargets, "block");
      await sendMessageCompleteRequest(
        api,
        message,
        {
          caption:
            `Danh sách ${blockTargets.length} target theo phạm vi nhóm hoặc toàn bộ nhóm.\n` +
            `Gỡ: ${prefix}target remove <số thứ tự trong danh sách | uid | @mention>`,
          imagePath,
        },
        600000
      );
    } catch (error) {
      console.error("Lỗi khi tạo ảnh danh sách target:", error);
    } finally {
      await cv.clearImagePath(imagePath);
    }
    return;
  }

  if (subCommand === "add" || subCommand === "thêm" || subCommand === "them") {
    if (!isAdmin(idBot, senderId, threadId)) {
      await sendMessageWarning(api, message, "🚨 Chỉ Quản Trị Bot mới có quyền thêm target!", false);
      return;
    }

    const isAllGroups = tokens[2]?.toLowerCase() === "all";
    const uidStartIndex = isAllGroups ? 3 : 2;
    const rawUidArgs = tokens.slice(uidStartIndex).filter((token) => /^\d{6,}$/.test(token));
    const candidateIds = [...new Set([...mentions.map((mention) => mention.uid), ...rawUidArgs])];
    if (!candidateIds.length) {
      await sendMessageWarning(
        api,
        message,
        `Cú pháp:\n${prefix}target add @mention - Target nhóm hiện tại\n` +
          `${prefix}target add all @mention - Target tất cả nhóm`,
        false
      );
      return;
    }

    const addedNames = [];
    const existingNames = [];
    const protectedNames = [];
    let successGroups = 0;
    let failedGroups = 0;

    for (const targetId of candidateIds) {
      let targetName = `ID ${targetId}`;
      try {
        const userInfo = await getUserInfoData(api, targetId);
        targetName = userInfo?.name || targetName;
      } catch {}

      if (isAdmin(idBot, targetId, threadId)) {
        protectedNames.push(targetName);
        continue;
      }

      const changed = addBlockTarget(
        api,
        targetId,
        targetName,
        senderId,
        isAllGroups ? "all" : "group",
        threadId
      );
      (changed ? addedNames : existingNames).push(targetName);

      try {
        const result = await api.blockUsers(threadId, [targetId]);
        if (result?.errorMembers?.length) failedGroups++;
        else successGroups++;
      } catch {
        failedGroups++;
      }

      if (isAllGroups) {
        const scanResult = await scanAndBlockEverywhere(api, targetId, threadId);
        successGroups += scanResult.success;
        failedGroups += scanResult.failed;
      }
    }

    const lines = [];
    if (addedNames.length) {
      lines.push(
        `✅ Đã thêm target ${isAllGroups ? "tất cả nhóm" : "nhóm hiện tại"}: ${addedNames.join(", ")}`
      );
    }
    if (existingNames.length) lines.push(`ℹ️ Target đã tồn tại trong phạm vi này: ${existingNames.join(", ")}`);
    if (protectedNames.length) lines.push(`⚠️ Không thể target quản trị bot: ${protectedNames.join(", ")}`);
    lines.push(`📊 Xử lý nhóm: thành công ${successGroups}, lỗi/bỏ qua ${failedGroups}`);
    await sendMessageComplete(api, message, lines.join("\n"), false, 300000);
    return;
  }

  if (subCommand === "remove" || subCommand === "gỡ" || subCommand === "go") {
    if (!isAdmin(idBot, senderId, threadId)) {
      await sendMessageWarning(api, message, "🚨 Chỉ Quản Trị Bot mới có quyền gỡ mục tiêu khỏi danh sách target!", false);
      return;
    }
    const refs = [...mentions.map((m) => m.uid), ...tokens.slice(2)];
    if (refs.length === 0) {
      await sendMessageWarning(
        api,
        message,
        `Vui lòng nhập số thứ tự trong danh sách (xem bằng ${prefix}target list), UID, hoặc @mention cần gỡ.\n` +
          `Cú pháp: ${prefix}target remove <số thứ tự | uid | @mention> ...`,
        false
      );
      return;
    }
    const removed = removeTargetsByRefs(api, "block", refs);
    await sendMessageComplete(
      api,
      message,
      removed.length
        ? `✅ Đã gỡ khỏi danh sách target: ${removed.map((r) => r.targetName).join(", ")}`
        : `⚠️ Không tìm thấy mục tiêu tương ứng trong danh sách target.`,
      false,
      300000
    );
    return;
  }

  await sendMessageWarning(
    api,
    message,
    `Cú pháp:\n` +
      `${prefix}target add @mention - Target nhóm hiện tại\n` +
      `${prefix}target add all @mention - Target tất cả nhóm\n` +
      `${prefix}target list - Xem danh sách target\n` +
      `${prefix}target remove <số thứ tự | uid | @mention> - Gỡ target`,
    false
  );
}

export async function handleKeyCommands(api, message, groupSettings, isAdminLevelHighest) {
  const content = removeMention(message);
  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  const prefix = getGlobalPrefix(api.getBotId());

  if (
    !content.startsWith(`${prefix}keygold`)
  ) {
    return false;
  }

  const action = "gold";

  // if (!isAdminLevelHighest) {
  //   const caption = "Chỉ có quản trị bot cấp cao mới được sử dụng lệnh này!";
  //   await sendMessageInsufficientAuthority(api, message, caption);
  //   return false;
  // }

  const mentions = message.data.mentions;

  if (!mentions || mentions.length === 0) {
    await handleKeyAction(api, message, groupSettings, threadId, senderId, action, "Bạn");
  } else {
    for (const mention of mentions) {
      const targetId = mention.uid;
      const targetName = message.data.content.substring(mention.pos, mention.pos + mention.len).replace("@", "");
      await handleKeyAction(api, message, groupSettings, threadId, targetId, action, targetName);
    }
  }

  groupSettingsAll.setChanged();
  return true;
}

async function handleKeyAction(api, message, groupSettings, threadId, targetId, action, targetName) {
  switch (action) {
    case "gold":
      try {
        await api.changeGroupOwner(threadId, targetId);
        await sendMessageStateQuote(api, message, `Đã nhường key vàng cho ${targetName}.`, true, 300000);
      } catch (error) {
        await sendMessageStateQuote(api, message, `Không đủ quyền hạn để nhường key cho ${targetName}.`, false, 300000);
      }
      break;
    case "silver":
      try {
        await api.addGroupAdmins(threadId, targetId);
        await sendMessageStateQuote(api, message, `Đã phong key bạc cho ${targetName}.`, true, 300000);
      } catch (error) {
        await sendMessageStateQuote(
          api,
          message,
          `Không đủ quyền hạn để phong key bạc cho ${targetName}.`,
          false,
          300000
        );
      }
      break;
    case "unkey":
      try {
        await api.removeGroupAdmins(threadId, targetId);
        await sendMessageStateQuote(api, message, `Đã xóa key của ${targetName}.`, true, 300000);
      } catch (error) {
        await sendMessageStateQuote(api, message, `${targetName} không có key để xóa.`, false, 300000);
      }
      break;
  }
}

export async function handleBlockBot(api, message, groupSettings) {
  const botId = api.getBotId();
  const threadId = message.threadId;
  let listIdBlock = [];
  let messageContent = "";

  if (groupSettings) {
    const mentions = message.data.mentions;
    if (mentions && mentions.length > 0) {
      for (const mention of mentions) {
        const targetId = mention.uid;
        const targetName = message.data.content.substring(mention.pos, mention.pos + mention.len).replace("@", "");
        if (!isAdmin(botId, targetId)) {
          listIdBlock.push({ targetId, targetName });
        } else {
          messageContent += `🚨 Không thể block bot Quản Trị Cấp Cao: ${targetName}\n`;
        }
      }
    }
  } else {
    const userInfo = await getUserInfoBasic(api, threadId);
    if (!isAdmin(botId, threadId)) {
      listIdBlock.push({ targetId: threadId, targetName: userInfo.displayName });
    } else {
      messageContent += `🚨 Không thể block bot Quản Trị Cấp Cao: ${userInfo.displayName}\n`;
    }
  }

  if (listIdBlock.length > 0) {
    const mngrData = api.apiManager.getDataManager();
    if (!mngrData.blockBot) mngrData.blockBot = [];

    let blockedUsers = [];
    let alreadyBlockedUsers = [];

    for (const item of listIdBlock) {
      const isBlocked = mngrData.blockBot.some((blocked) => blocked.idUserZalo === item.targetId);

      if (isBlocked) {
        alreadyBlockedUsers.push(item.targetName);
      } else {
        mngrData.blockBot.push({
          idUserZalo: item.targetId,
          senderName: item.targetName,
        });
        blockedUsers.push(item.targetName);
      }
    }
    if (blockedUsers.length > 0) {
      messageContent += `✅ Đã chặn tương tác bot đối với: ${blockedUsers.join(", ")}\n`;
    }
    if (alreadyBlockedUsers.length > 0) {
      messageContent += `❌ Những người đã bị chặn từ trước: ${alreadyBlockedUsers.join(", ")}`;
    }

    if (messageContent.trim() === "") {
      messageContent = "🚨 Không có mục tiêu để chặn, vui lòng đề cập thông qua @mention";
    }

    managerDataCache.setChanged(botId);
    managerDataCache.save(botId);
  }
  await sendMessageStateQuote(api, message, messageContent.trim(), false, 300000, false);
}

export async function handleUnblockBot(api, message, groupSettings) {
  const threadId = message.threadId;
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const content = removeMention(message);
  const args = content.slice(prefix.length).trim().split(/\s+/);
  args.shift(); // Remove command name
  
  const mngrData = api.apiManager.getDataManager();
  if (!mngrData.blockBot) {
    mngrData.blockBot = [];
  }

  const firstArg = args[0];
  const isIndex = firstArg && !isNaN(firstArg) && parseInt(firstArg) > 0;
  const isAll = firstArg && firstArg.toLowerCase() === "all";

  if (isIndex || isAll) {
    if (mngrData.blockBot.length === 0) {
      await sendMessageStateQuote(
        api,
        message,
        "🚨 Không có ai bị chặn tương tác với bot để bỏ chặn.",
        false,
        60000,
        false
      );
      return;
    }

    const listBlockedUsers = mngrData.blockBot.map((blocked) => blocked.idUserZalo);
    const dataBlockList = await getUsersInfoBasic(api, listBlockedUsers);
    const blockListArray = Object.values(dataBlockList);

    if (isAll) {
      mngrData.blockBot = [];
      await sendMessageStateQuote(
        api,
        message,
        `✅ Đã bỏ chặn tất cả ${blockListArray.length} người dùng khỏi danh sách chặn tương tác bot.`,
        false,
        300000,
        false
      );
      managerDataCache.setChanged(botId);
      return;
    }

    const index = parseInt(firstArg) - 1;
    if (index < 0 || index >= mngrData.blockBot.length) {
      await sendMessageStateQuote(
        api,
        message,
        `🚨 Số thứ tự không hợp lệ.\nĐể xem danh sách chặn: ${prefix}listblockbot`,
        false,
        60000,
        false
      );
      return;
    }

    const targetId = mngrData.blockBot[index].idUserZalo;
    const targetName = blockListArray[index]?.displayName || mngrData.blockBot[index].senderName || `ID ${targetId}`;
    
    mngrData.blockBot.splice(index, 1);
    await sendMessageStateQuote(
      api,
      message,
      `✅ Đã bỏ chặn tương tác bot đối với: ${targetName}`,
      false,
      300000,
      false
    );
    managerDataCache.setChanged(botId);
    return;
  }

  let listIdUnblock = [];

  if (groupSettings) {
    const mentions = message.data.mentions;
    if (mentions && mentions.length > 0) {
      for (const mention of mentions) {
        const targetId = mention.uid;
        const targetName = message.data.content.substring(mention.pos, mention.pos + mention.len).replace("@", "");
        listIdUnblock.push({ targetId, targetName });
      }
    }
  } else {
    const userInfo = await getUserInfoBasic(api, threadId);
    listIdUnblock.push({ targetId: threadId, targetName: userInfo.displayName });
  }

  if (listIdUnblock.length > 0) {
    let unblockUsers = [];
    let notBlockedUsers = [];

    for (const item of listIdUnblock) {
      const blockedUserIndex = mngrData.blockBot.findIndex((blocked) => blocked.idUserZalo === item.targetId);

      if (blockedUserIndex !== -1) {
        mngrData.blockBot.splice(blockedUserIndex, 1);
        unblockUsers.push(item.targetName);
      } else {
        notBlockedUsers.push(item.targetName);
      }
    }

    let messageContent = "";
    if (unblockUsers.length > 0) {
      messageContent += `✅ Đã bỏ chặn tương tác bot đối với: ${unblockUsers.join(", ")}\n`;
    }
    if (notBlockedUsers.length > 0) {
      messageContent += `❌ Các thành viên sau không bị chặn: ${notBlockedUsers.join(", ")}`;
    }

    if (messageContent.trim() === "") {
      messageContent = `🚨 Không có mục tiêu để bỏ chặn.\nCú pháp: ${prefix}unblockbot <index|all|@mention>\nVí dụ:\n• ${prefix}unblockbot 1 - Bỏ chặn theo số thứ tự\n• ${prefix}unblockbot all - Bỏ chặn tất cả\n• ${prefix}unblockbot @user - Bỏ chặn theo mention\nĐể xem danh sách: ${prefix}listblockbot`;
    }

    await sendMessageStateQuote(api, message, messageContent.trim(), false, 300000, false);
    managerDataCache.setChanged(botId);
  } else {
    await sendMessageStateQuote(
      api,
      message,
      `🚨 Không có mục tiêu để bỏ chặn.\nCú pháp: ${prefix}unblockbot <index|all|@mention>\nVí dụ:\n• ${prefix}unblockbot 1 - Bỏ chặn theo số thứ tự\n• ${prefix}unblockbot all - Bỏ chặn tất cả\n• ${prefix}unblockbot @user - Bỏ chặn theo mention\nĐể xem danh sách: ${prefix}listblockbot`,
      false,
      60000,
      false
    );
  }
}

export async function handleListBlockBot(api, message) {
  const mngrData = api.apiManager.getDataManager();
  if (!mngrData.blockBot) {
    mngrData.blockBot = [];
  }
  const listBlockedUsers = mngrData.blockBot.map((blocked) => blocked.idUserZalo);

  if (listBlockedUsers.length === 0) {
    await sendMessageComplete(api, message, `🚨 Không có ai bị chặn tương tác với bot`, false, 300000);
  } else {
    const dataBlockList = await getUsersInfoBasic(api, listBlockedUsers);
    const blockListArray = Object.values(dataBlockList);

    let imagePath = null;
    try {
      imagePath = await createBotBlockListImage(blockListArray);
      await sendMessageCompleteRequest(
        api,
        message,
        {
          caption: `Đây là danh sách người dùng bị chặn tương tác với bot.`,
          imagePath,
        },
        600000
      );
    } catch (error) {
      console.error("Lỗi khi tạo ảnh danh sách chặn bot:", error);
      const caption = `Danh sách người dùng đã bị chặn tương tác với bot:\n${blockListArray
        .map((user, index) => `- ${index + 1}. ${user.displayName}`)
        .join("\n")}`;
      await sendMessageComplete(api, message, caption, false, 300000);
    } finally {
      deleteFile(imagePath);
    }
  }
}

export function isUserBlocked(botId, senderId) {
  try {
    const normalizedSenderId = String(senderId ?? "").replace(/_0$/, "");
    if (!normalizedSenderId) return false;

    // 1. Kiểm tra blockBot trên chính bot hiện tại
    const mngrData = managerDataCache.get(botId);
    if (mngrData?.blockBot && Array.isArray(mngrData.blockBot)) {
      const blockedLocally = mngrData.blockBot.some((blocked) => {
        const normalizedBlockedId = String(blocked?.idUserZalo ?? "").replace(/_0$/, "");
        return normalizedBlockedId === normalizedSenderId;
      });
      if (blockedLocally) return true;
    }

    // 2. Kiểm tra blockBot trên bot chính (Main Bot)
    const ownerId = apiManager.apiManagerObject?.[botId]?.ownerId;
    if (ownerId && String(ownerId) !== String(botId)) {
      const mainMngrData = managerDataCache.get(ownerId);
      if (mainMngrData?.blockBot && Array.isArray(mainMngrData.blockBot)) {
        const blockedOnMain = mainMngrData.blockBot.some((blocked) => {
          const normalizedBlockedId = String(blocked?.idUserZalo ?? "").replace(/_0$/, "");
          return normalizedBlockedId === normalizedSenderId;
        });
        if (blockedOnMain) return true;
      }
    }

    return false;
  } catch (error) {
    console.error("Lỗi khi kiểm tra trạng thái block:", error);
    return false;
  }
}

export async function handleBlockBotAll(api, message, groupSettings) {
  const botId = api.getBotId();
  const senderId = message.data.uidFrom;
  const prefix = getGlobalPrefix(botId);

  if (!api.apiManager?.isMainBot || !isBotLeader(botId, senderId)) {
    await sendMessageInsufficientAuthority(
      api, message,
      "Chỉ Bot Chính và Bot Leader mới được sử dụng blockbot all!"
    );
    return;
  }

  let listIdBlock = [];

  // Parse từ mentions
  const mentions = message.data?.mentions;
  if (mentions && mentions.length > 0) {
    for (const mention of mentions) {
      const targetId = String(mention.uid).replace(/_0$/, "");
      const targetName = message.data.content
        .substring(mention.pos, mention.pos + mention.len)
        .replace("@", "");
      if (!isAdmin(botId, targetId)) {
        listIdBlock.push({ targetId, targetName });
      } else {
        await sendMessageStateQuote(
          api, message,
          `🚨 Không thể block Quản Trị Cấp Cao: ${targetName}`,
          false, 60000, false
        );
      }
    }
  }

  // Parse từ UID
  const content = removeMention(message) || "";
  // Tách tất cả các từ trong message
  const words = content.trim().split(/\s+/);
  for (const word of words) {
    const cleanWord = word.replace(/_0$/, "").trim();
    if (/^\d{8,25}$/.test(cleanWord) && !listIdBlock.some((item) => item.targetId === cleanWord)) {
      if (!isAdmin(botId, cleanWord)) {
        try {
          const userInfo = await getUserInfoBasic(api, cleanWord);
          listIdBlock.push({
            targetId: cleanWord,
            targetName: userInfo?.displayName || userInfo?.zaloName || `ID ${cleanWord}`,
          });
        } catch {
          listIdBlock.push({ targetId: cleanWord, targetName: `ID ${cleanWord}` });
        }
      } else {
        await sendMessageStateQuote(
          api, message,
          `🚨 Không thể block Quản Trị Cấp Cao: ID ${cleanWord}`,
          false, 60000, false
        );
      }
    }
  }

  if (listIdBlock.length === 0) {
    await sendMessageStateQuote(
      api, message,
      `🚨 Vui lòng chỉ định người cần chặn.\n` +
        `Cú pháp: ${prefix}blockbot all @mention\n` +
        `Hoặc: ${prefix}blockbot all <UID>`,
      false, 60000, false
    );
    return;
  }

  // Tìm tất cả bot con thuộc về user này để block
  const botIdSet = new Set();
  const botLogPaths = new Map();
  const currentMainId = String(api.apiManager?.idBotMainWithBot || botId);
  try {
    const configPaths = [
      { cp: path.join(process.cwd(), "assets", "data", "manager-bots.json"), logDir: "main" },
      { cp: path.join(process.cwd(), "shards", "shard2", "assets", "data", "manager-bots.json"), logDir: "shard2" }
    ];
    for (const { cp, logDir } of configPaths) {
      if (fs.existsSync(cp)) {
        const bots = JSON.parse(fs.readFileSync(cp, "utf8"));
        for (const [key, bData] of Object.entries(bots)) {
          if (bData.idBot) {
            botIdSet.add(bData.idBot);
            botLogPaths.set(bData.idBot, path.join(process.cwd(), "logs", logDir, bData.idBot, "manager-bot.json"));
          }
        }
      }
    }
  } catch (e) {
    console.error("Lỗi đọc danh sách bot:", e);
  }

  let totalBots = 0;
  for (const mBotId of botIdSet) {
    let mngrData;
    let isMemory = false;
    
    // Nếu bot nằm trong Shard hiện tại, lấy từ bộ nhớ để update realtime
    if (apiManager.apiManagerObject && apiManager.apiManagerObject[mBotId]) {
      mngrData = managerDataCache.get(mBotId);
      isMemory = true;
    } else {
      // Nếu nằm ở Shard khác, đọc trực tiếp từ ổ cứng
      const filePath = botLogPaths.get(mBotId);
      if (filePath && fs.existsSync(filePath)) {
        try {
          mngrData = JSON.parse(fs.readFileSync(filePath, "utf8"));
        } catch (e) {}
      }
      if (!mngrData) mngrData = {};
    }

    if (!mngrData.blockBot) mngrData.blockBot = [];

    totalBots++;
    for (const item of listIdBlock) {
      const normalizedTarget = String(item.targetId).replace(/_0$/, "");
      const isBlocked = mngrData.blockBot.some(
        (blocked) => String(blocked.idUserZalo).replace(/_0$/, "") === normalizedTarget
      );
      if (!isBlocked) {
        mngrData.blockBot.push({
          idUserZalo: normalizedTarget,
          senderName: item.targetName,
        });
      }
    }
    
    if (isMemory) {
      managerDataCache.setChanged(mBotId);
      managerDataCache.save(mBotId);
    } else {
      const filePath = botLogPaths.get(mBotId);
      if (filePath) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(mngrData, null, 2));
      }
    }
  }

  const targetNames = listIdBlock.map((item) => item.targetName).join(", ");
  await sendMessageStateQuote(
    api, message,
    `✅ Đã chặn toàn hệ thống đối với: ${targetNames}\n` +
      `📊 Áp dụng trên ${totalBots} bot.`,
    true, 300000, false
  );
}

/**
 * Unblock user trên TOÀN BỘ bot trong hệ thống.
 * Chỉ mainBot + botLeader mới dùng được.
 * Cú pháp: unblockbot all @mention | unblockbot all <UID>
 */
export async function handleUnblockBotAll(api, message, groupSettings) {
  const botId = api.getBotId();
  const senderId = message.data.uidFrom;
  const prefix = getGlobalPrefix(botId);

  if (!api.apiManager?.isMainBot || !isBotLeader(botId, senderId)) {
    await sendMessageInsufficientAuthority(
      api, message,
      "Chỉ Bot Chính và Bot Leader mới được sử dụng unblockbot all!"
    );
    return;
  }

  let listIdUnblock = [];

  // Parse từ mentions
  const mentions = message.data?.mentions;
  if (mentions && mentions.length > 0) {
    for (const mention of mentions) {
      const targetId = String(mention.uid).replace(/_0$/, "");
      const targetName = message.data.content
        .substring(mention.pos, mention.pos + mention.len)
        .replace("@", "");
      listIdUnblock.push({ targetId, targetName });
    }
  }

  // Parse từ UID
  const content = removeMention(message) || "";
  const words = content.trim().split(/\s+/);
  for (const word of words) {
    const cleanWord = word.replace(/_0$/, "").trim();
    if (/^\d{8,25}$/.test(cleanWord) && !listIdUnblock.some((item) => item.targetId === cleanWord)) {
      try {
        const userInfo = await getUserInfoBasic(api, cleanWord);
        listIdUnblock.push({
          targetId: cleanWord,
          targetName: userInfo?.displayName || userInfo?.zaloName || `ID ${cleanWord}`,
        });
      } catch {
        listIdUnblock.push({ targetId: cleanWord, targetName: `ID ${cleanWord}` });
      }
    }
  }

  if (listIdUnblock.length === 0) {
    await sendMessageStateQuote(
      api, message,
      `🚨 Vui lòng chỉ định người cần bỏ chặn.\n` +
        `Cú pháp: ${prefix}unblockbot all @mention\n` +
        `Hoặc: ${prefix}unblockbot all <UID>`,
      false, 60000, false
    );
    return;
  }

  // Unblock trên tất cả bot (cả bot đang chạy và bot trong thư mục logs)
  const botIdSet = new Set(Object.keys(apiManager.apiManagerObject || {}));
  try {
    const logsDir = path.join(process.cwd(), "logs");
    if (fs.existsSync(logsDir)) {
      for (const entry of fs.readdirSync(logsDir)) {
        if (/^\d+$/.test(entry)) botIdSet.add(entry);
      }
    }
  } catch (e) {
    console.error("Lỗi duyệt thư mục logs:", e);
  }

  let totalBots = 0;
  let totalUnblocked = 0;

  for (const mBotId of botIdSet) {
    const mngrData = managerDataCache.get(mBotId);
    if (!mngrData) continue;
    if (!mngrData.blockBot) mngrData.blockBot = [];

    totalBots++;
    for (const item of listIdUnblock) {
      const normalizedTarget = String(item.targetId).replace(/_0$/, "");
      const index = mngrData.blockBot.findIndex(
        (blocked) => String(blocked.idUserZalo).replace(/_0$/, "") === normalizedTarget
      );
      if (index !== -1) {
        mngrData.blockBot.splice(index, 1);
        totalUnblocked++;
      }
    }
    managerDataCache.setChanged(mBotId);
    managerDataCache.save(mBotId);
  }

  const targetNames = listIdUnblock.map((item) => item.targetName).join(", ");
  await sendMessageStateQuote(
    api, message,
    `✅ Đã bỏ chặn toàn hệ thống đối với: ${targetNames}\n` +
      `📊 Đã gỡ ${totalUnblocked} lượt chặn trên ${totalBots} bot.`,
    true, 300000, false
  );
}

export async function getGroupBlockList(api, message) {
  const threadId = message.threadId;
  let listBlockedUsers = [];
  let continueGet = true;
  let page = 1;

  try {
    while (continueGet) {
      const blockList = await api.getGroupBlockList(threadId, page);
      if (blockList && blockList.blocked_members && blockList.blocked_members.length > 0) {
        blockList.blocked_members = blockList.blocked_members.map((member) => {
          if (member.avatar && !member.avatar.startsWith("https:")) {
            member.avatar = "https:" + member.avatar;
          }
          if (member.avatar_25 && !member.avatar_25.startsWith("https:")) {
            member.avatar_25 = "https:" + member.avatar_25;
          }
          return member;
        });
        listBlockedUsers = [...listBlockedUsers, ...blockList.blocked_members];
        continueGet = blockList.has_more;
        page += 1;
      } else {
        continueGet = false;
      }
    }
    return listBlockedUsers;
  } catch (error) {
    throw error;
  }
}

export async function handleGroupBlockList(api, message, args, aliasCommand, groupTypeString) {
  const prefix = getGlobalPrefix(api.getBotId());

  // Nếu không có args hoặc args rỗng
  if (!args || args.length < 1) {
    await sendMessageStateQuote(
      api,
      message,
      `Cú pháp: ${prefix}${aliasCommand} <add/remove/list> <UID|index>\n` +
      `list: hiển thị danh sách đối tượng chặn trong ${groupTypeString}.\n` +
      "add: thêm đối tượng vào danh sách chặn (thông qua mention hoặc uid chỉ định).\n" +
      "remove: xóa đối tượng khỏi danh sách chặn thông qua index.",
      false,
      60000,
      false
    );
    return;
  }

  // Bọc thêm kiểm tra an toàn cho args[0]
  const action = typeof args[0] === "string" ? args[0].toLowerCase() : "";

  switch (action) {
    case "add":
      {
        const uid = args[1];
        if (!uid) {
          await sendMessageWarning(api, message, "🚨 Vui lòng nhập UID cần chặn!");
          return;
        }

        let userInfo;
        try {
          userInfo = await getUserInfoBasic(api, uid);
        } catch (error) {
          console.error(`Không thể lấy thông tin cho người dùng ${uid}:`, error);
        }

        const result = await api.blockUsers(message.threadId, [uid]);
        if (result.errorMembers && result.errorMembers.length > 0) {
          await sendMessageWarning(api, message, "Ném Đây Cái Key Vàng 🔑, Tôi Block Cho Bạn Xem :D 🚀", false);
          return;
        }

        await sendMessageStateQuote(
          api,
          message,
          `🚨 Đã chặn tài khoản sau khỏi ${groupTypeString}: ${userInfo ? userInfo.displayName : uid}.`,
          false,
          300000,
          false
        );
      }
      break;

    case "remove": {
      const stt = args[1];
      const blockList = await getGroupBlockList(api, message);

      if (!blockList || blockList.length === 0) {
        await sendMessageStateQuote(
          api,
          message,
          `🚨 Không có ai bị chặn trong ${groupTypeString} để mở chặn.`,
          false,
          60000,
          false
        );
        return;
      }

      // ✅ Mở chặn tất cả
      if (stt && stt.toLowerCase() === "all") {
        const allIds = blockList.map(u => u.id);

        const result = await api.unblockUsers(message.threadId, allIds);
        if (result.errorMembers && result.errorMembers.length > 0) {
          await sendMessageWarning(api, message, `Mình không đủ quyền hạn để mở chặn tất cả`);
          return;
        }

        await sendMessageStateQuote(
          api,
          message,
          `✅ Đã mở chặn ${blockList.length} tài khoản trong ${groupTypeString}.`,
          false,
          300000,
          false
        );
        return;
      }

      // ✅ Mở chặn theo số thứ tự như cũ
      if (!stt || isNaN(stt)) {
        await sendMessageStateQuote(
          api,
          message,
          `🚨 Vui lòng nhập số thứ tự hoặc "all" để mở chặn tất cả.\n` +
          `Ví dụ:\n• ${prefix}${aliasCommand} remove 1\n• ${prefix}${aliasCommand} remove all\nĐể xem danh sách chặn: ${prefix}${aliasCommand} list`,
          false,
          60000,
          false
        );
        return;
      }

      const index = parseInt(stt) - 1;
      if (index < 0 || index >= blockList.length) {
        await sendMessageStateQuote(
          api,
          message,
          `🚨 Số thứ tự không hợp lệ.\nĐể xem danh sách chặn: ${prefix}${aliasCommand} list`,
          false,
          60000,
          false
        );
        return;
      }

      const targetId = blockList[index].id;
      const result = await api.unblockUsers(message.threadId, [targetId]);
      if (result.errorMembers && result.errorMembers.length > 0) {
        await sendMessageWarning(api, message, `Mình không đủ quyền hạn để mở chặn tài khoản này`);
        return;
      }

      await sendMessageStateQuote(
        api,
        message,
        `✅ Đã mở chặn tài khoản: ${blockList[index].dName}`,
        false,
        300000,
        false
      );
      break;
    }


    case "list":
      {
        try {
          const blockList = await getGroupBlockList(api, message);
          if (blockList && blockList.length > 0) {
            let imagePath = null;
            try {
              imagePath = await createBlockListImage(blockList, groupTypeString);
              const sent = await sendMessageCompleteRequest(
                api,
                message,
                {
                  caption:
                    `Đây là danh sách người dùng bị chặn trong ${groupTypeString}.\n` +
                    `Reply tin này: remove <số thứ tự>`,
                  imagePath,
                },
                BLOCK_LIST_SESSION_TTL
              );
              for (const msgId of getSentMessageIds(sent)) {
                blockListReplySessions.set(msgId, {
                  botId: String(api.getBotId()),
                  threadId: String(message.threadId),
                  requesterId: String(message.data.uidFrom),
                  groupTypeString,
                  blockList: blockList.map((item) => ({ id: String(item.id), dName: item.dName || String(item.id) })),
                });
              }
            } catch (error) {
              console.error("Lỗi khi tạo ảnh block list:", error);
              const listBlockedUsers = blockList.map((blocked) => blocked.dName);
              const chunksArr = chunkArray(listBlockedUsers, 50);
              await sendMessageStateQuote(
                api,
                message,
                `Danh sách tài khoản bị chặn trong ${groupTypeString} này:\n${chunksArr[0]
                  .map((user, index) => `- ${index + 1}. ${user}`)
                  .join("\n")}`,
                false,
                180000,
                false
              );
              if (chunksArr.length > 1) {
                for (let i = 1; i < chunksArr.length; i++) {
                  await sendMessageStateQuote(
                    api,
                    message,
                    chunksArr[i].map((user, index) => `- ${index + 1 + i * 50}. ${user}`).join("\n"),
                    false,
                    180000,
                    false
                  );
                }
              }
            } finally {
              deleteFile(imagePath);
            }
          } else {
            await sendMessageStateQuote(
              api,
              message,
              `🚨 Không có ai bị chặn trong ${groupTypeString} này.`,
              false,
              60000,
              false
            );
          }
        } catch (error) {
          console.error("Lỗi khi lấy danh sách block:", error);
          await sendMessageStateQuote(
            api,
            message,
            `Không thể lấy được danh sách chặn thành viên từ ${groupTypeString}`,
            false,
            60000,
            false
          );
        }
      }
      break;

    default:
      await sendMessageStateQuote(
        api,
        message,
        `Cú pháp: ${prefix}${aliasCommand} <add/remove/list> <UID|index>\n` +
        `list: hiển thị danh sách đối tượng chặn trong ${groupTypeString}.\n` +
        "add: thêm đối tượng vào danh sách chặn (thông qua mention hoặc uid chỉ định).\n" +
        "remove: xóa đối tượng khỏi danh sách chặn thông qua index.",
        false,
        60000,
        false
      );
      break;
  }
}

export async function handleBlockListReply(api, message) {
  const sessionKey = getQuotedMessageIds(message).find((id) => blockListReplySessions.has(id));
  if (!sessionKey) return false;

  const session = blockListReplySessions.get(sessionKey);
  if (
    session.botId !== String(api.getBotId()) ||
    session.threadId !== String(message.threadId) ||
    session.requesterId !== String(message.data.uidFrom)
  ) {
    return false;
  }

  const match = removeMention(message).trim().match(/^(?:block\s+)?remove\s+(\d+)$/iu);
  if (!match) return false;

  const index = Number(match[1]) - 1;
  const target = session.blockList[index];
  if (!target) {
    await sendMessageWarning(api, message, "Số thứ tự không hợp lệ hoặc danh sách đã thay đổi.", false);
    return true;
  }

  try {
    const result = await api.unblockUsers(message.threadId, [target.id]);
    if (result?.errorMembers?.length) {
      await sendMessageWarning(api, message, "Mình không đủ quyền để mở chặn tài khoản này.", false);
      return true;
    }

    session.blockList.splice(index, 1);
    blockListReplySessions.set(sessionKey, session);
    await sendMessageComplete(api, message, `Đã bỏ chặn ${target.dName}.`, false, 60000);
  } catch (error) {
    console.error("Lỗi mở chặn từ block list:", error);
    await sendMessageWarning(api, message, `Không thể mở chặn: ${error.message}`, false);
  }
  return true;
}

export async function handleSettingGroupCommand(api, message, groupInfo, aliasCommand) {
  const content = removeMention(message);
  const threadId = message.threadId;
  const prefix = getGlobalPrefix(api.getBotId());
  const args = content.slice(prefix.length).trim().split(/\s+/);
  const groupTypeString = groupInfo.groupType === 1 ? "Nhóm" : "Cộng Đồng";

  args.shift();
  const legacyKeyCommand = String(aliasCommand || "").toLowerCase();
  if (["keygold", "keysilver", "unkey", "listkey"].includes(legacyKeyCommand)) {
    args.unshift(legacyKeyCommand);
  }

  if (args.length < 1) {
    const result = {
      success: false,
      message:
        `Sử dụng: ${prefix}${aliasCommand} <loại config> <giá trị>` +
        `\n\n[Cài đặt Bật/Tắt] (on/off hoặc 1/0):` +
        `\n- lockchat on/off: ${groupInfo.setting?.lockSendMsg ? "Tắt" : "Mở"} chat trong ${groupTypeString}` +
        `\n- lockchat HH:MM HH:MM: Tự khóa/mở chat hằng ngày theo giờ Việt Nam` +
        `\n- lockchat status|cancel: Xem hoặc hủy lịch khóa chat` +
        `\n- lockview: ${groupInfo.setting?.lockViewMember ? "Tắt" : "Mở"} xem thành viên trong ${groupTypeString}` +
        `\n- history: ${groupInfo.setting?.enableMsgHistory ? "Mở" : "Tắt"
        } cho phép thành viên mới đọc tin nhắn gần nhất` +
        `\n- joinappr: ${groupInfo.setting?.joinAppr ? "Mở" : "Tắt"} chế độ phê duyệt thành viên` +
        `\n- showkey: ${groupInfo.setting?.signAdminMsg ? "Mở" : "Tắt"} hiển thị key quản trị` +
        `\n\n[Quản lý Key]:` +
        `\n- keygold [@mention]: Nhường trưởng nhóm/key vàng` +
        `\n- keysilver [@mention]: Phong phó nhóm/key bạc` +
        `\n- unkey [@mention]: Gỡ phó nhóm/key bạc` +
        `\n- listkey: Xem danh sách key vàng/key bạc` +
        `\n\n[Cài đặt List]:` +
        `\n- block <add/remove/list> <@mention|index>: Thêm/xóa/xem danh sách chặn trong ${groupTypeString}` +
        `\n- noactive [trang]: Xem thành viên ít/không tương tác (25 người/trang, chu kỳ 15 ngày)` +
        `\n- noactive reset: Reset chu kỳ tương tác ngay lập tức` +
        `\n\n[Cài đặt Chuỗi]:` +
        `\n- name <tên mới>: Đổi tên ${groupTypeString}` +
        `\n\n[Cài đặt Link]:` +
        `\n- changelink: Tạo link mới cho ${groupTypeString}` +
        `\n- disablelink: Tắt link tham gia ${groupTypeString}` +
        `\n\n[Cài đặt Avatar]:` +
        `\n- avatar: Đổi ảnh đại diện ${groupTypeString} (reply ảnh)`,
    };
    await sendMessageFromSQL(api, message, result, false, 60000);
    return;
  }

  const settingType = args[0].toLowerCase();
  const argsList = args.slice(1);
  const value = argsList.join(" ");
  const toggleValue = argsList[0]?.toLowerCase();
  const rawSchedule = argsList[1];
  const rawSchedule2 = argsList[2];
  const hasTime1 = isTimeFormat(rawSchedule);
  const hasTime2 = isTimeFormat(rawSchedule2);
  const isTimeWindow = hasTime1 && hasTime2;
  const delayMsSingle = getDelayFromSchedule(rawSchedule);

  if (["noactive", "inactive", "lowactive", "ittt"].includes(settingType)) {
    await handleLowInteractionMembers(api, message, groupInfo, argsList, aliasCommand);
    return;
  }

  if (settingType === "lockchat") {
    const firstArg = argsList[0]?.toLowerCase();
    const botGroupSettings = groupSettingsAll.getByID(api.getBotId());
    if (!botGroupSettings[threadId]) botGroupSettings[threadId] = {};

    if (["status", "view", "show"].includes(firstArg)) {
      const config = botGroupSettings[threadId].lockChatSchedule;
      await sendMessageStateQuote(
        api,
        message,
        config?.enabled
          ? `⏰ Lịch khóa chat đang bật:\n- Khóa lúc: ${config.lockTime}\n- Mở lúc: ${config.unlockTime}\n- Múi giờ: Việt Nam`
          : `Chưa đặt lịch khóa/mở chat tự động cho ${groupTypeString}.`,
        !!config?.enabled,
        60000
      );
      return;
    }

    if (["cancel", "clear", "stop", "huy", "hủy"].includes(firstArg)) {
      clearLockChatTimer(threadId);
      delete botGroupSettings[threadId].lockChatSchedule;
      groupSettingsAll.setChanged();
      await sendMessageStateQuote(api, message, `Đã hủy lịch khóa/mở chat tự động của ${groupTypeString}.`, true, 60000);
      return;
    }

    let lockTime = null;
    let unlockTime = null;
    if (isTimeFormat(argsList[0]) && isTimeFormat(argsList[1])) {
      [lockTime, unlockTime] = [argsList[0], argsList[1]];
    } else if (["schedule", "time", "hen", "hẹn"].includes(firstArg)) {
      [lockTime, unlockTime] = [argsList[1], argsList[2]];
    } else if (["on", "1"].includes(firstArg) && isTimeFormat(argsList[1]) && isTimeFormat(argsList[2])) {
      [lockTime, unlockTime] = [argsList[1], argsList[2]];
    }

    if (lockTime || unlockTime) {
      const lockMinutes = timeToMinutes(lockTime);
      const unlockMinutes = timeToMinutes(unlockTime);
      if (lockMinutes === null || unlockMinutes === null || lockMinutes === unlockMinutes) {
        await sendMessageStateQuote(
          api,
          message,
          `Giờ khóa/mở không hợp lệ hoặc đang trùng nhau. Ví dụ: ${prefix}stg lockchat 22:00 06:00`,
          false,
          60000
        );
        return;
      }

      const currentTime = getTimeInZone();
      const shouldLockNow = isInsideLockChatWindow(currentTime, lockTime, unlockTime);
      const currentSettings = { ...(groupInfo.setting || {}), lockSendMsg: shouldLockNow ? 1 : 0 };

      try {
        await api.changeGroupSetting(threadId, currentSettings);
        clearLockChatTimer(threadId);
        botGroupSettings[threadId].lockChatSchedule = {
          enabled: true,
          lockTime,
          unlockTime,
          timeZone: LOCK_CHAT_TIME_ZONE,
          lastActionKey: null,
          updatedAt: Date.now(),
        };
        groupSettingsAll.setChanged();
        await sendMessageStateQuote(
          api,
          message,
          `✅ Đã đặt lịch hằng ngày:\n- Khóa chat lúc ${lockTime}\n- Mở chat lúc ${unlockTime}\n- Múi giờ Việt Nam\nHiện tại chat đang ${shouldLockNow ? "khóa" : "mở"}.`,
          true,
          60000
        );
      } catch (error) {
        await sendMessageStateQuote(api, message, `Không thể đặt lịch khóa chat: ${error.message}`, false, 60000);
      }
      return;
    }
  }

  if (["keygold", "keysilver", "unkey"].includes(settingType)) {
    const action = settingType === "keygold" ? "gold" : settingType === "keysilver" ? "silver" : "unkey";
    const mentions = message.data.mentions || [];

    if (mentions.length === 0) {
      const senderId = message.data.uidFrom;
      await handleKeyAction(api, message, null, threadId, senderId, action, "Bạn");
    } else {
      for (const mention of mentions) {
        const targetName = message.data.content
          .substring(mention.pos, mention.pos + mention.len)
          .replace("@", "");
        await handleKeyAction(api, message, null, threadId, mention.uid, action, targetName);
      }
    }

    groupSettingsAll.setChanged();
    return;
  }

  if (settingType === "listkey") {
    await handleListKey(api, message, groupInfo, aliasCommand);
    return;
  }

  if (settingType === "changelink") {
    const groupId = groupInfo.groupId;
    if (!groupId) {
      await sendMessageStateQuote(api, message, "Lỗi: Không tìm thấy groupId.", false, 30000);
      return;
    }
    try {
      await api.changeGroupLink(threadId);
      await sendMessageStateQuote(api, message, `✅ Đã tạo link mới cho ${groupTypeString}!`, true, 30000);
    } catch (error) {
      console.error("❌ Lỗi khi tạo link mới:", error);
      await sendMessageStateQuote(api, message, `❌ Không thể tạo link mới cho ${groupTypeString}: ${error.message}`, false, 30000);
    }
    return;
  }

  if (settingType === "disablelink") {
    const groupId = groupInfo.groupId;
    if (!groupId) {
      await sendMessageStateQuote(api, message, "Lỗi: Không tìm thấy groupId.", false, 30000);
      return;
    }
    try {
      await api.disableGroupLink(groupId);
      await sendMessageStateQuote(api, message, `✅ Đã tắt link tham gia ${groupTypeString}!`, true, 30000);
    } catch (error) {
      console.error("❌ Lỗi khi tắt link nhóm:", error);
      await sendMessageStateQuote(api, message, `❌ Không thể tắt link ${groupTypeString}: ${error.message}`, false, 30000);
    }
    return;
  }

  if (settingType === "avatar") {
    const groupId = groupInfo.groupId;
    if (!groupId) {
      await sendMessageStateQuote(api, message, "Lỗi: Không tìm thấy groupId.", false, 30000);
      return;
    }
    const quote = message.data?.quote;
    if (!quote || !quote.attach) {
      await sendMessageStateQuote(api, message, "Vui lòng reply vào một tin nhắn có ảnh để đặt làm ảnh đại diện!", false, 30000);
      return;
    }
    let imageUrl;
    try {
      const attachData = JSON.parse(quote.attach);
      const params = attachData.params ? JSON.parse(attachData.params) : {};
      imageUrl = params.hd || attachData.href;
    } catch (error) {
      console.error('❌ Parse error:', error);
      await sendMessageStateQuote(api, message, "Dữ liệu ảnh không hợp lệ trong tin nhắn được reply!", false, 30000);
      return;
    }
    if (!imageUrl) {
      await sendMessageStateQuote(api, message, "Không tìm thấy URL ảnh hợp lệ trong tin nhắn được reply!", false, 30000);
      return;
    }
    const tempDir = path.resolve(__dirname, 'cache');
    let avatarPath = null;
    try {
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
    } catch (mkdirError) {
      console.error('❌ mkdir error:', mkdirError);
      await sendMessageStateQuote(api, message, `Lỗi tạo thư mục tạm: ${mkdirError.message}`, false, 30000);
      return;
    }
    avatarPath = path.resolve(tempDir, `avatar_${groupId}_${Date.now()}.jpg`);
    try {
      const { default: axios } = await import('axios');
      const writer = fs.createWriteStream(avatarPath);
      const response = await axios({
        url: imageUrl,
        method: 'GET',
        responseType: 'stream',
        timeout: 15000,
        validateStatus: (status) => status < 400
      });
      await new Promise((resolve, reject) => {
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
        response.data.on('error', reject);
      });
      await api.changeGroupAvatar(groupId, avatarPath);
      await sendMessageStateQuote(api, message, `✅ Ảnh đại diện của ${groupTypeString} đã được thay đổi thành công!`, true, 30000);
    } catch (error) {
      console.error('❌ Main process error:', error);
      await sendMessageStateQuote(api, message, `Lỗi khi đổi ảnh đại diện ${groupTypeString}: ${error.message}`, false, 30000);
    } finally {
      if (avatarPath && fs.existsSync(avatarPath)) {
        try {
          fs.unlinkSync(avatarPath);
        } catch (cleanupError) {
          console.error('⚠️ Cleanup error:', cleanupError);
        }
      }
    }
    return;
  }

  // Xử lý các cài đặt chuỗi
  if (["name"].includes(settingType)) {
    if (!value) {
      await sendMessageStateQuote(api, message, `Vui lòng nhập giá trị cho cài đặt ${settingType}`, false, 60000);
      return;
    }

    try {
      switch (settingType) {
        case "name":
          await api.changeGroupName(threadId, value);
          await sendMessageStateQuote(api, message, `Đã đổi tên ${groupTypeString} thành: ${value}`, true, 60000);
          break;
      }
      return;
    } catch (error) {
      console.error(`Lỗi khi thay đổi ${settingType}:`, error);
      await sendMessageStateQuote(api, message, `Không thể thay đổi ${settingType}: ${error.message}`, false, 60000);
      return;
    }
  }

  // Xử lý các cài đặt list
  if (["block"].includes(settingType)) {
    try {
      switch (settingType) {
        case "block":
          await handleGroupBlockList(api, message, argsList, aliasCommand, groupTypeString);
          break;
      }
      return;
    } catch (error) {
      console.error(`Lỗi khi thay đổi ${settingType}:`, error);
      await sendMessageStateQuote(api, message, `Không thể thay đổi ${settingType}: ${error.message}`, false, 60000);
      return;
    }
  }

  // Xử lý các cài đặt on/off
  if (!toggleValue || !["on", "off", "0", "1"].includes(toggleValue)) {
    await sendMessageStateQuote(api, message, `Vui lòng chọn on/off hoặc 1/0 để thay đổi cài đặt`, false, 60000);
    return;
  }

  const newValue = ["on", "1"].includes(toggleValue) ? 1 : 0;
  const currentSettings = groupInfo.setting || {};

  try {
    switch (settingType) {
      case "lockchat":
        if (rawSchedule && !delayMsSingle && !isTimeWindow) {
          await sendMessageStateQuote(
            api,
            message,
            `Thời gian hẹn giờ không hợp lệ! Dùng số phút hoặc định dạng HH:MM.`,
            false,
            60000
          );
          break;
        }

        clearLockChatTimer(threadId);
        currentSettings.lockSendMsg = newValue;

        // Hẹn giờ theo khung giờ: HH:MM HH:MM
        if (isTimeWindow) {
          const delayStart = parseTimeToDelay(rawSchedule);
          let delayEnd = parseTimeToDelay(rawSchedule2);

          if (!delayStart || !delayEnd || delayStart <= 0) {
            await sendMessageStateQuote(api, message, `Thời gian hẹn giờ phải lớn hơn hiện tại!`, false, 60000);
            break;
          }

          if (delayEnd <= delayStart) {
            delayEnd += 24 * 60 * 60 * 1000; // chuyển sang ngày hôm sau nếu giờ mở sớm hơn/ bằng giờ khóa
          }

          const statusTextStart = newValue === 1 ? "tắt" : "mở";
          const nextValue = newValue === 1 ? 0 : 1;
          const statusTextEnd = nextValue === 1 ? "tắt" : "mở";

          scheduleLockChatToggle(
            api,
            message,
            threadId,
            { ...currentSettings },
            newValue,
            delayStart,
            groupTypeString,
            `⏰ Hẹn giờ: Đã tự động ${statusTextStart} chat cho ${groupTypeString} (khung ${rawSchedule} - ${rawSchedule2}).`
          );

          scheduleLockChatToggle(
            api,
            message,
            threadId,
            { ...currentSettings },
            nextValue,
            delayEnd,
            groupTypeString,
            `⏰ Hẹn giờ: Đã tự động ${statusTextEnd} chat cho ${groupTypeString} (kết thúc hẹn giờ ${rawSchedule2}).`
          );

          await sendMessageStateQuote(
            api,
            message,
            `Đã đặt hẹn giờ: ${statusTextStart} chat lúc ${rawSchedule} và ${statusTextEnd} chat lúc ${rawSchedule2}.`,
            true,
            60000
          );
          break;
        }

        const status = newValue === 1 ? "tắt" : "mở";
        let successMessage = `Đã ${status} chat cho tất cả thành viên!`;

        if (delayMsSingle) {
          const nextValue = newValue === 1 ? 0 : 1;
          const nextStatusText = nextValue === 1 ? "tắt" : "mở";
          const delayMs = delayMsSingle;

          if (!delayMs || delayMs <= 0) {
            await sendMessageStateQuote(
              api,
              message,
              `Thời gian hẹn giờ phải lớn hơn hiện tại!`,
              false,
              60000
            );
            break;
          }

          scheduleLockChatToggle(api, message, threadId, { ...currentSettings }, nextValue, delayMs, groupTypeString);
        }

        await updateGroupSetting(api, message, threadId, currentSettings, successMessage);
        break;

      case "lockview":
        currentSettings.lockViewMember = newValue;
        const memberStatus = newValue === 1 ? "tắt" : "mở";
        await updateGroupSetting(
          api,
          message,
          threadId,
          currentSettings,
          `Đã ${memberStatus} xem thành viên trong ${groupTypeString}!`
        );
        break;

      case "history":
        currentSettings.enableMsgHistory = newValue;
        const historyStatus = newValue === 1 ? "mở" : "tắt";
        await updateGroupSetting(
          api,
          message,
          threadId,
          currentSettings,
          `Đã ${historyStatus} cho phép thành viên mới đọc tin nhắn gần nhất!`
        );
        break;

      case "joinappr":
        currentSettings.joinAppr = newValue;
        const joinApprStatus = newValue === 1 ? "mở" : "tắt";
        await updateGroupSetting(
          api,
          message,
          threadId,
          currentSettings,
          `Đã ${joinApprStatus} chế độ phê duyệt thành viên!`
        );
        break;

      case "showkey":
        currentSettings.signAdminMsg = newValue;
        const showKeyStatus = newValue === 1 ? "mở" : "tắt";
        await updateGroupSetting(api, message, threadId, currentSettings, `Đã ${showKeyStatus} hiển thị key quản trị!`);
        break;

      // Thêm các case khác ở đây trong tương lai
      // case "setting_name":
      //   currentSettings.settingKey = newValue;
      //   await updateGroupSetting(...);
      //   break;

      default:
        await sendMessageStateQuote(api, message, `Loại cài đặt '${settingType}' không hợp lệ!`, false, 60000);
        break;
    }
  } catch (error) {
    console.error("Lỗi khi thay đổi cài đặt nhóm:", error);
    await sendMessageStateQuote(
      api,
      message,
      `Không thể thay đổi cài đặt ${groupTypeString}: ${error.message}`,
      false,
      60000
    );
  }
}
async function updateGroupSetting(api, message, threadId, settings, successMessage) {
  await api.changeGroupSetting(threadId, settings);
  await sendMessageStateQuote(api, message, successMessage, true, 60000);
}

async function createBlockListImage(blockList, groupTypeString) {
  const items = blockList.map((blockedUser) => ({
    name: blockedUser.dName || blockedUser.displayName || "Người dùng",
    info: `UID: ${blockedUser.id || blockedUser.idUserZalo || "Không xác định"}`,
    avatar: blockedUser.avatar || "",
    status: "reject",
    badge: "BANNED",
  }));

  const options = {
    columnCount: items.length > 10 ? 2 : 1,
  };

  const titleConfig = {
    mainTitle: "BLOCK-LIST-IN-GROUP",
    subTitle: `Danh Sách Chặn Của ${groupTypeString}`,
    icon: "🚫",
  };

  return await createListImage(options, items, titleConfig);
}

async function createBotBlockListImage(blockList) {
  const items = blockList.map((blockedUser) => ({
    name: blockedUser.displayName || blockedUser.dName || "Người dùng",
    info: `UID: ${String(blockedUser.idUserZalo || blockedUser.id || "").replace(/_0$/, "")}`,
    avatar: blockedUser.avatar || "",
    status: "reject",
    badge: "BANNED",
  }));

  const options = {
    columnCount: items.length > 10 ? 2 : 1,
  };

  const titleConfig = {
    mainTitle: "BOT-BLOCK-LIST",
    subTitle: "Danh Sách Bị Chặn Trên Bot",
    icon: "🚫",
  };

  return await createListImage(options, items, titleConfig);
}

export async function handleListKey(api, message, groupInfo, aliasCommand) {
  const threadId = message.threadId;
  const prefix = getGlobalPrefix(api.getBotId());
  const groupTypeString = groupInfo.groupType === 1 ? "Nhóm" : "Cộng Đồng";

  let fullGroupInfo;
  try {
    fullGroupInfo = await getGroupInfoData(api, threadId);
  } catch (error) {
    console.error("Lỗi lấy thông tin nhóm:", error);
    await sendMessageWarning(api, message, "Không thể lấy thông tin nhóm.", false);
    return;
  }

  const creatorId = fullGroupInfo.creatorId;
  const adminIds = fullGroupInfo.adminIds || [];

  const allAdminIds = [...new Set([creatorId, ...adminIds])];

  if (allAdminIds.length === 0) {
    await sendMessageStateQuote(api, message, `Không có quản trị viên nào trong ${groupTypeString} này.`, false, 60000, false);
    return;
  }

  let userInfos = {};
  try {
    userInfos = await getUsersInfoBasic(api, allAdminIds);
  } catch (error) {
    console.error("Lỗi lấy thông tin người dùng:", error);
  }

  const keyUsers = allAdminIds.map(uid => {
    const info = userInfos[uid] || { displayName: "Ẩn danh", avatar: null };
    const isCreator = uid === creatorId;
    return {
      ...info,
      id: uid,
      role: isCreator ? "Key Vàng" : "Key Bạc",
      roleColor: isCreator ? "#FFD700" : "#C0C0C0",
      roleIcon: isCreator ? "Crown" : "Shield",
    };
  });
  keyUsers.sort((a, b) => (a.role === "Key Vàng" ? -1 : 1));

  let imagePath = null;
  try {
    imagePath = await createKeyListImage(keyUsers, fullGroupInfo);
    await sendMessageFromSQL(api, message, {
      success: true,
      message: ``
    }, false, 600000);
    await sendMessageCompleteRequest(
      api,
      message,
      {
        caption: `Danh sách quản trị viên trong ${groupTypeString}:`,
        imagePath,
      },
      600000
    );
  } catch (error) {
    console.error("Lỗi tạo ảnh listkey:", error);
    // Fallback text
    const text = keyUsers
      .map((u, i) => `${i + 1}. ${u.roleIcon} **${u.role}**: ${u.displayName}`)
      .join("\n");
    await sendMessageStateQuote(api, message, `Danh sách quản trị viên:\n${text}`, false, 180000, false);
  } finally {
    deleteFile(imagePath);
  }
}

async function createKeyListImage(keyUsers, groupInfo) {
  let groupTypeString = "Nhóm";
  try {
    if (groupInfo && (groupInfo.groupType || groupInfo.type)) {
      const type = groupInfo.groupType ?? groupInfo.type;
      if (type === 2) groupTypeString = "Cộng Đồng";
      else groupTypeString = "Nhóm";
    }
  } catch {
    groupTypeString = "Nhóm";
  }
  const tempCanvas = createCanvas(1, 1);
  const tempCtx = tempCanvas.getContext("2d");
  tempCtx.font = "bold 32px " + FONT_MAIN;
  const avatarSize = 80;
  const padding = 30;
  const nameWidth = 400;
  const roleWidth = 180;
  const extraPadding = padding * 4;
  const totalUsers = keyUsers.length;
  const useDoubleColumn = totalUsers > 8;
  const columnWidth = avatarSize + nameWidth + roleWidth + extraPadding;
  const width = useDoubleColumn ? columnWidth * 2 + padding * 2 : columnWidth;
  const headerHeight = 180;
  const itemHeight = 120;
  const itemsPerColumn = useDoubleColumn ? Math.ceil(totalUsers / 2) : totalUsers;
  const height = headerHeight + itemsPerColumn * itemHeight + 40;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const BACKGROUND_PATH = path.resolve("./assets/resources/images/listkey-background.jpeg");
  let bgLoaded = false;
  try {
    const bg = await loadImage(BACKGROUND_PATH);
    const coverScale = Math.max(width / bg.width, height / bg.height);
    const backgroundWidth = bg.width * coverScale;
    const backgroundHeight = bg.height * coverScale;
    const backgroundX = (width - backgroundWidth) / 2;
    const backgroundY = (height - backgroundHeight) * 0.28;
    ctx.drawImage(bg, backgroundX, backgroundY, backgroundWidth, backgroundHeight);
    bgLoaded = true;
    const overlay = ctx.createLinearGradient(0, 0, 0, height);
    overlay.addColorStop(0, "rgba(18, 12, 35, 0.48)");
    overlay.addColorStop(1, "rgba(8, 12, 35, 0.68)");
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, width, height);
  } catch (err) {
    console.warn("Lỗi tải ảnh nền:", err.message);
  }

  if (!bgLoaded) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "rgba(20, 40, 100, 0.95)");
    gradient.addColorStop(1, "rgba(10, 20, 70, 0.98)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }
  let yPos = padding * 2;
  ctx.textAlign = "center";
  ctx.font = "bold 48px " + FONT_MAIN;
  ctx.fillStyle = cv.getRandomGradient(ctx, width);
  ctx.fillText("KEY-LIST-IN-GROUP", width / 2, yPos);
  yPos += 80;
  ctx.font = `bold 36px ${FONT_MAIN}`;
  ctx.fillStyle = "#E3F2FD";
  ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
  ctx.shadowBlur = 8;
  ctx.fillText(`Quản Trị Viên Của ${groupTypeString}`, width / 2, yPos);
  ctx.shadowBlur = 0;
  yPos += 40;
  if (useDoubleColumn) {
    const midPoint = Math.ceil(keyUsers.length / 2);
    let leftYPos = yPos;
    for (let i = 0; i < midPoint; i++) {
      if (keyUsers[i]) {
        leftYPos = await drawKeyItem(ctx, keyUsers[i], leftYPos, i + 1, padding, 0, true, groupTypeString);
      }
    }

    let rightYPos = yPos;
    for (let i = midPoint; i < keyUsers.length; i++) {
      if (keyUsers[i]) {
        rightYPos = await drawKeyItem(ctx, keyUsers[i], rightYPos, i + 1, padding, columnWidth + padding * 2 - 30, true, groupTypeString);
      }
    }

    ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
    ctx.fillRect(width / 2 - 1, yPos - 20, 2, height - yPos + 20);
  } else {
    let index = 1;
    for (const user of keyUsers) {
      yPos = await drawKeyItem(ctx, user, yPos, index++, padding, 0, false, groupTypeString);
    }
  }
  const outputPath = path.join(tempDir, `key_list_${randomIDTemp()}.png`);
  const out = fs.createWriteStream(outputPath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);

  return new Promise((resolve, reject) => {
    out.on("finish", () => resolve(outputPath));
    out.on("error", reject);
  });
}

async function drawKeyItem(ctx, user, yPos, index, padding, xOffset, isDoubleColumn, groupTypeString) {
  const itemHeight = 120;
  try {
    const avatarSize = 80;
    const itemPadding = 20;
    const backgroundWidth = isDoubleColumn
      ? (ctx.canvas.width - padding * 4) / 2
      : ctx.canvas.width - padding * 2;

    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 1.5;
    ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 6;
    ctx.beginPath();
    ctx.roundRect(padding + xOffset, yPos, backgroundWidth, itemHeight - itemPadding, 16);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    const avatarX = padding * 2 + xOffset;
    const avatarY = yPos + (itemHeight - avatarSize) / 2 - itemPadding / 2;
    const centerX = avatarX + avatarSize / 2;
    const centerY = avatarY + avatarSize / 2;
    const outerRadius = avatarSize / 2 + 5;
    const glowRadius = avatarSize / 2 + 20;
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
    ctx.clip();
    const glow = ctx.createRadialGradient(centerX, centerY, avatarSize / 2, centerX, centerY, glowRadius);
    glow.addColorStop(0, user.role === "Key Vàng" ? "rgba(255, 215, 0, 0.5)" : "rgba(182, 176, 176, 0.91)");
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.fill();
    ctx.lineWidth = 5;
    const borderGrad = ctx.createLinearGradient(avatarX, avatarY, avatarX + avatarSize, avatarY + avatarSize);
    if (user.role === "Key Vàng") {
      borderGrad.addColorStop(0, "#FFD700");
      borderGrad.addColorStop(1, "#FFA500");
    } else {
      borderGrad.addColorStop(0, "#C0C0C0");
      borderGrad.addColorStop(1, "#A9A9A9");
    }
    ctx.strokeStyle = borderGrad;
    ctx.beginPath();
    ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);
    ctx.stroke();
    if (user.avatar && cv.isValidUrl(user.avatar)) {
      const avatar = await loadImage(user.avatar);
      ctx.beginPath();
      ctx.arc(centerX, centerY, avatarSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    } else {
      ctx.beginPath();
      ctx.arc(centerX, centerY, avatarSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = "#555";
      ctx.fill();
      ctx.fillStyle = "#FFF";
      ctx.font = `bold 28px ${FONT_MAIN}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("?", centerX, centerY);
    }
    ctx.restore();
    const separatorX = padding * 3 + avatarSize + xOffset;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(separatorX, yPos + itemPadding);
    ctx.lineTo(separatorX, yPos + itemHeight - itemPadding * 1.5);
    ctx.stroke();
    ctx.setLineDash([]);
    const textX = separatorX + padding * 1.8;
    const textY = yPos + itemPadding;
    ctx.font = `bold 32px ${FONT_MAIN}`;
    ctx.fillStyle = "#7ad6ddff";
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 4;
    ctx.textAlign = "left";
    ctx.fillText(`${index}. ${user.displayName}`, textX, textY + 28);
    ctx.shadowBlur = 0;
    let roleText = "";
    if (user.role === "Key Vàng") {
      roleText = groupTypeString === "Cộng Đồng" ? "👑 Trưởng Cộng Đồng" : "👑 Trưởng Nhóm";
    } else if (user.role === "Key Bạc") {
      roleText = groupTypeString === "Cộng Đồng" ? "🛡️ Phó Cộng Đồng" : "🛡️ Phó Nhóm";
    } else {
      return yPos + itemHeight; 
    }

    ctx.font = `600 28px ${FONT_MAIN}`;
    ctx.fillStyle = user.role === "Key Vàng" ? "#FFD700" : "#E5E7EB";
    ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
    ctx.shadowBlur = 3;
    ctx.fillText(roleText, textX, textY + 68);
    ctx.shadowBlur = 0;

    return yPos + itemHeight;
  } catch (error) {
    console.error("Lỗi vẽ key item:", error);
    return yPos + itemHeight;
  }
}

export async function handleSetMuteAll(api, message, aliasCommand = "setmute") {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const args = content.replace(`${prefix}${aliasCommand}`, "").trim().split(/\s+/).filter(Boolean);
  const scope = args[0]?.toLowerCase();
  const action = args[1]?.toLowerCase();
  const usage =
    `Cú pháp:\n` +
    `• ${prefix}${aliasCommand} all off — tắt thông báo tất cả nhóm\n` +
    `• ${prefix}${aliasCommand} all on — bật thông báo tất cả nhóm`;

  try {
    if (scope !== "all" || !["on", "off"].includes(action)) {
      await sendMessageQuery(api, message, usage, true);
      return;
    }

    const groups = await api.getAllGroups();
    const groupIds = Object.keys(groups?.gridVerMap || {});
    if (groupIds.length === 0) {
      await sendMessageWarning(api, message, "Không tìm thấy nhóm nào để cập nhật.", false);
      return;
    }

    const muteAction = action === "off" ? MuteAction.MUTE : MuteAction.UNMUTE;
    let success = 0;
    let failed = 0;
    for (const groupId of groupIds) {
      try {
        await api.setMute(
          { action: muteAction, ...(action === "off" ? { duration: -1 } : {}) },
          groupId,
          MessageType.GroupMessage
        );
        success += 1;
      } catch (error) {
        failed += 1;
        console.error(`Không thể ${action} thông báo nhóm ${groupId}:`, error);
      }
    }

    const state = action === "off" ? "tắt" : "bật";
    await sendMessageComplete(
      api,
      message,
      `Đã ${state} thông báo ${success}/${groupIds.length} nhóm${failed ? `, lỗi ${failed} nhóm` : ""}.`,
      true
    );
  } catch (error) {
    console.error("Lỗi setmute all:", error);
    await sendMessageWarning(api, message, `Không thể cập nhật thông báo: ${error.message}`, false);
  }
}

export async function handlePinConversation(api, message, aliasCommand = "gim") {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const args = content.replace(`${prefix}${aliasCommand}`, "").trim().split(/\s+/);
  const action = args[0]?.toLowerCase();

  try {
    if (!action) {
      await sendMessageQuery(
        api,
        message,
        `⚠️ Cú pháp: ${prefix}${aliasCommand} [on/off]\n` +
          `Ví dụ:\n` +
          `${prefix}${aliasCommand} on - Ghim cuộc trò chuyện\n` +
          `${prefix}${aliasCommand} off - Bỏ ghim cuộc trò chuyện`,
        true
      );
      return;
    }

    let threadId = message.threadId;
    const threadType = message.type === MessageType.DirectMessage ? MessageType.DirectMessage : MessageType.GroupMessage;
    
    if (threadType === MessageType.GroupMessage && message.data?.idTo) {
      threadId = message.data.idTo;
    }

    if (action === "on" || action === "ghim" || action === "pin") {
      await api.setPinnedConversations(true, threadId, threadType);
      await sendMessageComplete(api, message, "📌 Đã ghim cuộc trò chuyện này!", true);
    } else if (action === "off" || action === "boghim" || action === "unpin") {
      await api.setPinnedConversations(false, threadId, threadType);
      await sendMessageComplete(api, message, "📌 Đã bỏ ghim cuộc trò chuyện này!", true);
    } else {
      await sendMessageQuery(
        api,
        message,
        `⚠️ Cú pháp: ${prefix}${aliasCommand} [on/off]\n` +
          `Ví dụ:\n` +
          `${prefix}${aliasCommand} on - Ghim cuộc trò chuyện\n` +
          `${prefix}${aliasCommand} off - Bỏ ghim cuộc trò chuyện`,
        true
      );
    }
  } catch (error) {
    console.error("Error handling pin conversation:", error);
    await sendMessageWarning(api, message, `❌ Lỗi: ${error.message}`, false);
  }
}

export async function handleHiddenConversation(api, message, aliasCommand = "anbox") {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const commandPrefix = `${prefix}${aliasCommand}`;
  const args = content.toLowerCase().startsWith(commandPrefix.toLowerCase())
    ? content.slice(commandPrefix.length).trim().split(/\s+/).filter(Boolean)
    : [];
  const action = args[0]?.toLowerCase();

  try {
    if (action === "pin") {
      if (message.type !== MessageType.DirectMessage) {
        await sendMessageWarning(
          api,
          message,
          `🔒 Hãy gửi riêng cho bot: ${prefix}${aliasCommand} pin <4 số> để không lộ mã PIN trong nhóm.`,
          false
        );
        return;
      }
      if (!/^\d{4}$/.test(args[1] || "")) {
        await sendMessageWarning(api, message, `⚠️ PIN phải có đúng 4 chữ số. Ví dụ: ${prefix}${aliasCommand} pin 1234`, false);
        return;
      }
      await api.updateHiddenConversPin(args[1]);
      await sendMessageComplete(api, message, "🔐 Đã đặt mã PIN cho các cuộc trò chuyện ẩn.", false);
      return;
    }

    if (!["on", "an", "hide", "off", "hien", "unhide"].includes(action)) {
      await sendMessageQuery(
        api,
        message,
        `⚠️ Cú pháp:\n` +
          `${prefix}${aliasCommand} pin <4 số> — đặt PIN (chỉ dùng trong tin riêng)\n` +
          `${prefix}${aliasCommand} on — ẩn cuộc trò chuyện hiện tại\n` +
          `${prefix}${aliasCommand} off — bỏ ẩn cuộc trò chuyện hiện tại`,
        true
      );
      return;
    }

    const hidden = ["on", "an", "hide"].includes(action);
    const threadType = message.type === MessageType.GroupMessage
      ? MessageType.GroupMessage
      : MessageType.DirectMessage;
    await api.setHiddenConversations(hidden, String(message.threadId), threadType);

    // Gửi xác nhận trước khi ẩn để người vận hành biết thao tác đã được nhận.
    await sendMessageComplete(
      api,
      message,
      hidden ? "🔒 Đã ẩn cuộc trò chuyện này." : "🔓 Đã bỏ ẩn cuộc trò chuyện này.",
      false
    );
  } catch (error) {
    console.error("Error handling hidden conversation:", error);
    await sendMessageWarning(api, message, `❌ Không thể thay đổi trạng thái ẩn: ${error.message}`, false);
  }
}

export async function handleUpgradeGroupToCommunity(api, message, groupInfo = null) {
  const threadId = message.threadId;

  if (!threadId) {
    await sendMessageWarning(
      api,
      message,
      `⚠️ Không tìm thấy ID nhóm!`,
      false
    );
    return;
  }

  try {
    await api.upgradeGroupToCommunity(threadId);
    await sendMessageComplete(
      api,
      message,
      `✅ Đã nâng cấp nhóm thành cộng đồng thành công!\n\n` +
      `🆔 ID nhóm: ${threadId}\n` +
      `📢 Nhóm của bạn giờ đã là cộng đồng với nhiều tính năng mở rộng!`,
      true,
      60000
    );
  } catch (error) {
    console.error("[UpgradeGroupToCommunity] Error:", error);
    
    let errorMessage = `❌ Lỗi khi nâng cấp nhóm thành cộng đồng:\n\n`;
    
    if (error.code) {
      errorMessage += `📋 Mã lỗi: ${error.code}\n`;
    }
    
    if (error.message) {
      errorMessage += `📝 Chi tiết: ${error.message}`;
    } else {
      errorMessage += `📝 Vui lòng kiểm tra lại quyền của bot hoặc điều kiện nhóm!`;
    }
    
    await sendMessageWarning(api, message, errorMessage, false);
  }
}

export async function handlePinGroupMsg(api, message, aliasCommand = "gimtin") {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;

  if (message.type !== MessageType.GroupMessage) {
    await sendMessageWarning(
      api,
      message,
      "⚠️ Lệnh này chỉ hoạt động trong nhóm!",
      false
    );
    return;
  }

  try {
    const quote = message.data.quote;
    if (!quote) {
      await sendMessageQuery(
        api,
        message,
        `⚠️ Vui lòng reply vào tin nhắn cần ghim!\n` +
          `Cú pháp: ${prefix}${aliasCommand}\n` +
          `Ví dụ: Reply vào tin nhắn và gửi ${prefix}${aliasCommand}`,
        true
      );
      return;
    }

    let content = quote.msg || "";
    if (quote.attach) {
      try {
        content = JSON.parse(quote.attach);
      } catch (e) {

        content = quote.attach;
      }
    }

    const pinMsg = {
      msgType: quote.cliMsgType || "webchat",
      cliMsgId: quote.cliMsgId,
      msgId: quote.globalMsgId,
      uidFrom: quote.ownerId,
      dName: quote.fromD || "",
      content: content,
    };

    await api.pinGroupMsg(pinMsg, threadId);
    
    await sendMessageComplete(
      api,
      message,
      `📌 Đã ghim tin nhắn thành công!`,
      true,
      30000
    );
  } catch (error) {
    console.error("Error handling pin group message:", error);
    let errorMessage = `❌ Lỗi khi ghim tin nhắn:\n`;
    if (error.message) {
      errorMessage += `📝 ${error.message}`;
    } else {
      errorMessage += `📝 Vui lòng kiểm tra lại quyền của bot!`;
    }
    await sendMessageWarning(api, message, errorMessage, false);
  }
}
