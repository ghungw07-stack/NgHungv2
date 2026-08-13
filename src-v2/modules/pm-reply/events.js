export function registerPmReplyEvents(eventBus, { settings, client }) {
  eventBus.on("message", "pm-auto-reply", async ({ message }) => {
    if (message?.isSelf || message?.type !== 0) return;
    const config = await settings.get("__global__"); if (!config.pmReplyEnabled) return;
    await client.sendText(message.threadId, 0, config.pmReplyMessage || "Bot đã nhận được tin nhắn của bạn.");
    if (config.pmReplyCard?.id) await client.api.sendBusinessCard(config.pmReplyCard.content, config.pmReplyCard.id, undefined, 0, message.threadId, 300_000);
  }, { priority: 250 });
}
