import { MessageMention, MessageType } from "../../api-zalo/index.js";
import { apiManager, getBotLeaderAliases, isBotLeader } from "../../index.js";
import { getGlobalPrefix } from "../../service-ngh/service.js";
import { sendMessageComplete, sendMessageWarning } from "../../service-ngh/chat-zalo/chat-style/chat-style.js";

const TIME_TO_LIVE = 30000;

function parseEventSendMessage(api, message, aliasCommand) {
  const content = typeof message.data?.content === "string" ? message.data.content : "";
  const commandText = `${getGlobalPrefix(api.getBotId())}${aliasCommand}`;
  let payload = content.toLowerCase().startsWith(commandText.toLowerCase())
    ? content.slice(commandText.length).trim()
    : "";
  const shouldTagLeader = /\s+tag\s*$/i.test(payload);

  if (shouldTagLeader) {
    payload = payload.replace(/\s+tag\s*$/i, "").trimEnd();
  }

  return { payload, shouldTagLeader };
}

function createChildMessage(payload, shouldTagLeader, childBotId, senderId, senderName) {
  if (!shouldTagLeader) return { msg: payload };

  const localLeaderId = getBotLeaderAliases(childBotId)[0] || senderId;
  const mentionText = `@${senderName}`;
  const msg = `${payload} ${mentionText}`;

  return {
    msg,
    mentions: [MessageMention(localLeaderId, mentionText.length, payload.length + 1)],
  };
}

async function resolveChildThreadId(childApi, mainThreadId, groupLinkPromise) {
  const fallbackThreadId = String(mainThreadId);
  try {
    await childApi.getInfoOneGroup(fallbackThreadId);
    return fallbackThreadId;
  } catch {}

  try {
    const groupLink = await groupLinkPromise;
    if (!groupLink || !childApi.getGroupInfoByLink) return fallbackThreadId;
    const info = await childApi.getGroupInfoByLink(groupLink);
    return String(info?.groupId || info?.id || fallbackThreadId);
  } catch {
    return fallbackThreadId;
  }
}

export async function handleEventSendMessage(api, message, aliasCommand) {
  // Bot con có thể cùng nhìn thấy câu lệnh trong nhóm; chỉ bot chính được phép
  // điều phối để tránh mỗi bot phát lại toàn bộ danh sách thêm một lần.
  if (api.apiManager?.isMainBot !== true) return false;

  const senderId = message.data?.uidFrom;
  if (!isBotLeader(api.getBotId(), senderId)) {
    await sendMessageWarning(api, message, "Chỉ Bot Leader mới được dùng event.sendmsg!", false, TIME_TO_LIVE);
    return true;
  }

  const { payload, shouldTagLeader } = parseEventSendMessage(api, message, aliasCommand);
  if (!payload) {
    const prefix = getGlobalPrefix(api.getBotId());
    await sendMessageWarning(
      api,
      message,
      `Cú pháp: ${prefix}event.sendmsg <nội dung> [tag]`,
      false,
      TIME_TO_LIVE
    );
    return true;
  }

  const senderName = message.data?.dName || api.accountInfo?.name || "Bot Leader";
  const childManagers = Object.values(apiManager.apiManagerObject).filter(
    (manager) => manager?.isMainBot === false && manager?.apiZalo
  );

  if (childManagers.length === 0) {
    await sendMessageWarning(api, message, "Hiện không có bot con nào đang chạy để gửi tin!", false, TIME_TO_LIVE);
    return true;
  }

  let groupLinkPromise;
  try {
    groupLinkPromise = api.getLinkGroupByID(String(message.threadId)).then((result) => {
      const link = result?.link;
      return link && (String(link).startsWith("http") ? String(link) : `https://${link}`);
    });
  } catch {
    groupLinkPromise = Promise.resolve("");
  }

  const results = await Promise.allSettled(
    childManagers.map(async (manager) => {
      const childThreadId = await resolveChildThreadId(
        manager.apiZalo,
        message.threadId,
        groupLinkPromise
      );
      return manager.apiZalo.sendMessage(
        createChildMessage(payload, shouldTagLeader, manager.id, senderId, senderName),
        childThreadId,
        MessageType.GroupMessage
      );
    })
  );

  const failed = results.filter((result) => result.status === "rejected");
  const firstFailure = results.find((result) => result.status === "rejected");
  const firstFailureMessage = firstFailure
    ? `${String(firstFailure.reason?.message || firstFailure.reason || "lỗi không rõ")}${firstFailure.reason?.code ? ` (code ${firstFailure.reason.code})` : ""}`.slice(0, 180)
    : "";
  if (failed.length > 0) {
    const failureDetails = results
      .map((result, index) => {
        if (result.status !== "rejected") return null;
        const manager = childManagers[index];
        const botName = manager.apiZalo.accountInfo?.name || manager.id;
        const reason = result.reason;
        return `${botName}: ${reason?.message || reason || "lỗi không rõ"}${reason?.code ? ` (code ${reason.code})` : ""}`;
      })
      .filter(Boolean);
    console.error(
      `[event.sendmsg] Gửi thành công ${results.length - failed.length}/${results.length} bot con; ` +
        `thất bại ${failed.length} bot. ${failureDetails.join(" | ")}`
    );
  }

  await sendMessageComplete(
    api,
    message,
    `✅ event.sendmsg: ${results.length - failed.length}/${results.length} bot con đã gửi tin.` +
      (failed.length
        ? ` Thất bại ${failed.length} bot. Lỗi đầu tiên: ${firstFailureMessage}`
        : ""),
    false,
    TIME_TO_LIVE
  );

  return true;
}
