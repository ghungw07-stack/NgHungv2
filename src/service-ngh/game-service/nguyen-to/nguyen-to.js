import Big from "big.js";
import fs from "node:fs/promises";

import {
  connection,
  getPlayerBalance,
  getUsernameByIdZalo,
  recordGameHistory,
  updatePlayerBalanceByUsername,
} from "../../../database/index.js";
import { formatCurrency, parseGameBetAmount as parseGameAmount } from "../../../utils/format-util.js";
import { gameSenderMessage } from "../../../utils/game-mentions.js";
import { sendMessageFromSQL } from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import { checkBeforeJoinGame } from "../index.js";
import { createElementalImage } from "./canvas.js";
import {
  ELEMENT_SYMBOLS,
  applyElementalSpin,
  getPartialCashout,
  hasRingProgress,
  normalizeElementalState,
  openElementalRound,
  resetElementalState,
  rollElementSymbol,
} from "./rules.js";

const MIN_BET = new Big(10_000);
const STATE_COLLECTION = "game_elemental_states";
const locks = new Map();

const SYMBOL_NAMES = Object.freeze({
  [ELEMENT_SYMBOLS.FIRE]: "Lửa",
  [ELEMENT_SYMBOLS.EARTH]: "Đất",
  [ELEMENT_SYMBOLS.WATER]: "Nước",
  [ELEMENT_SYMBOLS.WIND]: "Gió",
  [ELEMENT_SYMBOLS.SKULL]: "Đầu lâu",
});

const RING_NAMES = Object.freeze({ fire: "Lửa", earth: "Đất", water: "Nước" });

function contentOf(message) {
  const content = message?.data?.content;
  return String(content && typeof content === "object" ? content.title || "" : content || "").trim();
}

function commandRegex(prefix) {
  const escaped = String(prefix).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}(xoaynuoc|xoay-nuoc|xn|quay|nguyento|nguyen-to|element|elements|nt)(?:\\s+(.+))?$`, "iu");
}

function stateKey(username) {
  return `elemental:${String(username)}`;
}

async function withLock(key, task) {
  const previous = locks.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(task);
  locks.set(key, current);
  try {
    return await current;
  } finally {
    if (locks.get(key) === current) locks.delete(key);
  }
}

async function loadState(username) {
  const document = await connection.collection(STATE_COLLECTION).findOne({ _id: stateKey(username) });
  return normalizeElementalState(document || {});
}

async function saveState(username, state) {
  const normalized = normalizeElementalState(state);
  normalized.updatedAt = new Date();
  await connection.collection(STATE_COLLECTION).replaceOne(
    { _id: stateKey(username) },
    { _id: stateKey(username), username, ...normalized },
    { upsert: true },
  );
  return normalized;
}

function usage(prefix) {
  return `🌊 XOÁY NƯỚC

${prefix}xn <tiền>
— Mở ván và trừ cược đúng 1 lần. Ví dụ: ${prefix}xn 100k
${prefix}quay
— Quay tiếp miễn phí trong ván đang mở, tiến độ được giữ nguyên.
${prefix}rut
— Nhận chênh lệch ô cuối và ô áp chót, lùi các vòng đủ điều kiện 1 ô rồi đóng ván.
${prefix}xoaynuoc bang
— Xem tiến độ và mức rút hiện tại.
${prefix}xoaynuoc reset
— Xóa toàn bộ tiến độ, không hoàn tiền.

🔥 Lửa: ×3.9 • ×12.5 • ×28 • ×52 • ×85 • ×133 • ×200 • THƯỞNG
Hoàn thành nhận thêm ngẫu nhiên ×100/×200/×300/×400/×500 (cơ hội bằng nhau), cộng hoàn vòng ×200; vòng Lửa về 0.

🌿 Đất: ×2.5 • ×7.7 • ×16 • ×27.5 • ×44 • +×20.5 miễn phí
💧 Nước: ×1.55 • ×4.85 • ×10 • +×7 miễn phí
Hoàn thành Đất/Nước trả thưởng ngay rồi lùi 1 ô.

Tỷ lệ: Lửa 3% • Đất 12% • Nước 25% • Gió 45% • Đầu lâu 15%.
Gió làm thua và đóng ván nhưng giữ nguyên các vòng. Đầu lâu đẩy cả ba vòng lùi 1 ô nhưng vẫn được quay tiếp. Sau khi Gió hoặc rút tiền, dùng ${prefix}xn <tiền> để mở ván mới. Cược tối thiểu 10.000 VNĐ.`;
}

function progressLine(state) {
  return `🔥 ${state.fire}/8  •  🌿 ${state.earth}/6  •  💧 ${state.water}/4`;
}

function partialLine(state) {
  const partial = getPartialCashout(state);
  if (!partial.available) return "Rút một phần: chưa mở (cần ít nhất 2 ô trong một vòng).";
  return `Rút một phần hiện tại: ×${partial.multiplier}.`;
}

function sumPayoutMultiplier(payouts) {
  return payouts.reduce((sum, payout) => sum.plus(payout.multiplier), new Big(0));
}

async function sendText(api, message, value, success = true) {
  return sendMessageFromSQL(api, message, { success, message: value }, false, 60_000);
}

async function sendBoard(api, message, state, textValue, options = {}) {
  let image;
  try {
    image = await createElementalImage(state, options);
    return await api.sendMessage({
      ...gameSenderMessage(message, textValue),
      attachments: [image],
      ttl: 120_000,
      isUseProphylactic: true,
    }, message.threadId, message.type);
  } catch (error) {
    console.error("[nguyen-to] Không thể render/gửi canvas:", error?.message || error);
    return api.sendMessage({ ...gameSenderMessage(message, textValue), ttl: 120_000 }, message.threadId, message.type);
  } finally {
    if (image) await fs.unlink(image).catch(() => {});
  }
}

async function applyBalanceAndState(username, previousState, nextState, delta) {
  const balanceResult = await updatePlayerBalanceByUsername(username, delta);
  if (!balanceResult?.success) throw new Error(balanceResult?.message || "Không thể cập nhật số dư.");
  try {
    const savedState = await saveState(username, nextState);
    return { balanceResult, savedState };
  } catch (error) {
    await updatePlayerBalanceByUsername(username, new Big(delta).neg()).catch(() => {});
    await saveState(username, previousState).catch(() => {});
    throw error;
  }
}

async function showBoard(api, message, username, balance) {
  const state = await loadState(username);
  const status = state.active ? "Ván đang mở — dùng .quay để tiếp tục." : "Ván đang đóng — dùng .xn <tiền> để mở lại.";
  const textValue = `🌊 BẢNG XOÁY NƯỚC\n${progressLine(state)}\n${partialLine(state)}\n${status}${state.bet ? `\nMức cược của bảng: ${formatCurrency(state.bet)} VNĐ.` : ""}`;
  await sendBoard(api, message, state, textValue, {
    balance: balance.balance,
    headline: status,
  });
}

async function resetBoard(api, message, username, balance) {
  const current = await loadState(username);
  const state = await saveState(username, resetElementalState(current));
  await sendBoard(api, message, state,
    "♻️ Đã đặt lại toàn bộ vòng Xoáy Nước. Tiến độ cũ bị xóa và không được hoàn tiền.", {
      balance: balance.balance,
      headline: "Ba vòng đã trở về trạng thái ban đầu",
    });
}

async function cashOutPartial(api, message, username, balance) {
  const current = await loadState(username);
  if (!current.active) throw new Error("Ván chưa mở. Dùng .xn <tiền> trước khi rút.");
  const partial = getPartialCashout(current);
  if (!partial.available) throw new Error("Rút Một Phần chỉ mở khi có ít nhất 2 ô được lấp trong một vòng.");
  if (!current.bet) throw new Error("Bảng đang thiếu mức cược. Hãy reset bảng rồi chơi lại.");

  const payout = new Big(current.bet).times(partial.multiplier).round(0, Big.roundDown);
  const roundTotal = new Big(current.roundPayout || 0).plus(payout);
  partial.state.roundPayout = "0";
  const { balanceResult, savedState } = await applyBalanceAndState(username, current, partial.state, payout);
  const details = partial.rings.map((entry) => `${RING_NAMES[entry.ring]} ×${entry.multiplier}`).join(" + ");
  recordGameHistory({
    username,
    playerName: message.data.dName,
    gameName: "Xoáy Nước",
    gameKey: "xoaynuoc",
    choice: "Rút Một Phần",
    amount: current.bet,
    netAmount: roundTotal.minus(current.bet).toString(),
    balanceAfter: balanceResult.newBalance,
    isWin: true,
    detail: details,
  }).catch(() => {});

  const textValue = `💰 RÚT MỘT PHẦN THÀNH CÔNG — VÁN ĐÃ ĐÓNG\n${details}\nNhận lần này: +${formatCurrency(payout)} VNĐ (×${partial.multiplier})\nTổng thưởng trong ván: ${formatCurrency(roundTotal)} VNĐ\n${progressLine(savedState)}\nSố dư mới: ${formatCurrency(balanceResult.newBalance)} VNĐ.\nDùng .xn ${formatCurrency(current.bet)} để mở lại.`;
  await sendBoard(api, message, savedState, textValue, {
    mode: "cashout",
    bet: current.bet,
    balance: balanceResult.newBalance,
    payout,
    payoutMultiplier: partial.multiplier,
    headline: `Đã nhận chênh lệch từ ${partial.rings.length} vòng`,
  });
}

async function openRound(api, message, username, balance, payload) {
  const current = await loadState(username);
  if (current.active) throw new Error("Ván đang mở. Chỉ cần dùng .quay để quay tiếp, không bị trừ thêm tiền.");
  const parsed = parseGameAmount(payload, balance.balance);
  const amount = parsed === "allin" ? new Big(balance.balance) : new Big(parsed);
  if (!amount.eq(amount.round(0))) throw new Error("Tiền cược phải là số nguyên.");
  if (amount.lt(MIN_BET)) throw new Error("Cược tối thiểu 10.000 VNĐ.");
  if (amount.gt(balance.balance)) throw new Error(`Số dư không đủ. Bạn có ${formatCurrency(balance.balance)} VNĐ.`);
  if (hasRingProgress(current) && current.bet && !amount.eq(current.bet)) {
    throw new Error(`Bảng đang tích lũy ở mức ${formatCurrency(current.bet)} VNĐ. Hãy mở lại đúng mức này hoặc reset bảng.`);
  }

  const opened = openElementalRound(current, amount.toString());
  const { balanceResult, savedState } = await applyBalanceAndState(username, current, opened, amount.neg());
  const textValue = `🌊 ĐÃ MỞ VÁN XOÁY NƯỚC\nĐã trừ cược: -${formatCurrency(amount)} VNĐ\n${progressLine(savedState)}\nTừ giờ dùng .quay để quay tiếp, không trừ thêm tiền.\nSố dư: ${formatCurrency(balanceResult.newBalance)} VNĐ.`;
  await sendBoard(api, message, savedState, textValue, {
    bet: amount,
    balance: balanceResult.newBalance,
    headline: "Ván đã mở — dùng .quay để xoay biểu tượng",
  });
}

async function spinActiveRound(api, message, username, balance) {
  const current = await loadState(username);
  if (!current.active || !current.bet) throw new Error("Chưa có ván đang mở. Dùng .xn <tiền> để mở ván trước.");
  const amount = new Big(current.bet);
  const symbol = rollElementSymbol();
  const result = applyElementalSpin(current, symbol);
  const payoutMultiplier = sumPayoutMultiplier(result.payouts);
  const payout = amount.times(payoutMultiplier).round(0, Big.roundDown);
  const roundTotal = new Big(current.roundPayout || 0).plus(payout);
  result.state.roundPayout = symbol === ELEMENT_SYMBOLS.WIND ? "0" : roundTotal.toString();

  let savedState;
  let balanceAfter = String(balance.balance);
  if (payout.gt(0)) {
    const settlement = await applyBalanceAndState(username, current, result.state, payout);
    savedState = settlement.savedState;
    balanceAfter = settlement.balanceResult.newBalance;
  } else {
    savedState = await saveState(username, result.state);
  }

  const payoutDetails = result.payouts.map((entry) => {
    if (entry.type === "fire-bonus") return `Thưởng Lửa ×${entry.bonusMultiplier} + hoàn vòng ×200`;
    return `${RING_NAMES[entry.ring]} miễn phí ×${entry.multiplier}`;
  }).join(" • ");
  if (symbol === ELEMENT_SYMBOLS.WIND) {
    const net = roundTotal.minus(amount);
    recordGameHistory({
      username,
      playerName: message.data.dName,
      gameName: "Xoáy Nước",
      gameKey: "xoaynuoc",
      choice: "Gió — kết thúc ván",
      amount: amount.toString(),
      netAmount: net.toString(),
      balanceAfter,
      isWin: net.gt(0) ? true : net.lt(0) ? false : null,
      detail: `Tổng thưởng trong ván ${roundTotal.toString()} VNĐ`,
    }).catch(() => {});
  }

  let textValue = `🌊 XOÁY NƯỚC • ${SYMBOL_NAMES[symbol].toUpperCase()}\n${result.headline}\nCược ván: ${formatCurrency(amount)} VNĐ • Lượt này không trừ thêm`;
  if (payout.gt(0)) textValue += `\n${payoutDetails}\nNhận: +${formatCurrency(payout)} VNĐ`;
  textValue += `\n${progressLine(savedState)}\n${partialLine(savedState)}\nSố dư: ${formatCurrency(balanceAfter)} VNĐ.`;
  textValue += savedState.active ? "\nDùng .quay để quay tiếp hoặc .rut để chốt." : `\nVán đã thua. Dùng .xn ${formatCurrency(amount)} để mở lại.`;
  await sendBoard(api, message, savedState, textValue, {
    symbol,
    bet: amount,
    balance: balanceAfter,
    payout,
    payoutMultiplier: payoutMultiplier.gt(0) ? payoutMultiplier.toString() : null,
    headline: result.headline,
  });
}

export async function handleElementalGame(api, message, groupSettings) {
  const prefix = getGlobalPrefix(api.getBotId());
  const match = contentOf(message).match(commandRegex(prefix));
  if (!match) return false;
  const command = String(match[1] || "").toLowerCase();
  const payload = String(match[2] || "").trim();
  const isSpinCommand = command === "quay";
  if ((!payload && !isSpinCommand) || /^(?:help|luat|luật|huongdan|hướngdẫn)$/iu.test(payload)) {
    await sendText(api, message, usage(prefix));
    return true;
  }
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return true;

  const senderId = message.data.uidFrom;
  const username = await getUsernameByIdZalo(senderId);
  if (!username) {
    await sendText(api, message, "Không thể lấy hồ sơ game.", false);
    return true;
  }

  return withLock(stateKey(username), async () => {
    try {
      const balance = await getPlayerBalance(senderId);
      if (!balance?.success) throw new Error("Không thể lấy số dư game.");
      if (isSpinCommand && !payload) await spinActiveRound(api, message, username, balance);
      else if (/^(?:bang|bảng|board|xem|status)$/iu.test(payload)) await showBoard(api, message, username, balance);
      else if (/^(?:reset|datlai|đặtlại|xoabang)$/iu.test(payload)) await resetBoard(api, message, username, balance);
      else if (/^(?:r|rut|rút|cashout|rutmotphan|rútmộtphần|rut\s+mot\s+phan|rút\s+một\s+phần)$/iu.test(payload)) await cashOutPartial(api, message, username, balance);
      else if (payload.split(/\s+/u).length === 1) await openRound(api, message, username, balance, payload);
      else throw new Error(usage(prefix));
    } catch (error) {
      await sendText(api, message, error?.message || "Không thể xử lý lượt Xoáy Nước.", false);
    }
    return true;
  });
}
