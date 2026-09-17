import { accrueSavingsAccount, depositInterestDate } from "./savings-interest.js";
import Big from "big.js";
import nodeFetch from "node-fetch";
import path from "path";
import fs from "fs";
import {
  claimDailyReward,
  claimWeeklyAllowance,
  claimRescueReward,
  getTopPlayers,
  getMyCard,
  isHaveLoginAccount,
  banPlayer,
  unbanPlayer,
  isPlayerBanned,
  ensurePlayerAccount,
  adjustPlayerBalanceSafely,
  claimPendingRefund,
  connection,
  NAME_TABLE_PLAYERS,
} from "../../database/index.js";
import {
  getPlayerBalance,
  updatePlayerBalance,
  getPlayerInfo,
  getAccountVND,
  updateAccountVND,
  setPlayerBalance,
  recordGameTransfer,
  getGameTransferHistory,
  getGamePlayerHistory,
  raisePlayerRank,
  resetPlayerRank,
  getGamePrivacy,
  setGamePrivacy,
} from "../../database/player.js";
import { getUserInfoAcrossBots } from "../info-service/user-info.js";
import { sendMessageFromSQL, sendMessageCompleteRequest, getNameServer } from "../../service-ngh/chat-zalo/chat-style/chat-style.js";
import * as cv from "../../utils/canvas/index.js";
import { apiManager, isAdmin, isBotLeader, isDeveloper, getBotLeaderAliases, inheritBotLeader, getApiManager } from "../../index.js";
import { getGlobalPrefix } from "../service.js";
import { formatBigNumber, formatCurrency, parseGameAmount, removeMention } from "../../utils/format-util.js";
import { getGameTier, getGameTiers, getGameTierByName } from "../../utils/canvas/game-finance.js";
import { getCurrentPrivateGameServer, getPrivateGameServer, getPrivateGameServerForApi, isPrivateGameServerManager } from "./private-game-server.js";
import { canUseGameBenefitReset, getGameBenefitResetSpec } from "./game-benefit-reset.js";
import { MessageType } from "../../api-zalo/index.js";
import { createShortDonationCode } from "./donation-code.js";
import { readGroupSettings } from "../../utils/io-json.js";
import { claimMemberReward, getLuckyEnvelopeFund } from "./game-auto-rewards.js";

export { getGameBenefitResetSpec } from "./game-benefit-reset.js";


const ANONYMOUS_GAME_AVATAR = "https://i.pinimg.com/originals/e9/e0/7d/e9e07de22e3ef161bf92d1bcf241e4d0.jpg";

export async function checkBeforeJoinGame(api, message, groupSettings, checkLogin = true) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const isAdminBot = isAdmin(api.getBotId(), senderId, threadId);

  if (!connection) {
    const text =
      "Cơ sở dữ liệu game chưa được kết nối, vui lòng khởi động lại bot sau khi database hoạt động rồi thử lại!";
    const result = { success: false, message: text };
    await sendMessageFromSQL(api, message, result, true, 30000);
    return false;
  }

  if (groupSettings) {
    const activeGame = groupSettings?.[threadId]?.activeGame;
    const isAdminLevelHighest = isAdmin(api.getBotId(), senderId) || isBotLeader(api.getBotId(), senderId);
    if (!isAdminLevelHighest && activeGame === false) {
      let text = "";
      if (isAdminBot) {
        text =
          "Trò chơi hiện tại không được kích hoạt trong nhóm này.\n\n" +
          "Quản trị viên hãy dùng lệnh !gameactive để kích hoạt tương tác game cho nhóm!";
        const result = {
          success: false,
          message: text,
        };
        await sendMessageFromSQL(api, message, result, true, 30000);
      }
      return false;
    }
  }

  if (await checkPlayerBanned(api, message, threadId, senderId)) {
    return false;
  }

  // Mọi lệnh game đều tự tạo hồ sơ theo UID Zalo; người chơi không cần đăng ký/đăng nhập.
  if (checkLogin) {
    if (!(await checkPlayerLogin(api, message, threadId, senderId))) {
      return false;
    }
  }

  return true;
}

export async function handleClaimDailyReward(api, message, groupSettings) {
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return;

  const senderId = message.data.uidFrom;
  const senderAccount = await ensurePlayerAccount(senderId, message.data.dName || senderId, api.getBotId(), api);
  const playerId = senderAccount?.playerId || senderId;
  const result = await claimDailyReward(playerId);
  // Daily là thông báo cá nhân, không mention người gọi (tránh ping nhầm/thừa).
  const sent = await sendMessageFromSQL(api, message, result, false, 30000);
  if (!sent) {
    // Một số bot trả lỗi khi mention bằng global UID. Gửi lại có style/nameServer
    // và vẫn quote tin nhắn gốc, chỉ bỏ mention để Zalo chấp nhận payload.
    const retry = await sendMessageFromSQL(api, message, result, false, 30000, false);
    if (!retry) {
      await api.sendMessage({ msg: `${getNameServer(api)}\n${result.message}`, quote: message, ttl: 30000 }, message.threadId, message.type);
    }
  }
}

async function handleWeeklyBenefit(api, message, groupSettings, claim) {
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return;

  const senderId = message.data.uidFrom;
  const senderAccount = await ensurePlayerAccount(senderId, message.data.dName || senderId, api.getBotId(), api);
  const playerId = senderAccount?.playerId || senderId;
  const result = await claim(playerId);
  const sent = await sendMessageFromSQL(api, message, result, false, 30000);
  if (!sent) {
    await api.sendMessage({ msg: `${getNameServer(api)}\n${result.message}`, quote: message, ttl: 30000 }, message.threadId, message.type);
  }
}

export async function handleAutomaticBenefitInfo(api, message, groupSettings, type) {
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return;
  const senderId = message.data.uidFrom;
  const account = await ensurePlayerAccount(senderId, message.data.dName || senderId, api.getBotId(), api);
  const player = await getPlayerInfo(account?.playerId || senderId);
  const rankPoints = new Big(player?.rankPoints || 0);
  const tier = getGameTier(rankPoints);
  let text;
  if (type === "hoantra") {
    const result = await claimPendingRefund(account?.playerId || senderId);
    text = result.success
      ? `♻️ HOÀN TRẢ\nBạn vừa nhận ${formatBigNumber(new Big(result.amount))} VNĐ tiền hoàn trả.\n💰 Số dư mới: ${formatBigNumber(new Big(result.balance))} VNĐ.`
      : `♻️ HOÀN TRẢ\n${result.message}\nMỗi khoản thua được tích lũy 5% để nhận bằng lệnh này.`;
  }
  else if (type === "hoivien") {
    const action = removeMention(message).trim().split(/\s+/u)[1]?.toLowerCase();
    if (["nhan", "nhận", "claim"].includes(action)) {
      const result = await claimMemberReward(account?.playerId || senderId);
      text = result.success
        ? `🎖️ THƯỞNG HỘI VIÊN 19H\nBạn nhận ngẫu nhiên ${formatBigNumber(result.amount)} VNĐ.\n💰 Số dư mới: ${formatBigNumber(result.balance)} VNĐ.`
        : `🎖️ THƯỞNG HỘI VIÊN\n${result.message}`;
      return sendMessageFromSQL(api, message, { success: result.success, message: text }, false, 30000);
    }
    text = `🎖️ THƯỞNG HỘI VIÊN\nTrong khung 19:00–19:59 hằng ngày, dùng ${getGlobalPrefix(api.getBotId())}game hoivien nhan để nhận ngẫu nhiên từ 1 tỷ đến tối đa 500 tỷ VNĐ.\nMỗi người chỉ nhận 1 lần/ngày.`;
  }
  else if (type === "lixi") text = "🧧 LÌ XÌ NGẪU NHIÊN\nMỗi giờ hệ thống tự chọn một người chơi. Mức nhận từ 3 tỷ đến mốc Daily của người được chọn. Không cần thao tác.";
  else {
    const fund = await getLuckyEnvelopeFund();
    text = `👹 QUỸ LÌ XÌ\nSố dư quỹ: ${formatBigNumber(fund)} VNĐ.\nMỗi lượt thắng tự động đóng góp 5% tiền thắng; quỹ dùng để lì xì ngẫu nhiên mỗi giờ.`;
  }
  return sendMessageFromSQL(api, message, { success: true, message: text }, false, 30000);
}

export async function handleWeeklyAllowance(api, message, groupSettings) {
  return handleWeeklyBenefit(api, message, groupSettings, claimWeeklyAllowance);
}

export async function handleRescueReward(api, message, groupSettings) {
  return handleWeeklyBenefit(api, message, groupSettings, claimRescueReward);
}


function getSavingsArguments(api, message) {
  const prefix = getGlobalPrefix(api.getBotId()).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const content = String(message.data.content?.title || message.data.content || "");
  return content.replace(new RegExp(`^\\s*${prefix}\\s*nganhang\\b`, "iu"), "").trim().split(/\s+/u).filter(Boolean);
}

async function recordSavingsTransaction(data) {
  await connection.collection("game_savings_transactions").insertOne({ ...data, createdAt: new Date() });
}

export async function handleSavingsBankCommand(api, message, groupSettings) {
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return;

  const senderId = message.data.uidFrom;
  const accountResult = await ensurePlayerAccount(senderId, message.data.dName || senderId, api.getBotId(), api);
  const playerId = String(accountResult?.playerId || senderId);
  const player = await getPlayerInfo(playerId);
  if (!player) {
    await sendMessageFromSQL(api, message, { success: false, message: "Không thể lấy hồ sơ game của bạn." }, false, 30000);
    return;
  }
  const tier = getGameTier(player.rankPoints || 0);
  const args = getSavingsArguments(api, message);
  const action = String(args[0] || "").toLowerCase();
  const diamondTier = getGameTiers().find((t) => t.key === "diamond") || getGameTier(100000);
  if (action === "gui" && new Big(player.rankPoints || 0).lt(diamondTier.min)) {
    await sendMessageFromSQL(api, message, {
      success: false,
      message: `🏦 Gửi tiết kiệm chỉ mở từ hạng ${diamondTier.name} trở lên.\nHạng hiện tại của bạn: ${tier.name}.`,
    }, false, 30000);
    return;
  }
  const now = new Date();
  const { account, interest, days } = await accrueSavingsAccount(connection, playerId, tier, now);
  const accounts = connection.collection("game_savings_accounts");

  if (!action) {
    const history = await connection.collection("game_savings_transactions").find({ playerId }).sort({ createdAt: -1 }).limit(5).toArray();
    const userInfo = await getUserInfoAcrossBots(api, senderId).catch(() => null);
    const prefix = getGlobalPrefix(api.getBotId());
    const mentionName = String(message.data.dName || player.playerName || senderId).trim();
    const bankGuide = `@${mentionName}\n` +
      "🏦 Tài khoản Ngân Hàng của bạn\n" +
      `👉 Gửi tiết kiệm: ${prefix}game nganhang gui <số tiền>\n` +
      `👉 Rút tiết kiệm: ${prefix}game nganhang rut <số tiền | all>\n` +
      `👉 Lịch sử ngân hàng: ${prefix}game nganhang lichsu`;
    const imagePath = await cv.createGameSavingsImage({
      playerName: player.playerName || message.data.dName || senderId,
      avatar: userInfo?.avatarFull || userInfo?.avatar || player.avatar || null,
      balance: player.balance,
      savings: account.principal,
      rate: tier.rate || 0,
      rankPoints: Number(player.rankPoints || 0),
      savingsUnlocked: new Big(player.rankPoints || 0).gte(diamondTier.min),
      interest, days,
      transactions: history,
    });
    try {
      await api.sendMessage({
        msg: bankGuide,
        mentions: [{ uid: senderId, pos: 0, len: mentionName.length + 1 }],
        attachments: imagePath ? [imagePath] : [],
        quote: message,
        ttl: 300000,
        isUseProphylactic: true,
      }, message.threadId, message.type);
    } finally { await cv.clearImagePath(imagePath); }
    return;
  }

  if (action === "lichsu") {
    const history = await connection.collection("game_savings_transactions").find({ playerId }).sort({ createdAt: -1 }).limit(10).toArray();
    const lines = history.length ? history.map((item, index) => `${index + 1}. ${item.type === "deposit" ? "Gửi" : item.type === "withdraw" ? "Rút" : "Lãi"}: ${formatBigNumber(item.amount)} VNĐ • ${new Date(item.createdAt).toLocaleString("vi-VN")}`).join("\n") : "Chưa có giao dịch tiết kiệm.";
    await sendMessageFromSQL(api, message, { success: true, message: `🏦 LỊCH SỬ NGÂN HÀNG\n${lines}` }, false, 300000);
    return;
  }

  if (!["gui", "rut"].includes(action)) {
    await sendMessageFromSQL(api, message, { success: false, message: "Dùng: .game nganhang [gui <số tiền> | rut <số tiền|all> | lichsu]" }, false, 30000);
    return;
  }

  let amount;
  try {
    const source = action === "gui" ? player.balance : account.principal;
    const parsed = parseGameAmount(args[1], source);
    amount = parsed === "allin" ? new Big(source) : new Big(parsed);
    if (amount.lte(0)) throw new Error();
  } catch {
    await sendMessageFromSQL(api, message, { success: false, message: `Số tiền không hợp lệ. Dùng: .game nganhang ${action} <số tiền${action === "rut" ? " | all" : ""}>` }, false, 30000);
    return;
  }

  if (action === "gui") {
    if (amount.gt(player.balance)) {
      await sendMessageFromSQL(api, message, { success: false, message: `Ví game không đủ tiền. Số dư: ${formatBigNumber(player.balance)} VNĐ.` }, false, 30000);
      return;
    }
    const updated = await adjustPlayerBalanceSafely(playerId, amount.neg().toString());
    if (!updated.success) {
      await sendMessageFromSQL(api, message, { success: false, message: "Không thể cập nhật ví game, vui lòng thử lại." }, false, 30000);
      return;
    }
    const savingsAfter = new Big(account.principal).plus(amount);
    try {
      const result = await accounts.updateOne(
        { playerId, ...(account._id ? { principal: account.principal, lastInterestAt: account.lastInterestAt } : {}) },
        { $set: { playerId, principal: savingsAfter.toString(), lastInterestAt: depositInterestDate(account, amount, now), updatedAt: now } },
        { upsert: !account._id }
      );
      if (result.modifiedCount !== 1 && !result.upsertedCount) throw new Error("Sổ tiết kiệm vừa thay đổi, vui lòng thử lại.");
    } catch (error) {
      await adjustPlayerBalanceSafely(playerId, amount.toString());
      throw error;
    }
    await recordSavingsTransaction({ playerId, type: "deposit", amount: amount.toString(), balanceAfter: savingsAfter.toString() });
    await sendMessageFromSQL(api, message, { success: true, message: `🏦 Đã gửi ${formatBigNumber(amount)} VNĐ vào tiết kiệm.\nSổ tiết kiệm: ${formatBigNumber(savingsAfter)} VNĐ\nHạng ${tier.name}: lãi ${Math.round((tier.rate || 0) * 100)}%/ngày.` }, false, 30000);
    return;
  }

  if (amount.gt(account.principal)) {
    await sendMessageFromSQL(api, message, { success: false, message: `Sổ tiết kiệm không đủ tiền. Hiện có: ${formatBigNumber(account.principal)} VNĐ.` }, false, 30000);
    return;
  }
  const savingsAfter = new Big(account.principal).minus(amount);
  const savingsUpdate = await accounts.updateOne(
    { playerId, principal: account.principal, lastInterestAt: account.lastInterestAt },
    { $set: { playerId, principal: savingsAfter.toString(), lastInterestAt: account.lastInterestAt, updatedAt: now } },
    { upsert: false }
  );
  if (savingsUpdate.modifiedCount !== 1) {
    await sendMessageFromSQL(api, message, { success: false, message: "Sổ tiết kiệm vừa thay đổi, vui lòng thử lại." }, false, 30000);
    return;
  }
  const updated = await adjustPlayerBalanceSafely(playerId, amount.toString());
  if (!updated.success) {
    await accounts.updateOne({ playerId, principal: savingsAfter.toString() }, { $set: { principal: account.principal, lastInterestAt: account.lastInterestAt, updatedAt: now } });
    await sendMessageFromSQL(api, message, { success: false, message: "Không thể cập nhật ví game, giao dịch đã được hoàn tác." }, false, 30000);
    return;
  }
  await recordSavingsTransaction({ playerId, type: "withdraw", amount: amount.toString(), balanceAfter: savingsAfter.toString() });
  await sendMessageFromSQL(api, message, { success: true, message: `🏦 Đã rút ${formatBigNumber(amount)} VNĐ từ tiết kiệm.\nCòn lại: ${formatBigNumber(savingsAfter)} VNĐ.` }, false, 30000);
}

export async function handleTopPlayers(api, message, groupSettings) {
  if (!(await checkBeforeJoinGame(api, message, groupSettings))) return;
  const botId = api.getBotId();

  const threadId = message.threadId;
  const topPlayers = await getTopPlayers(botId);
  // Admin cấp cao vẫn là người chơi hợp lệ và được xếp hạng theo số dư như
  // thành viên bình thường; quyền quản trị không loại họ khỏi BXH game.
  const rankedPlayers = topPlayers.map((player, index) => ({ ...player, rank: index + 1 }));
  const topTen = rankedPlayers.slice(0, 10);
  const normalizeUid = (id) => String(id || "").replace(/^private:[^:]+:/, "").replace(/_0$/, "");
  const loadPlayerAvatar = async (player) => {
    if (player.avatar && typeof player.avatar === "string" && player.avatar.startsWith("http")) {
      return player.avatar;
    }
    const profileApi = getApiManager(player.serverId)?.apiZalo || api;
    for (const profileId of player.profileIds || [player.idUser]) {
      const cleanId = normalizeUid(profileId);
      if (!cleanId || !/^\d+$/.test(cleanId)) continue;
      try {
        const userInfo = await getUserInfoAcrossBots(profileApi, cleanId);
        const avatar = userInfo?.avatarFull || userInfo?.avatar;
        if (avatar) return avatar;
      } catch {}
    }
    return player.avatar || null;
  };
  const playersWithAvatar = await Promise.all(
    topTen.map(async (player) => {
      const privacy = await getGamePrivacy(player.idUser);
      if (privacy.hideProfile) {
        return { ...player, playerName: "Ẩn Danh", avatar: ANONYMOUS_GAME_AVATAR, hideTier: privacy.hideTier, rankPoints: privacy.hideTier ? 0 : player.rankPoints };
      }
      const avatar = await loadPlayerAvatar(player);
      return { ...player, avatar, hideTier: privacy.hideTier, rankPoints: privacy.hideTier ? 0 : player.rankPoints };
    })
  );
  const viewerId = normalizeUid(message.data.uidFrom);
  const viewer = rankedPlayers.find((player) =>
    (player.profileIds || [player.idUser]).some((profileId) => normalizeUid(profileId) === viewerId)
  );
  let viewerWithAvatar = viewer || null;
  if (viewer) {
    const privacy = await getGamePrivacy(viewer.idUser);
    viewerWithAvatar = privacy.hideProfile
      ? { ...viewer, playerName: "Ẩn Danh", avatar: ANONYMOUS_GAME_AVATAR, hideTier: privacy.hideTier, rankPoints: privacy.hideTier ? 0 : viewer.rankPoints }
      : { ...viewer, avatar: await loadPlayerAvatar(viewer), hideTier: privacy.hideTier, rankPoints: privacy.hideTier ? 0 : viewer.rankPoints };
  }

  const imagePath = await cv.createGameRankImage(playersWithAvatar, "BẢNG XẾP HẠNG TÀI PHÚ", viewerWithAvatar);
  try {
    await api.sendMessage(
      { msg: "", attachments: imagePath ? [imagePath] : [], ttl: 300000, isUseProphylactic: true },
      threadId,
      message.type
    );
  } finally {
    await cv.clearImagePath(imagePath);
  }
}

export async function handleGameHideCommand(api, message, groupSettings) {
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return;
  const action = removeMention(message).trim().split(/\s+/u)[1]?.toLowerCase();
  if (!["on", "off"].includes(action)) {
    await sendMessageFromSQL(api, message, {
      success: false,
      message: `Dùng: ${getGlobalPrefix(api.getBotId())}game hide on/off`,
    }, false, 30000);
    return;
  }
  const account = await ensurePlayerAccount(message.data.uidFrom, message.data.dName || message.data.uidFrom, api.getBotId(), api);
  const result = await setGamePrivacy(account?.playerId || message.data.uidFrom, { hideProfile: action === "on" });
  await sendMessageFromSQL(api, message, {
    success: result.success,
    message: result.success
      ? action === "on"
        ? "🥷 Đã bật ẩn danh trên BXH: tên đổi thành Ẩn Danh và avatar được che."
        : "✅ Đã tắt ẩn danh trên BXH."
      : result.message,
  }, false, 30000);
}

export async function handleMyCard(api, message, groupSettings) {
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return;

  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  const mention = message.data.mentions?.[0];
  if (mention && !isAdmin(api.getBotId(), senderId)) {
    await sendMessageFromSQL(api, message, { success: false, message: "Chỉ admin cấp cao bot mới xem được mycard của người khác." }, true, 30000);
    return;
  }
  let targetId = mention?.uid || senderId;
  const targetName = mention
    ? String(message.data.content?.title || message.data.content || "")
        .substring(mention.pos, mention.pos + mention.len)
        .replace("@", "")
    : (message.data.dName || senderId);
  const targetAccount = await ensurePlayerAccount(targetId, targetName || targetId, api.getBotId(), api);
  if (targetAccount?.playerId) {
    targetId = targetAccount.playerId;
  }
  const result = await getMyCard(api, targetId);
  if (result.success) {
    const playerInfo = result.data;
    // Tên hiển thị lấy từ người đang gọi lệnh để không bị ảnh hưởng bởi hồ sơ cũ nhiễm alias.
    if (!mention) playerInfo.playerName = message.data.dName || playerInfo.playerName;
    playerInfo.title = "Thông Tin Người Chơi";
    let msg = `🎴 Thông tin của bạn 🎴\n\n`;
    msg += `👤 Tên: ${playerInfo.playerName}\n`;
    msg += `💰 Số dư: ${formatCurrency(playerInfo.balance)} VNĐ\n`;
    msg += `🏆 Tổng Thắng: ${formatCurrency(playerInfo.totalWinnings)} VNĐ\n`;
    msg += `💸 Tổng Thua: ${formatCurrency(playerInfo.totalLosses)} VNĐ\n`;
    msg += `💹 Lợi Nhuận Ròng: ${formatCurrency(playerInfo.netProfit)} VNĐ\n`;
    msg += `🎮 Tổng Số Lượt Chơi: ${playerInfo.totalGames}\n`;
    msg += `📊 Tỉ Lệ Thắng: ${playerInfo.winRate}%\n`;
    msg += `📅 Ngày Tham Gia: ${playerInfo.registrationTime}\n`;
    msg += `🎁 Nhận Quà Mỗi Ngày: ${playerInfo.lastDailyReward}`;

    const imagePath = await cv.createUserCardGame(playerInfo);
    await api.sendMessage({ msg: "", attachments: imagePath ? [imagePath] : [] }, threadId, message.type);
    await cv.clearImagePath(imagePath);
  } else {
    await sendMessageFromSQL(api, message, result, true, 30000);
  }
}

export async function handleTestMyCard(api, message, groupSettings) {
  const content = String(message.data.content?.title || message.data.content || "").toLowerCase();
  
  let rankPoints = 0;
  const matched = getGameTierByName(content);
  if (matched) rankPoints = Number(matched.min);

  const mockData = {
    playerName: "Người chơi Test",
    avatar: message.data.avatar || "https://cdn.discordapp.com/embed/avatars/0.png",
    avatarFull: message.data.avatar || "https://cdn.discordapp.com/embed/avatars/0.png",
    idUser: message.data.uidFrom || "123456789",
    registrationTime: "14/08/2026",
    balance: 550000000,
    netProfit: 125000000,
    totalWinnings: 300000000,
    totalLosses: -175000000,
    winRate: 65,
    totalWinGames: 65,
    totalGames: 100,
    rankPoints: rankPoints
  };

  const imagePath = await cv.createUserCardGame(mockData);
  await api.sendMessage({ msg: "", attachments: imagePath ? [imagePath] : [] }, message.threadId, message.type);
  await cv.clearImagePath(imagePath);
}

/**
 * Kiểm tra quyền Bot Leader thực sự của hệ thống.
 * - Cho phép Bot Leader dùng trên bot chính hoặc xuyên qua bất kỳ bot con nào.
 * - TUYỆT ĐỐI KHÔNG cho phép admin cấp cao của bot con (delegated admins).
 */
export async function isUserBotLeader(api, senderId, senderName = "") {
  if (!senderId) return false;
  const normalizedSenderId = String(senderId);
  const currentBotId = api?.getBotId?.() ? String(api.getBotId()) : "";

  // 1. Chỉ tài khoản bot mẹ và bot Hâm Và Cute được tự dùng quyền quản lý tier.
  // Không mở ngoại lệ này cho các bot con khác, kể cả khi uidFrom trùng getBotId().
  const isAllowedBotAccount = normalizedSenderId === currentBotId && (
    api?.apiManager?.isMainBot === true ||
    getPrivateGameServer(currentBotId)?.serverId === "hun-7557227884309571581"
  );
  if (isAllowedBotAccount) return true;

  // 2. Tìm manager của bot chính
  const mainBotManager = Object.values(apiManager.apiManagerObject).find((m) => m.isMainBot);
  const mainBotId = mainBotManager?.id ? String(mainBotManager.id) : "";

  // Danh sách Admin / Leader / Chủ nhân của BOT CHÍNH
  const mainBotAdmins = (mainBotManager?.getListAdmin?.() || []).map(String);
  const mainBotOwners = (mainBotId ? getBotLeaderAliases(mainBotId) : []).map(String);

  // 3. Kiểm tra trực tiếp trên bot chính:
  const isDirectMainLeader =
    (mainBotId && normalizedSenderId === mainBotId) ||
    mainBotAdmins.includes(normalizedSenderId) ||
    mainBotOwners.includes(normalizedSenderId) ||
    (mainBotId && isDeveloper(mainBotId, normalizedSenderId));

  if (isDirectMainLeader) return true;

  // 4. Nếu là mainbot botleader dùng qua bot con (hoặc qua shard / sv riêng):
  // - Kiểm tra liên kết idBotMainWithBot (tài khoản bot chính liên kết)
  const idBotMainWithBot = String(api?.apiManager?.idBotMainWithBot || "");
  if (idBotMainWithBot && normalizedSenderId === idBotMainWithBot) return true;

  // - Kiểm tra các alias của bot chính / bot gốc trong bot_leader.json
  const rootBotIds = ["626785955735131567", idBotMainWithBot].filter(Boolean);
  for (const rootId of rootBotIds) {
    const rootOwners = (getBotLeaderAliases(rootId) || []).map(String);
    if (rootOwners.includes(normalizedSenderId)) return true;
    if (isDeveloper(rootId, normalizedSenderId)) return true;
  }

  // - Nếu người dùng đã được xác thực là Bot Leader alias trên bot này:
  const currentAliases = (getBotLeaderAliases(currentBotId) || []).map(String);
  if (currentAliases.includes(normalizedSenderId)) return true;

  // - Đối chiếu Bot Leader qua bot con (inheritBotLeader)
  if (typeof inheritBotLeader === "function") {
    try {
      const inherited = await inheritBotLeader(api, normalizedSenderId, senderName);
      if (inherited) return true;
    } catch (err) {
      console.error("[isUserBotLeader] Lỗi khi đối chiếu Bot Leader qua bot con:", err?.message || err);
    }
  }

  // Admin cấp cao của bot con / bot Hâm & Cute (local admin) KHÔNG được dùng => BỊ CHẶN HOÀN TOÀN!
  return false;
}

export async function handleGameTierCommand(api, message, groupSettings) {
  const senderId = message.data.uidFrom;
  const mention = message.data.mentions?.[0];
  const isHighAdmin = isAdmin(api.getBotId(), senderId);
  const content = removeMention(message).trim().split(/\s+/).filter(Boolean);
  const rawContent = String(message.data.content?.title || message.data.content || "");
  const targetName = mention
    ? rawContent.substring(mention.pos, mention.pos + mention.len).replace("@", "")
    : message.data.dName || senderId;
  const action = String(content[1] || "").toLowerCase();
  const wantsRaise = action === "set" || action === "up" || action === "nang";
  const wantsRemove = ["xoa", "remove", "del", "delete", "reset", "tru", "sub", "clear"].includes(action)
    || content.some((t, idx) => idx > 0 && ["xoa", "remove", "del", "delete", "reset"].includes(t.toLowerCase()));

  // Xoá/set tier là thao tác quản trị, không bắt Bot Leader phải tạo hồ sơ
  // game trước. Các thao tác cá nhân và xem tier vẫn giữ nguyên điều kiện.
  if (!wantsRemove && !wantsRaise && !(await checkBeforeJoinGame(api, message, groupSettings, true))) return;

  if (action === "hide") {
    const value = String(content[2] || "").toLowerCase();
    if (!["on", "off"].includes(value)) {
      await sendMessageFromSQL(api, message, { success: false, message: `Dùng: ${getGlobalPrefix(api.getBotId())}game tier hide on/off` }, false, 30000);
      return;
    }
    const account = await ensurePlayerAccount(senderId, message.data.dName || senderId, api.getBotId(), api);
    const result = await setGamePrivacy(account?.playerId || senderId, { hideTier: value === "on" });
    await sendMessageFromSQL(api, message, {
      success: result.success,
      message: result.success
        ? value === "on" ? "🕶️ Đã ẩn tier của bạn trên BXH." : "✅ Đã hiện lại tier của bạn trên BXH."
        : result.message,
    }, false, 30000);
    return;
  }

  if (wantsRemove) {
    const amountToken = content.slice(1).find((t) => {
      try {
        const p = parseGameAmount(t, 0);
        return p !== 0 && p !== "allin";
      } catch {
        return false;
      }
    });
    await handleManualDonateRemove(api, message, amountToken);
    return;
  }

  if (wantsRaise) {
    const isLeader = await isUserBotLeader(api, senderId, message.data.dName);
    if (!isLeader) {
      await sendMessageFromSQL(api, message, { success: false, message: "Chỉ Bot Leader mới được set hạng." }, true, 30000);
      return;
    }
    const targetId = mention?.uid || content[2];
    if (!targetId) {
      await sendMessageFromSQL(api, message, { success: false, message: `Dùng: ${getGlobalPrefix(api.getBotId())}game tier set @người_dùng` }, true, 30000);
      return;
    }
    await ensurePlayerAccount(targetId, targetName || targetId, api.getBotId(), api);
    const kimLongTier = getGameTiers().find((t) => t.key === "gold_dragon") || { min: 150000 };
    const result = await raisePlayerRank(targetId, Number(kimLongTier.min));
    await sendMessageFromSQL(api, message, {
      success: result.success,
      message: result.success
        ? `✅ Đã nâng ${targetId} lên mốc KIM LONG (${formatCurrency(kimLongTier.min)} điểm hạng).`
        : `❌ ${result.message}`,
    }, true, 30000);
    return;
  }

  if (mention && !isHighAdmin) {
    await sendMessageFromSQL(api, message, { success: false, message: "Chỉ admin cấp cao bot mới kiểm tra hoặc nâng hạng cho người khác." }, true, 30000);
    return;
  }

  let targetId = mention?.uid || senderId;
  const targetAccount = await ensurePlayerAccount(targetId, targetName || targetId, api.getBotId(), api);
  if (targetAccount?.playerId) {
    targetId = targetAccount.playerId;
  }

  const player = await getPlayerInfo(targetId);
  const userInfo = await getUserInfoAcrossBots(api, targetId);
  const imagePath = await cv.createVIPTierImage({
    playerName: player?.playerName || targetName,
    rankPoints: Number(player?.rankPoints || 0),
    balance: Number(player?.balance || 0),
    avatarUrl: userInfo?.avatar || null,
  });
  try {
    await api.sendMessage({ msg: "", attachments: [imagePath], ttl: 300000, isUseProphylactic: true }, message.threadId, message.type);
  } finally {
    await cv.clearImagePath(imagePath);
  }
}

export async function handleDonateRankCommand(api, message, groupSettings) {
  await sendMessageFromSQL(api, message, {
    success: false,
    message: "Lệnh đổi tiền game lấy điểm hạng đã được bỏ. Hạng chỉ tăng khi nạp tiền.",
  }, true, 30000);
}

function canUseLeaderGameReset(api, message) {
  const senderId = String(message.data.uidFrom || "");
  // Bot Leader được điều khiển reset từ bot mẹ hoặc bất kỳ bot con nào.
  // Trên mainbot, chính tài khoản bot cũng là Bot Leader hợp lệ; không loại UID
  // này vì tin nhắn do tài khoản mainbot gửi có uidFrom trùng với getBotId().
  return canUseGameBenefitReset(api.getBotId(), senderId, isBotLeader);
}

export async function handleResetGameBenefitCommand(api, message) {
  if (!canUseLeaderGameReset(api, message)) {
    return sendMessageFromSQL(api, message, {
      success: false,
      message: "Chỉ Bot Leader mới được reset Daily, cứu trợ, trợ cấp hoặc thưởng Hội viên. Bot con không thể tự dùng lệnh này.",
    }, true, 30000);
  }

  const content = String(message.data.content?.title || message.data.content || "");
  const type = content.trim().split(/\s+/u)[1];
  const spec = getGameBenefitResetSpec(type);
  if (!spec) {
    return sendMessageFromSQL(api, message, {
      success: false,
      message: `Dùng: ${getGlobalPrefix(api.getBotId())}game reset <daily|cuutro|trocap|hoivien|all>`,
    }, true, 30000);
  }

  // Không lọc serverId: reset có hiệu lực trên toàn bộ hồ sơ dùng chung,
  // bao gồm người chơi của bot con thuộc server game riêng.
  const result = await connection.collection(NAME_TABLE_PLAYERS).updateMany({}, { $set: spec.fields });
  const reply = await sendMessageFromSQL(api, message, {
    success: true,
    message: `✅ Đã reset ${spec.label} cho toàn bộ bot/server (${result.matchedCount} tài khoản).`,
  }, true, 120000);
  await notifyGameResetToActiveGroups(spec, api, message);
  return reply;
}

async function notifyGameResetToActiveGroups(spec, sourceApi, sourceMessage) {
  const debug = (line) => { try { fs.appendFileSync("/tmp/game-reset-debug.log", `${new Date().toISOString()} ${line}\n`); } catch {} };
  debug(`enter source=${sourceApi?.getBotId?.() || ""} thread=${sourceMessage?.threadId || ""}`);
  try {
    const text = spec.fields.lastDailyReward !== undefined && spec.fields.lastMemberRewardDay !== undefined
      ? "📢 Tiến Hành Reset Daily, Cứu Trợ, Trợ Cấp và Thưởng Hội Viên\n🎉 Chúc Các Bạn Vui Vẻ!"
      : spec.fields.lastDailyReward !== undefined ? "📢 Tiến Hành Reset Daily\n🎉 Chúc Các Bạn Vui Vẻ!"
        : spec.fields.lastRescueAt !== undefined ? "📢 Tiến Hành Reset Cứu Trợ\n🎉 Chúc Các Bạn Vui Vẻ!"
          : spec.fields.lastAllowanceAt !== undefined ? "📢 Tiến Hành Reset Trợ Cấp\n🎉 Chúc Các Bạn Vui Vẻ!"
            : "📢 Tiến Hành Reset Thưởng Hội Viên\n🎉 Chúc Các Bạn Vui Vẻ!";

    const diskSettings = readGroupSettings() || {};
    const managers = Object.values(apiManager.apiManagerObject || {}).filter((item) => item?.apiZalo);
    const sendPromises = [];
    const sentKeys = new Set();
    const debugLines = [`[GameReset] managers=${managers.length} diskBots=${Object.keys(diskSettings).length}`];
    const runtimeSettings = {};
    // Duyệt trực tiếp từng API đang online, lấy ID thật từ API; không dựa vào
    // key manager/owner có thể khác botId trong group_settings.
    for (const manager of managers) {
      const targetApi = manager.apiZalo;
      const botId = String(targetApi.getBotId?.() || manager.id || manager.idBot || "");
      if (!botId) continue;
      const botGroups = {
        ...(runtimeSettings[botId] || {}),
        ...(diskSettings[botId] || {}),
      };
      const activeThreadIds = Object.entries(botGroups)
        .filter(([, value]) => {
          const gameOn = value?.activeGame === true || value?.activeGame === "true";
          const botOn = value?.activeBot === true || value?.activeBot === "true";
          return gameOn && botOn;
        })
        .map(([threadId]) => String(threadId));

      debugLines.push(`[GameReset] bot=${botId} active=${activeThreadIds.length}`);
      if (activeThreadIds.length === 0) continue;

      for (const threadId of activeThreadIds) {
        if (sentKeys.has(`${botId}:${threadId}`)) continue;
        sendPromises.push(
          targetApi
            .sendMessage({ msg: text, ttl: 120000 }, threadId, MessageType.GroupMessage)
            .then(() => {
              console.log(`[GameReset] Đã gửi thông báo reset tới nhóm ${threadId} qua bot ${botId}`);
            })
            .catch((error) => {
              console.warn(`[GameReset] Không gửi được thông báo tới nhóm ${threadId} qua bot ${botId}:`, error?.message || error);
            })
        );
      }
    }

    await Promise.allSettled(sendPromises);
    try { fs.appendFileSync("/tmp/game-reset-debug.log", `${new Date().toISOString()} ${debugLines.join(" | ")}\n`); } catch {}
  } catch (error) {
    debug(`error ${error?.stack || error?.message || error}`);
    console.error("Không thể thông báo reset game tới các nhóm activeGame:", error?.message || error);
  }
}

export async function handleResetDailyCommand(api, message) {
  if (!canUseLeaderGameReset(api, message)) {
    return sendMessageFromSQL(api, message, { success: false, message: "Chỉ Bot Leader mới được reset Daily. Bot con không thể tự dùng lệnh này." }, true, 30000);
  }
  const mention = message.data.mentions?.[0];
  const filter = mention ? { idUserZalo: String(mention.uid) } : {};
  const result = await connection.collection(NAME_TABLE_PLAYERS).updateMany(filter, { $set: { lastDailyReward: null } });
  const target = mention ? "người được tag" : "toàn bộ người chơi";
  return sendMessageFromSQL(api, message, { success: true, message: `✅ Đã reset Daily cho ${target} (${result.matchedCount} tài khoản).` }, true, 120000);
}

export async function handleResetAllGameDataCommand(api, message) {
  if (!canUseLeaderGameReset(api, message)) {
    return sendMessageFromSQL(api, message, { success: false, message: "Chỉ Bot Leader trên bot chính mới được reset toàn bộ game." }, true, 30000);
  }
  await connection.collection(NAME_TABLE_PLAYERS).updateMany({}, { $set: {
    balance: "10000", rankPoints: 0, totalWinnings: "0", totalLosses: "0", netProfit: "0",
    totalGames: 0, totalWinGames: 0, winRate: 0, lastDailyReward: null,
  } });
  const { DEFAULT_JACKPOT, gameState, saveGameDataNow } = await import("./game-manager.js");
  for (const game of ["taixiu", "chanle", "baucua", "vietlott655", "xoso45s"]) {
    if (gameState.data[game]) {
      gameState.data[game].history = [];
      gameState.data[game].jackpot = DEFAULT_JACKPOT;
      gameState.data[game].jackpots = {};
      if (gameState.data[game].players) gameState.data[game].players = {};
    }
  }
  saveGameDataNow();
  const reply = await sendMessageFromSQL(api, message, {
    success: true,
    message: "✅ Đã reset dữ liệu game toàn server, giữ hồ sơ người chơi.",
  }, true, 120000);
  // Reset toàn bộ game cũng phải thông báo tới mọi nhóm đang bật game.
  await notifyGameResetToActiveGroups(getGameBenefitResetSpec("all"), api, message);
  return reply;
}

export async function handleResetJackpotCommand(api, message) {
  if (!canUseLeaderGameReset(api, message)) {
    return sendMessageFromSQL(api, message, { success: false, message: "Chỉ Bot Leader và admin cấp cao nhất mới được reset hũ." }, true, 30000);
  }
  const [{ DEFAULT_JACKPOT, gameState, saveGameDataNow }, taiXiu, vietlott, bauCua, chanLe] = await Promise.all([
    import("./game-manager.js"),
    import("./tai-xiu/tai-xiu.js"),
    import("./vietlott/vietlott655.js"),
    import("./bau-cua/bau-cua.js"),
    import("./chan-le/chan-le.js"),
  ]);
  taiXiu.resetJackpot();
  vietlott.resetJackpot();
  bauCua.resetJackpot();
  chanLe.resetJackpot();
  for (const game of ["taixiu", "chanle", "baucua", "vietlott655"]) {
    if (gameState.data[game]) {
      gameState.data[game].jackpot = DEFAULT_JACKPOT;
      gameState.data[game].jackpots = {};
      gameState.changes[game] = true;
    }
  }
  saveGameDataNow();
  return sendMessageFromSQL(api, message, {
    success: true,
    message: "✅ Đã reset toàn bộ hũ về 0 VNĐ riêng cho tất cả bot và server riêng: Tài Xỉu, Chẵn Lẻ, Bầu Cua và Vietlott.",
  }, true, 120000);
}

export async function handleBuffCommand(api, message, groupSettings) {
  const senderId = message.data.uidFrom;
  const privateServer = getCurrentPrivateGameServer() || getPrivateGameServerForApi(api);
  const isServerManager = privateServer?.ownerIds?.some((id) => String(id) === String(senderId)) || isPrivateGameServerManager(api, senderId);
  const isHighAdminOnThisBot = isAdmin(api.getBotId(), senderId) || isBotLeader(api.getBotId(), senderId) || (await isUserBotLeader(api, senderId, message.data?.dName));
  if (privateServer ? !(isServerManager || isHighAdminOnThisBot) : !isHighAdminOnThisBot) {
    await sendMessageFromSQL(api, message, { success: false, message: "Chỉ quản trị viên cấp cao mới có quyền sử dụng lệnh buff." }, true, 30000);
    return;
  }

  await ensurePlayerAccount(senderId, message.data.dName || senderId, api.getBotId(), api);

  const mentions = message.data.mentions || [];
  let content = removeMention(message);
  const contentParts = content.split(" ");
  let buffAmount;
  try {
    const parsedAmount = parseGameAmount(contentParts[1], Number.MAX_SAFE_INTEGER);
    if (parsedAmount === "allin") {
      const result = {
        success: false,
        message: `Không thể sử dụng all/allin cho lệnh buff.`,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
      return;
    }
    buffAmount = new Big(parsedAmount);
  } catch (error) {
    const result = {
      success: false,
      message: "Số tiền không hợp lệ.",
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
    return;
  }

  if (buffAmount.lte(0)) {
    const result = {
      success: false,
      message: `Số tiền không hợp lệ.`,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
    return;
  }

  if (!mentions || mentions.length === 0) {
    if (await isHaveLoginAccount(senderId)) {
      // Lấy số dư hiện tại
      const currentBalance = await getPlayerBalance(senderId);
      const oldBalance = new Big(currentBalance.balance);

      // Thực hiện buff
      await updatePlayerBalance(senderId, buffAmount);

      // Tính số dư mới
      const newBalance = oldBalance.plus(buffAmount);

      const result = {
        success: true,
        message:
          `🔄 Buff tiền thành công!\n\n` +
          `💰 Số tiền buff: ${formatBigNumber(buffAmount)} VNĐ\n\n` +
          `📊 Biến động số dư:\n` +
          `- Trước: ${formatBigNumber(oldBalance)} VNĐ\n` +
          `- Sau: ${formatBigNumber(newBalance)} VNĐ`,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
    } else {
      const result = {
        success: false,
        message: `Không thể khởi tạo hồ sơ game của bạn.`,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
    }
    return;
  }

  let successMessages = [];
  let failureMessages = [];

  for (const mention of mentions) {
    const targetId = mention.uid;
    const targetName = message.data.content.substring(mention.pos, mention.pos + mention.len).replace("@", "");

    await ensurePlayerAccount(targetId, targetName, api.getBotId(), api);
    if (await isHaveLoginAccount(targetId)) {
      // Lấy số dư hiện tại của người được buff
      const currentBalance = await getPlayerBalance(targetId);
      const oldBalance = new Big(currentBalance.balance);

      // Thực hiện buff
      await updatePlayerBalance(targetId, buffAmount);

      // Tính số dư mới
      const newBalance = oldBalance.plus(buffAmount);

      successMessages.push(
        `✅ ${targetName}:\n` +
          `- Buff: +${formatBigNumber(buffAmount)} VNĐ\n` +
          `- Trước: ${formatBigNumber(oldBalance)} VNĐ\n` +
          `- Sau: ${formatBigNumber(newBalance)} VNĐ`
      );
    } else {
      failureMessages.push(`❌ ${targetName}: không thể khởi tạo hồ sơ game.`);
    }
  }

  let finalMessage = `🔄 Kết quả buff tiền:\n`;
  if (successMessages.length > 0) {
    finalMessage += "\n✅ Thành công:\n" + successMessages.join("\n\n") + "\n";
  }
  if (failureMessages.length > 0) {
    finalMessage += "\n❌ Thất bại:\n" + failureMessages.join("\n");
  }

  const result = {
    success: true,
    message: finalMessage,
  };
  await sendMessageFromSQL(api, message, result, false, 300000);
}

export async function handleSetVNDCommand(api, message, groupSettings) {
  const senderId = message.data.uidFrom;
  const privateServer = getPrivateGameServer(api.apiManager?.ownerId || api.getBotId());
  if (privateServer ? !isPrivateGameServerManager(api, senderId) : !isAdmin(api.getBotId(), senderId)) {
    return;
  }

  await ensurePlayerAccount(senderId, message.data.dName || senderId, api.getBotId(), api);

  const mentions = message.data.mentions || [];
  let content = removeMention(message);
  const contentParts = content.split(" ");
  let buffAmount;
  try {
    const parsedAmount = parseGameAmount(contentParts[1], Number.MAX_SAFE_INTEGER);
    if (parsedAmount === "allin") {
      const result = {
        success: false,
        message: `Không thể sử dụng all/allin cho lệnh set.`,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
      return;
    }
    buffAmount = new Big(parsedAmount);
  } catch (error) {
    const result = {
      success: false,
      message: "Số tiền không hợp lệ.",
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
    return;
  }

  if (buffAmount.lte(0)) {
    const result = {
      success: false,
      message: `Số tiền không hợp lệ.`,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
    return;
  }

  if (!mentions || mentions.length === 0) {
    if (await isHaveLoginAccount(senderId)) {
      const currentBalance = await getPlayerBalance(senderId);
      const oldBalance = new Big(currentBalance.balance);

      await setPlayerBalance(senderId, buffAmount);

      const result = {
        success: true,
        message:
          `🔄 Set tiền thành công!\n\n` +
          `💰 Số tiền set: ${formatBigNumber(buffAmount)} VNĐ\n\n` +
          `📊 Biến động số dư:\n` +
          `- Trước: ${formatBigNumber(oldBalance)} VNĐ\n` +
          `- Sau: ${formatBigNumber(buffAmount)} VNĐ`,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
    } else {
      const result = {
        success: false,
        message: `Không thể khởi tạo hồ sơ game của bạn.`,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
    }
    return;
  }

  let successMessages = [];
  let failureMessages = [];

  for (const mention of mentions) {
    const targetId = mention.uid;
    const targetName = message.data.content.substring(mention.pos, mention.pos + mention.len).replace("@", "");

    await ensurePlayerAccount(targetId, targetName, api.getBotId(), api);
    if (await isHaveLoginAccount(targetId)) {
      const currentBalance = await getPlayerBalance(targetId);
      const oldBalance = new Big(currentBalance.balance);

      await setPlayerBalance(targetId, buffAmount);

      successMessages.push(
        `✅ ${targetName}:\n` +
          `- Set: +${formatBigNumber(buffAmount)} VNĐ\n` +
          `- Trước: ${formatBigNumber(oldBalance)} VNĐ\n` +
          `- Sau: ${formatBigNumber(buffAmount)} VNĐ`
      );
    } else {
      failureMessages.push(`❌ ${targetName}: không thể khởi tạo hồ sơ game.`);
    }
  }

  let finalMessage = `🔄 Kết quả set tiền:\n`;
  if (successMessages.length > 0) {
    finalMessage += "\n✅ Thành công:\n" + successMessages.join("\n\n") + "\n";
  }
  if (failureMessages.length > 0) {
    finalMessage += "\n❌ Thất bại:\n" + failureMessages.join("\n");
  }

  const result = {
    success: true,
    message: finalMessage,
  };
  await sendMessageFromSQL(api, message, result, false, 300000);
}

async function getTodayTransferTotal(playerId, field) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const rows = await connection.collection("game_transactions")
    .find({ [field]: String(playerId), createdAt: { $gte: start } }, { projection: { amount: 1 } })
    .toArray();
  return rows.reduce((total, row) => total.plus(new Big(row.amount || 0)), new Big(0));
}

export async function handleBankCommand(api, message, groupSettings) {
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return;

  let senderId = message.data.uidFrom;
  const threadId = message.threadId;
  // if (!(await isPlayerActive(senderId))) {
  //   const result = {
  //     success: false,
  //     message: `Bạn cần mở thành viên để có thể chuyển tiền cho người khác.`,
  //   };
  //   await sendMessageFromSQL(api, message, result);
  //   return;
  // }

  const mentions = message.data.mentions;
  if (!mentions || mentions.length === 0) {
    const result = {
      success: false,
      message: `Vui lòng đề cập (@mention) người dùng cần chuyển tiền!`,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
    return;
  }

  // Lấy số dư người gửi trước
  const requestData = await getPlayerBalance(senderId);
  if (!requestData.success) {
    await sendMessageFromSQL(api, message, requestData, true, 300000);
    return;
  }

  // Sau đó mới parse số tiền
  let content = removeMention(message);
  const amount = content.split(" ")[1];
  let bankAmount;
  try {
    const parsedAmount = parseGameAmount(amount, requestData.balance);
    if (parsedAmount === "allin") {
      bankAmount = new Big(requestData.balance);
    } else {
      bankAmount = parsedAmount;
    }

    if (bankAmount.lt(1000)) {
      const result = {
        success: false,
        message: `Số tiền chuyển tối thiểu là 1,000 VNĐ`,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
      return;
    }
  } catch (error) {
    const result = {
      success: false,
      message: error.message,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
    return;
  }

  // Kiểm tra số dư
  if (new Big(requestData.balance).lt(bankAmount)) {
    const result = {
      success: false,
      message: `Số dư không đủ. Bạn chỉ có ${formatBigNumber(new Big(requestData.balance))} VNĐ.`,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
    return;
  }

  // `targetId` có thể được chuẩn hoá về globalId/username để ghi sổ game,
  // nhưng API Zalo chỉ lấy avatar đúng với UID trong mention ban đầu.
  const targetZaloId = mentions[0].uid;
  let targetId = targetZaloId;
  const targetName = message.data.content
    .substring(mentions[0].pos, mentions[0].pos + mentions[0].len)
    .replace("@", "");

  if (String(targetId) === String(senderId)) {
    await sendMessageFromSQL(
      api,
      message,
      { success: false, message: "Bạn không thể chuyển tiền cho chính mình." },
      true,
      30000
    );
    return;
  }

  const targetAccount = await ensurePlayerAccount(targetId, targetName, api.getBotId(), api);
  if (targetAccount?.playerId) targetId = targetAccount.playerId;
  if (String(targetId) === String(senderId)) {
    await sendMessageFromSQL(api, message, { success: false, message: "Bạn không thể chuyển tiền cho chính mình." }, true, 30000);
    return;
  }

  if (await isPlayerBanned(targetId)) {
    const result = {
      success: false,
      message: `${targetName} đã bị khóa tài khoản, không thể chuyển tiền cho người dùng này.`,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
    return;
  }

  if (await isHaveLoginAccount(targetId)) {
    const senderPlayerInfo = await getPlayerInfo(senderId);
    const receiverPlayerInfo = await getPlayerInfo(targetId);
    const senderTier = getGameTier(senderPlayerInfo?.rankPoints || 0);
    const receiverTier = getGameTier(receiverPlayerInfo?.rankPoints || 0);
    // Kim Long trở lên được miễn hạn mức giao dịch ở cả hai phía. Khi một
    // bên là Kim Long (bank hoặc người nhận), không cần đọc hạn mức của
    // đối phương hay hạn mức còn lại của chính mình.
    const kimLongMin = Number(getGameTiers().find((tier) => tier.key === "gold_dragon")?.min || 150000);
    const kimLongExemption = Number(senderPlayerInfo?.rankPoints || 0) >= kimLongMin ||
      Number(receiverPlayerInfo?.rankPoints || 0) >= kimLongMin;
    if (!kimLongExemption) {
      const [sentToday, receivedToday] = await Promise.all([
        getTodayTransferTotal(senderId, "senderId"),
        getTodayTransferTotal(targetId, "receiverId"),
      ]);
      const senderRemainingRaw = new Big(senderTier.sendLimit).minus(sentToday);
      const receiverRemainingRaw = new Big(receiverTier.receiveLimit).minus(receivedToday);
      const senderRemaining = senderRemainingRaw.lt(0) ? new Big(0) : senderRemainingRaw;
      const receiverRemaining = receiverRemainingRaw.lt(0) ? new Big(0) : receiverRemainingRaw;
      if (bankAmount.gt(senderRemaining) || bankAmount.gt(receiverRemaining)) {
        const reasons = [];
        if (bankAmount.gt(senderRemaining)) reasons.push(`Bạn còn hạn mức chuyển ${formatBigNumber(senderRemaining)} VNĐ hôm nay.`);
        if (bankAmount.gt(receiverRemaining)) reasons.push(`${targetName} còn hạn mức nhận ${formatBigNumber(receiverRemaining)} VNĐ hôm nay.`);
        await sendMessageFromSQL(api, message, {
          success: false,
          message: `⚪ ${targetName} (hạng ${receiverTier.name})\n${reasons.join("\n")}`,
        }, true, 300000);
        return;
      }
    }

    // Lấy số dư hiện tại của người gửi và người nhận
    const senderBalance = new Big(requestData.balance);
    const receiverData = await getPlayerBalance(targetId);
    const receiverBalance = new Big(receiverData.balance);

    // Thực hiện chuyển tiền
    const senderUpdate = await updatePlayerBalance(senderId, bankAmount.neg().toString());
    if (!senderUpdate.success) {
      await sendMessageFromSQL(
        api,
        message,
        { success: false, message: "Không thể trừ số dư người chuyển. Vui lòng thử lại." },
        true,
        300000
      );
      return;
    }
    const receiverUpdate = await updatePlayerBalance(targetId, bankAmount.toString());
    if (!receiverUpdate.success) {
      await updatePlayerBalance(senderId, bankAmount.toString());
      const result = {
        success: false,
        message: "Không thể cộng số dư người nhận; tiền đã được hoàn lại cho bạn.",
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
      return;
    }

    // Tính toán số dư mới
    const newSenderBalance = senderBalance.minus(bankAmount);
    const newReceiverBalance = receiverBalance.plus(bankAmount);

    const createdAt = new Date();
    const referenceCode = `TX${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const senderName = message.data.dName || senderId;
    const transferData = {
      referenceCode,
      amount: bankAmount.toString(),
      createdAt,
      sender: {
        id: senderId,
        name: senderName,
        balanceBefore: senderBalance.toString(),
        balanceAfter: newSenderBalance.toString(),
        avatar: null,
        rankPoints: Number((await getPlayerInfo(senderId))?.rankPoints || 0),
      },
      receiver: {
        id: targetId,
        name: targetName,
        balanceBefore: receiverBalance.toString(),
        balanceAfter: newReceiverBalance.toString(),
        avatar: null,
        rankPoints: Number((await getPlayerInfo(targetId))?.rankPoints || 0),
      },
    };

    await recordGameTransfer({
      referenceCode,
      senderId,
      senderName,
      receiverId: targetId,
      receiverName: targetName,
      amount: bankAmount,
      senderBalanceBefore: senderBalance,
      senderBalanceAfter: newSenderBalance,
      receiverBalanceBefore: receiverBalance,
      receiverBalanceAfter: newReceiverBalance,
      botId: api.getBotId(),
      threadId,
      createdAt,
    });

    const [senderInfo, receiverInfo] = await Promise.all([
      getUserInfoAcrossBots(api, senderId).catch(() => null),
      getUserInfoAcrossBots(api, targetZaloId).catch(() => null),
    ]);
    transferData.sender.avatar = senderInfo?.avatarFull || senderInfo?.avatar || null;
    transferData.receiver.avatar = receiverInfo?.avatarFull || receiverInfo?.avatar || null;

    const result = {
      success: true,
      message: `@${senderName}`,
    };
    let imagePath = null;
    try {
      imagePath = await cv.createGameBankTransferImage(transferData);
      await api.sendMessage(
        {
          msg: result.message,
          mentions: [{ uid: senderId, pos: 0, len: senderName.length + 1 }],
          attachments: imagePath ? [imagePath] : [],
          quote: message,
          ttl: 300000,
          isUseProphylactic: true,
        },
        threadId,
        message.type
      );
    } catch (error) {
      console.error("Lỗi khi tạo ảnh chuyển tiền game:", error);
      await sendMessageFromSQL(api, message, result, true, 300000);
    } finally {
      await cv.clearImagePath(imagePath);
    }
  } else {
    const result = {
      success: false,
      message: `Không thể khởi tạo hồ sơ game cho ${targetName}.`,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
  }
}

export async function handleStatementCommand(api, message, groupSettings) {
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return;

  const senderId = message.data.uidFrom;
  let targetId = senderId;
  const mention = (message.data.mentions || [])[0];
  if (mention) {
    targetId = mention.uid;
    const targetName = (message.data.content || "")
      .substring(mention.pos, mention.pos + mention.len)
      .replace("@", "");
    const targetAccount = await ensurePlayerAccount(targetId, targetName || targetId, api.getBotId(), api);
    if (targetAccount?.playerId) {
      targetId = targetAccount.playerId;
    }
  }

  const playerInfo = await getPlayerInfo(targetId);
  if (!playerInfo) {
    await sendMessageFromSQL(api, message, { success: false, message: "Không thể lấy hồ sơ game của người chơi." }, true, 30000);
    return;
  }
  if (!mention) {
    playerInfo.playerName = message.data.dName || playerInfo.playerName;
  }

  const history = await getGamePlayerHistory(targetId, 10, playerInfo.username);
  const transactions = history.map((record) => {
    const isWin = record.isWin === true;
    const isPush = record.isWin === null || String(record.netAmount) === "0";
    let gameTitle = record.gameName || "Trò chơi";
    if (record.choice) {
      gameTitle += ` • Cửa ${record.choice}`;
    }
    return {
      direction: isPush ? "push" : isWin ? "in" : "out",
      counterpartyName: gameTitle,
      amount: new Big(record.netAmount || record.amount || 0).abs().toString(),
      balanceAfter: record.balanceAfter,
      createdAt: record.createdAt,
      referenceCode: record.referenceCode || `${(record.gameKey || "GM").toUpperCase()}-${record._id?.toString()?.slice(-6) || "N/A"}`,
      detail: record.detail || "",
    };
  });

  const totalGames = Number(playerInfo.totalGames || 0);
  const totalWinGames = Number(playerInfo.totalWinGames || 0);
  const totalLossGames = Math.max(0, totalGames - totalWinGames);
  const winRate = totalGames > 0 ? ((totalWinGames / totalGames) * 100).toFixed(1).replace(/\.0$/, "") : (playerInfo.winRate || "0");
  const netProfit = Number(playerInfo.netProfit || 0);

  let imagePath = null;
  try {
    imagePath = await cv.createGameStatementImage({
      playerName: playerInfo.playerName || targetId,
      balance: playerInfo.balance,
      rankPoints: Number(playerInfo.rankPoints || 0),
      totalGames,
      totalWinGames,
      totalLosses: Number(playerInfo.totalLosses || 0),
      totalWinnings: Number(playerInfo.totalWinnings || 0),
      winRate,
      netProfit,
      transactions,
    });
  } catch (err) {
    console.error("Lỗi tạo ảnh sao kê game:", err);
  }

  if (imagePath) {
    try {
      await api.sendMessage(
        { msg: "", attachments: [imagePath], ttl: 300000, isUseProphylactic: true },
        message.threadId,
        message.type
      );
    } finally {
      await cv.clearImagePath(imagePath);
    }
  } else {
    let msg = `🧾 SAO KÊ THẮNG THUA: ${playerInfo.playerName}\n`;
    msg += `💰 Số dư: ${formatCurrency(playerInfo.balance)} VNĐ\n`;
    msg += `🎮 Tổng ván: ${totalGames} | Thắng: ${totalWinGames} | Thua: ${totalLossGames}\n`;
    msg += `📊 Tỉ lệ thắng: ${winRate}%\n`;
    msg += `🏆 Tổng thắng: +${formatCurrency(playerInfo.totalWinnings || 0)} VNĐ\n`;
    msg += `💸 Tổng thua: -${formatCurrency(playerInfo.totalLosses || 0)} VNĐ\n`;
    msg += `💹 Lợi nhuận ròng: ${netProfit >= 0 ? "+" : ""}${formatCurrency(netProfit)} VNĐ\n`;
    if (transactions.length > 0) {
      msg += `\n📜 10 ván đấu gần nhất:\n`;
      transactions.forEach((tx, idx) => {
        const sign = tx.direction === "in" ? "+" : tx.direction === "out" ? "-" : "±";
        const tag = tx.direction === "in" ? "THẮNG" : tx.direction === "out" ? "THUA" : "HÒA";
        msg += `${idx + 1}. [${tag}] ${tx.counterpartyName}: ${sign}${formatCurrency(tx.amount)} VNĐ\n`;
      });
    } else {
      msg += `\nChưa có lịch sử ván đấu được ghi nhận gần đây.`;
    }
    await sendMessageFromSQL(api, message, { success: true, message: msg }, true, 300000);
  }
}

export async function handleBanCommand(api, message, groupSettings) {
  const senderId = message.data.uidFrom;
  const threadId = message.threadId;

  if (!isAdmin(api.getBotId(), senderId, threadId)) {
    const result = {
      success: false,
      message: `Bạn không có quyền sử dụng lệnh này.`,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
    return;
  }

  const mentions = message.data.mentions;
  if (!mentions || mentions.length === 0) {
    const result = {
      success: false,
      message: `Vui lòng đề cập (@mention) người dùng cần ban.`,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
    return;
  }

  for (const mention of mentions) {
    const targetId = mention.uid;
    const targetName = message.data.content.substring(mention.pos, mention.pos + mention.len).replace("@", "");

    if (isAdmin(api.getBotId(), targetId, threadId)) {
      const result = {
        success: false,
        message: `${targetName} là quản trị viên, không thể khóa tài khoản được.`,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
      return;
    }

    if (await isHaveLoginAccount(targetId)) {
      if (await isPlayerBanned(targetId)) {
        const result = {
          success: false,
          message: `${targetName} đã bị khóa tài khoản.`,
        };
        await sendMessageFromSQL(api, message, result, true, 300000);
        return;
      } else {
        await banPlayer(targetId);
        const result = {
          success: true,
          message: `Đã khóa tài khoản của ${targetName} khỏi hệ thống game.`,
        };
        await sendMessageFromSQL(api, message, result, true, 300000);
      }
    } else {
      const result = {
        success: false,
        message: `${targetName} chưa có dữ liệu game.`,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
      return;
    }
  }
}

export async function handleUnbanCommand(api, message, groupSettings) {
  const senderId = message.data.uidFrom;
  const threadId = message.threadId;

  if (!isAdmin(api.getBotId(), senderId, threadId)) {
    const result = {
      success: false,
      message: `Bạn không có quyền sử dụng lệnh này.`,
    };
    await sendMessageFromSQL(api, message, result);
    return;
  }

  const mentions = message.data.mentions;
  if (!mentions || mentions.length === 0) {
    const result = {
      success: false,
      message: `Vui lòng đề cập (@mention) người dùng cần mở khóa tài khoản.`,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
    return;
  }

  for (const mention of mentions) {
    const targetId = mention.uid;
    const targetName = message.data.content.substring(mention.pos, mention.pos + mention.len).replace("@", "");

    if (await isHaveLoginAccount(targetId)) {
      if (await isPlayerBanned(targetId)) {
        await unbanPlayer(targetId);
        const result = {
          success: true,
          message: `Đã unban ${targetName}, người chơi có thể tham gia lại các trò chơi.`,
        };
        await sendMessageFromSQL(api, message, result, true, 300000);
      } else {
        const result = {
          success: false,
          message: `${targetName} không bị khóa tài khoản.`,
        };
        await sendMessageFromSQL(api, message, result, true, 300000);
      }
    } else {
      const result = {
        success: false,
        message: `${targetName} chưa có dữ liệu game.`,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
    }
  }
}

export async function checkPlayerBanned(api, message, threadId, senderId) {
  if (await isPlayerBanned(senderId)) {
    const result = {
      success: false,
      message: `Tài khoản của bạn đã bị khóa, không thể thực hiện bất kỳ lệnh game nào nữa!`,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
    return true;
  }
  return false;
}

export async function checkPlayerLogin(api, message, threadId, senderId) {
  const senderName = message.data.dName || senderId;
  const result = await ensurePlayerAccount(senderId, senderName, api.getBotId(), api);
  if (!result.success) {
    const errorResult = {
      success: false,
      message: `Đã xảy ra lỗi khi khởi tạo tài khoản game của bạn, vui lòng thử lại.`,
    };
    await sendMessageFromSQL(api, message, errorResult, true, 300000);
    return false;
  }
  if (result.playerId && result.playerId !== senderId) {
    message.data.gameUid = senderId;
    message.data.uidFrom = result.playerId;
  }
  return true;
}

// Đã bỏ hoàn toàn hệ thống đăng ký/đăng nhập/đăng xuất tài khoản game bằng username+password.
// Tài khoản game được tự động tạo và liên kết theo UID Zalo ngay khi chơi lệnh game đầu tiên
// (xem hàm ensurePlayerAccount trong database/player.js và checkPlayerLogin ở trên).

// Hàm xử lý lệnh nạp tiền
export async function handleNapCommand(api, message, groupSettings) {
  try {
    if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return;

    const senderId = message.data.uidFrom;
    const content = removeMention(message);
    const parts = content.split(" ");

    if (parts.length !== 2) {
      const result = {
        success: false,
        message: `Vui lòng sử dụng lệnh đúng cú pháp:\n!nap [Số Tiền/10%/100k/1m/1b]`,
      };
      await sendMessageFromSQL(api, message, result, true, 30000);
      return;
    }

    // Lấy thông tin người chơi từ bảng player_zalo
    const playerInfo = await getPlayerInfo(senderId);
    if (!playerInfo) {
      const result = {
        success: false,
        message: `Không tìm thấy thông tin tài khoản.`,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
      return;
    }

    // Lấy số dư VND từ bảng account
    const accountVND = await getAccountVND(playerInfo.username);
    if (accountVND === null) {
      const result = {
        success: false,
        message: `Không thể lấy thông tin số dư VND từ tài khoản game ${playerInfo.username}.`,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
      return;
    }

    const accountBalance = new Big(accountVND);

    // Parse số tiền sau khi đã có accountBalance
    let napAmount;
    try {
      const parsedAmount = parseGameAmount(parts[1], accountBalance);
      if (parsedAmount === "allin") {
        napAmount = accountBalance;
      } else {
        napAmount = parsedAmount;
      }

      if (napAmount.lt(20000)) {
        const result = {
          success: false,
          message: `Số tiền nạp tối thiểu là 20,000 VNĐ.`,
        };
        await sendMessageFromSQL(api, message, result, true, 300000);
        return;
      }
    } catch (error) {
      const result = {
        success: false,
        message: error.message,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
      return;
    }

    if (accountBalance.lt(napAmount)) {
      const result = {
        success: false,
        message: `Số dư VND trong tài khoản ${playerInfo.username} chỉ có ${formatBigNumber(accountBalance)} VNĐ.`,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
      return;
    }

    const oldAccountBalance = accountBalance;
    const oldBotBalance = new Big(playerInfo.balance);

    // Cập nhật số dư trong game
    const gameAmount = napAmount;
    await updatePlayerBalance(senderId, gameAmount.toNumber());
    // Cập nhật số dư VND trong account
    await updateAccountVND(playerInfo.username, napAmount.neg().toNumber());

    const oldTier = cv.getGameTier(playerInfo.rankPoints || 0);
    const newTotalDeposited = new Big(playerInfo.rankPoints || 0).plus(napAmount);
    const newTier = cv.getGameTier(newTotalDeposited.toString());
    await connection.collection(NAME_TABLE_PLAYERS).updateOne(
      { idUserZalo: String(senderId) },
      { $set: {
        rankPoints: Number(newTotalDeposited.toString()),
        vipExpireAt: null,
        ...(oldTier.key !== newTier.key ? { lastDailyReward: null } : {}),
      } }
    );
    const tierNotice = oldTier.key === newTier.key ? "" : `\n\n🎉 Lên hạng: ${oldTier.name} → ${newTier.name}`;

    const newAccountBalance = oldAccountBalance.minus(napAmount);
    const newBotBalance = oldBotBalance.plus(gameAmount);

    const result = {
      success: true,
      message:
        `🔄 Giao dịch nạp tiền thành công!\n\n` +
        `💰 Số tiền nạp: ${formatBigNumber(napAmount)} VNĐ\n\n` +
        `📊 Biến động số dư:\n` +
        `🎮 Tài khoản ${playerInfo.username}:\n` +
        `- Trước: ${formatBigNumber(oldAccountBalance)} VNĐ\n` +
        `- Sau: ${formatBigNumber(newAccountBalance)} VNĐ\n\n` +
        `🤖 Tài khoản Bot Zalo:\n` +
        `- Trước: ${formatBigNumber(oldBotBalance)} VNĐ\n` +
        `- Sau: ${formatBigNumber(newBotBalance)} VNĐ\n\n` +
        `🏅 Tổng đã nạp: ${formatBigNumber(newTotalDeposited)} VNĐ${tierNotice}`,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh nạp:", error);
    const result = {
      success: false,
      message: `Đã xảy ra lỗi khi xử lý lệnh nạp!`,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
  }
}

// Hàm xử lý lệnh rút tiền
export async function handleRutCommand(api, message, groupSettings) {
  try {
    if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return;

    const senderId = message.data.uidFrom;
    const content = removeMention(message);
    const parts = content.split(" ");

    if (parts.length !== 2) {
      const result = {
        success: false,
        message: `Vui lòng sử dụng lệnh đúng cú pháp:\n!rut [Số Tiền/10%/100k/1m/1b]`,
      };
      await sendMessageFromSQL(api, message, result, true, 30000);
      return;
    }

    // Lấy thông tin người chơi từ bảng player_zalo trước
    const playerInfo = await getPlayerInfo(senderId);
    if (!playerInfo) {
      const result = {
        success: false,
        message: `Không tìm thấy thông tin tài khoản.`,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
      return;
    }

    // Lấy số dư hiện tại
    const currentBotBalance = new Big(playerInfo.balance);
    const accountVND = await getAccountVND(playerInfo.username);
    const currentAccountBalance = new Big(accountVND);

    // Parse số tiền sau khi đã có currentBotBalance
    let rutAmount;
    try {
      const parsedAmount = parseGameAmount(parts[1], currentBotBalance);
      if (parsedAmount === "allin") {
        rutAmount = currentBotBalance;
      } else {
        rutAmount = parsedAmount;
      }

      if (rutAmount.lt(20000)) {
        const result = {
          success: false,
          message: `Số tiền rút tối thiểu là 20,000 VNĐ.`,
        };
        await sendMessageFromSQL(api, message, result, true, 300000);
        return;
      }
    } catch (error) {
      const result = {
        success: false,
        message: error.message,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
      return;
    }

    // Kiểm tra số dư
    if (currentBotBalance.lt(rutAmount)) {
      const result = {
        success: false,
        message: `Số dư trong tài khoản bot không đủ để rút ${formatBigNumber(rutAmount)} VNĐ về tài khoản ${
          playerInfo.username
        }!`,
      };
      await sendMessageFromSQL(api, message, result, true, 300000);
      return;
    }

    // Cập nhật số dư trong game
    await updatePlayerBalance(senderId, rutAmount.neg().toNumber());
    // Cập nhật số dư VND trong account
    await updateAccountVND(playerInfo.username, rutAmount.toNumber());

    const newBotBalance = currentBotBalance.minus(rutAmount);
    const newAccountBalance = currentAccountBalance.plus(rutAmount);

    const result = {
      success: true,
      message:
        `🔄 Giao dịch rút tiền thành công!\n\n` +
        `💰 Số tiền rút: ${formatBigNumber(rutAmount)} VNĐ\n\n` +
        `📊 Biến động số dư:\n` +
        `🤖 Tài khoản Bot Zalo:\n` +
        `- Trước: ${formatBigNumber(currentBotBalance)} VNĐ\n` +
        `- Sau: ${formatBigNumber(newBotBalance)} VNĐ\n\n` +
        `🎮 Tài khoản ${playerInfo.username}:\n` +
        `- Trước: ${formatBigNumber(currentAccountBalance)} VNĐ\n` +
        `- Sau: ${formatBigNumber(newAccountBalance)} VNĐ`,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh rút:", error);
    const result = {
      success: false,
      message: `Đã xảy ra lỗi khi xử lý lệnh rút!`,
    };
    await sendMessageFromSQL(api, message, result, true, 300000);
  }
}


export async function handleDonateCommand(api, message, groupSettings) {
  try {
    const content = removeMention(message).trim().split(/\s+/).filter(Boolean);
    const action = String(content[1] || "").toLowerCase();
    if (action === "add" || action === "cong") {
      await handleManualDonateAdd(api, message, content[2]);
      return;
    }

    if (["remove", "xoa", "del", "delete", "reset", "tru", "sub", "clear", "xoatier"].includes(action)) {
      await handleManualDonateRemove(api, message, content[2]);
      return;
    }

    const removeIdx = content.findIndex((t, idx) => idx > 0 && ["remove", "xoa", "del", "delete", "reset", "tru", "sub", "clear", "xoatier"].includes(t.toLowerCase()));
    if (removeIdx !== -1) {
      const remainingTokens = content.filter((_, idx) => idx !== 0 && idx !== removeIdx);
      await handleManualDonateRemove(api, message, remainingTokens[0]);
      return;
    }

    // Direct amount with mention: e.g. game donate 100k @user or game donate @user 100k
    const mention = message.data.mentions?.[0];
    if (mention) {
      const amountToken = content.slice(1).find((t) => {
        try {
          const p = parseGameAmount(t, 0);
          return p !== 0 && p !== "allin";
        } catch {
          return false;
        }
      });
      if (amountToken) {
        await handleManualDonateAdd(api, message, amountToken);
        return;
      }
    }

    const senderId = message.data.uidFrom;
    const accountResult = await ensurePlayerAccount(
      senderId,
      message.data.dName || senderId,
      api.getBotId()
    );
    if (!accountResult.success) {
      await sendMessageFromSQL(
        api,
        message,
        { success: false, message: "Không thể khởi tạo hồ sơ game để nhận hạng donate. Vui lòng thử lại." },
        true,
        30000
      );
      return;
    }

    const { createDonateQR } = await import("../../utils/canvas/game-donate-qr.js");
    const donationCode = createShortDonationCode();
    await connection.collection("donation_codes").insertOne({ code: donationCode, type: "game", botId: String(api.getBotId()), uid: String(senderId), createdAt: new Date() });
    const qrPath = await createDonateQR(senderId, { transferContent: donationCode });
    if (api && api.addReaction) await api.addReaction("LIKE", message);

    const donateTiers = getGameTiers()
      .filter((tier) => tier.key !== "silver")
      .map((tier) => `• ${formatCurrency(tier.min)}đ — ${tier.name}`)
      .join("\n");
    const caption =
      `⚜️ Thu Hoa Bot Team ⚜️\n` +
      `🤖 Bot vận hành miễn phí cho mọi người, nhưng mỗi tháng vẫn tốn chi phí thuê VPS, Host Upload và AI Assistant.\n` +
      `💝 Nếu thấy bot hữu ích và muốn góp một tay, bạn có thể ủng hộ bằng cách quét mã QR trong ảnh.\n` +
      `🎖️ Tổng tiền nạp được cộng dồn để mở hạng thành viên vĩnh viễn:\n` +
      `${donateTiers}\n` +
      `🤖 Hệ thống tự nhận chuyển khoản và nâng hạng trong ít phút.\n` +
      `📝 Giữ nguyên nội dung chuyển khoản in trong ảnh để hệ thống nhận đúng người.\n` +
      `🙏 Cảm ơn bạn đã ủng hộ và đồng hành cùng bot.`;

    await sendMessageCompleteRequest(
      api,
      message,
      {
        caption: caption,
        imagePath: qrPath,
      },
      86400000
    );

    await fs.promises.unlink(qrPath).catch(() => {});
  } catch (error) {
    console.error("Lỗi khi xử lý lệnh donate:", error);
  }
}

/** Cộng donate thủ công sau khi Bot Leader đã đối soát giao dịch bên ngoài. */
async function handleManualDonateAdd(api, message, rawAmount) {
  const prefix = getGlobalPrefix(api.getBotId());
  const senderId = message.data.uidFrom;
  const isHighAdmin = (await isUserBotLeader(api, senderId, message.data?.dName)) || isAdmin(api.getBotId(), senderId) || isBotLeader(api.getBotId(), senderId);
  if (!isHighAdmin) {
    await sendMessageFromSQL(api, message, {
      success: false,
      message: "Chỉ quản trị viên cấp cao mới có quyền cộng donate thủ công.",
    }, true, 30000);
    return;
  }

  const mention = message.data.mentions?.[0];
  const contentTokens = removeMention(message).trim().split(/\s+/).filter(Boolean);
  if (!rawAmount) {
    rawAmount = contentTokens.slice(1).find((t) => {
      try {
        const p = parseGameAmount(t, 0);
        return p !== 0 && p !== "allin";
      } catch {
        return false;
      }
    });
  }

  let targetUid = mention?.uid;
  if (!targetUid) {
    const foundUid = contentTokens.find((token) => /^\d{10,25}$/.test(token));
    if (foundUid) targetUid = foundUid;
  }

  if (!targetUid || !rawAmount) {
    await sendMessageFromSQL(api, message, {
      success: false,
      message: `Dùng: ${prefix}game donate add <số tiền> @người_dùng\nVí dụ: ${prefix}game donate add 100k @hung`,
    }, true, 30000);
    return;
  }

  let amount;
  try {
    const parsed = parseGameAmount(rawAmount, 0);
    if (parsed === "allin") throw new Error("Không dùng được all");
    amount = new Big(parsed).round(0, Big.roundDown);
    if (amount.lte(0) || amount.gt(Number.MAX_SAFE_INTEGER)) throw new Error("Ngoài phạm vi cho phép");
  } catch {
    await sendMessageFromSQL(api, message, {
      success: false,
      message: "Số tiền không hợp lệ. Ví dụ hợp lệ: 100k, 100000 hoặc 1m.",
    }, true, 30000);
    return;
  }

  const rawContent = String(message.data.content?.title || message.data.content || "");
  const targetName = String(mention?.dName || mention?.name || (mention ? rawContent.substring(mention.pos, mention.pos + mention.len) : "") || targetUid)
    .replace(/^@/, "")
    .trim();
  const account = await ensurePlayerAccount(targetUid, targetName || targetUid, api.getBotId(), api);
  if (!account?.success) {
    await sendMessageFromSQL(api, message, { success: false, message: "Không thể khởi tạo hồ sơ game của người được chỉ định." }, true, 30000);
    return;
  }

  const targetId = String(account.playerId || targetUid);
  const playerCollection = connection.collection(NAME_TABLE_PLAYERS);
  const player = await playerCollection.findOne({ idUserZalo: targetId });
  if (!player) {
    await sendMessageFromSQL(api, message, { success: false, message: "Không tìm thấy hồ sơ game của người được tag." }, true, 30000);
    return;
  }

  const oldRankPoints = Number(player.rankPoints || 0);
  const donatedAmount = Number(amount.toString());
  const newRankPoints = oldRankPoints + donatedAmount;
  const oldTier = getGameTier(oldRankPoints);
  const newTier = getGameTier(newRankPoints);
  const update = await playerCollection.updateOne(
    { _id: player._id, rankPoints: player.rankPoints },
    { $set: {
      rankPoints: newRankPoints,
      vipExpireAt: null,
      ...(oldTier.key !== newTier.key ? { lastDailyReward: null } : {}),
    } }
  );
  if (update.modifiedCount !== 1) {
    await sendMessageFromSQL(api, message, { success: false, message: "Hạng vừa thay đổi, vui lòng chạy lại lệnh." }, true, 30000);
    return;
  }

  await connection.collection("game_donate_manual_logs").insertOne({
    targetId,
    targetName: targetName || targetId,
    amount: donatedAmount,
    oldRankPoints,
    newRankPoints,
    actorId: String(senderId),
    actorName: String(message.data.dName || senderId),
    createdAt: new Date(),
  }).catch((error) => console.error("Không thể lưu nhật ký donate cộng tay:", error));

  const tierChange = oldTier.key === newTier.key ? `Hạng hiện tại: ${newTier.name}` : `Đã lên hạng: ${oldTier.name} → ${newTier.name}`;
  await sendMessageFromSQL(api, message, {
    success: true,
    message: `✅ Đã cộng donate ${formatCurrency(donatedAmount)} VNĐ cho ${targetName || targetId}.\nTổng donate: ${formatCurrency(newRankPoints)} VNĐ\n${tierChange} 🏆`,
  }, true, 30000);
}

/** Xoá toàn bộ tier hoặc trừ điểm donate thủ công sau khi Bot Leader hoặc quản trị cấp cao kiểm tra. */
export async function handleManualDonateRemove(api, message, rawAmount) {
  const prefix = getGlobalPrefix(api.getBotId());
  const senderId = message.data.uidFrom;
  const isHighAdmin = (await isUserBotLeader(api, senderId, message.data?.dName)) || isAdmin(api.getBotId(), senderId) || isBotLeader(api.getBotId(), senderId);
  if (!isHighAdmin) {
    await sendMessageFromSQL(api, message, {
      success: false,
      message: "Chỉ quản trị viên cấp cao mới có quyền xoá hoặc hạ tier donate.",
    }, true, 30000);
    return;
  }

  const mention = message.data.mentions?.[0];
  const contentTokens = removeMention(message).trim().split(/\s+/).filter(Boolean);

  let targetUid = mention?.uid;
  if (!targetUid) {
    const foundUid = contentTokens.find((token) => /^\d{10,25}$/.test(token));
    if (foundUid) targetUid = foundUid;
  }

  if (!targetUid) {
    await sendMessageFromSQL(api, message, {
      success: false,
      message: `Dùng:\n• Xoá toàn bộ tier: ${prefix}game donate xoa @người_dùng (hoặc ${prefix}game xoatier @người_dùng)\n• Trừ bớt điểm donate: ${prefix}game donate xoa <số tiền> @người_dùng (ví dụ: ${prefix}game donate xoa 100k @hung)`,
    }, true, 30000);
    return;
  }

  let amountToDeduct = null;
  const potentialAmount = rawAmount || contentTokens.find((t) => {
    const lower = t.toLowerCase();
    return !["donate", "tier", "xoatier", "xoa-tier", "resettier", "reset-tier", "xoa", "remove", "del", "delete", "reset", "tru", "sub", "clear", String(targetUid)].includes(lower)
      && !/^\d{10,25}$/.test(t);
  });

  if (potentialAmount) {
    try {
      const parsed = parseGameAmount(potentialAmount, 0);
      if (parsed === "allin" || parsed === "all") {
        amountToDeduct = null;
      } else {
        const bigAmt = new Big(parsed).round(0, Big.roundDown);
        if (bigAmt.gt(0) && bigAmt.lte(Number.MAX_SAFE_INTEGER)) {
          amountToDeduct = Number(bigAmt.toString());
        }
      }
    } catch {}
  }

  const rawContent = String(message.data.content?.title || message.data.content || "");
  const targetName = mention
    ? String(mention.dName || mention.name || rawContent.substring(mention.pos, mention.pos + mention.len) || mention.uid)
        .replace(/^@/, "")
        .trim()
    : targetUid;

  const account = await ensurePlayerAccount(targetUid, targetName || targetUid, api.getBotId(), api);
  if (!account?.success) {
    await sendMessageFromSQL(api, message, { success: false, message: "Không thể khởi tạo hồ sơ game của người chơi." }, true, 30000);
    return;
  }

  const targetId = String(account.playerId || targetUid);
  const playerCollection = connection.collection(NAME_TABLE_PLAYERS);
  const player = await playerCollection.findOne({ idUserZalo: targetId });
  if (!player) {
    await sendMessageFromSQL(api, message, { success: false, message: "Không tìm thấy hồ sơ game của người này." }, true, 30000);
    return;
  }

  const oldRankPoints = Number(player.rankPoints || 0);
  if (oldRankPoints <= 0) {
    await sendMessageFromSQL(api, message, {
      success: false,
      message: `Người chơi ${targetName || targetId} hiện tại chưa có điểm tier (đang ở hạng mặc định Bạc, 0 VNĐ).`,
    }, true, 30000);
    return;
  }

  let newRankPoints = 0;
  let deductedPoints = oldRankPoints;
  if (amountToDeduct !== null && amountToDeduct > 0) {
    deductedPoints = Math.min(oldRankPoints, amountToDeduct);
    newRankPoints = Math.max(0, oldRankPoints - amountToDeduct);
  }

  const oldTier = getGameTier(oldRankPoints);
  const newTier = getGameTier(newRankPoints);

  const update = await playerCollection.updateOne(
    { _id: player._id, rankPoints: player.rankPoints },
    { $set: { rankPoints: newRankPoints, vipExpireAt: null } }
  );

  if (update.modifiedCount !== 1) {
    await sendMessageFromSQL(api, message, { success: false, message: "Điểm hạng vừa thay đổi, vui lòng chạy lại lệnh." }, true, 30000);
    return;
  }

  await connection.collection("game_donate_manual_logs").insertOne({
    targetId,
    targetName: targetName || targetId,
    amount: -deductedPoints,
    action: newRankPoints === 0 ? "remove_tier" : "deduct_tier",
    oldRankPoints,
    newRankPoints,
    actorId: String(senderId),
    actorName: String(message.data.dName || senderId),
    createdAt: new Date(),
  }).catch((error) => console.error("Không thể lưu nhật ký xoá tier:", error));

  const tierChange = oldTier.key === newTier.key
    ? `Hạng hiện tại: ${newTier.name}`
    : `Đã hạ hạng: ${oldTier.name} → ${newTier.name}`;

  if (newRankPoints === 0) {
    await sendMessageFromSQL(api, message, {
      success: true,
      message: `🗑️ Đã xoá toàn bộ tier của ${targetName || targetId}!\n• Điểm tier cũ: ${formatCurrency(oldRankPoints)} VNĐ (${oldTier.name})\n• Điểm tier mới: 0 VNĐ (${newTier.name})\n• ${tierChange} 🏆`,
    }, true, 30000);
  } else {
    await sendMessageFromSQL(api, message, {
      success: true,
      message: `🗑️ Đã trừ ${formatCurrency(deductedPoints)} VNĐ điểm donate của ${targetName || targetId}!\n• Điểm donate cũ: ${formatCurrency(oldRankPoints)} VNĐ\n• Điểm donate còn lại: ${formatCurrency(newRankPoints)} VNĐ\n• ${tierChange} 🏆`,
    }, true, 30000);
  }
}

export async function processDonatePayment(uid, payRef, receivedAmount, sourceBotId = "") {
  try {
    const { getGlobalApi } = await import("../../index.js");
    const api = getGlobalApi();
    if (!api) throw new Error("Bot chính chưa sẵn sàng để xử lý donate");

    const normalizedUid = String(uid || "").trim();
    const amount = Number(receivedAmount);
    if (!/^\d+$/.test(normalizedUid)) throw new Error("UID donate không hợp lệ");
    if (!Number.isFinite(amount) || amount < 1000) throw new Error("Số tiền donate không hợp lệ");

    const accountResult = await ensurePlayerAccount(normalizedUid, null, api.getBotId(), api);
    if (!accountResult.success) throw new Error("Không thể khởi tạo hồ sơ game cho người donate");

    const { getGameTier } = await import("../../utils/canvas/game-finance.js");
    const playerCollection = connection.collection(NAME_TABLE_PLAYERS);
    const player = await playerCollection.findOne({ idUserZalo: normalizedUid });
    if (!player) throw new Error("Không tìm thấy hồ sơ game sau khi khởi tạo");

    const currentRankPoints = Number(player.rankPoints || 0);
    const oldTier = getGameTier(currentRankPoints);
    const newRankPoints = currentRankPoints + amount;
    const tier = getGameTier(newRankPoints);

    const updateResult = await playerCollection.updateOne(
      { _id: player._id },
      { $set: {
        rankPoints: newRankPoints,
        vipExpireAt: null,
        ...(oldTier.key !== tier.key ? { lastDailyReward: null } : {}),
      } }
    );
    if (updateResult.matchedCount !== 1) throw new Error("Không thể cập nhật hạng donate");

    try {
      await api.sendMessage(
        {
          msg: `🎉 CẢM ƠN BẠN ĐÃ DONATE ${formatCurrency(amount)} VNĐ! 🎉\n\n` +
               `Tổng tiền đã nạp: ${formatCurrency(newRankPoints)} VNĐ\n` +
               (oldTier.key === tier.key ? `Hạng hiện tại: ${tier.name} 🏆\n` : `Chúc mừng lên hạng: ${oldTier.name} → ${tier.name} 🏆\n`) +
               `Hạng được giữ vĩnh viễn và chỉ tăng theo tổng tiền nạp.\n` +
               `Hãy dùng lệnh !daily mỗi ngày để nhận ${formatBigNumber(new Big(tier.daily))} VNĐ nhé!`
        },
        normalizedUid,
        1
      );
    } catch (notifyError) {
      console.warn(`[Donate] Đã nâng hạng nhưng không thể báo cho ${normalizedUid}:`, notifyError?.message || notifyError);
    }

    const { getListAdminByIDBot } = await import("../../index.js");
    const admins = getListAdminByIDBot(api.getBotId()) || [];
    for (const adminId of admins) {
      try {
        await api.sendMessage(
          { msg: `🔔 [VIP DONATE] Người dùng ${normalizedUid} vừa donate ${formatCurrency(amount)} VNĐ và nhận hạng ${tier.name}!` },
          adminId,
          1
        );
      } catch (e) {}
    }

    return {
      success: true,
      message: `Nâng hạng VIP ${tier.name} thành công`,
      uid: normalizedUid,
      rankPoints: newRankPoints,
      vipExpireAt: null,
      payRef: String(payRef || ""),
    };
  } catch (error) {
    console.error("Lỗi khi xử lý donate webhook:", error);
    return { success: false, error: error.message };
  }
}


export async function handleSetTierCommand(api, message, groupSettings) {
  const senderId = message.data.uidFrom;
  
  const isLeader = await isUserBotLeader(api, senderId, message.data.dName);
  if (!isLeader) {
    await sendMessageFromSQL(api, message, { success: false, message: "Chỉ Bot Leader mới được set hạng." }, true, 30000);
    return;
  }

  const mentions = message.data.mentions || [];
  if (!mentions || mentions.length === 0) {
    await sendMessageFromSQL(api, message, { success: false, message: "Vui lòng tag người muốn set hạng. Ví dụ: !settier @Name mỹ nhân" }, true, 30000);
    return;
  }

  let targetId = mentions[0].uid;
  const targetAccount = await ensurePlayerAccount(targetId, message.data.dName || targetId, api.getBotId(), api);
  if (targetAccount?.playerId) {
    targetId = targetAccount.playerId;
  }

  let rankPoints = 0;
  const txt = removeMention(message).toLowerCase();
  const matchedTier = getGameTierByName(txt);
  if (!matchedTier) {
    const supported = getGameTiers().filter(t => t.key !== "silver").map((t) => t.name.toLowerCase()).join(", ");
    await sendMessageFromSQL(api, message, { success: false, message: `Hạng không hợp lệ. Hỗ trợ: ${supported}.` }, true, 30000);
    return;
  }
  rankPoints = Number(matchedTier.min);

  const playerCollection = connection.collection(NAME_TABLE_PLAYERS);
  const currentPlayer = await playerCollection.findOne({ idUserZalo: String(targetId) });
  const oldTier = getGameTier(currentPlayer?.rankPoints || 0);
  await playerCollection.updateOne(
    { idUserZalo: String(targetId) },
    { $set: {
      rankPoints,
      vipExpireAt: null,
      ...(oldTier.key !== matchedTier.key ? { lastDailyReward: null } : {}),
    } }
  );

  const { getGameTier } = await import("../../utils/canvas/game-finance.js");
  const tier = getGameTier(rankPoints);

  await sendMessageFromSQL(api, message, { success: true, message: `✅ Đã set hạng ${tier.name} thành công cho người chơi!` }, true, 30000);
}

export { handleXoSoNhanhCommand, initializeGameXoSoNhanh } from "./xoso-nhanh/xoso-nhanh.js";
