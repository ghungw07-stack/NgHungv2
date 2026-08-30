import schedule from "node-schedule";
import {
  sendMessageCompleteRequest,
  sendMessageFromSQL,
  sendMessageResultRequest,
  sendMessageWarningRequest,
} from "../../service-ngh/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-ngh/service.js";
import { getDataAllGroup, getGroupAdmins, getGroupInfoData } from "../../service-ngh/info-service/group-info.js";
import { getUsersInfoBasic } from "../../service-ngh/info-service/user-info.js";
import { removeMention } from "../../utils/format-util.js";
import { handleCommand } from "../command.js";
import { MessageType } from "../../api-zalo/index.js";
import { groupSettingsAll } from "../../automations/event-send-msg.js";

const requestJoinGroupMap = new Map();
const waitingActionGroupMap = new Map();
const waitingActionJoinGroup = 30000;
const timeOutWaitingActionGroup = 60000;

schedule.scheduleJob("*/5 * * * * *", () => {
  const currentTime = Date.now();
  for (const [msgId, data] of requestJoinGroupMap.entries()) {
    if (currentTime - data.timestamp > waitingActionJoinGroup) {
      requestJoinGroupMap.delete(msgId);
    }
  }
  for (const [msgId, data] of waitingActionGroupMap.entries()) {
    if (currentTime - data.timestamp > timeOutWaitingActionGroup) {
      waitingActionGroupMap.delete(msgId);
    }
  }
});

export async function handleJoinGroup(api, message) {
  const prefix = getGlobalPrefix(api.getBotId());
  const content = removeMention(message);

  const commandParts = content.split(" ");
  let linkJoin = commandParts[1];

  if (!linkJoin) {
    const quote = message.data?.quote;
    if (quote) {
      try {
        const parseMessage = JSON.parse(quote.attach);
        linkJoin = parseMessage.href || parseMessage.title || quote.msg || null;
      } catch (error) {
        linkJoin = quote.msg || null;
      }
    }
  }

  if (!linkJoin) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Cú pháp tham gia nhóm thông qua link:\n${prefix}join [link]`,
      },
      false,
      300000
    );
    return;
  }

  let groupInfo = null;
  try {
    groupInfo = await api.getGroupInfoByLink(linkJoin);
  } catch (error) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Link này không tồn tại nhóm/cộng đồng nào!`,
      },
      true,
      300000
    );
    return;
  }

  if (!groupInfo) return;

  const typeGroup = groupInfo.type === 2 ? "Cộng đồng" : "Nhóm";

  const msgResponse = await sendMessageCompleteRequest(
    api,
    message,
    {
      caption:
        `Tên ${typeGroup}: ${groupInfo.name}\nMô tả: ${groupInfo.desc || "Không có mô tả"}\nTổng số thành viên: ${
          groupInfo.totalMember
        }` + `\n\nXác nhận tham gia ${typeGroup} bằng cách thả reaction like hoặc heart!`,
    },
    waitingActionJoinGroup
  );

  const msgId = msgResponse.message.msgId.toString();

  requestJoinGroupMap.set(msgId, {
    message,
    timestamp: Date.now(),
    groupInfo,
    linkJoin,
  });
}

export async function handleReactionConfirmJoinGroup(api, reaction) {
  const msgId = reaction.data?.content?.rMsg[0]?.gMsgID?.toString() || "";
  if (!msgId) return false;
  const data = requestJoinGroupMap.get(msgId);
  if (!data) return false;
  const senderId = reaction.data.uidFrom;
  if (senderId !== data.message.data.uidFrom) return false;

  const rType = reaction.data.content.rType;
  if (rType !== 3 && rType !== 5) return false;

  const message = data.message;
  requestJoinGroupMap.delete(msgId);
  // const msgUndo = {
  //   data: {
  //     quote: {
  //       cliMsgId: reaction.data.content.rMsg[0].cMsgID,
  //       globalMsgId: reaction.data.content.rMsg[0].gMsgID,
  //     },
  //   },
  //   type: message.type,
  //   threadId: reaction.data.idTo,
  // };
  // await api.undoMessage(msgUndo);

  try {
    await api.joinGroup(data.linkJoin);
    await sendMessageFromSQL(
      api,
      message,
      {
        success: true,
        message: `Đã tham gia vào nhóm thành công!`,
      },
      true,
      180000
    );
  } catch (error) {
    if (error.message.includes("Waiting for approve")) {
      await sendMessageWarningRequest(
        api,
        message,
        {
          caption: `Đã gửi yêu cầu tham gia nhóm này và đang chờ chủ nhóm phê duyệt!`,
        },
        180000
      );
    }
    if (error.message.includes("đã là thành viên")) {
      await sendMessageWarningRequest(
        api,
        message,
        {
          caption: `Đã là thành viên của nhóm này!`,
        },
        180000
      );
    }
    if (error.message.includes("chặn tham gia nhóm")) {
      await sendMessageWarningRequest(
        api,
        message,
        {
          caption: `Đã bị chặn tham gia nhóm này!`,
        },
        180000
      );
    }
  }
  return true;
}

export async function handleLeaveGroup(api, message, groupSettings) {
  const threadId = message.threadId;
  const isContentString = typeof message.data.content === "string";
  if (!isContentString) return;
  const customLeaveMessage = groupSettings?.[threadId]?.leaveMessage;
  const leaveCaption = customLeaveMessage || "Bai mấy em, ta đi đây!";
  await sendMessageResultRequest(api, MessageType.GroupMessage, threadId, leaveCaption, true, 300000);
  await api.leaveGroup(threadId);
}

export async function handleLeaveLockedGroups(api, message) {
  const threadId = message.threadId;
  const isContentString = typeof message.data.content === "string";
  if (!isContentString) return;
  const botId = api.getBotId();
  await sendMessageResultRequest(api, MessageType.GroupMessage, threadId, "🔍 Đang quét các box...", true, 10000);
  try {
    const groups = await getDataAllGroup(api);
    let leftCount = 0;

    for (const group of groups) {
      try {
        const groupInfo = await getGroupInfoData(api, group.groupId);
        // ⚠️ Tạm thời check cả 2 cách
        const isLocked = groupInfo.lockSendMsg === 1 
                      || groupInfo?.setting?.lockSendMsg === 1;

        if (isLocked) {
          const groupAdmins = await getGroupAdmins(groupInfo);

          const isBotAdmin = groupAdmins.includes(botId);

          if (isBotAdmin) {
            continue; 
          }
          await api.leaveGroup(group.groupId);
          leftCount++;
        }
      } catch (err) {
        console.error(`❌ Lỗi khi xử lý group ${group.groupId}:`, err.message);
      }
    }

    await sendMessageFromSQL(
      api,
      message,
      {
        success: true,
        message: leftCount > 0 
          ? `✅ Đã rời ${leftCount} box bị khóa chat.`
          : `⚡ Không tìm thấy box nào bị khóa chat.`,
      },
      true,
      180000
    );
  } catch (error) {
    console.error("❌ Error leaving locked groups:", error);
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `❌ Lỗi khi quét box: ${error.message}`,
      },
      false,
      180000
    );
  }
}

export async function handleLeaveAllGroup(api, message) {
  const threadId = message.threadId;
  const botId = api.getBotId();
  const senderId = message.data?.uidFrom;

  try {
    const groups = await getDataAllGroup(api);
    let success = 0;

    for (const g of groups) {

      if (g.groupId === threadId) continue;

      try {
        const groupInfo = await getGroupInfoData(api, g.groupId);
        const groupAdmins = await getGroupAdmins(groupInfo);
        const normalizedAdmins = groupAdmins.map((adminId) => adminId?.toString());
        const botIdStr = botId?.toString();
        const senderIdStr = senderId?.toString();

        if (botIdStr && normalizedAdmins.includes(botIdStr)) {
          continue;
        }

        if (senderIdStr && normalizedAdmins.includes(senderIdStr)) {
          continue;
        }

        await api.leaveGroup(g.groupId);
        success++;

        await sleep(400);

      } catch (err) {
        console.error(`❌ Không thoát được nhóm ${g.groupId}:`, err);
      }
    }

    await safeSend(
      api,
      threadId,
      `✅ Đã thoát ${success} box.`
    );

  } catch (e) {
    await safeSend(api, threadId, `❌ Lỗi khi xử lý: ${e.message}`);
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function safeSend(api, threadId, text) {
  try {
    await sendMessageResultRequest(
      api,
      MessageType.GroupMessage,
      threadId,
      text,
      true,
      60000
    );
  } catch (err) {
    console.error("Lỗi gửi tin nhắn:", err.message);
  }
}

export async function handleShowGroupsList(api, message, aliasCommand) {
  const prefix = getGlobalPrefix(api.getBotId());
  const content = removeMention(message);

  const command = content.replace(`${prefix}${aliasCommand}`, "").trim();
  try {
    const groups = await getDataAllGroup(api);
    let filteredGroups;
    if (!command) {
      filteredGroups = groups;
    } else {
      filteredGroups = groups.filter((group) => group.name.toUpperCase().includes(command.toUpperCase()));
    }
    if (!filteredGroups.length) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Không tìm thấy nhóm nào có tên chứa "${command}"!`,
        },
        false,
        30000
      );
      return;
    }

    const listIds = [...new Set(filteredGroups.map((group) => group.creatorId).filter(Boolean))];
    const owners = await getUsersInfoBasic(api, listIds);

    const groupItems = filteredGroups.map((group, index) => {
      const actualIndex = index + 1;
      const ownerName = owners[group.creatorId]?.displayName || "Không rõ";
      return (
        `${actualIndex}. ${group.name} (${group.totalMember} thành viên)\n` +
        ` - Trưởng nhóm: ${ownerName}\n` +
        ` - ID: ${group.groupId}\n\n`
      );
    });

    const MAX_CHARS = 2100;
    const footerText = `Reply tin nhắn này với số index và "->" + cú pháp liên quan đến hành động mà bạn muốn tôi thực hiện cho danh sách bên trên!`;

    const messageChunks = [];
    let currentMessage = `Danh sách nhóm:\n\n`;

    for (let i = 0; i < groupItems.length; i++) {
      const item = groupItems[i];
      const isLast = i === groupItems.length - 1;
      const potentialFooter = isLast ? footerText : "";

      if ((currentMessage + item + potentialFooter).length > MAX_CHARS) {
        if (currentMessage !== `Danh sách nhóm:\n\n` && currentMessage !== `(Tiếp theo)\n\n`) {
          messageChunks.push(currentMessage.trimEnd());
          currentMessage = `(Tiếp theo)\n\n${item}`;
        } else {
          messageChunks.push(currentMessage + item);
          currentMessage = `(Tiếp theo)\n\n`;
        }
      } else {
        currentMessage += item;
      }
    }

    if (currentMessage.trim().length > 0) {
      if (!currentMessage.includes(footerText)) {
        if ((currentMessage + "\n" + footerText).length <= MAX_CHARS) {
          currentMessage += (currentMessage.endsWith("\n") ? "" : "\n") + footerText;
          messageChunks.push(currentMessage);
        } else {
          messageChunks.push(currentMessage.trimEnd());
          messageChunks.push(footerText);
        }
      } else {
        messageChunks.push(currentMessage);
      }
    }

    for (let chunkIndex = 0; chunkIndex < messageChunks.length; chunkIndex++) {
      if (chunkIndex > 0) {
        await sleep(1000);
      }

      const contentMessage = messageChunks[chunkIndex];
      const msgResponse = await sendMessageCompleteRequest(
        api,
        message,
        {
          caption: contentMessage,
        },
        timeOutWaitingActionGroup
      );

      // Lưu action handler cho tất cả message chunk để reply tin nào cũng nhận
      const sentMessage = msgResponse?.message || {};
      const messageIds = [sentMessage.globalMsgId, sentMessage.msgId, sentMessage.cliMsgId]
        .filter((id) => id !== undefined && id !== null && String(id).length > 0)
        .map((id) => String(id));
      if (messageIds.length > 0) {
        const actionData = {
          message,
          timestamp: Date.now(),
          groups: filteredGroups,
        };
        for (const id of messageIds) waitingActionGroupMap.set(id, actionData);
      } else {
        console.error("Không lấy được ID tin nhắn listgroups từ response Zalo:", msgResponse);
      }
    }
  } catch (error) {
    console.error(error);
  }
}

export async function handleActionGroupReply(
  api,
  message,
  groupInfo,
  groupAdmins,
  groupSettings,
  isAdminLevelHighest,
  isAdminBot,
  isAdminBox,
  handleChat
) {
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const senderId = message.data.uidFrom;
  let content = removeMention(message);
  try {
    if (!message.data.quote || !content) return false;

    const quote = message.data.quote;
    const quotedMsgIds = [quote.globalMsgId, quote.msgId, quote.cliMsgId]
      .filter((id) => id !== undefined && id !== null && String(id).length > 0)
      .map((id) => String(id));
    const quotedMsgId = quotedMsgIds.find((id) => waitingActionGroupMap.has(id));
    if (!quotedMsgId) return false;
    const dataReply = waitingActionGroupMap.get(quotedMsgId);
    if (dataReply.message.data.uidFrom !== senderId) return false;

    const commandParts = content.split("->");
    if (commandParts.length !== 2) return false;
    const index = parseInt(commandParts[0]);
    if (isNaN(index)) {
      const object = {
        caption: `Lựa chọn không hợp lệ. Vui lòng chọn một số từ danh sách.`,
      };
      await sendMessageWarningRequest(api, message, object, 30000);
      return true;
    }
    const action = commandParts[1];
    if (action && !action.startsWith(prefix)) {
      return false;
    }

    if (index < 1 || index > dataReply.groups.length) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Số index không hợp lệ!`,
        },
        false,
        30000
      );
      return false;
    }
    if (!action) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Vui lòng nhập hành động cần thực hiện!`,
        },
        false,
        30000
      );
      return false;
    }

    await api.addReaction("CLOCK", message);
    const group = dataReply.groups[index - 1];
    const threadId = group.groupId;
    const groupInfoTemp = await getGroupInfoData(api, threadId);
    const groupAdminsTemp = await getGroupAdmins(groupInfoTemp);
    const groupSettingsTemp = groupSettings || groupSettingsAll.getByID(botId);

    switch (action) {
      default:
        const idHere = message.threadId;
        const typeHere = message.type;
        const idToHere = message.data.idTo;
        const contentHere = message.data.content;
        const mentionsHere = message.data.mentions;
        message.threadId = group.groupId;
        message.type = MessageType.GroupMessage;
        message.data.idTo = group.groupId;
        message.data.content = action;
        message.data.mentions = [];
        let numHandleCommand;
        try {
          numHandleCommand = await handleCommand(
            api,
            message,
            groupInfoTemp,
            groupAdminsTemp,
            groupSettingsTemp,
            isAdminLevelHighest,
            isAdminBot,
            isAdminBox,
            handleChat
          );
        } finally {
          message.threadId = idHere;
          message.type = typeHere;
          message.data.idTo = idToHere;
          message.data.content = contentHere;
          message.data.mentions = mentionsHere;
        }
        if (numHandleCommand === 1 || numHandleCommand === 2 || numHandleCommand === 3 || numHandleCommand === 5) {
          const result = {
            success: true,
            message: `Đã thực hiện hành động "${action}" trong nhóm "${group.name}"!`,
          };
          await sendMessageFromSQL(api, message, result, true, 60000);
          await api.addReaction("UNDO", message);
          await api.addReaction("LIKE", message);
        }
        break;
    }
    return true;
  } catch (error) {
    console.error(error);
  }
}
