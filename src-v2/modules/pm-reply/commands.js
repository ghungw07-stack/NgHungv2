import { Permission } from "../../core/permissions.js";

export function registerPmReplyCommand(registry, { settings }) {
  registry.register({
    name: "pmreply", permission: Permission.LEADER, description: "Cấu hình tính năng reply tin nhắn riêng",
    async execute({ args, senderId, reply }) {
      const scope = "__global__"; const config = await settings.get(scope); const action = args[0]?.toLowerCase();
      if (action === "help") { await reply("!pmreply - Bật/Tắt\n!pmreply set <nội dung>\n!pmreply card <ID|me> <nội dung>\n!pmreply card off\n!pmreply show"); return; }
      if (action === "show") {
        await reply(["THÔNG TIN CẤU HÌNH AUTO REPLY PM", `Trạng thái: ${config.pmReplyEnabled ? "Bật" : "Tắt"}`, `Tin nhắn: ${config.pmReplyMessage || "Chưa đặt"}`, config.pmReplyCard ? `Card ID: ${config.pmReplyCard.id}\nNội dung: ${config.pmReplyCard.content}` : "Card: Không có"].join("\n")); return;
      }
      if (action === "set") { const text = args.slice(1).join(" ").trim(); if (!text) { await reply("Dùng: !pmreply set <nội dung tin nhắn>"); return; } await settings.patch(scope, { pmReplyMessage: text, updatedAt: new Date() }); await reply("Đã cập nhật tin nhắn auto reply PM."); return; }
      if (action === "card") {
        if (args[1]?.toLowerCase() === "off") { await settings.patch(scope, { pmReplyCard: null, updatedAt: new Date() }); await reply("Đã tắt chức năng gửi card kèm tin nhắn!"); return; }
        let id = args[1]; if (id?.toLowerCase() === "me") id = String(senderId); if (!/^\d+$/u.test(id || "")) { await reply("Dùng: !pmreply card <ID|me> <nội dung>"); return; }
        const content = args.slice(2).join(" ").trim() || "Bot Auto Reply"; await settings.patch(scope, { pmReplyCard: { id, content }, updatedAt: new Date() }); await reply(`Đã cập nhật card. ID: ${id}\nNội dung: ${content}`); return;
      }
      const enabled = !config.pmReplyEnabled; await settings.patch(scope, { pmReplyEnabled: enabled, updatedAt: new Date() }); await reply(`Đã ${enabled ? "bật" : "tắt"} auto reply PM.`);
    },
  });
}
