import { CommandDispatcher } from "../core/commands/dispatcher.js";
import { CommandRegistry } from "../core/commands/registry.js";
import { createPermissionService } from "../core/permissions.js";
import { TaskQueue } from "../core/task-queue.js";
import { registerSystemCommands } from "../modules/system/commands.js";
import { registerBotManagerCommands } from "../modules/bot-manager/commands.js";
import { EventBus } from "../core/events/event-bus.js";
import { registerMessageEvents } from "../modules/messages/events.js";

export class BotRuntime {
  constructor({ client, config, scheduler, logger, identity = {}, services = {} }) {
    Object.assign(this, { client, config, scheduler, logger, identity, services });
    this.startedAt = Date.now();
    this.queue = new TaskQueue({ concurrency: 6, capacity: 100 });
  }
  async start() {
    const botId = String(this.client.botId);
    const permissions = createPermissionService({
      botId,
      mainBotId: this.identity.mainBotId || botId,
      ownerIds: [
        ...(this.config.leaders[botId] || []),
        ...(this.config.admins[this.identity.mainBotId || botId] || []),
        ...(this.identity.ownerIds || []),
      ],
      adminIds: this.config.admins[botId] || [],
    });
    const registry = new CommandRegistry();
    registerSystemCommands(registry, { startedAt: this.startedAt, scheduler: this.scheduler });
    registerBotManagerCommands(registry, { fleet: this.services.fleet, identity: this.identity });
    this.dispatcher = new CommandDispatcher({ prefix: this.config.prefix, registry, permissions, logger: this.logger });
    this.events = new EventBus(this.logger);
    this.disposeMessageEvents = registerMessageEvents(this.events, {
      dispatcher: this.dispatcher,
      client: this.client,
      logger: this.logger,
    });

    this.client.on("error", (error) => this.logger.error("Listener Zalo gặp lỗi", { error: error.message }));
    this.client.on("message", (message) => {
      const accepted = this.queue.add(() => this.events.emit("message", { message, runtime: this }));
      if (!accepted) this.logger.warn("Bỏ tin nhắn vì hàng đợi đã đầy");
    });
    for (const event of ["group_event", "reaction", "undo", "typing"]) {
      this.client.on(event, (payload) => {
        const accepted = this.queue.add(() => this.events.emit(event, { [event]: payload, runtime: this }));
        if (!accepted) this.logger.warn("Bỏ event vì hàng đợi đã đầy", { event });
      });
    }
    this.client.listen();
    this.logger.info("NGH Bot v2 đã sẵn sàng", { botId, commands: registry.list().length });
  }
  async stop() { this.disposeMessageEvents?.(); await this.client.stop(); }
}
