function imageUrl(message, args) {
  const direct = args.find((value) => /^https?:\/\//i.test(value));
  if (direct) return direct;
  const quote = message?.data?.quote;
  const content = quote?.content;
  return typeof content === "object" ? content.href || content.normalUrl || content.thumb : null;
}

export function registerQrCommands(registry, { qr, client }) {
  registry.register({
    name: "qrcode", aliases: ["createqr"], cooldownMs: 5_000, description: "Tạo ảnh QR từ nội dung",
    async execute({ args, threadId, type, reply }) {
      const text = args.join(" ").trim();
      if (!text) { await reply("Dùng: !qrcode <nội dung>"); return; }
      if (text.length > 2_000) { await reply("Nội dung QR tối đa 2.000 ký tự."); return; }
      const file = await qr.create(text);
      try { await client.api.sendMessage({ msg: "", attachments: [file] }, threadId, type); }
      finally { await qr.tempFiles.remove(file).catch(() => {}); }
    },
  });
  registry.register({
    name: "scanqr", aliases: ["scanqrcode"], cooldownMs: 5_000, description: "Quét QR từ ảnh reply hoặc URL",
    async execute({ args, message, reply }) {
      const url = imageUrl(message, args);
      if (!url) { await reply("Hãy reply ảnh QR hoặc dùng: !scanqr <URL ảnh>"); return; }
      await reply(`Nội dung QR:\n${await qr.scan(url)}`);
    },
  });
}

export { imageUrl as resolveQrImageUrl };
