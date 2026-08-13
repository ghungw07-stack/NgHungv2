export function registerParentRelayEvents(eventBus, service) {
  return eventBus.on("message", "parent-relay", async ({ message }) => {
    if (await service.handle(message)) return { stop: true };
  }, { priority: 900 });
}
