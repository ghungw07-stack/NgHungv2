import { Permission } from "../../core/permissions.js";

export function registerEngagementCommands(registry, { archive }) {
  registry.register({
    name: "topchat", permission: Permission.ADMIN, description: "Top tương tác nhóm trong 24 giờ",
    async execute({ threadId, type, reply }) {
      if (type !== 1) { await reply("Lệnh này chỉ dùng trong nhóm."); return; }
      const rows = await archive.topActivity(threadId, 10);
      await reply(rows.length ? ["TOP CHAT 24 GIỜ", ...rows.map((row, index) => `${index + 1}. ${row.name || row._id} — ${row.messages} tin`)].join("\n") : "Chưa có dữ liệu chat trong 24 giờ.");
    },
  });
}
