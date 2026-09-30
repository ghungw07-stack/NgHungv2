export const GAME_ECONOMY_COLLECTIONS = Object.freeze([
  "baccarat_history",
  "banca_history",
  "daga_history",
  "forex_markets",
  "forex_positions",
  "game_captcha_challenges",
  "game_elemental_states",
  "game_history",
  "game_loan_transactions",
  "game_loans",
  "game_reward_funds",
  "game_reward_payouts",
  "game_robbery_state",
  "game_savings_accounts",
  "game_savings_transactions",
  "game_slot_history",
  "game_slot_jackpots",
  "game_system_events",
  "game_transactions",
  "keno_history",
  "longho_history",
  "maybay_history",
  "maybay_rounds",
  "roulette_history",
  "sicbo_history",
  "virtual_stock_market",
  "virtual_stock_portfolios",
  "xocdia_history",
]);

export const GAME_ECONOMY_PLAYER_RESET = Object.freeze({
  balance: "10000",
  pendingRefund: "0",
  totalWinnings: "0",
  totalLosses: "0",
  netProfit: "0",
  totalGames: 0,
  totalWinGames: 0,
  winRate: 0,
  lastDailyReward: null,
  lastRescueAt: null,
  lastWeeklyAllowanceWeek: null,
  lastAllowanceAt: null,
  allowanceFundWeek: null,
  allowanceFundUsed: "0",
  lastMemberRewardDay: null,
  lastMemberRewardAt: null,
  lastRefundClaimAt: null,
});

const GAME_ECONOMY_PLAYER_UNSET = Object.freeze({
  maybayReceipts: "",
  overlordDailyRepairAt: "",
  overlordDailyRepairKey: "",
  veSoWallet: "",
  xoso45sWallet: "",
});

/**
 * Khởi tạo lại nền kinh tế game nhưng không đụng tới rankPoints, specialTier,
 * vipExpireAt, hồ sơ nhận diện, quyền riêng tư hay nhật ký nạp dùng đối soát tier.
 */
export async function resetGameEconomy(database, playersTable) {
  const players = await database.collection(playersTable).updateMany({}, {
    $set: { ...GAME_ECONOMY_PLAYER_RESET },
    $unset: { ...GAME_ECONOMY_PLAYER_UNSET },
  });

  const deleted = {};
  await Promise.all(GAME_ECONOMY_COLLECTIONS.map(async (name) => {
    const result = await database.collection(name).deleteMany({});
    deleted[name] = Number(result.deletedCount || 0);
  }));

  return {
    playersMatched: Number(players.matchedCount || 0),
    playersModified: Number(players.modifiedCount || 0),
    deleted,
  };
}

/** Giữ cấu hình/nhóm đang hoạt động nhưng xoá mọi ván và vé có thể trả tiền cũ. */
export function resetPersistedGameState(state = {}, defaultJackpot = "0") {
  const next = structuredClone(state || {});
  for (const game of ["taixiu", "chanle", "baucua", "vietlott655"]) {
    if (!next[game]) continue;
    next[game].history = [];
    next[game].jackpot = String(defaultJackpot);
    next[game].jackpots = {};
    if (next[game].players) next[game].players = {};
  }
  if (next.xoso45s) {
    next.xoso45s.history = [];
    next.xoso45s.players = {};
  }
  if (next.xidach) next.xidach = {};
  return next;
}
