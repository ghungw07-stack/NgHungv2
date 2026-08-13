export function registerModerationEvents(eventBus, service) {
  eventBus.on("message", "moderation", async ({ message }) => {
    const violation = await service.inspect(message);
    if (!violation) return;
    await service.enforce(message, violation);
    return { stop: true };
  }, { priority: 800 });
}
