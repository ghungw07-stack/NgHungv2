import Big from "big.js";
import fs from "node:fs/promises";
import { connection, NAME_TABLE_PLAYERS } from "../../../database/index.js";
import { getPlayerBalance, getUsernameByIdZalo } from "../../../database/player.js";
import { checkBeforeJoinGame } from "../index.js";
import { formatCurrency, parseGameAmount } from "../../../utils/format-util.js";
import { getGlobalPrefix } from "../../service.js";
import { sendMessageFromSQL } from "../../chat-zalo/chat-style/chat-style.js";
import { createCrashStore } from "./store.js";
import { createCrashEngine } from "./engine.js";
import { isCashout, normalize, MIN_BET, parseAutoCashout } from "./rules.js";
import { renderMayBay } from "./render.js";
import { buildGamePlayerMessage, gameMentionPlayer } from "../../../utils/game-mentions.js";
import { createMessageTarget } from "../../../utils/zalo-message-target.js";
import { jobSendClock } from "../../../commands/manager-command/check-countdown.js";

const engines = new Map();
const boardingClocks = new Map();
function scopeOf(api, message) { return `${api.getBotId()}:${message.threadId}`; }

function stopBoardingClock(scope, roundId) {
  const clock = boardingClocks.get(scope);
  if (!clock || (roundId && clock.roundId !== roundId)) return;
  boardingClocks.delete(scope);
  jobSendClock.cancelJob(clock.message.data.uidFrom, clock.message.threadId, clock.commandName);
  void clock.api.addReaction("UNDO", [clock.message]).catch(() => {});
}

function startBoardingClock(api, message, sent, round) {
  const remaining = Math.max(0, Math.ceil((round.startsAt - Date.now()) / 1000));
  if (!Number.isFinite(remaining) || remaining <= 0) return;
  const item = sent?.message || sent;
  const target = createMessageTarget(message, item?.data || item, api.getBotId());
  if (!target) return;
  const scope = scopeOf(api, message);
  stopBoardingClock(scope);
  // A unique name prevents a cancelled job from deleting its replacement.
  const commandName = `maybay-${api.getBotId()}-${round.id}-${target.data.cliMsgId}`;
  jobSendClock.addJob(api, target, remaining, commandName);
  boardingClocks.set(scope, { api, message: target, commandName, roundId: round.id });
}

function getEngine(api) {
  const botId = String(api.getBotId());
  let engine = engines.get(botId);
  if (engine) return engine;
  const store = createCrashStore(() => connection, () => NAME_TABLE_PLAYERS);
  engine = createCrashEngine({
    store,
    emit: async (event, round, meta, extra) => {
      if (!meta?.api) return;
      if (["takeoff", "cancelled", "crashed"].includes(event)) stopBoardingClock(`${meta.botId}:${meta.threadId}`, round.id);
      if (event === "takeoff") {
        await meta.api.sendMessage({ msg: `✈️ Máy bay #${round.number} đã cất cánh! Hệ số bắt đầu từ 1.00x. Gõ “rút” hoặc “nhảy” để nhận tiền trước khi nổ.`, ttl: 60_000 }, meta.threadId, meta.type);
        return;
      }
      if (event === "cancelled") {
        await meta.api.sendMessage({ msg: `↩️ Chuyến #${round.number} bị hủy do bot khởi động lại. Vé đã được hoàn về ví.`, ttl: 60_000 }, meta.threadId, meta.type);
        return;
      }
      if (event === "progress") {
        await meta.api.sendMessage({ msg: `✈️ Máy bay #${round.number} đang ở ${extra.multiplier.toFixed(2)}x!\nGõ “rút” hoặc “nhảy” để nhận tiền.`, ttl: 30_000 }, meta.threadId, meta.type);
        return;
      }
      if (event === "autocashout") {
        const ticket = extra.ticket;
        const text = buildGamePlayerMessage(["🪂 ", { player: ticket }, ` đã tự rút tại ${ticket.multiplier.toFixed(2)}x, nhận ${formatCurrency(ticket.returned)} xu.`], meta);
        await meta.api.sendMessage({ ...text, ttl: 60_000 }, meta.threadId, meta.type);
        return;
      }
      if (event !== "crashed") return;
      const lost = round.tickets.filter((ticket) => ticket.status === "lost");
      const cashed = round.tickets.filter((ticket) => ["cashed", "cashing"].includes(ticket.status));
      const text = buildGamePlayerMessage([
        `💥 MÁY BAY #${round.number} NỔ TẠI ${round.crashPoint.toFixed(2)}x\n`,
        lost.flatMap((ticket) => ["❌ ", { player: ticket }, `: mất ${formatCurrency(ticket.amount)}\n`]),
        cashed.flatMap((ticket) => ["🪂 ", { player: ticket }, `: ${ticket.automatic ? "tự " : ""}rút ${Number(ticket.multiplier).toFixed(2)}x, nhận ${formatCurrency(ticket.returned)}\n`]),
        `Mở chuyến mới: ${getGlobalPrefix(meta.botId)}maybay <tiền> [mốc tự rút]`,
      ], meta);
      let output;
      try {
        output = await renderMayBay("replay", round);
        await meta.api.sendMessage({ ...text, attachments: [output], ttl: 300_000, isUseProphylactic: true }, meta.threadId, meta.type);
      } catch (error) {
        console.error("[maybay] Gửi ảnh kết quả:", error.message);
        await meta.api.sendMessage({ ...text, ttl: 300_000 }, meta.threadId, meta.type);
      } finally { if (output) await fs.unlink(output).catch(() => {}); }
    },
  });
  engines.set(botId, engine);
  return engine;
}

function contentOf(message) {
  const content = message?.data?.content;
  return String(content && typeof content === "object" ? content.title || "" : content || "").trim();
}
function usage(prefix) {
  return `✈️ MÁY BAY (CRASH)\n${prefix}maybay <tiền> [mốc tự rút]\n${prefix}maybay 20k — mua vé, tự chọn lúc rút\n${prefix}maybay 20k 2 — tự rút khi chạm 2x\nGõ “rút” hoặc “nhảy” khi đang bay để chốt tiền sớm\nBot báo hệ số mỗi 10 giây khi đang bay.\n${prefix}maybay soicau — xem điểm nổ 20 chuyến gần nhất\nVé tối thiểu 10.000 xu · phí 5% trên phần lời · trần 100x.`;
}

export function mayBayContinuation(api, message, content) {
  const engine = engines.get(String(api.getBotId()));
  if (!engine || !isCashout(content)) return null;
  if (!engine.get(scopeOf(api, message))) return null;
  return `${getGlobalPrefix(api.getBotId())}maybay ${normalize(content)}`;
}

export async function handleMayBay(api, message, groupSettings) {
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return true;
  const prefix = getGlobalPrefix(api.getBotId());
  const raw = contentOf(message);
  const escapedPrefix = String(prefix).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = raw.match(new RegExp(`^${escapedPrefix}maybay(?:\\s+(.+))?$`, "iu"));
  if (!match) return false;
  const payload = String(match[1] || "").trim();
  const engine = getEngine(api);
  const scope = scopeOf(api, message);
  await engine.restore(scope, { api, threadId: message.threadId, type: message.type, botId: api.getBotId() }).catch(() => {});
  if (!payload || /^(?:help|huongdan)$/iu.test(payload)) {
    await sendMessageFromSQL(api, message, { success: true, message: usage(prefix) }, false, 30_000); return true;
  }
  if (/^(?:soicau|soi-cau|cau)$/iu.test(payload)) {
    const history = await engine.history(scope);
    try {
      const generated = await renderMayBay("history", history);
      await api.sendMessage({ msg: `🔎 ĐIỂM NỔ 20 CHUYẾN GẦN NHẤT\n${history.length ? history.map((item, i) => `${i + 1}. #${item.number}: ${item.crashPoint.toFixed(2)}x`).join("\n") : "Chưa có dữ liệu."}`, attachments: [generated], ttl: 120_000 }, message.threadId, message.type);
      await fs.unlink(generated).catch(() => {});
    } catch { await sendMessageFromSQL(api, message, { success: true, message: "Chưa thể render ảnh soi cầu lúc này." }, false, 30_000); }
    return true;
  }
  if (isCashout(payload)) {
    try {
      const ticket = await engine.cashout(scope, String(message.data.uidFrom));
      await sendMessageFromSQL(api, message, { success: true, message: `🪂 Rút kịp tại ${Number(ticket.multiplier).toFixed(2)}x! Nhận ${formatCurrency(ticket.returned)} xu (đã trừ 5% phí trên phần lời).` }, false, 60_000);
    } catch (error) { await sendMessageFromSQL(api, message, { success: false, message: `❌ ${error.message}` }, false, 30_000); }
    return true;
  }
  const parts = payload.split(/\s+/);
  let amount;
  try {
    if (parts.length > 2) throw new Error(`Cú pháp: ${prefix}maybay <tiền> [mốc tự rút]. Ví dụ: ${prefix}maybay 20k 2`);
    const autoCashout = parseAutoCashout(parts[1]);
    const username = await getUsernameByIdZalo(message.data.uidFrom);
    const balance = await getPlayerBalance(message.data.uidFrom);
    if (!username || !balance.success) throw new Error("Không thể lấy hồ sơ hoặc số dư.");
    const parsed = parseGameAmount(parts[0], balance.balance);
    amount = parsed === "allin" ? new Big(balance.balance) : new Big(parsed);
    if (amount.lt(MIN_BET)) throw new Error("Vé máy bay tối thiểu 10.000 xu.");
    if (amount.gt(new Big(balance.balance))) throw new Error("Số dư không đủ để mua vé.");
    const result = await engine.join(scope, { ...gameMentionPlayer(api, message), uid: String(message.data.uidFrom), username, autoCashout }, amount, { api, threadId: message.threadId, type: message.type, botId: api.getBotId() });
    const autoText = autoCashout == null ? "" : `\n🎯 Tự rút tại ${autoCashout.toFixed(2)}x. Bạn vẫn có thể rút sớm.`;
    const sent = await sendMessageFromSQL(api, message, { success: true, message: `🎟️ Đã mua vé ${formatCurrency(amount)} xu cho chuyến #${result.round.number}. Máy bay cất cánh sau khoảng ${result.remaining}s.${autoText}\nKhi đang bay, gõ “rút” hoặc “nhảy”. Bot báo hệ số mỗi 10 giây.` }, false, 60_000);
    try { startBoardingClock(api, message, sent, result.round); }
    catch (error) { console.error("[maybay] CLOCK chờ cất cánh:", error.message); }
  } catch (error) { await sendMessageFromSQL(api, message, { success: false, message: `❌ ${error.message}\n\n${usage(prefix)}` }, false, 30_000); }
  return true;
}
