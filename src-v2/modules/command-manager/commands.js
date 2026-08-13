import { Permission } from "../../core/permissions.js";

const PROTECTED = new Set(["help", "command", "setcmd", "prefix"]);

function paginate(items, page, pageSize = 15) {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(Math.max(1, Number(page) || 1), pages);
  return { current, pages, items: items.slice((current - 1) * pageSize, current * pageSize) };
}

export function registerCommandManagerCommands(registry, { settings }) {
  registry.register({
    name: "command", aliases: ["cmd"], description: "Xem và tra cứu danh sách lệnh", cooldownMs: 3_000,
    async execute({ args, reply, prefix }) {
      const query = args[0]?.toLowerCase();
      if (query && !/^\d+$/.test(query)) {
        const command = registry.resolve(query);
        if (!command) { await reply(`Không tìm thấy lệnh “${query}”.`); return; }
        await reply([
          `LỆNH ${prefix}${command.name}`,
          command.description || "Không có mô tả",
          `Quyền: ${command.permission}`,
          `Cooldown: ${Math.ceil((command.cooldownMs || 0) / 1000)} giây`,
          command.aliases.length ? `Alias: ${command.aliases.join(", ")}` : null,
        ].filter(Boolean).join("\n"));
        return;
      }
      const list = [...registry.list()].sort((a, b) => a.name.localeCompare(b.name));
      const page = paginate(list, query);
      await reply([
        `DANH SÁCH LỆNH — ${page.current}/${page.pages}`,
        ...page.items.map((command) => `• ${prefix}${command.name} — ${command.description || "Không có mô tả"}`),
        `Dùng ${prefix}command <tên lệnh> để xem chi tiết.`,
      ].join("\n"));
    },
  });

  registry.register({
    name: "setcmd", permission: Permission.ADMIN, description: "Bật hoặc tắt lệnh trong nhóm",
    async execute({ args, threadId, reply }) {
      const action = args[0]?.toLowerCase();
      const requested = args[1]?.toLowerCase();
      const command = registry.resolve(requested);
      if (!["on", "off"].includes(action) || !command) {
        await reply("Dùng: !setcmd on|off <tên lệnh>");
        return;
      }
      if (PROTECTED.has(command.name)) {
        await reply("Không thể tắt lệnh quản lý cốt lõi này.");
        return;
      }
      const config = await settings.get(threadId);
      const disabled = new Set((config.disabledCommands || []).map(String));
      if (action === "off") disabled.add(command.name);
      else disabled.delete(command.name);
      await settings.patch(threadId, { disabledCommands: [...disabled].sort() });
      await reply(`Đã ${action === "off" ? "tắt" : "bật"} lệnh ${command.name}.`);
    },
  });
}
