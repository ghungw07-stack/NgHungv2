function replyMediaUrl(message) {
  const content = message?.data?.quote?.content;
  return typeof content === "object" ? content.href || content.normalUrl || content.thumb : null;
}

export function registerStickerCommands(registry, { client }) {
  registry.register({
    name: "sticker", aliases: ["cstk", "stk"], cooldownMs: 5_000, description: "Chuyển ảnh reply thành sticker",
    async execute({ message, reply }) {
      const url = replyMediaUrl(message);
      if (!url) { await reply("Hãy reply một ảnh rồi dùng !sticker"); return; }
      await client.api.sendCustomSticker(message, url, url, 512, 512, 300_000);
    },
  });
  registry.register({
    name: "tenorsticker", aliases: ["memestk", "stkmeme", "meme"], cooldownMs: 5_000, description: "Tìm sticker Tenor qua Zalo",
    async execute({ args, threadId, type, reply }) {
      const keyword = args.join(" ").trim();
      if (!keyword) { await reply("Dùng: !tenorsticker <từ khóa>"); return; }
      const stickers = await client.api.getTenorToStickerMap(keyword);
      const selected = stickers[0];
      if (!selected) { await reply("Không tìm thấy sticker."); return; }
      await client.api.sendSticker({ id: selected.eid || selected.id, cateId: selected.cid, type: 3 }, threadId, type, 300_000);
    },
  });
}

export { replyMediaUrl };
