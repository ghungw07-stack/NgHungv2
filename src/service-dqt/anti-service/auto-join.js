import schedule from "node-schedule";
import { sendMessageStateQuote, sendMessageCompleteRequest } from "../chat-zalo/chat-style/chat-style.js";
import { isInWhiteList } from "./white-list.js";
import { scanQRCode } from "../utilities/qr-scan.js";
import { getDataAllGroup } from "../info-service/group-info.js";
import { getGlobalPrefix } from "../../service-dqt/service.js";

function getQRContent(data) {
  if (!data) return null;
  if (typeof data === "string") return data;
  if (typeof data.content === "string") return data.content;
  if (typeof data.url === "string") return data.url;
  if (typeof data.text === "string") return data.text;
  return null;
}

const requestAutoJoinMap = new Map();
const WAITING_ACTION_JOIN_GROUP = 30000;

schedule.scheduleJob("*/5 * * * * *", () => {
  const currentTime = Date.now();
  for (const [msgId, data] of requestAutoJoinMap.entries()) {
    if (currentTime - data.timestamp > WAITING_ACTION_JOIN_GROUP) {
      requestAutoJoinMap.delete(msgId);
    }
  }
});

function normalizeLink(link) {
  if (!link || typeof link !== "string") return null;

  let trimmed = link.replace(/[\s\u200B-\u200D\uFEFF]/g, "");
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();

    if (host.includes("zaloapp.com") && path.startsWith("/qr/g/")) {
      const groupId = path.match(/\/qr\/g\/([a-z0-9]+)/i)?.[1];
      return groupId ? `https://zalo.me/g/${groupId}` : null;
    }

    if (host.includes("zalo.me")) {
      const groupId = path.match(/\/g\/([a-z0-9]+)/i)?.[1];
      return groupId ? `https://zalo.me/g/${groupId}` : null;
    }

    return url.toString();
  } catch {
    const sanitized = trimmed.replace(/[^\w\-.:\/?=&]/g, "").toLowerCase();
    if (sanitized.includes("zaloapp.com/qr/g/")) {
      const groupId = sanitized.match(/zaloapp\.com\/qr\/g\/([a-z0-9]+)/)?.[1];
      return groupId ? `https://zalo.me/g/${groupId}` : null;
    }
    if (sanitized.includes("zalo.me/g/")) {
      const groupId = sanitized.match(/zalo\.me\/g\/([a-z0-9]+)/)?.[1];
      return groupId ? `https://zalo.me/g/${groupId}` : null;
    }
    return sanitized;
  }
}

async function processJoinLink(api, link) {
  const normalizedLink = normalizeLink(link);
  if (!normalizedLink || !normalizedLink.includes('zalo.me/g/')) {
    return false;
  }
  try {
    await api.joinGroup(normalizedLink);
    return true;
  } catch (error) {
    return false;
  }
}

function extractLinkFromMessage(message) {
  const msgType = message.data.msgType;
  const content = message.data.content;

  if (msgType === "chat.recommended") {
    return content?.href || null;
  }

  if (msgType === "chat.photo") {
    return content?.href || null;
  }

  if (typeof content === 'string') {
    const trimmed = content.trim();
    const links = trimmed.match(/(?:https?:\/\/|www\.)[^\s/$.?#].[^\s]*|\b[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?/gi) || [];
    return links.find(l => l.includes('zalo.me/g/') || l.includes('zaloapp.com/qr/g/')) || null;
  }

  return null;
}

export async function autoJoinGroup(api, message, groupSettings, botIsAdminBox, isSelf) {
  const senderId = message.data.uidFrom;
  const threadId = message.threadId;

  if (isInWhiteList(groupSettings, threadId, senderId)) {
    return false;
  }

  if (!groupSettings[threadId]?.autoJoinGroup) {
    return false;
  }

  let link = extractLinkFromMessage(message);

  if (message.data.msgType === "chat.photo" && link) {
    try {
      const result = await scanQRCode(link, { silent: true });
      if (result.success) {
        const qrContent = getQRContent(result.data);
        if (qrContent) {
          link = qrContent;
        }
      }
    } catch (error) {
      // Ignore QR scan errors
    }
  }

  if (link) {
    await processJoinLink(api, link);
    return true;
  }

  return false;
}

export async function handleAutoJoinCommand(api, message, groupSettings) {
  const { threadId } = message;
  const args = message.data.content.trim().split(/\s+/);
  const subCommand = args[1]?.toLowerCase();
  const target = args[2]?.toLowerCase();

  const prefix = getGlobalPrefix(api.getBotId());
  const usageText =
    `⚠️ Vui lòng dùng:\n` +
    `${prefix}autojoin on - Bật AutoJoin cho nhóm hiện tại\n` +
    `${prefix}autojoin off - Tắt AutoJoin cho nhóm hiện tại\n` +
    `${prefix}autojoin add all - Bật AutoJoin cho tất cả nhóm\n` +
    `${prefix}autojoin off all - Tắt AutoJoin cho tất cả nhóm`;

  if (!subCommand) {
    await sendMessageStateQuote(api, message, usageText, false, 60000);
    return true;
  }

  if (subCommand === "add" && target === "all") {
    const groups = await getDataAllGroup(api);
    for (const group of groups) {
      if (!groupSettings[group.groupId]) {
        groupSettings[group.groupId] = {};
      }
      groupSettings[group.groupId].autoJoinGroup = true;
    }
    await sendMessageCompleteRequest(api, message, { caption: `✅ Đã bật AutoJoin cho tất cả nhóm!` }, 30000);
    return true;
  }

  if (subCommand === "off" && target === "all") {
    const groups = await getDataAllGroup(api);
    for (const group of groups) {
      if (!groupSettings[group.groupId]) continue;
      groupSettings[group.groupId].autoJoinGroup = false;
    }
    await sendMessageCompleteRequest(api, message, { caption: `❌ Đã tắt AutoJoin cho tất cả nhóm!` }, 30000);
    return true;
  }

  if (subCommand === "on") {
    if (!groupSettings[threadId]) {
      groupSettings[threadId] = {};
    }
    if (groupSettings[threadId].autoJoinGroup) {
      await sendMessageStateQuote(api, message, "⚠️ AutoJoin đã bật từ trước!", false, 30000);
      return true;
    }
    groupSettings[threadId].autoJoinGroup = true;
    await sendMessageStateQuote(api, message, "✅ AutoJoin đã được bật cho nhóm này!", true, 30000);
    return true;
  }

  if (subCommand === "off") {
    if (!groupSettings[threadId]) {
      groupSettings[threadId] = {};
    }
    groupSettings[threadId].autoJoinGroup = false;
    await sendMessageStateQuote(api, message, "❌ Chức năng AutoJoin đã được tắt cho nhóm này!", false, 30000);
    return true;
  }

  await sendMessageStateQuote(api, message, usageText, false, 60000);
  return true;
}

export async function handleReactionConfirmAutoJoin(api, reaction) {
  const msgId = reaction.data.content.rMsg[0].gMsgID.toString();
  const data = requestAutoJoinMap.get(msgId);
  if (!data) return false;

  const senderId = reaction.data.uidFrom;
  if (senderId !== data.message.data.uidFrom) return false;

  const rType = reaction.data.content.rType;
  if (rType !== 5) return false;

  const message = data.message;
  const threadId = message.threadId;
  requestAutoJoinMap.delete(msgId);

  if (data.action === "enable") {
    if (!message.groupSettings) {
      message.groupSettings = {};
    }
    if (!message.groupSettings[threadId]) {
      message.groupSettings[threadId] = {};
    }
    message.groupSettings[threadId].autoJoinGroup = true;
    await sendMessageStateQuote(api, message, "Chức năng tự động tham gia đã được bật!", true, 30000);
    return true;
  }

  return false;
}
