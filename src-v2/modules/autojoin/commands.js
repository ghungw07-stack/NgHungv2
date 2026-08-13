import { Permission } from "../../core/permissions.js";

export function registerAutoJoinCommands(registry, { settings }) {
  registry.register({
    name: "autojoin",
    description: "Bật hoặc tắt tự tham gia nhóm sau 2 phút",
    permission: Permission.ADMIN,
    async execute({ args, threadId, reply }) {
      const action = args[0]?.toLowerCase();
      if (!["on", "off"].includes(action)) {
        await reply("Dùng: !autojoin on|off");
        return;
      }
      await settings.patch(threadId, { autoJoinGroup: action === "on" });
      await reply(`Autojoin: ${action === "on" ? "bật" : "tắt"}.`);
    },
  });
}
