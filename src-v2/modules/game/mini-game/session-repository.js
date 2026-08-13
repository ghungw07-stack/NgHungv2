export class GameSessionRepository {
  constructor({ database, botId }) {
    this.collection = database.collection("v2_game_sessions");
    this.botId = String(botId);
  }
  async start() {
    await Promise.all([
      this.collection.createIndex(
        { botId: 1, threadId: 1, game: 1, status: 1 },
        { unique: true, partialFilterExpression: { status: "active" } }
      ),
      this.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ]);
  }
  async get(threadId, game) {
    return this.collection.findOne({
      botId: this.botId, threadId: String(threadId), game, status: "active", deadline: { $gt: new Date() },
    });
  }
  async create(threadId, game, data, ttlMs = 10 * 60_000) {
    const document = {
      botId: this.botId, threadId: String(threadId), game, status: "active", data,
      version: 0, createdAt: new Date(), updatedAt: new Date(),
      deadline: new Date(Date.now() + ttlMs), expiresAt: new Date(Date.now() + ttlMs + 7 * 86_400_000),
    };
    try { const result = await this.collection.insertOne(document); return { ...document, _id: result.insertedId }; }
    catch (error) { if (error.code === 11000) throw new Error("Nhóm đang có ván chơi này"); throw error; }
  }
  async update(session, data, ttlMs = 10 * 60_000) {
    const result = await this.collection.findOneAndUpdate(
      { _id: session._id, status: "active", version: session.version },
      { $set: {
        data, updatedAt: new Date(), deadline: new Date(Date.now() + ttlMs),
        expiresAt: new Date(Date.now() + ttlMs + 7 * 86_400_000),
      }, $inc: { version: 1 } },
      { returnDocument: "after" }
    );
    if (!result) throw new Error("Ván đã được người khác cập nhật, hãy thử lại");
    return result;
  }
  async finish(session, status = "finished", extra = {}) {
    const result = await this.collection.updateOne(
      { _id: session._id, status: "active", version: session.version },
      { $set: { status, ...extra, finishedAt: new Date(), expiresAt: new Date(Date.now() + 7 * 86_400_000) }, $inc: { version: 1 } }
    );
    return Boolean(result.modifiedCount);
  }
  async expired(game, now = new Date()) {
    return this.collection.find({ botId: this.botId, game, status: "active", deadline: { $lte: now } }).toArray();
  }
}
