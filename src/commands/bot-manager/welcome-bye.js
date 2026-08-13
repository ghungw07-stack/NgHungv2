import { sendMessageStateQuote, sendMessageWarning } from "../../service-dqt/chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service-dqt/service.js";
import { removeMention } from "../../utils/format-util.js";
import { getDataAllGroup, getGroupInfoData, updateHistorySettingGroup } from "../../service-dqt/info-service/group-info.js";
import { readWebConfig } from "../../utils/io-json.js";
import fs from "fs";
import path from "path";

let welcomePMConfigCache = null;
let welcomePMConfigLastModified = 0;
const WELCOME_PM_CONFIG_CACHE_TTL = 60000; 
const DEFAULT_PR_CARD_CONTENT = "Danh Thiếp Liên Hệ";

export async function getPrCard(botId) {
  try {
    const prConfig = await readWebConfig(botId);
    const prCard = prConfig?.prObjects?.[0]?.card;
    if (prCard?.zaloId) {
      return { id: prCard.zaloId, content: prCard.content || DEFAULT_PR_CARD_CONTENT };
    }
  } catch {}
  return null;
}
function getWelcomePMConfig() {
  try {
    const configPath = path.join(process.cwd(), "assets", "json-data", "welcomepm-config.json");
    const now = Date.now();
    
    if (welcomePMConfigCache && (now - welcomePMConfigLastModified) < WELCOME_PM_CONFIG_CACHE_TTL) {
      return welcomePMConfigCache;
    }
    
    if (fs.existsSync(configPath)) {
      const stats = fs.statSync(configPath);
      const fileModified = stats.mtimeMs;
      
      if (!welcomePMConfigCache || fileModified > welcomePMConfigLastModified) {
        const configData = fs.readFileSync(configPath, "utf8");
        welcomePMConfigCache = JSON.parse(configData);
        welcomePMConfigLastModified = fileModified;
      }
      return welcomePMConfigCache;
    }
  } catch (error) {
    console.error("Lỗi khi đọc welcomepm config:", error);
  }
  
  if (!welcomePMConfigCache) {
    welcomePMConfigCache = {
      defaultMessage: "HA HUY HOANG",
      defaultCardContent: "HA HUY HOANG",
      customMessages: {},
      customCards: {}
    };
  }
  return welcomePMConfigCache;
}

function saveWelcomePMConfig(config) {
  try {
    const configPath = path.join(process.cwd(), "assets", "json-data", "welcomepm-config.json");
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
    welcomePMConfigCache = config;
    welcomePMConfigLastModified = Date.now();
    return true;
  } catch (error) {
    console.error("Lỗi khi ghi welcomepm config:", error);
    return false;
  }
}

export async function handleWelcomeBye(api, message, groupSettings) {
  const content = removeMention(message);
  const threadId = message.threadId;
  const prefix = getGlobalPrefix(api.getBotId());

  const [command, option, ...messageParts] = content.trim().split(/\s+/);
  const optionNormalized = option?.toLowerCase();
  const isWelcomeCommand = command === `${prefix}welcome`;
  const isByeCommand = command === `${prefix}bye`;

  if ((isWelcomeCommand || isByeCommand) && optionNormalized === "set") {
    const customMessage = messageParts.join(" ").trim();
    if (!customMessage) {
      await sendMessageWarning(
        api,
        message,
        `Vui lòng nhập nội dung ${isWelcomeCommand ? "chào mừng" : "tạm biệt"}.\n\nCú pháp: ${prefix}${isWelcomeCommand ? "welcome" : "bye"} set [nội dung]\nPlaceholder: {user} = tag thành viên, {member} = số thành viên, {group} = tên nhóm/cộng đồng.`
      );
      return false;
    }

    const messageKey = isWelcomeCommand ? "welcomeMessage" : "leaveMessage";
    const statusKey = isWelcomeCommand ? "welcomeGroup" : "byeGroup";
    groupSettings[threadId][messageKey] = customMessage;
    groupSettings[threadId][statusKey] = true;
    await sendMessageStateQuote(
      api,
      message,
      `Đã lưu nội dung và bật ${isWelcomeCommand ? "welcome" : "bye"} cho nhóm này!\n\n${customMessage}`,
      true,
      300000
    );
    return true;
  }

  if ((isWelcomeCommand || isByeCommand) && optionNormalized === "show") {
    const customMessage = groupSettings[threadId][isWelcomeCommand ? "welcomeMessage" : "leaveMessage"];
    await sendMessageWarning(
      api,
      message,
      customMessage
        ? `Nội dung ${isWelcomeCommand ? "welcome" : "bye"} hiện tại:\n\n${customMessage}`
        : `Nhóm chưa đặt nội dung ${isWelcomeCommand ? "welcome" : "bye"}.\nDùng: ${prefix}${isWelcomeCommand ? "welcome" : "bye"} set [nội dung]`
    );
    return true;
  }

  let newStatus;

  if (optionNormalized === "on") {
    newStatus = true;
  } else if (optionNormalized === "off") {
    newStatus = false;
  } else if (!option) {
    newStatus = !groupSettings[threadId][command === `${prefix}welcome` ? "welcomeGroup" : "byeGroup"];
  } else {
    await sendMessageWarning(
      api,
      message,
      `Cú pháp không hợp lệ. Dùng '${prefix}welcome|bye [on/off]', '${prefix}welcome|bye set [nội dung]' hoặc '${prefix}welcome|bye show'.`
    );
    return false;
  }

  if (command === `${prefix}welcome`) {
    groupSettings[threadId].welcomeGroup = newStatus;
  } else if (command === `${prefix}bye`) {
    groupSettings[threadId].byeGroup = newStatus;
  }

  const status = newStatus ? "bật" : "tắt";
  const feature = command === `${prefix}welcome` ? "chào mừng thành viên mới" : "tạm biệt thành viên rời nhóm";
  await sendMessageStateQuote(api, message, `Đã ${status} chức năng ${feature}!`, newStatus, 300000);
  return true;
}

export async function handleApprove(api, message, groupSettings, aliasCommand) {
  const content = removeMention(message);
  const threadId = message.threadId;
  const prefix = getGlobalPrefix(api.getBotId());

  const [command, option] = content.split(" ");
  let newStatus;

  if (option === "on") {
    newStatus = true;
  } else if (option === "off") {
    newStatus = false;
  } else if (!option) {
    newStatus = !groupSettings[threadId].memberApprove;
  } else {
    await sendMessageWarning(
      api,
      message,
      `Cú pháp không hợp lệ. Vui lòng sử dụng '${prefix}${aliasCommand} [on/off]'.`
    );
    return false;
  }

  groupSettings[threadId].memberApprove = newStatus;

  const status = newStatus ? "bật" : "tắt";
  await sendMessageStateQuote(api, message, `Đã ${status} chức năng tự động phê duyệt thành viên mới!`, newStatus, 300000);
  if (newStatus) {
    await api.handleGroupPendingMembers(threadId, true);
  }
  return true;
}

export async function handleUpdateGroup(api, message, groupSettings, aliasCommand) {
  const content = removeMention(message);
  const threadId = message.threadId;
  const prefix = getGlobalPrefix(api.getBotId());

  const [command, option] = content.split(" ");
  let newStatus;

  if (option === "on") {
    newStatus = true;
  } else if (option === "off") {
    newStatus = false;
  } else if (!option) {
    newStatus = !groupSettings[threadId].updateGroup;
  } else {
    await sendMessageWarning(
      api,
      message,
      `Cú pháp không hợp lệ. Vui lòng sử dụng '${prefix}${aliasCommand} [on/off]'.`
    );
    return false;
  }

  if (newStatus) {
    try {
      const groupInfo = await getGroupInfoData(api, threadId);
      const currentSetting = structuredClone(groupInfo?.setting || {});
      groupSettings[threadId].updateGroupSnapshot = currentSetting;
      await updateHistorySettingGroup(threadId, currentSetting);
    } catch (error) {
      console.error("Không thể lưu trạng thái ban đầu cho updategroup:", error?.message || error);
      await sendMessageWarning(api, message, "Không lấy được cài đặt hiện tại của nhóm, vui lòng thử lại.");
      return false;
    }
  } else {
    delete groupSettings[threadId].updateGroupSnapshot;
  }

  groupSettings[threadId].updateGroup = newStatus;

  const status = newStatus ? "bật" : "tắt";
  await sendMessageStateQuote(api, message, `Đã ${status} chức năng cập nhật thông tin nhóm!`, newStatus, 300000);
  return true;
}

export async function handleKickImageCommand(api, message, groupSettings) {
  const content = removeMention(message);
  const threadId = message.threadId;
  const prefix = getGlobalPrefix(api.getBotId());

  if (!groupSettings[threadId]) {
    groupSettings[threadId] = {};
  }

  const [command, option] = content.split(" ");
  let newStatus;

  if (option === "on") {
    newStatus = true;
  } else if (option === "off") {
    newStatus = false;
  } else if (!option) {
    newStatus = !groupSettings[threadId].enableKickImage;
  } else {
    await sendMessageWarning(
      api,
      message,
      `Cú pháp không hợp lệ. Vui lòng sử dụng '${prefix}kickimage [on/off]'.`
    );
    return false;
  }

  groupSettings[threadId].enableKickImage = newStatus;

  const status = newStatus ? "bật" : "tắt";
  await sendMessageStateQuote(api, message, `Đã ${status} chức năng thông báo kick thành viên!`, newStatus, 300000);
  return true;
}

export async function handleBlockImageCommand(api, message, groupSettings) {
  const content = removeMention(message);
  const threadId = message.threadId;
  const prefix = getGlobalPrefix(api.getBotId());

  if (!groupSettings[threadId]) {
    groupSettings[threadId] = {};
  }

  const [command, option] = content.split(" ");
  let newStatus;

  if (option === "on") {
    newStatus = true;
  } else if (option === "off") {
    newStatus = false;
  } else if (!option) {
    newStatus = !groupSettings[threadId].enableBlockImage;
  } else {
    await sendMessageWarning(
      api,
      message,
      `Cú pháp không hợp lệ. Vui lòng sử dụng '${prefix}blockimage [on/off]'.`
    );
    return false;
  }

  groupSettings[threadId].enableBlockImage = newStatus;

  const status = newStatus ? "bật" : "tắt";
  await sendMessageStateQuote(api, message, `Đã ${status} chức năng thông báo block thành viên!`, newStatus, 300000);
  return true;
}

export async function handleSendUserMemberCommand(api, message, aliasCommand, groupSettings) {
  const content = removeMention(message);
  const threadId = message.threadId;
  const prefix = getGlobalPrefix(api.getBotId());

  const commandParts = content.split(" ");
  const subCommand = commandParts[1];
  const messageContent = commandParts.slice(2).join(" ");

  if (subCommand === "help") {
    const helpMessage = `📋 HƯỚNG DẪN SỬ DỤNG LỆNH

\ ${prefix}${aliasCommand}\ - Bật/Tắt chức năng
\ ${prefix}${aliasCommand} set [nội dung tin nhắn]\ - Thêm nội dung
\ ${prefix}${aliasCommand} card [ID người dùng] [nội dung]\ - Gửi card sau nội dung
\ ${prefix}${aliasCommand} card off\ - Tắt gửi card
\ ${prefix}${aliasCommand} show\ - Xem cài đặt hiện tại
\ ${prefix}${aliasCommand} all\ - Bật/Tắt cho tất cả nhóm`;

    await sendMessageWarning(api, message, helpMessage);
    return true;
  }

  if (subCommand === "show") {
    const botId = api.getBotId();
    const config = getWelcomePMConfig();
    const currentMessage = config.customMessages[botId] || config.defaultMessage;
    const currentCard = config.customCards[botId] || (await getPrCard(botId));
    
    let showMessage = `📊THÔNG TIN CẤU HÌNH\n\n`;
    showMessage += `🤖 Bot ID: ${botId}\n\n`;
    
    showMessage += `📝 Tin nhắn:\n${currentMessage}\n\n`;
    
    if (currentCard) {
      showMessage += `🎴 Card:\n`;
      showMessage += `ID: ${currentCard.id}\n`;
      showMessage += `Nội dung: ${currentCard.content}\n`;
    } else {
      showMessage += `🎴 Card: Không có\n`;
    }
    
    await sendMessageWarning(api, message, showMessage);
    return true;
  }

  if (subCommand === "card") {
    const botId = api.getBotId();
    const config = getWelcomePMConfig();
    
    if (!messageContent || messageContent.trim() === "") {
      await sendMessageWarning(
        api,
        message,
        `Cú pháp không hợp lệ. Vui lòng sử dụng '${prefix}${aliasCommand} card [ID người dùng] [nội dung]' hoặc '${prefix}${aliasCommand} card off'.\n\nVí dụ: ${prefix}${aliasCommand} card 123456789 Chào mừng bạn!`
      );
      return false;
    }

    if (messageContent.toLowerCase() === "off") {
      // Xóa card khỏi config file
      delete config.customCards[botId];
      
      if (saveWelcomePMConfig(config)) {
        await sendMessageStateQuote(api, message, "Đã tắt chức năng gửi card kèm tin nhắn!", false, 300000);
      } else {
        await sendMessageWarning(api, message, "Lỗi khi lưu config file!");
      }
      return true;
    }

    const parts = messageContent.split(" ");
    let cardId = parts[0];
    const cardContent = parts.slice(1).join(" ") || "Chào mừng bạn đến với nhóm!";

    if (cardId.toLowerCase() === "me") {
      cardId = String(message.data.uidFrom);
    }
    config.customCards[botId] = {
      id: cardId,
      content: cardContent
    };

    if (saveWelcomePMConfig(config)) {
      await sendMessageStateQuote(api, message, `Đã cập nhật card gửi kèm tin nhắn vào config file!\n\nCard ID: ${cardId}\nNội dung: ${cardContent}`, true, 300000);
    } else {
      await sendMessageWarning(api, message, "Lỗi khi lưu config file!");
    }
    return true;
  }

  if (subCommand === "set") {
    if (!messageContent || messageContent.trim() === "") {
      await sendMessageWarning(
        api,
        message,
        `Cú pháp không hợp lệ. Vui lòng sử dụng '${prefix}${aliasCommand} set [nội dung tin nhắn]'`
      );
      return false;
    }

    const botId = api.getBotId();
    const config = getWelcomePMConfig();
    
    config.customMessages[botId] = messageContent;
    
    if (saveWelcomePMConfig(config)) {
      await sendMessageStateQuote(
        api, 
        message, 
        `Đã cập nhật nội dung tin nhắn vào config file!\n\nNội dung mới:\n${messageContent}`, 
        true, 
        300000
      );
    } else {
      await sendMessageWarning(api, message, "Lỗi khi lưu config file!");
    }
    return true;
  }

  if (subCommand === "all") {
    let newStatus;

    if (messageContent === "on") {
      newStatus = true;
    } else if (messageContent === "off") {
      newStatus = false;
    } else if (!messageContent) {
      const groups = await getDataAllGroup(api);
      const enabledGroups = groups.filter(group => groupSettings[group.groupId]?.sendUserMember);
      newStatus = enabledGroups.length < groups.length;
    } else {
      await sendMessageWarning(
        api,
        message,
        `Cú pháp không hợp lệ. Vui lòng sử dụng '${prefix}${aliasCommand} all [on/off]' hoặc '${prefix}${aliasCommand} all' để toggle.`
      );
      return false;
    }

    const botId = api.getBotId();
    const groups = await getDataAllGroup(api);
    const currentGroupSettings = groupSettings[message.threadId];
    const currentWelcomeMessage = currentGroupSettings?.welcomePMMessage?.[botId];
    const currentWelcomeCard = currentGroupSettings?.welcomePMCard?.[botId];
    let added = 0;

    for (const group of groups) {
      const groupId = group.groupId;
      if (!groupSettings[groupId]) {
        groupSettings[groupId] = {};
      }
      groupSettings[groupId].sendUserMember = newStatus;
      
      if (currentWelcomeMessage) {
        if (!groupSettings[groupId].welcomePMMessage || typeof groupSettings[groupId].welcomePMMessage === 'string') {
          groupSettings[groupId].welcomePMMessage = {};
        }
        groupSettings[groupId].welcomePMMessage[botId] = currentWelcomeMessage;
      }
      
      if (currentWelcomeCard) {
        if (!groupSettings[groupId].welcomePMCard) {
          groupSettings[groupId].welcomePMCard = {};
        }
        groupSettings[groupId].welcomePMCard[botId] = currentWelcomeCard;
      }
      
      added++;
    }

    const status = newStatus ? "bật" : "tắt";
    const messageText = `Đã ${status} chức năng gửi tin nhắn riêng tư cho ${added} nhóm!`;
    
    if (message && message.data && message.data.dName) {
      await sendMessageStateQuote(
        api, 
        message, 
        messageText, 
        newStatus, 
        300000
      );
    } else {
      await sendMessageWarning(api, message, messageText);
    }
    return true;
  }

  const [command, option] = content.split(" ");
  let newStatus;

  if (option === "on") {
    newStatus = true;
  } else if (option === "off") {
    newStatus = false;
  } else if (!option) {
    newStatus = !groupSettings[message.threadId].sendUserMember;
  } else {
    await sendMessageWarning(
      api,
      message,
      `Cú pháp không hợp lệ. Vui lòng sử dụng '${prefix}${aliasCommand} [on/off]'.`
    );
    return false;
  }

  groupSettings[message.threadId].sendUserMember = newStatus;

  const status = newStatus ? "bật" : "tắt";
  await sendMessageStateQuote(api, message, `Đã ${status} chức năng gửi tin nhắn riêng tư đến người lạ!`, newStatus, 300000);
  return true;
}

export function getAutoReplyPMConfig() {
  try {
    const configPath = path.join(process.cwd(), "assets", "json-data", "autoreplypm-config.json");
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, "utf8");
      return JSON.parse(configData);
    }
  } catch (error) {
    console.error("Lỗi khi đọc autoreplypm config:", error);
  }

  return {
    defaultMessage: "Xin chào! Tôi là bot tự động. Bạn cần giúp gì?",
    defaultCardContent: "Bot Auto Reply",
    customMessages: {},
    customCards: {},
    enabled: {}
  };
}

function saveAutoReplyPMConfig(config) {
  try {
    const configPath = path.join(process.cwd(), "assets", "json-data", "autoreplypm-config.json");
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
    return true;
  } catch (error) {
    console.error("Lỗi khi ghi autoreplypm config:", error);
    return false;
  }
}

export async function handleAutoReplyPMCommand(api, message, aliasCommand, groupSettings) {
  const content = removeMention(message);
  const threadId = message.threadId;
  const prefix = getGlobalPrefix(api.getBotId());

  const commandParts = content.split(" ");
  const subCommand = commandParts[1];
  const messageContent = commandParts.slice(2).join(" ");

  if (subCommand === "help") {
    const helpMessage = `📋 HƯỚNG DẪN SỬ DỤNG LỆNH

\ ${prefix}${aliasCommand} - Bật/Tắt chức năng
\ ${prefix}${aliasCommand} set [nội dung tin nhắn] - Thêm nội dung
\ ${prefix}${aliasCommand} card [ID người dùng] [nội dung] - Gửi card sau nội dung
\ ${prefix}${aliasCommand} card off - Tắt gửi card
\ ${prefix}${aliasCommand} show - Xem cài đặt hiện tại`;

    await sendMessageWarning(api, message, helpMessage);
    return true;
  }

  if (subCommand === "show") {
    const botId = api.getBotId();
    const config = getAutoReplyPMConfig();
    const currentMessage = config.customMessages[botId] || config.defaultMessage;
    const currentCard = config.customCards[botId] || (await getPrCard(botId));
    const isEnabled = config.enabled[botId] || false;

    let showMessage = `📊THÔNG TIN CẤU HÌNH AUTO REPLY PM\n\n`;
    showMessage += `🤖 Bot ID: ${botId}\n`;
    showMessage += `🔄 Trạng thái: ${isEnabled ? "Bật" : "Tắt"}\n\n`;

    showMessage += `📝 Tin nhắn:\n${currentMessage}\n\n`;

    if (currentCard) {
      showMessage += `🎴 Card:\n`;
      showMessage += `ID: ${currentCard.id}\n`;
      showMessage += `Nội dung: ${currentCard.content}\n`;
    } else {
      showMessage += `🎴 Card: Không có\n`;
    }

    await sendMessageWarning(api, message, showMessage);
    return true;
  }

  if (subCommand === "card") {
    const botId = api.getBotId();
    const config = getAutoReplyPMConfig();

    if (!messageContent || messageContent.trim() === "") {
      await sendMessageWarning(
        api,
        message,
        `Cú pháp không hợp lệ. Vui lòng sử dụng '${prefix}${aliasCommand} card [ID người dùng] [nội dung]' hoặc '${prefix}${aliasCommand} card off'.\n\nVí dụ: ${prefix}${aliasCommand} card 123456789 Chào mừng bạn!`
      );
      return false;
    }

    if (messageContent.toLowerCase() === "off") {
      delete config.customCards[botId];

      if (saveAutoReplyPMConfig(config)) {
        await sendMessageStateQuote(api, message, "Đã tắt chức năng gửi card kèm tin nhắn!", false, 300000);
      } else {
        await sendMessageWarning(api, message, "Lỗi khi lưu config file!");
      }
      return true;
    }

    const parts = messageContent.split(" ");
        let cardId = parts[0];
    const cardContent = parts.slice(1).join(" ") || "Bot Auto Reply";

    if (cardId.toLowerCase() === "me") {
      cardId = String(message.data.uidFrom);
    }

    config.customCards[botId] = {
      id: cardId,
      content: cardContent
    };

    if (saveAutoReplyPMConfig(config)) {
      await sendMessageStateQuote(api, message, `Đã cập nhật card gửi kèm tin nhắn vào config file!\n\nCard ID: ${cardId}\nNội dung: ${cardContent}`, true, 300000);
    } else {
      await sendMessageWarning(api, message, "Lỗi khi lưu config file!");
    }
    return true;
  }

  if (subCommand === "set") {
    if (!messageContent || messageContent.trim() === "") {
      await sendMessageWarning(
        api,
        message,
        `Cú pháp không hợp lệ. Vui lòng sử dụng '${prefix}${aliasCommand} set [nội dung tin nhắn]'`
      );
      return false;
    }

    const botId = api.getBotId();
    const config = getAutoReplyPMConfig();

    config.customMessages[botId] = messageContent;

    if (saveAutoReplyPMConfig(config)) {
      await sendMessageStateQuote(
        api,
        message,
        `Đã cập nhật nội dung tin nhắn!\n\nNội dung mới:\n${messageContent}`,
        true,
        300000
      );
    } else {
      await sendMessageWarning(api, message, "Lỗi khi lưu config file!");
    }
    return true;
  }

  const [command, option] = content.split(" ");
  let newStatus;

  if (option === "on") {
    newStatus = true;
  } else if (option === "off") {
    newStatus = false;
  } else if (!option) {
    const botId = api.getBotId();
    const config = getAutoReplyPMConfig();
    newStatus = !config.enabled[botId];
  } else {
    await sendMessageWarning(
      api,
      message,
      `Cú pháp không hợp lệ. Vui lòng sử dụng '${prefix}${aliasCommand} [on/off]'.`
    );
    return false;
  }

  const botId = api.getBotId();
  const config = getAutoReplyPMConfig();
  config.enabled[botId] = newStatus;

  if (saveAutoReplyPMConfig(config)) {
    const status = newStatus ? "bật" : "tắt";
    await sendMessageStateQuote(api, message, `Đã ${status} chức năng auto reply tin nhắn riêng tư!`, newStatus, 300000);
  } else {
    await sendMessageWarning(api, message, "Lỗi khi lưu config file!");
  }
  return true;
}
