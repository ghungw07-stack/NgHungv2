import { TtlCache } from "../../core/ttl-cache.js";

export class GroupService {
  #cache = new Map();
  #expiry = new TtlCache({ ttlMs: 10_000, maxSize: 2_000 });
  constructor(client) { this.client = client; }
  async info(threadId) {
    const id = String(threadId);
    if (this.#expiry.has(id) && this.#cache.has(id)) return this.#cache.get(id);
    const response = await this.client.api.getGroupInfo(id);
    const raw = response?.gridInfoMap?.[id];
    if (!raw) throw new Error("Không lấy được thông tin nhóm");
    const info = {
      id,
      name: raw.name || "Không xác định",
      creatorId: String(raw.creatorId || ""),
      adminIds: (raw.adminIds || []).map(String),
      memberIds: (raw.memVerList || []).map((value) => String(value?.id || value).replace(/_0$/, "")),
      memberCount: raw.memVerList?.length || raw.totalMember || 0,
      type: raw.type,
      description: raw.desc || "",
      settings: raw.setting || {},
    };
    this.#cache.set(id, info);
    this.#expiry.add(id);
    return info;
  }
  async isAdmin(threadId, userId) {
    const info = await this.info(threadId);
    const id = String(userId);
    return id === info.creatorId || info.adminIds.includes(id);
  }
  invalidate(threadId) { this.#cache.delete(String(threadId)); }
  clear() { this.#cache.clear(); this.#expiry.clear(); }
}
