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
import { ModerationService } from "../modules/moderation/service.js";
import { registerModerationEvents } from "../modules/moderation/events.js";
import { registerModerationCommands } from "../modules/moderation/commands.js";
import { registerMediaCommands } from "../modules/media/commands.js";
import { registerUtilityCommands } from "../modules/utilities/commands.js";
import { registerContentCommands } from "../modules/content/commands.js";
import { PlayerRepository } from "../modules/game/economy/player-repository.js";
import { registerEconomyCommands } from "../modules/game/economy/commands.js";
import { BigGameEngine } from "../modules/game/big-game/engine.js";
import { registerBigGameCommands } from "../modules/game/big-game/commands.js";
import { GameSessionRepository } from "../modules/game/mini-game/session-repository.js";
import { registerMiniGameCommands } from "../modules/game/mini-game/commands.js";
import { XiDachGame, registerXiDachCommand } from "../modules/game/card-game/xidach.js";
import { ConversationRepository } from "../modules/ai/conversation-repository.js";
import { registerAiCommands } from "../modules/ai/commands.js";
import { AutoJoinService } from "../modules/autojoin/service.js";
import { registerAutoJoinEvents } from "../modules/autojoin/events.js";
import { registerAutoJoinCommands } from "../modules/autojoin/commands.js";
import { registerGroupEventCommands } from "../modules/group-events/commands.js";
import { registerGroupEvents } from "../modules/group-events/events.js";
import { registerSourceUpdateCommand } from "../modules/source-update/commands.js";
import { registerCommandManagerCommands } from "../modules/command-manager/commands.js";
import { registerMessageActionCommands } from "../modules/message-actions/commands.js";

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
    this.players = new PlayerRepository({
      database: this.services.database,
      botId,
      dailyReward: this.config.game?.dailyReward || "100000000",
    });
    await this.players.start();
    this.bigGames = new BigGameEngine({
      database: this.services.database,
      players: this.players,
      scheduler: this.scheduler,
      botId,
      logger: this.logger,
    });
    await this.bigGames.start();
    this.gameSessions = new GameSessionRepository({ database: this.services.database, botId });
    await this.gameSessions.start();
    this.aiConversations = new ConversationRepository({ database: this.services.database });
    await this.aiConversations.start();
    this.xiDach = new XiDachGame({ sessions: this.gameSessions, players: this.players, scheduler: this.scheduler, botId });
    this.xiDach.start();
    registerSystemCommands(registry, { startedAt: this.startedAt, scheduler: this.scheduler });
    registerBotManagerCommands(registry, { fleet: this.services.fleet, identity: this.identity });
    registerGroupSettingsCommands(registry, { repository: this.groupSettings });
    registerGroupCommands(registry, { groups: this.groups, client: this.client });
    registerModerationCommands(registry, { repository: this.groupSettings });
    registerMediaCommands(registry, { media: this.services.media, client: this.client });
    registerUtilityCommands(registry, { client: this.client });
    registerContentCommands(registry, this.services.content);
    registerEconomyCommands(registry, { players: this.players });
    registerBigGameCommands(registry, { engine: this.bigGames, players: this.players });
    registerMiniGameCommands(registry, { sessions: this.gameSessions, players: this.players });
    registerXiDachCommand(registry, { game: this.xiDach, sessions: this.gameSessions, players: this.players });
    registerAiCommands(registry, { gateway: this.services.ai, conversations: this.aiConversations, botId });
    registerAutoJoinCommands(registry, { settings: this.groupSettings });
    registerGroupEventCommands(registry, { settings: this.groupSettings });
    registerSourceUpdateCommand(registry, { updater: this.services.sourceUpdater, identity: this.identity });
    registerCommandManagerCommands(registry, { settings: this.groupSettings });
    registerMessageActionCommands(registry, { client: this.client, groups: this.groups });
    this.dispatcher = new CommandDispatcher({
      prefix: this.config.prefix,
      prefixResolver: ({ threadId }) => this.groupSettings.getPrefix(threadId),
      commandEnabledResolver: async (commandName, { threadId }) => {
        const settings = await this.groupSettings.get(threadId);
        return !(settings.disabledCommands || []).includes(commandName);
      },
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
    this.autoJoin = new AutoJoinService({
      database: this.services.database,
      client: this.client,
      scheduler: this.scheduler,
      botId,
      logger: this.logger,
    });
    await this.autoJoin.start();
    registerAutoJoinEvents(this.events, { service: this.autoJoin, settings: this.groupSettings });
    registerGroupEvents(this.events, { client: this.client, settings: this.groupSettings });
    this.moderation = new ModerationService({
      repository: this.groupSettings,
      client: this.client,
      groups: this.groups,
      logger: this.logger,
      isPrivileged: async (userId, threadId) =>
        basePermissions.isAdmin(userId) || this.groups.isAdmin(threadId, userId).catch(() => false),
    });
    registerModerationEvents(this.events, this.moderation);

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
    this.moderation?.clear();
    this.bigGames?.stop();
    this.xiDach?.stop();
    this.autoJoin?.stop();
    await this.client.stop();
  }
}
