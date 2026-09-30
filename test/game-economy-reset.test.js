import test from "node:test";
import assert from "node:assert/strict";
import {
  GAME_ECONOMY_COLLECTIONS,
  GAME_ECONOMY_PLAYER_RESET,
  resetGameEconomy,
  resetPersistedGameState,
} from "../src/service-ngh/game-service/game-economy-reset.js";

test("reset nền kinh tế giữ tier nhưng xoá tiền, lịch sử và hạn mức", async () => {
  const player = {
    idUserZalo: "P1",
    balance: "999999999999",
    rankPoints: 900000,
    specialTier: "angel",
    vipExpireAt: new Date("2030-01-01T00:00:00Z"),
    totalWinnings: "500",
    lastDailyReward: new Date(),
    xoso45sWallet: { operations: ["old"] },
  };
  const deleted = new Map(GAME_ECONOMY_COLLECTIONS.map((name) => [name, [{ old: true }]]));
  const database = {
    collection(name) {
      if (name === "players") return {
        async updateMany(_filter, update) {
          Object.assign(player, update.$set);
          for (const key of Object.keys(update.$unset)) delete player[key];
          return { matchedCount: 1, modifiedCount: 1 };
        },
      };
      return {
        async deleteMany() {
          const count = deleted.get(name)?.length || 0;
          deleted.set(name, []);
          return { deletedCount: count };
        },
      };
    },
  };

  const result = await resetGameEconomy(database, "players");
  assert.equal(result.playersMatched, 1);
  assert.equal(player.balance, "10000");
  assert.equal(player.rankPoints, 900000);
  assert.equal(player.specialTier, "angel");
  assert.equal(player.vipExpireAt.toISOString(), "2030-01-01T00:00:00.000Z");
  assert.equal(player.xoso45sWallet, undefined);
  assert.deepEqual(
    Object.fromEntries(Object.keys(GAME_ECONOMY_PLAYER_RESET).map((key) => [key, player[key]])),
    GAME_ECONOMY_PLAYER_RESET,
  );
  assert.equal(Object.values(result.deleted).reduce((sum, value) => sum + value, 0), GAME_ECONOMY_COLLECTIONS.length);
});

test("reset file game giữ nhóm hoạt động nhưng bỏ ván cũ", () => {
  const old = {
    taixiu: { activeThreads: { bot: ["group"] }, players: { P1: {} }, history: [{ result: "tai" }], jackpot: "9", jackpots: { global: "9" } },
    xoso45s: { activeThreads: { bot: ["group"] }, players: { P1: {} }, history: [{ code: 1 }] },
    xidach: { room: { players: ["P1"] } },
  };
  const reset = resetPersistedGameState(old, "0");
  assert.deepEqual(reset.taixiu.activeThreads, { bot: ["group"] });
  assert.deepEqual(reset.taixiu.players, {});
  assert.deepEqual(reset.taixiu.history, []);
  assert.equal(reset.taixiu.jackpot, "0");
  assert.deepEqual(reset.xoso45s.players, {});
  assert.deepEqual(reset.xidach, {});
  assert.equal(old.taixiu.history.length, 1);
});
