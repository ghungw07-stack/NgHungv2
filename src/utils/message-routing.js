import { getReplyAdminCommandText } from "./admin-command-text.js";

const PASSIVE_FLAGS = new Set(["activeBot", "autoJoinGroup"]);

function mayContainAutoJoinTarget(message) {
  const msgType = message?.data?.msgType;
  if (msgType === "chat.photo") return true;
  const content = message?.data?.content;
  if (typeof content !== "string") return false;
  return /(?:zalo\.me\/g\/|zaloapp\.com\/qr\/g\/)/iu.test(content);
}

export function shouldProcessGroupMessage(settings, { isCommand = false, message = null } = {}) {
  if (isCommand) return true;
  if (!settings || typeof settings !== "object") return false;
  if (Object.entries(settings).some(([key, value]) => value === true && !PASSIVE_FLAGS.has(key))) return true;
  if (settings.autoJoinGroup === true && mayContainAutoJoinTarget(message)) return true;
  if (settings.muteList && Object.keys(settings.muteList).length > 0) return true;
  const rental = settings.rentalBot;
  return Boolean(rental && Number(rental.expiresAt) > Date.now());
}

export function shouldCacheIncomingMessage(messageType, groupMessageType, groupLoggingEnabled) {
  return messageType !== groupMessageType || groupLoggingEnabled;
}

export function isGiveawayJoinText(content, message = null) {
  let raw = "";
  if (typeof content === "string" && content.trim()) {
    raw = content;
  } else if (typeof message?.data?.content === "string") {
    raw = message.data.content;
  } else if (typeof message?.data?.content?.title === "string") {
    raw = message.data.content.title;
  } else {
    return false;
  }

  let text = raw.trim();
  if (!text) return false;

  if (message?.data?.mentions?.length > 0) {
    for (const mention of message.data.mentions) {
      if (typeof mention?.dName === "string" && mention.dName) {
        text = text.replace(new RegExp(`^\\s*@?${mention.dName.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\s*`, "iu"), "").trim();
      }
    }
  }
  text = text.replace(/^@\S+(?:\s+|$)/u, "").trim();
  text = text.replace(/^["'\u201c\u201d\u2018\u2019\u00ab\u00bb]+|["'\u201c\u201d\u2018\u2019\u00ab\u00bb]+$/gu, "").trim();
  text = text.replace(/[!.,?\s\u2764\ufe0f\ud83d\udc96\ud83d\udc97]+$/gu, "").trim();
  return /^(?:tham\s*gia(?:\s+giveaway)?)$/iu.test(text);
}

export function isInteractiveCommandContent(content, prefix, message = null) {
  if (message && getReplyAdminCommandText(message, prefix) !== null) return true;
  const text = String(content || "").trimStart();
  return Boolean(prefix && text.startsWith(prefix)) || /^prefix(?:\s|$)/iu.test(text) || isGiveawayJoinText(text, message);
}
