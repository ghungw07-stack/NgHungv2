import { resolveSentMessageTarget } from "../../../utils/zalo-message-target.js";

// Cùng cơ chế đã chạy ổn ở Baccarat: Zalo hiện số countdown theo số lần
// message xuất hiện trong rMsg. Vì vậy CLOCK/UNDO phải dùng batch của chính
// tin bàn do bot gửi, không reaction vào tin lệnh người chơi.
const activeReactionCountdowns = new Map();
const MAX_COUNTDOWN_REACTIONS = 60;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Sao chép cách Baccarat lấy target reaction: ưu tiên msgIds[0], là tin bot
// vừa gửi; msgId thường có thể là ID của tin lệnh đang được quote.
export async function getBettingBotSentReactionTarget(api, sourceMessage, sent) {
  if (!sent) return resolveSentMessageTarget(api, sourceMessage, sent);
  const sources = [sent?.message, sent?.message?.data, sent?.data, sent, sent?.attachment?.[0], sent?.attachment?.[0]?.data];
  let msgId = null;
  let cliMsgId = null;
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    msgId ||= source.msgIds?.[0] || source.messageIds?.[0] || source.msgId || source.globalMsgId || source.messageId || null;
    cliMsgId ||= source.cliMsgId || source.clientId || source.clientMsgId || null;
  }
  if (msgId && cliMsgId) {
    return {
      type: sourceMessage.type,
      threadId: sourceMessage.threadId,
      data: { msgId: String(msgId), cliMsgId: String(cliMsgId), uidFrom: String(api.getBotId()) },
    };
  }
  return resolveSentMessageTarget(api, sourceMessage, sent);
}

export function stopBettingReactionCountdown(api, threadId) {
  const key = String(threadId || "");
  const current = activeReactionCountdowns.get(key);
  if (!current) return;

  current.cancelled = true;
  activeReactionCountdowns.delete(key);
  const target = current.batch?.length ? [...current.batch] : current.message;
  void api.addReaction("UNDO", target).catch(() => {});
}

export function startBettingReactionCountdown(api, message, seconds, endsAt = null) {
  if (!message || !seconds) return;

  const key = String(message.threadId || "");
  stopBettingReactionCountdown(api, key);

  const deadline = endsAt || Date.now() + Number(seconds) * 1000;
  const state = { cancelled: false, message, batch: null };
  activeReactionCountdowns.set(key, state);

  void (async () => {
    try {
      await sleep(300);
      while (!state.cancelled) {
        const remaining = Math.ceil((deadline - Date.now()) / 1000);
        if (remaining <= 0) break;

        const batch = Array(Math.min(remaining, MAX_COUNTDOWN_REACTIONS)).fill(message);
        state.batch = batch;
        try {
          await api.addReaction("CLOCK", batch);
        } catch (error) {
          console.warn("[betting-countdown] CLOCK lỗi:", error?.message || error);
        }

        await sleep(1000);
        if (state.cancelled) break;
        try {
          await api.addReaction("UNDO", batch);
        } catch (_) { /* bỏ qua lỗi UNDO để tick kế tiếp vẫn chạy */ }
        state.batch = null;
      }
    } catch (error) {
      console.error("[betting-countdown] Countdown reaction lỗi:", error?.message || error);
    } finally {
      if (activeReactionCountdowns.get(key) === state) {
        activeReactionCountdowns.delete(key);
        if (state.batch) await api.addReaction("UNDO", state.batch).catch(() => {});
      }
    }
  })();
}
