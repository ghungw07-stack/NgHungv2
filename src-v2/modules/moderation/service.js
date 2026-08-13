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
    if (message?.type !== 1 || message.isSelf) return null;
    const threadId = String(message.threadId);
    const userId = String(message.data.uidFrom);
    if (await this.isPrivileged(userId, threadId)) return null;
    const settings = await this.repository.get(threadId);
    const content = typeof message.data?.content === "string" ? message.data.content : "";
    const msgType = String(message.data?.msgType || "");
    const mediaFeatures = [
      ["antiFile", ["share.file", "chat.file"], "file"],
      ["antiPhoto", ["chat.photo", "chat.image"], "ảnh"],
      ["antiVideo", ["chat.video.msg", "chat.video"], "video"],
      ["antiVoice", ["chat.voice"], "voice"],
      ["antiSticker", ["chat.sticker"], "sticker"],
      ["antiGif", ["chat.gif"], "GIF"],
    ];
    for (const [key, types, reason] of mediaFeatures) {
      if (settings[key] && types.includes(msgType)) return { reason };
    }
    const forwarded = msgType === "chat.forward" || Number(message.data?.fwLvl || message.data?.content?.fwLvl || 0) > 0;
    if (settings.antiForward && forwarded) return { reason: "tin chuyển tiếp" };
    if (settings.antiPhoneNumber && /(?:\+?84|0)(?:[35789]\d{8}|2\d{9})\b/.test(content.replace(/[ .-]/g, ""))) {
      return { reason: "số điện thoại" };
    }
    const mentions = message.data?.mentions || [];
    if (settings.antiTag && (mentions.some((item) => String(item.uid || item.id) === "-1") || mentions.length >= 5)) {
      return { reason: "tag hàng loạt" };
    }
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
