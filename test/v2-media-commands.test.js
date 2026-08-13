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

test("convertfile only accepts bounded local conversion profiles", async () => {
  let input;
  const registry = new CommandRegistry();
  registerMediaCommands(registry, { client: {}, media: { async convert(value) { input = value; } } });
  await registry.resolve("convertfile").execute({ args: ["mp3", "https://cdn.example/a.mp4"], message: {}, threadId: "g", type: 1, reply: async () => {} });
  assert.equal(input.format, "mp3");
  assert.equal(input.url, "https://cdn.example/a.mp4");
});
