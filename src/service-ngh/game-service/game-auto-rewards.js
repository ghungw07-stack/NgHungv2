import schedule from "node-schedule";
import Big from "big.js";
import { connection, NAME_TABLE_PLAYERS } from "../../database/state.js";
import { adjustPlayerBalanceSafely } from "../../database/player.js";
import { formatBigNumber } from "../../utils/format-util.js";
import { getGameTier } from "../../utils/canvas/game-finance.js";
import { HOURLY_LUCKY_MINIMUM, getHourlyLuckyMaximum, randomBigInteger } from "./game-reward-policy.js";

const TIME_ZONE = "Asia/Ho_Chi_Minh";
const FUND_ID = "global-lucky-envelope-fund";
const MEMBER_REWARD_MINIMUM = new Big("1000000000");
const MEMBER_REWARD_MAXIMUM = new Big("500000000000");
let fallbackApi = null;

function vnClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { day: `${values.year}-${values.month}-${values.day}`, hour: `${values.hour}`, minute: `${values.minute}` };
}

async function notifyLuckyWinnerInGroups(api, winner, amount) {
  if (!api || !winner?.idUserZalo) return;
  // Lì xì là sự kiện tự động: thông báo ở các nhóm đang bật game và tag người trúng.
  // Không yêu cầu người chơi gửi bất kỳ lệnh nào.
  try {
    const { groupSettingsAll } = await import("../../automations/event-send-msg.js");
    const settings = groupSettingsAll.getByID(api.getBotId());
    const name = String(winner.playerName || winner.idUserZalo);
    const msg = `🧧 LÌ XÌ MỖI GIỜ\n🎉 Chúc mừng @${name} đã trúng ${formatBigNumber(amount)} VNĐ!\n💰 Tiền đã cộng thẳng vào số dư.`;
    const mentions = [{ uid: String(winner.idUserZalo), pos: msg.indexOf(`@${name}`), len: name.length + 1 }];
    await Promise.allSettled(Object.entries(settings || {})
      .filter(([, value]) => value?.activeGame === true || value?.activeGame === "true")
      .map(([threadId]) => api.sendMessage({ msg, mentions, ttl: 120000 }, threadId, 1)));
  } catch (error) {
    console.warn("[GameAutoReward] Không gửi được tag lì xì vào nhóm:", error?.message || error);
  }
}

export async function addToLuckyEnvelopeFund(amount) {
  const addition = new Big(amount || 0).round(0, Big.roundDown);
  if (addition.lte(0) || !connection) return;
  const funds = connection.collection("game_reward_funds");
  for (let attempt = 0; attempt < 8; attempt++) {
    const fund = await funds.findOne({ _id: FUND_ID });
    if (!fund) {
      try {
        await funds.insertOne({ _id: FUND_ID, balance: addition.toString(), totalContributed: addition.toString(), updatedAt: new Date() });
        return;
      } catch (error) {
        if (error?.code !== 11000) throw error;
        continue;
      }
    }
    const balance = new Big(fund.balance || 0).plus(addition);
    const total = new Big(fund.totalContributed || 0).plus(addition);
    const result = await funds.updateOne(
      { _id: FUND_ID, balance: fund.balance },
      { $set: { balance: balance.toString(), totalContributed: total.toString(), updatedAt: new Date() } }
    );
    if (result.modifiedCount === 1) return;
  }
  throw new Error("Không thể cộng Quỹ Lì Xì do số dư thay đổi liên tục");
}

export async function getLuckyEnvelopeFund() {
  const fund = await connection?.collection("game_reward_funds").findOne({ _id: FUND_ID });
  return new Big(fund?.balance || 0);
}

export async function claimMemberReward(playerId, now = new Date(), random = Math.random) {
  if (!connection) return { success: false, message: "Cơ sở dữ liệu chưa sẵn sàng." };
  const clock = vnClock(now);
  if (clock.hour !== "19") {
    return { success: false, message: "Thưởng Hội viên chỉ nhận được trong khung 19:00–19:59 hằng ngày." };
  }

  const players = connection.collection(NAME_TABLE_PLAYERS);
  const player = await players.findOne({ idUserZalo: String(playerId) });
  if (!player) return { success: false, message: "Không tìm thấy hồ sơ game của bạn." };
  if (player.isBanned === true || player.isBanned === 1) return { success: false, message: "Tài khoản game đang bị khóa." };
  if (player.lastMemberRewardDay === clock.day) return { success: false, message: "Bạn đã nhận thưởng Hội viên hôm nay rồi." };

  const amount = randomBigInteger(MEMBER_REWARD_MINIMUM, MEMBER_REWARD_MAXIMUM, random);
  const nextBalance = new Big(player.balance || 0).plus(amount);
  const result = await players.updateOne(
    { _id: player._id, balance: player.balance, lastMemberRewardDay: { $ne: clock.day } },
    { $set: { balance: nextBalance.toString(), lastMemberRewardDay: clock.day, lastMemberRewardAt: now } }
  );
  if (result.modifiedCount !== 1) {
    return { success: false, message: "Thưởng Hội viên vừa được nhận ở một yêu cầu khác." };
  }

  await connection.collection("game_reward_payouts").insertOne({
    type: "member-claim",
    status: "paid",
    playerId: String(playerId),
    amount: amount.toString(),
    createdAt: now,
    paidAt: now,
  }).catch((error) => console.warn("[GameAutoReward] Không lưu được log thưởng Hội viên:", error?.message || error));

  return { success: true, amount: amount.toString(), balance: nextBalance.toString() };
}

export async function distributeHourlyLuckyEnvelope(api = fallbackApi, now = new Date(), random = Math.random) {
  if (!connection) return { paid: false, reason: "database" };
  const clock = vnClock(now);
  if (clock.minute !== "00") return { paid: false, reason: "time" };
  const payoutId = `hourly:${clock.day}:${clock.hour}`;
  const payouts = connection.collection("game_reward_payouts");
  try {
    await payouts.insertOne({ _id: payoutId, status: "reserved", createdAt: now });
  } catch (error) {
    if (error?.code === 11000) return { paid: false, reason: "already-paid" };
    throw error;
  }

  const players = await connection.collection(NAME_TABLE_PLAYERS)
    .find({ isBanned: { $nin: [true, 1] } }, { projection: { idUserZalo: 1, playerName: 1, balance: 1, rankPoints: 1 } })
    .toArray();
  const fund = await connection.collection("game_reward_funds").findOne({ _id: FUND_ID });
  const fundBalance = new Big(fund?.balance || 0);
  if (!players.length || fundBalance.lt(HOURLY_LUCKY_MINIMUM)) {
    await payouts.updateOne({ _id: payoutId }, { $set: { status: "skipped", reason: !players.length ? "no-player" : "insufficient-fund" } });
    return { paid: false, reason: !players.length ? "no-player" : "insufficient-fund" };
  }

  const winner = players[Math.min(players.length - 1, Math.floor(random() * players.length))];
  const tierMaximum = getHourlyLuckyMaximum(getGameTier(winner.rankPoints || 0).daily);
  const maximum = fundBalance.lt(tierMaximum) ? fundBalance : tierMaximum;
  const amount = randomBigInteger(HOURLY_LUCKY_MINIMUM, maximum, random);
  const fundUpdate = await connection.collection("game_reward_funds").updateOne(
    { _id: FUND_ID, balance: fund.balance },
    { $set: { balance: fundBalance.minus(amount).toString(), updatedAt: now } }
  );
  if (fundUpdate.modifiedCount !== 1) {
    await payouts.deleteOne({ _id: payoutId });
    return { paid: false, reason: "fund-changed" };
  }
  const credited = await adjustPlayerBalanceSafely(winner.idUserZalo, amount.toString());
  if (!credited.success) {
    await addToLuckyEnvelopeFund(amount);
    await payouts.updateOne({ _id: payoutId }, { $set: { status: "failed", reason: credited.message } });
    return { paid: false, reason: "credit-failed" };
  }
  await payouts.updateOne({ _id: payoutId }, { $set: { status: "paid", playerId: winner.idUserZalo, amount: amount.toString(), paidAt: now } });
  await notifyLuckyWinnerInGroups(api, winner, amount);
  return { paid: true, playerId: winner.idUserZalo, amount: amount.toString() };
}

export function initializeGameAutoRewards(api) {
  fallbackApi ||= api;
  if (globalThis.__nghGameAutoRewardJob) return;
  // Thưởng Hội viên được người chơi tự nhận trong khung 19h. Job này chỉ còn
  // xử lý lì xì mỗi giờ và tự bỏ qua các phút khác phút 00.
  globalThis.__nghGameAutoRewardJob = schedule.scheduleJob("* * * * *", async () => {
    try {
      const now = new Date();
      await distributeHourlyLuckyEnvelope(fallbackApi, now);
    } catch (error) {
      console.error("[GameAutoReward] Lỗi phát thưởng tự động:", error);
    }
  });
}
