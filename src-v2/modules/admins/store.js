import fs from "node:fs/promises";
import path from "node:path";

export class AdminStore {
  constructor({ rootDir, data }) {
    this.file = path.join(rootDir, "assets/data/list_admin.json");
    this.data = data;
    this.writing = Promise.resolve();
  }
  list(botId) { return [...new Set((this.data[String(botId)] || []).map(String))]; }
  isAdmin(botId, userId) { return this.list(botId).includes(String(userId)); }
  async set(botId, values) {
    this.data[String(botId)] = [...new Set(values.map(String))];
    await this.save();
    return this.list(botId);
  }
  async reload() {
    const fresh = JSON.parse(await fs.readFile(this.file, "utf8"));
    for (const key of Object.keys(this.data)) delete this.data[key];
    Object.assign(this.data, fresh);
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
