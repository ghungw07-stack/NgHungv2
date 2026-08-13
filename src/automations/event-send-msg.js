import schedule from "node-schedule";
import { MessageMention, MessageSendType, MessageType } from "zlbotdqt";
import { antiForward } from "../service-dqt/anti-service/anti-forward.js";
import { handleAutoRaiLinkMention } from "../service-dqt/scheduler/auto-rai-link.js";
import { handleWerewolfGroupRestriction, handleWerewolfGroupVote } from "../service-dqt/game-service/ma-soi/index.js";
import { inheritBotLeader, isAdmin } from "../index.js";
import { antiFile } from "../service-dqt/anti-service/anti-file.js";
import { antiLink } from "../service-dqt/anti-service/anti-link.js";
import { antiSpam } from "../service-dqt/anti-service/anti-spam.js";
import { antiBadWord } from "../service-dqt/anti-service/anti-badword.js";
import { antiNotText } from "../service-dqt/anti-service/anti-not-text.js";
import { handleMute } from "../service-dqt/anti-service/mute-user.js";
import { Reactions, ReactionMap } from "../api-zalo/index.js";
import { handleOnChatUser, handleOnReplyFromUser } from "../service-dqt/service.js";
import { chatWithSimsimi } from "../service-dqt/chat-bot/simsimi/simsimi-api.js";
import { handleChatBot } from "../service-dqt/chat-bot/bot-learning/dqt-bot.js";
import { autoJoinGroup } from "../service-dqt/anti-service/auto-join.js";
import { getGroupAdmins, getGroupInfoData } from "../service-dqt/info-service/group-info.js";
import { updateUserRank } from "../service-dqt/info-service/rank-chat.js";
import { writeGroupSettings } from "../utils/io-json.js";
import { handleCommand, initGroupSettings, handleCommandPrivate, updateNameGroupSetting } from "../commands/command.js";
import { logMessageToFile, readGroupSettings } from "../utils/io-json.js";
import { canvasTest, checkIsValidContext, superCheckBox, testFutureGroup, testFutureUser } from "./ndq-test.js";
import { antiNude } from "../service-dqt/anti-service/anti-nude/anti-nude.js";
import { isUserBlocked } from "../commands/bot-manager/group-manage.js";
import { getUserInfoBasic } from "../service-dqt/info-service/user-info.js";
import { check } from "diskusage";
import { antiMedia } from "../service-dqt/anti-service/anti-media-file.js";
import { antiStickerEffect } from "../service-dqt/anti-service/anti-sticker-effect.js";
import { antiPhotoVideo } from "../service-dqt/anti-service/anti-photo.js";
import { antiTag } from "../service-dqt/anti-service/anti-tag.js";
import { antiAllEffectSticker } from "../service-dqt/anti-service/anti-sticker.js";
import { antiVoice } from "../service-dqt/anti-service/anti-voice.js";
import { handleAutoReplyGemini } from "../service-dqt/api-crawl/assistant-ai/auto-reply-gemini.js";
import { antiPhoneNumber } from "../service-dqt/anti-service/anti-phone-number.js";
import { antiBot } from "../service-dqt/anti-service/anti-bot.js";
import { pushMessageToWebLog } from "../web-service/web-server.js";
import { antiAllEffectGif } from "../service-dqt/anti-service/anti-gif.js";
import { getAutoReplyPMConfig, getPrCard } from "../commands/bot-manager/welcome-bye.js";
import { sendMessageFromSQL } from "../service-dqt/chat-zalo/chat-style/chat-style.js";
import { handleNotifyParentOnPM, handleParentReplyToPM } from "../manager-bot/notify-parent-pm.js";
import { checkAutoPingId } from "../commands/send-all/ping-id.js";

class GroupsSettingsAll {
  constructor() {
    this.groupsList = {};
    this.hasChanges = false;
  }

  load() {
    this.groupsList = readGroupSettings();
  }

  get() {
    return this.groupsList;
  }

  setChanged() {
    this.hasChanges = true;
  }

  getByID(idBot) {
    if (!this.groupsList[idBot]) {
      this.groupsList[idBot] = {};
      this.setChanged();
    }
    return this.groupsList[idBot];
  }

  save() {
    if (this.hasChanges) {
      writeGroupSettings(this.groupsList);
      this.hasChanges = false;
    }
  }
}

export const groupSettingsAll = new GroupsSettingsAll();

let contentTempThread;

groupSettingsAll.load();

const userLastMessageTime = new Map();
const COOLDOWN_TIME = 1000;

const lastBusinessCardTime = new Map();
const BUSINESS_CARD_COOLDOWN = 60 * 60 * 1000;

const lastSendTagUser = new Map();
const SEND_REPLY_TAG_COOLDOWN = 5 * 1000;

const lastAdminReplyTime = new Map();
const ADMIN_REPLY_COOLDOWN = 24 * 60 * 60 * 1000; // 24 hours

const lastAutoReplyTime = new Map();
const AUTO_REPLY_COOLDOWN = 1 * 60 * 60 * 1000; // 1 hour to prevent spam

// === Chống flood: chặn xử lý trùng cliMsgId, scoped theo từng bot ===
// key: `${idBot}_${cliMsgId}` -> timestamp. Trùng 1 lần là bỏ qua luôn, không delay.
const processedCliMsgIds = new Map();
const CLI_MSG_DEDUPE_TTL = 30 * 1000; // giữ 30s rồi tự dọn, đủ để chặn spam dồn dập

function isDuplicateCliMsg(idBot, message) {
  const cliMsgId = message?.data?.cliMsgId ?? message?.data?.msgId;
  if (!cliMsgId) return false; // không lấy được id thì không chặn được, cho qua bình thường

  const key = `${idBot}_${cliMsgId}`;
  if (processedCliMsgIds.has(key)) {
    return true;
  }
  processedCliMsgIds.set(key, Date.now());
  return false;
}

async function canReplyToUser(senderId) {
  const currentTime = Date.now();
  const lastMessageTime = userLastMessageTime.get(senderId);

  if (!lastMessageTime || currentTime - lastMessageTime >= COOLDOWN_TIME) {
    userLastMessageTime.set(senderId, currentTime);
    return true;
  }
  return false;
}

export async function checkAndSendBusinessCard(api, senderId, senderName, isAdminLevelHighest) {
  const idBot = api.getBotId();
  if (isAdminLevelHighest) return false;
  const currentTime = Date.now();
  const lastSentTime = lastBusinessCardTime.get(senderId);

  if (!lastSentTime || currentTime - lastSentTime >= BUSINESS_CARD_COOLDOWN) {
    lastBusinessCardTime.set(senderId, currentTime);
    const admins = api.apiManager.getListAdmin();
    if ((admins.lenght > 0 && admins.includes(senderId.toString())) || senderId === idBot) return false;
    if (admins.length == 0 || (admins.length == 1 && admins.includes(idBot.toString()))) return false;
    await api.sendMessage(
      {
        msg:
            `Xin chào ${senderName}!\n` +
            `Đây là tin nhắn tự động, nếu sau 5 phút không rep --> đang bận!\n` +
            `Mình sẽ trả lời trong thời gian sớm nhất\n` +
            "Xin cảm ơn\n...\n" +
            "Mình có thể giúp gì cho bạn...?",
        },
        senderId,
        MessageType.DirectMessage
      );
    for (const userId of admins) {
      if (userId != idBot) {
        await api.sendBusinessCard(null, userId, null, MessageType.DirectMessage, senderId);
      }
    }
    await api.sendMessage(
      {
        msg:
          `Xin chào ${senderName}!\n` +
          `Đây là tin nhắn tự động, nếu sau 5 phút không rep --> đang bận!\n` +
          `Mình sẽ trả lời trong thời gian sớm nhất\n` +
          "Xin cảm ơn\n...\n" +
          "Mình có thể giúp gì cho bạn...?",
      },
      senderId,
      MessageType.DirectMessage
    );
    return true;
  }
  return false;
}

export async function checkTagAndSendReply(api, message) {
  const threadId = message.threadId;
  const type = message.type;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  if (isAdmin(senderId)) return false;
  const currentTime = Date.now();
  const lastSentTime = lastSendTagUser.get(senderId);

  if (!lastSentTime || currentTime - lastSentTime >= SEND_REPLY_TAG_COOLDOWN) {
    lastSendTagUser.set(senderId, currentTime);
    const idBot = api.getBotId();
    const admins = api.apiManager.getListAdmin();
    if (admins.length == 0 || (admins.length == 1 && admins.includes(idBot.toString()))) return false;
    let adminIds = ["5754754243846248387"];
    const captPrefix = `Xin chào `;
    let caption = `Vui lòng bấm vào đây để nhắn tin cho chủ tôi`;
    const mentions = [MessageMention(senderId, senderName.length, captPrefix.length)];
    await api.sendMessage(
      {
        msg: `${captPrefix}${senderName}!\n${caption}`,
        mentions,
      },
      threadId,
      type
    );
    for (const userId of adminIds) {
      if (userId != idBot) {
        await api.sendBusinessCard(null, userId, `Danh Thiếp Chủ Thể`, message.type, message.threadId);
      }
    }
    return true;
  }
  return false;
}

schedule.scheduleJob("*/10 * * * * *", () => {
  const currentTime = Date.now();
  for (const [userId, lastTime] of userLastMessageTime.entries()) {
    if (currentTime - lastTime > 60000) {
      userLastMessageTime.delete(userId);
    }
  }
  for (const [userId, lastTime] of lastBusinessCardTime.entries()) {
    if (currentTime - lastTime > BUSINESS_CARD_COOLDOWN) {
      lastBusinessCardTime.delete(userId);
    }
  }
  for (const [userId, lastTime] of lastSendTagUser.entries()) {
    if (currentTime - lastTime > SEND_REPLY_TAG_COOLDOWN) {
      lastSendTagUser.delete(userId);
    }
  }
  for (const [userId, lastTime] of lastAutoReplyTime.entries()) {
    if (currentTime - lastTime > AUTO_REPLY_COOLDOWN) {
      lastAutoReplyTime.delete(userId);
    }
  }
  for (const [key, lastTime] of processedCliMsgIds.entries()) {
    if (currentTime - lastTime > CLI_MSG_DEDUPE_TTL) {
      processedCliMsgIds.delete(key);
    }
  }
  groupSettingsAll.save();
});

export async function messagesUser(api, message) {
  const idBot = api.getBotId();

  // Chặn ngay từ đầu nếu tin nhắn này (cùng cliMsgId) đã được xử lý rồi cho bot này.
  // Trùng 1 lần là bỏ qua luôn, không delay, không trả lời, không ảnh hưởng bot khác.
  if (isDuplicateCliMsg(idBot, message)) {
    console.log(`[ ${api.accountInfo.name} ] Bỏ qua tin nhắn trùng cliMsgId (chống flood)`);
    return;
  }

  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  let content = message.data.content;
  const isPlainText = typeof message.data.content === "string";
  const senderName = message.data.dName;
  let isAdminLevelHighest = false;
  let isAdminBot = false;
  await inheritBotLeader(api, senderId, senderName);
  isAdminLevelHighest = isAdmin(idBot, senderId);
  isAdminBot = isAdmin(idBot, senderId, threadId);
  let isSelf = idBot === senderId;

  const contentText = isPlainText
    ? content
    : content.href
      ? "Caption: " + content.title + "\nLink: " + content.href
      : content.title
        ? "Caption: " + content.title + "\nParam: " + content.params
        : content.catId
          ? "Sticker ID: " + content.id + " | " + content.catId + " | " + content.type
          : null;

  if (
    message.data?.quote &&
    message.data?.quote.cliMsgType === MessageSendType["chat.photo"] &&
    message.data?.quote?.attach
  ) {
    message.data.quote.attach = message.data.quote.attach.replaceAll("jxl", "jpg");
  }

  const groupSettings = groupSettingsAll.getByID(idBot);
  switch (message.type) {
    case MessageType.DirectMessage: {
      // Bot mẹ reply thông báo của bot con: chuyển thẳng nội dung tới người gửi gốc.
      if (await handleParentReplyToPM(api, message)) return;

      const uidFrom = message.data.uidFrom;
      const idTo = message.data.idTo;
      const userInfoResponse = await api.getInfoMembers([uidFrom, idTo]);
      const userInfo = userInfoResponse.profiles[uidFrom];
      const targetInfo = userInfoResponse.profiles[idTo] || { zaloName: 'Unknown User' };
      pushMessageToWebLog(idBot, message, { source: userInfo, target: targetInfo });
      if (contentText) {
        const logMessage = `[ ${api.accountInfo.name} ] Có Mesage Riêng Tư Mới:
            - Sender Name: [ ${senderName} ] -> [ ${targetInfo.zaloName || 'Unknown User'} ] | ID: ${threadId}
            - Content: ${contentText}\n`;
        logMessageToFile(idBot, logMessage, "message");
      }
      // if (isPlainText) {
      let continueProcessingChat = true;
      continueProcessingChat = !isUserBlocked(idBot, senderId);
      // continueProcessingChat = continueProcessingChat && (isAdminLevelHighest && !isSelf) && !(await testFutureUser(api, message));
      continueProcessingChat = continueProcessingChat && (await canReplyToUser(senderId));
      if (continueProcessingChat) {
        const commandResult = await handleCommandPrivate(api, message, isAdminLevelHighest, isAdminBot, groupSettings);
        continueProcessingChat = continueProcessingChat && (commandResult === 1 || commandResult === -1);
        continueProcessingChat =
          continueProcessingChat &&
          !(await handleOnReplyFromUser(api, message, null, null, null, isAdminLevelHighest, isAdminBot, null, true));
        continueProcessingChat = continueProcessingChat && !isSelf;
        // continueProcessingChat =
        // continueProcessingChat &&
        //   !(!isSelf && (await checkAndSendBusinessCard(api, senderId, senderName, isAdminLevelHighest)));
        // continueProcessingChat = continueProcessingChat && (await chatWithSimsimi(api, message));
        // continueProcessingChat = continueProcessingChat && (await askGeminiCommand(api, message, ""));
// Auto reply PM logic
        if (continueProcessingChat && !isSelf) {
          const autoReplyConfig = getAutoReplyPMConfig();
          const isEnabled = autoReplyConfig.enabled[idBot] || false;
          if (isEnabled) {
            const currentTime = Date.now();
            const lastReplyTime = lastAutoReplyTime.get(senderId);

            if (!lastReplyTime || currentTime - lastReplyTime >= AUTO_REPLY_COOLDOWN) {
              lastAutoReplyTime.set(senderId, currentTime);

            const replyMessage = autoReplyConfig.customMessages[idBot] || autoReplyConfig.defaultMessage;
            await sendMessageFromSQL(
              api,
              message,
              {
                success: false,
                message: replyMessage
              },
              false,
              6000000
            );
            const card = autoReplyConfig.customCards[idBot] || (await getPrCard(idBot));
            if (card) {
              await api.sendBusinessCard(null, card.id, card.content, MessageType.DirectMessage, senderId, 6000000);
            }
          }
        }
      }
      // Notify parent bot when child bot receives PM
      if (!isSelf) {
        await handleNotifyParentOnPM(api, message);
      }
    }
    // }
    break;
    }
    case MessageType.GroupMessage: {
      let nameGroup = "";
      let isAdminBox = false;
      let botIsAdminBox = false;
      let groupAdmins = [];
      let groupInfo = {};
      let senderInfo = {};
      [senderInfo, groupInfo] = await Promise.all([getUserInfoBasic(api, senderId), getGroupInfoData(api, threadId)]);
      initGroupSettings(groupSettings, threadId);
      pushMessageToWebLog(idBot, message, { source: senderInfo, target: groupInfo });
      nameGroup = groupInfo.name;
      updateNameGroupSetting(groupSettings, threadId, nameGroup);
      groupAdmins = await getGroupAdmins(groupInfo);
      botIsAdminBox = groupAdmins.includes(idBot.toString());
      isAdminBox = isAdmin(idBot, senderId, threadId, groupAdmins);
      const blocked = await antiBot(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf);
      // chặn lệnh khi bật anti-bot hehe
      if (blocked) {
        return;
      }

      if (contentText) {
        let keyCheck = contentText + nameGroup;
        const logMessage = `[ ${api.accountInfo.name} ] Có Mesage Nhóm Mới:
              - Tên Nhóm: ${nameGroup} | Group ID: ${threadId}
              - Người Gửi: ${senderName} | Sender ID: ${senderId}
              - Nội Dung: ${contentText}\n`;
        if (contentTempThread === keyCheck) {
          console.log(
            `[ ${api.accountInfo.name} ] Có Mesage Tương Tự Bên Trên | Group ID: ${threadId} | Sender ID: ${senderId}`
          );
          logMessageToFile(idBot, logMessage, "message", false);
        } else {
          contentTempThread = keyCheck;
          logMessageToFile(idBot, logMessage, "message");
        }
      }

      if (isSelf) {
        const isPlainText = typeof message.data.content === "string";
        // if (checkIsValidContext(content)) {
        //   try {
        //     const data = await api.getInfoMembers([api.accountInfo.globalId]);
        //     console.log(data);
        //   } catch {}
        // }
      }

      if (!isSelf) {
        if (threadId == "1469104891207504923") {
          // await canvasTest(api,message, senderId, senderName, nameGroup, groupInfo);
          await testFutureGroup(api, message, groupInfo);
        }
        updateUserRank(idBot, threadId, senderId, message.data.dName, nameGroup);
      }

      let handleChat = true;
      handleChat = handleChat && !(await superCheckBox(api, message, isSelf, botIsAdminBox, isAdminBox, groupInfo));
      handleChat =
        handleChat && !(await antiSpam(api, message, groupInfo, isAdminBox, groupSettings, botIsAdminBox, isSelf));
      handleChat =
        handleChat &&
        !(await handleMute(api, message, groupSettings, isAdminLevelHighest, isAdminBox, botIsAdminBox, isSelf));
      handleChat =
        handleChat && !(await antiLink(api, message, groupInfo, isAdminBox, groupSettings, botIsAdminBox, isSelf));
      const isBlocked = isUserBlocked(idBot, senderId);
      handleChat = handleChat && !isBlocked;
      // Ghi lại trạng thái moderation trước khi activeBot có thể làm handleChat=false.
      // Các anti vẫn phải hoạt động khi bot tắt tương tác, nhưng không được chạy
      // chồng lên nhau sau khi một anti trước đó đã xử lý/xóa tin nhắn.
      const canRunRemainingAnti = handleChat && !isSelf && !isBlocked;
      const werewolfRestricted =
        !isSelf && handleChat
          ? await handleWerewolfGroupRestriction(api, message, isAdminLevelHighest || isAdminBot || isAdminBox)
          : false;
      if (werewolfRestricted) return;
      const werewolfVoteHandled =
        isPlainText && !isSelf && handleChat && groupSettings[threadId]?.activeBot === true
          ? await handleWerewolfGroupVote(api, message)
          : false;
      const numberHandleCommand = werewolfVoteHandled
        ? 5
        : await handleCommand(
            api,
            message,
            groupInfo,
            groupAdmins,
            groupSettings,
            isAdminLevelHighest,
            isAdminBot,
            isAdminBox,
            handleChat
          );
      const autoRaiLinkHandled = !isSelf && !isBlocked
        ? await handleAutoRaiLinkMention(api, message, groupInfo)
        : false;
      if (isPlainText) {
        // numberHandleCommand = -1: Không Có Lệnh Nào Được Xử Lý
        // numberHandleCommand = 1: Đã Xử Lý Lệnh activeBot
        // numberHandleCommand = 2: Bỏ Qua Xử Lý Lệnh Chat Bot
        // numberHandleCommand = 3: Đã Xử Lý Lệnh Quản Trị
        // numberHandleCommand = 5: Đã Xử Lý Lệnh Game
        // numberHandleCommand = 99: Phát Hiện Dùng Lệnh, Check Lệnh Hiện Tại (Nếu Không Có Lệnh Nào Được Xử Lý -> Đưa Ra Gợi Ý)
        handleChat = handleChat && groupSettings[threadId].activeBot === true;
        handleChat = handleChat && !isSelf;
        if (handleChat || (!isSelf && isAdminBot)) {
          await handleOnChatUser(api, message, numberHandleCommand === 5, groupSettings, groupInfo);
        }
      }

      if ((handleChat || isAdminBot) && numberHandleCommand === -1) {
        handleChat = await handleOnReplyFromUser(
          api,
          message,
          groupInfo,
          groupAdmins,
          groupSettings,
          isAdminLevelHighest,
          isAdminBot,
          isAdminBox,
          handleChat || isAdminBot
        );
      }

      if (isPlainText && !autoRaiLinkHandled) {
        if (!isSelf && !isBlocked) {
          await handleChatBot(api, message, threadId, groupSettings, nameGroup, numberHandleCommand === 2);
        }
      }

      if (isPlainText && !isSelf && !isBlocked && !autoRaiLinkHandled && numberHandleCommand === -1) {
        await checkAutoPingId(api, message, groupSettings, groupInfo);
      }

      if (!isBlocked && numberHandleCommand === -1) {
        const mentions = message.data.mentions || null;
        if (mentions && groupSettings[threadId].tagReaction) {
          const tagMe = mentions.find((mention) => mention.uid === idBot);
          if (tagMe) {
            (async () => {
              const reactionKeys = Object.keys(ReactionMap).filter(key =>
                key !== 'UNDO' && key !== 'NONE' && ReactionMap[key].rType >= 0
              );
              // Một lần được tag chỉ phản hồi một reaction. Việc thả nhiều
              // reaction liên tiếp làm các lệnh không nhận diện (ví dụ gl)
              // trông như bị nhiều bot xử lý cùng lúc.
              const TOTAL_REACTIONS = 1;
              for (let i = 0; i < TOTAL_REACTIONS; i++) {
                const reaction = reactionKeys[Math.floor(Math.random() * reactionKeys.length)];
                try {
                  await api.addReaction(reaction, [message]);
                  if (i < TOTAL_REACTIONS - 1) {
                    const delay = Math.random() * 15 + 5;
                    await new Promise(resolve => setTimeout(resolve, delay));
                  }
                } catch (error) {
                  console.error(`Lỗi khi thả reaction ${reaction}:`, error);
                }
              }
            })(); 
          }
        }
      }

      let remainingAntiHandled = false;
      if (canRunRemainingAnti) {
        const antiChecks = [
          () => antiBadWord(api, message, groupSettings, isAdminBox, botIsAdminBox, isSelf),
          () => antiNude(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf),
          () => antiMedia(api, message, groupSettings, isAdminBox, botIsAdminBox, isSelf),
          () => antiForward(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf),
          () => antiFile(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf),
          () => antiVoice(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf),
          () => antiTag(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf),
          () => antiAllEffectSticker(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf),
          () => antiPhotoVideo(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf),
          () => antiPhoneNumber(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf),
          () => antiStickerEffect(api, message, groupInfo, isAdminBox, groupSettings, botIsAdminBox, isSelf),
          () => antiAllEffectGif(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf),
          () => antiNotText(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf),
        ];
        for (const checkAnti of antiChecks) {
          if (await checkAnti()) {
            remainingAntiHandled = true;
            break;
          }
        }
      }

      await autoJoinGroup(api, message, groupSettings, botIsAdminBox, isSelf);
      if (canRunRemainingAnti && !remainingAntiHandled) {
        await handleAutoReplyGemini(api, message, groupSettings, isSelf);
      }
    }
  }
}
