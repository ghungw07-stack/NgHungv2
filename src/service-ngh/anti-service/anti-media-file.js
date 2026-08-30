import schedule from "node-schedule";
import chalk from "chalk";
import { MessageMention, MessageSendType } from "zlbotngh";
import { extendMuteDuration } from "./mute-user.js";
import { isInWhiteList } from "./white-list.js";
import {
  sendMessageComplete,
  sendMessageFailed,
  sendMessageStateQuote,
  sendMessageWarning,
} from "../chat-zalo/chat-style/chat-style.js";
import { removeMention } from "../../utils/format-util.js";
import { getAntiConfig, updateAntiConfig } from "./index.js";
import { checkExstentionFileRemote } from "../../utils/util.js";
import { getGlobalPrefix } from "../service.js";
import { calculateFileHashFromURLByStream } from "../../utils/local-upload-cache.js";
import { deleteMessageCustomer } from "../../commands/bot-manager/utilities.js";

function checkMediaForbidden(botId, hashcodeTarget) {
  let hashsList = getAntiConfig(botId)?.hashsFileForbidden || [];

  for (const [hashcode, pattern] of Object.entries(hashsList)) {
    if (hashcodeTarget === hashcode) {
      return {
        found: true,
        word: hashcode,
        name: pattern.name,
      };
    }
  }

  return {
    found: false,
  };
}

async function handleMediaForbiddenModification(api, message, action, keyword) {
  const botId = api.getBotId();
  const threadId = message.threadId;
  const quote = message.data.quote;

  const antiState = getAntiConfig(botId);
  const currentHashsForbidden = { ...antiState.hashsFileForbidden };
  const keyListHashs = Object.keys(currentHashsForbidden);

  if (action === "add") {
    if (!quote) {
      const caption = `Vui lòng quote media cần ${action === "add" ? "thêm vào" : "xóa bỏ khỏi"} list cấm`;
      await sendMessageWarning(api, message, caption, false, TIME_TO_LIVE);
      return true;
    }

    const attach = quote.attach;
    if (!attach) {
      const caption = `Không có đính kèm trong nội dung reply để ${
        action === "add" ? "thêm vào" : "xóa bỏ khỏi"
      } list cấm`;
      await sendMessageWarning(api, message, caption, false, TIME_TO_LIVE);
      return;
    }

    const cliMsgType = message.data.quote.cliMsgType;
    const attachData = JSON.parse(attach);

    if (cliMsgType === MessageSendType["chat.sticker"]) {
      if (!keyListHashs.includes(attachData.id)) {
        currentHashsForbidden[attachData.id] = {
          name: "Sticker ID " + attachData.id,
        };
        updateAntiConfig(botId, {
          ...antiState,
          hashsFileForbidden: currentHashsForbidden,
        });
        await sendMessageWarning(
          api,
          message,
          `Đã thêm Sticker ID ${attachData.id} vào danh sách cấm gửi trong toàn bộ phạm vi nhóm mà Bot quản lý!`
        );
      } else {
        await sendMessageWarning(api, message, `Sticker ID ${attachData.id} đã nằm trong danh sách cấm gửi`);
      }
      return;
    }

    const mediaUrl = attachData.hdUrl || attachData.href;

    if (!mediaUrl) {
      const caption = `Không có link media trong đính kèm của nội dung reply để ${
        action === "add" ? "thêm vào" : "xóa bỏ khỏi"
      } list cấm`;
      await sendMessageWarning(api, message, caption, false, TIME_TO_LIVE);
      return;
    }

    const ext = await checkExstentionFileRemote(mediaUrl);
    if (!ext) {
      const caption = `Định dạng của media đính kèm không được hỗ trợ để kiểm tra... thông cảm!!`;
      await sendMessageFailed(api, message, caption, false, TIME_TO_LIVE);
      return;
    }

    const hashCode = await calculateFileHashFromURLByStream(mediaUrl);
    if (hashCode.status === "error") {
      const caption = `Có lỗi khi xử lý dữ liệu: ${hashCode.message}`;
      await sendMessageFailed(api, message, caption, true, TIME_TO_LIVE);
      return;
    }

    if (!keyListHashs.includes(hashCode.hashCode)) {
      currentHashsForbidden[hashCode.hashCode] = {
        name: keyword || mediaUrl,
        link: mediaUrl,
      };
      updateAntiConfig(botId, {
        ...antiState,
        hashsFileForbidden: currentHashsForbidden,
      });
      await sendMessageComplete(api, message, `Đã thêm target media này vào danh sách media cấm`, true, 60000);
    } else {
      await sendMessageWarning(api, message, `Media này đã có trong danh sách media cấm`, false, 60000);
    }
  } else if (action === "remove") {
    const index = parseInt(keyword) - 1;
    if (index > -1 && index < keyListHashs.length) {
      const hashCode = keyListHashs[index];
      delete currentHashsForbidden[hashCode];
      updateAntiConfig(botId, {
        ...antiState,
        hashsFileForbidden: currentHashsForbidden,
      });
      const capt = `Đã xóa item "${hashCode}" khỏi danh sách media cấm`;
      await sendMessageComplete(api, message, capt, true, 60000);
    } else {
      const capt = `Index không hợp lệ, vui lòng nhập lại index từ 1 đến ${keyListHashs.length}`;
      await sendMessageWarning(api, message, capt, true, 60000);
    }
  }
}

// Hiển thị danh sách media bị cấm
async function showMediaForbiddenList(api, message) {
  const botId = api.getBotId();
  const threadId = message.threadId;
  try {
    const antiState = getAntiConfig(botId);
    const hashsList = antiState.hashsFileForbidden || {};
    const entries = Object.entries(hashsList);

    if (entries.length === 0) {
      await sendMessageComplete(api, message, "Hiện tại chưa có media nào bị cấm.", true, 180000);
      return;
    }

    let formattedList = "📝 Danh sách media bị cấm:\n";
    entries.forEach(([hashcode, info], index) => {
      formattedList += `${index + 1}. ${info.name || "Media không tên"} (${hashcode.substring(0, 8)}...)\n`;
    });

    formattedList += "\n💡 Dùng lệnh:\n- !antimedia add để thêm (quote media)\n- !antimedia remove [số thứ tự] để xóa";
    await sendMessageComplete(api, message, formattedList, true, 180000);
  } catch (error) {
    console.error("Lỗi khi đọc danh sách media cấm:", error);
    await sendMessageFailed(api, message, "Đã xảy ra lỗi khi đọc danh sách media cấm.", true, 180000);
  }
}

export async function handleAntiMediaCommand(api, message, aliasCommand, groupSettings) {
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const threadId = message.threadId;
  const content = removeMention(message);
  let keyword = content.replace(`${prefix}${aliasCommand}`, "");
  const args = keyword.trim().split(" ");
  const command = args[0]?.toLowerCase();

  if (command === "list") {
    await showMediaForbiddenList(api, message);
    return true;
  }

  if (command === "show") {
    await showViolationHistory(api, message, threadId);
    return true;
  }

  if (command === "add" || command === "remove") {
    const word = args.splice(1).join(" ");
    await handleMediaForbiddenModification(api, message, command, word);
    return true;
  }

  if (command === "on") {
    groupSettings[threadId].antiMediaFile = true;
  } else if (command === "off") {
    groupSettings[threadId].antiMediaFile = false;
  } else {
    groupSettings[threadId].antiMediaFile = !groupSettings[threadId].antiMediaFile;
  }

  const newStatus = groupSettings[threadId].antiMediaFile ? "bật" : "tắt";
  const caption = `Chức năng lọc xóa nội dung media đã được ${newStatus}!`;
  await sendMessageStateQuote(api, message, caption, groupSettings[threadId].antiMediaFile, 300000);
  return true;
}

async function saveMediaViolation(botId, threadId, userId, userName, mediaHash, mediaName) {
  const antiState = getAntiConfig(botId);
  const violations = antiState.mediaViolations || {};

  if (!violations[threadId]) {
    violations[threadId] = {};
  }

  if (!violations[threadId][userId]) {
    violations[threadId][userId] = {
      count: 0,
      media: [],
      name: userName,
    };
  }

  violations[threadId][userId].count++;
  violations[threadId][userId].media.push({
    hash: mediaHash,
    name: mediaName,
    time: Date.now(),
  });

  if (violations[threadId][userId].media.length > 3) {
    violations[threadId][userId].media = violations[threadId][userId].media.slice(-3);
  }

  updateAntiConfig(botId, {
    ...antiState,
    mediaViolations: violations,
  });

  return violations[threadId][userId];
}

export async function antiMedia(api, message, groupSettings, isAdminBox, botIsAdminBox, isSelf) {
  const isPlainText = typeof message.data.content === "string";
  const botId = api.getBotId();
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const content = message.data.content;
  const mediaUrl = content?.url || content?.href || content?.hdUrl;
  let checkMediaResult = { found: false };

  if (groupSettings[threadId]?.antiMediaFile) {
    if (isSelf || isPlainText || !botIsAdminBox || isAdminBox || isInWhiteList(groupSettings, threadId, senderId))
      return false;
    if (message.data.msgType === "chat.sticker") {
      checkMediaResult = checkMediaForbidden(botId, message.data.content.id.toString());
    } else if (mediaUrl) {
      if (!(await checkExstentionFileRemote(mediaUrl, false))) return false;
      const hashCode = await calculateFileHashFromURLByStream(mediaUrl);
      if (hashCode.status === "error") return false;
      checkMediaResult = checkMediaForbidden(botId, hashCode.hashCode);
    }
    if (checkMediaResult.found) {
      try {
        await deleteMessageCustomer(api, message);
        const senderName = message.data.dName;

        const violation = await saveMediaViolation(
          botId,
          threadId,
          senderId,
          senderName,
          checkMediaResult.word,
          checkMediaResult.name
        );

        let warningMsg = `${senderName} -> Tin nhắn bị xóa vì chứa media bị cấm: "${checkMediaResult.name}"\n`;
        warningMsg += `Cảnh cáo lần ${violation.count}/3`;

        if (violation.count >= 3) {
          await extendMuteDuration(threadId, senderId, senderName, groupSettings, 900);

          const antiState = getAntiConfig(botId);
          const violations = { ...antiState.mediaViolations };

          if (violations[threadId]?.[senderId]) {
            violations[threadId][senderId].count = 0;

            updateAntiConfig(botId, {
              ...antiState,
              mediaViolations: violations,
            });
          }

          warningMsg += "\n⚠️ Vi phạm 3 lần, bạn bị cấm chat trong 15 phút!";
        }

        await api.sendMessage(
          {
            msg: warningMsg,
            quote: message,
            mentions: [MessageMention(senderId, senderName.length, 0)],
            ttl: 30000,
          },
          threadId,
          message.type
        );
        return true;
      } catch (error) {
        console.error("Có lỗi xảy ra khi anti media:", error.message);
      }
    }
  }
  return false;
}

export async function showViolationHistory(api, message, threadId) {
  const botId = api.getBotId();
  try {
    const mentions = message.data.mentions;

    if (!mentions || mentions.length === 0) {
      const capt = "Vui lòng tag (@mention) người dùng để xem lịch sử vi phạm.";
      await sendMessageWarning(api, message, capt, false, 60000);
      return;
    }

    const antiState = getAntiConfig(botId);
    const violations = antiState.mediaViolations || {};

    let responseMsg = "📝 Lịch sử vi phạm media:\n\n";
    const messageMentions = [];
    let mentionPosition = responseMsg.length;

    for (const mention of mentions) {
      const userId = mention.uid;
      const userName = message.data.content.substr(mention.pos, mention.len).replace("@", "");
      const userViolations = violations[threadId]?.[userId];

      messageMentions.push(MessageMention(userId, userName.length, mentionPosition));

      if (!userViolations || userViolations.media.length === 0) {
        responseMsg += `${userName} chưa có vi phạm nào.\n\n`;
      } else {
        const countViolations = userViolations.count;
        let recentViolations = "Những vi phạm gần nhất:\n";
        recentViolations += userViolations.media
          .slice(-3)
          .map(
            (v, i) => `  ${i + 1}. "${v.name || v.hash.substring(0, 8) + "..."}" - ${new Date(v.time).toLocaleString()}`
          )
          .join("\n");

        responseMsg += `${userName}:\n`;
        responseMsg += `Số lần vi phạm: ${countViolations}\n`;
        responseMsg += `${recentViolations}\n`;
      }

      mentionPosition = responseMsg.length;
    }

    await api.sendMessage(
      {
        msg: responseMsg.trim(),
        quote: message,
        mentions: messageMentions,
        ttl: 30000,
      },
      threadId,
      message.type
    );
  } catch (error) {
    console.error("Lỗi khi đọc lịch sử vi phạm media:", error);
    await sendMessageFailed(api, message, "Đã xảy ra lỗi khi đọc lịch sử vi phạm media.", true, 180000);
  }
}

export async function startMediaViolationCheck(api) {
  const botId = api.getBotId();

  api.apiInstance.schedule.checkMediaViolation = schedule.scheduleJob("*/5 * * * * *", async () => {
    try {
      const antiState = getAntiConfig(botId);
      let hasChanges = false;
      const currentTime = Date.now();
      const VIOLATION_TIMEOUT = 30 * 60 * 1000;

      const violations = { ...antiState.mediaViolations } || {};

      for (const threadId in violations) {
        for (const userId in violations[threadId]) {
          const userViolations = violations[threadId][userId];

          const recentViolations = userViolations.media.filter((violation) => {
            return currentTime - violation.time < VIOLATION_TIMEOUT;
          });

          if (recentViolations.length < userViolations.media.length) {
            hasChanges = true;
            userViolations.media = recentViolations;

            userViolations.count = recentViolations.length;

            if (recentViolations.length === 0) {
              delete violations[threadId][userId];
            }
          }
        }

        if (Object.keys(violations[threadId]).length === 0) {
          delete violations[threadId];
        }
      }

      if (hasChanges) {
        updateAntiConfig(botId, {
          ...antiState,
          mediaViolations: violations,
        });
      }
    } catch (error) {
      console.error("Lỗi khi kiểm tra vi phạm media:", error);
    }
  });

  console.log(chalk.yellow("Đã khởi động schedule kiểm tra vi phạm media"));
}
