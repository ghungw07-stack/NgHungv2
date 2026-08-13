export class LegacyCommandCompatibility {
  constructor({ client, botConfig, logger }) { Object.assign(this, { client, botConfig, logger }); this.ready = false; }
  async start() {
    const previous = process.env.NGH_LEGACY_LIBRARY;
    process.env.NGH_LEGACY_LIBRARY = "1";
    try {
      const legacy = await import("../../src/index.js");
      const automation = await import("../../src/automations/event-send-msg.js");
      this.messagesUser = automation.messagesUser;
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
  stop() { this.ready = false; this.messagesUser = null; }
}
