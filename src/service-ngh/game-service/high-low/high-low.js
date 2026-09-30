import Big from "big.js";
import fs from "node:fs/promises";

import {
  getPlayerBalance,
  getUsernameByIdZalo,
  setLoserGameByUsername,
  updatePlayerBalanceByUsername,
} from "../../../database/player.js";
import { parseGameBetAmount as parseGameAmount } from "../../../utils/format-util.js";
import { gameSenderMessage } from "../../../utils/game-mentions.js";
import { getGlobalPrefix } from "../../service.js";
import { sendMessageFromSQL } from "../../chat-zalo/chat-style/chat-style.js";
import { checkBeforeJoinGame } from "../index.js";
import { createHighLowImage } from "./canvas.js";
import {
  createHighLowDeck,
  drawHighLowNextCard,
  formatHighLowMoney,
  getHighLowMultiplier,
  highLowCardLabel,
  multiplyHighLowChain,
  normalizeHighLowChoice,
  resolveHighLowGuess,
} from "./rules.js";

const MIN_BET = new Big(10_000);
const TURN_TIMEOUT = 30_000;
const tables = new Map();
const locks = new Map();

function contentOf(message) {
  const content = message?.data?.content;
  return String(content && typeof content === "object" ? content.title || "" : content || "").trim();
}

function tableKey(api, message) {
  return JSON.stringify([api.getBotId(), message.type, message.threadId]);
}

function playerKey(message) {
  return String(message?.data?.gameUid || message?.data?.uidFrom || "");
}

function commandRegex(prefix) {
  const escaped = String(prefix).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}(?:hl|highlow|high-low|caothap|cao-thap)(?:\\s+(.+))?$`, "iu");
}

async function locked(key, task) {
  const previous = locks.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(task);
  locks.set(key, current);
  try { return await current; }
  finally { if (locks.get(key) === current) locks.delete(key); }
}

function usage(prefix) {
  return `🎴 LUẬT HIGH–LOW CƯỢC TIỀN ẢO
• Mở bàn: ${prefix}hl <tiền>, ví dụ ${prefix}hl 100k, ${prefix}hl 10% hoặc ${prefix}hl all.
• Thứ tự lá từ thấp đến cao: A < 2 < 3 < ... < 10 < J < Q < K.
• Nếu cùng số, so chất: Bích < Chuồn < Rô < Cơ.
• Nhắn cao/high hoặc thấp/low để đoán lá kế tiếp.
• Mỗi lượt có 30 giây; hết giờ tự động xử lý thua.
• Mỗi nhóm chỉ có 1 người chơi; người gọi sau được xếp hàng chờ.
• Đoán sai mất toàn bộ tiền chuỗi và kết thúc bàn.
• Stop trước lượt thắng đầu tiên cũng được tính là thua.
• Cược tối thiểu 10.000 VNĐ; khi chốt, 5% phần lãi góp vào quỹ lì xì chung.

💰 TỶ LỆ TRẢ THƯỞNG THEO LÁ HIỆN TẠI
Lá:   A | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | J | Q | K
Thấp: - |2.50|2.50|2.50|2.50|2.35|1.95|1.75|1.52|1.35|1.20|1.10|0.80x
Cao: .80|1.10|1.20|1.35|1.52|1.75|1.95|2.35|2.50|2.50|2.50|2.50|-

Mỗi lượt thắng lấy giá trị chuỗi hiện tại nhân hệ số cửa đã chọn và làm tròn xuống. Sau ít nhất 1 lượt thắng, nhắn stop để nhận toàn bộ tiền chuỗi.`;
}

function oddsLine(card) {
  const high = getHighLowMultiplier(card, "high");
  const low = getHighLowMultiplier(card, "low");
  return `Tỷ lệ lá ${highLowCardLabel(card)}: Cao ${high == null ? "-" : `${high.toFixed(2)}x`} • Thấp ${low == null ? "-" : `${low.toFixed(2)}x`}`;
}

function money(value) {
  return formatHighLowMoney(value);
}

function boardPayload(message, text) {
  return {
    ...gameSenderMessage(message, text),
    linkOn: false,
  };
}

async function sendText(api, message, text, success = true) {
  return sendMessageFromSQL(api, message, { success, message: text }, false, 60_000);
}

async function sendBoard(api, message, session, text, options = {}) {
  let image;
  try {
    image = await createHighLowImage(session, options);
    return await api.sendMessage({
      ...boardPayload(message, text),
      attachments: [image],
      ttl: 120_000,
      isUseProphylactic: true,
    }, message.threadId, message.type);
  } catch (error) {
    console.error("[high-low] Gửi bàn:", error.message);
    return api.sendMessage({ ...boardPayload(message, text), ttl: 120_000 }, message.threadId, message.type);
  } finally {
    if (image) await fs.unlink(image).catch(() => {});
  }
}

function clearTurn(session) {
  if (session?.timer) clearTimeout(session.timer);
  if (session) session.timer = null;
}

async function recordLoss(session, choice, detail) {
  return setLoserGameByUsername(session.username, session.amount.neg().toString(), {
    gameName: "High–Low",
    gameKey: "highlow",
    choice,
    betAmount: session.amount.toString(),
    detail,
  }).catch((error) => console.error("[high-low] Ghi nhận thua:", error.message));
}

async function startEntry(key, table, entry) {
  const balance = await getPlayerBalance(entry.uidFrom);
  if (!balance?.success) throw new Error("Không thể đọc số dư khi đến lượt.");
  const amount = new Big(entry.amount);
  if (amount.gt(balance.balance)) throw new Error(`Số dư hiện tại không đủ cho mức cược ${money(amount)} VNĐ.`);
  const debit = await updatePlayerBalanceByUsername(entry.username, amount.neg());
  if (!debit?.success) throw new Error(debit?.message || "Không thể trừ tiền cược.");

  const deck = createHighLowDeck();
  const currentCard = deck.pop();
  const session = {
    ...entry,
    amount,
    chain: amount,
    deck,
    currentCard,
    previousCard: null,
    score: 0,
    streak: 0,
    best: 0,
    status: "playing",
  };
  table.session = session;
  armTurn(key, table, session);
  const before = new Big(balance.balance);
  const after = before.minus(amount);
  await sendBoard(entry.api, entry.message, session,
    `🎴 BÀN CƯỢC CAO THẤP\n• Cược ban đầu: ${money(amount)} VNĐ\n💸 Đã trừ tiền cược: -${money(amount)} VNĐ\n• Giá trị chuỗi: ${money(session.chain)} VNĐ\n• Lá gốc: ${highLowCardLabel(currentCard)}\n💳 Số dư: ${money(before)} → ${money(after)} VNĐ\n\n${oddsLine(currentCard)}\nNhắn cao/thấp/high/low để chơi • chỉ stop sau khi thắng để chốt tiền.`)
    .catch((error) => console.error("[high-low] Không thể báo bắt đầu:", error.message));
}

async function advanceQueue(key, table) {
  while (!table.session && table.queue.length) {
    const entry = table.queue.shift();
    try {
      await startEntry(key, table, entry);
    } catch (error) {
      await sendText(entry.api, entry.message, `⏭ Đã bỏ lượt High–Low trong hàng chờ: ${error.message}`, false).catch(() => {});
    }
  }
  if (!table.session && !table.queue.length) tables.delete(key);
}

function armTurn(key, table, session) {
  clearTurn(session);
  session.timer = setTimeout(() => {
    locked(key, async () => {
      if (table.session !== session) return;
      clearTurn(session);
      table.session = null;
      session.status = "lost";
      await recordLoss(session, "Hết giờ", "Không chọn cửa trong 30 giây");
      await sendBoard(session.api, session.message, session,
        `⏱ HẾT GIỜ! Bạn không chọn trong 30 giây và mất ${money(session.amount)} VNĐ.`,
        { status: "lost" }).catch(() => {});
      await advanceQueue(key, table);
    }).catch((error) => console.error("[high-low] Timeout:", error.message));
  }, TURN_TIMEOUT);
  session.timer.unref?.();
}

async function settleCashout(key, table, session, message, automatic = false) {
  if (session.streak < 1) {
    clearTurn(session);
    table.session = null;
    session.status = "lost";
    await recordLoss(session, "Stop", "Stop trước lượt thắng đầu tiên");
    try {
      await sendBoard(session.api, message, session,
        `❌ Stop trước lượt thắng đầu tiên được tính là thua. Bạn mất ${money(session.amount)} VNĐ.`,
        { status: "lost" });
    } finally {
      await advanceQueue(key, table);
    }
    return;
  }

  const profit = session.chain.minus(session.amount);
  const taxableProfit = profit.gt(0) ? profit : new Big(0);
  const fundContribution = taxableProfit.times("0.05").round(0, Big.roundDown);
  const returned = session.chain.minus(fundContribution);
  const netProfit = returned.minus(session.amount);
  const credit = await updatePlayerBalanceByUsername(
    session.username,
    session.chain,
    true,
    taxableProfit.toString(),
    {
      gameName: "High–Low",
      gameKey: "highlow",
      choice: `Stop sau ${session.streak} lượt`,
      betAmount: session.amount.toString(),
      netAmount: netProfit.toString(),
      detail: `Chuỗi ${money(session.chain)} VNĐ`,
    },
  );
  if (!credit?.success) throw new Error(credit?.message || "Không thể trả thưởng.");
  clearTurn(session);
  table.session = null;
  session.status = "cashed";
  try {
    await sendBoard(session.api, message, session,
      `${automatic ? "🏆 HẾT BỘ BÀI" : "💰 CHỐT CHUỖI THÀNH CÔNG"}! Nhận ${money(returned)} VNĐ sau ${session.streak} lượt thắng.${fundContribution.gt(0) ? `\nĐóng góp quỹ lì xì: ${money(fundContribution)} VNĐ.` : ""}\nLãi thực nhận: ${money(netProfit)} VNĐ • Số dư mới: ${money(new Big(credit.newBalance || 0))} VNĐ.`,
      { status: "cashed" });
  } finally {
    await advanceQueue(key, table);
  }
}

async function playChoice(key, table, session, message, choice) {
  const multiplier = getHighLowMultiplier(session.currentCard, choice);
  if (multiplier == null) throw new Error(`Không thể chọn ${choice === "high" ? "cao" : "thấp"} khi lá hiện tại là ${highLowCardLabel(session.currentCard)}.`);
  const nextCard = drawHighLowNextCard(session.deck, session.currentCard, choice);
  if (!nextCard) return settleCashout(key, table, session, message, true);

  clearTurn(session);
  const previousCard = session.currentCard;
  const result = resolveHighLowGuess(previousCard, nextCard, choice);
  session.previousCard = previousCard;

  if (result === "lose") {
    table.session = null;
    session.status = "lost";
    await recordLoss(session, choice === "high" ? "Cao" : "Thấp", `${highLowCardLabel(previousCard)} → ${highLowCardLabel(nextCard)}`);
    try {
      await sendBoard(session.api, message, session,
        `❌ ĐOÁN SAI! ${highLowCardLabel(previousCard)} → ${highLowCardLabel(nextCard)}. Bạn chọn ${choice === "high" ? "CAO" : "THẤP"} và mất ${money(session.amount)} VNĐ.`,
        { status: "lost", nextCard, choice });
    } finally {
      await advanceQueue(key, table);
    }
    return;
  }

  session.currentCard = nextCard;
  if (result === "push") {
    armTurn(key, table, session);
    await sendBoard(session.api, message, session,
      `↔️ Hai lá bằng nhau (${highLowCardLabel(nextCard)}). Hoàn lượt, giá trị chuỗi giữ nguyên ${money(session.chain)} VNĐ.`,
      { choice });
    return;
  }

  session.chain = multiplyHighLowChain(session.chain, multiplier);
  session.score += 1;
  session.streak += 1;
  session.best = Math.max(session.best, session.streak);
  if (!session.deck.length) return settleCashout(key, table, session, message, true);
  armTurn(key, table, session);
  await sendBoard(session.api, message, session,
    `✅ ĐOÁN ĐÚNG! ${highLowCardLabel(previousCard)} → ${highLowCardLabel(nextCard)} • ${choice === "high" ? "CAO" : "THẤP"} ${multiplier.toFixed(2)}x\n💰 Giá trị chuỗi mới: ${money(session.chain)} VNĐ.\n${oddsLine(nextCard)}\nNhắn cao/thấp để chơi tiếp hoặc stop để nhận tiền.`,
    { choice });
}

export function highLowContinuation(api, message, content) {
  const table = tables.get(tableKey(api, message));
  if (!table?.session || table.session.playerId !== playerKey(message)) return null;
  const action = String(content || "").trim();
  if (!normalizeHighLowChoice(action) && !/^(?:stop|dung|dừng|chot|chốt)$/iu.test(action)) return null;
  return `${getGlobalPrefix(api.getBotId())}hl ${action}`;
}

export async function handleHighLow(api, message, groupSettings) {
  const prefix = getGlobalPrefix(api.getBotId());
  const match = contentOf(message).match(commandRegex(prefix));
  if (!match) return false;
  const payload = String(match[1] || "").trim();
  if (!payload || /^(?:help|luat|luật|huongdan)$/iu.test(payload)) {
    await sendText(api, message, usage(prefix));
    return true;
  }
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return true;

  const key = tableKey(api, message);
  return locked(key, async () => {
    const table = tables.get(key) || { session: null, queue: [] };
    tables.set(key, table);
    const playerId = playerKey(message);
    const choice = normalizeHighLowChoice(payload);
    const stopping = /^(?:stop|dung|dừng|chot|chốt)$/iu.test(payload);

    try {
      if (choice || stopping) {
        const session = table.session;
        if (!session) throw new Error(`Nhóm chưa có bàn High–Low. Mở bàn bằng ${prefix}hl <tiền>.`);
        if (session.playerId !== playerId) throw new Error(`Đang là lượt của ${session.name}. Bạn đang ở ngoài bàn.`);
        if (stopping) await settleCashout(key, table, session, message);
        else await playChoice(key, table, session, message, choice);
        return true;
      }

      if (payload.split(/\s+/u).length !== 1) throw new Error(usage(prefix));
      if (table.session?.playerId === playerId) throw new Error(`Bạn đang chơi. Hãy nhắn cao/thấp hoặc stop.`);
      if (table.queue.some((entry) => entry.playerId === playerId)) throw new Error("Bạn đã có tên trong hàng chờ High–Low.");

      const uidFrom = message.data.uidFrom;
      const username = await getUsernameByIdZalo(uidFrom);
      const balance = await getPlayerBalance(uidFrom);
      if (!username || !balance?.success) throw new Error("Không thể lấy hồ sơ hoặc số dư.");
      const parsed = parseGameAmount(payload, balance.balance);
      const amount = parsed === "allin" ? new Big(balance.balance) : new Big(parsed);
      if (!amount.eq(amount.round(0))) throw new Error("Tiền cược phải là số nguyên.");
      if (amount.lt(MIN_BET)) throw new Error("Cược tối thiểu 10.000 VNĐ.");
      if (amount.gt(balance.balance)) throw new Error(`Số dư không đủ. Bạn có ${money(new Big(balance.balance))} VNĐ.`);

      const entry = {
        api,
        message,
        uidFrom,
        username,
        playerId,
        name: message.data.dName || username,
        amount: amount.toString(),
      };
      if (table.session) {
        table.queue.push(entry);
        await sendText(api, message, `🕒 Đã xếp bạn vào hàng chờ High–Low vị trí #${table.queue.length}. Mức cược: ${money(amount)} VNĐ.`);
      } else {
        await startEntry(key, table, entry);
      }
    } catch (error) {
      if (!table.session && !table.queue.length) tables.delete(key);
      await sendText(api, message, `❌ ${error.message}`, false);
    }
    return true;
  });
}
