import { Permission } from "../../core/permissions.js";

function toggleCommand({ registry, name, aliases = [], field, description, settings }) {
  registry.register({
    name, aliases, description, permission: Permission.ADMIN,
    async execute({ args, threadId, reply }) {
      const current = await settings.get(threadId);
      const action = args[0]?.toLowerCase();
      const enabled = action === "on" ? true : action === "off" ? false : !current[field];
      if (action && !["on", "off"].includes(action)) {
        await reply(`Dùng: !${name} on|off`);
        return;
      }
      await settings.patch(threadId, { [field]: enabled });
      await reply(`${description}: ${enabled ? "bật" : "tắt"}.`);
    },
  });
}

export function registerGroupEventCommands(registry, { settings }) {
  toggleCommand({ registry, name: "welcome", field: "welcomeGroup", description: "Chào thành viên mới", settings });
  toggleCommand({ registry, name: "bye", field: "byeGroup", description: "Chào tạm biệt", settings });
  toggleCommand({ registry, name: "updategroup", aliases: ["updatgroup"], field: "updateGroup", description: "Thông báo cập nhật nhóm", settings });

  registry.register({
    name: "setwelcome", permission: Permission.ADMIN, description: "Đặt lời chào thành viên",
    async execute({ args, threadId, reply }) {
      const text = args.join(" ").trim();
      if (!text) { await reply("Dùng: !setwelcome <nội dung>. Hỗ trợ {user}, {group}, {member}."); return; }
      await settings.patch(threadId, { welcomeMessage: text, welcomeGroup: true });
      await reply("Đã lưu lời chào và bật welcome.");
    },
  });
  registry.register({
    name: "setbye", permission: Permission.ADMIN, description: "Đặt lời tạm biệt thành viên",
    async execute({ args, threadId, reply }) {
      const text = args.join(" ").trim();
      if (!text) { await reply("Dùng: !setbye <nội dung>. Hỗ trợ {user}, {group}, {member}."); return; }
      await settings.patch(threadId, { leaveMessage: text, byeGroup: true });
      await reply("Đã lưu lời tạm biệt và bật bye.");
    },
  });
}
