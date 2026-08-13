import Big from "big.js";

export class PaymentService {
  constructor({ database, botStore, fleet, logger, price = 80_000, durationDays = 30 }) {
    this.events = database.collection("v2_payment_events");
    Object.assign(this, { botStore, fleet, logger, price, durationDays });
  }
  async start() { await this.events.createIndex({ reference: 1 }, { unique: true }); }
  parse(body) {
    const transferType = String(body.transferType || body.type || "in").toLowerCase();
    if (transferType !== "in") return null;
    const amount = new Big(body.transferAmount ?? body.amount ?? 0);
    if (amount.lt(1000)) throw new Error("Số tiền quá nhỏ");
    const content = [body.content, body.transferContent, body.description].filter(Boolean).join(" ").toUpperCase();
    const match = content.match(/\b(BOTPAY|DONATE)\s*(\d+)\b/);
    if (!match) return null;
    const reference = String(body.referenceCode || body.code || body.id || "").trim();
    if (!reference) throw new Error("Thiếu mã giao dịch");
    return { kind: match[1], targetId: match[2], amount: amount.toFixed(0), reference, raw: body };
  }
  async process(body) {
    const payment = this.parse(body);
    if (!payment) return { success: true, ignored: true };
    try {
      await this.events.insertOne({ ...payment, raw: undefined, status: "processing", createdAt: new Date() });
    } catch (error) {
      if (error.code === 11000) return { success: true, duplicate: true, message: "Giao dịch đã xử lý" };
      throw error;
    }
    try {
      const result = payment.kind === "BOTPAY" ? await this.#renewBot(payment) : await this.#donate(payment);
      await this.events.updateOne({ reference: payment.reference }, { $set: { status: "completed", result, completedAt: new Date() } });
      return { success: true, ...result };
    } catch (error) {
      await this.events.updateOne({ reference: payment.reference }, { $set: { status: "failed", error: error.message, failedAt: new Date() } });
      throw error;
    }
  }
  async #renewBot(payment) {
    const current = this.botStore.get(payment.targetId);
    if (!current) throw new Error("Không tìm thấy bot cần gia hạn");
    const durationMs = Number(new Big(payment.amount).div(this.price).times(this.durationDays * 86_400_000).round(0));
    const wasActive = current.status === "active" && Number(current.timeRemaining) > 1000;
    await this.botStore.patch(payment.targetId, {
      timeRemaining: durationMs, approvedAt: Date.now(), approvedBy: "AUTO_PAYMENT_V2",
      paymentRef: payment.reference, status: wasActive ? "active" : "inactive",
      renewalReminder1DaySent: false, renewalReminder5MinSent: false,
    });
    const main = this.fleet.list().find((bot) => bot.identity.isMain);
    await main?.client.sendText(payment.targetId, 0,
      `Thanh toán thành công ${Number(payment.amount).toLocaleString("vi-VN")}đ. Thời hạn mới: ${(durationMs / 86_400_000).toFixed(1)} ngày.`
    ).catch(() => {});
    return { kind: "bot", ownerId: payment.targetId, durationMs };
  }
  async #donate(payment) {
    const main = this.fleet.list().find((bot) => bot.identity.isMain);
    if (!main?.runtime?.players) throw new Error("Game economy chưa sẵn sàng");
    const coin = new Big(payment.amount).times(1_000_000).toFixed(0);
    await main.runtime.players.creditOnce(payment.targetId, coin, `donate:${payment.reference}`, { paymentAmount: payment.amount });
    return { kind: "donate", userId: payment.targetId, coin };
  }
}
