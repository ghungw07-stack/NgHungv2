const VERSION = 1;

function normalizeSettings(value) {
  const clean = structuredClone(value || {});
  if (clean.antigif != null && clean.antiGif == null) clean.antiGif = Boolean(clean.antigif);
  if (clean.antiforward != null && clean.antiForward == null) clean.antiForward = Boolean(clean.antiforward);
  if (clean.antiPhotoVideo != null) {
    clean.antiPhoto ??= Boolean(clean.antiPhotoVideo);
    clean.antiVideo ??= Boolean(clean.antiPhotoVideo);
  }
  delete clean.updateGroupSnapshot;
  return clean;
}

export class LegacyMigration {
  constructor({ database, botId, groupSettings, logger }) {
    this.botId = String(botId);
    this.groupSettings = groupSettings;
    this.settings = database.collection("v2_group_settings");
    this.checkpoints = database.collection("v2_migrations");
    this.logger = logger;
  }
  async run() {
    await this.checkpoints.createIndex({ botId: 1, version: 1 }, { unique: true });
    const checkpoint = await this.checkpoints.findOne({ botId: this.botId, version: VERSION, status: "completed" });
    if (checkpoint) return { skipped: true, importedGroups: checkpoint.importedGroups || 0 };
    const entries = Object.entries(this.groupSettings || {}).filter(([, value]) => value && typeof value === "object" && !Array.isArray(value));
    if (entries.length) {
      await this.settings.bulkWrite(entries.map(([threadId, value]) => ({
        updateOne: {
          filter: { botId: this.botId, threadId: String(threadId) },
          update: { $setOnInsert: { ...normalizeSettings(value), botId: this.botId, threadId: String(threadId), migratedAt: new Date() } },
          upsert: true,
        },
      })), { ordered: false });
    }
    await this.checkpoints.updateOne(
      { botId: this.botId, version: VERSION },
      { $set: { status: "completed", importedGroups: entries.length, completedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true },
    );
    this.logger.info("Đã nhập dữ liệu group settings cũ", { groups: entries.length, version: VERSION });
    return { skipped: false, importedGroups: entries.length };
  }
}

export { normalizeSettings as normalizeLegacyGroupSettings };
