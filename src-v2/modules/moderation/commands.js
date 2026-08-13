import { Permission } from "../../core/permissions.js";

const FEATURES = Object.freeze({
  spam: "antiSpam", link: "removeLinks", badword: "filterBadWords",
  file: "antiFile", photo: "antiPhoto", image: "antiPhoto", video: "antiVideo",
  voice: "antiVoice", sticker: "antiSticker", gif: "antiGif", forward: "antiForward",
  phone: "antiPhoneNumber", tag: "antiTag", undo: "antiUndo",
});

const DIRECT_COMMANDS = Object.freeze({
  antispam: "spam", antilink: "link", antibadword: "badword", antifile: "file",
  antiphoto: "photo", antimedia: "video", antivoice: "voice", antisticker: "sticker",
  antigif: "gif", antiforward: "forward", antiphonenumber: "phone", antitag: "tag", antiundo: "undo",
});

async function toggle(repository, threadId, feature, action) {
  const key = FEATURES[feature];
  if (!["on", "off"].includes(action)) return null;
  await repository.patch(threadId, { [key]: action === "on", updatedAt: new Date() });
  return action === "on";
}

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
          `Media: ${["antiFile", "antiPhoto", "antiVideo", "antiVoice", "antiSticker", "antiGif"].filter((key) => settings[key]).length}/6 đang bật`,
          `Forward/SĐT/Tag/Undo: ${[settings.antiForward, settings.antiPhoneNumber, settings.antiTag, settings.antiUndo].filter(Boolean).length}/4`,
          "Dùng: !anti <spam|link|badword|file|photo|video|voice|sticker|gif|forward|phone|tag|undo> <on|off>",
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
      await toggle(repository, threadId, feature, action);
      await reply(`Đã ${action === "on" ? "bật" : "tắt"} chống ${feature}.`);
    },
  });

  for (const [name, feature] of Object.entries(DIRECT_COMMANDS)) {
    registry.register({
      name, permission: Permission.ADMIN, description: `Bật hoặc tắt bảo vệ ${feature}`,
      async execute({ args, threadId, type, reply }) {
        if (type !== 1) { await reply("Lệnh anti chỉ dùng trong nhóm."); return; }
        const action = args[0]?.toLowerCase();
        if (await toggle(repository, threadId, feature, action) == null) {
          await reply(`Dùng: !${name} on|off`); return;
        }
        await reply(`Đã ${action === "on" ? "bật" : "tắt"} ${name}.`);
      },
    });
  }

  registry.register({
    name: "antiall", permission: Permission.ADMIN, description: "Bật hoặc tắt toàn bộ lớp bảo vệ nhóm",
    async execute({ args, threadId, type, reply }) {
      if (type !== 1) { await reply("Lệnh anti chỉ dùng trong nhóm."); return; }
      const action = args[0]?.toLowerCase();
      if (!["on", "off"].includes(action)) { await reply("Dùng: !antiall on|off"); return; }
      const enabled = action === "on";
      await repository.patch(threadId, Object.fromEntries([...new Set(Object.values(FEATURES))].map((key) => [key, enabled])));
      await reply(`Đã ${enabled ? "bật" : "tắt"} toàn bộ bảo vệ nhóm.`);
    },
  });
}
