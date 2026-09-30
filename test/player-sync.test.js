import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateGameNetProfit,
  getExactGameIdentityProfile,
  isHiddenLeaderboardPlayer,
  getStableGameIdentity,
  isGamePlayerOwnedByBot,
  mergeGamePlayerDocuments,
  resolveGamePlayerAliasTarget,
  selectLocalGamePlayer,
} from "../src/database/player-sync.js";
import { compactMoney, getGameTiers, getPlayerGameTier, OVERLORD_TIER } from "../src/utils/canvas/game-finance.js";

test("hồ sơ Nguyễn Gia Hưng bị loại khỏi bảng xếp hạng", () => {
  assert.equal(isHiddenLeaderboardPlayer({ idUserZalo: "t_m7e09z0izz" }), true);
  assert.equal(isHiddenLeaderboardPlayer({ idUserZalo: "private:server:t_m7e09z0izz_0" }), true);
  assert.equal(isHiddenLeaderboardPlayer({ idUserZalo: "another-player", playerName: "Nguyễn Gia Hưng" }), false);
});

test("mergeGamePlayerDocuments keeps all shared game balance and tier data", () => {
  const merged = mergeGamePlayerDocuments(
    {
      idUserZalo: "t_m7e09z0izz",
      balance: "100",
      rankPoints: 200,
      totalWinnings: "300",
      totalLosses: "40",
      pendingRefund: "5",
      totalGames: 4,
      totalWinGames: 3,
      allowanceFundWeek: "2026-W38",
      allowanceFundUsed: "10",
      lastDailyReward: new Date("2026-09-19T00:00:00Z"),
      specialTier: "overlord",
    },
    {
      balance: "50",
      rankPoints: 70,
      totalWinnings: "20",
      totalLosses: "10",
      pendingRefund: "2",
      totalGames: 2,
      totalWinGames: 1,
      allowanceFundWeek: "2026-W38",
      allowanceFundUsed: "3",
      lastDailyReward: new Date("2026-09-20T00:00:00Z"),
    }
  );

  assert.equal(merged.balance, "150");
  assert.equal(merged.rankPoints, 270);
  assert.equal(merged.totalWinnings, "320");
  assert.equal(merged.totalLosses, "50");
  assert.equal(merged.netProfit, "270");
  assert.equal(merged.pendingRefund, "7");
  assert.equal(merged.totalGames, 6);
  assert.equal(merged.totalWinGames, 4);
  assert.equal(merged.winRate, 4 / 6 * 100);
  assert.equal(merged.allowanceFundUsed, "13");
  assert.equal(merged.lastDailyReward.toISOString(), "2026-09-20T00:00:00.000Z");
  assert.equal(merged.specialTier, "overlord");
});

test("mycard subtracts losses and compacts huge values", () => {
  assert.equal(calculateGameNetProfit("4213693876887817", "2996909089756185"), "1216784787131632");
  assert.equal(compactMoney("50000000000041665000000000"), "50 Triệu Tỷ Tỷ");
  assert.equal(compactMoney("1234567890123456789012345678"), "1,23 Tỷ Tỷ Tỷ");
  assert.equal(compactMoney("-9999999999999999999999999999999999999999"), "-10 Nghìn Tỷ Tỷ Tỷ Tỷ");
  assert.equal(compactMoney(`1${"0".repeat(250)}`), "10 Triệu Tỷ²⁷");
});

test("số dư dùng thang đơn vị Việt và Daily không vượt 20 nghìn tỷ", () => {
  assert.equal(compactMoney("1000000000"), "1 Tỷ");
  assert.equal(compactMoney("100000000000"), "100 Tỷ");
  assert.equal(compactMoney("100000000000000"), "100 Nghìn Tỷ");
  assert.equal(compactMoney("100000000000000000"), "100 Triệu Tỷ");
  assert.equal(getGameTiers().find((tier) => tier.key === "bach_ho").dailyText, "1 Nghìn Tỷ");
  assert.equal(getGameTiers().find((tier) => tier.key === "vinh_hang").sendText, "1,1 Triệu Tỷ");
  assert.equal(Math.max(...getGameTiers().map((tier) => Number(tier.daily))), 20_000_000_000_000);
  assert.equal(OVERLORD_TIER.daily, "20000000000000");
  assert.equal(OVERLORD_TIER.dailyText, "20 Nghìn Tỷ");
});

test("only verified Nguyễn Gia Hưng profile keeps Overlord tier without fake rank points", () => {
  assert.equal(getPlayerGameTier({ rankPoints: 0, isOverlord: true }).key, "overlord");
  assert.equal(getPlayerGameTier({ idUserZalo: "t_m7e09z0izz", rankPoints: 0, specialTier: "overlord" }).key, "overlord");
  assert.equal(getPlayerGameTier({ idUserZalo: "TRAN_MY", rankPoints: 250000, specialTier: "overlord" }).key, "angel");
  assert.equal(getPlayerGameTier({ rankPoints: 0, specialTier: "overlord" }).key, "silver");
  assert.equal(getPlayerGameTier({ rankPoints: 0, isOverlord: false }).key, "silver");
});

test("identity lookup never accepts an unrelated profile returned by Zalo", () => {
  const unrelated = { globalId: "OTHER" };
  assert.equal(getExactGameIdentityProfile({ "999": unrelated }, "123"), null);
  assert.equal(getExactGameIdentityProfile({ "123": { globalId: "DIRECT" } }, "123")?.globalId, "DIRECT");
  assert.equal(getExactGameIdentityProfile({ "123_0": { globalId: "SUFFIX" } }, "123")?.globalId, "SUFFIX");
});

test("shared game identity prefers username over bot-specific globalId", () => {
  assert.deepEqual(getStableGameIdentity({ username: "SHARED", globalId: "BOT-SPECIFIC" }), {
    resolvedKey: "SHARED",
    identityKey: "USERNAME:SHARED",
  });
  assert.deepEqual(getStableGameIdentity({ username: "Ẩn", globalId: "BOT-SPECIFIC" }), {
    resolvedKey: null,
    identityKey: null,
  });
});

test("stable identity ignores a stale cached alias", () => {
  const direct = { idUserZalo: "DIRECT" };
  const stale = { idUserZalo: "WRONG" };
  assert.equal(selectLocalGamePlayer(null, stale, true), null);
  assert.equal(selectLocalGamePlayer(direct, stale, true), direct);
  assert.equal(selectLocalGamePlayer(null, stale, false), stale);
});

test("local UID can only merge inside the bot that created it", () => {
  assert.equal(isGamePlayerOwnedByBot({ serverId: "BOT-A" }, "BOT-A"), true);
  assert.equal(isGamePlayerOwnedByBot({ serverId: "BOT-A", mergedInto: "PLAYER" }, "BOT-A"), false);
  assert.equal(isGamePlayerOwnedByBot({ serverId: "BOT-A" }, "BOT-B"), false);
  assert.equal(isGamePlayerOwnedByBot({}, "BOT-A"), false);
});

test("active player ID cannot be redirected by a stale alias", () => {
  const directPlayer = { idUserZalo: "PLAYER-A" };
  assert.equal(resolveGamePlayerAliasTarget("PLAYER-A", "PLAYER-B", directPlayer), "PLAYER-A");
  assert.equal(resolveGamePlayerAliasTarget("PLAYER-A", "PLAYER-B", { ...directPlayer, mergedInto: "PLAYER-B" }), "PLAYER-B");
  assert.equal(resolveGamePlayerAliasTarget("OLD", "OLD", null, { idUserZalo: "OLD", mergedInto: "CURRENT" }), "CURRENT");
});
