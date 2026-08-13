import { TtlCache } from "../../core/ttl-cache.js";

export function registerMessageEvents(eventBus, { dispatcher, client, logger, legacyCommands }) {
  const seen = new TtlCache({ ttlMs: 30_000, maxSize: 20_000 });
  eventBus.on("message", "deduplicate", ({ message }) => {
    const id = message?.data?.cliMsgId ?? message?.data?.msgId;
    if (!id) return;
    const key = `${client.botId}:${id}`;
    if (seen.has(key)) return { stop: true };
    seen.add(key);
  }, { priority: 1000 });
  eventBus.on("message", "commands", async ({ message }) => {
    if (message?.isSelf || typeof message?.data?.content !== "string") return;
    if (legacyCommands && await legacyCommands.handle(message)) return { stop: true };
    await dispatcher.dispatch({
      api: client.api,
      message,
      content: message.data.content.trim(),
      senderId: String(message.data.uidFrom),
      threadId: String(message.threadId),
      type: message.type,
      reply: (text) => client.sendText(message.threadId, message.type, text),
    });
  }, { priority: 500 });
  return () => { seen.clear(); logger.debug("Đã xóa message dedupe cache"); };
}
