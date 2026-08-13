import { parseDuration } from "./service.js";

function time(value) { return new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }); }

export function registerReminderCommands(registry, { reminders }) {
  registry.register({
    name: "reminder", aliases: ["nhacnho"], cooldownMs: 3_000, description: "Đặt lời nhắc bền qua restart",
    async execute({ args, senderId, threadId, type, reply }) {
      const action = args[0]?.toLowerCase();
      if (action === "list") {
        const items = await reminders.list(senderId);
        await reply(items.length ? ["LỜI NHẮC", ...items.map((item) => `• ${item._id}: ${time(item.dueAt)} — ${item.text}`)].join("\n") : "Bạn chưa có lời nhắc nào.");
        return;
      }
      if (action === "cancel") {
        await reply(await reminders.cancel(senderId, args[1]) ? "Đã hủy lời nhắc." : "Không tìm thấy lời nhắc cần hủy.");
        return;
      }
      const durationMs = parseDuration(args[0]);
      const text = args.slice(1).join(" ").trim();
      if (!durationMs || !text) { await reply("Dùng: !reminder <10s|5m|2h|1d> <nội dung>; list; cancel <id>"); return; }
      const result = await reminders.create({ userId: senderId, threadId, type, text, durationMs });
      await reply(`Đã đặt lời nhắc lúc ${time(result.dueAt)}. ID: ${result.id}`);
    },
  });
}
