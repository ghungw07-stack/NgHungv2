import { getGlobalPrefix } from "../../service-ngh/service.js";
import { removeMention } from "../../utils/format-util.js";

const joinSessions = new Map();
const MIN_DELAY_MS = 100;
const MAX_ITERATIONS = 100;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getGroupId(info) {
  return info?.data?.id || info?.data?.groupId || info?.data?.grid
    || info?.id || info?.groupId || info?.grid;
}

function parseArguments(args) {
  const parts = args.includes("|")
    ? args.split("|").map((part) => part.trim())
    : args.trim().split(/\s+/);
  if (parts.length !== 3) return null;

  const [link, countText, delayText] = parts;
  const count = Number(countText);
  const delay = Number(delayText);
  if (!/^https?:\/\/(?:www\.)?zalo\.me\/g\/[\w-]+(?:[/?#].*)?$/i.test(link)
    || !Number.isInteger(count) || count < 1 || count > MAX_ITERATIONS
    || !Number.isInteger(delay) || delay < MIN_DELAY_MS) return null;
  return { link, count, delay };
}

export async function spamjoin(api, message, aliasCommand) {
  const botId = String(api.getBotId());
  const prefix = getGlobalPrefix(botId);
  const threadId = message.threadId;
  const sessionKey = `${botId}:${threadId}`;
  const content = removeMention(message);
  const args = content.slice(`${prefix}${aliasCommand}`.length).trim();
  const send = (msg, quote = true) => api.sendMessage(
    { msg, ...(quote ? { quote: message } : {}), ttl: 60000 }, threadId, message.type
  );
  const sendSyntaxError = () => send(
    `⚠️ Cú pháp: ${prefix}${aliasCommand} <link> <số lần> <delay ms>\n`
    + `Ví dụ: ${prefix}${aliasCommand} https://zalo.me/g/xxxxxx 10 1000\n`
    + `Giới hạn: tối đa ${MAX_ITERATIONS} lần, delay tối thiểu ${MIN_DELAY_MS}ms.\n`
    + `Dừng lệnh: ${prefix}${aliasCommand} stop`
  );

  if (!args) return sendSyntaxError();
  if (args.toLowerCase() === "stop") {
    const current = joinSessions.get(sessionKey);
    if (!current?.running) return send("⚠️ Không có gjoin nào đang chạy.");
    current.running = false;
    return send("✅ Đã nhận yêu cầu dừng gjoin.");
  }

  const options = parseArguments(args);
  if (!options) return sendSyntaxError();
  if (joinSessions.get(sessionKey)?.running) {
    return send(`⚠️ Đang có một lệnh gjoin chạy ở đây. Dùng ${prefix}${aliasCommand} stop trước.`);
  }

  let groupInfo;
  try {
    groupInfo = await api.getGroupInfoByLink(options.link);
  } catch (error) {
    return send(`❌ Link nhóm không hợp lệ hoặc không truy cập được: ${error?.message || error}`);
  }
  const groupId = getGroupId(groupInfo);
  if (!groupId) return send("❌ Không lấy được ID nhóm từ link này.");

  const session = { running: true, completed: 0, failed: 0 };
  joinSessions.set(sessionKey, session);
  await send(`✅ Bắt đầu gjoin ${options.count} lần, delay ${options.delay}ms.\nMỗi lượt: xin vào nhóm → huỷ yêu cầu → chờ delay.`);

  void (async () => {
    for (let index = 0; index < options.count && session.running; index += 1) {
      let stage = "xin vào nhóm";
      try {
        try {
          await api.joinGroup(options.link);
        } catch (joinError) {
          const joinErrorText = String(joinError?.message || joinError).toLowerCase();
          const requestWasCreated = joinErrorText.includes("waiting for approve")
            || joinErrorText.includes("chờ duyệt")
            || joinErrorText.includes("pending");
          if (!requestWasCreated) throw joinError;
        }
        stage = "huỷ yêu cầu";
        await api.cancelGroupJoin(options.link);
        session.completed += 1;
      } catch (error) {
        session.failed += 1;
        const errorMessage = String(error?.message || error);
        console.warn(`[gjoin] Lượt ${index + 1} lỗi ở bước ${stage}:`, errorMessage);
        const text = String(error?.message || error).toLowerCase();
        if (text.includes("member") || text.includes("thành viên")) {
          try { await api.leaveGroup(groupId, true); } catch { /* giữ lỗi gốc */ }
        }
        session.running = false;
        try {
          await send(`❌ Gjoin dừng ở lượt ${index + 1}, bước ${stage}.\nLỗi Zalo: ${errorMessage.slice(0, 500)}`, false);
        } catch { /* thông báo tổng kết bên dưới sẽ thử gửi lại */ }
      }
      if (index < options.count - 1 && session.running) await sleep(options.delay);
    }

    const stopped = !session.running;
    session.running = false;
    joinSessions.delete(sessionKey);
    try {
      await send(`${stopped ? "⏹️ Đã dừng" : "✅ Đã hoàn thành"} gjoin.\nThành công: ${session.completed}/${options.count}`
        + (session.failed ? `\nLỗi: ${session.failed}` : ""), false);
    } catch (error) {
      console.warn("[gjoin] Không gửi được thông báo kết thúc:", error?.message || error);
    }
  })();
}
