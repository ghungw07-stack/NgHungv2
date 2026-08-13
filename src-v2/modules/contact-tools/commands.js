function targetId(message, senderId) {
  return String(message?.data?.mentions?.[0]?.uid || message?.data?.mentions?.[0]?.id || senderId);
}

export function registerContactCommands(registry, { client, qr }) {
  registry.register({
    name: "card", description: "Gửi danh thiếp Zalo của bạn hoặc người được tag",
    async execute({ message, senderId, threadId, type }) {
      await client.api.sendBusinessCard(null, targetId(message, senderId), undefined, type, threadId, 300_000);
    },
  });
  registry.register({
    name: "qrcard", description: "Tạo QR trang Zalo của bạn hoặc người được tag",
    async execute({ message, senderId, threadId, type }) {
      const id = targetId(message, senderId);
      const file = await qr.create(`https://zalo.me/${id}`);
      try { await client.api.sendMessage({ msg: "", attachments: [file] }, threadId, type); }
      finally { await qr.tempFiles.remove(file).catch(() => {}); }
    },
  });
}
