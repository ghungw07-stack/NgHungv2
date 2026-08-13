import { Permission } from "../../core/permissions.js";
import fs from "node:fs/promises";

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
  let activeTodo = false;
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
      const attachment = parsedAttachment(quote);
      const url = attachment && typeof attachment === "object" ? attachment.href : null;
      await reply(url ? `Link: ${url}` : "Không tìm thấy link trong tin nhắn được reply!");
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
        `Người gửi: ${quote.fromD}`,
        `ID Người Gửi: ${quote.ownerId}`,
        `cliMsgId: ${quote.cliMsgId}`,
        `cliMsgType: ${quote.cliMsgType}`,
        `Time to live: ${quote.ttl}`,
        `Msg: ${quote.msg}`,
        `Đính kèm: ${quote.attach ? JSON.stringify(parsedAttachment(quote), null, 2) : "Không có đính kèm"}`,
      ].join("\n"));
    },
  });

  registry.register({
    name: "quickmessage", aliases: ["quickmsg"], permission: Permission.LEADER, cooldownMs: 5_000,
    description: "Tạo tin nhắn nhanh trên tài khoản Zalo của bot",
    async execute({ content, prefix, reply }) {
      const raw = rawAfterCommand(content, prefix);
      let payload;
      try { payload = JSON.parse(raw); } catch { await reply('Dùng: !quickmessage {"keyword":"ok","title":"Đồng ý"}'); return; }
      if (!payload?.keyword) { await reply('Thiếu trường "keyword".'); return; }
      if (!payload?.title) { await reply('Thiếu trường "title".'); return; }
      try {
        await client.api.addQuickMessage(payload);
        await reply(`Đã tạo quick message thành công. Từ khóa: ${payload.keyword}\nNội dung: ${payload.title}`);
      } catch (error) {
        if (Number(error?.code) === 821 || String(error?.message).includes("821")) await reply("Tài khoản đã đạt giới hạn quick message.");
        else throw error;
      }
    },
  });

  registry.register({
    name: "todo", permission: Permission.LEADER, cooldownMs: 1_000,
    description: "Giao một công việc Zalo cho người được tag hoặc UID",
    async execute({ content, prefix, message, reply }) {
      const raw = String(content).slice(prefix.length).trim(); const parts = raw.split("_");
      if (parts.length === 2 && parts[1].toLowerCase() === "stop") { const wasActive = activeTodo; activeTodo = false; await reply(wasActive ? "Đã dừng tất cả các todo đang chạy!" : "Không có todo nào đang chạy!"); return; }
      if (parts.length < 2) { await reply(`Hướng dẫn dùng lệnh:\n${prefix}todo_[Nội dung công việc]_[Số lần] @user\nhoặc: ${prefix}todo_[Nội dung công việc]_[Số lần]_[ID người nhận]`); return; }
      const todoContent = parts[1].trim(); const repeatCount = Number.parseInt(parts[2], 10) || 1;
      const mentions = (message?.data?.mentions || []).map((item) => String(item.uid || item.id)).filter(Boolean);
      const targets = mentions.length ? mentions : parts[3]?.trim() ? [parts[3].trim().split(/\s/u)[0]] : [];
      if (!todoContent) { await reply("Không Có Nội Dung Công Việc!"); return; }
      if (!targets.length) { await reply("Không Tìm Thấy Mục Tiêu Để Giao Việc!"); return; }
      await reply(`Đã giao việc "${todoContent}" ${repeatCount} lần cho ${targets.length === 1 ? `người dùng ${targets[0]}` : `${targets.length} người`}`);
      activeTodo = true;
      for (let index = 0; index < repeatCount && activeTodo; index++) await client.api.sendTodo(message, todoContent, targets, -1, todoContent);
    },
  });

  registry.register({
    name: "undo", permission: Permission.LEADER, cooldownMs: 1_000,
    description: "Thu hồi tin nhắn của chính bot đang được reply",
    async execute({ message, reply }) {
      const quote = message?.data?.quote;
      if (!quote) { await reply("Hãy reply một tin nhắn của bot cần thu hồi."); return; }
      await client.api.undoMessage(message);
    },
  });

  registry.register({
    name: "sendp", permission: Permission.LEADER, cooldownMs: 1_000,
    description: "Gửi tin nhắn riêng theo cú pháp base cũ",
    async execute({ content, prefix, message, reply }) {
      const parts = String(content).slice(prefix.length).trim().split("_");
      if (parts.length < 2) { await reply(`Cú pháp không đúng. Dùng:\n${prefix}sendp_[Nội dung tin nhắn]_[Số lần] @user\nhoặc: ${prefix}sendp_[Nội dung]_[Số lần]_[ID]`); return; }
      const text = parts[1].trim(); const repeatCount = Number.parseInt(parts[2], 10) || 1;
      const mentions = (message?.data?.mentions || []).map((item) => String(item.uid || item.id)).filter(Boolean);
      const targets = mentions.length ? mentions : parts[3]?.trim() ? [parts[3].trim().split(/\s/u)[0]] : [];
      if (!text) { await reply("Không có nội dung tin nhắn!"); return; }
      if (!targets.length) { await reply("Không tìm thấy người nhận!"); return; }
      await reply(`Đã bắt đầu send tin nhắn riêng "${text}" ${repeatCount} lần cho ${targets.length === 1 ? `người dùng ${targets[0]}` : `${targets.length} người`}`);
      for (const userId of targets) for (let index = 0; index < repeatCount; index++) {
        await client.api.sendMessageForward({ msg: text }, userId, 0, 18_000_000);
      }
      await reply(`Đã hoàn thành gửi tin nhắn riêng cho ${targets.length === 1 ? targets[0] : `${targets.length} người`}`);
    },
  });

  registry.register({
    name: "senduser", permission: Permission.LEADER, cooldownMs: 1_000,
    description: "Gửi nội dung noidung.txt cho người được tag",
    async execute({ content, message, reply }) {
      const parts = String(content).split("|");
      if (parts.length < 3) { await reply("Sai cú pháp. Dùng: !senduser @Tên|delay|số lần"); return; }
      const targets = (message?.data?.mentions || []).map((item) => String(item.uid || item.id)).filter(Boolean);
      if (!targets.length) { await reply("Không có ai được tag trong tin nhắn."); return; }
      const lines = (await fs.readFile(new URL("../../../src/commands/send-all/data/noidung.txt", import.meta.url), "utf8")).split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
      if (!lines.length) { await reply("Không có nội dung hợp lệ trong file noidung.txt."); return; }
      const delay = Number.parseInt(parts[1], 10) || 1_000; const repeatCount = Number.parseInt(parts[2], 10) || 1;
      await reply(`Tiến hành gửi tin nhắn tới ${targets.join(", ")}...`);
      for (let repeat = 0; repeat < repeatCount; repeat++) for (const userId of targets) for (const line of lines) {
        await client.api.sendMessage({ msg: line, message, ttl: 5_000_000 }, userId, 0).catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      await reply(`Đã hoàn thành gửi tin nhắn tới ${targets.join(", ")}.`);
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
