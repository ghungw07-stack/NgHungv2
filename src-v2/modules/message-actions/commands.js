import { Permission } from "../../core/permissions.js";

function rawAfterCommand(content, prefix) {
  return String(content).slice(prefix.length).trim().replace(/^\S+\s*/u, "");
}

function quoteMessage(data, threadId, type) {
  return data ? { data, threadId, type } : null;
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

export { rawAfterCommand, mentionForPart };
