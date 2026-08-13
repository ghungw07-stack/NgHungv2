import { BotRuntime } from "./bot-runtime.js";
import { ZaloClient } from "../infrastructure/zalo/zalo-client.js";

function canRunChild(bot) {
  return bot?.status === "active" && (bot.timeRemaining === -1 || Number(bot.timeRemaining) > 0);
}

export class BotFleet {
  #bots = new Map();
  constructor({ config, scheduler, logger }) {
    Object.assign(this, { config, scheduler, logger });
  }

  async #startBot(botConfig, identity) {
    const label = identity.isMain ? "main" : `child:${identity.ownerId}`;
    const logger = this.logger.child({ bot: label });
    const client = new ZaloClient(botConfig, logger);
    await client.start();
    const runtime = new BotRuntime({ client, config: this.config, scheduler: this.scheduler, logger, identity });
    await runtime.start();
    this.#bots.set(String(client.botId), { client, runtime, identity });
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
  list() { return [...this.#bots.values()]; }
  async stopBot(botId) {
    const bot = this.get(botId);
    if (!bot) return false;
    await bot.runtime.stop();
    this.#bots.delete(String(botId));
    return true;
  }
  async stop() {
    for (const bot of [...this.#bots.values()].reverse()) await bot.runtime.stop();
    this.#bots.clear();
  }
}
