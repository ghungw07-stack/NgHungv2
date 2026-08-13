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
}
