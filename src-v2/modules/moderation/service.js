function normalize(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

export class ModerationService {
  #hits = new Map();
  constructor({ repository, client, groups, isPrivileged, logger }) {
    Object.assign(this, { repository, client, groups, isPrivileged, logger });
  }
  #isSpam(key, now = Date.now()) {
    const recent = (this.#hits.get(key) || []).filter((time) => now - time < 5_000);
    recent.push(now);
    if (this.#hits.size > 20_000) this.#hits.delete(this.#hits.keys().next().value);
    this.#hits.set(key, recent);
    return recent.length >= 6;
  }
  async inspect(message) {
    if (message?.type !== 1 || message.isSelf || typeof message?.data?.content !== "string") return null;
    const threadId = String(message.threadId);
    const userId = String(message.data.uidFrom);
    if (await this.isPrivileged(userId, threadId)) return null;
    const settings = await this.repository.get(threadId);
    const content = message.data.content;
    if (settings.antiSpam && this.#isSpam(`${threadId}:${userId}`)) return { reason: "spam" };
    if (settings.removeLinks && /(?:https?:\/\/|www\.|zalo\.me\/g\/|chat\.zalo\.me\/)/i.test(content)) {
      return { reason: "liên kết" };
    }
    if (settings.filterBadWords) {
      const normalized = normalize(content);
      const badWord = (settings.badWords || []).find((word) => normalized.includes(normalize(word)));
      if (badWord) return { reason: "từ cấm", detail: badWord };
    }
    return null;
  }
  async enforce(message, violation) {
    await this.client.api.deleteMessage(message, false);
    await this.client.sendText(
      message.threadId,
      message.type,
      `Đã xóa tin nhắn vi phạm: ${violation.reason}.`
    );
  }
  clear() { this.#hits.clear(); }
}
