function normalizeId(value) { return String(value || "").replace(/_0$/, "").split("_")[0]; }

function textContent(message) {
  const content = message?.data?.content;
  if (typeof content === "string") return content.trim();
  return String(content?.title || content?.caption || "").trim();
}

function quotedText(quote) {
  if (typeof quote?.content === "string") return quote.content;
  return String(quote?.content?.title || quote?.content?.caption || "");
}

export class ParentRelayService {
  constructor({ client, identity, enabled = true, logger }) {
    Object.assign(this, { client, identity, enabled, logger });
  }

  get active() { return this.enabled && !this.identity.isMain && Boolean(this.identity.mainBotId); }

  async handle(message) {
    if (!this.active || message?.isSelf || message?.type !== 0) return false;
    const senderId = String(message.data?.uidFrom || "");
    const mainBotId = String(this.identity.mainBotId);

    if (normalizeId(senderId) === normalizeId(mainBotId)) {
      const quote = message.data?.quote;
      const match = quotedText(quote).match(/^🆔 ID người gửi:\s*([^\s]+)$/m);
      if (!match) return false;
      const replyText = textContent(message);
      if (!replyText) {
        await this.client.api.sendMessage({ msg: "Hiện relay chỉ hỗ trợ nội dung chữ.", quote: message }, mainBotId, 0);
        return true;
      }
      try {
        await this.client.api.sendMessage({ msg: replyText }, String(match[1]), 0);
        await this.client.api.sendMessage({ msg: "Đã gửi câu trả lời.", quote: message, ttl: 60_000 }, mainBotId, 0);
      } catch (error) {
        this.logger.warn("Không gửi được phản hồi từ bot mẹ", { error: error.message });
        await this.client.api.sendMessage({ msg: "Không gửi được câu trả lời tới người nhắn.", quote: message }, mainBotId, 0);
      }
      return true;
    }

    if (normalizeId(senderId) === normalizeId(this.identity.ownerId)) return false;
    const content = textContent(message) || `[${message.data?.msgType || "nội dung đặc biệt"}]`;
    const senderName = message.data?.dName || "Người dùng";
    const notification = [
      "🔔 Có người nhắn bot con",
      `🤖 Bot: ${this.identity.name || this.client.botId}`,
      `👤 Người gửi: ${senderName}`,
      `🆔 ID người gửi: ${senderId}`,
      `💬 Nội dung: ${content.slice(0, 1500)}`,
      "↩️ Reply tin này để trả lời trực tiếp, không cần tag.",
    ].join("\n");
    await this.client.api.sendMessage({ msg: notification }, mainBotId, 0);
    return false;
  }
}
