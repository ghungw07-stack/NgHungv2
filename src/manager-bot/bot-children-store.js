import { readFileSync, writeFileSync } from "../utils/util.js";
import {
  hasBotCredentials,
  pickBotCredentials,
  sanitizeBotMap,
} from "../security/bot-credential-vault.js";


export class BotChildrenStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = {};
    this.dirty = false;
    this.credentialVault = null;
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
      if (this.credentialVault) {
        void this.credentialVault.delete("child", ownerId).catch((error) => {
          console.error(`[credential-vault] Không xóa được credential bot ${ownerId}: ${error.message}`);
        });
      }
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

  async attachCredentialVault(vault) {
    if (!vault) throw new Error("Credential vault không hợp lệ");
    const encryptedCredentials = await vault.getAll("child");

    for (const [ownerId, botData] of Object.entries(this.data)) {
      const stored = encryptedCredentials.get(String(ownerId));
      const legacy = pickBotCredentials(botData);

      // Nếu file cũ vẫn còn plaintext thì đó là dữ liệu vừa được runtime cũ
      // cập nhật; mã hóa nó trước. Sau khi file đã scrub, MongoDB là nguồn gốc.
      if (hasBotCredentials(legacy)) {
        await vault.set("child", ownerId, legacy);
      } else if (stored) Object.assign(botData, stored);
    }

    this.credentialVault = vault;
    // Luôn ghi lại metadata đã lọc để tự động xóa credential plaintext cũ.
    this.dirty = true;
    this.saveIfDirty();
    return this.data;
  }

  async setCredentials(ownerId, credentials) {
    if (!this.credentialVault) throw new Error("Credential vault chưa sẵn sàng");
    if (!this.has(ownerId)) throw new Error(`Bot ${ownerId} không tồn tại`);
    await this.credentialVault.set("child", ownerId, credentials);
    Object.assign(this.data[ownerId], pickBotCredentials(credentials));
    this.dirty = true;
  }

  saveIfDirty() {
    if (!this.dirty) return false;
    try {
      writeFileSync(this.filePath, JSON.stringify(sanitizeBotMap(this.data), null, 2));
      this.dirty = false;
      return true;
    } catch {
      return false;
    }
  }
}
