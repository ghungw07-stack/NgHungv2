const JOIN_INTERVAL_MS = 2 * 60_000;
const LINK_PATTERN = /(?:https?:\/\/)?(?:www\.)?(?:zalo\.me\/g\/|zaloapp\.com\/qr\/g\/)([a-z0-9]+)/i;

export function normalizeGroupLink(value) {
  const match = String(value || "").match(LINK_PATTERN);
  return match ? `https://zalo.me/g/${match[1]}` : null;
}

export function isGroupChatLocked(info) {
  const group = info?.data || info?.groupInfo || info;
  const value = group?.setting?.lockSendMsg ?? group?.settings?.lockSendMsg ?? group?.lockSendMsg;
  return value === true || value === 1 || value === "1";
}

export class AutoJoinService {
  constructor({ database, client, scheduler, botId, logger, intervalMs = JOIN_INTERVAL_MS }) {
    Object.assign(this, { client, scheduler, logger, intervalMs });
    this.botId = String(botId);
    this.collection = database.collection("v2_autojoin_queue");
    this.jobName = `autojoin:${this.botId}`;
  }

  async start() {
    await Promise.all([
      this.collection.createIndex({ botId: 1, link: 1 }, { unique: true }),
      this.collection.createIndex({ botId: 1, status: 1, runAt: 1 }),
    ]);
    this.cancelJob = this.scheduler.every(this.jobName, 15_000, () => this.processOne());
  }

  async enqueue(rawLink) {
    const link = normalizeGroupLink(rawLink);
    if (!link) return false;
    const tail = await this.collection.find({ botId: this.botId, status: "queued" })
      .sort({ runAt: -1 }).limit(1).next();
    const now = Date.now();
    const runAt = new Date(Math.max(now + this.intervalMs, Number(tail?.runAt || 0) + this.intervalMs));
    try {
      await this.collection.insertOne({ botId: this.botId, link, status: "queued", queuedAt: new Date(), runAt });
      return true;
    } catch (error) {
      if (error?.code === 11000) return false;
      throw error;
    }
  }

  async processOne(now = new Date()) {
    const item = await this.collection.findOneAndUpdate(
      { botId: this.botId, status: "queued", runAt: { $lte: now } },
      { $set: { status: "processing", startedAt: now } },
      { sort: { runAt: 1 }, returnDocument: "after" },
    );
    if (!item) return false;
    // Dù có nhiều link được ghi đồng thời, nhóm kế tiếp vẫn phải chờ đủ 2 phút.
    await this.collection.updateMany(
      { botId: this.botId, status: "queued" },
      { $max: { runAt: new Date(now.getTime() + this.intervalMs) } },
    );
    try {
      const info = await this.client.api.getGroupInfoByLink(item.link);
      if (!isGroupChatLocked(info)) await this.client.api.joinGroup(item.link);
      await this.collection.deleteOne({ _id: item._id });
    } catch (error) {
      await this.collection.updateOne({ _id: item._id }, {
        $set: { status: "failed", failedAt: new Date(), error: String(error?.message || error).slice(0, 300) },
      });
      this.logger.warn("Autojoin xử lý link thất bại", { error: error?.message });
    }
    return true;
  }

  stop() { this.cancelJob?.(); }
}
