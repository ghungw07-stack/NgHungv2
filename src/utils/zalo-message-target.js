function firstPresent(object, keys) {
  for (const key of keys) {
    const value = object?.[key];
    if (value !== undefined && value !== null && String(value).length > 0) return String(value);
  }
  return null;
}

export function getGlobalMessageId(message) {
  return firstPresent(message, ["msgId", "globalMsgId", "id"]);
}

export function getClientMessageId(message) {
  return firstPresent(message, ["cliMsgId", "clientMsgId", "clientId"]);
}

export function getMessageOwnerId(message) {
  return firstPresent(message, ["uidFrom", "ownerId", "fromId", "senderId", "userId"]);
}

export function isMessageFromBot(message, botId) {
  const ownerId = getMessageOwnerId(message);
  return ownerId === "0" || (ownerId !== null && ownerId === String(botId));
}

export function sameMessageIdentity(left, right) {
  const leftMsgId = getGlobalMessageId(left);
  const rightMsgId = getGlobalMessageId(right);
  if (leftMsgId && rightMsgId) return leftMsgId === rightMsgId;

  const leftCliMsgId = getClientMessageId(left);
  const rightCliMsgId = getClientMessageId(right);
  return Boolean(leftCliMsgId && rightCliMsgId && leftCliMsgId === rightCliMsgId);
}

export function createMessageTarget(message, source, botId) {
  const msgId = getGlobalMessageId(source);
  const cliMsgId = getClientMessageId(source);
  if (!msgId || !cliMsgId) return null;

  const rawOwnerId = getMessageOwnerId(source);
  const uidFrom = rawOwnerId === "0" ? String(botId) : rawOwnerId || String(botId);
  return {
    type: message.type,
    threadId: message.threadId || message.idTo || message.data?.idTo,
    data: {
      ...source,
      msgId,
      cliMsgId,
      uidFrom,
    },
  };
}

// Response của sendMessage đôi khi mang msgId của tin được quote, còn msgIds
// mới là ID của tin bot vừa gửi. Reaction phải ưu tiên msgIds, nếu không CLOCK
// sẽ bám vào tin lệnh của người chơi thay vì tin bàn game của bot.
function createTargetFromSendResponse(message, sent, botId) {
  const sources = [
    sent?.message?.data,
    sent?.message,
    sent?.data,
    sent,
    sent?.attachment?.[0]?.data,
    sent?.attachment?.[0],
  ].filter((item) => item && typeof item === "object");

  const msgIdFromList = sources
    .map((item) => item.msgIds?.[0] || item.messageIds?.[0])
    .find((value) => value !== undefined && value !== null && String(value).length > 0);
  const msgId = msgIdFromList || sources
    .map((item) => getGlobalMessageId(item))
    .find((value) => value !== null);
  const cliMsgId = sources
    .map((item) => getClientMessageId(item))
    .find((value) => value !== null);

  if (!msgId || !cliMsgId) return null;
  return createMessageTarget(message, { msgId, cliMsgId, uidFrom: String(botId) }, botId);
}

// sendMessage đôi lúc chỉ xác nhận thành công mà không trả đủ identity của tin
// vừa gửi. Với nhóm, đọc lại danh sách tin gần nhất để vẫn có thể reaction vào
// chính tin của bot thay vì bỏ qua countdown.
export async function resolveSentMessageTarget(api, sourceMessage, sent) {
  const botId = api.getBotId();
  const directTarget = createTargetFromSendResponse(sourceMessage, sent, botId);
  if (directTarget) return directTarget;
  if (sourceMessage.type !== 1 || typeof api.getRecentMessages !== "function") return null;

  try {
    const recent = await getRecentGroupMessages(api, sourceMessage.threadId, 10);
    const sourceMsgId = getGlobalMessageId(sourceMessage.data || sourceMessage);
    const sourceCliMsgId = getClientMessageId(sourceMessage.data || sourceMessage);
    // Tin bàn bot luôn quote chính tin lệnh mở bàn. Cách này tin cậy hơn uidFrom:
    // một số session nhận tin self với uidFrom khác api.getBotId().
    const quotedCommandMessage = recent.find((item) => {
      const quote = item?.quote;
      return (sourceMsgId && String(quote?.globalMsgId) === sourceMsgId)
        || (sourceCliMsgId && String(quote?.cliMsgId) === sourceCliMsgId);
    });
    const target = quotedCommandMessage || recent.find((item) => isMessageFromBot(item, botId));
    return target ? createMessageTarget(sourceMessage, target, botId) : null;
  } catch (error) {
    console.warn("[reaction] Không đọc được tin bot vừa gửi:", error?.message || error);
    return null;
  }
}

export function parseRecentGroupMessages(response) {
  const parsed = typeof response === "string" ? JSON.parse(response) : response;
  const messages = parsed?.groupMsgs || parsed?.data?.groupMsgs;
  return Array.isArray(messages) ? messages : [];
}

export async function getRecentGroupMessages(api, threadId, maxMessages = 500, stopWhen) {
  const messages = [];
  const seenMessageIds = new Set();
  const seenCursors = new Set();
  let cursor = "10000000000000000";

  while (messages.length < maxMessages && !seenCursors.has(cursor)) {
    seenCursors.add(cursor);
    const pageSize = Math.min(50, maxMessages - messages.length);
    const response = await api.getRecentMessages(threadId, cursor, pageSize);
    const page = parseRecentGroupMessages(response);
    if (page.length === 0) break;

    for (const item of page) {
      const key = getGlobalMessageId(item) || `cli:${getClientMessageId(item)}`;
      if (key && seenMessageIds.has(key)) continue;
      if (key) seenMessageIds.add(key);
      messages.push(item);
      if (messages.length >= maxMessages) break;
    }

    if (typeof stopWhen === "function" && stopWhen(messages)) break;

    const nextCursor = getGlobalMessageId(page[page.length - 1]);
    if (!nextCursor || nextCursor === cursor) break;
    cursor = nextCursor;
  }

  return messages;
}
