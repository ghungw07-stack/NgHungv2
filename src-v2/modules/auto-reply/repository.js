export class AutoReplyRepository {
  constructor({ database, botId }) { this.collection = database.collection("v2_auto_replies"); this.botId = String(botId); }
  async start() { await this.collection.createIndex({ botId: 1, threadId: 1, trigger: 1 }, { unique: true }); }
  normalize(value) { return String(value || "").trim().toLowerCase().replace(/\s+/gu, " ").slice(0, 300); }
  async set(threadId, trigger, response, authorId) {
    trigger = this.normalize(trigger); response = String(response || "").trim().slice(0, 2_000);
    if (!trigger || !response) throw new Error("Trigger và câu trả lời không được trống");
    await this.collection.updateOne({ botId: this.botId, threadId: String(threadId), trigger }, { $set: { response, authorId: String(authorId), updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
  }
  async remove(threadId, trigger) { return Boolean((await this.collection.deleteOne({ botId: this.botId, threadId: String(threadId), trigger: this.normalize(trigger) })).deletedCount); }
  async find(threadId, content) { return this.collection.findOne({ botId: this.botId, threadId: String(threadId), trigger: this.normalize(content) }); }
  async list(threadId, limit = 30) { return this.collection.find({ botId: this.botId, threadId: String(threadId) }).sort({ updatedAt: -1 }).limit(limit).toArray(); }
}
