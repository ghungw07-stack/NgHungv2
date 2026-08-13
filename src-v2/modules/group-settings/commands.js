import { Permission } from "../../core/permissions.js";

export function registerGroupSettingsCommands(registry, { repository }) {
  registry.register({
    name: "prefix",
    permission: Permission.ADMIN,
    description: "Xem hoặc đổi prefix của nhóm",
    async execute({ args, threadId, type, reply }) {
      const current = await repository.getPrefix(threadId);
      if (!args[0]) {
        await reply(`Prefix hiện tại: ${current}`);
        return;
      }
      if (type !== 1) {
        await reply("Chỉ có thể đổi prefix trong nhóm.");
        return;
      }
      const prefix = String(args[0]).trim();
      if (!prefix || prefix.length > 5 || /\s/.test(prefix)) {
        await reply("Prefix phải từ 1–5 ký tự và không chứa khoảng trắng.");
        return;
      }
      await repository.patch(threadId, { prefix, updatedAt: new Date() });
      await reply(`Đã đổi prefix của nhóm thành: ${prefix}`);
    },
  });
}
