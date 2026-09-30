const MAX_TEXT_LENGTH = 12_000;

function safeJson(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function safeUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function firstUrl(...values) {
  for (const value of values) {
    const url = safeUrl(value);
    if (url) return url;
  }
  return null;
}

function readMedia(payload) {
  const content = payload?.content;
  const object = content && typeof content === "object" ? content : {};
  const msgType = String(payload?.msgType || "").toLowerCase();
  let kind = null;
  if (msgType.includes("photo")) kind = "image";
  else if (msgType.includes("video")) kind = "video";
  else if (msgType.includes("voice")) kind = "audio";
  else if (msgType.includes("sticker")) kind = "sticker";
  else if (msgType.includes("file")) kind = "file";
  else if (msgType.includes("gif")) kind = "image";
  else if (msgType.includes("link")) kind = "link";

  const url = firstUrl(
    object.href,
    object.oriUrl,
    object.normalUrl,
    object.url,
    object.fileUrl,
    object.voiceUrl
  );
  const thumb = firstUrl(object.thumb, object.thumbUrl, object.thumbnail, object.previewThumb);
  if (!kind && !url && !thumb) return null;
  return {
    kind: kind || "file",
    url,
    thumb,
    name: String(object.fileName || object.title || "").slice(0, 255),
  };
}

export function getConversationText(payloadInput) {
  const payload = safeJson(payloadInput);
  const content = payload?.content;
  let text = "";
  if (typeof content === "string") text = content;
  else if (content && typeof content === "object") {
    text = content.title || content.description || content.caption || content.fileName || "";
  }
  if (!text) {
    const type = String(payload?.msgType || "").toLowerCase();
    if (type.includes("photo")) text = "[Hình ảnh]";
    else if (type.includes("video")) text = "[Video]";
    else if (type.includes("voice")) text = "[Tin nhắn thoại]";
    else if (type.includes("sticker")) text = "[Nhãn dán]";
    else if (type.includes("file")) text = "[Tệp đính kèm]";
    else if (type.includes("gif")) text = "[Ảnh GIF]";
    else text = "[Tin nhắn]";
  }
  return String(text).slice(0, MAX_TEXT_LENGTH);
}

export function serializeConversationMessage(document, botId) {
  const payload = safeJson(document?.payload);
  const senderId = String(document?.uidFrom ?? payload.uidFrom ?? "");
  const targetId = String(document?.idTo ?? payload.idTo ?? "");
  const normalizedBotId = String(botId || "");
  const wrapperType = payload.conversationType ?? document?.conversationType ?? document?.msgWrapType;
  let conversationType = wrapperType != null && Number(wrapperType) === 1
    ? "group"
    : wrapperType != null && Number(wrapperType) === 0 ? "direct" : null;
  const isSelf = payload.isSelf === true || (!!normalizedBotId && senderId === normalizedBotId);
  if (!conversationType && !isSelf && targetId === normalizedBotId) conversationType = "direct";

  return {
    id: String(document?.msgId ?? payload.msgId ?? ""),
    threadId: String(document?.threadId ?? payload.threadId ?? ""),
    senderId,
    senderName: String(document?.dName ?? payload.dName ?? "").slice(0, 255),
    content: getConversationText(payload),
    msgType: String(document?.msgType ?? payload.msgType ?? "webchat"),
    conversationType,
    timestamp: Number(document?.ts ?? payload.timestamp ?? payload.ts) || 0,
    isSelf,
    isUndo: Boolean(document?.isUndo ?? payload.isUndo),
    media: readMedia(payload),
  };
}

export function serializeConversationSummary(row, botId) {
  const last = serializeConversationMessage(row?.latest || row, botId);
  const forcedType = row?.conversationType;
  if (forcedType === "direct" || forcedType === "group") last.conversationType = forcedType;
  const fallbackTitle = last.conversationType === "group"
    ? `Nhóm ${last.threadId}`
    : String(row?.otherName || last.senderName || last.threadId);
  return {
    threadId: last.threadId,
    title: fallbackTitle.slice(0, 255),
    lastMessage: last.content,
    timestamp: last.timestamp,
    conversationType: last.conversationType,
    isSelf: last.isSelf,
    isUndo: last.isUndo,
    messageCount: Math.max(0, Number(row?.messageCount) || 0),
  };
}

export function serializeRecentGroupMessages(response, botId, threadId) {
  const root = safeJson(response);
  const nested = safeJson(root?.data);
  const rows = Array.isArray(root?.groupMsgs)
    ? root.groupMsgs
    : Array.isArray(nested?.groupMsgs) ? nested.groupMsgs : [];
  const normalizedBotId = String(botId || "");
  const normalizedThreadId = String(threadId || "");

  return rows.map((row) => {
    const rawSenderId = String(row?.uidFrom ?? "");
    const isSelf = rawSenderId === "0" || (!!normalizedBotId && rawSenderId === normalizedBotId);
    return serializeConversationMessage({
      ...row,
      threadId: normalizedThreadId,
      uidFrom: isSelf ? normalizedBotId : rawSenderId,
      idTo: normalizedThreadId,
      msgWrapType: 1,
      payload: {
        ...row,
        conversationType: 1,
        isSelf,
      },
    }, normalizedBotId);
  });
}
