import { removeMention } from "../../utils/format-util.js";
import { sendMessageComplete, sendMessageFailed } from "../../service-ngh/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-ngh/service.js";

const TIME_TO_LIVE = 600000;
// Endpoint invite/v2 khong on dinh voi batch lon. Cac lenh them thanh vien khac
// trong bot cung dung 5 UID/batch de tranh Zalo chi xu ly mot phan danh sach.
const BATCH_SIZE = 5;
const DELAY_MS = 3000;
const MEMBER_DELAY_MS = 500;
const FRIEND_PAGE_SIZE = 2000;
const MAX_FRIEND_PAGES = 100;
// Fallback cho cac tai khoan khong co quyen doc pending-mems/list.
// Tach theo bot + group de khong lam group nay anh huong group khac.
const pendingInviteCache = new Map();

function normalizeId(value) {
  if (value === undefined || value === null) return null;
  const id = String(value).replace(/_0$/u, "").trim();
  return id.length > 5 ? id : null;
}

function getErrorMembers(result) {
  const value = result?.errorMembers ?? result?.data?.errorMembers;
  return Array.isArray(value) ? value : [];
}

function extractFriends(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.friends)) return response.friends;
  if (Array.isArray(response?.data?.friends)) return response.data.friends;
  if (Array.isArray(response?.data?.items)) return response.data.items;
  return null;
}

function extractMemberIds(response) {
  const data = response?.data ?? response;
  const groupFromMap = data?.gridInfoMap && Object.values(data.gridInfoMap)[0];
  const members = [
    Array.isArray(data) ? data : null,
    data?.members,
    data?.pendingMembers,
    data?.pendingMems,
    data?.currentMems,
    data?.memVerList,
    data?.groupInfo?.members,
    data?.groupInfo?.pendingMembers,
    groupFromMap?.members,
    groupFromMap?.pendingMembers,
  ].find(Array.isArray) || [];

  return new Set(
    members
      .map(member => normalizeId(
        typeof member === "object"
          ? (member.id ?? member.uid ?? member.userId ?? member.memId)
          : member
      ))
      .filter(Boolean)
  );
}

async function fetchAllFriends(api) {
  const friends = [];
  const seenIds = new Set();

  for (let page = 1; page <= MAX_FRIEND_PAGES; page++) {
    const response = await api.getAllFriends(FRIEND_PAGE_SIZE, page);
    const pageFriends = extractFriends(response);
    if (!pageFriends) throw new Error(`API response trang ${page} không đúng format`);

    let newCount = 0;
    for (const friend of pageFriends) {
      const id = normalizeId(friend?.userId ?? friend?.uid ?? friend?.id);
      // Van giu record khong co UID de phan validate ben duoi thong bao dung,
      // nhung khong cho no lam sai dieu kien dung phan trang.
      if (!id) {
        friends.push(friend);
      } else if (!seenIds.has(id)) {
        seenIds.add(id);
        friends.push(friend);
        newCount++;
      }
    }

    // Trang cuoi thuong ngan hon page size. Neu server bo qua tham so page va
    // tra lai trang 1, newCount = 0 giup dung vong lap thay vi moi trung.
    if (pageFriends.length < FRIEND_PAGE_SIZE || newCount === 0) break;
  }

  return friends;
}

function isPendingApproval(error) {
  const code = error?.code ?? error?.errorCode ?? error?.err ?? error?.data?.code;
  const message = String(error?.message ?? error?.errorMessage ?? error?.msg ?? error ?? "");
  return Number(code) === 240 || /waiting for approve|cho phe duyet|chờ phê duyệt/iu.test(message);
}

/**
 * Lệnh mời tất cả bạn bè vào nhóm
 * @param {Object} api - Zalo API instance
 * @param {Object} message - Message object
 * @param {Array} aliasCommand - Command arguments
 */
export async function handleInviteAllFriendsCommand(api, message, aliasCommand) {
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const content = removeMention(message).replace(prefix, "").replace(aliasCommand, "").trim();

  if (content) {
    const caption =
      `Hướng dẫn dùng lệnh:\n` +
      `${prefix + aliasCommand}\n` +
      `Ví dụ: ${prefix + aliasCommand}\n` +
      `Lưu ý: Chỉ sử dụng trong nhóm chat!`;
    await sendMessageComplete(api, message, caption, false, TIME_TO_LIVE);
    return;
  }

  const threadID = message.threadID || message.thread_id || message.threadId;
  const senderID = message.senderID || message.sender_id || message.senderId;

  if (!threadID) {
    console.error("❌ Missing threadID:", message);
    await sendMessageFailed(api, message, "Không tìm thấy threadID!", true, TIME_TO_LIVE);
    return;
  }

  if (threadID === senderID) {
    await sendMessageComplete(api, message, "❌ Lệnh này chỉ sử dụng trong NHÓM CHAT!", false, TIME_TO_LIVE);
    return;
  }

  try {
    const pendingCacheKey = `${botId}:${threadID}`;
    const cachedPendingMembers = pendingInviteCache.get(pendingCacheKey) || new Set();
    let friends = [];

    try {
      friends = await fetchAllFriends(api);
    } catch (fetchError) {
      console.error("❌ Lỗi api.getAllFriends():", fetchError);
      await sendMessageFailed(
        api,
        message,
        `❌ Không thể lấy danh sách bạn bè!\nLỗi: ${fetchError.message}`,
        true,
        TIME_TO_LIVE
      );
      return;
    }

    if (!friends || friends.length === 0) {
      await sendMessageComplete(
        api,
        message,
        "❌ Không có bạn bè nào!\n💡 Tài khoản có thể chưa có bạn bè hoặc API lỗi.",
        false,
        TIME_TO_LIVE
      );
      return;
    }

    const validFriends = friends
      .filter(friend => {
        const id = normalizeId(friend.userId ?? friend.uid ?? friend.id);
        return Boolean(id);
      })
      .map(friend => {
        const id = normalizeId(friend.userId ?? friend.uid ?? friend.id);
        return {
          id: id,
          name: friend.name || friend.displayName || friend.fullName || friend.userName || `User_${id.slice(-8)}`
        };
      })
      .filter((friend, index, self) => 
        self.findIndex(f => f.id === friend.id) === index
      );

    if (validFriends.length === 0) {
      await sendMessageComplete(
        api,
        message,
        "❌ Không có bạn bè hợp lệ!\n💡 Dữ liệu bạn bè có format sai.",
        false,
        TIME_TO_LIVE
      );
      return;
    }

    let groupInfo;
    try {
      groupInfo = await api.getInfoOneGroup(threadID);
    } catch (groupError) {
      console.error("❌ Lỗi getInfoOneGroup:", groupError);
      await sendMessageFailed(
        api,
        message,
        `❌ Không thể lấy thông tin nhóm!\nLỗi: ${groupError.message}`,
        true,
        TIME_TO_LIVE
      );
      return;
    }

    const currentMembers = extractMemberIds(groupInfo);

    // Pending members khong nam trong danh sach thanh vien hien tai. Moi lai
    // nhung UID nay co the lam Zalo thu hoi/ghi de request dang cho duyet.
    let pendingMembers;
    try {
      const pendingResponse = await api.getGroupPendingMembers(threadID);
      pendingMembers = extractMemberIds(pendingResponse);
      for (const id of cachedPendingMembers) pendingMembers.add(id);
    } catch (pendingError) {
      console.warn("⚠️ Không thể lấy danh sách chờ duyệt, dùng cache cục bộ:", pendingError?.message || pendingError);
      pendingMembers = new Set(cachedPendingMembers);
    }

    const friendsToInvite = validFriends.filter(friend =>
      !currentMembers.has(friend.id) && !pendingMembers.has(friend.id)
    );

    if (friendsToInvite.length === 0) {
      await sendMessageComplete(
        api,
        message,
        `✅ Tất cả bạn bè đã ở trong nhóm hoặc đang chờ duyệt!\n👥 Trong nhóm: ${currentMembers.size}\n⏳ Chờ duyệt: ${pendingMembers.size}`,
        true,
        TIME_TO_LIVE
      );
      return;
    }

    const batches = [];
    for (let i = 0; i < friendsToInvite.length; i += BATCH_SIZE) {
      batches.push(friendsToInvite.slice(i, i + BATCH_SIZE));
    }

    let successCount = 0;
    let pendingApprovalCount = 0;
    let failCount = 0;

    const rememberPending = (id) => {
      if (!id) return;
      cachedPendingMembers.add(id);
      pendingInviteCache.set(pendingCacheKey, cachedPendingMembers);
    };

    const countFailure = (error, id) => {
      if (isPendingApproval(error)) {
        pendingApprovalCount++;
        rememberPending(id);
      } else failCount++;
    };

    const inviteOne = async (friend, fallbackError) => {
      try {
        const result = await api.addUserToGroup(threadID, [friend.id]);
        const errors = getErrorMembers(result);
        if (errors.length) countFailure(errors[0], friend.id);
        else {
          successCount++;
          rememberPending(friend.id);
        }
      } catch (error) {
        countFailure(error || fallbackError, friend.id);
      }
    };

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const friendIds = batch.map(friend => friend.id);

      try {
        const result = await api.addUserToGroup(threadID, friendIds);
        const errorMembers = getErrorMembers(result);
        if (errorMembers.length === 0) {
          successCount += friendIds.length;
          for (const friend of batch) rememberPending(friend.id);
        } else {
          const errorById = new Map(
            errorMembers
              .map(item => [normalizeId(item?.id ?? item?.uid ?? item?.userId), item])
              .filter(([id]) => Boolean(id))
          );
          const pendingIds = new Set(
            [...errorById].filter(([, error]) => isPendingApproval(error)).map(([id]) => id)
          );
          pendingApprovalCount += pendingIds.size;
          for (const id of pendingIds) rememberPending(id);

          let retryFriends;
          if (errorById.size) {
            retryFriends = batch.filter(friend => errorById.has(friend.id) && !pendingIds.has(friend.id));
            successCount += batch.length - errorById.size;
            for (const friend of batch) {
              if (!errorById.has(friend.id)) rememberPending(friend.id);
            }
          } else if (errorMembers.every(isPendingApproval)) {
            // Khong co UID trong response: coi dung so entry loi la dang cho duyet
            // va khong goi moi lan hai, vi goi lap co the lam mat request cu.
            pendingApprovalCount += Math.min(errorMembers.length, batch.length);
            for (const friend of batch.slice(0, errorMembers.length)) rememberPending(friend.id);
            successCount += Math.max(0, batch.length - errorMembers.length);
            retryFriends = [];
          } else {
            retryFriends = batch;
          }
          for (const friend of retryFriends) {
            await inviteOne(friend, errorMembers[0]);
            await new Promise(resolve => setTimeout(resolve, MEMBER_DELAY_MS));
          }
        }
      } catch (batchError) {
        console.warn(`⚠️ Batch ${i + 1} lỗi:`, batchError.message);
        if (isPendingApproval(batchError)) {
          // Loi 240 nghia la Zalo da tao request cho duyet. Tuyet doi khong
          // retry, neu khong request vua tao co the bi ghi de/huy.
          pendingApprovalCount += batch.length;
          for (const friend of batch) rememberPending(friend.id);
        } else {
          // Mot UID bi chan co the lam hong ca batch. Thu tung nguoi de cac UID
          // hop le con lai van duoc moi.
          for (const friend of batch) {
            await inviteOne(friend, batchError);
            await new Promise(resolve => setTimeout(resolve, MEMBER_DELAY_MS));
          }
        }
      }
      if (i < batches.length - 1) {
        console.log(`⏳ Delay ${DELAY_MS}ms...`);
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
    }
    const resultLines = [
      `🎉 HOÀN THÀNH MỜI BẠN BÈ!`,
      ``,
      `📊 THỐNG KÊ:`,
      `✅ ${successCount} người THÀNH CÔNG`,
      `⏳ ${pendingApprovalCount} người CHỜ PHÊ DUYỆT`,
      `❌ ${failCount} người THẤT BẠI`,
      `📝 Tổng: ${friendsToInvite.length} người`,
      ``,
      `⏰ Hoàn thành: ${new Date().toLocaleString('vi-VN')}`
    ];

    await sendMessageComplete(api, message, resultLines.join("\n"), true, TIME_TO_LIVE);
  } catch (error) {
    console.error("❌ Lỗi nghiêm trọng handleInviteAllFriendsCommand:", error);
    await sendMessageFailed(
      api,
      message,
      `❌ LỖI HỆ THỐNG!\nChi tiết: ${error.message}`,
      true,
      TIME_TO_LIVE
    );
  }
}
