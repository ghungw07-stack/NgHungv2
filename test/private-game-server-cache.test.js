import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  getPrivateGameServer,
  getPrivateGameServerForApi,
  reloadPrivateGameServers,
} from "../src/service-ngh/game-service/private-game-server.js";

test("private game server lookup reuses an indexed config on the hot path", () => {
  reloadPrivateGameServers();
  const originalStatSync = fs.statSync;
  let statCalls = 0;
  fs.statSync = (...args) => {
    statCalls++;
    return originalStatSync(...args);
  };

  try {
    for (let index = 0; index < 1000; index++) {
      assert.equal(getPrivateGameServer("missing-user"), null);
      assert.equal(getPrivateGameServerForApi({
        apiManager: { ownerId: "missing-owner" },
        getBotId: () => "missing-bot",
      }), null);
    }
  } finally {
    fs.statSync = originalStatSync;
  }

  assert.equal(statCalls, 0);
});
