export class GroupSettingsRepository {
  #cache = new Map();
  constructor({ database, botId, legacySettings = {}, defaultPrefix = "!" }) {
    this.collection = database.collection("v2_group_settings");
    this.botId = String(botId);
    const scoped = legacySettings[this.botId];
    // File cũ phổ biến được key trực tiếp theo threadId; một số bản lại lồng theo botId.
    this.legacySettings = scoped && !Object.hasOwn(scoped, "activeBot") && !Object.hasOwn(scoped, "antiSpam")
      ? scoped
      : legacySettings;
    this.defaultPrefix = defaultPrefix;
  }
  async start() {
    await this.collection.createIndex({ botId: 1, threadId: 1 }, { unique: true });
  }
  #key(threadId) { return String(threadId); }
  async get(threadId) {
    const key = this.#key(threadId);
    if (this.#cache.has(key)) return this.#cache.get(key);
    const stored = await this.collection.findOne({ botId: this.botId, threadId: key }, { projection: { _id: 0 } });
    const value = stored || { botId: this.botId, threadId: key, ...(this.legacySettings[key] || {}) };
    this.#cache.set(key, value);
    return value;
  }
  async getPrefix(threadId) {
    const settings = await this.get(threadId);
    return settings.prefix || settings.botPrefix || this.defaultPrefix;
  }
  async patch(threadId, changes) {
    const key = this.#key(threadId);
    const clean = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
    const result = await this.collection.findOneAndUpdate(
      { botId: this.botId, threadId: key },
      { $set: clean, $setOnInsert: { botId: this.botId, threadId: key } },
      { upsert: true, returnDocument: "after", projection: { _id: 0 } }
    );
    this.#cache.set(key, result);
    return result;
  }
  clear() { this.#cache.clear(); }
}
