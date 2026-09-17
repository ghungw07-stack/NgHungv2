import Big from "big.js";
import { connection, ensurePlayerAccount, NAME_TABLE_PLAYERS } from "../../../database/index.js";
import { adjustPlayerBalanceSafely, getPlayerBalance } from "../../../database/player.js";
import { formatCurrency, removeMention } from "../../../utils/format-util.js";
import { getGameMentionUid } from "../../../utils/game-mentions.js";
import { getGlobalPrefix } from "../../service.js";
import { checkBeforeJoinGame } from "../index.js";
import { calculateFailureFine, calculateStealAmount, MIN_TARGET_BALANCE, remainingText, ROB_COOLDOWN_MS, ROB_SUCCESS_RATE, SHIELD_PLANS } from "./rules.js";

const STATE_COLLECTION = "game_robbery_state";
const stateId = id => String(id || "").replace(/_0$/u, "");
const money = value => formatCurrency(new Big(value || 0));

async function reply(api, message, text) {
  return api.sendMessage({ msg: text, quote: message, ttl: 60_000 }, message.threadId, message.type);
}

function help(prefix) {
  return `🥷 CƯỚP TIỀN\n\n` +
    `• ${prefix}game cuoptien @người — thử cướp 5–12% số dư\n` +
    `• ${prefix}game cuoptien random — tìm mục tiêu ngẫu nhiên\n` +
    `• ${prefix}game cuoptien khien — xem trạng thái khiên\n` +
    `• ${prefix}game cuoptien khien <1h|6h|24h> — mua khiên bảo vệ\n\n` +
    `🛡️ Giá khiên: 1h = 50.000 • 6h = 250.000 • 24h = 800.000 VNĐ\n` +
    `⏳ Mỗi lần ra tay cách nhau 30 phút • Tỉ lệ thành công 55%\n` +
    `🚨 Thất bại: đền cho nạn nhân 3–7% số dư, tối đa 500.000 VNĐ`;
}

export async function handleRobberyCommand(api, message, groupSettings) {
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return true;
  const prefix = getGlobalPrefix(api.getBotId());
  const senderId = stateId(message.data.uidFrom);
  const raw = removeMention(message).trim();
  const args = raw.split(/\s+/).slice(1);
  const action = String(args[0] || "").toLowerCase();
  const mention = message.data.mentions?.[0];
  const states = connection.collection(STATE_COLLECTION);
  const now = Date.now();

  if ((!action && !mention) || ["help", "hd", "shop"].includes(action)) {
    await reply(api, message, help(prefix));
    return true;
  }

  if (["khien", "khiên", "shield"].includes(action)) {
    const planKey = String(args[1] || "").toLowerCase();
    const current = await states.findOne({ playerId: senderId });
    if (!planKey) {
      const left = Math.max(0, Number(current?.shieldUntil || 0) - now);
      await reply(api, message, left ? `🛡️ Khiên đang bảo vệ bạn thêm ${remainingText(left)}.` : `${help(prefix)}\n\n⚠️ Bạn hiện không có khiên.`);
      return true;
    }
    const plan = SHIELD_PLANS[planKey];
    if (!plan) {
      await reply(api, message, `Gói khiên không hợp lệ. Chọn: 1h, 6h hoặc 24h.`);
      return true;
    }
    const debit = await adjustPlayerBalanceSafely(senderId, -plan.price);
    if (!debit.success) {
      await reply(api, message, `❌ Không đủ ${money(plan.price)} VNĐ để mua khiên ${plan.label}.`);
      return true;
    }
    const shieldUntil = Math.max(now, Number(current?.shieldUntil || 0)) + plan.durationMs;
    await states.updateOne({ playerId: senderId }, { $set: { playerId: senderId, shieldUntil, updatedAt: new Date() } }, { upsert: true });
    await reply(api, message, `🛡️ Đã mua khiên ${plan.label} với ${money(plan.price)} VNĐ.\nBảo vệ còn lại: ${remainingText(shieldUntil - now)}\nSố dư: ${money(debit.balance)} VNĐ.`);
    return true;
  }

  let targetId;
  let targetName;
  let targetBalance;
  if (["random", "ngaunhien", "ngẫu-nhiên"].includes(action)) {
    const rows = await connection.collection(NAME_TABLE_PLAYERS)
      .find({ idUserZalo: { $ne: senderId } })
      .limit(200)
      .toArray();
    const wealthy = rows.filter((player) => {
      try { return new Big(player.balance || 0).gte(MIN_TARGET_BALANCE); } catch { return false; }
    });
    const shieldStates = wealthy.length
      ? await states.find({ playerId: { $in: wealthy.map(player => stateId(player.idUserZalo)) }, shieldUntil: { $gt: now } }).toArray()
      : [];
    const protectedIds = new Set(shieldStates.map(item => stateId(item.playerId)));
    const candidates = wealthy.filter(player => !protectedIds.has(stateId(player.idUserZalo)));
    const selected = candidates[Math.floor(Math.random() * candidates.length)];
    if (!selected) {
      await reply(api, message, `🔎 Không tìm thấy mục tiêu ngẫu nhiên đủ ${money(MIN_TARGET_BALANCE)} VNĐ và đang không có khiên.`);
      return true;
    }
    targetId = stateId(selected.idUserZalo);
    targetName = selected.playerName || selected.name || selected.username || "Người chơi ngẫu nhiên";
    targetBalance = { success: true, balance: String(selected.balance || 0) };
  } else {
    const targetZaloId = stateId(mention?.uid || mention?.userId || mention?.id);
    if (!targetZaloId) {
      await reply(api, message, `Hãy tag người muốn cướp hoặc dùng random.\nVí dụ: ${prefix}game cuoptien @người`);
      return true;
    }
    const targetAccount = await ensurePlayerAccount(targetZaloId, mention?.name || targetZaloId, api.getBotId(), api);
    targetId = stateId(targetAccount?.playerId || targetZaloId);
    targetName = mention?.name || "Mục tiêu";
    if (targetId === senderId || targetZaloId === stateId(getGameMentionUid(message))) {
      await reply(api, message, "Bạn không thể tự cướp tiền của mình.");
      return true;
    }
  }
  if (!targetId) {
    await reply(api, message, `Hãy tag người muốn cướp.\nVí dụ: ${prefix}game cuoptien @người`);
    return true;
  }

  const attackerState = await states.findOne({ playerId: senderId });
  const cooldownLeft = ROB_COOLDOWN_MS - (now - Number(attackerState?.lastRobAt || 0));
  if (cooldownLeft > 0) {
    await reply(api, message, `⏳ Bạn cần ẩn mình thêm ${remainingText(cooldownLeft)} rồi mới được cướp tiếp.`);
    return true;
  }
  const targetState = await states.findOne({ playerId: targetId });
  const shieldLeft = Number(targetState?.shieldUntil || 0) - now;
  if (shieldLeft > 0) {
    await reply(api, message, `🛡️ ${targetName} đang có khiên bảo vệ thêm ${remainingText(shieldLeft)}. Vụ cướp bị chặn.`);
    return true;
  }

  targetBalance ||= await getPlayerBalance(targetId);
  if (!targetBalance.success || new Big(targetBalance.balance || 0).lt(MIN_TARGET_BALANCE)) {
    await reply(api, message, `❌ Mục tiêu phải có ít nhất ${money(MIN_TARGET_BALANCE)} VNĐ trong ví game.`);
    return true;
  }
  await states.updateOne({ playerId: senderId }, { $set: { playerId: senderId, lastRobAt: now, updatedAt: new Date() } }, { upsert: true });

  if (Math.random() >= ROB_SUCCESS_RATE) {
    const attackerBalance = await getPlayerBalance(senderId);
    const fine = attackerBalance.success ? calculateFailureFine(attackerBalance.balance) : 0;
    let paidFine = 0;
    if (fine > 0) {
      const debitFine = await adjustPlayerBalanceSafely(senderId, -fine);
      if (debitFine.success) {
        const compensateVictim = await adjustPlayerBalanceSafely(targetId, fine);
        if (compensateVictim.success) paidFine = fine;
        else await adjustPlayerBalanceSafely(senderId, fine);
      }
    }
    await reply(api, message, `🚨 CƯỚP THẤT BẠI!\n${message.data.dName || "Bạn"} bị bắt quả tang${paidFine ? ` và phải đền ${money(paidFine)} VNĐ cho ${targetName}` : " nhưng không còn tiền để bồi thường"}.\nHãy chờ 30 phút để thử lại.`);
    return true;
  }

  const amount = calculateStealAmount(targetBalance.balance);
  const debitTarget = await adjustPlayerBalanceSafely(targetId, -amount);
  if (!debitTarget.success) {
    await reply(api, message, "❌ Số dư mục tiêu vừa thay đổi, vụ cướp không thành công.");
    return true;
  }
  const creditAttacker = await adjustPlayerBalanceSafely(senderId, amount);
  if (!creditAttacker.success) {
    await adjustPlayerBalanceSafely(targetId, amount);
    await reply(api, message, "❌ Không thể ghi nhận tiền cướp, giao dịch đã được hoàn lại.");
    return true;
  }
  await states.updateOne({ playerId: targetId }, { $set: { playerId: targetId, lastAttackedAt: now, updatedAt: new Date() } }, { upsert: true });
  await reply(api, message, `💰 CƯỚP THÀNH CÔNG!\n${message.data.dName || "Bạn"} đã lấy ${money(amount)} VNĐ từ ${targetName}.\nSố dư mới: ${money(creditAttacker.balance)} VNĐ.`);
  return true;
}
