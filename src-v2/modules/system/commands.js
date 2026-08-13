import os from "node:os";
import { Permission } from "../../core/permissions.js";

export function registerSystemCommands(registry, { startedAt, scheduler, runtimeStats = () => ({}) }) {
  registry.register({
    name: "ping",
    description: "Kiểm tra bot",
    async execute({ reply }) { await reply("Pong!"); },
  });
  registry.register({
    name: "status",
    aliases: ["uptime", "detail"],
    permission: Permission.ADMIN,
    description: "Xem trạng thái bot",
    async execute({ reply }) {
      const memory = process.memoryUsage();
      const runtime = runtimeStats();
      await reply([
        "Trạng thái NGH Bot v2",
        `Uptime: ${Math.floor((Date.now() - startedAt) / 1000)} giây`,
        `RAM tiến trình: ${(memory.rss / 1024 / 1024).toFixed(1)} MB`,
        `Heap: ${(memory.heapUsed / 1024 / 1024).toFixed(1)} MB`,
        `Scheduler: ${scheduler.size}`,
        runtime.queue ? `Queue: ${runtime.queue.active} chạy, ${runtime.queue.pending} chờ` : null,
        `RAM máy trống: ${(os.freemem() / 1024 / 1024).toFixed(0)} MB`,
      ].filter(Boolean).join("\n"));
    },
  });
  registry.register({
    name: "help",
    aliases: ["menu"],
    cooldownMs: 3_000,
    async execute({ reply, prefix }) {
      const commands = registry.list();
      await reply([
        "NGH BOT V2",
        `Hiện có ${commands.length} lệnh đang được nạp.`,
        `• ${prefix}command — xem danh sách theo trang`,
        `• ${prefix}command <tên> — xem chi tiết lệnh`,
        `• ${prefix}game — mở menu trò chơi`,
      ].join("\n"));
    },
  });
}
