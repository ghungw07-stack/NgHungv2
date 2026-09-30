import { randomUUID } from "node:crypto";
import { DRAW_DURATION, MAX_TICKETS, TICKET_PRICE, drawLottery, ticketPrize } from "./rules.js";

export function createLotteryEngine({ state, save, wallet, notify, now = Date.now, draw = drawLottery }) {
  let queue = Promise.resolve();
  const serial = task => {
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  };
  const persist = () => save(state);

  async function charge(session, order) {
    if (order.status !== "pending") return;
    persist();
    const result = await wallet({ username: order.username, sessionId: session.id,
      operationId: `${order.id}:buy`, amount: -order.numbers.length * TICKET_PRICE });
    order.status = result.success ? "paid" : "rejected";
    if (result.success && !session.endsAt) session.endsAt = now() + DRAW_DURATION;
    order.error = result.message;
    persist();
  }

  async function tick() {
    const session = state.current;
    if (!session) return;
    persist();
    for (const order of session.orders) await charge(session, order);
    if (now() < session.endsAt) return;
    const paid = session.orders.filter(order => order.status === "paid" || order.status === "settled");
    if (paid.length) {
      if (!session.result) {
        session.result = draw();
        persist();
      }
      for (const order of paid) {
        if (order.status === "settled") continue;
        order.winnings = order.numbers.map(number => ({ number, prize: ticketPrize(number, session.result) }));
        order.payout = order.winnings.reduce((sum, item) => sum + (item.prize?.amount || 0), 0);
        const credited = await wallet({ username: order.username, sessionId: session.id,
          operationId: `${order.id}:prize`, amount: order.payout, cost: order.numbers.length * TICKET_PRICE });
        if (!credited.success) throw new Error(credited.message || "Chưa thể trả thưởng vé số.");
        order.status = "settled";
        persist();
      }
    }
    state.history.unshift(session);
    state.history = state.history.slice(0, 20);
    state.current = null;
    state.nextCode = session.code + 1;
    persist();
    if (paid.length) await notify(session);
  }

  return {
    state,
    tick: () => serial(tick),
    buy: (player, numbers, requestId) => serial(async () => {
      if (!numbers.length || numbers.length > MAX_TICKETS || numbers.some(n => !/^\d{6}$/.test(n))) {
        throw new Error("Số vé không hợp lệ.");
      }
      const previous = [state.current, ...state.history].filter(Boolean)
        .flatMap(session => session.orders.map(order => ({ session, order })))
        .find(item => item.order.requestId === requestId);
      if (previous) {
        await charge(previous.session, previous.order);
        if (previous.order.status === "rejected") throw new Error(previous.order.error);
        return previous;
      }
      await tick();
      if (!state.current) state.current = {
        id: randomUUID(), code: state.nextCode, endsAt: null, orders: [], result: null,
      };
      const session = state.current;
      const owned = session.orders.filter(order => order.username === player.username && order.status !== "rejected")
        .reduce((sum, order) => sum + order.numbers.length, 0);
      if (owned + numbers.length > MAX_TICKETS) throw new Error("Mỗi người tối đa 100 vé trong một kỳ.");
      if (session.orders.length >= 2000) throw new Error("Kỳ này đã đủ vé, hãy đợi kỳ sau.");
      const order = { ...player, id: randomUUID(), requestId, numbers: [...numbers], status: "pending" };
      session.orders.push(order);
      // Lưu yêu cầu trước khi trừ ví để phục hồi được cả khi tiến trình dừng đột ngột.
      persist();
      await charge(session, order);
      if (order.status === "rejected") throw new Error(order.error);
      return { session, order };
    }),
  };
}
