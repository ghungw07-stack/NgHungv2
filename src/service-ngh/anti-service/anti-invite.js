import { MessageType, GroupEventType, MessageMention } from "zlbotngh";
import { sendMessageStateQuote, sendMessageWarning } from "../chat-zalo/chat-style/chat-style.js";
import { removeMention } from "../../utils/format-util.js";
import { getGlobalPrefix } from "../service.js";
import { isAdmin } from "../../index.js";
import { getUserInfoBasic } from "../info-service/user-info.js";
import { managerDataCache } from "../../commands/bot-manager/active-bot.js";
import { getGroupInfoData } from "../info-service/group-info.js";

export async function handleAntiInvite(api, message) {
  const botId = api.getBotId();
  const content = removeMention(message);
  const prefix = getGlobalPrefix(botId);
  const parts = content.split(" ");
  const managerData = api.apiManager.getDataManager();

  if (managerData.antiInvite === undefined) {
    managerData.antiInvite = false;
  }

  if (parts.length === 1) {
    managerData.antiInvite = !managerData.antiInvite;
  } else if (parts[1] === "on") {
    managerData.antiInvite = true;
  } else if (parts[1] === "off") {
    managerData.antiInvite = false;
  } else {
    const caption = `Cú pháp không hợp lệ. Sử dụng ${prefix}antiinvite hoặc ${prefix}antiinvite on/off`;
    await sendMessageWarning(api, message, caption, false);
    return false;
  }

  managerDataCache.setChanged(botId);
  const status = managerData.antiInvite ? "bật" : "tắt";
  const caption = `Chế độ chống mời bot vào nhóm đã được ${status}!`;
  await sendMessageStateQuote(api, message, caption, managerData.antiInvite, 300000);

  return true;
}

export async function enforceAntiInvite(api, event) {
  const type = event.type;
  const { updateMembers } = event.data;
  const threadId = event.threadId;
  const idAction = event.data.sourceId; 
  const botId = api.getBotId();
  const managerData = api.apiManager.getDataManager();

  if (type !== GroupEventType.JOIN || !updateMembers || updateMembers.length === 0) {
    return false;
  }

  if (!managerData.antiInvite) {
    return false;
  }

  // Chỉ out ở nhóm, không phải cộng đồng
  try {
    const groupInfo = await getGroupInfoData(api, threadId);
    if (groupInfo && groupInfo.groupType === 2) {
      // groupType === 2 là cộng đồng, không out
      return false;
    }
  } catch (error) {
    // Nếu không lấy được thông tin nhóm, vẫn tiếp tục xử lý
  }

  const botWasInvited = updateMembers.some(member => {
    const memberId = member.id || member;
    if (memberId === botId) return true;
    if (typeof memberId === 'string' && memberId === String(botId)) return true;
    if (typeof memberId === 'number' && memberId === Number(botId)) return true;
    return false;
  });

  if (!botWasInvited) {
    return false;
  }

  if (idAction && isAdmin(botId, idAction)) {
    return false;
  }

  try {
    let inviterName = idAction ? `ID ${idAction}` : "Không xác định";
    if (idAction) {
      try {
        const inviterInfo = await getUserInfoBasic(api, idAction);
        inviterName = inviterInfo.zaloName || inviterInfo.displayName || inviterName;
      } catch (error) {
      }
    }

    const groupMessagePromise = idAction ? (async () => {
      try {
        const insultMessage = `${inviterName} mày đéo được phép mời tao vào nhóm này đâu con chó rác ${inviterName}, đừng có mà spam mời nữa!`;
        await api.sendMessage(
          {
            msg: insultMessage,
            mentions: [MessageMention(idAction, inviterName.length, 0)],
            ttl: 300000,
          },
          threadId,
          MessageType.GroupMessage
        );
      } catch (insultError) {
      }
    })() : Promise.resolve();

    await api.leaveGroup(threadId);
    
    await Promise.all([
      groupMessagePromise,
      new Promise(resolve => setTimeout(resolve, 300))
    ]);

    if (idAction) {
      const actions = [
        api.sendMessage(
          {
            msg: `Làm ơn đừng kéo tôi vào mấy cái box từ trên trời rơi xuống nữa. Tôi không rảnh tham gia những cuộc trò chuyện mà chính người thêm vào cũng chẳng biết mục đích để làm gì. Lần sau có ý định add ai vào thì xài não trước khi bấm, đỡ phiền người khác và trông cũng văn minh hơn.`,
            ttl: 86400000,
          },
          idAction,
          MessageType.DirectMessage
        ).catch(() => {})
      ];
      
      await Promise.all(actions);
    }
    
    return true;
  } catch (error) {
    try {
      await api.leaveGroup(threadId);
    } catch (leaveError) {
    }
    return false;
  }
}