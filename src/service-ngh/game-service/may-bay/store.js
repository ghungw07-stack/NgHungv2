import Big from "big.js";
import { createHash } from "node:crypto";
import { HISTORY_LIMIT } from "./rules.js";

// Adapters take the current connection lazily; importing this module never starts a bot.
export function createCrashStore(getConnection, getPlayersTable) {
  const rounds = () => getConnection().collection("maybay_rounds");
  const histories = () => getConnection().collection("maybay_history");
  const players = () => getConnection().collection(getPlayersTable());
  const receiptField = (scope) => `maybayReceipts.${createHash("sha256").update(scope).digest("hex").slice(0, 32)}`;

  return {
    async load(scope) { return rounds().findOne({ _id: scope }); },
    async pending(botId) {
      return rounds().find({ botId: String(botId), complete: false }).toArray();
    },
    async save(round) {
      const { scope, ...data } = round;
      await rounds().updateOne({ _id: scope }, { $set: data }, { upsert: true });
    },
    async history(scope) {
      return (await histories().findOne({ _id: scope }))?.entries || [];
    },
    async addHistory(scope, entry) {
      await histories().updateOne({ _id: scope }, { $setOnInsert: { entries: [] } }, { upsert: true });
      await histories().updateOne(
        { _id: scope, "entries.id": { $ne: entry.id } },
        { $push: { entries: { $each: [entry], $slice: -HISTORY_LIMIT } } },
      );
    },
    async wasDebited(ticket, round) {
      const field = receiptField(round.scope);
      const row = await players().findOne({ username: ticket.username }, { projection: { [field]: 1 } });
      const receipt = row?.maybayReceipts?.[field.split(".")[1]];
      return receipt?.roundId === round.id && receipt.debit === true;
    },
    async changeBalance(ticket, round, amount, kind) {
      const delta = new Big(amount);
      const field = receiptField(round.scope);
      const key = field.split(".")[1];
      for (let attempt = 0; attempt < 8; attempt++) {
        const player = await players().findOne({ username: ticket.username });
        if (!player) throw new Error("Không tìm thấy ví game.");
        const previous = player.maybayReceipts?.[key];
        const receipt = previous?.roundId === round.id ? previous : { roundId: round.id };
        // Balance and receipt are committed atomically in the same Mongo document.
        // Retrying an acknowledged or ambiguous write cannot pay/debit twice.
        if (receipt[kind]) return { balance: player.balance };
        if (kind === "credit" && !receipt.debit) throw new Error("Vé chưa được trừ tiền.");
        const balance = new Big(player.balance || 0).plus(delta);
        if (balance.lt(0)) throw new Error("Số dư không đủ để mua vé.");
        const changed = await players().updateOne(
          { _id: player._id, balance: player.balance, [field]: previous ?? { $exists: false } },
          { $set: { balance: balance.toFixed(0), [field]: { ...receipt, [kind]: true } } },
        );
        if (changed.modifiedCount === 1) return { balance: balance.toFixed(0) };
      }
      throw new Error("Ví vừa thay đổi, vui lòng thử lại.");
    },
  };
}
