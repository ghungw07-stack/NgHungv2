import { readFileSync, writeFileSync } from "../utils/util.js";

export class BotChildrenStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = {};
    this.dirty = false;
  }

  getAll() {
    return this.data;
  }

  get(ownerId) {
    return this.data[ownerId];
  }

  findBotWithId(idBot) {
    return Object.values(this.data).find((bot) => bot.idBot === idBot);
  }

  set(ownerId, value) {
    this.data[ownerId] = value;
    this.dirty = true;
  }

  has(ownerId) {
    return Object.prototype.hasOwnProperty.call(this.data, ownerId);
  }

  delete(ownerId) {
    if (this.has(ownerId)) {
      delete this.data[ownerId];
      this.dirty = true;
      return true;
    }
    return false;
  }

  markDirty() {
    this.dirty = true;
  }

  load() {
    try {
      const content = readFileSync(this.filePath);
      const parsed = JSON.parse(content || "{}");
      for (const key of Object.keys(this.data)) delete this.data[key];
      Object.assign(this.data, parsed || {});
      this.dirty = false;
      return this.data;
    } catch {
      for (const key of Object.keys(this.data)) delete this.data[key];
      this.dirty = false;
      return this.data;
    }
  }

  saveIfDirty() {
    if (!this.dirty) return false;
    try {
      writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
      this.dirty = false;
      return true;
    } catch {
      return false;
    }
  }
}


