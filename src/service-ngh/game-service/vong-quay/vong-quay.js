import Big from "big.js";
import fs from "fs/promises";
import { getPlayerBalance, getUsernameByIdZalo, updatePlayerBalanceByUsername, recordGameHistory } from "../../../database/player.js";
import { formatCurrency, parseGameAmount } from "../../../utils/format-util.js";
import { sendMessageFromSQL } from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import { checkBeforeJoinGame } from "../index.js";
import { createLuckyWheelGif, createLuckyWheelImage } from "./canvas.js";
import { spinLuckyWheel } from "./rules.js";
import { gameSenderMessage } from "../../../utils/game-mentions.js";

function textOf(message) { const content = message?.data?.content; return String(content && typeof content === "object" ? content.title || "" : content || "").trim(); }

export async function handleLuckyWheel(api, message, groupSettings) {
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return true;
  const prefix = getGlobalPrefix(api.getBotId()); const escaped = String(prefix).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = textOf(message).match(new RegExp(`^${escaped}(?:vongquay|vq|wheel)\\s+([\\d,.]+[kmb]?|allin|all|[\\d,.]+%)$`, "i"));
  if (!match) { await sendMessageFromSQL(api, message, { success: false, message: `Cú pháp: ${prefix}vongquay <tiền>\nVí dụ: ${prefix}vongquay 100k` }, true, 10_000); return true; }
  const senderId = message.data.uidFrom, username = await getUsernameByIdZalo(senderId), balance = await getPlayerBalance(senderId);
  if (!username || !balance.success) { await sendMessageFromSQL(api, message, { success: false, message: "Không thể lấy hồ sơ hoặc số dư." }, true, 10_000); return true; }
  let amount;
  try { const parsed = parseGameAmount(match[1], balance.balance); amount = parsed === "allin" ? new Big(balance.balance) : parsed; if (amount.lt(1000)) throw new Error("Cược tối thiểu 1,000 VNĐ"); if (amount.gt(balance.balance)) throw new Error(`Số dư không đủ. Bạn có ${formatCurrency(new Big(balance.balance))} VNĐ`); }
  catch (error) { await sendMessageFromSQL(api, message, { success: false, message: error.message }, true, 10_000); return true; }
  await updatePlayerBalanceByUsername(username, amount.neg()); const result = spinLuckyWheel(); const returned = amount.times(String(result.multiplier)).round(0, Big.roundDown); if (returned.gt(0)) await updatePlayerBalanceByUsername(username, returned);
  const profit = returned.minus(amount);
  recordGameHistory({
    username,
    gameName: "Vòng Quay",
    gameKey: "vongquay",
    choice: result.label,
    amount: amount.toString(),
    netAmount: profit.toString(),
    isWin: profit.gt(0) ? true : profit.lt(0) ? false : null,
    detail: `Hệ số x${result.multiplier}`,
  }).catch(() => {});
  let text = `🎡 ${result.label.toUpperCase()}\nCược: ${formatCurrency(amount)} VNĐ\nNhận: ${formatCurrency(returned)} VNĐ\n`;
  text += profit.gt(0) ? `Lãi: +${formatCurrency(profit)} VNĐ` : profit.lt(0) ? `Lỗ: -${formatCurrency(profit.abs())} VNĐ` : "Kết quả: Hòa vốn";
  let attachment;
  try { attachment = await createLuckyWheelGif(result, amount, returned); }
  catch (error) { console.error("[vong-quay] Không thể render GIF, dùng ảnh tĩnh:", error?.message || error); attachment = await createLuckyWheelImage(result, amount, returned); }
  try { await api.sendMessage({ ...gameSenderMessage(message, text), attachments: [attachment], ttl: 60_000, isUseProphylactic: true }, message.threadId, message.type); } finally { await fs.unlink(attachment).catch(() => {}); }
  return true;
}
