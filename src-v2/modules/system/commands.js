import os from "node:os";
import { Permission } from "../../core/permissions.js";

export function registerSystemCommands(registry, { startedAt, scheduler }) {
  registry.register({
    name: "ping",
    description: "Kiểm tra bot",
    async execute({ reply }) { await reply("Pong!"); },
  });
  registry.register({
    name: "status",
    aliases: ["uptime"],
    permission: Permission.ADMIN,
    description: "Xem trạng thái bot",
    async execute({ reply }) {
      const memory = process.memoryUsage();
      await reply([
        "Trạng thái NGH Bot v2",
        `Uptime: ${Math.floor((Date.now() - startedAt) / 1000)} giây`,
        `RAM tiến trình: ${(memory.rss / 1024 / 1024).toFixed(1)} MB`,
        `Heap: ${(memory.heapUsed / 1024 / 1024).toFixed(1)} MB`,
        `Scheduler: ${scheduler.size}`,
        `RAM máy trống: ${(os.freemem() / 1024 / 1024).toFixed(0)} MB`,
      ].join("\n"));
    },
  });
  registry.register({
    name: "help",
    aliases: ["menu"],
    async execute({ reply }) {
      const lines = registry.list().map((cmd) => `• !${cmd.name} — ${cmd.description || "Không có mô tả"}`);
      await reply(["NGH BOT V2 — DANH SÁCH LỆNH", ...lines].join("\n"));
    },
  });
}
