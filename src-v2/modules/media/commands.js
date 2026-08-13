import { collectLinks, parsedAttachment } from "../message-actions/commands.js";

export function registerMediaCommands(registry, { media, client }) {
  registry.register({
    name: "media",
    aliases: ["sendurl", "download", "sendfile", "sendimage", "sendvideo", "sendvoice", "sendgif"],
    cooldownMs: 5_000,
    description: "Tải và gửi ảnh, video hoặc âm thanh từ URL",
    async execute({ args, threadId, type, reply }) {
      const url = args.find((value) => /^https?:\/\//i.test(value));
      if (!url) { await reply("Dùng: !media <URL>"); return; }
      await reply("Đang tải media...");
      await media.sendUrl({ client, threadId, type, url });
    },
  });

  registry.register({
    name: "getvoice", aliases: ["gvc", "gvoice"], cooldownMs: 15_000,
    description: "Tách âm thanh MP3 từ URL hoặc video đang reply",
    async execute({ args, message, threadId, type, reply }) {
      const direct = args.find((value) => /^https?:\/\//iu.test(value));
      const quote = message?.data?.quote;
      const url = direct || [...collectLinks([quote?.content, quote?.msg, parsedAttachment(quote)])][0];
      if (!url) { await reply("Dùng: !getvoice <URL>, hoặc reply video có liên kết tải."); return; }
      await reply("Đang tách âm thanh...");
      await media.extractAudio({ client, threadId, type, url });
    },
  });

  registry.register({
    name: "convertfile", aliases: ["cfile"], permission: "leader", cooldownMs: 5_000, description: "Chuyển đổi định dạng file",
    async execute({ args, message, threadId, type, reply }) {
      const format = String(args[0] || "").toLowerCase().replace(/^\./u, "");
      const direct = args.find((value, index) => index > 0 && /^https?:\/\//iu.test(value));
      const quote = message?.data?.quote;
      const url = direct || [...collectLinks([quote?.content, quote?.msg, parsedAttachment(quote)])][0];
      if (!["mp3", "mp4", "webm"].includes(format) || !url) { await reply("Dùng: !convertfile <mp3|mp4|webm> <URL>, hoặc reply media."); return; }
      await reply(`Đang chuyển đổi sang ${format.toUpperCase()}...`);
      await media.convert({ client, threadId, type, url, format });
    },
  });
}
