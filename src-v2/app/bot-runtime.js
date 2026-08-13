import { CommandDispatcher } from "../core/commands/dispatcher.js";
import { CommandRegistry } from "../core/commands/registry.js";
import { createPermissionService } from "../core/permissions.js";
import { TaskQueue } from "../core/task-queue.js";
import { EventBus } from "../core/events/event-bus.js";
import { registerMessageEvents } from "../modules/messages/events.js";
import { GroupSettingsRepository } from "../modules/group-settings/repository.js";
import { GroupService } from "../modules/groups/service.js";
import { Permission } from "../core/permissions.js";
import { ModerationService } from "../modules/moderation/service.js";
import { registerModerationEvents } from "../modules/moderation/events.js";
import { PlayerRepository } from "../modules/game/economy/player-repository.js";
import { BigGameEngine } from "../modules/game/big-game/engine.js";
import { GameSessionRepository } from "../modules/game/mini-game/session-repository.js";
import { XiDachGame } from "../modules/game/card-game/xidach.js";
import { ConversationRepository } from "../modules/ai/conversation-repository.js";
import { AutoJoinService } from "../modules/autojoin/service.js";
import { registerAutoJoinEvents } from "../modules/autojoin/events.js";
import { registerGroupEvents } from "../modules/group-events/events.js";
import { ParentRelayService } from "../modules/parent-relay/service.js";
import { registerParentRelayEvents } from "../modules/parent-relay/events.js";
import { MessageArchiveRepository } from "../modules/message-archive/repository.js";
import { registerMessageArchiveEvents } from "../modules/message-archive/events.js";
import { ReminderService } from "../modules/reminders/service.js";
import { LegacyMigration } from "../modules/migrations/legacy-migration.js";
import { registerRuntimeCommands } from "./register-commands.js";
import { BankAccountRepository } from "../modules/banking/repository.js";
import { AutoReplyRepository } from "../modules/auto-reply/repository.js";
import { registerAutoReplyEvents } from "../modules/auto-reply/events.js";

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
        ...(this.identity.ownerIds || []),
      ],
      adminIds: [],
    });
    this.groups = new GroupService(this.client);
    const permissions = {
      allows: async (permission, userId, context) => {
        if (basePermissions.allows(permission, userId) || this.services.adminStore?.isAdmin(botId, userId)) return true;
        return permission === Permission.ADMIN && context?.type === 1
          ? this.groups.isAdmin(context.threadId, userId).catch(() => false)
          : false;
      },
    };
    const registry = new CommandRegistry();
    this.migration = new LegacyMigration({
      database: this.services.database, botId,
      groupSettings: this.config.groupSettings,
      logger: this.logger,
    });
    await this.migration.run();
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
    this.messageArchive = new MessageArchiveRepository({ database: this.services.database, botId });
    await this.messageArchive.start();
    this.reminders = new ReminderService({ database: this.services.database, client: this.client, scheduler: this.scheduler, botId, logger: this.logger });
    await this.reminders.start();
    this.bankAccounts = new BankAccountRepository({ database: this.services.database, botId });
    await this.bankAccounts.start();
    this.autoReplies = new AutoReplyRepository({ database: this.services.database, botId });
    await this.autoReplies.start();
    this.xiDach = new XiDachGame({ sessions: this.gameSessions, players: this.players, scheduler: this.scheduler, botId });
    this.xiDach.start();
    registerRuntimeCommands(registry, {
      startedAt: this.startedAt, scheduler: this.scheduler, runtimeStats: () => ({ queue: this.queue.stats }),
      fleet: this.services.fleet, identity: this.identity, groupSettings: this.groupSettings,
      groups: this.groups, client: this.client, media: this.services.media, content: this.services.content,
      players: this.players, bigGames: this.bigGames, gameSessions: this.gameSessions, xiDach: this.xiDach,
      ai: this.services.ai, aiConversations: this.aiConversations, botId,
      sourceUpdater: this.services.sourceUpdater, paymentQr: this.services.paymentQr,
      qr: this.services.qr, reminders: this.reminders,
      messageArchive: this.messageArchive,
      bankAccounts: this.bankAccounts,
      adminStore: this.services.adminStore,
      diagnostics: this.services.diagnostics,
      accessControl: permissions,
      autoReplies: this.autoReplies,
    });
    this.dispatcher = new CommandDispatcher({
      prefix: this.config.prefix,
      prefixResolver: ({ threadId }) => this.groupSettings.getPrefix(threadId),
      commandEnabledResolver: async (commandName, { threadId, senderId, type }) => {
        const settings = await this.groupSettings.get(threadId);
        const globalSettings = await this.groupSettings.get("__global__");
        const protectedCommands = ["bot", "settinggroup", "adminbot", "mybot", "thuebot", "ban", "blockbot", "privatebot"];
        const privileged = basePermissions.isAdmin(senderId)
          || this.services.adminStore?.isAdmin(botId, senderId)
          || (type === 1 && await this.groups.isAdmin(threadId, senderId).catch(() => false));
        if (!privileged && (globalSettings.blockedUsers || []).map(String).includes(String(senderId))) return false;
        if (!privileged && (settings.bannedUsers || []).map(String).includes(String(senderId))) return false;
        if (type === 0 && globalSettings.privateBotEnabled === false && !protectedCommands.includes(commandName)) return false;
        if (settings.botEnabled === false && !protectedCommands.includes(commandName)) return false;
        const resolved = registry.resolve(commandName);
        if (settings.gamesEnabled === false && resolved?.category === "game") return false;
        if ((settings.disabledCommands || []).includes(commandName)) return false;
        if (!this.identity.isMain && this.identity.ownerId) {
          const botConfig = this.services.botStore?.get(this.identity.ownerId) || {};
          const blocked = botConfig.notAllowedCommands || botConfig.notAllowedCommand || botConfig.managerCommand?.notAllowedCommand || [];
          if (blocked.map((value) => String(value).toLowerCase()).includes(commandName)) return false;
        }
        return true;
      },
      registry,
      permissions,
      logger: this.logger,
    });
    this.events = new EventBus(this.logger);
    this.parentRelay = new ParentRelayService({
      client: this.client,
      identity: this.identity,
      enabled: this.identity.notifyParentPM !== false,
      logger: this.logger,
    });
    registerParentRelayEvents(this.events, this.parentRelay);
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
        basePermissions.isAdmin(userId)
        || this.services.adminStore?.isAdmin(botId, userId)
        || (await this.groupSettings.get(threadId)).whitelistedUsers?.map(String).includes(String(userId))
        || this.groups.isAdmin(threadId, userId).catch(() => false),
    });
    registerMessageArchiveEvents(this.events, { archive: this.messageArchive });
    registerModerationEvents(this.events, this.moderation, { archive: this.messageArchive });
    this.disposeAutoReply = registerAutoReplyEvents(this.events, { repository: this.autoReplies, settings: this.groupSettings, client: this.client });

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
    const discarded = this.queue.close();
    if (discarded) this.logger.info("Đã bỏ tác vụ đang chờ khi tắt bot", { discarded });
    this.disposeMessageEvents?.();
    this.disposeAutoReply?.();
    this.groupSettings?.clear();
    this.groups?.clear();
    this.moderation?.clear();
    this.bigGames?.stop();
    this.xiDach?.stop();
    this.autoJoin?.stop();
    this.reminders?.stop();
    await this.client.stop();
    this.events?.clear();
  }
}
