const RETENTION_MS = 24 * 60 * 60_000;

export class MessageArchiveRepository {
  constructor({ database, botId }) {
    this.collection = database.collection("v2_message_archive");
    this.botId = String(botId);
  }
  async start() {
    await Promise.all([
      this.collection.createIndex({ botId: 1, threadId: 1, messageId: 1 }, { unique: true }),
      this.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ]);
  }
  async save(message) {
    if (message?.isSelf || message?.type !== 1) return;
    const messageId = message.data?.msgId ?? message.data?.globalMsgId;
    if (!messageId) return;
    const content = message.data?.content;
    const text = typeof content === "string" ? content.slice(0, 4_000) : String(content?.title || content?.caption || "").slice(0, 1_000);
    await this.collection.updateOne(
      { botId: this.botId, threadId: String(message.threadId), messageId: String(messageId) },
      { $setOnInsert: {
        senderId: String(message.data?.uidFrom || ""), senderName: String(message.data?.dName || ""),
        msgType: String(message.data?.msgType || ""), text,
        mediaUrl: typeof content === "object" ? String(content?.href || content?.normalUrl || "").slice(0, 2_000) : "",
        createdAt: new Date(), expiresAt: new Date(Date.now() + RETENTION_MS),
      } },
      { upsert: true },
    );
  }
  async find(threadId, messageId) {
    if (!messageId) return null;
    return this.collection.findOne({ botId: this.botId, threadId: String(threadId), messageId: String(messageId) });
  }
  async topActivity(threadId, limit = 10) {
    return this.collection.aggregate([
      { $match: { botId: this.botId, threadId: String(threadId) } },
      { $group: { _id: "$senderId", name: { $last: "$senderName" }, messages: { $sum: 1 } } },
      { $sort: { messages: -1 } }, { $limit: Math.min(20, limit) },
    ]).toArray();
  }
}
