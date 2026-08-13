import { Permission } from "../../core/permissions.js";

export function registerAutoReplyCommands(registry, { repository, settings }) {
  registry.register({
    name: "learn", permission: Permission.ADMIN, description: "Bật học, thêm, xóa và xem dữ liệu trả lời của bot",
    async execute({ args, content, prefix, invokedName, threadId, type, senderId, reply }) {
      if (type !== 1) { await reply("Lệnh learn chỉ dùng trong nhóm."); return; }
      const invoked = String(invokedName || "learn").toLowerCase(); const action = args[0]?.toLowerCase();
      if (invoked === "learnlist" || action === "list") {
        const rows = await repository.list(threadId); await reply(["CÂU TRẢ LỜI ĐÃ HỌC", ...rows.map((row, index) => `${index + 1}. ${row.trigger} → ${row.response}`)].join("\n")); return;
      }
      if (invoked === "unlearn" || ["delete", "remove", "unlearn"].includes(action)) {
        const trigger = args.slice(invoked === "unlearn" ? 0 : 1).join(" "); await reply(await repository.remove(threadId, trigger) ? "Đã xóa câu trả lời." : "Không tìm thấy trigger."); return;
      }
      if (invoked === "learnnow" || String(content).startsWith(`${prefix}learnnow_`)) {
        const raw = String(content).slice(`${prefix}${invoked}`.length).replace(/^_/u, ""); const parts = raw.split("_");
        if (parts.length < 2 || !parts[0] || !parts.slice(1).join("_")) { await reply("Cú pháp: !learnnow_[Câu Hỏi]_[Câu Trả Lời]"); return; }
        const answer = parts.slice(1).join("_"); await repository.set(threadId, parts[0], answer, senderId);
        await reply(`Đã thêm câu trả lời mới thành công. Khi người dùng nhắc đến "${parts[0]}", tôi có thể trả lời: "${answer}"`); return;
      }
      if (!args.length || ["on", "off"].includes(action)) {
        const current = await settings.get(threadId); const enabled = action === "on" ? true : action === "off" ? false : !current.learnEnabled;
        await settings.patch(threadId, { learnEnabled: enabled, updatedAt: new Date() }); await reply(`Chế độ học tập đã được ${enabled ? "bật" : "tắt"}!`); return;
      }
      await reply("Cú pháp không hợp lệ. Sử dụng !learn on/off, !learnnow_[Câu Hỏi]_[Câu Trả Lời], !learn list hoặc !unlearn <câu hỏi>.");
    },
  });
}
