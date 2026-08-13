import { Permission } from "../../core/permissions.js";

function formatRemaining(value) {
  if (value === -1) return "vô thời hạn";
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return "hết hạn";
  const days = Math.floor(Number(value) / 86_400_000);
  const hours = Math.floor((Number(value) % 86_400_000) / 3_600_000);
  return `${days} ngày ${hours} giờ`;
}

export function registerBotManagerCommands(registry, { fleet, identity }) {
  registry.register({
    name: "mybot",
    permission: Permission.LEADER,
    description: "Quản lý bot mẹ và bot con",
    async execute({ args, reply }) {
      if (!identity.isMain) {
        await reply("Lệnh này chỉ chạy trên bot mẹ.");
        return;
      }
      const action = String(args[0] || "help").toLowerCase();
      if (action === "help") {
        await reply([
          "QUẢN LÝ BOT V2",
          "• !mybot list",
          "• !mybot active <index>",
          "• !mybot shutdown <index>",
          "• !mybot restart <index>",
        ].join("\n"));
        return;
      }
      if (action === "list") {
        const children = fleet.listChildren();
        const lines = children.map((bot) =>
          `#${bot.index} ${bot.name} — ${bot.status} — ${formatRemaining(bot.timeRemaining)}`
        );
        await reply([`Danh sách bot con (${children.length})`, ...lines].join("\n"));
        return;
      }
      if (!["active", "shutdown", "restart"].includes(action)) {
        await reply("Thao tác không hợp lệ. Dùng !mybot help");
        return;
      }
      const ownerId = fleet.resolveOwner(args[1]);
      if (!ownerId) {
        await reply("Index hoặc owner bot không hợp lệ.");
        return;
      }
      if (action === "active") {
        const result = await fleet.startChild(ownerId);
        await reply(result.started ? `Đã bật bot #${args[1]}.` : `Không thể bật bot: ${result.reason}`);
        return;
      }
      if (action === "shutdown") {
        const stopped = await fleet.stopChild(ownerId);
        await reply(stopped ? `Đã tắt bot #${args[1]}.` : "Bot hiện không chạy.");
        return;
      }
      await fleet.stopChild(ownerId);
      const result = await fleet.startChild(ownerId);
      await reply(result.started ? `Đã khởi động lại bot #${args[1]}.` : `Khởi động lại thất bại: ${result.reason}`);
    },
  });
}
