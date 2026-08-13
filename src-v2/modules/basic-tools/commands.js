import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";

function cleanHost(value) {
  const raw = String(value || "").trim();
  try { return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname; }
  catch { return null; }
}

export function registerBasicToolCommands(registry) {
  registry.register({
    name: "clock", aliases: ["lich"], description: "Xem ngày giờ Việt Nam",
    async execute({ reply }) {
      await reply(new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "full", timeStyle: "long" }).format(new Date()));
    },
  });
  registry.register({
    name: "password", aliases: ["matkhau"], description: "Tạo mật khẩu ngẫu nhiên an toàn",
    async execute({ args, reply }) {
      const length = Math.min(64, Math.max(8, Number(args[0]) || 16));
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
      const bytes = crypto.randomBytes(length);
      await reply([...bytes].map((byte) => alphabet[byte % alphabet.length]).join(""));
    },
  });
  registry.register({
    name: "hash", description: "Tạo SHA-256 từ nội dung",
    async execute({ args, reply }) {
      const text = args.join(" ");
      if (!text) { await reply("Dùng: !hash <nội dung>"); return; }
      await reply(crypto.createHash("sha256").update(text).digest("hex"));
    },
  });
  registry.register({
    name: "checkdomain", aliases: ["checkip"], cooldownMs: 5_000, description: "Tra DNS domain hoặc địa chỉ IP",
    async execute({ args, reply }) {
      const host = cleanHost(args[0]);
      if (!host) { await reply("Dùng: !checkdomain <domain hoặc IP>"); return; }
      if (net.isIP(host)) { await reply(`IP hợp lệ (IPv${net.isIP(host)}): ${host}`); return; }
      const result = await dns.lookup(host, { all: true });
      await reply([`DNS: ${host}`, ...result.map((item) => `• IPv${item.family}: ${item.address}`)].join("\n"));
    },
  });
}

export { cleanHost };
