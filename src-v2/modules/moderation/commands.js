import { Permission } from "../../core/permissions.js";

const FEATURES = Object.freeze({ spam: "antiSpam", link: "removeLinks", badword: "filterBadWords" });

export function registerModerationCommands(registry, { repository }) {
  registry.register({
    name: "anti",
    permission: Permission.ADMIN,
    description: "Cấu hình chống spam, link và từ cấm",
    async execute({ args, threadId, type, reply }) {
      if (type !== 1) { await reply("Lệnh anti chỉ dùng trong nhóm."); return; }
      const feature = String(args[0] || "").toLowerCase();
      const action = String(args[1] || "").toLowerCase();
      const key = FEATURES[feature];
      if (!key) {
        const settings = await repository.get(threadId);
        await reply([
          "CẤU HÌNH BẢO VỆ NHÓM",
          `Spam: ${settings.antiSpam ? "bật" : "tắt"}`,
          `Link: ${settings.removeLinks ? "bật" : "tắt"}`,
          `Từ cấm: ${settings.filterBadWords ? "bật" : "tắt"}`,
          "Dùng: !anti <spam|link|badword> <on|off>",
        ].join("\n"));
        return;
      }
      if (feature === "badword" && ["add", "remove", "list"].includes(action)) {
        const settings = await repository.get(threadId);
        const words = [...new Set((settings.badWords || []).map(String))];
        if (action === "list") { await reply(`Từ cấm: ${words.join(", ") || "chưa có"}`); return; }
        const word = args.slice(2).join(" ").trim();
        if (!word) { await reply("Hãy nhập từ cần thêm hoặc xóa."); return; }
        const next = action === "add" ? [...new Set([...words, word])] : words.filter((item) => item !== word);
        await repository.patch(threadId, { badWords: next, updatedAt: new Date() });
        await reply(action === "add" ? `Đã thêm từ cấm: ${word}` : `Đã xóa từ cấm: ${word}`);
        return;
      }
      if (!["on", "off"].includes(action)) {
        await reply(`Dùng: !anti ${feature} <on|off>`);
        return;
      }
      await repository.patch(threadId, { [key]: action === "on", updatedAt: new Date() });
      await reply(`Đã ${action === "on" ? "bật" : "tắt"} chống ${feature}.`);
    },
  });
}
