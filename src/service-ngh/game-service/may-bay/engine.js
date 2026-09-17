import Big from "big.js";
import { randomUUID } from "node:crypto";
import { BOARDING_MS, FLIGHT_UPDATE_MS, MIN_BET, HISTORY_LIMIT, chooseCrashPoint, flightDuration, multiplierAt, parseAutoCashout, settleTicket } from "./rules.js";

const PENDING = new Set(["buying", "cashing", "refunding"]);

export function createCrashEngine({ store, emit = async () => {}, now = Date.now, chooseCrash = chooseCrashPoint,
  schedule = setTimeout, unschedule = clearTimeout, report = console.error }) {
  const rooms = new Map(), locks = new Map();
  const context = new Map();

  function snapshot(round) {
    const { timer, retryTimer, saveQueue, finishing, ...data } = round;
    return structuredClone(data);
  }
  function save(round) {
    const data = snapshot(round);
    const task = (round.saveQueue || Promise.resolve()).catch(() => {}).then(() => store.save(data));
    round.saveQueue = task;
    return task;
  }
  function notify(round, event, extra = {}) {
    return Promise.resolve().then(() => emit(event, snapshot(round), context.get(round.scope), extra))
      .catch(error => report("[maybay] Gửi thông báo:", error.message));
  }
  async function locked(scope, fn) {
    const work = (locks.get(scope) || Promise.resolve()).catch(() => {}).then(fn);
    locks.set(scope, work);
    try { return await work; } finally { if (locks.get(scope) === work) locks.delete(scope); }
  }
  function retry(round) {
    if (round.retryTimer) return;
    round.retryTimer = schedule(() => {
      round.retryTimer = null;
      flush(round).catch(error => { report("[maybay] Quyết toán:", error.message); retry(round); });
    }, 5000);
    round.retryTimer.unref?.();
  }
  async function pay(round, ticket) {
    if (ticket.status !== "cashing" && ticket.status !== "refunding") return;
    const paidStatus = ticket.status === "refunding" ? "refunded" : "cashed";
    // Freeze the withdrawal in durable state before touching the wallet.
    await save(round);
    await store.changeBalance(ticket, round, ticket.returned, "credit");
    ticket.status = paidStatus;
    await save(round);
    if (ticket.automatic && paidStatus === "cashed") void notify(round, "autocashout", { ticket: { ...ticket } });
  }
  async function flush(round) {
    return locked(`settle:${round.id}`, async () => {
      for (const ticket of round.tickets) {
        if (ticket.status === "buying") {
          // Only cancelled/recovered bookings are refunded here. A live booking
          // may still have an in-flight debit in join().
          if (round.phase !== "cancelled" && !ticket.bookingFailed) continue;
          if (!(await store.wasDebited(ticket, round))) { ticket.status = "refunded"; continue; }
          ticket.status = "refunding";
          ticket.returned = ticket.amount;
        }
        await pay(round, ticket);
      }
      round.complete = ["crashed", "cancelled"].includes(round.phase) && !round.tickets.some(t => PENDING.has(t.status));
      await save(round);
      if (round.phase === "crashed") {
        await store.addHistory(round.scope, historyEntry(round));
        if (!round.announced) {
          round.announced = true;
          await save(round);
          void notify(round, "crashed");
        }
      }
      if (round.complete) {
        unschedule(round.retryTimer); round.retryTimer = null;
        // Keep recent tickets briefly so a late bare "rút" gets a clear reply.
        unschedule(round.timer);
        round.timer = schedule(() => { if (rooms.get(round.scope) === round) { rooms.delete(round.scope); context.delete(round.scope); } }, 120_000);
        round.timer.unref?.();
      }
    });
  }
  function historyEntry(round) {
    return { id: round.id, number: round.number, crashPoint: round.crashPoint, at: round.crashAt };
  }
  function tick(round) {
    unschedule(round.timer);
    if (!["boarding", "flying"].includes(round.phase) || !round.startsAt) return;
    const time = now();
    let autoCashed = false;
    // Settle by the scheduled crossing time, even if the event loop wakes late.
    // A target equal to the crash point loses, just like a manual late cashout.
    for (const ticket of round.tickets) {
      if (ticket.status !== "holding" || !ticket.autoCashout) continue;
      const cashoutAt = round.startsAt + flightDuration(ticket.autoCashout);
      if (ticket.autoCashout >= round.crashPoint || time < cashoutAt) continue;
      Object.assign(ticket, settleTicket(ticket.amount, ticket.autoCashout), {
        multiplier: ticket.autoCashout, status: "cashing", cashoutAt, automatic: true,
      });
      autoCashed = true;
    }
    if (time >= round.crashAt) {
      round.phase = "crashed";
      for (const ticket of round.tickets) if (ticket.status === "holding") ticket.status = "lost";
      // Closing bets is synchronous, before database, GIF or network work.
      void flush(round).catch(error => { report("[maybay] Kết thúc chuyến:", error.message); retry(round); });
      return;
    }
    if (time >= round.startsAt && round.phase === "boarding") {
      round.phase = "flying";
      void notify(round, "takeoff");
    }
    if (autoCashed) void flush(round).catch(error => { report("[maybay] Tự rút:", error.message); retry(round); });
    const progressAt = Math.floor((time - round.startsAt) / FLIGHT_UPDATE_MS) * FLIGHT_UPDATE_MS;
    if (round.phase === "flying" && progressAt > 0 && progressAt > (round.lastProgressAt || 0)) {
      round.lastProgressAt = progressAt;
      void notify(round, "progress", { multiplier: multiplierAt(time - round.startsAt) });
    }
    let next = time < round.startsAt ? round.startsAt : Math.min(round.crashAt, round.startsAt + progressAt + FLIGHT_UPDATE_MS);
    if (round.phase === "flying") {
      for (const ticket of round.tickets) {
        if (ticket.status === "holding" && ticket.autoCashout && ticket.autoCashout < round.crashPoint) {
          next = Math.min(next, round.startsAt + flightDuration(ticket.autoCashout));
        }
      }
    }
    round.timer = schedule(() => tick(round), Math.max(1, next - now()));
    round.timer.unref?.();
  }
  async function recover(scope, meta) {
    const saved = await store.load(scope);
    if (!saved || saved.complete) return;
    const { _id, ...data } = saved;
    const round = { ...data, scope, saveQueue: Promise.resolve() };
    rooms.set(scope, round); context.set(scope, meta);
    if (!["crashed", "cancelled"].includes(round.phase)) {
      round.phase = "cancelled";
      for (const ticket of round.tickets) {
        if (ticket.status === "holding") { ticket.status = "refunding"; ticket.returned = ticket.amount; }
      }
    }
    try { await flush(round); } catch (error) { retry(round); throw error; }
    if (round.phase === "cancelled") void notify(round, "cancelled");
  }

  return {
    get(scope) { return rooms.get(scope); },
    async restore(scope, meta) {
      return locked(scope, async () => { if (!rooms.has(scope)) await recover(scope, meta); });
    },
    async history(scope) { return (await store.history(scope)).slice(-HISTORY_LIMIT); },
    async join(scope, player, stake, meta) {
      return locked(scope, async () => {
        if (!rooms.has(scope)) await recover(scope, meta);
        const amount = new Big(stake);
        if (amount.lt(MIN_BET) || !amount.eq(amount.round(0))) throw new Error("Vé phải là số nguyên từ 10.000 xu.");
        const autoCashout = parseAutoCashout(player.autoCashout);
        let round = rooms.get(scope);
        if (round && !round.complete && (round.phase !== "boarding" || (round.startsAt && now() >= round.startsAt))) {
          throw new Error("Chuyến đã cất cánh hoặc đang quyết toán. Đợi chuyến tiếp theo nhé!");
        }
        if (!round || round.complete) {
          if (round) unschedule(round.timer);
          const id = randomUUID();
          round = { scope, id, number: id.slice(0, 7).toUpperCase(), botId: String(meta.botId), threadId: String(meta.threadId), type: meta.type,
            phase: "boarding", startsAt: null, crashAt: null, crashPoint: chooseCrash(), tickets: [], complete: false, announced: false };
          rooms.set(scope, round); context.set(scope, meta);
        }
        if (round.tickets.some(t => t.uid === player.uid && t.status !== "refunded")) throw new Error("Bạn đã có vé trong chuyến này rồi.");
        // A refunded booking cannot reuse the same wallet operation in this round.
        if (round.tickets.some(t => t.uid === player.uid)) throw new Error("Vé trước đã được hoàn. Bạn hãy đợi chuyến tiếp theo.");
        const ticket = { ...player, autoCashout, amount: amount.toFixed(0), status: "buying" };
        round.tickets.push(ticket);
        try {
          await save(round);
          await store.changeBalance(ticket, round, amount.neg().toFixed(0), "debit");
        } catch (error) {
          // A network error may occur after debit commit; reconcile by receipt.
          ticket.bookingFailed = true;
          if (!round.startsAt) round.phase = "cancelled";
          try {
            if (await store.wasDebited(ticket, round)) {
              ticket.status = "refunding"; ticket.returned = ticket.amount;
              await pay(round, ticket);
            } else ticket.status = "refunded";
            await flush(round);
          } catch { retry(round); }
          throw error;
        }
        if (round.startsAt && now() >= round.startsAt) {
          ticket.status = "refunding"; ticket.returned = ticket.amount;
          try { await flush(round); } catch { retry(round); }
          throw new Error("Giao dịch vé hoàn tất sau giờ cất cánh; vé được hoàn về ví.");
        }
        ticket.status = "holding";
        if (!round.startsAt) {
          round.startsAt = now() + BOARDING_MS;
          round.crashAt = round.startsAt + flightDuration(round.crashPoint);
          round.timer = schedule(() => tick(round), BOARDING_MS);
          round.timer.unref?.();
        }
        try { await save(round); } catch (error) { report("[maybay] Lưu vé:", error.message); retry(round); }
        return { round: snapshot(round), ticket: { ...ticket }, remaining: Math.max(0, Math.ceil((round.startsAt - now()) / 1000)) };
      });
    },
    async cashout(scope, uid) {
      const round = rooms.get(scope);
      const ticket = round?.tickets.find(t => t.uid === uid);
      if (!ticket) throw new Error("Bạn chưa có vé máy bay trong cuộc trò chuyện này.");
      const time = now();
      if (["boarding", "flying"].includes(round.phase)) tick(round);
      if (ticket.status === "holding") {
        if (time < round.startsAt) throw new Error("Máy bay chưa cất cánh. Gõ rút hoặc nhảy khi đang bay.");
        if (time >= round.crashAt || !["boarding", "flying"].includes(round.phase)) {
          if (["boarding", "flying"].includes(round.phase)) tick(round);
          throw new Error(`Máy bay đã nổ tại ${round.crashPoint.toFixed(2)}x. Bạn không rút kịp!`);
        }
        ticket.multiplier = multiplierAt(time - round.startsAt);
        // Rounding must never make a valid pre-crash cashout equal the crash point.
        ticket.multiplier = Math.min(ticket.multiplier, Math.max(1, Math.round((round.crashPoint - 0.01) * 100) / 100));
        Object.assign(ticket, settleTicket(ticket.amount, ticket.multiplier), { status: "cashing", cashoutAt: time });
      }
      if (ticket.status === "cashing") {
        try { await flush(round); } catch (error) { retry(round); throw new Error(`Đã chốt rút ${ticket.multiplier.toFixed(2)}x; ví đang lỗi, bot sẽ tự cộng lại đúng số tiền.`, { cause: error }); }
      }
      if (ticket.status === "cashed") return { ...ticket };
      if (ticket.status === "lost") throw new Error(`Máy bay đã nổ tại ${round.crashPoint.toFixed(2)}x. Bạn mất vé ${ticket.amount} xu.`);
      throw new Error("Vé đang được xử lý hoặc hoàn tiền. Vui lòng chờ một chút.");
    },
    dispose() {
      for (const round of rooms.values()) { unschedule(round.timer); unschedule(round.retryTimer); }
      rooms.clear(); context.clear();
    },
  };
}
