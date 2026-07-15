import schedule from "node-schedule";
import { GroupEventType, MessageType, typeToString } from "../api-zalo/models/index.js";
import {
  getUserInfoBasic,
  getUserInfoData,
  getUsersInfoBasic,
  getUsersInfoData,
} from "../service-dqt/info-service/user-info.js";
import * as cv from "../utils/canvas/index.js";
import { isAdmin } from "../index.js";
import fs from "fs";
import path from "path";
import {
  getGroupInfoData,
  getHistorySettingGroup,
  updateHistorySettingGroup,
} from "../service-dqt/info-service/group-info.js";
import { sendMessageResultRequest, sendMessageWarning } from "../service-dqt/chat-zalo/chat-style/chat-style.js";
import { logMessageToFile, readWebConfig, writeWebConfig } from "../utils/io-json.js";
import { groupSettingsAll } from "./event-send-msg.js";
import { enforceAntiInvite } from "../service-dqt/anti-service/anti-invite.js";
import { getPrCard } from "../commands/bot-manager/welcome-bye.js";
import { getDataAllGroup } from "../service-dqt/info-service/group-info.js";

const blockedMembers = new Map();
const BLOCK_CHECK_TIMEOUT = 1200;
const historyJoinRequest = new Map();
const kickHistory = new Map();
const TIME_COUNT_KICK = 15000;
const NUM_MEMBERS_KICK = 5;
let tempBeforeLog = "";
const userJoinHistory = new Map();
const blockedSendUserMember = new Map();
const MAX_JOIN_COUNT = 5; 
const BLOCK_DURATION = 24 * 60 * 60 * 1000; 
const JOIN_WINDOW = 5 * 60 * 1000; 

function getWelcomePMConfig() {
  try {
    const configPath = path.join(process.cwd(), "assets", "json-data", "welcomepm-config.json");
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, "utf8");
      return JSON.parse(configData);
    }
  } catch (error) {
    console.error("Lỗi khi đọc welcomepm config:", error);
  }
  
  return {
    defaultMessage: "HA HUY HOANG",
    defaultCardContent: "HA HUY HOANG",
    customMessages: {},
    customCards: {}
  };
}

async function sendGroupMessage(api, threadId, imagePath, messageText) {
  const message = messageText ? messageText : "";
  try {
    await api.sendMessage(
      {
        msg: message,
        attachments: imagePath ? [imagePath] : [],
        ttl: 86400000,
        isUseProphylactic: true,
      },
      threadId,
      MessageType.GroupMessage
    );
  } catch (error) {
    console.error("Lỗi khi gửi tin nhắn tới group:", error);
  }
}

export async function gruopEvents(api, event) {
  const type = event.type;
  const { updateMembers } = event.data;
  const groupName = event.data.groupName;
  const threadId = event.threadId;
  const groupType = event.data.groupType;
  const idAction = event.data.sourceId;
  const botId = api.getBotId();
  let isKeyGold = false;
  
  const groupSettings = groupSettingsAll.getByID(botId);
  const threadSettings = groupSettings[threadId] || {};
  
  let welcomePMConfigCache = null;
  const getCachedWelcomePMConfig = () => {
    if (!welcomePMConfigCache) {
      welcomePMConfigCache = getWelcomePMConfig();
    }
    return welcomePMConfigCache;
  };

  if (type === GroupEventType.JOIN && updateMembers && updateMembers.length > 0) {
    const botIdStr = String(botId);
    const botIdNum = Number(botId);
    
    const botWasInvited = updateMembers.some(member => {
      const memberId = member.id || member;
      const memberIdStr = String(memberId);
      const memberIdNum = Number(memberId);
      
      return memberIdStr === botIdStr || 
             memberIdNum === botIdNum || 
             memberId === botId || 
             memberId === botIdStr ||
             memberId === botIdNum;
    });
    
    if (botWasInvited) {
      const result = await enforceAntiInvite(api, event);
      if (result) {
        return;
      }

      try {
        const managerData = api.apiManager?.getDataManager ? api.apiManager.getDataManager() : null;
        if (managerData?.autoSetMute) {
          await api.setMute({ duration: -1, action: 1 }, threadId, MessageType.GroupMessage);
        }
      } catch (error) {
        console.error("Lỗi khi tự động tắt thông báo nhóm mới:", error);
      }

      try {
        const config = await readWebConfig(botId);
        if (config.autoAddGroup) {
          if (!config.selectedGroups) config.selectedGroups = {};
          if (!config.groupWhitelist) config.groupWhitelist = [];

          if (!config.groupWhitelist.includes(threadId) && !config.selectedGroups[threadId]) {
            const groups = await getDataAllGroup(api);
            const groupInfo = groups.find(g => g.groupId === threadId);
            
            if (groupInfo) {
              config.selectedGroups[threadId] = {
                name: groupInfo.name || groupName || threadId,
                avatar: groupInfo.avatar || "",
                timestamp: Date.now(),
              };
              config.activePr = true;
              await writeWebConfig(botId, config);
            }
          }
        }
      } catch (error) {
        console.error("Lỗi khi tự động thêm group vào PR:", error);
      }
    }
  }

  if (updateMembers) {
    if (updateMembers && updateMembers.length > 0) {
      const user = updateMembers[0];
      const userId = user.id || user;
      if (userId === undefined) return;
      let userInfo, userActionInfo, userActionName, userInfoBasic;
      if (
        threadSettings.welcomeGroup ||
        threadSettings.updateGroup ||
        threadSettings.byeGroup ||
        type === GroupEventType.REMOVE_MEMBER
      ) {
        if (idAction === undefined) return;
        const dataUserInfo = await getUsersInfoBasic(api, [idAction, userId]);
        userActionInfo = dataUserInfo[idAction];
        userActionName = userActionInfo.zaloName;
        userInfoBasic = dataUserInfo[userId];
        const capt = `Group: ${groupName} -> "${typeToString(type)}" -> ${userInfoBasic.zaloName}`;
        if (tempBeforeLog !== capt) {
          tempBeforeLog = capt;
          logMessageToFile(botId, capt, "group");
        }
      }
      const isAdminBot = isAdmin(botId, userId, threadId);

      let imagePath;
      let messageText = "";

      switch (type) {
        case GroupEventType.ADD_ADMIN:
          if (threadSettings.updateGroup) {
            userInfo = await getUserInfoData(api, userId);
            imagePath = await cv.createUpdateMemberGroupImage(userInfo, groupName, groupType, userActionName, "add");
          }
          break;

        case GroupEventType.REMOVE_ADMIN:
          if (threadSettings.updateGroup) {
            userInfo = await getUserInfoData(api, userId);
            imagePath = await cv.createUpdateMemberGroupImage(userInfo, groupName, groupType, userActionName, "remove");
          }
          break;

        case GroupEventType.JOIN_REQUEST:
          console.log(event);
          break;

        case GroupEventType.JOIN:
          if (threadSettings.welcomeGroup) {

            try {
              userInfo = await getUserInfoData(api, userId);
              imagePath = await cv.createWelcomeImage(userInfo, groupName, groupType, userActionName, isAdminBot);
            } catch (error) {
            }
          } else {
          }
          break;

        case GroupEventType.LEAVE:
          if (botId !== idAction && threadSettings.byeGroup) {
            userInfo = await getUserInfoData(api, userId);
            imagePath = await cv.createGoodbyeImage(userInfo, groupName, groupType, isAdminBot);
            if (threadSettings.leaveMessage) {
              messageText = threadSettings.leaveMessage;
            }
          }
          break;

        case GroupEventType.REMOVE_MEMBER:
          isKeyGold = botId === event.data.creatorId;
          let isRemoveAdmin = false;
          if (isKeyGold && botId !== idAction) {
            if (!kickHistory.has(idAction)) {
              kickHistory.set(idAction, []);
            }
            const now = Date.now();
            const kicks = kickHistory.get(idAction).filter((time) => now - time <= TIME_COUNT_KICK);
            kicks.push(now);
            kickHistory.set(idAction, kicks);

            if (kicks.length > NUM_MEMBERS_KICK) {
              await api.removeGroupAdmins(threadId, idAction);
              await sendMessageResultRequest(
                api,
                1,
                threadId,
                `Phát hiện "${userActionName}" kickall, gỡ bỏ quyền quản trị!`,
                false,
                300000
              );
              isRemoveAdmin = true;
            }
          }
          if (botId !== idAction && threadSettings.enableKickImage) {
            if (!blockedMembers.has(userId)) {
              await new Promise((resolve) => setTimeout(resolve, BLOCK_CHECK_TIMEOUT));
              if (!blockedMembers.has(userId)) {
                userInfo = await getUserInfoData(api, userId);
                imagePath = await cv.createKickImage(
                  userInfo,
                  groupName,
                  groupType,
                  userInfo.genderId,
                  userActionName,
                  isAdminBot
                );
              }
            }
          }
          if (!isRemoveAdmin) {
            const dataGroup = await getGroupInfoData(api, threadId);
            let adminList = dataGroup.adminIds.map((item) => item);
            adminList.push(dataGroup.creatorId);
            if (!adminList.includes(userActionInfo.id) && adminList.includes(botId)) {
              await api.blockUsers(threadId, [userActionInfo.id]);
              await sendMessageResultRequest(
                api,
                1,
                threadId,
                `Phát hiện "${userActionName}" không phải quản trị nhóm nhưng bug kick thành viên trong nhóm!!!` +
                  `\n\nĐã chặn người này khỏi nhóm!!!`,
                false,
                0
              );
            }
          }
          break;

        case GroupEventType.BLOCK_MEMBER:
          if (botId !== idAction && threadSettings.enableBlockImage) {
            userInfo = await getUserInfoData(api, userId);
            blockedMembers.set(userId, Date.now());
            imagePath = await cv.createBlockImage(
              userInfo,
              groupName,
              groupType,
              userInfo.genderId,
              userActionName,
              isAdminBot
            );
            setTimeout(() => {
              blockedMembers.delete(userId);
            }, 3000);
          } else if (botId !== idAction) {
            blockedMembers.set(userId, Date.now());
            setTimeout(() => {
              blockedMembers.delete(userId);
            }, 3000);
          }
          break;

        default:
          return;
      }

      if (imagePath) {
        try {
          await sendGroupMessage(api, threadId, imagePath, messageText);
        } catch (error) {
        }
        await cv.clearImagePath(imagePath);
      } else {
      }
    }

    if (threadSettings.sendUserMember && updateMembers && updateMembers.length > 0) {
      switch (type) {
        case GroupEventType.JOIN:
          try {
            const botId = api.getBotId();
            const isMainBot = api.apiManager?.isMainBot || false;
            const config = getCachedWelcomePMConfig();
            let welcomeMessage = config.customMessages[botId] || config.defaultMessage;       
            if (!welcomeMessage && threadSettings.welcomePMMessage) {
              if (typeof threadSettings.welcomePMMessage === 'string') {
                welcomeMessage = threadSettings.welcomePMMessage;
              } else if (threadSettings.welcomePMMessage[botId]) {
                welcomeMessage = threadSettings.welcomePMMessage[botId];
              }
            }
            
            welcomeMessage = welcomeMessage.replace(/\{groupName\}/g, groupName);
            let cardId = null;
            let cardContent = config.defaultCardContent;
            
            if (config.customCards[botId]) {
              cardId = config.customCards[botId].id;
              cardContent = config.customCards[botId].content || config.defaultCardContent;
            } else if (threadSettings.welcomePMCard && threadSettings.welcomePMCard[botId]) {
              const cardData = threadSettings.welcomePMCard[botId];
              if (typeof cardData === 'string') {
                cardId = cardData;
              } else if (cardData && cardData.id) {
                cardId = cardData.id;
                cardContent = cardData.content || config.defaultCardContent;
              }
            } else {
              const prCard = await getPrCard(botId);
              if (prCard?.id) {
                cardId = prCard.id;
                cardContent = prCard.content || cardContent;
              }
            }
            
            const totalMembers = updateMembers.length;
            const validMembers = updateMembers
              .map((member, i) => ({ member, memberId: member.id || member, index: i }))
              .filter(({ memberId }) => memberId && memberId !== undefined);
            
            const promises = validMembers.map(async ({ member, memberId, index }) => {
              const joinKey = `${threadId}_${memberId}`;
              const now = Date.now();
              const blockedTime = blockedSendUserMember.get(joinKey);
              if (blockedTime && (now - blockedTime) < BLOCK_DURATION) {
                return;
              }
              
              if (blockedTime && (now - blockedTime) >= BLOCK_DURATION) {
                blockedSendUserMember.delete(joinKey);
                userJoinHistory.delete(joinKey);
              }
              
              let joinHistory = userJoinHistory.get(joinKey) || [];
              joinHistory.push(now);
              
              joinHistory = joinHistory.filter(timestamp => (now - timestamp) <= JOIN_WINDOW);
              userJoinHistory.set(joinKey, joinHistory);
              
              if (joinHistory.length >= MAX_JOIN_COUNT) {
                blockedSendUserMember.set(joinKey, now);
                return;
              }
              
              // Thêm delay nhỏ để tránh rate limit nhưng xử lý song song
              if (index > 0) {
                await new Promise(resolve => setTimeout(resolve, index * 200));
              }
              
              try {                
                await api.sendMessage(
                  {
                    msg: welcomeMessage,
                    ttl: 86400000000,
                  },
                  memberId,
                  MessageType.PrivateMessage
                );
                
                if (cardId) {
                  try {
                    await api.sendBusinessCard(null, cardId, cardContent, 0, memberId, 86400000000);
                  } catch (cardError) {
                    if (cardError.code === 127) {
                      console.warn(`[Bot ${api.getBotId()}] Không thể gửi card cho thành viên ${memberId} - đã chặn tin nhắn`);
                    } else if (cardError.code === 240) {
                      console.warn(`[Bot ${api.getBotId()}] Không thể gửi card cho thành viên ${memberId} - chưa chấp nhận lời mời kết bạn`);
                    } else {
                      console.error(`[Bot ${api.getBotId()}] Lỗi khi gửi card cho thành viên ${memberId}:`, cardError.message, `(Code: ${cardError.code})`);
                    }
                  }
                }
                
              } catch (memberError) {
                if (memberError.code === 127) {
                  console.warn(`[Bot ${api.getBotId()}] Thành viên ${memberId} đã chặn hoặc không thể nhận tin nhắn (${index + 1}/${totalMembers})`);
                } else if (memberError.code === 240) {
                  console.warn(`[Bot ${api.getBotId()}] Thành viên ${memberId} chưa chấp nhận lời mời kết bạn (${index + 1}/${totalMembers})`);
                } else {
                  console.error(`[Bot ${api.getBotId()}] Lỗi khi gửi tin nhắn cho thành viên ${memberId}:`, memberError.message, `(Code: ${memberError.code}) (${index + 1}/${totalMembers})`);
                }
              }
            });
            
            await Promise.allSettled(promises);
            
          } catch (error) {
            console.error("Lỗi khi gửi tin nhắn riêng cho thành viên mới:", error);
          }
          break;
      }
    }
  } else if (type === GroupEventType.JOIN && updateMembers.length > 1) {
      const userActionInfo = await getUserInfoBasic(api, idAction);
      const userActionName = userActionInfo.zaloName;

      if (threadSettings.welcomeGroup) {
        const userInfos = await getUsersInfoData(
          api,
          updateMembers.map((item) => item.id)
        );
        const promises = updateMembers.map(async (user) => {
          const userId = user.id;
          const userInfo = userInfos[userId];
          let imagePath = null;
          try {
            imagePath = await cv.createWelcomeImage(userInfo, groupName, groupType, userActionName);
            await sendGroupMessage(api, threadId, imagePath, "");
          } catch (error) {
            console.error(`Lỗi khi gửi welcome image cho ${userId}:`, error);
          } finally {
            if (imagePath) {
              await cv.clearImagePath(imagePath);
            }
          }
        });
        await Promise.allSettled(promises);
      }

      if (threadSettings.sendUserMember) {
        try {
          const botId = api.getBotId();
          const config = getCachedWelcomePMConfig();
          let welcomeMessage = config.customMessages[botId] || config.defaultMessage;       
          if (!welcomeMessage && threadSettings.welcomePMMessage) {
            if (typeof threadSettings.welcomePMMessage === 'string') {
              welcomeMessage = threadSettings.welcomePMMessage;
            } else if (threadSettings.welcomePMMessage[botId]) {
              welcomeMessage = threadSettings.welcomePMMessage[botId];
            }
          }
          
          welcomeMessage = welcomeMessage.replace(/\{groupName\}/g, groupName);
          let cardId = null;
          let cardContent = config.defaultCardContent;
          
          if (config.customCards[botId]) {
            cardId = config.customCards[botId].id;
            cardContent = config.customCards[botId].content || config.defaultCardContent;
          } else if (threadSettings.welcomePMCard && threadSettings.welcomePMCard[botId]) {
            const cardData = threadSettings.welcomePMCard[botId];
            if (typeof cardData === 'string') {
              cardId = cardData;
            } else if (cardData && cardData.id) {
              cardId = cardData.id;
              cardContent = cardData.content || config.defaultCardContent;
            }
          }
          
          const validMembers = updateMembers
            .map((member, i) => ({ member, memberId: member.id || member, index: i }))
            .filter(({ memberId }) => memberId && memberId !== undefined);
          
          const promises = validMembers.map(async ({ member, memberId, index }) => {
            // Thêm delay nhỏ để tránh rate limit nhưng xử lý song song
            if (index > 0) {
              await new Promise(resolve => setTimeout(resolve, index * 100));
            }
            
            try {
              await api.sendMessage(
                {
                  msg: welcomeMessage,
                  ttl: 86400000000,
                },
                memberId,
                MessageType.PrivateMessage
              );
              
              if (cardId) {
                try {
                  await api.sendBusinessCard(null, cardId, cardContent, 0, memberId, 86400000000);
                } catch (cardError) {
                  if (cardError.code === 127) {
                    console.warn(`[Bot ${api.getBotId()}] Không thể gửi card cho thành viên ${memberId} - đã chặn tin nhắn`);
                  } else if (cardError.code === 240) {
                    console.warn(`[Bot ${api.getBotId()}] Không thể gửi card cho thành viên ${memberId} - chưa chấp nhận lời mời kết bạn`);
                  } else {
                    console.error(`[Bot ${api.getBotId()}] Lỗi khi gửi card cho thành viên ${memberId}:`, cardError.message, `(Code: ${cardError.code})`);
                  }
                }
              }
            } catch (memberError) {
              if (memberError.code === 127) {
                console.warn(`[Bot ${api.getBotId()}] Thành viên ${memberId} đã chặn hoặc không thể nhận tin nhắn`);
              } else if (memberError.code === 240) {
                console.warn(`[Bot ${api.getBotId()}] Thành viên ${memberId} chưa chấp nhận lời mời kết bạn`);
              } else {
                console.error(`[Bot ${api.getBotId()}] Lỗi khi gửi tin nhắn cho thành viên ${memberId}:`, memberError.message, `(Code: ${memberError.code})`);
              }
            }
          });
          
          await Promise.allSettled(promises);
        } catch (error) {
          console.error("Lỗi khi gửi tin nhắn riêng cho nhiều thành viên mới:", error);
        }
      }

    } else if (type === GroupEventType.UPDATE_SETTING && threadSettings.updateGroup) {
      const newGroupSetting = event.data.groupSetting;
      const nowGroupSetting = await getHistorySettingGroup(api, threadId);
      let listChanges = {},
        userActionInfo;
      for (const key in newGroupSetting) {
        if (newGroupSetting[key] !== nowGroupSetting[key]) {
          listChanges[key] = newGroupSetting[key];
        }
      }
      if (Object.keys(listChanges).length > 0) {
        userActionInfo = await getUserInfoBasic(api, idAction);
        try {
          const promises = Object.keys(listChanges).map(async (key) => {
            const setting = getContentUpdateGroup(key, listChanges[key]);
            if (setting.type !== 0) {
              let imagePath = null;
              try {
                imagePath = await cv.createUpdateSettingGroupImage(userActionInfo, setting, groupName, groupType);
                await sendGroupMessage(api, threadId, imagePath, "");
              } catch (error) {
                console.error(`Lỗi khi xử lý update setting ${key}:`, error);
              } finally {
                if (imagePath) {
                  await cv.clearImagePath(imagePath);
                }
              }
            }
          });
          await Promise.allSettled(promises);
        } catch {}
      }
      updateHistorySettingGroup(threadId, newGroupSetting);
  } else {
    switch (type) {
      case GroupEventType.JOIN_REQUEST:
        const usersJoinRequest = await api.getGroupPendingMembers(threadId);
        const listMembers = usersJoinRequest.users?.map((user) => user.uid) || [];
        if (threadSettings.memberApprove && listMembers.length > 0) {
          const blockOutMembers = [];
          if (!historyJoinRequest.has(threadId)) {
            historyJoinRequest.set(threadId, new Map());
          }
          const threadHistory = historyJoinRequest.get(threadId);

          for (const userId of listMembers) {
            const now = Date.now();
            if (!threadHistory.has(userId)) {
              threadHistory.set(userId, []);
            }
            threadHistory.get(userId).push(now);
            if (threadHistory.get(userId).length >= 5) {
              blockOutMembers.push(userId);
              threadHistory.delete(userId);
            }
          }

          await api.handleGroupPendingMembers(threadId, true, usersJoinRequest);
          if (blockOutMembers.length > 0) {
            await api.blockUsers(threadId, blockOutMembers);
          }
        }
        break;
    }
}

schedule.scheduleJob("*/1 * * * *", () => {
  const tenMinutesAgo = Date.now() - 30 * 60 * 1000;
  for (const [threadId, userHistory] of historyJoinRequest.entries()) {
    for (const [userId, timestamps] of userHistory.entries()) {
      const updatedTimestamps = timestamps.filter((time) => time > tenMinutesAgo);
      if (updatedTimestamps.length > 0) {
        userHistory.set(userId, updatedTimestamps);
      } else {
        userHistory.delete(userId);
      }
    }
    if (userHistory.size === 0) {
      historyJoinRequest.delete(threadId);
    }
  }
});

schedule.scheduleJob("*/5 * * * * *", () => {
  const thirtySecondsAgo = Date.now() - TIME_COUNT_KICK;
  for (const [userId, timestamps] of kickHistory.entries()) {
    const updatedTimestamps = timestamps.filter((time) => time > thirtySecondsAgo);
    if (updatedTimestamps.length > 0) {
      kickHistory.set(userId, updatedTimestamps);
    } else {
      kickHistory.delete(userId);
    }
  }
});

schedule.scheduleJob("*/10 * * * *", () => {
  const now = Date.now();

  for (const [joinKey, blockedTime] of blockedSendUserMember.entries()) {
    if (now - blockedTime >= BLOCK_DURATION) {
      blockedSendUserMember.delete(joinKey);
    }
  }
  
  for (const [joinKey, joinHistory] of userJoinHistory.entries()) {
    const updatedHistory = joinHistory.filter(timestamp => (now - timestamp) <= JOIN_WINDOW);
    if (updatedHistory.length > 0) {
      userJoinHistory.set(joinKey, updatedHistory);
    } else {
      userJoinHistory.delete(joinKey);
    }
  }
});

function getContentUpdateGroup(key, value) {
  switch (key) {
    case "lockViewMember":
      return {
        content: "Quyền Xem Danh Sách Thành Viên",
        result: value ? "Chỉ trưởng phó cộng đồng" : "Tất cả thành viên",
        value: !value,
        type: 1,
      };
    case "lockSendMsg":
      return {
        content: "Quyền Gửi Tin Nhắn",
        result: value ? "Chỉ trưởng phó cộng đồng" : "Tất cả thành viên",
        value: !value,
        type: 1,
      };
    case "setTopicOnly":
      return {
        content: "Quyền Ghim Tin Nhắn",
        result: value ? "Chỉ trưởng phó cộng đồng" : "Tất cả thành viên",
        value: !value,
        type: 1,
      };
    case "lockCreatePoll":
      return {
        content: "Quyền Tạo Bình Chọn",
        result: value ? "Chỉ trưởng phó cộng đồng" : "Tất cả thành viên",
        value: !value,
        type: 1,
      };
    case "lockCreatePost":
      return {
        content: "Quyền Tạo Ghi Chú, Nhắc Hẹn",
        result: value ? "Chỉ trưởng phó cộng đồng" : "Tất cả thành viên",
        value: !value,
        type: 1,
      };
    case "blockName":
      return {
        content: "Quyền Sửa Thông Tin Nhóm",
        result: value ? "Chỉ trưởng phó cộng đồng" : "Tất cả thành viên",
        value: !value,
        type: 1,
      };
    case "enableMsgHistory":
      return {
        content: "Người mới được xem lịch sử tin nhắn",
        result: value ? "Bật" : "Tắt",
        value,
        type: 2,
      };
    case "signAdminMsg":
      return {
        content: "Làm Nổi Tin Nhắn Trưởng/Phó Nhóm",
        result: value ? "Bật" : "Tắt",
        value,
        type: 2,
      };
    case "joinAppr":
      return {
        content: "Phê Duyệt Thành Viên Vào Nhóm",
        result: value ? "Bật" : "Tắt",
        value,
        type: 2,
      };
    default:
      return {
        content: "",
        result: "",
        value,
        type: 0,
      };
    }
  }
}