import { BotRuntime } from "./bot-runtime.js";
import { ZaloClient } from "../infrastructure/zalo/zalo-client.js";

function canRunChild(bot) {
  return bot?.status === "active" && (bot.timeRemaining === -1 || Number(bot.timeRemaining) > 0);
}

export class BotFleet {
  #bots = new Map();
  #owners = new Map();
  constructor({ config, scheduler, database, media, logger }) {
    Object.assign(this, { config, scheduler, database, media, logger });
  }

  async #startBot(botConfig, identity) {
    const label = identity.isMain ? "main" : `child:${identity.ownerId}`;
    const logger = this.logger.child({ bot: label });
    const client = new ZaloClient(botConfig, logger);
    await client.start();
    const runtime = new BotRuntime({
      client,
      config: this.config,
      scheduler: this.scheduler,
      logger,
      identity,
      services: { fleet: this, database: this.database, media: this.media },
    });
    await runtime.start();
    this.#bots.set(String(client.botId), { client, runtime, identity });
    if (identity.ownerId) this.#owners.set(String(identity.ownerId), String(client.botId));
    return { client, runtime };
  }

  async start() {
    const main = await this.#startBot(this.config.bot, { isMain: true });
    const mainBotId = String(main.client.botId);
    const children = Object.entries(this.config.childBots).filter(([, bot]) => canRunChild(bot));
    const failures = [];

    // Khởi động tuần tự để không tạo đỉnh RAM/CPU do nhiều phiên Zalo login cùng lúc.
    for (const [ownerId, botConfig] of children) {
      try {
        await this.#startBot(botConfig, { isMain: false, mainBotId, ownerId, ownerIds: [ownerId] });
      } catch (error) {
        failures.push({ ownerId, reason: error.message });
        this.logger.error("Bot con khởi động thất bại", { ownerId, error: error.message });
      }
    }
    this.logger.info("Fleet đã khởi động", { total: this.#bots.size, failed: failures.length });
    return { total: this.#bots.size, failures };
  }

  get(botId) { return this.#bots.get(String(botId)); }
  getByOwner(ownerId) {
    const botId = this.#owners.get(String(ownerId));
    return botId ? this.get(botId) : undefined;
  }
  list() { return [...this.#bots.values()]; }
  listChildren() {
    return Object.entries(this.config.childBots).map(([ownerId, config], index) => ({
      index: index + 1,
      ownerId,
      name: config.nameBot || config.infoOwner?.name || ownerId,
      status: this.getByOwner(ownerId) ? "online" : config.status || "inactive",
      timeRemaining: config.timeRemaining,
    }));
  }
  resolveOwner(selector) {
    if (this.config.childBots[String(selector)]) return String(selector);
    const index = Number(selector) - 1;
    return Number.isInteger(index) && index >= 0 ? Object.keys(this.config.childBots)[index] : undefined;
  }
  async startChild(ownerId) {
    ownerId = String(ownerId);
    if (this.getByOwner(ownerId)) return { started: false, reason: "Bot đang chạy" };
    const botConfig = this.config.childBots[ownerId];
    if (!botConfig) return { started: false, reason: "Không tìm thấy bot" };
    if (!(botConfig.timeRemaining === -1 || Number(botConfig.timeRemaining) > 0)) {
      return { started: false, reason: "Bot đã hết hạn" };
    }
    const main = this.list().find((bot) => bot.identity.isMain);
    const result = await this.#startBot(botConfig, {
      isMain: false,
      mainBotId: String(main.client.botId),
      ownerId,
      ownerIds: [ownerId],
    });
    return { started: true, botId: String(result.client.botId) };
  }
  async stopChild(ownerId) {
    const bot = this.getByOwner(ownerId);
    if (!bot) return false;
    return this.stopBot(bot.client.botId);
  }
  async stopBot(botId) {
    const bot = this.get(botId);
    if (!bot) return false;
    await bot.runtime.stop();
    this.#bots.delete(String(botId));
    if (bot.identity.ownerId) this.#owners.delete(String(bot.identity.ownerId));
    return true;
  }
  async stop() {
    for (const bot of [...this.#bots.values()].reverse()) await bot.runtime.stop();
    this.#bots.clear();
    this.#owners.clear();
  }
}
