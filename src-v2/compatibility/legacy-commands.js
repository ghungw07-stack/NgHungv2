export class LegacyCommandCompatibility {
  constructor({ client, botConfig, logger }) { Object.assign(this, { client, botConfig, logger }); this.ready = false; }
  async start() {
    const previous = process.env.NGH_LEGACY_LIBRARY;
    process.env.NGH_LEGACY_LIBRARY = "1";
    try {
      const legacy = await import("../../src/index.js");
      const automation = await import("../../src/automations/event-send-msg.js");
      const reactions = await import("../../src/automations/events-reaction.js");
      const groups = await import("../../src/automations/events-group.js");
      const undos = await import("../../src/automations/event-undo-msg.js");
      this.messagesUser = automation.messagesUser;
      this.reactionEvents = reactions.reactionEvents;
      this.groupEvents = groups.gruopEvents;
      this.undoEvents = undos.undoMessageEvents;
      this.client.api.apiManager = await legacy.initApiManager(this.client.botId, this.client.api, this.botConfig);
      await legacy.initializeLegacyCompatibility(this.client.api);
      this.ready = true;
    } finally {
      if (previous === undefined) delete process.env.NGH_LEGACY_LIBRARY; else process.env.NGH_LEGACY_LIBRARY = previous;
    }
  }
  async handle(message) {
    if (!this.ready || message?.isSelf) return false;
    await this.messagesUser(this.client.api, message);
    return true;
  }
  register(eventBus) {
    const disposers = [
      eventBus.on("message", "legacy-message", async ({ message }) => { if (await this.handle(message)) return { stop: true }; }, { priority: 950 }),
      eventBus.on("reaction", "legacy-reaction", async ({ reaction }) => { await this.reactionEvents(this.client.api, reaction); return { stop: true }; }, { priority: 950 }),
      eventBus.on("group_event", "legacy-group", async ({ group_event }) => { await this.groupEvents(this.client.api, group_event); return { stop: true }; }, { priority: 950 }),
      eventBus.on("undo", "legacy-undo", async ({ undo }) => { await this.undoEvents(this.client.api, undo); return { stop: true }; }, { priority: 950 }),
    ];
    return () => disposers.forEach((dispose) => dispose());
  }
  stop() { this.ready = false; this.messagesUser = null; this.reactionEvents = null; this.groupEvents = null; this.undoEvents = null; }
}
