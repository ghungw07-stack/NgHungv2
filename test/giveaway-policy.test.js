import test from "node:test";
import assert from "node:assert/strict";
import {
  collectActiveGiveawayGroups,
  findGiveawayParticipant,
  isActiveGiveawayGroup,
  isMainBotRuntime,
} from "../src/service-ngh/game-service/giveaway/giveaway-policy.js";

function manager(botId, isMainBot = false) {
  return {
    isMainBot,
    apiZalo: {
      getBotId: () => botId,
      apiManager: { isMainBot },
    },
  };
}

test("chỉ runtime mainbot được quản trị Giveaway", () => {
  assert.equal(isMainBotRuntime(manager("main", true).apiZalo), true);
  assert.equal(isMainBotRuntime(manager("child", false).apiZalo), false);
  assert.equal(isMainBotRuntime({ getBotId: () => "main" }), false);
});

test("Giveaway chỉ phát tới bot online có activeBot và activeGame", () => {
  const managers = {
    main: manager("main", true),
    child: manager("child"),
  };
  const settings = {
    main: {
      g1: { activeBot: true, activeGame: true, nameGroup: "Nhóm chính" },
      g2: { activeBot: true, activeGame: false },
    },
    child: {
      g3: { activeBot: "true", activeGame: "true", nameGroup: "Nhóm bot con" },
      g4: { activeBot: false, activeGame: true },
    },
    offline: {
      g5: { activeBot: true, activeGame: true },
    },
  };

  assert.deepEqual(collectActiveGiveawayGroups(managers, settings), [
    { botId: "main", threadId: "g1", name: "Nhóm chính" },
    { botId: "child", threadId: "g3", name: "Nhóm bot con" },
  ]);
  assert.equal(isActiveGiveawayGroup({ activeBot: true, activeGame: false }), false);
  assert.equal(isActiveGiveawayGroup({ activeBot: "true", activeGame: "true" }), true);
});

test("một hồ sơ game chỉ được tham gia một lần dù UID ở bot khác nhau", () => {
  const participants = [
    { uid: "uid-bot-a", playerId: "player-global", number: 1 },
  ];

  assert.equal(findGiveawayParticipant(participants, "player-global", "uid-bot-b")?.number, 1);
  assert.equal(findGiveawayParticipant(participants, "other-player", "uid-bot-a")?.number, 1);
  assert.equal(findGiveawayParticipant(participants, "other-player", "uid-bot-b"), null);
});
