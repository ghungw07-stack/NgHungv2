import { normalizeGroupLink } from "./service.js";

function extractLink(message) {
  const content = message?.data?.content;
  const candidates = typeof content === "string"
    ? [content]
    : [content?.href, content?.url, message?.data?.href];
  for (const candidate of candidates) {
    const link = normalizeGroupLink(candidate);
    if (link) return link;
  }
  return null;
}

export function registerAutoJoinEvents(eventBus, { service, settings }) {
  return eventBus.on("message", "autojoin", async ({ message }) => {
    if (message?.isSelf) return;
    const link = extractLink(message);
    if (!link) return;
    const config = await settings.get(message.threadId);
    if (config.autoJoinGroup) await service.enqueue(link);
  }, { priority: 100 });
}
