import crypto from "node:crypto";
import { Decimal128, ObjectId } from "mongodb";
import Big from "big.js";
import { BIG_GAMES } from "./definitions.js";

const decimal = (value) => Decimal128.fromString(new Big(value).toFixed(0));

export class BigGameEngine {
  constructor({ database, players, scheduler, botId, logger, roundMs = 60_000 }) {
    this.rounds = database.collection("v2_game_rounds");
    this.bets = database.collection("v2_game_bets");
    Object.assign(this, { players, scheduler, botId: String(botId), logger, roundMs });
  }
  async start() {
    await Promise.all([
      this.rounds.createIndex(
        { botId: 1, game: 1, status: 1 },
        { unique: true, partialFilterExpression: { status: "open" } }
      ),
      this.rounds.createIndex({ closesAt: 1, status: 1 }),
      this.bets.createIndex({ roundId: 1, userId: 1 }),
    ]);
    this.scheduler.every(`big-game:${this.botId}`, 1_000, () => this.settleDue());
  }
  stop() { this.scheduler.cancel(`big-game:${this.botId}`); }
  async current(game) { return this.rounds.findOne({ botId: this.botId, game, status: "open" }); }
  async #open(game) {
    const existing = await this.current(game);
    if (existing) return existing;
    const serverSeed = crypto.randomBytes(32).toString("hex");
    const document = {
      botId: this.botId, game, status: "open", serverSeed,
      commitment: crypto.createHash("sha256").update(serverSeed).digest("hex"),
      createdAt: new Date(), closesAt: new Date(Date.now() + this.roundMs),
    };
    try { const result = await this.rounds.insertOne(document); return { ...document, _id: result.insertedId }; }
    catch (error) { if (error.code === 11000) return this.current(game); throw error; }
  }
  async bet({ game, userId, userName, selection, amount }) {
    const definition = BIG_GAMES[game];
    if (!definition) throw new Error("Game không tồn tại");
    selection = String(selection || "").toLowerCase();
    if (!definition.selections.includes(selection)) throw new Error(`Cửa cược hợp lệ: ${definition.selections.join(", ")}`);
    const round = await this.#open(game);
    const remainingMs = round.closesAt.getTime() - Date.now();
    if (remainingMs < 3_000) throw new Error("Vòng cược sắp đóng, hãy chờ vòng mới");
    const stake = await this.players.debit(userId, amount, { name: userName, game });
    try {
      await this.bets.insertOne({
        roundId: round._id, botId: this.botId, game, userId: String(userId), userName,
        selection, stake: decimal(stake), status: "pending", createdAt: new Date(),
      });
    } catch (error) {
      await this.players.creditOnce(userId, stake, `refund:${crypto.randomUUID()}`, { reason: "bet_insert_failed" });
      throw error;
    }
    return { roundId: String(round._id), stake, selection, remainingSeconds: Math.ceil(remainingMs / 1000), commitment: round.commitment };
  }
  async settleDue(now = new Date()) {
    const due = await this.rounds.find({
      botId: this.botId,
      $or: [{ status: "open", closesAt: { $lte: now } }, { status: "settling" }],
    }).toArray();
    for (const round of due) await this.settle(round._id);
  }
  async settle(roundId) {
    if (typeof roundId === "string") roundId = new ObjectId(roundId);
    let claimed = await this.rounds.findOneAndUpdate(
      { _id: roundId, status: "open" }, { $set: { status: "settling", settlingAt: new Date() } }, { returnDocument: "after" }
    );
    if (!claimed) claimed = await this.rounds.findOne({ _id: roundId, status: "settling" });
    if (!claimed) return null;
    const definition = BIG_GAMES[claimed.game];
    const bytes = crypto.createHmac("sha256", claimed.serverSeed).update(String(claimed._id)).digest();
    const result = definition.roll(bytes);
    const bets = await this.bets.find({ roundId: claimed._id, status: "pending" }).toArray();
    for (const bet of bets) {
      const multiplier = definition.multiplier(bet.selection, result);
      const payout = new Big(bet.stake.toString()).times(multiplier).toFixed(0);
      if (multiplier > 0) await this.players.creditOnce(bet.userId, payout, `round:${claimed._id}:bet:${bet._id}`, { game: claimed.game });
      await this.bets.updateOne({ _id: bet._id, status: "pending" }, { $set: { status: multiplier ? "won" : "lost", payout: decimal(payout), settledAt: new Date() } });
    }
    await this.rounds.updateOne(
      { _id: claimed._id },
      { $set: { status: "settled", result, resultText: definition.describe(result), settledAt: new Date() } }
    );
    return { ...result, text: definition.describe(result), serverSeed: claimed.serverSeed, commitment: claimed.commitment };
  }
}
