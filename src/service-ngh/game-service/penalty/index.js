import Big from "big.js";
import fs from "node:fs/promises";
import { checkBeforeJoinGame } from "../index.js";
import { getPlayerBalance, getUsernameByIdZalo, updatePlayerBalanceByUsername, recordGameHistory } from "../../../database/player.js";
import { formatCurrency, parseGameAmount } from "../../../utils/format-util.js";
import { getGlobalPrefix } from "../../service.js";
import { sendMessageFromSQL } from "../../chat-zalo/chat-style/chat-style.js";
import { renderPenaltyGif } from "./render.js";
import { PENALTY_CELLS, resolvePenaltyCell, shootPenalty } from "./rules.js";

const MIN_BET = new Big(5000);
const commandNames = "(?:sut|sút|penalty|pen)";
function contentOf(message) { const content = message?.data?.content; return String(content && typeof content === "object" ? content.title || "" : content || "").trim(); }
function usage(prefix) {
  return `⚽ SÚT PENALTY 11M\n${prefix}sut <tiền> <ô 1-9>\n\nChọn 1 trong 9 ô khung thành rồi sút. Thủ môn đổ theo 1 cột (trái/giữa/phải): trùng cột thì có thể bị CẢN; nhắm càng hiểm thì càng dễ VỌT XÀ nhưng ăn càng đậm.\n\n1 2.96x   2 2.28x   3 2.96x  ← góc chữ A\n4 2.03x   5 1.80x   6 2.03x  ← tầm ngang\n7 1.94x   8 1.77x   9 1.94x  ← sát đất\n\n${prefix}sut 10k 1 — sút ô 1\n${prefix}sut 10k giua — sút ô 5\nDùng trai/giua/phai, thêm cao/thap (traicao · trai · traithap · giua · giuathap …)\n\nCược tối thiểu 5.000 xu · thắng trừ 5% phí trên phần lời. Hệ số đã cân sao cho mọi ô cùng tỉ lệ trả thưởng sau phí.`;
}

export async function handlePenalty(api, message, groupSettings) {
  const prefix = getGlobalPrefix(api.getBotId());
  const escaped = String(prefix).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = contentOf(message).match(new RegExp(`^${escaped}${commandNames}(?:\\s+(.+))?$`, "iu"));
  if (!match) return false;
  const payload = String(match[1] || "").trim();
  if (!payload || /^(?:help|huongdan)$/iu.test(payload)) { await sendMessageFromSQL(api, message, { success: true, message: usage(prefix) }, false, 60_000); return true; }
  const parts = payload.split(/\s+/u);
  if (parts.length !== 2) { await sendMessageFromSQL(api, message, { success: false, message: usage(prefix) }, false, 30_000); return true; }
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return true;
  const cell = resolvePenaltyCell(parts[1]);
  if (!cell) { await sendMessageFromSQL(api, message, { success: false, message: `Ô sút không hợp lệ. Chọn từ 1 đến 9.\n\n${usage(prefix)}` }, false, 30_000); return true; }
  try {
    const username = await getUsernameByIdZalo(message.data.uidFrom);
    const balance = await getPlayerBalance(message.data.uidFrom);
    if (!username || !balance?.success) throw new Error("Không thể lấy hồ sơ hoặc số dư.");
    const parsed = parseGameAmount(parts[0], balance.balance);
    const amount = parsed === "allin" ? new Big(balance.balance) : new Big(parsed);
    if (amount.lt(MIN_BET)) throw new Error("Cược tối thiểu 5.000 xu.");
    if (amount.gt(balance.balance)) throw new Error("Số dư không đủ.");
    const debit = await updatePlayerBalanceByUsername(username, amount.neg());
    if (!debit?.success) throw new Error(debit?.message || "Không thể trừ tiền cược.");
    const keeperColumn = 1 + Math.floor(Math.random() * 3);
    const shotColumn = ((cell.number - 1) % 3) + 1;
    const won = shootPenalty(cell);
    // A keeper may only be credited with a save after diving into the shot's column.
    // Misses into an uncovered column are shown honestly as a wayward shot instead.
    const blocked = !won && keeperColumn === shotColumn;
    // Fee is charged only on profit, consistent with the displayed game rules.
    const returned = won ? amount.plus(amount.times(cell.multiplier - 1).times(.95)).round(0, Big.roundDown) : new Big(0);
    if (won) {
      const credit = await updatePlayerBalanceByUsername(username, returned);
      if (!credit?.success) { await updatePlayerBalanceByUsername(username, amount); throw new Error("Không thể trả thưởng; tiền cược đã được hoàn lại."); }
    }
    recordGameHistory({
      username,
      gameName: "Sút Penalty",
      gameKey: "penalty",
      choice: `Ô ${cell.number} (${cell.label})`,
      amount: amount.toString(),
      netAmount: (won ? returned.minus(amount) : amount.neg()).toString(),
      isWin: won,
      detail: won ? `Vào ô ${cell.number} (x${cell.multiplier.toFixed(2)})` : (blocked ? "Thủ môn cản phá" : "Sút trượt"),
    }).catch(() => {});
    let gif;
    try {
      gif = await renderPenaltyGif(cell, won, blocked, keeperColumn);
      const column = ["trái", "giữa", "phải"][keeperColumn - 1];
      const result = won ? `⚽ VÀOOOO! Ô ${cell.number} — ${cell.label}\n🧤 Thủ môn đổ ${column} · 🎯 ${cell.multiplier.toFixed(2)}x · nhận ${formatCurrency(returned)} xu (đã trừ 5% phí lời).` : blocked ? `🧤 THỦ MÔN CẢN ĐƯỢC! Ô ${cell.number} — ${cell.label}\nThủ môn đã đổ ${column}, đúng cột sút. ❌ Mất ${formatCurrency(amount)} xu. Thử lại: ${prefix}sut <tiền> <ô 1-9>` : `↗️ SÚT CHỆCH / VỌT XÀ! Ô ${cell.number} — ${cell.label}\nThủ môn đã đổ ${column}, không cùng cột sút. ❌ Mất ${formatCurrency(amount)} xu. Thử lại: ${prefix}sut <tiền> <ô 1-9>`;
      await api.sendMessage({ msg: result, attachments: [gif], quote: message, ttl: 300_000, isUseProphylactic: true }, message.threadId, message.type);
    } finally { if (gif) setTimeout(() => fs.unlink(gif).catch(() => {}), 300_000); }
  } catch (error) { await sendMessageFromSQL(api, message, { success: false, message: `❌ ${error.message}` }, false, 30_000); }
  return true;
}

export { PENALTY_CELLS, resolvePenaltyCell, shootPenalty };
