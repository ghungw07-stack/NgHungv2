import { Permission } from "../../core/permissions.js";

export function registerAccountCommands(registry, { client }) {
  registry.register({
    name: "myacc", permission: Permission.LEADER, description: "Xem hoặc cập nhật hồ sơ tài khoản bot",
    async execute({ args, reply }) {
      if (args[0]?.toLowerCase() === "set") {
        const raw = args.slice(1).join(" ");
        const [name, dob, genderText] = raw.split("|").map((value) => value.trim());
        const gender = Number(genderText);
        if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(dob || "") || ![0, 1, 2].includes(gender)) {
          await reply("Dùng: !myacc set Tên | YYYY-MM-DD | 0|1|2"); return;
        }
        await client.api.updateProfile({ profile: { name: name.slice(0, 40), dob, gender } });
        await reply("Đã cập nhật hồ sơ bot."); return;
      }
      const response = await client.api.getInfoMembers([String(client.botId)]);
      const profile = response?.profiles?.[client.botId] || Object.values(response?.profiles || {})[0] || {};
      await reply(["TÀI KHOẢN BOT", `Tên: ${profile.displayName || profile.zaloName || "Không rõ"}`, `UID: ${client.botId}`, profile.sdob ? `Ngày sinh: ${profile.sdob}` : null].filter(Boolean).join("\n"));
    },
  });
}
