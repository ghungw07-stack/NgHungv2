import { LRUCache } from "lru-cache";
import { isAdmin } from "../../index.js";
import {
  sendMessageComplete,
  sendMessageCompleteRequest,
  sendMessageFailed,
  sendMessageQuery,
  sendMessageTag,
  sendMessageWarning,
} from "../../service-dqt/chat-zalo/chat-style/chat-style.js";
import { getGroupAdmins } from "../../service-dqt/info-service/group-info.js";
import { getGlobalPrefix } from "../../service-dqt/service.js";
import { removeMention } from "../../utils/format-util.js";

const TIME_WAIT_SELECTION = 60000;
const scanResultsMap = new LRUCache({
  max: 500,
  ttl: TIME_WAIT_SELECTION,
});

// Thêm hàm helper để chia mảng
function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

// Thêm hàm helper để chia tin nhắn thành các phần nhỏ hơn
function chunkMessage(message, maxLength = 1120) {
  if (message.length <= maxLength) return [message];

  const chunks = [];
  const lines = message.split("\n");
  let currentChunk = "";

  for (const line of lines) {
    if (currentChunk.length + line.length + 1 > maxLength) {
      chunks.push(currentChunk);
      currentChunk = line;
    } else {
      currentChunk += (currentChunk ? "\n" : "") + line;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks.map(
    (chunk, index, array) =>
      `${chunk}${index === array.length - 1 ? "" : "\n(Còn tiếp...)"}${
        index > 0 ? `\n(Phần ${index + 1}/${array.length})` : `\n(Phần ${index + 1}/${array.length})`
      }`
  );
}

// Thêm hàm để chia kết quả tìm kiếm thành các nhóm nhỏ hơn cho việc tag
function chunkSearchResults(searchResults, maxPerChunk = 30) {
  return chunkArray(searchResults, maxPerChunk);
}

// Thêm hàm helper để lấy members
async function getMembersInfo(api, memberIds) {
  try {
    if (memberIds.length <= 500) {
      const result = await api.getInfoMembers(memberIds);
      return Object.values(result.profiles);
    }

    // Chia thành các chunks nhỏ hơn 500
    const chunks = chunkArray(memberIds, 500);
    let allMembers = [];

    // Request từng chunk và gộp kết quả
    for (const chunk of chunks) {
      const result = await api.getInfoMembers(chunk);
      allMembers = [...allMembers, ...Object.values(result.profiles)];
    }

    return allMembers;
  } catch (error) {
    console.error("Error getting members info:", error);
    throw error;
  }
}

export async function scanGroupsWithAction(api, message, groupInfo, aliasCommand) {
  const prefixCommand = getGlobalPrefix(api.getBotId());
  let content = removeMention(message);
  content = content.replace(`${prefixCommand}${aliasCommand}`, "").trim();
  const idBot = api.getBotId();
  const groupAdmins = await getGroupAdmins(groupInfo);
  const botIsAdminBox = groupAdmins.includes(idBot.toString());

  const args = content.split(" ");
  const action = args[0]?.toLowerCase();
  const searchTerm = args.slice(1).join(" ");

  const VALID_ACTIONS = {
    find: "kết quả khớp hoàn toàn",
    findmatch: "kết quả khớp một phần",
    tìm: "kết quả khớp hoàn toàn",
    findtag: "kết quả khớp hoàn toàn và tag",
    findmatchtag: "kết quả khớp một phần và tag",
  };

  if (!action || !VALID_ACTIONS[action]) {
    return sendMessageQuery(
      api,
      message,
      `⚠️ Vui lòng nhập lệnh với 1 trong các hành động: ${Object.keys(VALID_ACTIONS).join(", ")}!\n` +
        `Ví dụ: ${prefixCommand}${aliasCommand} find tên_thành_viên`,
      true
    );
  }

  if (!searchTerm) {
    return sendMessageQuery(api, message, "⚠️ Vui lòng nhập từ khóa tìm kiếm!", true);
  }
  try {
    const members = await getMembersInfo(api, groupInfo.memVerList);

    const searchFunction =
      action === "findmatch" || action === "findmatchtag"
        ? (member) => {
            const memberName = member.zaloName.toLowerCase();
            const search = searchTerm.toLowerCase();
            return memberName.includes(search) && idBot !== member.id;
          }
        : (member) => member.zaloName.toLowerCase() === searchTerm.toLowerCase() && idBot !== member.id;

    const searchResults = members.filter(searchFunction);

    let msg;
    let mentions = [];
    let mentionPos = 0;
    let sentMessage;

    if (searchResults.length) {
      if (action === "findmatchtag" || action === "findtag") {
        const resultChunks = chunkSearchResults(searchResults);

        for (let chunkIndex = 0; chunkIndex < resultChunks.length; chunkIndex++) {
          const currentChunk = resultChunks[chunkIndex];
          const isLastChunk = chunkIndex === resultChunks.length - 1;

          let chunkMentions = [];
          let chunkMsg =
            chunkIndex === 0
              ? `🔍 Kết quả tìm kiếm cho "${searchTerm}" trong nhóm ${groupInfo.name}:\n\n`
              : `🔍 Kết quả tìm kiếm cho "${searchTerm}" (tiếp theo):\n\n`;

          let chunkMentionPos = chunkMsg.length;

          chunkMsg += currentChunk
            .map((member, index) => {
              const actualIndex = chunkIndex * resultChunks[0].length + index + 1;
              const indexString = `${actualIndex}. `;
              const memberText = `${indexString}@${member.zaloName}\n  - ID: ${member.id}`;

              const currentPos = chunkMentionPos + indexString.length;

              chunkMentions.push({
                uid: member.id,
                len: member.zaloName.length + 1,
                pos: currentPos,
              });

              chunkMentionPos += memberText.length + 2;
              return memberText;
            })
            .join("\n\n");

          if (isLastChunk && botIsAdminBox) {
            chunkMsg += `\n\nReply tin nhắn với từ khóa kick/block để thực hiện hành động với các tài khoản này!`;
          }

          if (isLastChunk) {
            sentMessage = await sendMessageTag(
              api,
              message,
              {
                caption: chunkMsg,
                mentions: chunkMentions,
              },
              TIME_WAIT_SELECTION
            );
          } else {
            await sendMessageTag(
              api,
              message,
              {
                caption: chunkMsg,
                mentions: chunkMentions,
              },
              TIME_WAIT_SELECTION
            );
          }
        }
      } else {
        msg =
          `🔍 Kết quả tìm kiếm cho "${searchTerm}" trong nhóm ${groupInfo.name}:\n` +
          `${searchResults
            .map((member, index) => `${index + 1}. ${member.zaloName}\n  - ID: ${member.id}`)
            .join("\n")}\n` +
          `${
            botIsAdminBox ? `\nReply tin nhắn với từ khóa kick/block để thực hiện hành động với các tài khoản này!` : ""
          }`;

        const messageChunks = chunkMessage(msg);

        if (messageChunks.length > 1) {
          for (let i = 0; i < messageChunks.length - 1; i++) {
            await sendMessageComplete(api, message, messageChunks[i], false, TIME_WAIT_SELECTION);
          }

          const lastChunk = messageChunks[messageChunks.length - 1];
          sentMessage = await sendMessageCompleteRequest(
            api,
            message,
            {
              caption: lastChunk,
            },
            TIME_WAIT_SELECTION
          );
        } else {
          sentMessage = await sendMessageCompleteRequest(
            api,
            message,
            {
              caption: msg,
            },
            TIME_WAIT_SELECTION
          );
        }
      }
    } else {
      msg = `🔍 Không tìm thấy thành viên nào trong nhóm ${groupInfo.name} có ${VALID_ACTIONS[action]} với "${searchTerm}"!`;
      sentMessage = await sendMessageComplete(api, message, msg, true);
    }

    if (searchResults.length > 0) {
      scanResultsMap.set(sentMessage.message.msgId.toString(), {
        results: searchResults,
        groupInfo,
        timestamp: Date.now(),
        userRequest: message.data.uidFrom,
        botId: idBot,
        botIsAdminBox,
      });
    }

    return;
  } catch (error) {
    console.error(`Lỗi khi thực hiện lệnh scanGroupsWithAction:`, error);
    await sendMessageFailed(
      api,
      message,
      "❌ Đã xảy ra lỗi khi quét thành viên nhóm, vui lòng thử lại hoặc nhập thông tin cụ thể hơn!",
      true
    );
    return;
  }
}

export async function handleScanGroupsReply(api, message) {
  const idBot = api.getBotId();
  const threadId = message.threadId;

  try {
    if (!message.data.quote || !message.data.quote.globalMsgId) return false;

    const quotedMsgId = message.data.quote.globalMsgId.toString();
    if (!scanResultsMap.has(quotedMsgId)) return false;

    const scanData = scanResultsMap.get(quotedMsgId);

    if (scanData.botId !== idBot) return false;
    await api.addReaction("CLOCK", message);

    if (scanData.userRequest !== message.data.uidFrom) {
      await sendMessageWarning(api, message, "Bạn không phải người yêu cầu hành động này!", true);
      return true;
    }

    const content = removeMention(message);
    const action = content === "kick" ? "kick" : content === "block" ? "block" : null;

    if (!action) {
      await sendMessageQuery(api, message, "⚠️ Vui lòng sử dụng một trong các từ khóa 'kick' hoặc 'block'!", true);
      return true;
    }

    if (!scanData.botIsAdminBox) {
      await sendMessageQuery(api, message, "Tôi không đủ quyền để thực hiện hành động này!", true);
      return true;
    }

    const groupAdmins = await getGroupAdmins(scanData.groupInfo);
    const uidFinal = [];
    const results = [];

    for (const member of scanData.results) {
      if (isAdmin(idBot, member.id, threadId)) {
        results.push(`${member.zaloName} -> Không thể ${action === "kick" ? "Kick" : "Block"} quản trị nhóm!`);
      } else {
        uidFinal.push(member);
      }
    }

    if (action === "kick") {
      for (const member of uidFinal) {
        try {
          await api.removeUserFromGroup(threadId, [member.id]);
          results.push(`${member.zaloName} -> Đã Kick!`);
        } catch (error) {
          results.push(`${member.zaloName} -> Không thể Kick do ${error.message}!`);
        }
      }
    } else {
      for (const member of uidFinal) {
        try {
          await api.blockUsers(threadId, [member.id]);
          results.push(`${member.zaloName} -> Đã Block!`);
        } catch (error) {
          results.push(`${member.zaloName} -> Không thể Block do ${error.message}!`);
        }
      }
    }

    const msgDel = {
      type: message.type,
      threadId: message.threadId,
      data: {
        cliMsgId: message.data.quote.cliMsgId,
        msgId: message.data.quote.globalMsgId,
        uidFrom: idBot,
      },
    };
    await api.deleteMessage(msgDel, false);
    // await api.undoMessage(message);
    scanResultsMap.delete(quotedMsgId);

    await sendMessageComplete(api, message, `Kết quả thực hiện ${action}:\n${results.join("\n")}`, false);

    return true;
  } catch (error) {
    console.error(`Lỗi khi xử lý reply scan:`, error);
    await sendMessageQuery(api, message, "❌ Đã xảy ra lỗi khi thực hiện hành động. Vui lòng thử lại sau!", true);
    return true;
  }
}
