import { TtlCache } from "../../core/ttl-cache.js";

export function registerAutoReplyEvents(eventBus, { repository, settings, client }) {
  const recent = new TtlCache({ ttlMs: 5_000, maxSize: 5_000 });
  eventBus.on("message", "auto-reply", async ({ message }) => {
    if (message?.isSelf || message?.type !== 1 || typeof message?.data?.content !== "string") return;
    const threadId = String(message.threadId); const config = await settings.get(threadId);
    if (!config.autoReplyEnabled) return;
    const row = await repository.find(threadId, message.data.content);
    if (!row) return;
    const key = `${threadId}:${row.trigger}`; if (recent.has(key)) return;
    recent.add(key); await client.sendText(threadId, 1, row.response);
  }, { priority: 300 });
  return () => recent.clear();
}
