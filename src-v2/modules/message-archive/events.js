function undoMessageId(undo) {
  const content = undo?.data?.content;
  if (typeof content === "string") {
    try { return JSON.parse(content)?.globalMsgId; } catch { return null; }
  }
  return content?.globalMsgId || content?.msgId;
}

export function registerMessageArchiveEvents(eventBus, { archive }) {
  eventBus.on("message", "message-archive", ({ message }) => archive.save(message), { priority: 700 });
  return { undoMessageId };
}

export { undoMessageId };
