import { MessageType } from "../api-zalo/index.js";
import { removeMention } from "../utils/format-util.js";
import { sendMessageStateQuote, sendMessageWarning } from "../service-ngh/chat-zalo/chat-style/chat-style.js";
import { managerDataCache } from "../commands/bot-manager/active-bot.js";
import { getGlobalPrefix } from "../service-ngh/service.js";
import { getMessageByThreadAndMsgId } from "../utils/message-cache.js";
import { getGroupInfoData } from "../service-ngh/info-service/group-info.js";
import { getGroupAdmins } from "../service-ngh/info-service/group-info.js";

export async function handleHeartReactionDelete(api, reaction) {
  try {
    const rType = reaction.data?.content?.rType;
    if (rType !== 3) return false;

    const managerData = api.apiManager.getDataManager();
    
    if (managerData.heartReactionDelete === undefined) {
      managerData.heartReactionDelete = false;
    }

    if (!managerData.heartReactionDelete) {
      return false;
    }

    const rMsg = reaction.data?.content?.rMsg?.[0];
    if (!rMsg) return false;

    const globalMsgId = rMsg.gMsgID?.toString();
    const cliMsgId = rMsg.cMsgID?.toString();

    if (!globalMsgId || !cliMsgId) return false;

    const botId = api.getBotId();
    const threadId = reaction.threadId;
    const foundMsg = await getMessageByThreadAndMsgId(botId, threadId, globalMsgId);


    let msgOwnerId;
    if (foundMsg) {
      msgOwnerId = foundMsg.uidFrom === "0" ? botId : foundMsg.uidFrom;
    } else {
      msgOwnerId = rMsg.ownerId || botId;
    }

    let canDelete = false;
    
    if (String(msgOwnerId) === String(botId)) {
      canDelete = true;
    } else if (reaction.isGroup) {
      try {
        const groupInfo = await getGroupInfoData(api, threadId);
        if (groupInfo) {
          const groupAdmins = await getGroupAdmins(groupInfo);
          const botIsAdmin = groupAdmins.includes(botId.toString());
          if (botIsAdmin) {
            canDelete = true;
          }
        }
      } catch (error) {
        console.error("Lỗi khi kiểm tra quyền admin:", error);
        canDelete = false;
      }
    } else {
      canDelete = false;
    }

    if (!canDelete) {
      return false;
    }

    const messageType = reaction.isGroup ? MessageType.GroupMessage : MessageType.DirectMessage;

    const messageToDelete = {
      type: messageType,
      threadId: threadId,
      data: {
        msgId: globalMsgId,
        cliMsgId: foundMsg?.cliMsgId || cliMsgId,
        uidFrom: msgOwnerId,
      },
    };

    try {
      await api.deleteMessage(messageToDelete, false);
      return true;
    } catch (error) {
      return false;
    }
  } catch (error) {
    console.error("Lỗi khi xóa tin nhắn từ reaction tim:", error);
    return false;
  }
}

export async function handleHeartReactionDeleteCommand(api, message, aliasCommand) {
  const botId = api.getBotId();
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const parts = content.split(" ");
  const managerData = api.apiManager.getDataManager();

  if (managerData.heartReactionDelete === undefined) {
    managerData.heartReactionDelete = false;
  }

  if (parts.length === 1) {
    managerData.heartReactionDelete = !managerData.heartReactionDelete;
  } else if (parts[1] === "on") {
    managerData.heartReactionDelete = true;
  } else if (parts[1] === "off") {
    managerData.heartReactionDelete = false;
  } else {
    const caption = `Cú pháp không hợp lệ. Sử dụng ${prefix}${aliasCommand} hoặc ${prefix}${aliasCommand} on/off`;
    await sendMessageWarning(api, message, caption, false);
    return false;
  }

  managerDataCache.setChanged(botId);
  const status = managerData.heartReactionDelete ? "bật" : "tắt";
  const caption = `Chức năng xóa tin nhắn khi có reaction đã được ${status}!`;
  await sendMessageStateQuote(api, message, caption, managerData.heartReactionDelete, 300000);

  return true;
}

