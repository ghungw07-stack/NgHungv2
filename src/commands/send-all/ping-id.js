import { MessageMention, MessageStyle, MultiMsgStyle } from "../../api-zalo/index.js";
import { removeMention } from "../../utils/format-util.js";
import { getGroupAdmins } from "../../service-dqt/info-service/group-info.js";
import { getGlobalPrefix } from "../../service-dqt/service.js";
import { sendMessageFromSQL, sendMessageWarningRequest } from "../../service-dqt/chat-zalo/chat-style/chat-style.js";
import { groupSettingsAll } from "../../automations/event-send-msg.js";

// Regex bắt số có đúng 6 chữ số liên tiếp, không dính vào số dài hơn (vd 1234567 sẽ không match)
const SIX_DIGIT_REGEX = /(?<!\d)\d{6}(?!\d)/;

// Cooldown chống spam khi bật auto-detect, tính theo từng nhóm (threadId)
const lastAutoPidTime = new Map();
const AUTO_PID_COOLDOWN = 5 * 1000; // 5 giây / nhóm

/**
 * Hàm dùng chung để build nội dung và gửi tin ping-all kèm mã ID.
 */
async function buildAndSendPingId(api, message, groupInfo, gameId, fallbackNoteText) {
  const botId = api.getBotId();
  const threadId = message.threadId;
  const senderName = message.data.dName;

  const originalMentions = (message.data.mentions || []).filter((m) => m.uid !== botId);
  const originalContentRaw = message.data.content.title ? message.data.content.title : message.data.content;

  const line1 = "@ALL";
  const line2 = `📢 ${senderName} gửi ID: ${gameId}`;
  const line3Prefix = `📝 Nội dung: `;
  const bodyBeforeContent = `${line1}\n${line2}\n${line3Prefix}`;

  let contentSuffix = fallbackNoteText || "";
  const extraMentions = [];

  if (originalMentions.length > 0) {
    const sortedOriginal = [...originalMentions].sort((a, b) => a.pos - b.pos);
    const names = sortedOriginal.map((m) => originalContentRaw.substr(m.pos, m.len));
    contentSuffix = names.join(" ");

    let cursor = bodyBeforeContent.length;
    sortedOriginal.forEach((m, index) => {
      const name = names[index];
      extraMentions.push(MessageMention(m.uid, name.length, cursor));
      cursor += name.length + 1; // +1 khoảng trắng nối giữa các mention
    });
  }

  if (!contentSuffix) contentSuffix = "Không có";

  const finalText = bodyBeforeContent + contentSuffix;

  const groupAdmins = await getGroupAdmins(groupInfo);
  const botIsAdmin = groupAdmins.includes(botId);

  let allMentions;
  if (botIsAdmin) {
    // Bot có quyền admin nhóm -> dùng tag-all chuẩn (uid -1) của Zalo
    // CHỈ phủ đúng phần "@ALL" (line1), KHÔNG phủ toàn bộ finalText,
    // nếu không client sẽ tính lệch offset (do emoji, ký tự đặc biệt...) và
    // hiển thị lỗi ra tag thô <a_mention href="zm://Profile/-1_mention">...
    allMentions = [{ pos: 0, uid: -1, len: line1.length }, ...extraMentions];
  } else {
    // Bot không phải admin -> phải enumerate từng thành viên để tag được toàn bộ nhóm
    const memberMentions = (groupInfo.memVerList || []).map((member) => ({
      pos: finalText.length + 7,
      uid: member.replace(/_0$/, ""),
      len: 0,
    }));
    allMentions = [...memberMentions, ...extraMentions];
  }

  const style = MultiMsgStyle([
    MessageStyle(0, line1.length, "ff3131", "18", true),
    MessageStyle(line1.length + 1, line2.length, "056fff", "16", true),
  ]);

  await api.sendMessage(
    {
      msg: finalText,
      mentions: allMentions,
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
    message:
      `${statusEmoji} Đã ${statusText} tự động dò mã ID (6 số) trong nhóm!\n` +
      (newStatus
        ? `Từ giờ hễ ai gõ 1 số có đúng 6 chữ số trong đoạn chat, bot sẽ tự ping cả nhóm kèm mã đó.`
        : `Muốn ping thì gõ lệnh thủ công: pid <mã_ID> <nội dung>`),
  };
  await sendMessageFromSQL(api, message, result, true, 10000);
  return true; // isChangeSetting = true để lưu vào group_settings.json
}

/**
 * Lệnh "pid": Ping toàn bộ thành viên trong nhóm kèm mã ID game.
 *
 * Cách dùng:
 *   pid on / pid off        -> bật / tắt tự động dò mã 6 số trong đoạn chat thường
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

  // pid on / pid off / pid bật / pid tắt -> chuyển sang chế độ toggle
  if (["on", "off", "bật", "bat", "tắt", "tat", "enable", "disable"].includes(firstArg)) {
    return await togglePidAuto(api, message, groupSettings, firstArg);
  }

  const gameId = parts[0];
  const noteText = parts.slice(1).join(" ").trim();

  if (!gameId) {
    const object = {
      caption:
        `Hướng dẫn dùng lệnh Ping ID (tag all kèm mã game):\n` +
        `${prefix}${aliasCommand} on / off     -> bật/tắt tự động dò mã 6 số trong đoạn chat thường\n` +
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

    const isPlainText = typeof message.data.content === "string";
    if (!isPlainText) return;

    const content = removeMention(message);
    if (!content) return;

    const match = content.match(SIX_DIGIT_REGEX);
    if (!match) return;

    const now = Date.now();
    const lastTime = lastAutoPidTime.get(threadId);
    if (lastTime && now - lastTime < AUTO_PID_COOLDOWN) return;
    lastAutoPidTime.set(threadId, now);

    const gameId = match[0];
    const noteText = content.replace(gameId, "").replace(/\s+/g, " ").trim();

    await buildAndSendPingId(api, message, groupInfo, gameId, noteText);
  } catch (error) {
    console.error("Lỗi auto dò mã ID (pid on):", error);
  }
}