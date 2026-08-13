import { CommandDispatcher } from "../core/commands/dispatcher.js";
import { CommandRegistry } from "../core/commands/registry.js";
import { createPermissionService } from "../core/permissions.js";
import { TaskQueue } from "../core/task-queue.js";
import { registerSystemCommands } from "../modules/system/commands.js";

function messageContent(message) {
  return typeof message?.data?.content === "string" ? message.data.content.trim() : "";
}

export class BotRuntime {
  constructor({ client, config, scheduler, logger, identity = {} }) {
    Object.assign(this, { client, config, scheduler, logger, identity });
    this.startedAt = Date.now();
    this.queue = new TaskQueue({ concurrency: 6, capacity: 100 });
  }
  async start() {
    const botId = String(this.client.botId);
    const permissions = createPermissionService({
      botId,
      mainBotId: this.identity.mainBotId || botId,
      ownerIds: [...(this.config.leaders[botId] || []), ...(this.identity.ownerIds || [])],
      adminIds: this.config.admins[botId] || [],
    });
    const registry = new CommandRegistry();
    registerSystemCommands(registry, { startedAt: this.startedAt, scheduler: this.scheduler });
    this.dispatcher = new CommandDispatcher({ prefix: this.config.prefix, registry, permissions, logger: this.logger });

    this.client.on("error", (error) => this.logger.error("Listener Zalo gặp lỗi", { error: error.message }));
    this.client.on("message", (message) => {
      const accepted = this.queue.add(() => this.#handleMessage(message));
      if (!accepted) this.logger.warn("Bỏ tin nhắn vì hàng đợi đã đầy");
    });
    this.client.listen();
    this.logger.info("NGH Bot v2 đã sẵn sàng", { botId, commands: registry.list().length });
  }
  async #handleMessage(message) {
    if (message?.isSelf) return;
    const content = messageContent(message);
    if (!content) return;
    await this.dispatcher.dispatch({
      api: this.client.api,
      message,
      content,
      senderId: String(message.data.uidFrom),
      threadId: String(message.threadId),
      type: message.type,
      reply: (text) => this.client.sendText(message.threadId, message.type, text),
    });
  }
  async stop() { await this.client.stop(); }
}
