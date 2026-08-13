import { Permission } from "../../core/permissions.js";

function target(message, args) {
  return String(message?.data?.mentions?.[0]?.uid || message?.data?.mentions?.[0]?.id || args.find((value) => /^\d{6,}$/.test(value)) || "");
}

export function registerAdminCommands(registry, { store, botId }) {
  registry.register({
    name: "adminbot", aliases: ["listadmin", "ladm"], permission: Permission.LEADER, description: "Quản lý admin bot",
    async execute({ args, message, reply }) {
      const action = args[0]?.toLowerCase() || "list";
      const current = store.list(botId);
      if (action === "list") { await reply([`ADMIN BOT (${current.length})`, ...current.map((id, index) => `${index + 1}. ${id}`)].join("\n")); return; }
      if (!["add", "remove"].includes(action)) { await reply("Dùng: !adminbot add|remove @người; list"); return; }
      const id = target(message, args.slice(1));
      if (!id) { await reply("Hãy tag hoặc nhập UID."); return; }
      const next = action === "add" ? [...new Set([...current, id])] : current.filter((value) => value !== id);
      await store.set(botId, next);
      await reply(`Đã ${action === "add" ? "thêm" : "xóa"} admin ${id}.`);
    },
  });
}
