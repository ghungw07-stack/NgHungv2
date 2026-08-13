import { Permission } from "../../core/permissions.js";

function rawAfterCommand(content, prefix) {
  return String(content).slice(prefix.length).trim().replace(/^\S+\s*/u, "");
}

function quoteMessage(data, threadId, type) {
  return data ? { data, threadId, type } : null;
}

function parsedAttachment(quote) {
  if (!quote?.attach) return null;
  if (typeof quote.attach === "object") return quote.attach;
  try { return JSON.parse(quote.attach); } catch { return quote.attach; }
}

function collectLinks(value, output = new Set(), depth = 0) {
  if (depth > 5 || output.size >= 20 || value == null) return output;
  if (typeof value === "string") {
    for (const match of value.matchAll(/https?:\/\/[^\s"'<>]+/giu)) output.add(match[0]);
    if ((value.startsWith("{") || value.startsWith("[")) && value.length <= 100_000) {
      try { collectLinks(JSON.parse(value), output, depth + 1); } catch {}
    }
    return output;
  }
  if (Array.isArray(value)) for (const item of value) collectLinks(item, output, depth + 1);
  else if (typeof value === "object") for (const item of Object.values(value)) collectLinks(item, output, depth + 1);
  return output;
}

function clippedJson(value, limit = 3_000) {
  if (value == null) return "Không có đính kèm";
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > limit ? `${text.slice(0, limit)}\n… (đã rút gọn)` : text;
}

function mentionForPart(message, part, output, minimumPosition = 0) {
  const requested = part.replace(/^tag\s+/i, "").trim();
  if (!requested) return null;
  const mentions = (message?.data?.mentions || []).filter((item) => Number(item.pos) >= minimumPosition);
  const mention = mentions.at(-1) || message?.data?.mentions?.at(-1);
  const uid = mention?.uid || mention?.id;
  if (!uid) return null;
  const label = requested.startsWith("@") ? requested : `@${requested}`;
  return { label, mention: { uid: String(uid), pos: output.length + 1, len: label.length } };
}

export function registerMessageActionCommands(registry, { client, groups }) {
  registry.register({
    name: "fakemsg", permission: Permission.ADMIN, cooldownMs: 3_000,
    description: "Tạo tin nhắn trả lời giả lập từ tin đang reply",
    async execute({ content, prefix, message, threadId, type, reply }) {
      const quoted = message?.data?.quote;
      const quotedUserId = quoted?.uidFrom || quoted?.ownerId;
      if (!quoted || !quotedUserId) {
        await reply("Hãy reply tin nhắn cần giả lập. Dùng: !fakemsg <tin giả>|<câu trả lời>|[@tag]");
        return;
      }
      const raw = rawAfterCommand(content, prefix);
      const separators = [...raw.matchAll(/\|/g)].map((match) => match.index);
      const parts = raw.split("|").map((part) => part.trim());
      if (parts.length < 2 || !parts[0] || !parts[1]) {
        await reply("Dùng: !fakemsg <tin giả>|<câu trả lời>|[@tag]");
        return;
      }
      const fakeText = parts[0].slice(0, 2000);
      let output = parts[1].slice(0, 1800);
      let mentions;
      if (parts[2]) {
        const selected = mentionForPart(message, parts.slice(2).join("|"), output, separators[1] || 0);
        if (selected) {
          output += ` ${selected.label}`;
          mentions = [selected.mention];
        }
      }
      const now = Date.now();
      const fakeQuote = {
        data: {
          uidFrom: String(quotedUserId), msgId: String(now), cliMsgId: String(now + 1),
          msgType: "webchat", ts: now, ttl: 0, content: fakeText,
        },
        threadId, type,
      };
      await client.api.sendMessage({ msg: output, mentions, quote: fakeQuote, ttl: 300_000 }, threadId, type);
    },
  });

  registry.register({
    name: "reply", description: "Trả lời tin nhắn đang được reply",
    async execute({ args, message, threadId, type, reply }) {
      const text = args.join(" ").trim();
      if (!text || !message?.data?.quote) { await reply("Hãy reply một tin và nhập: !reply <nội dung>"); return; }
      await client.api.sendMessage({ msg: text, quote: quoteMessage(message.data.quote, threadId, type) }, threadId, type);
    },
  });

  registry.register({
    name: "getlink", aliases: ["gl"], cooldownMs: 3_000,
    description: "Lấy các liên kết từ tin nhắn đang reply",
    async execute({ message, reply }) {
      const quote = message?.data?.quote;
      if (!quote) { await reply("Hãy reply tin nhắn cần lấy liên kết."); return; }
      const links = [...collectLinks([quote.content, quote.msg, parsedAttachment(quote)])];
      await reply(links.length ? [`Tìm thấy ${links.length} liên kết:`, ...links.map((url) => `• ${url}`)].join("\n") : "Không tìm thấy liên kết trong tin nhắn được reply.");
    },
  });

  registry.register({
    name: "getmessage", aliases: ["gmsg"], cooldownMs: 3_000,
    description: "Xem thông tin an toàn của tin nhắn đang reply",
    async execute({ message, reply }) {
      const quote = message?.data?.quote;
      if (!quote) { await reply("Hãy reply tin nhắn cần xem thông tin."); return; }
      await reply([
        "THÔNG TIN TIN NHẮN",
        `Người gửi: ${quote.fromD || quote.dName || "Không rõ"}`,
        `UID: ${quote.ownerId || quote.uidFrom || "Không rõ"}`,
        `Message ID: ${quote.msgId || quote.cliMsgId || "Không rõ"}`,
        `Loại: ${quote.cliMsgType ?? quote.msgType ?? "Không rõ"}`,
        `TTL: ${quote.ttl ?? 0}`,
        `Nội dung: ${String(quote.msg ?? quote.content ?? "").slice(0, 1_000) || "(trống)"}`,
        `Đính kèm:\n${clippedJson(parsedAttachment(quote))}`,
      ].join("\n"));
    },
  });

  registry.register({
    name: "tagall", aliases: ["all"], permission: Permission.ADMIN, cooldownMs: 10_000,
    description: "Tag toàn bộ thành viên nhóm",
    async execute({ args, threadId, type, reply }) {
      if (type !== 1) { await reply("Lệnh này chỉ dùng trong nhóm."); return; }
      const text = args.join(" ").trim() || "Thông báo toàn nhóm";
      const output = `@All ${text}`;
      await client.api.sendMessage({ msg: output, mentions: [{ uid: "-1", pos: 0, len: 4 }] }, threadId, type);
    },
  });

  registry.register({
    name: "mute", permission: Permission.ADMIN, description: "Tắt thông báo cuộc trò chuyện",
    async execute({ threadId, type, reply }) {
      await client.api.setMute({ duration: -1, action: 1 }, threadId, type);
      await reply("Đã tắt thông báo cuộc trò chuyện.");
    },
  });
  registry.register({
    name: "unmute", permission: Permission.ADMIN, description: "Bật lại thông báo cuộc trò chuyện",
    async execute({ threadId, type, reply }) {
      await client.api.setMute({ duration: -1, action: 3 }, threadId, type);
      await reply("Đã bật lại thông báo cuộc trò chuyện.");
    },
  });

  registry.register({
    name: "addusertogroup", aliases: ["adduser"], permission: Permission.ADMIN,
    description: "Thêm người dùng vào nhóm bằng mention hoặc UID",
    async execute({ args, message, threadId, type, reply }) {
      if (type !== 1) { await reply("Lệnh này chỉ dùng trong nhóm."); return; }
      const ids = [...new Set([
        ...(message?.data?.mentions || []).map((item) => String(item.uid || item.id)),
        ...args.filter((arg) => /^\d{6,}$/.test(arg)),
      ].filter(Boolean))];
      if (!ids.length) { await reply("Hãy tag hoặc nhập UID người cần thêm."); return; }
      await client.api.addUserToGroup(threadId, ids);
      groups.invalidate(threadId);
      await reply(`Đã gửi yêu cầu thêm ${ids.length} người.`);
    },
  });
}

export { rawAfterCommand, mentionForPart, parsedAttachment, collectLinks, clippedJson };
