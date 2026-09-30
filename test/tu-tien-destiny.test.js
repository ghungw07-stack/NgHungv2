import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceDestinyQuest,
  chooseDestinyPath,
  claimDestinyQuest,
  currentDestinyQuest,
  destinyBonuses,
} from "../src/service-ngh/game-service/tu-tien/destiny-paths.js";

test("Phản Diện chỉ tiến nhiệm vụ đúng loại và nhận thưởng theo chương", () => {
  const player = {};
  assert.equal(chooseDestinyPath(player, "phandien").success, true);
  assert.equal(advanceDestinyQuest(player, "cultivate"), false);
  assert.equal(advanceDestinyQuest(player, "hunt_win"), true);
  assert.equal(advanceDestinyQuest(player, "hunt_win"), true);
  const result = claimDestinyQuest(player);
  assert.equal(result.success, true);
  assert.equal(player.destiny.chapter, 1);
  assert.equal(player.destiny.score, 12);
  assert.equal(currentDestinyQuest(player).quest.event, "pvp_win");
  assert.ok(destinyBonuses(player).power > 1);
});

test("Khí Vận Chi Tử có nội tại tu luyện và không thể đổi mệnh cách", () => {
  const player = {};
  assert.equal(chooseDestinyPath(player, "khivanchitu").success, true);
  assert.equal(chooseDestinyPath(player, "phandien").success, false);
  const bonus = destinyBonuses({ destiny: { path: "chosen", score: 100 } });
  assert.ok(bonus.cultivation > 1);
  assert.ok(bonus.drop > 1);
});
