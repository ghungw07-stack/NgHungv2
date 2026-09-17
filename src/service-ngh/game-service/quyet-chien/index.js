import Big from "big.js";
import fs from "node:fs/promises";
import { checkBeforeJoinGame } from "../index.js";
import { getPlayerBalance, getUsernameByIdZalo, updatePlayerBalanceByUsername, recordGameHistory } from "../../../database/player.js";
import { formatCurrency, parseGameAmount } from "../../../utils/format-util.js";
import { getGlobalPrefix } from "../../service.js";
import { sendMessageFromSQL } from "../../chat-zalo/chat-style/chat-style.js";
import { BET_UNITS, spin, evaluate } from "./rules.js";
import { renderQuyetChienCascadeGif } from "./render.js";
import { getRecentGroupMessages } from "../../../utils/zalo-message-target.js";
const MIN_BET = new Big(5000);
function raw(message) { const v = message?.data?.content; return String(v && typeof v === "object" ? v.title || "" : v || "").trim(); }
function help(prefix) { return `🤠 QUYẾT CHIẾN TIỀN THƯỞNG\n${prefix}quyetchien <tiền> [x<số lượt>]\n\nQuay 6 reel × 3 hàng theo cơ chế ways: không cần thẳng hàng. Khớp ít nhất 3 cột liên tiếp từ trái sang phải sẽ thắng; số ways được nhân theo số biểu tượng khớp trên từng cột. Mỗi lượt có 80% trượt và 20% nổ thưởng. WILD thay thế biểu tượng thường, không thay SCATTER. Tiền cược chia 4 cược cơ sở trước khi áp bảng thưởng.\nVí dụ: ${prefix}quyetchien 10k · ${prefix}quyetchien 10k x5\nCược tối thiểu 5.000 xu · tối đa 20 lượt/lệnh.`; }
function parseRounds(value) {
  if (value == null) return 1;
  const match = String(value).trim().match(/^x(\d+)$/iu);
  if (!match) throw new Error("Số lượt phải có dạng x5.");
  const rounds = Number(match[1]);
  if (!Number.isSafeInteger(rounds) || rounds < 1 || rounds > 20) throw new Error("Số lượt phải từ x1 đến x20.");
  return rounds;
}
function messageRef(source) {
  const msgId = source?.msgIds?.[0] ?? source?.messageIds?.[0] ?? source?.msgId ?? source?.globalMsgId ?? source?.messageId;
  const cliMsgId = source?.cliMsgId ?? source?.clientId ?? source?.clientMsgId;
  return msgId && cliMsgId ? { msgId: String(msgId), cliMsgId: String(cliMsgId) } : null;
}
function sentMessageRefs(sent) {
  // GIF and caption are separate Zalo messages. Attachments must be kept first:
  // otherwise only the caption gets recalled while the GIF stays in the chat.
  const item = Array.isArray(sent) ? sent[0] : sent;
  const attachmentRefs = Array.isArray(item?.attachment) ? item.attachment : item?.attachment ? [item.attachment] : [];
  const attachmentsRefs = Array.isArray(item?.attachments) ? item.attachments : item?.attachments ? [item.attachments] : [];
  const sources = [...attachmentRefs, ...attachmentsRefs, item?.message, item?.message?.data, item?.data, item];
  return sources.map(messageRef).filter(Boolean).filter((ref, index, list) => list.findIndex(itemRef => itemRef.msgId === ref.msgId && itemRef.cliMsgId === ref.cliMsgId) === index);
}
async function recallSpinMessages(api, message, refs) {
  for (const ref of refs || []) {
    const target = { type: message.type, threadId: message.threadId, data: { msgId: ref.msgId, cliMsgId: ref.cliMsgId, uidFrom: String(api.getBotId()) } };
    try {
      // GIF is an attachment: direct deletion is the reliable primary path.
      await api.deleteMessage(target, false);
    } catch (error) {
      await api.undoMessage({ type: message.type, threadId: message.threadId, data: { quote: { globalMsgId: ref.msgId, cliMsgId: ref.cliMsgId } } }).catch((undoError) => console.warn("[quyetchien] Không thu hồi được GIF cũ:", undoError?.message || error?.message));
    }
  }
}
async function findLatestGifRef(api, message) {
  if (message.type !== 1 || typeof api.getRecentMessages !== "function") return null;
  await new Promise(resolve => setTimeout(resolve, 650));
  const recent = await getRecentGroupMessages(api, message.threadId, 12).catch(() => []);
  const botId = String(api.getBotId());
  const gif = recent.find(item => String(item?.msgType || "") === "chat.gif" && ["0", botId].includes(String(item?.uidFrom ?? item?.ownerId ?? "")))
    || recent.find(item => String(item?.msgType || "") === "chat.gif");
  return messageRef(gif);
}
export async function handleQuyetChien(api, message, groupSettings) {
  const prefix = getGlobalPrefix(api.getBotId()), escaped = String(prefix).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = raw(message).match(new RegExp(`^${escaped}(?:quyetchien|qchien|bandito|wildbandito)(?:\\s+(.+))?$`, "iu"));
  if (!match) return false;
  const arg = String(match[1] || "").trim();
  if (!arg || /^(?:help|huongdan)$/iu.test(arg)) { await sendMessageFromSQL(api, message, { success: true, message: help(prefix) }, false, 60_000); return true; }
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return true;
  try {
    const args = arg.split(/\s+/u);
    if (args.length > 2) throw new Error(`Cú pháp: ${prefix}quyetchien <tiền> [x<số lượt>].`);
    const rounds = parseRounds(args[1]);
    const username = await getUsernameByIdZalo(message.data.uidFrom), balance = await getPlayerBalance(message.data.uidFrom);
    if (!username || !balance?.success) throw new Error("Không thể lấy hồ sơ hoặc số dư.");
    const parsed = parseGameAmount(args[0], balance.balance);
    if (parsed === "allin" && rounds > 1) throw new Error("Không thể dùng allin khi quay nhiều lượt; hãy nhập số tiền mỗi lượt.");
    const bet = parsed === "allin" ? new Big(balance.balance) : new Big(parsed);
    const totalBet = bet.times(rounds);
    if (bet.lt(MIN_BET)) throw new Error("Cược tối thiểu 5.000 xu.");
    if (totalBet.gt(balance.balance)) throw new Error(`Số dư không đủ cho ${rounds} lượt (${formatCurrency(totalBet)} xu).`);
    const debit = await updatePlayerBalanceByUsername(username, totalBet.neg());
    if (!debit?.success) throw new Error(debit?.message || "Không thể trừ tiền cược.");
    let previousGif = null, previousMessages = [];
    let totalReturned = new Big(0), wonTurns = 0, winningCascades = 0;
    try {
      for (let turn = 1; turn <= rounds; turn += 1) {
        const cascades = [];
        let chainMultiplier = 1, turnReturned = new Big(0), wonThisTurn = false;
        for (let cascade = 1; cascade <= 10; cascade += 1) {
          const grid = spin(), result = evaluate(grid), returned = bet.div(BET_UNITS).times(result.multiplier).times(chainMultiplier).round(0, Big.roundDown);
          cascades.push({ grid, result, chainMultiplier });
          if (returned.lte(0)) break;
          const credit = await updatePlayerBalanceByUsername(username, returned);
          if (!credit?.success) throw new Error(`Không thể trả thưởng lượt ${turn}, chuỗi ${cascade}.`);
          turnReturned = turnReturned.plus(returned); totalReturned = totalReturned.plus(returned);
          wonThisTurn = true; winningCascades += 1;
          chainMultiplier = Math.min(1024, chainMultiplier * 2);
        }
        if (wonThisTurn) wonTurns += 1;
        const gif = await renderQuyetChienCascadeGif(cascades, BET_UNITS);
        // GIF must be sent alone. Zalo then returns the identity of the GIF itself
        // (not the separate caption), so the next turn can reliably recall it.
        const sent = await api.sendMessage({ msg: "", attachments: [gif], ttl: 300_000, isUseProphylactic: true }, message.threadId, message.type);
        let currentMessages = sentMessageRefs(sent);
        const gifRef = await findLatestGifRef(api, message);
        // Persist only the actual GIF identity. Caption/text IDs must never replace it.
        if (gifRef) currentMessages = [gifRef];
        if (!currentMessages.length) console.warn("[quyetchien] GIF mới không trả msgId/cliMsgId để thu hồi:", { attachment: sent?.attachment?.[0] });
        // Same recall method as Xì Dách. Recall both attachment and caption IDs, with GIF first.
        await recallSpinMessages(api, message, previousMessages);
        if (previousGif) await fs.unlink(previousGif).catch(() => {});
        previousGif = gif; previousMessages = currentMessages;
      }
      const net = totalReturned.minus(totalBet);
      recordGameHistory({
        username,
        gameName: "Quyết Chiến",
        gameKey: "quyetchien",
        choice: `${rounds} lượt`,
        amount: totalBet.toString(),
        netAmount: net.toString(),
        isWin: net.gt(0) ? true : net.lt(0) ? false : null,
        detail: `${wonTurns}/${rounds} lượt thắng (${winningCascades} chuỗi)`,
      }).catch(() => {});
      const summary = `🤠 QUAY XONG ${rounds} LƯỢT\n✅ Có thắng: ${wonTurns} lượt · ❌ Trượt ngay: ${rounds - wonTurns} lượt\n🔥 Tổng chuỗi thắng: ${winningCascades}\n💸 Tổng cược: ${formatCurrency(totalBet)} xu\n🎁 Tổng nhận: ${formatCurrency(totalReturned)} xu\n${net.gte(0) ? "📈 Lãi" : "📉 Lỗ"}: ${net.gte(0) ? "+" : ""}${formatCurrency(net)} xu`;
      await api.sendMessage({ msg: summary, quote: message, ttl: 300_000, isUseProphylactic: true }, message.threadId, message.type);
    } finally {
      if (previousGif) setTimeout(() => fs.unlink(previousGif).catch(() => {}), 300_000);
    }
  } catch (error) { await sendMessageFromSQL(api, message, { success: false, message: `❌ ${error.message}` }, false, 30_000); }
  return true;
}

export { parseRounds };
