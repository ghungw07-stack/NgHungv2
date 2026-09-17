import Big from "big.js";
import fs from "fs/promises";

import { getPlayerBalance, getUsernameByIdZalo, updatePlayerBalanceByUsername, setLoserGameByUsername } from "../../../database/player.js";
import { formatCurrency, parseGameAmount } from "../../../utils/format-util.js";
import { sendMessageFromSQL } from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import { checkBeforeJoinGame } from "../index.js";
import { createMinesImage } from "./canvas.js";
import { calculateMinesMultiplier, createMinePositions, normalizeMineCell } from "./rules.js";
import { gameSenderMessage } from "../../../utils/game-mentions.js";

const SESSION_TTL = 90_000;
const sessions = new Map();

function textOf(message) { const content = message?.data?.content; return String(content && typeof content === "object" ? content.title || "" : content || "").trim(); }
function commandRegex(prefix, suffix = "") { const escaped = String(prefix).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); return new RegExp(`^${escaped}(?:domin|mines|mine)${suffix}`, "i"); }

export function minesContinuation(api, message, content) {
  const senderId = message?.data?.uidFrom;
  const sessionKey = `${api.getBotId()}:${senderId}`;
  if (!sessions.has(sessionKey)) return null;
  const cell = normalizeMineCell(String(content || "").trim());
  if (!cell) return null;
  return `${getGlobalPrefix(api.getBotId())}domin mo ${cell}`;
}

function usage(prefix) {
  return `💣 DÒ MÌN (MINES) — LUẬT CHƠI

Lưới 5×5 có 25 ô, chứa từ 20 đến 24 quả mìn. Mở ô an toàn để tăng hệ số; trúng mìn sẽ mất toàn bộ cược. Càng mở nhiều, tiền nhận càng cao nhưng rủi ro cũng tăng.

${prefix}domin 20k
— Tạo ván, mặc định 20 mìn
${prefix}domin 20k 22
— Tạo ván với 22 mìn (chọn 20–24)
${prefix}domin 7
hoặc ${prefix}domin mo 7
— Mở ô số 7 khi đang chơi
${prefix}domin rút
— Nhận cược × hệ số hiện tại

Cược tối thiểu 10.000 VNĐ. Ván tự rút tiền sau 90 giây nếu không thao tác.`;
}

async function sendCanvas(api, message, session, options, text) {
  const image = await createMinesImage(session, options);
  try { await api.sendMessage({ ...gameSenderMessage(message, text), attachments: [image], ttl: 60_000, isUseProphylactic: true }, message.threadId, message.type); }
  finally { await fs.unlink(image).catch(() => {}); }
}

async function autoCashout(senderId) {
  const session = sessions.get(senderId); if (!session) return; sessions.delete(senderId);
  const multiplier = session.opened.size ? calculateMinesMultiplier(session.mineCount, session.opened.size) : 1;
  const returned = session.amount.times(String(multiplier)).round(0, Big.roundDown);
  await updatePlayerBalanceByUsername(session.username, returned).catch((error) => console.error("[mines] Tự động trả tiền lỗi:", error));
  await session.api.sendMessage({ ...gameSenderMessage(session.message, `⏱️ Ván Bãi Mìn hết hạn. Đã tự động trả ${formatCurrency(returned)} VNĐ.`), ttl: 30_000 }, session.threadId, session.type).catch(() => {});
}

export async function handleMines(api, message, groupSettings) {
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return true;
  const prefix = getGlobalPrefix(api.getBotId()), content = textOf(message), senderId = message.data.uidFrom;
  const sessionKey = `${api.getBotId()}:${senderId}`;
  const payloadMatch = content.match(commandRegex(prefix, "(?:\\s+(.+))?$")); const payload = payloadMatch?.[1]?.trim() || "";
  if (!payload) { await sendMessageFromSQL(api, message, { success: false, message: usage(prefix) }, true, 15_000); return true; }
  const parts = payload.split(/\s+/); const action = parts[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const session = sessions.get(sessionKey);

  if (["mo", "open"].includes(action)) {
    if (!session) { await sendMessageFromSQL(api, message, { success: false, message: `Bạn chưa có ván Dò Mìn.\n${usage(prefix)}` }, true, 10_000); return true; }
    const cell = normalizeMineCell(parts[1]);
    if (!cell) { await sendMessageFromSQL(api, message, { success: false, message: "Ô phải là số từ 1 đến 25." }, true, 10_000); return true; }
    if (session.opened.has(cell)) { await sendMessageFromSQL(api, message, { success: false, message: "Ô này đã được mở." }, true, 10_000); return true; }
    if (session.mines.has(cell)) {
      clearTimeout(session.timeout); sessions.delete(sessionKey); session.multiplier = calculateMinesMultiplier(session.mineCount, session.opened.size);
      await setLoserGameByUsername(session.username, session.amount.neg().toNumber(), {
        gameName: "Bãi Mìn",
        gameKey: "mines",
        choice: `Ô ${cell}`,
        betAmount: session.amount.toNumber(),
        detail: `Nổ mìn ở ô ${cell}`,
      }).catch(() => {});
      await sendCanvas(api, message, session, { status: "lost", hitCell: cell }, `💥 Bạn mở trúng mìn ở ô ${cell} và mất ${formatCurrency(session.amount)} VNĐ.`); return true;
    }
    session.opened.add(cell); session.multiplier = calculateMinesMultiplier(session.mineCount, session.opened.size);
    if (session.opened.size === 25 - session.mineCount) {
      clearTimeout(session.timeout); sessions.delete(sessionKey); const returned = session.amount.times(String(session.multiplier)).round(0, Big.roundDown);
      await updatePlayerBalanceByUsername(session.username, returned, true, returned.minus(session.amount).toNumber(), {
        gameName: "Bãi Mìn",
        gameKey: "mines",
        choice: `Mở ${session.opened.size} ô`,
        betAmount: session.amount.toNumber(),
        detail: `Hệ số x${session.multiplier.toFixed(2)}`,
      });
      await sendCanvas(api, message, session, { status: "completed", returned }, `🏆 Bạn đã mở hết ô an toàn và nhận ${formatCurrency(returned)} VNĐ!`); return true;
    }
    await sendCanvas(api, message, session, { status: "playing" }, `💎 Ô ${cell} an toàn! Hệ số hiện tại ×${session.multiplier.toFixed(2)}.\nGõ số ô 1–25 để mở tiếp, hoặc ${prefix}domin rút.`); return true;
  }

  if (["rut", "cashout", "nhan"].includes(action)) {
    if (!session) { await sendMessageFromSQL(api, message, { success: false, message: `Bạn chưa có ván Dò Mìn.\n${usage(prefix)}` }, true, 10_000); return true; }
    if (!session.opened.size) { await sendMessageFromSQL(api, message, { success: false, message: "Hãy mở ít nhất một ô an toàn trước khi rút." }, true, 10_000); return true; }
    clearTimeout(session.timeout); sessions.delete(sessionKey); session.multiplier = calculateMinesMultiplier(session.mineCount, session.opened.size); const returned = session.amount.times(String(session.multiplier)).round(0, Big.roundDown);
    await updatePlayerBalanceByUsername(session.username, returned, true, returned.minus(session.amount).toNumber(), {
      gameName: "Bãi Mìn",
      gameKey: "mines",
      choice: `Rút ${session.opened.size} ô`,
      betAmount: session.amount.toNumber(),
      detail: `Hệ số x${session.multiplier.toFixed(2)}`,
    });
    await sendCanvas(api, message, session, { status: "cashed", returned }, `💰 Rút thành công ${formatCurrency(returned)} VNĐ • Lãi ${formatCurrency(returned.minus(session.amount))} VNĐ.`); return true;
  }

  if (session && /^\d+$/.test(action)) {
    const cell = normalizeMineCell(action);
    if (!cell) { await sendMessageFromSQL(api, message, { success: false, message: "Ô phải là số từ 1 đến 25." }, true, 10_000); return true; }
    return handleMines(api, { ...message, data: { ...message.data, content: `${prefix}domin mo ${cell}` } }, groupSettings);
  }
  if (session) { await sendMessageFromSQL(api, message, { success: false, message: `Bạn đang có một ván Dò Mìn. Gõ ${prefix}domin <ô> hoặc ${prefix}domin rút.` }, true, 10_000); return true; }
  const username = await getUsernameByIdZalo(senderId), balance = await getPlayerBalance(senderId);
  if (!username || !balance.success) { await sendMessageFromSQL(api, message, { success: false, message: "Không thể lấy hồ sơ hoặc số dư." }, true, 10_000); return true; }
  let amount, mineCount;
  try { const parsed = parseGameAmount(parts[0], balance.balance); amount = parsed === "allin" ? new Big(balance.balance) : parsed; mineCount = parts[1] == null ? 20 : Number(parts[1]); if (amount.lt(10_000)) throw new Error("Cược tối thiểu 10.000 VNĐ"); if (amount.gt(balance.balance)) throw new Error(`Số dư không đủ. Bạn có ${formatCurrency(new Big(balance.balance))} VNĐ`); if (!Number.isInteger(mineCount) || mineCount < 20 || mineCount > 24) throw new Error("Số mìn phải từ 20 đến 24"); }
  catch (error) { await sendMessageFromSQL(api, message, { success: false, message: error.message }, true, 10_000); return true; }
  await updatePlayerBalanceByUsername(username, amount.neg());
  const newSession = { username, amount, mineCount, mines: createMinePositions(mineCount), opened: new Set(), multiplier: 1, api, message, threadId: message.threadId, type: message.type };
  newSession.timeout = setTimeout(() => autoCashout(sessionKey), SESSION_TTL); sessions.set(sessionKey, newSession);
  await sendCanvas(api, message, newSession, { status: "playing" }, `💣 Bãi Mìn có ${mineCount} mìn. Gõ trực tiếp số ô 1–25 để lật, hoặc ${prefix}domin rút.\nMở an toàn càng nhiều, hệ số càng cao.`); return true;
}
