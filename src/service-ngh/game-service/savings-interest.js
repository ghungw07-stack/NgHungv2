import Big from "big.js";

export const SAVINGS_DAY_MS = 86400000;

export function calculateSavingsInterest(account, tier, now = new Date()) {
  const principal = new Big(account?.principal || 0);
  const last = new Date(account?.lastInterestAt || now);
  const elapsed = now.getTime() - last.getTime();
  const days = Number.isFinite(elapsed) ? Math.max(0, Math.floor(elapsed / SAVINGS_DAY_MS)) : 0;
  const lastInterestAt = days ? new Date(last.getTime() + days * SAVINGS_DAY_MS) : last;
  const amount = days && principal.gt(0) && tier.rate > 0
    ? principal.times(new Big(1).plus(tier.rate).pow(days)).round(0, Big.roundDown)
    : principal;
  return { principal: amount, interest: amount.minus(principal), days, lastInterestAt };
}

// Additional deposits carry no past interest. Keep the elapsed time earned by
// the existing principal, weighted by its share of the new deposit balance.
export function depositInterestDate(account, amount, now) {
  const principal = new Big(account.principal || 0);
  if (principal.lte(0)) return now;
  const elapsed = Math.max(0, now - new Date(account.lastInterestAt || now));
  const retained = new Big(elapsed).times(principal).div(principal.plus(amount)).round(0, Big.roundDown).toNumber();
  return new Date(now.getTime() - retained);
}

export async function accrueSavingsAccount(db, playerId, tier, now = new Date()) {
  const accounts = db.collection("game_savings_accounts");
  for (let attempt = 0; attempt < 8; attempt++) {
    const existing = await accounts.findOne({ playerId: String(playerId) });
    const account = existing || { playerId: String(playerId), principal: "0", lastInterestAt: now };
    const accrued = calculateSavingsInterest(account, tier, now);
    if (existing && accrued.days) {
      const result = await accounts.updateOne(
        { _id: existing._id, principal: existing.principal, lastInterestAt: existing.lastInterestAt ?? null },
        { $set: { principal: accrued.principal.toString(), lastInterestAt: accrued.lastInterestAt, updatedAt: now } }
      );
      if (result.modifiedCount !== 1) continue;
      if (accrued.interest.gt(0)) await db.collection("game_savings_transactions").insertOne({
        playerId: String(playerId), type: "interest", amount: accrued.interest.toString(),
        balanceAfter: accrued.principal.toString(), createdAt: now,
      });
    }
    return { account: { ...account, principal: accrued.principal.toString(), lastInterestAt: accrued.lastInterestAt }, ...accrued };
  }
  throw new Error("Sổ tiết kiệm vừa thay đổi, vui lòng thử lại.");
}

export function startSavingsInterestAccrual(db, playersTable, getTier) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      for await (const account of db.collection("game_savings_accounts").find({ principal: { $nin: ["0", 0] } })) {
        try {
          const player = await db.collection(playersTable).findOne({ idUserZalo: account.playerId });
          if (player) await accrueSavingsAccount(db, account.playerId, getTier(player.rankPoints || 0));
        } catch (error) { console.error("[Savings]", account.playerId, error.message); }
      }
    } finally { running = false; }
  };
  const run = () => void tick().catch(error => console.error("[Savings]", error.message));
  const timer = setInterval(run, 60000);
  timer.unref?.();
  run();
  return timer;
}
