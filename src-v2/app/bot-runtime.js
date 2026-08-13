import { CommandDispatcher } from "../core/commands/dispatcher.js";
import { CommandRegistry } from "../core/commands/registry.js";
import { createPermissionService } from "../core/permissions.js";
import { TaskQueue } from "../core/task-queue.js";
import { registerSystemCommands } from "../modules/system/commands.js";
import { registerBotManagerCommands } from "../modules/bot-manager/commands.js";
import { EventBus } from "../core/events/event-bus.js";
import { registerMessageEvents } from "../modules/messages/events.js";
import { GroupSettingsRepository } from "../modules/group-settings/repository.js";
import { registerGroupSettingsCommands } from "../modules/group-settings/commands.js";
import { GroupService } from "../modules/groups/service.js";
import { registerGroupCommands } from "../modules/groups/commands.js";
import { Permission } from "../core/permissions.js";

export class BotRuntime {
  constructor({ client, config, scheduler, logger, identity = {}, services = {} }) {
    Object.assign(this, { client, config, scheduler, logger, identity, services });
    this.startedAt = Date.now();
    this.queue = new TaskQueue({ concurrency: 6, capacity: 100 });
  }
  async start() {
    const botId = String(this.client.botId);
    const basePermissions = createPermissionService({
      botId,
      mainBotId: this.identity.mainBotId || botId,
      ownerIds: [
        ...(this.config.leaders[botId] || []),
        ...(this.config.admins[this.identity.mainBotId || botId] || []),
        ...(this.identity.ownerIds || []),
      ],
      adminIds: this.config.admins[botId] || [],
    });
    this.groups = new GroupService(this.client);
    const permissions = {
      allows: async (permission, userId, context) => {
        if (basePermissions.allows(permission, userId)) return true;
        return permission === Permission.ADMIN && context?.type === 1
          ? this.groups.isAdmin(context.threadId, userId).catch(() => false)
          : false;
      },
    };
    const registry = new CommandRegistry();
    this.groupSettings = new GroupSettingsRepository({
      database: this.services.database,
      botId,
      legacySettings: this.config.groupSettings,
      defaultPrefix: this.config.prefix,
    });
    await this.groupSettings.start();
    registerSystemCommands(registry, { startedAt: this.startedAt, scheduler: this.scheduler });
    registerBotManagerCommands(registry, { fleet: this.services.fleet, identity: this.identity });
    registerGroupSettingsCommands(registry, { repository: this.groupSettings });
    registerGroupCommands(registry, { groups: this.groups, client: this.client });
    this.dispatcher = new CommandDispatcher({
      prefix: this.config.prefix,
      prefixResolver: ({ threadId }) => this.groupSettings.getPrefix(threadId),
      registry,
      permissions,
      logger: this.logger,
    });
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
  async stop() {
    this.disposeMessageEvents?.();
    this.groupSettings?.clear();
    this.groups?.clear();
    await this.client.stop();
  }
}
