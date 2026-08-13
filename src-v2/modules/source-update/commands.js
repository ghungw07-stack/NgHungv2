import { Permission } from "../../core/permissions.js";

export function registerSourceUpdateCommand(registry, { updater, identity }) {
  if (!identity.isMain) return;
  registry.register({
    name: "updatecode",
    aliases: ["pushcode", "github"],
    permission: Permission.LEADER,
    description: "Kiểm thử và đẩy source lên GitHub",
    async execute({ args, reply }) {
      await reply("Đang kiểm tra và cập nhật code...");
      const result = await updater.push(args.join(" "));
      await reply(result.ok ? result.message : `Cập nhật thất bại: ${result.message}`);
    },
  });
}
