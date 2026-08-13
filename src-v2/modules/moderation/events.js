export function registerModerationEvents(eventBus, service) {
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
    await service.client.sendText(threadId, 1, `Thành viên ${undo.data?.dName || userId} vừa thu hồi một tin nhắn.`);
  }, { priority: 800 });
}
