export class BankAccountRepository {
  constructor({ database, botId }) {
    this.collection = database.collection("v2_bank_accounts");
    this.botId = String(botId);
  }
  async start() {
    await Promise.all([
      this.collection.createIndex({ botId: 1, userId: 1, accountNumber: 1 }, { unique: true }),
      this.collection.createIndex({ botId: 1, userId: 1, createdAt: 1 }),
    ]);
  }
  list(userId) { return this.collection.find({ botId: this.botId, userId: String(userId) }).sort({ createdAt: 1 }).limit(5).toArray(); }
  async add(userId, account) {
    const current = await this.list(userId);
    if (current.length >= 5) throw new Error("Chỉ được lưu tối đa 5 tài khoản");
    await this.collection.updateOne(
      { botId: this.botId, userId: String(userId), accountNumber: account.accountNumber },
      { $set: { ...account, updatedAt: new Date() }, $setOnInsert: { botId: this.botId, userId: String(userId), createdAt: new Date() } },
      { upsert: true },
    );
  }
  async remove(userId, index) {
    const account = (await this.list(userId))[index];
    if (!account) return false;
    return Boolean((await this.collection.deleteOne({ _id: account._id, userId: String(userId), botId: this.botId })).deletedCount);
  }
}
