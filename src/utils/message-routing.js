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

export function isInteractiveCommandContent(content, prefix) {
  const text = String(content || "").trimStart();
  return Boolean(prefix && text.startsWith(prefix)) || /^prefix(?:\s|$)/iu.test(text);
}
