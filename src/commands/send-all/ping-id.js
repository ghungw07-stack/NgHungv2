import { MessageMention, MessageStyle, MultiMsgStyle } from "../../api-zalo/index.js";
import sharp from "sharp";
import { removeMention } from "../../utils/format-util.js";
import { getGlobalPrefix } from "../../service-ngh/service.js";
import { sendMessageFromSQL, sendMessageWarningRequest } from "../../service-ngh/chat-zalo/chat-style/chat-style.js";
import { groupSettingsAll } from "../../automations/event-send-msg.js";

// Regex bắt số có đúng 6 chữ số liên tiếp, không dính vào số dài hơn (vd 1234567 sẽ không match)
const SIX_DIGIT_REGEX = /(?<!\d)\d{6}(?!\d)/;

// Cooldown chống spam khi bật auto-detect, tính theo từng nhóm (threadId)
const lastAutoPidTime = new Map();
const AUTO_PID_COOLDOWN = 5 * 1000; // 5 giây / nhóm
const IMAGE_OCR_TIMEOUT = 15_000;
const IMAGE_OCR_MAX_BYTES = 8 * 1024 * 1024;
let imageOcrQueue = Promise.resolve();

function getMessageText(message) {
  const content = message?.data?.content ?? message?.content;
  if (typeof content === "string") return content.trim();
  if (!content || typeof content !== "object") return "";
  return String(content.title || content.caption || content.msg || content.text || "").trim();
}

function getQuotedText(message) {
  const quote = message?.data?.quote;
  if (!quote) return "";
  const content = quote.content ?? quote.msg ?? quote.caption ?? quote.title;
  if (typeof content === "string") return content.trim();
  if (content && typeof content === "object") {
    return String(content.title || content.caption || content.msg || content.text || "").trim();
  }
  return "";
}

function getImageUrl(message) {
  const data = message?.data || message || {};
  const msgType = data.msgType || data.cliMsgType || message?.msgType || message?.cliMsgType;
  if (msgType && !["chat.photo", "chat.image"].includes(String(msgType))) return null;
  const content = data.content || data.attach || data;
  if (!content || typeof content !== "object") return null;

  let params = content.params;
  if (typeof params === "string") {
    try { params = JSON.parse(params); } catch { params = null; }
  }
  const url = content.hdUrl || content.hd_url || content.href || content.url || content.imageUrl || content.oriUrl || content.ori_url || content.normalUrl || content.thumbUrl ||
    params?.hdUrl || params?.hd_url || params?.href || params?.url || params?.imageUrl || params?.oriUrl || params?.ori_url || params?.normalUrl || params?.thumbUrl;
  if (!url) return null;

  try {
    const parsed = new URL(url);
    // Only fetch the Zalo CDN image attached to this message; do not turn
    // auto PID into a generic URL fetcher.
    const host = parsed.hostname.toLowerCase();
    return parsed.protocol === "https:" && (host.endsWith(".zdn.vn") || host.endsWith(".zaloapp.com") || host.endsWith(".zalo.me")) ? parsed.href : null;
  } catch {
    return null;
  }
}

async function recognizeIdFromGameImage(imageUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_OCR_TIMEOUT);
  timeout.unref?.();
  try {
    const response = await fetch(imageUrl, { signal: controller.signal });
    if (!response.ok) return "";
    const declaredSize = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredSize) && declaredSize > IMAGE_OCR_MAX_BYTES) return "";
    const imageBuffer = Buffer.from(await response.arrayBuffer());
    if (!imageBuffer.length || imageBuffer.length > IMAGE_OCR_MAX_BYTES) return "";

    const meta = await sharp(imageBuffer).metadata();
    if (!meta.width || !meta.height) return "";
    // Game IDs normally appear in the HUD at the top. Enlarging and enhancing
    // this strip is markedly more reliable than OCRing the whole game screen.
    const topHeight = Math.max(1, Math.min(meta.height, Math.round(meta.height * 0.24)));
    const ocrInput = await sharp(imageBuffer)
      .extract({ left: 0, top: 0, width: meta.width, height: topHeight })
      .resize({ width: Math.max(meta.width, 2560), withoutEnlargement: false })
      .grayscale()
      .normalize()
      .sharpen()
      .toBuffer();
    const { default: Tesseract } = await import("tesseract.js");
    const { data: { text = "" } } = await Tesseract.recognize(ocrInput, "eng", {
      tessedit_char_whitelist: "0123456789IDid:",
      tessedit_pageseg_mode: 11,
    });
    return text;
  } catch (error) {
    console.error("Không thể OCR ảnh cho auto PID:", error?.message || error);
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

function queueImageOcr(imageUrl) {
  const next = imageOcrQueue.catch(() => {}).then(() => recognizeIdFromGameImage(imageUrl));
  imageOcrQueue = next.catch(() => {});
  return next;
}

/**
 * Hàm dùng chung để build nội dung và gửi tin ping-all kèm mã ID.
 */
async function buildAndSendPingId(api, message, groupInfo, gameId, fallbackNoteText, replyTarget = null) {
  const botId = api.getBotId();
  const threadId = message.threadId;
  const senderName = message.data.dName;

  // Payload ảnh đôi khi chứa mention metadata dạng HTML nội bộ của Zalo;
  // đưa lại metadata đó vào msg sẽ làm iOS hiện nguyên thẻ </a_mention>.
  // Chỉ giữ mention người dùng khi lệnh xuất phát từ tin nhắn chữ.
  // PID luôn chỉ tag @ALL; không truyền lại mention metadata của tin nguồn
  // (đặc biệt quote ảnh) vì Zalo/iOS có thể biến nó thành thẻ HTML thô.
  const originalMentions = [];
  // A command sent with an image has content as an object. Always normalize
  // it to text so mention offsets and `substr` never break.
  const originalContentRaw = getMessageText(message);

  const line1 = "@ALL";
  const line2 = `📢 ${senderName} gửi ID: ${gameId}`;
  const line3Prefix = `📝 Nội dung: `;
  const bodyBeforeContent = `${line1}\n${line2}\n${line3Prefix}`;

  let contentSuffix = fallbackNoteText || "";
  const extraMentions = [];

  // Khi dùng `pid` bằng cách reply, luôn tag người tạo tin được reply (kể cả
  // quote là ảnh). Một số payload dùng uidFrom, số khác dùng ownerId/uid.
  const incomingQuote = message.data?.quote;

  if (originalMentions.length > 0) {
    const sortedOriginal = [...originalMentions].sort((a, b) => a.pos - b.pos);
    const mentionEntries = sortedOriginal
      .map((m) => ({ mention: m, name: originalContentRaw.substr(m.pos, m.len).replace(/^@+/u, "").trim() }))
      .filter(({ name }) => name);
    const names = mentionEntries.map(({ name }) => name);
    contentSuffix = names.join(" ");

    let cursor = bodyBeforeContent.length;
    mentionEntries.forEach(({ mention: m, name }) => {
      extraMentions.push(MessageMention(m.uid, name.length, cursor));
      cursor += name.length + 1; // +1 khoảng trắng nối giữa các mention
    });
  }

  if (!contentSuffix) contentSuffix = "Không có";

  // Payload @ALL chuẩn của Zalo dùng UID số -1. Mention rác từ quote ảnh đã
  // được loại ở trên nên iOS không còn hiện thẻ HTML thô.
  const finalText = `${bodyBeforeContent}${contentSuffix}`;
  const allMentions = [{ pos: 0, uid: -1, len: line1.length, type: 1 }, ...extraMentions];

  const style = MultiMsgStyle([
    MessageStyle(line1.length + 1, line2.length, "056fff", "16", true),
  ]);

  await api.sendMessage(
    {
      msg: finalText,
      mentions: allMentions,
      // Preserve the reply relationship when PID is issued by replying to a
      // member's message (including image messages).
      quote: replyTarget || (incomingQuote
        ? (incomingQuote.data ? incomingQuote : { data: incomingQuote })
        : undefined),
      style,
    },
    threadId,
    message.type
  );
}

/**
 * Bật/tắt chế độ tự động dò mã 6 số trong nhóm.
 */
async function togglePidAuto(api, message, groupSettings, arg) {
  const threadId = message.threadId;

  if (!groupSettings[threadId]) {
    groupSettings[threadId] = {};
  }

  const currentSetting = groupSettings[threadId].autoPid || false;
  let newStatus;
  if (["on", "bật", "bat", "enable", "enabled"].includes(arg)) {
    newStatus = true;
  } else if (["off", "tắt", "tat", "disable", "disabled"].includes(arg)) {
    newStatus = false;
  } else {
    newStatus = !currentSetting;
  }

  groupSettings[threadId].autoPid = newStatus;
  groupSettingsAll.setChanged();

  const statusText = newStatus ? "Bật" : "Tắt";
  const statusEmoji = newStatus ? "✅" : "❌";

  const result = {
    success: true,
    message: `${statusEmoji} Đã ${statusText.toLowerCase()} ping ID trong nhóm!`,
  };
  await sendMessageFromSQL(api, message, result, true, 10000);
  return true; // isChangeSetting = true để lưu vào group_settings.json
}

/**
 * Lệnh cài đặt giờ hoạt động cho auto pid.
 */
async function setPidTime(api, message, groupSettings, parts) {
  const threadId = message.threadId;

  if (!groupSettings[threadId]) {
    groupSettings[threadId] = {};
  }

  const onHour = parseInt(parts[1], 10);
  const offHour = parseInt(parts[2], 10);

  if (isNaN(onHour) || isNaN(offHour) || onHour < 0 || onHour > 23 || offHour < 0 || offHour > 23) {
    await sendMessageFromSQL(api, message, {
      success: false,
      message: "❌ Sai định dạng. Hãy dùng lệnh: pid time <giờ_bật> <giờ_tắt>\nVí dụ: pid time 6 22 (bật lúc 6h sáng, tắt lúc 22h đêm).",
    }, true, 10000);
    return false;
  }

  groupSettings[threadId].autoPidSchedule = { on: onHour, off: offHour };
  groupSettingsAll.setChanged();

  await sendMessageFromSQL(api, message, {
    success: true,
    message: `✅ Đã cài đặt giờ tự động dò mã ID: Hoạt động từ ${onHour}h đến ${offHour}h.`,
  }, true, 10000);
  return true;
}

/**
 * Lệnh "pid": Ping toàn bộ thành viên trong nhóm kèm mã ID game.
 *
 * Cách dùng:
 *   pid on / pid off        -> bật / tắt tự động dò mã 6 số trong đoạn chat thường
 *   pid time <on> <off>     -> cài đặt giờ bật/tắt (VD: pid time 6 22)
 *   pid <mã_ID> <nội dung>  -> ping thủ công 1 lần
 *   pid <mã_ID> @thành_viên -> ping thủ công, tag kèm thành viên vào "Nội dung"
 */
export async function handlePingIdCommand(api, message, groupInfo, aliasCommand, groupSettings) {
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);

  const rawContentNoMention = removeMention(message);
  const chatMessage = rawContentNoMention.replace(`${prefix}${aliasCommand}`, "").trim();

  const parts = chatMessage.split(/\s+/).filter(Boolean);
  const firstArg = (parts[0] || "").toLowerCase();

  if (firstArg === "time") {
    return await setPidTime(api, message, groupSettings, parts);
  }

  // pid on / pid off / pid bật / pid tắt -> chuyển sang chế độ toggle
  if (["on", "off", "bật", "bat", "tắt", "tat", "enable", "disable"].includes(firstArg)) {
    return await togglePidAuto(api, message, groupSettings, firstArg);
  }

  let gameId = parts[0];
  let noteText = parts.slice(1).join(" ").trim();

  // `pid` can be sent as a reply to a text/captioned image containing the
  // six-digit ID. Use that text when no ID was typed in the command.
  if (!gameId) {
    const quotedText = getQuotedText(message);
    const quotedId = quotedText.match(SIX_DIGIT_REGEX)?.[0];
    if (quotedId) {
      gameId = quotedId;
      noteText = quotedText.replace(quotedId, "").replace(/\s+/g, " ").trim();
    }
  }

  if (!gameId) {
    const object = {
      caption:
        `Hướng dẫn dùng lệnh Ping ID (tag all kèm mã game):\n` +
        `${prefix}${aliasCommand} on / off     -> bật/tắt tự động dò mã 6 số trong đoạn chat thường\n` +
        `${prefix}${aliasCommand} time <bật> <tắt> -> hẹn giờ tự động bật/tắt (VD: ${prefix}${aliasCommand} time 6 22)\n` +
        `${prefix}${aliasCommand} <mã_ID> <nội_dung/ghi_chú>  -> ping thủ công\n` +
        `Có thể tag kèm thành viên ngay trong lệnh để gắn vào phần "Nội dung".\n` +
        `Ví Dụ 1: ${prefix}${aliasCommand} 661801 Nạp thẻ xong nhắn lại\n` +
        `Ví Dụ 2: ${prefix}${aliasCommand} 661801 @TênThànhViên\n` +
        `Ví Dụ 3: ${prefix}${aliasCommand} on`,
    };
    await sendMessageWarningRequest(api, message, object, 30000);
    return false;
  }

  await buildAndSendPingId(api, message, groupInfo, gameId, noteText);
  return false; // không phải thay đổi setting, khỏi cần lưu file
}

/**
 * Gọi hàm này trong messagesUser (event-send-msg.js) cho MỌI tin nhắn dạng text trong nhóm
 * (không phải command, không phải tin của chính bot) để tự dò mã 6 số và auto ping-all.
 */
export async function checkAutoPingId(api, message, groupSettings, groupInfo) {
  try {
    const threadId = message.threadId;
    if (!groupSettings[threadId]?.autoPid) return;

    const schedule = groupSettings[threadId]?.autoPidSchedule;
    if (schedule) {
      const { on, off } = schedule;
      const currentHour = new Date().getHours();
      
      if (on < off) {
        if (currentHour < on || currentHour >= off) return;
      } else if (on > off) {
        if (currentHour >= off && currentHour < on) return;
      }
    }

    const content = getMessageText(message) || removeMention(message) || "";
    let match = String(content).match(SIX_DIGIT_REGEX);
    let recognizedFromImage = false;
    if (!match) {
      const imageUrl = getImageUrl(message);
      if (!imageUrl) return;
      const ocrText = await queueImageOcr(imageUrl);
      match = ocrText.match(SIX_DIGIT_REGEX);
      recognizedFromImage = Boolean(match);
    }
    if (!match) return;

    const now = Date.now();
    const lastTime = lastAutoPidTime.get(threadId);
    if (lastTime && now - lastTime < AUTO_PID_COOLDOWN) return;
    lastAutoPidTime.set(threadId, now);

    const gameId = match[0];
    const noteText = String(content).replace(gameId, "").replace(/\s+/g, " ").trim()
      || (recognizedFromImage ? "ID được nhận diện từ ảnh" : "Không có");

    await buildAndSendPingId(api, message, groupInfo, gameId, noteText, message);
  } catch (error) {
    console.error("Lỗi auto dò mã ID (pid on):", error);
  }
}
