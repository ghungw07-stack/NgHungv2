import { removeMention } from "../../../utils/format-util.js";
import { getGroupAdmins } from "../../info-service/group-info.js";
import { getMessageCache } from "../../../utils/message-cache.js";
import { getGlobalPrefix } from "../../service.js";
import { sendMessageWarningRequest } from "../chat-style/chat-style.js";
import { getGlobalApi } from "../../../index.js";
import { checkIsBotLeader } from "../../../commands/command.js";

async function taskSendMessages(options) {
  const {
    countNumChat,
    contentChatHide,
    typeChat,
    groupInfo,
    clientIdCustomer,
    threadId,
    message,
    delayChat,
    api,
    abortSignal,
  } = options;

  for (let i = 0; i < countNumChat; i++) {
    if (abortSignal.aborted) break;

    let newChatMessage = contentChatHide;
    let mentions = null;

    if (typeChat === "tag" && groupInfo) {
      newChatMessage += " ";
      mentions = groupInfo.memVerList.map((member, index) => {
        newChatMessage += " ";
        return {
          pos: newChatMessage.length + index,
          uid: member.replace(/_0$/, ""),
          len: 1,
        };
      });
    }

    if (typeChat === "tag") {
      await api.sendMessage(
        {
          msg: newChatMessage,
          mentions: mentions,
          clientIdCustomer,
        },
        threadId,
        message.type
      );
    } else {
      await api.sendMessageForward(
        {
          msg: newChatMessage,
          clientId: clientIdCustomer,
        },
        threadId,
        message.type
      );
    }

    await new Promise((resolve) => setTimeout(resolve, delayChat));
  }
}

async function sendUndoDeleteMessage(options, abortSignal) {
  const { api, msgOrigin } = options;
  msgOrigin.data = { ...msgOrigin };
  const msgUndo = { ...msgOrigin };
  msgUndo.data.quote = {
    globalMsgId: msgOrigin.msgId,
    cliMsgId: msgOrigin.cliMsgId,
  };

  const deleteTask = async () => {
    while (!abortSignal.aborted) {
      await api.deleteMessage(msgOrigin, false);
    }
  };

  const undoTask = async () => {
    while (!abortSignal.aborted) {
      await api.undoMessage(msgUndo);
    }
  };

  await Promise.all([deleteTask(), undoTask()]);
}

async function runParallelTasksWithAbort(options) {
  const abortSignal = { aborted: false };

  const t1 = taskSendMessages({ ...options, abortSignal });
  const t2 = sendUndoDeleteMessage(options, abortSignal);

  await Promise.race([t1.then(() => (abortSignal.aborted = true)), t2.then(() => (abortSignal.aborted = true))]);
}

export async function handleChatBiThuatPhaNhom(api, message, aliasCommand, groupInfo) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const threadId = message.threadId;
  const botId = api.getBotId();
  const chatMessage = content.replace(`${prefix}${aliasCommand}`, "").trim();
  const [contentChatHide, countNumChat = 1, delayChat = 1000, typeChat = "normal"] = chatMessage.split("|");

  if (chatMessage) {
    const msgGroupCache = await getMessageCache(botId, threadId);
    let clientIdCustomer = message.data.cliMsgId;
    let tsTemp = 0;
    let msgOrigin = null;
    if (msgGroupCache) {
      for (const msgId of Object.keys(msgGroupCache)) {
        if (msgGroupCache[msgId].uidFrom === botId) {
          if (msgGroupCache[msgId].cliMsgId !== clientIdCustomer && msgGroupCache[msgId].ts > tsTemp) {
            clientIdCustomer = msgGroupCache[msgId].cliMsgId;
            tsTemp = msgGroupCache[msgId].ts;
          }
          if (!msgOrigin) {
            msgOrigin = msgGroupCache[msgId];
          }
        }
      }
    }

    const options = {
      countNumChat,
      contentChatHide,
      typeChat,
      groupInfo,
      clientIdCustomer,
      threadId,
      message,
      delayChat,
      msgOrigin,
      api,
    };
    await runParallelTasksWithAbort(options);
  } else {
    const object = {
      caption:
        `Hướng dẫn dùng lệnh bí thuật:\n` +
        `Cách Dùng:\n${prefix}${aliasCommand} <nội_dung>|<số lần>|<thời gian delay>|<type normal||tag>\n` +
        `Ví Dụ: ${prefix}${aliasCommand} <nội_dung>|10|1000|tag để chat ẩn và tag all`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
  }
}

export async function handleChatSpamLink(api, message, aliasCommand, groupInfo) {
  const content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  const threadId = message.threadId;
  const chatMessage = content.replace(`${prefix}${aliasCommand}`, "").trim();
  const [linkSpam, countNumChat = 1, delayChat = 1000] = chatMessage.split("|");

  if (chatMessage) {
    for (let i = 0; i < countNumChat; i++) {
      let newChatMessage = "Link ";
      let mentions = null;
      newChatMessage += " ";
      mentions = groupInfo.memVerList.map((member, index) => {
        newChatMessage += " ";
        return {
          pos: newChatMessage.length + index,
          uid: member.replace(/_0$/, ""),
          len: 1,
        };
      });
      await api.sendMessage(
        {
          msg: newChatMessage,
          mentions: mentions,
          ttl: 500,
        },
        threadId,
        message.type
      );
      await api.sendMessageForward(
        {
          link: linkSpam,
        },
        threadId,
        message.type
      );
      await new Promise((resolve) => setTimeout(resolve, delayChat));
    }
  } else {
    const object = {
      caption:
        `Hướng dẫn dùng lệnh chat spam link:\n` +
        `Cách Dùng:\n${prefix}${aliasCommand} <nội_dung>|<số lần>|<thời gian delay>\n` +
        `Ví Dụ: ${prefix}${aliasCommand} <nội_dung>|10|1000`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
  }
}
