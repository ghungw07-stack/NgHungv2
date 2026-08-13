import { removeMention } from "../../utils/format-util.js";
import { sendMessageComplete, sendMessageFailed } from "../../service-ngh/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-ngh/service.js";

const TIME_TO_LIVE = 600000;
const BATCH_SIZE = 50; 
const DELAY_MS = 5000; 

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
    let friends = [];

    try {
      const response = await api.getAllFriends();
      if (Array.isArray(response)) {
        friends = response;
      } else if (response?.data && Array.isArray(response.data)) {
        friends = response.data;
      } else if (response?.friends && Array.isArray(response.friends)) {
        friends = response.friends;
      } else {
        console.error("❌ Response format không đúng:", response);
        throw new Error("API response không đúng format");
      }
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
        const id = friend.userId || friend.id;
        return id && typeof id === 'string' && id.length > 5;
      })
      .map(friend => {
        const id = friend.userId || friend.id;
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

    const currentMembers = groupInfo.data?.members?.map(member => member.id) || [];
    const friendsToInvite = validFriends.filter(friend => !currentMembers.includes(friend.id));

    if (friendsToInvite.length === 0) {
      await sendMessageComplete(
        api,
        message,
        `✅ Tất cả bạn bè đã có trong nhóm!\n👥 Nhóm hiện có ${currentMembers.length} thành viên`,
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

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const friendIds = batch.map(friend => friend.id);

      try {
        await api.addUserToGroup(threadID, friendIds);
        successCount += friendIds.length;
      } catch (batchError) {
        console.warn(`⚠️ Batch ${i + 1} lỗi:`, batchError.message);
        if (batchError.message.includes("Waiting for approve") || batchError.code === 240) {
          pendingApprovalCount += friendIds.length;
        } else {
          failCount += friendIds.length;
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