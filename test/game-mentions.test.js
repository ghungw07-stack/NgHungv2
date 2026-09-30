import assert from "node:assert/strict";
import test from "node:test";

import { buildGamePlayerMessage, gameSenderMessage } from "../src/utils/game-mentions.js";
import { MessageType } from "../src/api-zalo/models/Message.js";

test("game sender message keeps the local Zalo UID and exact name offset", () => {
  const message = {
    type: MessageType.GroupMessage,
    threadId: "group-1",
    data: { uidFrom: "global-player", gameUid: "local-zalo", dName: "Nguyen Van A" },
  };

  assert.deepEqual(gameSenderMessage(message, "Da dat cuoc."), {
    msg: "Nguyen Van A\nDa dat cuoc.",
    mentions: [{ uid: "local-zalo", pos: 0, len: 12 }],
  });
});

test("game player builder only tags players visible to the current bot and group", () => {
  const result = buildGamePlayerMessage([
    "Ket qua: ",
    { player: { mentionUid: "u1", name: "Alice", threadId: "g1", botId: "b1" } },
    ", ",
    { player: { mentionUid: "u2", name: "Bob", threadId: "g2", botId: "b1" } },
  ], { threadId: "g1", botId: "b1", type: MessageType.GroupMessage });

  assert.equal(result.msg, "Ket qua: Alice, Bob");
  assert.deepEqual(result.mentions, [{ uid: "u1", pos: 9, len: 5 }]);
});
