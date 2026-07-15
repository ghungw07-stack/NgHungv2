import { MessageMention, MessageType } from "zlbotdqt";
import { sendMessageComplete, sendMessageStateQuote, sendMessageWarning } from "../chat-zalo/chat-style/chat-style.js";
import { isInWhiteList } from "./white-list.js";
import { removeMention } from "../../utils/format-util.js";
import { dataSticker, handleSearchCategoryCommand } from "../chat-zalo/chat-special/send-sticker/main-sticker.js";
import { getGlobalPrefix } from "../service.js";
import { deleteMessageCustomer } from "../../commands/bot-manager/utilities.js";
import { createBlockSpamStickerEffect } from "../../utils/canvas/event-image.js";
import { clearImagePath } from "../../utils/canvas/index.js";
import { getGroupInfoData } from "../info-service/group-info.js";
import { getUserInfoData } from "../info-service/user-info.js";

let historySendStickerLag = {};
let timeSendStickerLag = {};
const MAX_STICKER_EFFECT_WARNING = 3;

export async function handleAntiSendStickerEffectCommand(api, message, aliasCommand, groupSettings) {
  const botId = api.getBotId();
  const threadId = message.threadId;
  let isChangeSetting = false;
  const prefix = getGlobalPrefix(api.getBotId());
  const content = removeMention(message);
  const keyword = content.replace(`${prefix}${aliasCommand}`, "").trim();
  const args = keyword.split(" ");
  const status = args[0]?.toLowerCase();

  const isMainBot = api.apiManager.isMainBot;
  if (!groupSettings[threadId]) {
    groupSettings[threadId] = {};
  }
  const quote = message.data.quote;
  if (quote) {
    const attach = quote?.attach;
    if (attach) {
      const attachData = JSON.parse(attach);
      const idSticker = attachData.id || null;
      const cateId = attachData.catId || null;
      const type = attachData.type || null;
      if (idSticker && cateId && type) {
        if (status === "add") {
          if (isMainBot) {
            const dataStickerStore = dataSticker.getById(idSticker);
            dataStickerStore.effectId = 1;
            dataSticker.setChange();
            const caption = `Đã thêm sticker vào danh sách sticker có hiệu ứng!`;
            await sendMessageComplete(api, message, caption, false, 300000);
          } else {
            const tempCapt = "Chỉ có quản trị Bot Leader mới có quyền chỉnh sửa dữ liệu của danh sách sticker";
            await sendMessageWarning(api, message, tempCapt);
          }
        }

        if (status === "remove") {
          if (isMainBot) {
            const dataStickerStore = dataSticker.getById(idSticker);
            dataStickerStore.effectId = 0;
            dataSticker.setChange();
            const caption = `Đã xóa sticker khỏi danh sách sticker có hiệu ứng!`;
            await sendMessageComplete(api, message, caption, false, 300000);
          } else {
            const tempCapt = "Chỉ có quản trị Bot Leader mới có quyền chỉnh sửa dữ liệu của danh sách sticker";
            await sendMessageWarning(api, message, tempCapt);
          }
        }
        return isChangeSetting;
      }
    }
  }

  const newStatus = status === "on" ? true : status === "off" ? false : !groupSettings[threadId].antiStickerEffect;
  groupSettings[threadId].antiStickerEffect = newStatus;
  isChangeSetting = true;
  const statusText = newStatus ? "bật" : "tắt";
  const caption = `Chức năng chặn gửi "sticker có hiệu ứng" đã được ${statusText}!`;
  await sendMessageStateQuote(api, message, caption, newStatus, 300000);
  return isChangeSetting;
}

export async function antiStickerEffect(api, message, groupInfo, senderIsAdmin, groupSettings, botIsAdminBox, isSelf) {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const threadId = message.threadId;

  if (
    isSelf ||
    senderIsAdmin ||
    !botIsAdminBox ||
    !groupSettings[threadId]?.antiStickerEffect ||
    message.data.msgType !== "chat.sticker"
  )
    return false;

  return await handleStickerMessage(
    api,
    message,
    groupInfo,
    groupSettings,
    senderIsAdmin,
    threadId,
    senderId,
    senderName
  );
}

async function handleStickerMessage(
  api,
  message,
  groupInfo,
  groupSettings,
  senderIsAdmin,
  threadId,
  senderId,
  senderName
) {
  const botId = api.getBotId();
  let isDeleteSticker = false;
  const isUserWhiteList = isInWhiteList(groupSettings, threadId, senderId);
  if (isUserWhiteList) return isDeleteSticker;
  const stickerId = message.data.content.id;
  let dataStickerStore = dataSticker.getById(stickerId);

  if (dataStickerStore) {
    if (dataStickerStore.effectId !== 0) {
      await deleteMessageCustomer(api, message);
      isDeleteSticker = true;
    }
  } else {
    const searchTerm = message.data.content.catId;
    await handleSearchCategoryCommand(api, message, searchTerm, null, false);
    dataStickerStore = dataSticker.getById(stickerId);
    if (dataStickerStore.effectId !== 0) {
      await deleteMessageCustomer(api, message);
      isDeleteSticker = true;
    }
  }

  if (isDeleteSticker) {
    if (!isUserWhiteList) {
      await updateSendCount(api, message, threadId, senderId, senderName, botId, senderIsAdmin, groupInfo, groupSettings);
    }
  }
  return isDeleteSticker;
}

async function updateSendCount(api, message, threadId, senderId, senderName, botId, isAdminBox, groupInfo, groupSettings) {
  if (!historySendStickerLag[threadId]) {
    historySendStickerLag[threadId] = {};
    timeSendStickerLag[threadId] = {};
  }
  if (!historySendStickerLag[threadId][senderId]) {
    historySendStickerLag[threadId][senderId] = 0;
    timeSendStickerLag[threadId][senderId] = Date.now();
  }

  historySendStickerLag[threadId][senderId]++;

  if (isAdminBox && senderId !== botId) {
    return;
  }

  if (Date.now() - timeSendStickerLag[threadId][senderId] < 3 * 60 * 1000) {
    if (historySendStickerLag[threadId][senderId] > MAX_STICKER_EFFECT_WARNING) {
      await blockUser(api, message, threadId, senderId, senderName, groupSettings, groupInfo);
      return;
    }
  } else {
    historySendStickerLag[threadId][senderId] = 1;
    timeSendStickerLag[threadId][senderId] = Date.now();
  }

  await sendWarningMessage(api, message, senderId, senderName, historySendStickerLag[threadId][senderId], groupInfo);
}

const kickedUsers = new Set();

async function blockUser(api, message, threadId, senderId, senderName, groupSettings, groupInfo) {
  let imagePath = null;
  try {
    if (kickedUsers.has(senderId)) return;
    kickedUsers.add(senderId);
    await api.blockUsers(threadId, [senderId]);

    const isEnableBlockImage = groupSettings?.[threadId]?.enableBlockImage === true;
    
    if (isEnableBlockImage) {
      try {
        const userInfo = await getUserInfoData(api, senderId);
        const botId = api.getBotId();
        const botInfo = await getUserInfoData(api, botId);
        const botName = botInfo?.name || botInfo?.zaloName || api.accountInfo?.name || "Bot";
        imagePath = await createBlockSpamStickerEffect(userInfo, groupInfo.name, groupInfo.groupType, userInfo.gender, botName);

        await api.sendMessage(
          {
            msg: "",
            attachments: imagePath ? [imagePath] : [],
            quote: message,
            ttl: 86400000,
            isUseProphylactic: true,
          },
          threadId,
          MessageType.GroupMessage
        );

        await clearImagePath(imagePath);
      } catch (error) {
        console.error("Lỗi khi tạo và gửi ảnh block sticker effect:", error);
      }
    }

    setTimeout(() => {
      kickedUsers.delete(senderId);
      console.log(`Đã xóa ${senderId} khỏi danh sách kickedUsers.`);
    }, 5000);
  } catch (error) {
    console.error(`Không thể chặn người dùng ${senderName}:`, error);
  }
}

async function sendWarningMessage(api, message, senderId, senderName, count, groupInfo) {
  try {
    let caption = `⚠️ Cảnh cáo ${senderName}!\nỞ đây không được phép gửi sticker có hiệu ứng!`;
    switch (count) {
      case 2:
        caption = `⚠️ Cảnh cáo ${senderName}!\nNgừng gửi sticker này lại trước khi mọi chuyện tồi tệ hơn!`;
        break;
      case 3:
        caption = `⚠️ Cảnh cáo ${senderName}!\nGửi sticker hiệu ứng thêm một lần nữa tao chặn khỏi nhóm!`;
        break;
    }
    await api.sendMessage(
      {
        msg: caption,
        mentions: [MessageMention(senderId, senderName.length, "⚠️ Cảnh cáo ".length)],
        quote: message,
        ttl: 300000,
      },
      message.threadId,
      MessageType.GroupMessage
    );
  } catch (error) {
    console.error(`Không thể gửi tin nhắn tới ${senderName}:`, error.message);
  }
}
