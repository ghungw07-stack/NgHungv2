import Big from "big.js";
import fs from "node:fs/promises";
import { connection, getPlayerBalance, getUsernameByIdZalo, updatePlayerBalanceByUsername, recordGameHistory } from "../../../database/index.js";
import { formatCurrency, parseGameAmount } from "../../../utils/format-util.js";
import { getNameServer, sendMessageFromSQL } from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import { checkBeforeJoinGame } from "../index.js";
import { getCurrentPrivateGameServer } from "../private-game-server.js";
import { renderNoHuGif } from "./renderer.js";
import { GOLD, rollNoHuSlots } from "./rules.js";

import { DEFAULT_JACKPOT, getGameJackpotKey } from "../jackpot-default.js";

const textOf = (m) => String(typeof m?.data?.content === "object" ? m.data.content?.title || "" : m?.data?.content || "").trim();
const keyFor = (api) => getGameJackpotKey(api);

async function spin(api, message, username, amount) {
  const key = keyFor(api), slots = rollNoHuSlots();
  const jackpot = connection.collection("game_slot_jackpots");
  const state = await jackpot.findOneAndUpdate({ _id: key }, { $setOnInsert: { amount: DEFAULT_JACKPOT, amountNumber: Number(DEFAULT_JACKPOT) }, $inc: { amountNumber: Number(amount.times(0.02)) } }, { upsert: true, returnDocument: "after" });
  const pot = new Big(state?.amount || DEFAULT_JACKPOT);
  let gross = new Big(0), label = "Không trúng";
  if (slots.every((s) => s.key === GOLD)) { gross = amount.gte("5000000000") ? pot : amount.times(10); label = "💥 NỔ HŨ"; if (amount.gte("5000000000")) await jackpot.updateOne({ _id: key }, { $set: { amount: DEFAULT_JACKPOT, amountNumber: Number(DEFAULT_JACKPOT) } }); }
  else if (slots[0].key === slots[1].key && slots[1].key === slots[2].key) { gross = amount.times(slots[0].mult); label = `Ba ${slots[0].label}`; }
  else { const counts = slots.reduce((m, s) => (m[s.key] = (m[s.key] || 0) + 1, m), {}); if (Object.values(counts).some((n) => n === 2)) { gross = amount.times(1 + Math.floor(Math.random() * 4)); label = "Trúng cặp đôi"; } }
  const fee = gross.gt(amount) ? gross.minus(amount).times(0.05).round(0, Big.roundDown) : new Big(0); const returned = gross.minus(fee);
  if (returned.gt(0)) await updatePlayerBalanceByUsername(username, returned);
  await connection.collection("game_slot_history").insertOne({ serverKey: key, slots: slots.map((s) => s.key), amount: amount.toString(), returned: returned.toString(), createdAt: new Date() });
  return { slots, label, returned, fee, amount };
}

export async function handleNoHu(api, message, groupSettings) {
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return true;
  const prefix = getGlobalPrefix(api.getBotId()), args = textOf(message).split(/\s+/).slice(1), sender = message.data.uidFrom;
  if (args[0]?.toLowerCase() === "soicau") { const rows = await connection.collection("game_slot_history").find({ serverKey: keyFor(api) }).sort({ createdAt: -1 }).limit(20).toArray(); return sendMessageFromSQL(api, message, { success: true, message: rows.length ? `🎰 20 lượt gần nhất:\n${rows.reverse().map((x) => x.slots.join(" ")).join("\n")}` : "Chưa có lượt quay nào." }, true, 30000); }
  const username = await getUsernameByIdZalo(sender), balance = await getPlayerBalance(sender); if (!username || !balance.success) return true;
  let amount, turns = 1; try { const parsed = parseGameAmount(args[0], balance.balance); amount = new Big(parsed === "allin" ? balance.balance : parsed); if (args[1]) { const m = String(args[1]).match(/^x?([1-5])$/i); if (!m) throw new Error("Số lượt quay chỉ từ 1 đến 5."); turns = Number(m[1]); } if (amount.lt(5000)) throw new Error("Cược tối thiểu 5.000 VNĐ."); if (amount.times(turns).gt(balance.balance)) throw new Error("Số dư không đủ."); } catch (e) { await sendMessageFromSQL(api, message, { success: false, message: `${e.message}\nDùng: ${prefix}nohu 10k [1–5] hoặc ${prefix}nohu soicau` }, true, 30000); return true; }
  await updatePlayerBalanceByUsername(username, amount.times(turns).neg()); const results = []; for (let i = 0; i < turns; i++) results.push(await spin(api, message, username, amount));
  const total = results.reduce((n, r) => n.plus(r.returned), new Big(0)); const last = results.at(-1); const caption = `🎰 ${getNameServer(api)} • NỔ HŨ\n` + results.map((r) => `${r.slots.map((s) => s.key).join(" | ")}  ${r.label} → ${formatCurrency(r.returned)}đ`).join("\n") + `\n\nCược: ${formatCurrency(amount.times(turns))}đ • Nhận: ${formatCurrency(total)}đ`;
  const netProfit = total.minus(amount.times(turns));
  recordGameHistory({
    username,
    gameName: "Nổ Hũ",
    gameKey: "nohu",
    choice: `${turns} lượt quay`,
    amount: amount.times(turns).toString(),
    netAmount: netProfit.toString(),
    isWin: netProfit.gt(0) ? true : netProfit.lt(0) ? false : null,
    detail: results.map((r) => r.label).join(", "),
  }).catch(() => {});
  await sendMessageFromSQL(api, message, { success: true, message: caption }, true, 60000);
  let spinGif;
  try {
    spinGif = await renderNoHuGif(results);
    await api.sendMessage({ msg: "", attachments: [spinGif], ttl: 60000, isUseProphylactic: true }, message.threadId, message.type);
  } catch (error) {
    console.error("[nohu] Không thể render/gửi GIF động:", error?.message || error);
  } finally {
    if (spinGif) await fs.unlink(spinGif).catch(() => {});
  }
  return true;
}
