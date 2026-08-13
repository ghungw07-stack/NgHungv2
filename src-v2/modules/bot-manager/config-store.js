import fs from "node:fs/promises";
import path from "node:path";

export class BotConfigStore {
  constructor({ rootDir, data }) {
    this.file = path.join(rootDir, "assets", "data", "manager-bots.json");
    this.data = data;
    this.writing = Promise.resolve();
  }
  get(ownerId) { return this.data[String(ownerId)]; }
  async patch(ownerId, changes) {
    ownerId = String(ownerId);
    if (!this.data[ownerId]) return null;
    Object.assign(this.data[ownerId], changes);
    await this.save();
    return this.data[ownerId];
  }
  save() {
    this.writing = this.writing.then(async () => {
      const temporary = `${this.file}.${process.pid}.tmp`;
      await fs.writeFile(temporary, `${JSON.stringify(this.data, null, 2)}\n`, { mode: 0o600 });
      await fs.rename(temporary, this.file);
    });
    return this.writing;
  }
}
