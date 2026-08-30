import { getGlobalPrefix } from "../../service-ngh/service.js";
import { removeMention } from "../../utils/format-util.js";
import { MessageStyle, MessageType } from "../../api-zalo/models/Message.js";

const spamSessions = new Map(); // Lưu session spam theo threadId
const configuredMinSpamDelay = Number(process.env.NGH_SPAM_MIN_DELAY_SECONDS);
const MIN_SPAM_DELAY_SECONDS = Number.isFinite(configuredMinSpamDelay)
  ? Math.max(0, configuredMinSpamDelay)
  : 0;
const MAX_CONSECUTIVE_SEND_FAILURES = Math.max(3, Number(process.env.NGH_SPAM_MAX_FAILURES) || 10);
const MAX_FAILURE_BACKOFF_MS = 30_000;
const ALLOWED_FONT_SIZES = new Set(["10", "11", "12", "13", "14", "15", "16", "17", "18", "20", "22", "24", "28", "32", "36", "40"]);
const NAMED_FONT_COLORS = new Map([
  ["do", "db342e"],
  // Bảng màu tương thích rich-text của Zalo; màu vàng hiển thị thiên cam.
  ["cam", "f7b503"],
  ["vang", "f7b503"],
  ["xanh", "15a85f"],
  ["xanhla", "15a85f"],
  ["xanhduong", "056fff"],
  ["blue", "056fff"],
  ["tim", "8b5cf6"],
  ["hong", "ec4899"],
  ["den", "1f2937"],
  ["rainbow", ["db342e", "ef6c00", "f7b503", "15a85f", "056fff", "8b5cf6"]],
  ["cauvong", ["db342e", "ef6c00", "f7b503", "15a85f", "056fff", "8b5cf6"]],
]);

function normalizeOption(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_-]+/g, "");
}

function parseFontSize(value) {
  const normalized = normalizeOption(value);
  return ALLOWED_FONT_SIZES.has(normalized) ? normalized : null;
}

function parseFontColor(value) {
  const normalized = normalizeOption(value).replace(/^#/, "");
  return NAMED_FONT_COLORS.get(normalized) || (/^[0-9a-f]{6}$/.test(normalized) ? normalized : null);
}

function fontColorLabel(color) {
  return Array.isArray(color) ? "cầu vồng" : `#${color}`;
}

export async function spamgroup(api, message, aliasCommand) {
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const threadId = message.threadId;
  const content = removeMention(message); // giống scold-user.js

  const sendSyntaxError = () => api.sendMessage(
    {
      msg:
        `⚠️ Cú pháp sai. Dùng:\n` +
        `- ${prefix}${aliasCommand} <nội dung>|<số lần>|<delay>|<màu>|<size số>\n` +
        `  VD: ${prefix}${aliasCommand} Hello|10|2|cam|36\n` +
        `- ${prefix}${aliasCommand} <nội dung>|<số lần>|<delay> (style đã lưu)\n` +
        `- ${prefix}${aliasCommand} <nội dung>|<delay (giây)> (gửi liên tục)\n` +
        `- ${prefix}${aliasCommand} style|<size số>|<màu> (viết gọn: st)\n` +
        `- ${prefix}${aliasCommand} size|<size số> hoặc mau|<màu>\n` +
        `- ${prefix}${aliasCommand} delay|<giá trị mới>\n` +
        `- ${prefix}${aliasCommand} set|<ttl (ms)>\n` +
        `- ${prefix}${aliasCommand} stop`,
      quote: message,
      ttl: 60000
    },
    threadId,
    message.type,
  );

  // Nếu chỉ gõ mỗi lệnh
  if (content.toLowerCase() === `${prefix}${aliasCommand}`) {
    return sendSyntaxError();
  }

  const args = content.slice(`${prefix}${aliasCommand}`.length).trim();

  // Lấy session của threadId hiện tại
  let session = spamSessions.get(threadId);
  if (!session) {
    session = {
      isSpamming: false,
      text: "",
      delay: 1,
      ttl: 10000, // TTL mặc định 10s
      fontSize: "18",
      fontColor: "1f2937",
      useColor: false,
      interval: null,
      runId: 0,
      repeatCount: Infinity,
      sentCount: 0,
      consecutiveFailures: 0,
      lastErrorLogAt: 0,
    };
    spamSessions.set(threadId, session);
  }

  // Chỉnh gọn cả size và màu: spgr st|36|cam
  if (/^(style|st)\|/i.test(args)) {
    const [, sizeInput, colorInput, ...extra] = args.split("|");
    const fontSize = parseFontSize(sizeInput);
    const fontColor = parseFontColor(colorInput);
    if (!fontSize || !fontColor || extra.length) {
      return api.sendMessage(
        {
          msg:
            `⚠️ Dùng: ${prefix}${aliasCommand} st|<size số>|<màu>\n` +
            "VD: st|36|cam · st|20|xanhduong · st|24|rainbow",
          quote: message,
          ttl: 60000,
        },
        threadId,
        message.type
      );
    }
    session.fontSize = fontSize;
    session.fontColor = fontColor;
    session.useColor = true;
    return api.sendMessage(
      {
        msg: `✅ Style spam: size ${fontSize} · màu ${fontColorLabel(fontColor)}.`,
        quote: message,
        ttl: 60000,
      },
      threadId,
      message.type
    );
  }

  // Đổi cỡ chữ của nội dung spam (lưu riêng theo từng nhóm)
  if (args.toLowerCase().startsWith("size|")) {
    const fontSize = parseFontSize(args.slice(args.indexOf("|") + 1));
    if (!fontSize) {
      return api.sendMessage(
        {
          msg:
            "⚠️ Size không hợp lệ.\n" +
            `Size hỗ trợ: ${[...ALLOWED_FONT_SIZES].join(", ")}`,
          quote: message,
          ttl: 60000,
        },
        threadId,
        message.type
      );
    }
    session.fontSize = fontSize;
    return api.sendMessage(
      { msg: `✅ Đã đổi size chữ spam thành ${fontSize}.`, quote: message, ttl: 60000 },
      threadId,
      message.type
    );
  }

  // Đổi riêng màu chữ
  if (/^(mau|màu|color)\|/i.test(args)) {
    const fontColor = parseFontColor(args.slice(args.indexOf("|") + 1));
    if (!fontColor) {
      return api.sendMessage(
        {
          msg: "⚠️ Màu: do, cam, vang, xanh, xanhduong, tim, hong, den, rainbow hoặc mã hex.",
          quote: message,
          ttl: 60000,
        },
        threadId,
        message.type
      );
    }
    session.fontColor = fontColor;
    session.useColor = true;
    return api.sendMessage(
      { msg: `✅ Đã đổi màu chữ spam thành ${fontColorLabel(fontColor)}.`, quote: message, ttl: 60000 },
      threadId,
      message.type
    );
  }

  // STOP
  if (args.toLowerCase() === "stop") {
    if (session.isSpamming) {
      clearTimeout(session.interval);
      session.isSpamming = false;
      session.runId++;
      return api.sendMessage(
        { msg: "✅ Đã dừng spam.", quote: message, ttl: 60000 },
        threadId,
        message.type
      );
    }
    return api.sendMessage(
      { msg: "⚠️ Không có spam nào đang chạy.", quote: message, ttl: 60000 },
      threadId,
      message.type
    );
  }

  // Đổi DELAY
  if (args.toLowerCase().startsWith("delay|")) {
    const newDelay = Number(args.split("|")[1]);
    if (!Number.isFinite(newDelay) || newDelay < MIN_SPAM_DELAY_SECONDS) {
      return api.sendMessage(
        { msg: `⚠️ Delay tối thiểu là ${MIN_SPAM_DELAY_SECONDS}s để không làm nghẽn bot.`, quote: message, ttl: 60000 },
        threadId,
        message.type
      );
    }
    session.delay = newDelay;
    if (session.isSpamming) {
      startSpamLoop(api, threadId, session);
    }
    return api.sendMessage(
      { msg: `✅ Đã đổi delay thành ${session.delay}s.`, quote: message, ttl: 60000 },
      threadId,
      message.type
    );
  }

  // Đổi TTL
  if (args.toLowerCase().startsWith("set|")) {
    const newTTL = parseInt(args.split("|")[1]);
    if (isNaN(newTTL) || newTTL < 0) {
      return api.sendMessage(
        { msg: "⚠️ TTL không hợp lệ.", quote: message, ttl: 60000 },
        threadId,
        message.type
      );
    }
    session.ttl = newTTL;
    return api.sendMessage(
      { msg: `✅ TTL đã đặt thành ${session.ttl}ms.`, quote: message, ttl: 60000 },
      threadId,
      message.type
    );
  }

  // BẮT ĐẦU SPAM
  if (args.includes("|")) {
    const parts = args.split("|");
    // Cú pháp gọn một dòng: nội dung|số lần|delay|màu|size
    let inlineFontSize = null;
    let inlineFontColor = null;
    if (parts.length >= 4) {
      const possibleSize = parseFontSize(parts.at(-1));
      const possibleColor = parseFontColor(parts.at(-2));
      if (possibleSize && possibleColor) {
        inlineFontSize = possibleSize;
        inlineFontColor = possibleColor;
        parts.splice(-2, 2);
      }
    }
    const hasRepeatCount = parts.length >= 3;
    const delayStr = parts.pop();
    const repeatStr = hasRepeatCount ? parts.pop() : null;
    const msgContent = parts.join("|");
    const delay = Number(delayStr);
    const repeatCount = hasRepeatCount ? Number(repeatStr) : Infinity;
    if (
      !msgContent.trim() ||
      !Number.isFinite(delay) ||
      delay < MIN_SPAM_DELAY_SECONDS ||
      (hasRepeatCount && (!Number.isInteger(repeatCount) || repeatCount < 1))
    ) {
      return sendSyntaxError();
    }

    session.text = msgContent.trim();
    session.delay = delay;
    session.repeatCount = repeatCount;
    session.sentCount = 0;
    session.consecutiveFailures = 0;
    // Có màu trong chính lệnh spam thì gửi thường để Zalo áp style;
    // không có màu thì giữ cách gửi chuyển tiếp như lệnh cũ.
    session.useColor = Boolean(inlineFontSize && inlineFontColor);
    if (inlineFontSize && inlineFontColor) {
      session.fontSize = inlineFontSize;
      session.fontColor = inlineFontColor;
    }

    session.isSpamming = true;
    startSpamLoop(api, threadId, session);

    return api.sendMessage(
      {
        msg:
          `✅ Bắt đầu spam:\n"${session.text}"\n` +
          `🔁 Số lần: ${Number.isFinite(session.repeatCount) ? session.repeatCount : "liên tục"}\n` +
          `⏱ Delay: ${session.delay}s\n` +
          `${session.useColor ? `🎨 Style: ${session.fontSize} · ${fontColorLabel(session.fontColor)}\n` : "↪️ Kiểu gửi: chuyển tiếp\n"}` +
          `🕒 TTL: ${session.ttl}ms`,
        quote: message,
        ttl: 60000
      },
      threadId,
      message.type
    );
  }

  // Không khớp cú pháp
  return sendSyntaxError();
}

function startSpamLoop(api, threadId, session) {
  clearTimeout(session.interval);
  const runId = ++session.runId;

  const run = async () => {
    if (!session.isSpamming || session.runId !== runId) return;
    let nextDelayMs = Math.max(MIN_SPAM_DELAY_SECONDS * 1000, session.delay * 1000);
    try {
      await sendSpam(api, threadId, session.text, session.ttl, session.fontSize, session.fontColor, session.useColor);
      session.consecutiveFailures = 0;
      session.sentCount++;
      if (session.sentCount >= session.repeatCount) {
        session.isSpamming = false;
        return;
      }
    } catch (error) {
      session.consecutiveFailures++;
      nextDelayMs = Math.min(
        MAX_FAILURE_BACKOFF_MS,
        nextDelayMs * 2 ** Math.min(session.consecutiveFailures, 5)
      );
      const now = Date.now();
      if (now - session.lastErrorLogAt >= 10_000) {
        session.lastErrorLogAt = now;
        console.error(
          `Lỗi gửi spam group (thread=${threadId}, lần ${session.consecutiveFailures}):`,
          error?.message || error
        );
      }
      if (session.consecutiveFailures >= MAX_CONSECUTIVE_SEND_FAILURES) {
        session.isSpamming = false;
        console.error(`Đã tự dừng spam group thread=${threadId} sau ${session.consecutiveFailures} lỗi liên tiếp.`);
      }
    } finally {
      if (session.isSpamming && session.runId === runId) {
        session.interval = setTimeout(run, nextDelayMs);
        session.interval.unref?.();
      }
    }
  };

  session.interval = setTimeout(run, session.delay * 1000);
}

async function sendSpam(api, threadId, text, ttl, fontSize, fontColor, useColor) {
  if (!text) return;
  if (!useColor) {
    return api.sendMessageForward(
      { msg: text },
      threadId,
      MessageType.GroupMessage,
      ttl
    );
  }
  return api.sendMessage(
    {
      msg: text,
      style: MessageStyle(0, text.length, fontColor, fontSize),
      ttl,
    },
    threadId,
    MessageType.GroupMessage
  );
}
