import Big from "big.js";

export const SAVINGS_DAY_MS = 86400000;
export const SAVINGS_HOUR_MS = 3600000;
export const VIETNAM_UTC_OFFSET_MS = 7 * SAVINGS_HOUR_MS;

export function calculateOneNightSavingsInterest(principal, tier) {
  const amount = new Big(principal || 0);
  const dailyRate = Math.max(0, Number(tier?.rate) || 0);
  return amount.gt(0) && dailyRate > 0
    ? amount.times(String(dailyRate)).round(0, Big.roundDown)
    : new Big(0);
}

function getVietnamDayNumber(date) {
  return Math.floor((date.getTime() + VIETNAM_UTC_OFFSET_MS) / SAVINGS_DAY_MS);
}

function getVietnamMidnight(dayNumber) {
  return new Date(dayNumber * SAVINGS_DAY_MS - VIETNAM_UTC_OFFSET_MS);
}

export function calculateSavingsInterest(account, tier, now = new Date()) {
  const principal = new Big(account?.principal || 0);
  const storedLast = new Date(account?.lastInterestAt || now);
  const needsTimestampRepair = !Number.isFinite(storedLast.getTime());
  const last = needsTimestampRepair ? now : storedLast;
  const currentDay = getVietnamDayNumber(now);
  const lastDay = getVietnamDayNumber(last);
  const days = needsTimestampRepair ? 0 : Math.max(0, currentDay - lastDay);
  const lastInterestAt = days ? getVietnamMidnight(currentDay) : last;
  const dailyRate = Math.max(0, Number(tier?.rate) || 0);
  const amount = days && principal.gt(0) && dailyRate > 0
    ? principal.times(new Big(1).plus(dailyRate).pow(days)).round(0, Big.roundDown)
    : principal;
  return { principal: amount, interest: amount.minus(principal), hours: days * 24, days, lastInterestAt, needsTimestampRepair };
}

export function depositInterestDate(account, amount, now) {
  const last = new Date(account?.lastInterestAt || now);
  return Number.isFinite(last.getTime()) ? last : now;
}

export async function accrueSavingsAccount(db, playerId, tier, now = new Date()) {
  const accounts = db.collection("game_savings_accounts");
  for (let attempt = 0; attempt < 8; attempt++) {
    const existing = await accounts.findOne({ playerId: String(playerId) });
    const account = existing || { playerId: String(playerId), principal: "0", lastInterestAt: now };
    const accrued = calculateSavingsInterest(account, tier, now);
    if (existing && (accrued.days || accrued.needsTimestampRepair)) {
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
          if (player) await accrueSavingsAccount(db, account.playerId, getTier(player));
        } catch (error) { console.error("[Savings]", account.playerId, error.message); }
      }
    } finally { running = false; }
  };
  const run = () => void tick().catch(error => console.error("[Savings]", error.message));
  const scheduleNextMidnight = () => {
    const now = new Date();
    const nextMidnight = getVietnamMidnight(getVietnamDayNumber(now) + 1);
    const timer = setTimeout(() => {
      run();
      scheduleNextMidnight();
    }, Math.max(1000, nextMidnight.getTime() - now.getTime()));
    timer.unref?.();
    return timer;
  };
  const timer = scheduleNextMidnight();
  timer.unref?.();
  run();
  return timer;
}
