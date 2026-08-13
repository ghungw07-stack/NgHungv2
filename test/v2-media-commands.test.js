import assert from "node:assert/strict";
import test from "node:test";
import { CommandRegistry } from "../src-v2/core/commands/registry.js";
import { registerMediaCommands } from "../src-v2/modules/media/commands.js";

test("getvoice accepts a nested URL from quoted media", async () => {
  let input; const replies = [];
  const registry = new CommandRegistry();
  registerMediaCommands(registry, {
    client: {}, media: { async extractAudio(value) { input = value; } },
  });
  await registry.resolve("gvoice").execute({
    args: [], message: { data: { quote: { attach: JSON.stringify({ normalUrl: "https://cdn.example/video.mp4" }) } } },
    threadId: "g", type: 1, reply: async (value) => replies.push(value),
  });
  assert.equal(input.url, "https://cdn.example/video.mp4");
  assert.match(replies[0], /Đang tách/);
});

