export function registerPaymentCommands(registry, { qr, client, identity }) {
  registry.register({
    name: "thuebot", aliases: ["rentbot", "giahan"], cooldownMs: 10_000,
    description: "Lấy QR thanh toán thuê bot 80.000đ/tháng",
    async execute({ senderId, threadId, type, reply }) {
      const targetId = identity.isMain ? senderId : identity.ownerId;
      if (!targetId) { await reply("Không xác định được UID cần gia hạn."); return; }
      await qr.send({ client, threadId, type, targetId, kind: "BOTPAY" });
    },
  });
  registry.register({
    name: "donate", cooldownMs: 10_000, description: "Lấy QR ủng hộ và nhận tiền game",
    async execute({ senderId, threadId, type }) {
      await qr.send({ client, threadId, type, targetId: senderId, kind: "DONATE" });
    },
  });
}
