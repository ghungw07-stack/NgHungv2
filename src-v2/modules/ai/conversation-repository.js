const RETENTION_MS = 7 * 24 * 60 * 60_000;

export class ConversationRepository {
  constructor({ database, maxMessages = 20 }) {
    this.collection = database.collection("v2_ai_conversations");
    this.maxMessages = maxMessages;
  }

  async start() {
    await Promise.all([
      this.collection.createIndex(
        { botId: 1, threadId: 1, userId: 1 },
        { unique: true, name: "conversation_scope" },
      ),
      this.collection.createIndex(
        { expiresAt: 1 },
        { expireAfterSeconds: 0, name: "conversation_expiry" },
      ),
    ]);
  }

  scope({ botId, threadId, userId }) {
    return { botId: String(botId), threadId: String(threadId), userId: String(userId) };
  }

  async history(scope) {
    const document = await this.collection.findOne(this.scope(scope), { projection: { messages: 1 } });
    return document?.messages || [];
  }

  async append(scope, messages) {
    const values = (Array.isArray(messages) ? messages : [messages]).map(({ role, text }) => ({
      role: role === "assistant" ? "assistant" : "user",
      text: String(text).slice(0, 12_000),
      createdAt: new Date(),
    }));
    await this.collection.updateOne(this.scope(scope), {
      $push: { messages: { $each: values, $slice: -this.maxMessages } },
      $set: { expiresAt: new Date(Date.now() + RETENTION_MS), updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() },
    }, { upsert: true });
  }

  async reset(scope) {
    const result = await this.collection.deleteOne(this.scope(scope));
    return result.deletedCount > 0;
  }
}
