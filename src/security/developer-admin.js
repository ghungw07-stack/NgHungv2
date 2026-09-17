import fs from 'node:fs';
import path from 'node:path';
import { getIdentityProfile } from './identity-profile.js';

export function canManageDevelopers(api, senderId) {
  return api?.apiManager?.isMainBot === true
    && String(senderId) === String(api.getBotId());
}

export class DeveloperAdmins {
  constructor(file) {
    this.file = file;
    this.records = {};
    this.pending = new Map();
    this.negative = new Map();
    this.load();
  }
  load() {
    try {
      this.records = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  commit(records) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(`${this.file}.tmp`, JSON.stringify(records, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(`${this.file}.tmp`, this.file);
    this.records = records;
    this.negative.clear();
  }
  has(botId, userId) {
    if (botId == null || userId == null) return false;
    return Object.values(this.records).some(r => r.aliases?.[String(botId)] === String(userId));
  }
  async profile(api, userId) {
    const response = await api.getInfoMembers([String(userId)]);
    const profile = getIdentityProfile(response, userId);
    const globalId = String(profile?.globalId || profile?.global_id || '');
    if (!globalId || globalId === '0') throw new Error('Không lấy được globalId để xác minh danh tính developer.');
    return { globalId, avatar: profile.avatar || profile.avt || "", name: profile.displayName || profile.zaloName || profile.dName || String(userId) };
  }
  async change(api, senderId, userId, action) {
    if (!canManageDevelopers(api, senderId)) throw new Error('Chỉ chính tài khoản mainbot được cấp hoặc thu hồi quyền developer.');
    if (!['add', 'remove'].includes(action)) throw new Error('Thao tác developer không hợp lệ.');
    const botId = String(api.getBotId());
    const known = Object.entries(this.records).find(([, r]) => r.aliases?.[botId] === String(userId));
    const identity = action === 'remove' && known
      ? { globalId: known[0], name: known[1].name }
      : await this.profile(api, userId);
    const next = structuredClone(this.records);
    if (action === 'remove') delete next[identity.globalId];
    else next[identity.globalId] = {
      ...next[identity.globalId], name: identity.name, avatar: identity.avatar,
      aliases: { ...next[identity.globalId]?.aliases, [botId]: String(userId) },
      grantedBy: String(senderId), grantedAt: Date.now(),
    };
    this.commit(next);
    return identity.name;
  }
  async resolve(api, userId) {
    const botId = String(api.getBotId());
    if (this.has(botId, userId)) return true;
    if (!Object.keys(this.records).length) return false;
    const key = `${botId}:${userId}`;
    if (Date.now() < (this.negative.get(key) || 0)) return false;
    if (this.pending.has(key)) return this.pending.get(key);
    const work = (async () => {
      try {
        const { globalId } = await this.profile(api, userId);
        // Kiểm tra lại sau await để không khôi phục quyền vừa bị thu hồi.
        if (!this.records[globalId]) {
          this.negative.set(key, Date.now() + 60000);
          if (this.negative.size > 20000) this.negative.delete(this.negative.keys().next().value);
          return false;
        }
        const next = structuredClone(this.records);
        next[globalId].aliases[botId] = String(userId);
        this.commit(next);
        return true;
      } catch {
        return false;
      } finally {
        this.pending.delete(key);
      }
    })();
    this.pending.set(key, work);
    return work;
  }
}
