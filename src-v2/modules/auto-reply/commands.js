import { Permission } from "../../core/permissions.js";

export function registerAutoReplyCommands(registry, { repository, settings }) {
  registry.register({
    name: "learn", permission: Permission.ADMIN, description: "Dạy bot câu trả lời tự động trong nhóm",
    async execute({ args, threadId, type, senderId, reply }) {
      if (type !== 1) { await reply("Lệnh learn chỉ dùng trong nhóm."); return; }
      const action = args[0]?.toLowerCase();
      if (action === "list") { const rows = await repository.list(threadId); await reply(["CÂU TRẢ LỜI ĐÃ HỌC", ...rows.map((row, index) => `${index + 1}. ${row.trigger} → ${row.response}`)].join("\n")); return; }
      if (action === "remove") { const trigger = args.slice(1).join(" "); await reply(await repository.remove(threadId, trigger) ? "Đã xóa câu trả lời." : "Không tìm thấy trigger."); return; }
      const raw = args.join(" "); const separator = raw.indexOf("=>");
      if (separator < 1) { await reply("Dùng: !learn <trigger> => <câu trả lời>; list; remove <trigger>"); return; }
      await repository.set(threadId, raw.slice(0, separator), raw.slice(separator + 2), senderId);
      await reply("Bot đã học câu trả lời mới trong nhóm này.");
    },
  });
  const toggle = {
    name: "autoreply", permission: Permission.ADMIN, description: "Bật hoặc tắt trả lời tự động trong nhóm",
    async execute({ args, threadId, type, reply }) {
      if (type !== 1) { await reply("Lệnh này chỉ dùng trong nhóm."); return; }
      const action = args[0]?.toLowerCase(); if (!['on', 'off'].includes(action)) { const current = await settings.get(threadId); await reply(`Auto reply: ${current.autoReplyEnabled ? "bật" : "tắt"}. Dùng on|off.`); return; }
      await settings.patch(threadId, { autoReplyEnabled: action === "on", updatedAt: new Date() }); await reply(`Đã ${action === "on" ? "bật" : "tắt"} auto reply.`);
    },
  };
  registry.register(toggle);
  registry.register({ name: "zautoreply", permission: Permission.ADMIN, description: toggle.description, execute: (context) => toggle.execute(context) });
}
