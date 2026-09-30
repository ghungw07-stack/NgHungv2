import { readFileSync, writeFileSync } from "../utils/util.js";
import fs from "node:fs";
import path from "node:path";
import {
  hasBotCredentials,
  pickBotCredentials,
  sanitizeBotMap,
  withoutBotCredentials,
} from "../security/bot-credential-vault.js";


function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporaryPath, filePath);
}

export class BotChildrenStore {
  constructor(filePath, removedFilePath = path.join(path.dirname(filePath), "removed-bots.json")) {
    this.filePath = filePath;
    this.removedFilePath = removedFilePath;
    this.entryDirectory = `${filePath}.entries`;
    this.data = {};
    this.dirty = false;
    this.credentialVault = null;
    this.credentialOwnerIds = null;
    this.removedOwnerIds = new Set();
    this.removedBotIds = new Set();
    this.loadRemovedBots();
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
    if (this.isRemoved(ownerId, value)) throw new Error(`Bot ${ownerId} đã bị xóa vĩnh viễn`);
    this.data[ownerId] = value;
    this.dirty = true;
  }

  has(ownerId) {
    return Object.prototype.hasOwnProperty.call(this.data, ownerId);
  }

  async delete(ownerId) {
    if (this.has(ownerId)) {
      const botData = this.data[ownerId];
      if (this.credentialVault?.markBotRemoved) {
        await this.credentialVault.markBotRemoved(ownerId, botData?.idBot);
      }
      this.removedOwnerIds.add(String(ownerId));
      if (botData?.idBot) this.removedBotIds.add(String(botData.idBot));
      this.saveRemovedBots();
      delete this.data[ownerId];
      this.dirty = true;
      if (this.credentialVault) {
        this.credentialOwnerIds?.delete(String(ownerId));
        await this.credentialVault.delete("child", ownerId);
      }
      return true;
    }
    return false;
  }

  markDirty() {
    this.dirty = true;
  }

  isRemoved(ownerId, botData = null) {
    return (
      this.removedOwnerIds.has(String(ownerId)) ||
      (botData?.idBot && this.removedBotIds.has(String(botData.idBot)))
    );
  }

  async allowRecreate(ownerId, botId = null) {
    const normalizedOwnerId = ownerId == null ? null : String(ownerId);
    const normalizedBotId = botId == null ? null : String(botId);
    let changed = false;

    if (normalizedOwnerId) changed = this.removedOwnerIds.delete(normalizedOwnerId) || changed;
    if (normalizedBotId) changed = this.removedBotIds.delete(normalizedBotId) || changed;
    if (this.credentialVault?.unmarkBotRemoved) {
      await this.credentialVault.unmarkBotRemoved(normalizedOwnerId, normalizedBotId);
    }
    if (changed) this.saveRemovedBots();
    return changed;
  }

  loadRemovedBots() {
    try {
      const parsed = JSON.parse(readFileSync(this.removedFilePath) || "{}");
      this.removedOwnerIds = new Set((parsed.ownerIds || []).map(String));
      this.removedBotIds = new Set((parsed.botIds || []).map(String));
    } catch {
      this.removedOwnerIds = new Set();
      this.removedBotIds = new Set();
    }
  }

  saveRemovedBots() {
    writeJsonAtomic(this.removedFilePath, {
      ownerIds: [...this.removedOwnerIds].sort(),
      botIds: [...this.removedBotIds].sort(),
    });
  }

  load() {
    try {
      this.loadRemovedBots();
      const content = fs.existsSync(this.filePath) ? readFileSync(this.filePath) : "{}";
      const parsed = JSON.parse(content || "{}");
      let recoveredFromEntries = false;
      // Mỗi bot có bản ghi riêng. Nếu một tiến trình cũ ghi đè danh sách tổng
      // khi PM2 restart, bản ghi của bot vừa quét QR vẫn còn để khôi phục.
      if (fs.existsSync(this.entryDirectory)) {
        for (const name of fs.readdirSync(this.entryDirectory)) {
          if (!/^\d+\.json$/.test(name)) continue;
          const ownerId = name.slice(0, -5);
          if (Object.prototype.hasOwnProperty.call(parsed, ownerId)) continue;
          try {
            const botData = JSON.parse(fs.readFileSync(path.join(this.entryDirectory, name), "utf8"));
            if (botData?.ownerId && String(botData.ownerId) === ownerId) {
              parsed[ownerId] = botData;
              recoveredFromEntries = true;
            }
          } catch {}
        }
      }
      for (const key of Object.keys(this.data)) delete this.data[key];
      for (const [ownerId, botData] of Object.entries(parsed || {})) {
        if (this.isRemoved(ownerId, botData)) {
          this.removedOwnerIds.add(String(ownerId));
          continue;
        }
        const wasProvisioned = Boolean(botData?.idBot) || ["active", "inactive"].includes(botData?.status);
        if (this.credentialOwnerIds && wasProvisioned && !this.credentialOwnerIds.has(String(ownerId))) continue;
        this.data[ownerId] = botData;
      }
      this.saveRemovedBots();
      this.dirty = recoveredFromEntries || Object.keys(this.data).length !== Object.keys(parsed || {}).length;
      this.saveIfDirty();
      return this.data;
    } catch {
      for (const key of Object.keys(this.data)) delete this.data[key];
      this.dirty = false;
      return this.data;
    }
  }

  async attachCredentialVault(vault) {
    if (!vault) throw new Error("Credential vault không hợp lệ");
    if (vault.getRemovedBots) {
      const removed = await vault.getRemovedBots();
      for (const ownerId of removed.ownerIds || []) this.removedOwnerIds.add(String(ownerId));
      for (const botId of removed.botIds || []) this.removedBotIds.add(String(botId));
    }
    if (vault.markBotRemoved) {
      await Promise.all([
        ...[...this.removedOwnerIds].map((ownerId) => vault.markBotRemoved(ownerId, null)),
        ...[...this.removedBotIds].map((botId) => vault.markBotRemoved(null, botId)),
      ]);
    }
    this.saveRemovedBots();
    const encryptedCredentials = await vault.getAll("child");
    for (const ownerId of this.removedOwnerIds) {
      if (encryptedCredentials.has(ownerId)) await vault.delete("child", ownerId);
      encryptedCredentials.delete(ownerId);
    }
    this.credentialOwnerIds = new Set(encryptedCredentials.keys());

    for (const [ownerId, botData] of Object.entries(this.data)) {
      if (this.isRemoved(ownerId, botData)) {
        delete this.data[ownerId];
        encryptedCredentials.delete(String(ownerId));
        await vault.delete("child", ownerId);
        continue;
      }
      const stored = encryptedCredentials.get(String(ownerId));
      const hasStoredDocument = encryptedCredentials.has(String(ownerId));
      const legacy = pickBotCredentials(botData);

      const wasProvisioned = Boolean(botData?.idBot) || ["active", "inactive"].includes(botData?.status);
      if (!stored && !hasStoredDocument && !hasBotCredentials(legacy) && wasProvisioned) {
        delete this.data[ownerId];
        continue;
      }

      // Nếu file cũ vẫn còn plaintext thì đó là dữ liệu vừa được runtime cũ
      // cập nhật; mã hóa nó trước. Sau khi file đã scrub, MongoDB là nguồn gốc.
      if (hasBotCredentials(legacy)) {
        await vault.set("child", ownerId, legacy);
        this.credentialOwnerIds.add(String(ownerId));
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
    this.credentialOwnerIds?.add(String(ownerId));
    Object.assign(this.data[ownerId], pickBotCredentials(credentials));
    this.dirty = true;
    if (!this.saveIfDirty()) {
      throw new Error(`Không lưu được thông tin bot ${ownerId}: ${this.lastSaveError?.message || "lỗi ghi dữ liệu"}`);
    }
  }

  saveIfDirty() {
    if (!this.dirty) return false;
    try {
      fs.mkdirSync(this.entryDirectory, { recursive: true });
      for (const [ownerId, botData] of Object.entries(this.data)) {
        if (!/^\d+$/.test(ownerId) || this.isRemoved(ownerId, botData)) continue;
        writeJsonAtomic(path.join(this.entryDirectory, `${ownerId}.json`), withoutBotCredentials({ ...botData, ownerId }));
      }
      writeJsonAtomic(this.filePath, sanitizeBotMap(this.data));
      this.dirty = false;
      return true;
    } catch (error) {
      this.lastSaveError = error;
      return false;
    }
  }
}
