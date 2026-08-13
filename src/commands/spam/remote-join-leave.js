import {
  sendMessageFromSQL,
  sendMessageWarningRequest,
} from "../../service-ngh/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-ngh/service.js";
import { removeMention } from "../../utils/format-util.js";

export async function handleJoinLeaveGroup(api, message) {
  const prefix = getGlobalPrefix();
  const content = removeMention(message);

  const commandParts = content.split(" ");
  const linkJoin = commandParts[1];
  const iterations = parseInt(commandParts[2]);

  if (!linkJoin || isNaN(iterations) || iterations < 1) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Cú pháp: ${prefix}spamjoin [link] [số lần]`,
      },
      false,
      30000
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
        message: `Link nhóm không hợp lệ hoặc nhóm không tồn tại!`,
      },
      true,
      30000
    );
    return;
  }

  if (!groupInfo) return;

  let successfulIterations = 0;

  try {
    for (let i = 0; i < iterations; i++) {
      let joinedSuccessfully = false;
      try {
        await api.joinGroup(linkJoin);
        joinedSuccessfully = true;
      } catch (error) {
        if (error.message.includes("Waiting for approve") || error.message.includes("đã là thành viên")) {
          joinedSuccessfully = error.message.includes("đã là thành viên");
        } else {
          continue;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 10));
      if (joinedSuccessfully) {
        try {
          await api.leaveGroup(groupInfo.groupId);
          successfulIterations++;
        } catch (error) {
        }
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    const messageContent = `Hoàn thành ${successfulIterations} lần join và leave nhóm "${groupInfo.name}"!`;
    await sendMessageFromSQL(
      api,
      message,
      {
        success: true,
        message: messageContent,
      },
      true,
      60000
    );
  } catch (error) {
    await sendMessageWarningRequest(
      api,
      message,
      {
        caption: `Đã xảy ra lỗi khi thực hiện lệnh spamjoin.`,
      },
      60000
    );
  }
}