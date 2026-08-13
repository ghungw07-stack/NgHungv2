import assert from "node:assert/strict";
import test from "node:test";
import { CommandRegistry } from "../src-v2/core/commands/registry.js";
import { registerAiCommands, splitAiResponse } from "../src-v2/modules/ai/commands.js";
import { AiGateway } from "../src-v2/modules/ai/gateway.js";

test("AI command keeps scope and stores both conversation messages", async () => {
  const calls = [];
  const conversations = {
    async history(scope) { calls.push(["history", scope]); return [{ role: "assistant", text: "Cũ" }]; },
    async append(scope, messages) { calls.push(["append", scope, messages]); },
    async reset() {},
  };
  const gateway = { available: true, async generate(request) { calls.push(["generate", request]); return "Câu trả lời"; } };
  const registry = new CommandRegistry();
  registerAiCommands(registry, { gateway, conversations, botId: "bot-1" });
  const replies = [];
  await registry.resolve("gpt").execute({ args: ["Xin", "chào"], senderId: "u1", threadId: "g1", reply: async (value) => replies.push(value) });
  assert.deepEqual(calls[0][1], { botId: "bot-1", threadId: "g1", userId: "u1" });
  assert.equal(calls[1][1].messages.at(-1).text, "Xin chào");
  assert.equal(calls[2][2].length, 2);
  assert.deepEqual(replies, ["Câu trả lời"]);
});

test("AI reset is scoped and does not call provider", async () => {
  let resetScope;
  const registry = new CommandRegistry();
  registerAiCommands(registry, {
    botId: "b",
    gateway: { available: true },
    conversations: { async reset(scope) { resetScope = scope; } },
  });
  await registry.resolve("ai").execute({ args: ["reset"], senderId: "u", threadId: "t", reply: async () => {} });
  assert.deepEqual(resetScope, { botId: "b", threadId: "t", userId: "u" });
});

test("AI gateway rejects cleanly without a configured provider", () => {
  const gateway = new AiGateway({ provider: { available: false } });
  assert.throws(() => gateway.generate({}), /GEMINI_API_KEY/);
});

test("AI responses are split below Zalo message limit", () => {
  const output = splitAiResponse("a".repeat(4001));
  assert.equal(output.length, 3);
  assert.ok(output.every((part) => part.length <= 1800));
});
