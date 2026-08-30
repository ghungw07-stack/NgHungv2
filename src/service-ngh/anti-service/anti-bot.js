import { MessageMention, MessageType } from "zlbotngh";
import { sendMessageStateQuote } from "../chat-zalo/chat-style/chat-style.js";
import { removeMention } from "../../utils/format-util.js";
import { getGroupInfoData } from "../info-service/group-info.js";

/**
 * Kiểm tra propertyExt object trên tất cả platform
 * @param {Object} prop - propertyExt object
 * @param {string} uidFrom - User ID
 * @param {string} platform - Platform name
 * @param {Array} reasons - Reasons array
 * @returns {{isBot: boolean, score: number}|false}
 */
function checkPropertyExtObject(prop, uidFrom, platform, reasons) {
  if (!prop || typeof prop !== "object") {
    return false;
  }

  const color = prop.color;
  const size = prop.size;
  const type_ = prop.type;

  if (color === 0 && size === 0 && type_ === 0) {
    reasons.push(`${platform} uidFrom=${uidFrom} propertyExt all 0 (BOT)`);
    return { isBot: true, score: uidFrom === "0" ? 4 : 3 };
  }

  if ((color === undefined || color === null) && (size === undefined || size === null) && (type_ === undefined || type_ === null)) {
    reasons.push(`${platform} uidFrom=${uidFrom} propertyExt undefined values (BOT)`);
    return { isBot: true, score: uidFrom === "0" ? 4 : 3 };
  }

  return false;
}

/**
 * Kiểm tra xem tin nhắn có phải từ API bot không
 * @param {Object} messageObject - Đối tượng tin nhắn
 * @returns {{isBot: boolean, reasons: string[], score: number}}
 */
export function isApiBotMessage(messageObject) {
  try {
    const reasons = [];
    const uidFrom = String(messageObject.data?.uidFrom || "");
    const prop = messageObject.data?.propertyExt || null;
    const content = messageObject.data?.content || null;
    const msgType = String(messageObject.data?.msgType || "");

    const ttlVal = messageObject.data?.ttl || 0;
    if (ttlVal && ttlVal !== 0) {
      reasons.push(`message with ttl=${ttlVal} (BOT)`);
      return { isBot: true, reasons, score: 4 };
    }

    const paramsExt = messageObject.data?.paramsExt || {};
    const platformType = paramsExt.platformType;
    const isWebPlatform = platformType === "1" || platformType === 1 || String(platformType).toLowerCase() === "web" || String(platformType).toLowerCase() === "zalo_web";
    const isPCPlatform = platformType === "2" || platformType === 2 || String(platformType).toLowerCase() === "pc" || String(platformType).toLowerCase() === "desktop" || String(platformType).toLowerCase() === "app" || String(platformType).toLowerCase() === "windows";
    
    // Bỏ qua kiểm tra bot cho web platform (không xóa tin nhắn từ web)
    // if (isWebPlatform) {
    //   if (uidFrom === "0" && (!prop || (typeof prop === "object" && Object.keys(prop).length === 0))) {
    //     reasons.push(`web platform uidFrom=0 with empty/missing propertyExt (BOT)`);
    //     return { isBot: true, reasons, score: 3 };
    //   }

    //   const propCheck = checkPropertyExtObject(prop, uidFrom, "web platform", reasons);
    //   if (propCheck) {
    //     return { isBot: true, reasons, score: propCheck.score };
    //   }
    // }
    //
    if (isPCPlatform) {
      if (uidFrom === "0" && (!prop || (typeof prop === "object" && Object.keys(prop).length === 0))) {
        reasons.push(`PC platform uidFrom=0 with empty/missing propertyExt (BOT)`);
        return { isBot: true, reasons, score: 4 };
      }

      const propCheck = checkPropertyExtObject(prop, uidFrom, "PC platform", reasons);
      if (propCheck) {
        return { isBot: true, reasons, score: propCheck.score };
      }
    }

    if (!isWebPlatform && !isPCPlatform && uidFrom === "0") {
      if (!prop || (typeof prop === "object" && Object.keys(prop).length === 0)) {
        reasons.push(`unknown platform uidFrom=0 with empty/missing propertyExt (BOT)`);
        return { isBot: true, reasons, score: 4 };
      }

      const propCheck = checkPropertyExtObject(prop, uidFrom, "unknown platform", reasons);
      if (propCheck) {
        return { isBot: true, reasons, score: propCheck.score };
      }
    }

    if (msgType === "chat.sticker") {
      reasons.push("sticker without ttl or ttl=0 (USER)");
      return { isBot: false, reasons, score: 0 };
    }

    if (msgType === "chat.reaction" && typeof content === "object" && content !== null) {
      const rtype = content.rType;
      const source = content.source;
      if (rtype === 75 && source === 6) {
        reasons.push("chat.reaction with rType=75 and source=6 (bot reaction)");
        return { isBot: true, reasons, score: 5 };
      } else {
        reasons.push("chat.reaction safe (normal user)");
        return { isBot: false, reasons, score: 0 };
      }
    }

    if (msgType === "chat.photo" && typeof content === "object" && content !== null) {
      const params = content.params || "";
      const reference = messageObject.data?.reference || null;

      if (typeof params === "string") {
        if (params.includes("sendSource") || params.includes("fileSize") || params.includes("hdSize")) {
          reasons.push("chat.photo params contains bot-specific keys");
          return { isBot: true, reasons, score: 4 };
        }

        if (params.includes("is_group_layout") || params.includes("contentId") || params.includes("is_original")) {
          reasons.push("chat.photo params contains user-specific keys");
          return { isBot: false, reasons, score: 0 };
        }
      }

      if (reference !== null && reference !== undefined) {
        reasons.push("chat.photo with reference (forwarded/shared)");
        return { isBot: false, reasons, score: 0 };
      }
    }

    let ext = {};
    if (prop && typeof prop === "object") {
      const extRaw = prop.ext;
      if (typeof extRaw === "string") {
        try {
          ext = JSON.parse(extRaw);
        } catch {
          ext = {};
        }
      } else if (typeof extRaw === "object" && extRaw !== null) {
        ext = extRaw;
      }
    }

    if (prop && typeof prop === "object") {
      const color = prop.color;
      const size = prop.size;
      const type_ = prop.type;

      if (uidFrom === "0") {
        if (color === 0 && size === 0 && type_ === 0) {
          reasons.push("uidFrom==0 and propertyExt all 0 (API bot)");
          return { isBot: true, reasons, score: 3 };
        }
        if (color === -1 && size === -1 && type_ === -1) {
          reasons.push("uidFrom==0 and propertyExt all -1 (safe app)");
          return { isBot: false, reasons, score: 0 };
        }
      }

      if (uidFrom !== "0") {
        if (color === 0 && size === 0 && type_ === 0) {
          reasons.push("uidFrom!=0 and propertyExt all 0 (normal user, safe)");
          return { isBot: false, reasons, score: 0 };
        }
      }
    }

    if (msgType === "webchat" && typeof content === "object" && content !== null) {
      const action = content.action;
      if (action === "rtf") {
        if (uidFrom === "0" && (prop === null || prop === undefined)) {
          reasons.push("uidFrom==0 and propertyExt==None with RTF action (bot)");
          return { isBot: true, reasons, score: 3 };
        }
        if (uidFrom !== "0" && (prop === null || prop === undefined)) {
          reasons.push("uidFrom!=0 and propertyExt==None with RTF action (auto bot)");
          return { isBot: true, reasons, score: 3 };
        }
      }
    }

    const attach = messageObject.data?.attach;
    if (attach && typeof attach === "string") {
      if (attach.includes("jxl") && !attach.includes("jpg") && !attach.includes("png")) {
        reasons.push("attach with jxl pattern (possible bot)");
        return { isBot: true, reasons, score: 2 };
      }
    }

    const timestamp = messageObject.data?.ts || messageObject.data?.timestamp;
    if (timestamp) {
      const now = Date.now();
      const msgTime = typeof timestamp === "number" ? timestamp : parseInt(timestamp);
      if (msgTime && (now - msgTime > 86400000 || msgTime - now > 60000)) {
        reasons.push(`timestamp out of range (possible bot)`);
        return { isBot: true, reasons, score: 2 };
      }
    }

    const clientId = messageObject.data?.clientId || messageObject.data?.cliMsgId;
    if (clientId && typeof clientId === "string") {
      if (clientId.length > 50 || /^[0-9]{20,}$/.test(clientId)) {
        reasons.push("clientId pattern suspicious (possible bot)");
        return { isBot: true, reasons, score: 2 };
      }
    }

    // Bỏ qua kiểm tra prop null cho web platform
    if ((prop === null || prop === undefined) && (!ext || Object.keys(ext).length === 0)) {
      if (isWebPlatform) {
        reasons.push(`web platform prop=None, ext empty → USER (safe)`);
        return { isBot: false, reasons, score: 0 };
      }
      reasons.push(`uidFrom=${uidFrom}, prop=None, ext empty → BOT`);
      return { isBot: true, reasons, score: 5 };
    }

    // Bỏ qua kiểm tra propertyExt cho web platform
    if (!isWebPlatform) {
      const platformName = isPCPlatform ? "PC" : "any";
      const globalPropCheck = checkPropertyExtObject(prop, uidFrom, platformName, reasons);
      if (globalPropCheck) {
        return { isBot: true, reasons, score: globalPropCheck.score };
      }
    }

    reasons.push("Không khớp điều kiện bot (user an toàn)");
    return { isBot: false, reasons, score: 0 };
  } catch (error) {
    console.error(`Lỗi phân loại message: ${error}`);
    return { isBot: false, reasons: ["exception"], score: -999 };
  }
}

/**
 * Xử lý tin nhắn anti-bot
 * @param {Object} api - API object
 * @param {string} uid - User ID
 * @param {string} threadId - Thread/Group ID
 * @param {Object} messageObject - Message object
 * @param {Object} groupSettings - Group settings object
 */
async function handleIncomingMessageAntibot(api, uid, threadId, messageObject, groupSettings) {
  try {
    if (!groupSettings[threadId]?.antiBot) {
      return;
    }

    const groupInfo = await getGroupInfoData(api, threadId);
    if (!groupInfo || !groupInfo.creatorId) {
      return;
    }

    const creatorId = groupInfo.creatorId;
    const adminIds = groupInfo.adminIds || [];
    const botUid = String(api.getBotId());

    if (botUid !== String(creatorId) && !adminIds.includes(botUid)) {
      return;
    }

    if (String(uid) === String(creatorId) || adminIds.includes(String(uid))) {
      return;
    }

    // Phần xóa tin nhắn platformType web
    // const paramsExt = messageObject.data?.paramsExt || {};
    // const platformType = paramsExt.platformType;
    // const msgType = String(messageObject.data?.msgType || "");
    // const isWebPlatform = platformType === "1" || platformType === 1 || String(platformType).toLowerCase() === "web" || String(platformType).toLowerCase() === "zalo_web";
    // const isWebchat = msgType === "webchat";

    // if (isWebPlatform || isWebchat) {
    //   try {
    //     await api.deleteMessage(messageObject, false);
    //     return;
    //   } catch (error) {
    //     console.error(`Lỗi xóa tin nhắn web uid=${uid} ở group ${threadId}: ${error}`);
    //     return;
    //   }
    // }
    //
    const { isBot, reasons, score } = isApiBotMessage(messageObject);
    if (!isBot) {
      return;
    }

    try {
      await api.deleteMessage(messageObject, false);
      const senderName = messageObject.data?.dName || "thành viên";
      await api.sendMessage(
        {
          msg: `⚠️ @${senderName}!\nĐại ca tui không cho bot khác ở đây.`,
          quote: messageObject,
          mentions: [MessageMention(String(uid), senderName.length + 1, "⚠️ ".length)],
          ttl: 300000,
        },
        threadId,
        MessageType.GroupMessage
      );
    } catch (error) {
      console.error(`Lỗi xóa tin nhắn uid=${uid} ở group ${threadId}: ${error}`);
    }
  } catch (error) {
    console.error(`Lỗi handler: ${error}`);
  }
}

export async function antiBot(api, message, isAdminBox, groupSettings, botIsAdminBox, isSelf) {
  const senderId = message.data?.uidFrom;
  const threadId = message.threadId;

  if (isSelf || isAdminBox || !botIsAdminBox || !groupSettings[threadId]?.antiBot) {
    return false;
  }

  if (!groupSettings[threadId]) {
    groupSettings[threadId] = { antiBot: false };
  }

  // Phần xóa tin nhắn platformType web
  // const paramsExt = message.data?.paramsExt || {};
  // const platformType = paramsExt.platformType;
  // const msgType = String(message.data?.msgType || "");
  // const isWebPlatform = platformType === "1" || platformType === 1 || String(platformType).toLowerCase() === "web" || String(platformType).toLowerCase() === "zalo_web";
  // const isWebchat = msgType === "webchat";

  // if (isWebPlatform || isWebchat) {
  //   await handleIncomingMessageAntibot(api, senderId, threadId, message, groupSettings);
  //   return true;
  // }
  //
  const { isBot } = isApiBotMessage(message);
  if (isBot) {
    await handleIncomingMessageAntibot(api, senderId, threadId, message, groupSettings);
    return true;
  }

  return false;
}

export async function handleAntiBotCommand(api, message, groupSettings) {
  const threadId = message.threadId;
  const content = removeMention(message);
  const parts = content.split(" ");
  const subcommand = parts[1]?.toLowerCase();

  if (!groupSettings[threadId]) {
    groupSettings[threadId] = { antiBot: false };
  }

  let newStatus;
  if (subcommand === "on") {
    groupSettings[threadId].antiBot = true;
    newStatus = "bật";
  } else if (subcommand === "off") {
    groupSettings[threadId].antiBot = false;
    newStatus = "tắt";
  } else {
    groupSettings[threadId].antiBot = !groupSettings[threadId].antiBot;
    newStatus = groupSettings[threadId].antiBot ? "bật" : "tắt";
  }

  const caption = `Chức năng chống bot đã được ${newStatus}!`;
  await sendMessageStateQuote(api, message, caption, groupSettings[threadId].antiBot, 300000);
  return true;
}
