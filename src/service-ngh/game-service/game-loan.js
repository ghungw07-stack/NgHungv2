import Big from "big.js";

export const GAME_LOAN_HOURLY_RATE = new Big("0.10");
export const GAME_LOAN_HOUR_MS = 60 * 60 * 1000;
export const GAME_LOAN_LATE_AFTER_HOURS = 5;
// Khoản phạt được tính một lần trên tiền gốc khi khoản vay quá hạn.
export const GAME_LOAN_LATE_PENALTY_RATE = new Big("5");
export const GAME_LOAN_MINIMUM = new Big("1000000");
export const GAME_LOAN_DAILY_RATIO = new Big("0.90");

function money(value) {
  try {
    return new Big(value || 0).round(0, Big.roundDown);
  } catch {
    return new Big(0);
  }
}

export function calculateGameLoanAccrual(loan = {}, now = new Date()) {
  const principal = money(loan.principalRemaining ?? loan.principal);
  const storedInterest = money(loan.interestOutstanding);
  const storedPenalty = money(loan.penaltyOutstanding);
  const last = new Date(loan.lastAccruedAt || loan.createdAt || now);
  const validLast = Number.isFinite(last.getTime()) ? last : now;
  // Lãi tính theo giờ và làm tròn lên tối thiểu 1 giờ. Vì vậy tất toán sau
  // vài phút vẫn chịu 1 giờ lãi; chỉ thời điểm tạo khoản vay chính xác mới là
  // 0 giờ.
  const elapsedMs = Math.max(0, now.getTime() - validLast.getTime());
  const elapsedHours = elapsedMs > 0
    ? Math.max(1, Math.floor(elapsedMs / GAME_LOAN_HOUR_MS))
    : 0;
  const accrualStart = validLast;
  const addedInterest = elapsedHours > 0 && principal.gt(0)
    ? principal.times(GAME_LOAN_HOURLY_RATE).times(elapsedHours).round(0, Big.roundDown)
    : new Big(0);
  const interest = storedInterest.plus(addedInterest);
  const createdAt = new Date(loan.createdAt || now);
  const isLate = Number.isFinite(createdAt.getTime())
    && now.getTime() - createdAt.getTime() >= GAME_LOAN_LATE_AFTER_HOURS * GAME_LOAN_HOUR_MS
    && principal.plus(interest).plus(storedPenalty).gt(0);
  const penaltyAdded = isLate && loan.latePenaltyApplied !== true
    ? money(loan.principal).times(GAME_LOAN_LATE_PENALTY_RATE).round(0, Big.roundDown)
    : new Big(0);
  const penalty = storedPenalty.plus(penaltyAdded);
  return {
    principal,
    interest,
    penalty,
    debt: principal.plus(interest).plus(penalty),
    elapsedHours,
    addedInterest,
    penaltyAdded,
    lateTriggered: penaltyAdded.gt(0),
    lastAccruedAt: elapsedHours > 0
      ? new Date(accrualStart.getTime() + elapsedHours * GAME_LOAN_HOUR_MS)
      : accrualStart,
  };
}

/**
 * Ngân hàng xét duyệt bằng tài sản/lịch sử; số giải ngân luôn bằng 90% Daily
 * của tier và không phụ thuộc ngân hàng của người chơi khác.
 */
export function calculateGameLoanLimit(player = {}, savings = "0", dailyReward = "0", lateCount = 0) {
  const wallet = money(player.balance);
  const savingsBalance = money(savings);
  const assets = wallet.plus(savingsBalance);
  const winnings = money(player.totalWinnings);
  const losses = money(player.totalLosses).abs();
  const turnover = winnings.plus(losses);
  const daily = money(dailyReward);
  const games = Math.max(0, Number(player.totalGames) || 0);
  const wins = Math.max(0, Number(player.totalWinGames) || 0);
  const winRate = games > 0 ? Math.min(100, (wins / games) * 100) : 0;
  const badDebtCount = Math.max(0, Number(lateCount) || 0);

  if (badDebtCount >= 2) {
    return { limit: new Big(0), assets, turnover, dailyCredit: new Big(0), games, winRate, lateCount: badDebtCount, reason: "Ngân hàng từ chối: hồ sơ đã có 2 lần nợ xấu." };
  }

  if (games < 3 && assets.lt(GAME_LOAN_MINIMUM.times(2))) {
    return { limit: new Big(0), assets, turnover, dailyCredit: new Big(0), games, winRate, lateCount: badDebtCount, reason: "Ngân hàng từ chối: cần ít nhất 3 ván chơi hoặc 2 triệu tài sản." };
  }

  // Số tiền ngân hàng giải ngân là cố định 90% Daily của tier. Số dư và lịch
  // sử chỉ dùng để duyệt/từ chối, tuyệt đối không cho người chơi tự chọn mức.
  const ratio = badDebtCount === 1 ? GAME_LOAN_DAILY_RATIO.div(2) : GAME_LOAN_DAILY_RATIO;
  const dailyCredit = daily.times(ratio).round(0, Big.roundDown);
  const limit = dailyCredit;
  return { limit, assets, turnover, dailyCredit, games, winRate, lateCount: badDebtCount, ratio, reason: null };
}

async function recordLoanTransaction(db, data) {
  await db.collection("game_loan_transactions").insertOne({
    ...data,
    playerId: String(data.playerId),
    amount: money(data.amount).toString(),
    balanceAfter: money(data.balanceAfter).toString(),
    createdAt: data.createdAt instanceof Date ? data.createdAt : new Date(),
  });
}

export async function collectGameLoan(db, playersTable, playerId, now = new Date(), { force = false } = {}) {
  const loans = db.collection("game_loans");
  const players = db.collection(playersTable);
  const savingsAccounts = db.collection("game_savings_accounts");
  const normalizedId = String(playerId);

  for (let attempt = 0; attempt < 6; attempt++) {
    const loan = await loans.findOne({ playerId: normalizedId, status: "active" });
    if (!loan) return { active: false, paid: false, collected: "0", debt: "0" };

    const accrued = calculateGameLoanAccrual(loan, now);
    const collectionStartsAt = new Date(loan.collectionStartsAt || new Date(loan.createdAt).getTime() + GAME_LOAN_HOUR_MS);
    if (!force && now < collectionStartsAt) {
      return { active: true, paid: false, collected: "0", ...accrued, debt: accrued.debt.toString() };
    }

    const player = await players.findOne({ idUserZalo: normalizedId });
    if (!player) return { active: true, paid: false, collected: "0", ...accrued, debt: accrued.debt.toString() };
    const wallet = money(player.balance);
    const savingsAccount = await savingsAccounts.findOne({ playerId: normalizedId });
    const savings = money(savingsAccount?.principal);
    const walletPayment = wallet.lt(accrued.debt) ? wallet : accrued.debt;
    const remainingAfterWallet = accrued.debt.minus(walletPayment);
    const savingsPayment = savings.lt(remainingAfterWallet) ? savings : remainingAfterWallet;
    const payment = walletPayment.plus(savingsPayment);
    if (payment.lte(0) && accrued.elapsedHours === 0) {
      return { active: true, paid: false, collected: "0", ...accrued, debt: accrued.debt.toString() };
    }

    let penaltyAfter = accrued.penalty;
    let interestAfter = accrued.interest;
    let principalAfter = accrued.principal;
    const penaltyPayment = payment.lt(penaltyAfter) ? payment : penaltyAfter;
    penaltyAfter = penaltyAfter.minus(penaltyPayment);
    const afterPenaltyPayment = payment.minus(penaltyPayment);
    const interestPayment = afterPenaltyPayment.lt(interestAfter) ? afterPenaltyPayment : interestAfter;
    interestAfter = interestAfter.minus(interestPayment);
    const principalPayment = afterPenaltyPayment.minus(interestPayment);
    principalAfter = principalAfter.minus(principalPayment);
    if (principalAfter.lt(0)) principalAfter = new Big(0);
    const debtAfter = principalAfter.plus(interestAfter).plus(penaltyAfter);
    const balanceAfter = wallet.minus(walletPayment);
    const savingsAfter = savings.minus(savingsPayment);
    const paid = debtAfter.eq(0);
    const totalPaid = money(loan.totalPaid).plus(payment);
    const totalInterestPaid = money(loan.totalInterestPaid).plus(interestPayment);
    const totalPrincipalPaid = money(loan.totalPrincipalPaid).plus(principalPayment);
    const totalInterestCharged = money(loan.totalInterestCharged).plus(accrued.addedInterest);
    const totalPenaltyPaid = money(loan.totalPenaltyPaid).plus(penaltyPayment);
    const totalPenaltyCharged = money(loan.totalPenaltyCharged).plus(accrued.penaltyAdded);

    const loanResult = await loans.updateOne(
      {
        _id: loan._id,
        status: "active",
        principalRemaining: loan.principalRemaining,
        interestOutstanding: loan.interestOutstanding || "0",
        lastAccruedAt: loan.lastAccruedAt,
      },
      { $set: {
        principalRemaining: principalAfter.toString(),
        interestOutstanding: interestAfter.toString(),
        penaltyOutstanding: penaltyAfter.toString(),
        lastAccruedAt: accrued.lastAccruedAt,
        debt: debtAfter.toString(),
        totalPaid: totalPaid.toString(),
        totalInterestPaid: totalInterestPaid.toString(),
        totalPrincipalPaid: totalPrincipalPaid.toString(),
        totalInterestCharged: totalInterestCharged.toString(),
        totalPenaltyPaid: totalPenaltyPaid.toString(),
        totalPenaltyCharged: totalPenaltyCharged.toString(),
        latePenaltyApplied: loan.latePenaltyApplied === true || accrued.lateTriggered,
        ...(accrued.lateTriggered ? { lateAt: now } : {}),
        status: paid ? "paid" : "active",
        updatedAt: now,
        ...(paid ? { paidAt: now } : {}),
      } }
    );
    if (loanResult.modifiedCount !== 1) continue;

    if (payment.gt(0)) {
      let walletUpdated = false;
      if (walletPayment.gt(0)) {
        const playerResult = await players.updateOne(
          { _id: player._id, balance: player.balance },
          { $set: { balance: balanceAfter.toString() } }
        );
        walletUpdated = playerResult.modifiedCount === 1;
      }
      let savingsUpdated = false;
      if (savingsPayment.gt(0) && savingsAccount) {
        const savingsResult = await savingsAccounts.updateOne(
          { _id: savingsAccount._id, principal: savingsAccount.principal },
          { $set: { principal: savingsAfter.toString(), updatedAt: now } }
        );
        savingsUpdated = savingsResult.modifiedCount === 1;
      }
      if ((walletPayment.gt(0) && !walletUpdated) || (savingsPayment.gt(0) && !savingsUpdated)) {
        if (walletUpdated) {
          await players.updateOne({ _id: player._id, balance: balanceAfter.toString() }, { $set: { balance: player.balance } });
        }
        if (savingsUpdated) {
          await savingsAccounts.updateOne({ _id: savingsAccount._id, principal: savingsAfter.toString() }, { $set: { principal: savingsAccount.principal, updatedAt: now } });
        }
        await loans.updateOne({ _id: loan._id }, { $set: {
          principalRemaining: accrued.principal.toString(),
          interestOutstanding: accrued.interest.toString(),
          penaltyOutstanding: String(loan.penaltyOutstanding || "0"),
          lastAccruedAt: accrued.lastAccruedAt,
          debt: accrued.debt.toString(),
          totalPaid: String(loan.totalPaid || "0"),
          totalInterestPaid: String(loan.totalInterestPaid || "0"),
          totalPrincipalPaid: String(loan.totalPrincipalPaid || "0"),
          totalInterestCharged: String(loan.totalInterestCharged || "0"),
          totalPenaltyPaid: String(loan.totalPenaltyPaid || "0"),
          totalPenaltyCharged: String(loan.totalPenaltyCharged || "0"),
          latePenaltyApplied: loan.latePenaltyApplied === true,
          status: "active",
          updatedAt: now,
        }, $unset: { paidAt: "", ...(loan.lateAt ? {} : { lateAt: "" }) } });
        continue;
      }
      if (savingsPayment.gt(0)) {
        await db.collection("game_savings_transactions").insertOne({
          playerId: normalizedId,
          type: "loan_repayment",
          amount: savingsPayment.toString(),
          balanceAfter: savingsAfter.toString(),
          detail: "Ngân hàng tự trừ tiết kiệm để thu nợ vay",
          createdAt: now,
        });
      }
      await recordLoanTransaction(db, {
        playerId: normalizedId,
        type: "repayment",
        amount: payment,
        balanceAfter,
        debtAfter,
        principalPaid: principalPayment.toString(),
        interestPaid: interestPayment.toString(),
        penaltyPaid: penaltyPayment.toString(),
        walletPaid: walletPayment.toString(),
        savingsPaid: savingsPayment.toString(),
        savingsAfter: savingsAfter.toString(),
        detail: `Thu nợ: ví ${walletPayment.toString()} VNĐ, ngân hàng ${savingsPayment.toString()} VNĐ; trả phạt ${penaltyPayment.toString()} VNĐ, lãi ${interestPayment.toString()} VNĐ, gốc ${principalPayment.toString()} VNĐ`,
        createdAt: now,
      });
    }
    return {
      active: !paid,
      paid,
      collected: payment.toString(),
      balanceAfter: balanceAfter.toString(),
      savingsAfter: savingsAfter.toString(),
      walletPaid: walletPayment.toString(),
      savingsPaid: savingsPayment.toString(),
      principalAfter: principalAfter.toString(),
      interestAfter: interestAfter.toString(),
      penaltyAfter: penaltyAfter.toString(),
      totalPaid: totalPaid.toString(),
      totalInterestPaid: totalInterestPaid.toString(),
      totalPrincipalPaid: totalPrincipalPaid.toString(),
      totalPenaltyPaid: totalPenaltyPaid.toString(),
      ...accrued,
      debt: debtAfter.toString(),
    };
  }
  throw new Error("Khoản vay vừa thay đổi, vui lòng thử lại.");
}

export async function createGameLoan(db, playersTable, playerId, dailyReward = "0", now = new Date()) {
  const normalizedId = String(playerId);
  const players = db.collection(playersTable);
  const loans = db.collection("game_loans");
  const player = await players.findOne({ idUserZalo: normalizedId });
  if (!player) return { success: false, message: "Không tìm thấy hồ sơ game." };

  await collectGameLoan(db, playersTable, normalizedId, now);
  const active = await loans.findOne({ playerId: normalizedId, status: "active" });
  if (active) {
    const accrued = calculateGameLoanAccrual(active, now);
    return { success: false, message: "Bạn đang có khoản vay chưa tất toán.", debt: accrued.debt.toString() };
  }

  const savings = await db.collection("game_savings_accounts").findOne({ playerId: normalizedId });
  const credit = calculateGameLoanLimit(player, savings?.principal || 0, dailyReward);
  const amount = credit.limit;
  if (credit.limit.lte(0)) return { success: false, message: credit.reason || "Tier hiện tại chưa có mức Daily để cấp khoản vay.", ...credit };

  const balanceBefore = money(player.balance);
  let balanceAfter = balanceBefore.plus(amount);
  const collectionStartsAt = new Date(now.getTime() + GAME_LOAN_HOUR_MS);
  const loanDoc = {
    playerId: normalizedId,
    principal: amount.toString(),
    principalRemaining: amount.toString(),
    interestOutstanding: "0",
    debt: amount.toString(),
    totalPaid: "0",
    totalInterestPaid: "0",
    totalPrincipalPaid: "0",
    totalInterestCharged: "0",
    hourlyRate: GAME_LOAN_HOURLY_RATE.toString(),
    status: "active",
    createdAt: now,
    lastAccruedAt: now,
    collectionStartsAt,
    updatedAt: now,
  };
  await loans.updateOne({ playerId: normalizedId }, { $set: loanDoc }, { upsert: true });
  // Số dư có thể bị một ván game khác cập nhật giữa lúc đọc hồ sơ và giải
  // ngân. Đọc lại rồi retry compare-and-set để không làm mất khoản vay chỉ vì
  // lần cập nhật đầu tiên đụng giao dịch đồng thời.
  let walletUpdated = false;
  for (let attempt = 0; attempt < 6; attempt++) {
    const latestPlayer = attempt === 0
      ? player
      : await players.findOne({ idUserZalo: normalizedId });
    if (!latestPlayer) break;
    const latestBalance = money(latestPlayer.balance);
    const latestBalanceAfter = latestBalance.plus(amount);
    const result = await players.updateOne(
      { _id: latestPlayer._id, balance: latestPlayer.balance },
      { $set: { balance: latestBalanceAfter.toString() } }
    );
    if (result.modifiedCount === 1) {
      walletUpdated = true;
      balanceAfter = latestBalanceAfter;
      break;
    }
  }
  if (!walletUpdated) {
    await loans.updateOne({ playerId: normalizedId, createdAt: now }, { $set: { status: "cancelled", updatedAt: new Date() } });
    return { success: false, message: "Số dư vừa thay đổi, hãy thử vay lại." };
  }
  await recordLoanTransaction(db, {
    playerId: normalizedId,
    type: "disbursement",
    amount,
    balanceAfter,
    debtAfter: amount.toString(),
    detail: "Giải ngân từ Ngân hàng Game",
    createdAt: now,
  });
  return { success: true, amount: amount.toString(), balanceAfter: balanceAfter.toString(), collectionStartsAt, ...credit };
}

export function startGameLoanCollection(db, playersTable, intervalMs = 60_000) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      for await (const loan of db.collection("game_loans").find({ status: "active" }, { projection: { playerId: 1 } })) {
        try {
          await collectGameLoan(db, playersTable, loan.playerId);
        } catch (error) {
          console.error("[GameLoan]", loan.playerId, error?.message || error);
        }
      }
    } finally {
      running = false;
    }
  };
  const run = () => void tick().catch((error) => console.error("[GameLoan]", error?.message || error));
  run();
  const timer = setInterval(run, Math.max(10_000, intervalMs));
  timer.unref?.();
  return timer;
}
