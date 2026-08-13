const SYSTEM_INSTRUCTION = "Bạn là trợ lý của NGH Bot. Trả lời hữu ích, rõ ràng, ưu tiên tiếng Việt và không bịa thông tin khi không chắc chắn.";

function chunks(text, maxLength = 1800) {
  const result = [];
  let rest = String(text).trim();
  while (rest.length > maxLength) {
    let cut = rest.lastIndexOf("\n", maxLength);
    if (cut < maxLength / 2) cut = rest.lastIndexOf(" ", maxLength);
    if (cut < maxLength / 2) cut = maxLength;
    result.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) result.push(rest);
  return result;
}

export function registerAiCommands(registry, { gateway, conversations, botId }) {
  const execute = async ({ args, senderId, threadId, reply }) => {
    const scope = { botId, threadId, userId: senderId };
    if (args[0]?.toLowerCase() === "reset") {
      await conversations.reset(scope);
      await reply("Đã xóa lịch sử hội thoại AI của bạn trong nhóm này.");
      return;
    }
    const prompt = args.join(" ").trim();
    if (!prompt) {
      await reply("Dùng: !gemini <câu hỏi> hoặc !gemini reset");
      return;
    }
    if (!gateway.available) {
      await reply("AI chưa được cấu hình. Hãy đặt biến môi trường GEMINI_API_KEY.");
      return;
    }
    const history = await conversations.history(scope);
    const messages = [...history, { role: "user", text: prompt }];
    const answer = await gateway.generate({ messages, systemInstruction: SYSTEM_INSTRUCTION });
    await conversations.append(scope, [{ role: "user", text: prompt }, { role: "assistant", text: answer }]);
    for (const chunk of chunks(answer)) await reply(chunk);
  };

  registry.register({
    name: "gemini",
    aliases: ["gem", "gpt", "ai"],
    description: "Trò chuyện với trợ lý AI",
    execute,
  });
}

export { chunks as splitAiResponse };
