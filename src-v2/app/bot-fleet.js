import { BotRuntime } from "./bot-runtime.js";
import { ZaloClient } from "../infrastructure/zalo/zalo-client.js";

function remainingLease(bot, now = Date.now()) {
  if (bot?.timeRemaining === -1) return -1;
  if (Number(bot?.leaseExpiresAt) > 0) return Math.max(0, Number(bot.leaseExpiresAt) - now);
  return Math.max(0, Number(bot?.timeRemaining) || 0);
}

function canRunChild(bot, now = Date.now()) {
  return bot?.status === "active" && remainingLease(bot, now) !== 0;
}

export class BotFleet {
  #bots = new Map();
  #owners = new Map();
  constructor({ config, scheduler, database, media, content, ai, sourceUpdater, paymentQr, qr, botStore, logger }) {
    Object.assign(this, { config, scheduler, database, media, content, ai, sourceUpdater, paymentQr, qr, botStore, logger });
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
      services: { fleet: this, database: this.database, media: this.media, content: this.content, ai: this.ai, sourceUpdater: this.sourceUpdater, paymentQr: this.paymentQr, qr: this.qr, botStore: this.botStore },
    });
    await runtime.start();
    this.#bots.set(String(client.botId), { client, runtime, identity });
    if (identity.ownerId) this.#owners.set(String(identity.ownerId), String(client.botId));
    return { client, runtime };
  }

  async start() {
    for (const [ownerId, bot] of Object.entries(this.config.childBots)) {
      if (bot.timeRemaining !== -1 && !Number(bot.leaseExpiresAt) && Number(bot.timeRemaining) > 0) {
        await this.botStore.patch(ownerId, { leaseExpiresAt: Date.now() + Number(bot.timeRemaining) });
      }
    }
    const main = await this.#startBot(this.config.bot, { isMain: true });
    const mainBotId = String(main.client.botId);
    const children = Object.entries(this.config.childBots).filter(([, bot]) => canRunChild(bot));
    const failures = [];

    // Khởi động tuần tự để không tạo đỉnh RAM/CPU do nhiều phiên Zalo login cùng lúc.
    for (const [ownerId, botConfig] of children) {
      try {
        await this.#startBot(botConfig, {
          isMain: false, mainBotId, ownerId, ownerIds: [ownerId],
          name: botConfig.nameBot || botConfig.infoOwner?.name,
          notifyParentPM: botConfig.notifyParentPM ?? botConfig.managerData?.notifyParentPM ?? true,
        });
      } catch (error) {
        failures.push({ ownerId, reason: error.message });
        this.logger.error("Bot con khởi động thất bại", { ownerId, error: error.message });
      }
    }
    this.logger.info("Fleet đã khởi động", { total: this.#bots.size, failed: failures.length });
    this.cancelLeaseJob = this.scheduler.every("fleet:leases", 60_000, () => this.enforceLeases());
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
      timeRemaining: remainingLease(config),
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
    if (!remainingLease(botConfig)) {
      return { started: false, reason: "Bot đã hết hạn" };
    }
    const main = this.list().find((bot) => bot.identity.isMain);
    const result = await this.#startBot(botConfig, {
      isMain: false,
      mainBotId: String(main.client.botId),
      ownerId,
      ownerIds: [ownerId],
      name: botConfig.nameBot || botConfig.infoOwner?.name,
      notifyParentPM: botConfig.notifyParentPM ?? botConfig.managerData?.notifyParentPM ?? true,
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
    this.cancelLeaseJob?.();
    for (const bot of [...this.#bots.values()].reverse()) await bot.runtime.stop();
    this.#bots.clear();
    this.#owners.clear();
  }
  async enforceLeases(now = Date.now()) {
    for (const [ownerId, config] of Object.entries(this.config.childBots)) {
      if (remainingLease(config, now) !== 0) continue;
      if (this.getByOwner(ownerId)) await this.stopChild(ownerId);
      if (config.status !== "inactive") await this.botStore.patch(ownerId, { status: "inactive", expiredAt: now });
    }
  }
}

export { remainingLease };
