import { MessageMention, MessageType } from "zlbotngh";
import { sendMessageStateQuote } from "../chat-zalo/chat-style/chat-style.js";
import { createBlockSpamLinkImage } from "../../utils/canvas/event-image.js";
import { clearImagePath } from "../../utils/canvas/index.js";
import { getGroupInfoData } from "../info-service/group-info.js";
import { getUserInfoData } from "../info-service/user-info.js";
import { isInWhiteList } from "./white-list.js";
import { removeMention } from "../../utils/format-util.js";
import { getAntiConfig, updateAntiConfig } from "./index.js";
import { scanQRCode } from "../utilities/qr-scan.js";
import { deleteMessageCustomer } from "../../commands/bot-manager/utilities.js";

function loadLinkRegex(botId) {
  try {
    const antiState = getAntiConfig(botId);
    if (!antiState.linkRegex) {
      antiState.linkRegex =
        "(?:https?:\\/\\/|www\\.)\\S+|(?<!\\w)[a-zA-Z0-9-]+[.,](?:com|net|org|vn|info|biz|io|xyz|me|tv|online|store|club|site|app|blog|dev|tech|cloud|game|shop|click|space|asia|fun|tokyo|xyz|website)(?:\\/\\S*)?(?!\\w)";
    }
    return new RegExp(antiState.linkRegex, "gi");
  } catch (error) {
    console.error("Lỗi khi đọc regex link:", error);
    return null;
  }
}

function loadWhiteLinks(botId) {
  try {
    const antiState = getAntiConfig(botId);
    return antiState?.whiteLinks || {};
  } catch (error) {
    console.error("Lỗi khi đọc regex link:", error);
    return null;
  }
}

let linkSendCount = {};
let linkSendTime = {};

function checkLink(botId, content, threadId) {
  //if (!content || content === "https://zalo.me" || content === "www.zaloapp.com") return false;

  const linkRegex = loadLinkRegex(botId);
  const matches = content.match(linkRegex);
  if (!matches) return false;

  const whiteLinks = loadWhiteLinks(botId);
  if (!whiteLinks[threadId]) return true;

  for (const link of matches) {
    const isWhiteLink = whiteLinks[threadId].some((wLink) => link.includes(wLink));
    if (!isWhiteLink) return true;
  }

  return false;
}

export async function antiLink(api, message, groupInfo, isAdminBox, groupSettings, botIsAdminBox, isSelf) {
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const threadId = message.threadId;

  if (isSelf || isAdminBox || !botIsAdminBox || !groupSettings[threadId]?.removeLinks) return false;

  return await handleLinkMessage(api, message, groupInfo, groupSettings, isAdminBox, threadId, senderId, senderName);
}

export async function handleAntiLinkCommand(api, message, groupSettings) {
  const botId = api.getBotId();
  const threadId = message.threadId;
  let isChangeSetting = false;
  const content = removeMention(message);
  const args = content.split(" ");
  const status = args[1]?.toLowerCase();
  if (!groupSettings[threadId]) {
    groupSettings[threadId] = {};
  }

  if (status === "list") {
    const getWhiteLinks = loadWhiteLinks(botId);
    if (!getWhiteLinks[threadId] || getWhiteLinks[threadId].length === 0) {
      const caption = "Nhóm này chưa có link nào trong danh sách trắng!";
      await sendMessageStateQuote(api, message, caption, false, 300000, false);
      return;
    }

    const linkList = getWhiteLinks[threadId].map((link, index) => `${index + 1}. ${link}`).join("\n");

    const caption = `📋 Danh sách link được phép gửi trong nhóm:\n${linkList}`;
    await sendMessageStateQuote(api, message, caption, false, 300000, false);
    return;
  } else if (status === "add") {
    const link = args[2];
    if (link) {
      const getWhiteLinks = loadWhiteLinks(botId);
      if (!getWhiteLinks[threadId]) getWhiteLinks[threadId] = [];
      if (!getWhiteLinks[threadId].some((wLink) => wLink === link)) {
        getWhiteLinks[threadId].push(link);
        const antiState = getAntiConfig(botId);
        updateAntiConfig(botId, {
          ...antiState,
          whiteLinks: getWhiteLinks,
        });
        const caption = `Đã thêm link: ${link} vào danh sách link được gửi và không bị xóa!`;
        await sendMessageStateQuote(api, message, caption, false, 300000, false);
      } else {
        const caption = `Cụm link: ${link} -> đã nằm trong danh sách link được gửi và không bị xóa!`;
        await sendMessageStateQuote(api, message, caption, false, 300000, false);
      }
    } else {
      const caption = `Vui lòng nhập link cần đưa vào danh sách trắng!`;
      await sendMessageStateQuote(api, message, caption, false, 300000, false);
    }
  } else if (status === "remove") {
    const link = args[2];
    if (link) {
      const getWhiteLinks = loadWhiteLinks(botId);
      if (!getWhiteLinks[threadId]) getWhiteLinks[threadId] = [];
      if (getWhiteLinks[threadId].some((wLink) => wLink === link)) {
        const index = getWhiteLinks[threadId].indexOf(link);
        getWhiteLinks[threadId].splice(index, 1);
        const antiState = getAntiConfig(botId);
        updateAntiConfig(botId, {
          ...antiState,
          whiteLinks: getWhiteLinks,
        });
        const caption = `Đã xóa link: ${link} khỏi danh sách link được gửi và không bị xóa!`;
        await sendMessageStateQuote(api, message, caption, false, 300000, false);
      } else {
        const caption = `Cụm link: ${link} -> không nằm trong danh sách link được gửi và không bị xóa!`;
        await sendMessageStateQuote(api, message, caption, false, 300000, false);
      }
    } else {
      const caption = `Vui lòng nhập link cần xóa khỏi danh sách trắng!`;
      await sendMessageStateQuote(api, message, caption, false, 300000, false);
    }
  } else {
    const newStatus = status === "on" ? true : status === "off" ? false : !groupSettings[threadId].removeLinks;
    groupSettings[threadId].removeLinks = newStatus;
    isChangeSetting = true;
    const statusText = newStatus ? "bật" : "tắt";
    const caption = `Chức năng xóa link đã được ${statusText}!`;
    await sendMessageStateQuote(api, message, caption, newStatus, 300000);
    return isChangeSetting;
  }
}

async function handleLinkMessage(api, message, groupInfo, groupSettings, isAdminBox, threadId, senderId, senderName) {
  let content = message.data.content;
  content = content.title ? content.title : content;
  const isRecommendedMessage = message.data.msgType === "chat.recommended";
  const isImage = message.data.msgType === "chat.photo";
  const isPlainText = typeof content === "string";
  let isDeleteLink = false;
  const botId = api.getBotId();
  const isUserWhiteList = isInWhiteList(groupSettings, threadId, senderId);

  if (isUserWhiteList) return isDeleteLink;

  if (isRecommendedMessage) {
    const linkTitle = message.data?.content?.title;
    const linkHref = message.data?.content?.href;
    const isLinkInTitle = checkLink(botId, linkTitle, threadId);
    const isLinkInHref = checkLink(botId, linkHref, threadId);
    if (isLinkInTitle || isLinkInHref) {
      await deleteMessageCustomer(api, message);
      isDeleteLink = true;
    }
  }

  if (!isDeleteLink && isImage) {
    const linkImage = message.data?.content?.href;
    if (linkImage) {
      const result = await scanQRCode(linkImage, { silent: true });
      if (result.success) {
        if (checkLink(botId, result.data.content, threadId)) {
          await deleteMessageCustomer(api, message);
          isDeleteLink = true;
        }
      }
    }
  }

  const hasLink = isPlainText && checkLink(botId, content, threadId);

  if (!isDeleteLink && hasLink) {
    const linkRegex = loadLinkRegex(botId);
    const matches = content.match(linkRegex);
    if (matches) {
      await deleteMessageCustomer(api, message);
      isDeleteLink = true;
    }
  }

  if (isDeleteLink) {
    if (!isUserWhiteList) {
      await updateLinkCount(api, message, threadId, senderId, senderName, botId, isAdminBox, groupInfo, groupSettings);
    }
  }
  return isDeleteLink;
}

async function updateLinkCount(api, message, threadId, senderId, senderName, botId, isAdminBox, groupInfo, groupSettings) {
  if (!linkSendCount[senderId]) {
    linkSendCount[senderId] = 0;
    linkSendTime[senderId] = Date.now();
  }

  linkSendCount[senderId]++;

  if (isAdminBox && senderId !== botId) {
    return;
  }

  if (Date.now() - linkSendTime[senderId] < 3 * 60 * 1000) {
    if (linkSendCount[senderId] > 2) {
      // User requested to ONLY delete and warn, NO kick
      // await blockUser(api, message, threadId, senderId, senderName, groupSettings);
      linkSendCount[senderId] = 2; // cap it at 2 so it keeps warning
    }
  } else {
    linkSendCount[senderId] = 1;
    linkSendTime[senderId] = Date.now();
  }

  await sendWarningMessage(api, message, senderId, senderName, linkSendCount[senderId], groupInfo);
}

const kickedUsers = new Set();

async function blockUser(api, message, threadId, senderId, senderName, groupSettings) {
  try {
    if (kickedUsers.has(senderId)) return;
    kickedUsers.add(senderId);
    await api.blockUsers(threadId, [senderId]);

    const isEnableBlockImage = groupSettings?.[threadId]?.enableBlockImage === true;
    
    if (isEnableBlockImage) {
      try {
        const groupInfo = await getGroupInfoData(api, threadId);
        const userInfo = await getUserInfoData(api, senderId);
        const botId = api.getBotId();
        const botInfo = await getUserInfoData(api, botId);
        const botName = botInfo?.name || botInfo?.zaloName || api.accountInfo?.name || "Bot";
        const imagePath = await createBlockSpamLinkImage(userInfo, groupInfo.name, groupInfo.groupType, userInfo.gender, botName);

        await api.sendMessage(
          {
            msg: "",
            attachments: imagePath ? [imagePath] : [],
            ttl: 86400000,
            isUseProphylactic: true,
          },
          threadId,
          MessageType.GroupMessage
        );

        await clearImagePath(imagePath);
      } catch (error) {
        console.error("Lỗi khi tạo và gửi ảnh block link:", error);
      }
    }

    setTimeout(() => {
      kickedUsers.delete(senderId);
      console.log(`Đã xóa ${senderId} khỏi danh sách kickedUsers.`);
    }, 5000);
  } catch {
    console.error(`Không thể chặn người dùng ${senderName}`);
  }
}

async function sendWarningMessage(api, message, senderId, senderName, count, groupInfo) {
  try {
    let caption = `⚠️ Cảnh cáo ${senderName}!\nỞ đây không được phép gửi link này!`;
    switch (count) {
      case 2:
        caption = `⚠️ Cảnh cáo ${senderName}!\nNgừng send link, trước khi, mọi chuyện dần tồi tệ hơn!`;
        break;
    }
    await api.sendMessage(
      {
        msg: caption,
        quote: message,
        mentions: [MessageMention(senderId, senderName.length, "⚠️ Cảnh cáo ".length)],
        ttl: 300000,
      },
      message.threadId,
      MessageType.GroupMessage
    );
    // await api.sendMessage(
    //   {
    //     msg: `Admin đã chặn gửi link trong nhóm ${groupInfo.name}, link của ${senderName} bị xóa!`,
    //     quote: message,
    //   },
    //   senderId,
    //   MessageType.DirectMessage
    // );
  } catch (error) {
    console.error(`Không thể gửi tin nhắn tới ${senderName}:`, error.message);
  }
}
