import { Decimal128 } from "mongodb";
import Big from "big.js";
import crypto from "node:crypto";

const decimal = (value) => Decimal128.fromString(new Big(value || 0).toFixed());
const string = (value) => value?.toString?.() || "0";

export class PlayerRepository {
  constructor({ database, botId, dailyReward = "100000000" }) {
    this.players = database.collection("v2_players");
    this.transactions = database.collection("v2_game_transactions");
    this.legacyPlayers = database.collection("players_zalo");
    this.botId = String(botId);
    this.dailyReward = String(dailyReward);
  }
  async start() {
    await Promise.all([
      this.players.createIndex({ botId: 1, userId: 1 }, { unique: true }),
      this.players.createIndex({ botId: 1, balance: -1 }),
      this.transactions.createIndex({ botId: 1, userId: 1, createdAt: -1 }),
      this.transactions.createIndex({ reference: 1 }, { unique: true }),
    ]);
  }
  async ensure(userId, name = "") {
    userId = String(userId);
    let player = await this.players.findOne({ botId: this.botId, userId });
    if (player) return player;
    const legacy = await this.legacyPlayers.findOne({ idUserZalo: userId });
    const initial = legacy?.balance ?? "10000";
    await this.players.updateOne(
      { botId: this.botId, userId },
      { $setOnInsert: {
        botId: this.botId, userId, name: name || legacy?.name || userId,
        balance: decimal(initial), rankPoints: Number(legacy?.rankPoints || 0),
        migratedFromLegacy: Boolean(legacy), createdAt: new Date(),
      } },
      { upsert: true }
    );
    return this.players.findOne({ botId: this.botId, userId });
  }
  async balance(userId, name) { return string((await this.ensure(userId, name)).balance); }
  async claimDaily(userId, name, dateKey) {
    await this.ensure(userId, name);
    const result = await this.players.findOneAndUpdate(
      { botId: this.botId, userId: String(userId), dailyDate: { $ne: dateKey } },
      { $inc: { balance: decimal(this.dailyReward) }, $set: { dailyDate: dateKey, name, updatedAt: new Date() } },
      { returnDocument: "after" }
    );
    if (!result) return { claimed: false };
    await this.#record(userId, "daily", this.dailyReward, { dateKey });
    return { claimed: true, reward: this.dailyReward, balance: string(result.balance) };
  }
  async transfer(fromId, toId, amount, metadata = {}) {
    fromId = String(fromId); toId = String(toId);
    if (fromId === toId) throw new Error("Không thể chuyển tiền cho chính mình");
    const value = new Big(amount).round(0, Big.roundDown);
    if (value.lte(0)) throw new Error("Số tiền phải lớn hơn 0");
    await Promise.all([this.ensure(fromId, metadata.fromName), this.ensure(toId, metadata.toName)]);
    const debit = await this.players.updateOne(
      { botId: this.botId, userId: fromId, balance: { $gte: decimal(value) } },
      { $inc: { balance: decimal(value.times(-1)) }, $set: { updatedAt: new Date() } }
    );
    if (!debit.modifiedCount) throw new Error("Số dư không đủ");
    try {
      await this.players.updateOne(
        { botId: this.botId, userId: toId },
        { $inc: { balance: decimal(value) }, $set: { updatedAt: new Date() } }
      );
    } catch (error) {
      await this.players.updateOne({ botId: this.botId, userId: fromId }, { $inc: { balance: decimal(value) } });
      throw error;
    }
    const reference = `${Date.now()}-${crypto.randomUUID()}`;
    await Promise.all([
      this.#record(fromId, "transfer_out", value.times(-1).toFixed(0), { ...metadata, toId, reference }),
      this.#record(toId, "transfer_in", value.toFixed(0), { ...metadata, fromId, reference }),
    ]);
    return { reference, amount: value.toFixed(0), fromBalance: await this.balance(fromId) };
  }
  async top(limit = 10) {
    return this.players.find({ botId: this.botId }).sort({ balance: -1 }).limit(Math.min(20, limit)).toArray();
  }
  async history(userId, limit = 10) {
    return this.transactions.find({ botId: this.botId, userId: String(userId) }).sort({ createdAt: -1 }).limit(limit).toArray();
  }
  async debit(userId, amount, metadata = {}) {
    const value = new Big(amount).round(0, Big.roundDown);
    if (value.lte(0)) throw new Error("Số tiền phải lớn hơn 0");
    await this.ensure(userId, metadata.name);
    const result = await this.players.updateOne(
      { botId: this.botId, userId: String(userId), balance: { $gte: decimal(value) } },
      { $inc: { balance: decimal(value.times(-1)) }, $set: { updatedAt: new Date() } }
    );
    if (!result.modifiedCount) throw new Error("Số dư không đủ");
    return value.toFixed(0);
  }
  async creditOnce(userId, amount, reference, metadata = {}) {
    const value = new Big(amount).round(0, Big.roundDown);
    if (value.lte(0)) return false;
    await this.ensure(userId, metadata.name);
    const result = await this.players.updateOne(
      { botId: this.botId, userId: String(userId), creditedRefs: { $ne: reference } },
      { $inc: { balance: decimal(value) }, $push: { creditedRefs: { $each: [reference], $slice: -200 } }, $set: { updatedAt: new Date() } }
    );
    if (result.modifiedCount) await this.#record(userId, "game_payout", value.toFixed(0), { ...metadata, reference });
    return Boolean(result.modifiedCount);
  }
  async #record(userId, type, amount, metadata = {}) {
    await this.transactions.insertOne({
      botId: this.botId, userId: String(userId), type, amount: decimal(amount),
      reference: metadata.reference ? `${metadata.reference}:${type}` : `${Date.now()}-${crypto.randomUUID()}`,
      metadata, createdAt: new Date(),
    });
  }
}
