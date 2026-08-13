import { undoMessageId } from "../message-archive/events.js";

export function registerModerationEvents(eventBus, service, { archive } = {}) {
  eventBus.on("message", "moderation", async ({ message }) => {
    const violation = await service.inspect(message);
    if (!violation) return;
    await service.enforce(message, violation);
    return { stop: true };
  }, { priority: 800 });
  eventBus.on("undo", "anti-undo", async ({ undo }) => {
    if (undo?.isSelf || !undo?.isGroup) return;
    const threadId = String(undo.threadId || undo.data?.idTo || "");
    const settings = await service.repository.get(threadId);
    if (!settings.antiUndo) return;
    const userId = String(undo.data?.uidFrom || "");
    if (await service.isPrivileged(userId, threadId)) return;
    const original = await archive?.find(threadId, undoMessageId(undo));
    const detail = original?.text
      ? `\nNội dung: ${original.text}`
      : original?.mediaUrl ? `\nMedia: ${original.mediaUrl}` : "";
    await service.client.sendText(threadId, 1, `Thành viên ${original?.senderName || undo.data?.dName || userId} vừa thu hồi một tin nhắn.${detail}`);
  }, { priority: 800 });
}
