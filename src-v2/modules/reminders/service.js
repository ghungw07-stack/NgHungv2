export function parseDuration(value) {
  const match = String(value || "").trim().toLowerCase().match(/^(\d+)(s|m|h|d)$/);
  if (!match) return null;
  const units = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  const duration = Number(match[1]) * units[match[2]];
  return duration >= 10_000 && duration <= 30 * 86_400_000 ? duration : null;
}

export class ReminderService {
  #running = false;
  constructor({ database, client, scheduler, botId, logger }) {
    Object.assign(this, { client, scheduler, logger });
    this.botId = String(botId);
    this.collection = database.collection("v2_reminders");
    this.jobName = `reminders:${this.botId}`;
  }
  async start() {
    await Promise.all([
      this.collection.createIndex({ botId: 1, status: 1, dueAt: 1 }),
      this.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ]);
    this.cancelJob = this.scheduler.every(this.jobName, 10_000, () => this.processDue());
  }
  async create({ userId, threadId, type, text, durationMs }) {
    const dueAt = new Date(Date.now() + durationMs);
    const result = await this.collection.insertOne({
      botId: this.botId, userId: String(userId), threadId: String(threadId), type: Number(type),
      text: String(text).slice(0, 2_000), dueAt, status: "pending", createdAt: new Date(),
      expiresAt: new Date(dueAt.getTime() + 7 * 86_400_000),
    });
    return { id: String(result.insertedId), dueAt };
  }
  async list(userId, limit = 10) {
    return this.collection.find({ botId: this.botId, userId: String(userId), status: "pending" }).sort({ dueAt: 1 }).limit(limit).toArray();
  }
  async cancel(userId, id) {
    const { ObjectId } = await import("mongodb");
    if (!ObjectId.isValid(id)) return false;
    const result = await this.collection.updateOne(
      { _id: new ObjectId(id), botId: this.botId, userId: String(userId), status: "pending" },
      { $set: { status: "cancelled", cancelledAt: new Date() } },
    );
    return result.modifiedCount > 0;
  }
  async processDue(now = new Date()) {
    if (this.#running) return;
    this.#running = true;
    try {
      for (let count = 0; count < 20; count++) {
        const reminder = await this.collection.findOneAndUpdate(
          { botId: this.botId, status: "pending", dueAt: { $lte: now } },
          { $set: { status: "sending", sendingAt: now } },
          { sort: { dueAt: 1 }, returnDocument: "after" },
        );
        if (!reminder) break;
        try {
          await this.client.sendText(reminder.threadId, reminder.type, `⏰ Nhắc ${reminder.userId}: ${reminder.text}`);
          await this.collection.updateOne({ _id: reminder._id }, { $set: { status: "sent", sentAt: new Date() } });
        } catch (error) {
          await this.collection.updateOne({ _id: reminder._id }, { $set: { status: "failed", error: String(error.message).slice(0, 300) } });
          this.logger.warn("Không gửi được reminder", { error: error.message });
        }
      }
    } finally { this.#running = false; }
  }
  stop() { this.cancelJob?.(); }
}
