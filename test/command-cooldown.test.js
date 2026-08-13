import test from "node:test";
import assert from "node:assert/strict";

import { getCommandCooldownSeconds } from "../src/utils/command-cooldown.js";

test("help và alias menu luôn có cooldown 20 giây", () => {
  const helpCommand = { name: "help", alias: ["menu"], countdown: 5 };

  assert.equal(getCommandCooldownSeconds(helpCommand), 20);
  assert.equal(getCommandCooldownSeconds(helpCommand, { countdown: 2 }), 20);
});

test("lệnh khác vẫn dùng cooldown tùy chỉnh hoặc mặc định", () => {
  const command = { name: "info", countdown: 5 };

  assert.equal(getCommandCooldownSeconds(command), 5);
  assert.equal(getCommandCooldownSeconds(command, { countdown: 12 }), 12);
});
