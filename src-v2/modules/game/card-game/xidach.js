import crypto from "node:crypto";
import Big from "big.js";
import { createDeck, handScore, isBlackjack } from "./cards.js";
import { formatMoney, parseAmount } from "../economy/amount.js";

export class XiDachGame {
  constructor({ sessions, players, scheduler, botId }) {
    Object.assign(this, { sessions, players, scheduler, botId: String(botId) });
  }
  start() { this.scheduler.every(`xidach:expiry:${this.botId}`, 10_000, () => this.refundExpired()); }
  stop() { this.scheduler.cancel(`xidach:expiry:${this.botId}`); }
  async refundExpired() {
    for (const session of await this.sessions.expired("xidach")) {
      const finished = await this.sessions.finish(session, "expired", { reason: "timeout" });
      if (finished) await this.players.creditOnce(session.data.userId, session.data.stake, `xidach:refund:${session._id}`, { reason: "timeout" });
    }
  }
  async open({ threadId, userId, userName, amount }) {
    const stake = await this.players.debit(userId, amount, { name: userName, game: "xidach" });
    const deck = createDeck();
    const data = { userId: String(userId), userName, stake, player: [deck.pop(), deck.pop()], dealer: [deck.pop(), deck.pop()], deck };
    try { return await this.sessions.create(threadId, "xidach", data, 5 * 60_000); }
    catch (error) {
      await this.players.creditOnce(userId, stake, `xidach:open-refund:${crypto.randomUUID()}`, { reason: "session_exists" });
      throw error;
    }
  }
  async hit(session, userId) {
    if (session.data.userId !== String(userId)) throw new Error("Bạn không phải người chơi của ván này");
    const data = structuredClone(session.data);
    data.player.push(data.deck.pop());
    const score = handScore(data.player);
    if (score > 21) {
      await this.sessions.finish(session, "lost", { finalData: data });
      return { finished: true, outcome: "bust", data, score, payout: "0" };
    }
    await this.sessions.update(session, data, 5 * 60_000);
    return { finished: false, data, score };
  }
  async stand(session, userId) {
    if (session.data.userId !== String(userId)) throw new Error("Bạn không phải người chơi của ván này");
    const data = structuredClone(session.data);
    while (handScore(data.dealer) < 17) data.dealer.push(data.deck.pop());
    const playerScore = handScore(data.player), dealerScore = handScore(data.dealer);
    let outcome = "lose", multiplier = new Big(0);
    if (playerScore <= 21 && (dealerScore > 21 || playerScore > dealerScore)) {
      outcome = "win"; multiplier = isBlackjack(data.player) ? new Big("2.5") : new Big(2);
    } else if (playerScore === dealerScore) { outcome = "draw"; multiplier = new Big(1); }
    const payout = new Big(data.stake).times(multiplier).round(0, Big.roundDown).toFixed(0);
    const finished = await this.sessions.finish(session, outcome, { finalData: data, playerScore, dealerScore, payout });
    if (!finished) throw new Error("Ván đã được xử lý");
    if (new Big(payout).gt(0)) await this.players.creditOnce(userId, payout, `xidach:payout:${session._id}`, { outcome });
    return { finished: true, outcome, data, playerScore, dealerScore, payout };
  }
}

function showHand(hand) { return hand.join(" "); }

export function registerXiDachCommand(registry, { game, sessions, players }) {
  registry.register({
    name: "xidach",
    aliases: ["blackjack"],
    description: "Chơi Xì Dách với bot",
    async execute({ args, threadId, senderId, message, reply }) {
      const action = String(args[0] || "help").toLowerCase();
      if (action === "start") {
        const balance = await players.balance(senderId, message?.data?.dName);
        const amount = parseAmount(args[1], balance);
        const session = await game.open({ threadId, userId: senderId, userName: message?.data?.dName || senderId, amount });
        await reply(`Bài của bạn: ${showHand(session.data.player)} (${handScore(session.data.player)})\nBài nhà cái: ${session.data.dealer[0]} [?]\nDùng !xidach hit hoặc !xidach stand`);
        return;
      }
      const session = await sessions.get(threadId, "xidach");
      if (!session) { await reply("Dùng: !xidach start <tiền cược>"); return; }
      if (action === "hit") {
        const result = await game.hit(session, senderId);
        await reply(result.finished
          ? `Bài: ${showHand(result.data.player)} (${result.score}) — QUẮC, bạn thua.`
          : `Bài: ${showHand(result.data.player)} (${result.score})\nDùng !xidach hit hoặc !xidach stand`);
        return;
      }
      if (action === "stand") {
        const result = await game.stand(session, senderId);
        await reply([
          `Bạn: ${showHand(result.data.player)} (${result.playerScore})`,
          `Nhà cái: ${showHand(result.data.dealer)} (${result.dealerScore})`,
          `${result.outcome.toUpperCase()} — nhận ${formatMoney(result.payout)} coin`,
        ].join("\n"));
        return;
      }
      await reply(`Bài của bạn: ${showHand(session.data.player)} (${handScore(session.data.player)})\nDùng !xidach hit hoặc !xidach stand`);
    },
  });
}
