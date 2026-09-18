import { connection, NAME_TABLE_PLAYERS, nameServer, NAME_TABLE_ACCOUNT, DAILY_REWARD } from "./state.js";
import { getUserInfoAcrossBots } from "../service-ngh/info-service/user-info.js";
import { getTimeToString, getTimeNow, formatBigNumber } from "../utils/format-util.js";
import { getGameTier, getGameTiers } from "../utils/canvas/game-finance.js";
import { Big } from "big.js";
import crypto from "node:crypto";
import { getCurrentPrivateGameServer, getPrivateGameBotIds } from "../service-ngh/game-service/private-game-server.js";
import { applyGameRewardPolicy } from "../service-ngh/game-service/game-reward-policy.js";
import { addToLuckyEnvelopeFund } from "../service-ngh/game-service/game-auto-rewards.js";

// UID Zalo có thể khác nhau tùy bot. Cache alias giúp các hàm số dư (vốn là
// synchronous ở bước chuẩn hóa đầu vào) luôn dùng cùng một hồ sơ chính.
const playerAliasCache = new Map();
const WEEKLY_BENEFIT_RATIO = new Big("0.21");
const RESCUE_BALANCE_CEILING = new Big("10000");
const GOLD_RANK_POINTS = () => new Big(getGameTiers().find(tier => tier.key === "gold").min);
const DIAMOND_RANK_POINTS = () => new Big(getGameTiers().find(tier => tier.key === "diamond").min);
const FIVE_HOUR_COOLDOWN_MS = 5 * 60 * 60 * 1000;
const GAME_PRIVACY_COLLECTION = "player_game_privacy";

async function addPendingRefund(idUser, amount) {
  const addition = new Big(amount || 0).round(0, Big.roundDown);
  if (addition.lte(0) || !connection) return;
  const collection = connection.collection(NAME_TABLE_PLAYERS);
  for (let attempt = 0; attempt < 5; attempt++) {
    const player = await collection.findOne({ idUserZalo: canonicalPlayerId(idUser) });
    if (!player) return;
    const next = new Big(player.pendingRefund || 0).plus(addition).toString();
    const result = await collection.updateOne({ _id: player._id, pendingRefund: player.pendingRefund || null }, { $set: { pendingRefund: next } });
    if (result.modifiedCount === 1) return;
  }
}

export async function claimPendingRefund(idUser) {
  const normalizedId = canonicalPlayerId(idUser);
  const collection = connection.collection(NAME_TABLE_PLAYERS);
  for (let attempt = 0; attempt < 5; attempt++) {
    const player = await collection.findOne({ idUserZalo: normalizedId });
    if (!player) return { success: false, message: "Không tìm thấy người chơi." };
    const refund = new Big(player.pendingRefund || 0).round(0, Big.roundDown);
    if (refund.lte(0)) return { success: false, message: "Bạn chưa có tiền hoàn trả đang chờ nhận." };
    const balance = new Big(player.balance || 0).plus(refund).toString();
    const result = await collection.updateOne(
      { _id: player._id, balance: player.balance, pendingRefund: player.pendingRefund },
      { $set: { balance, pendingRefund: "0", lastRefundClaimAt: new Date() } }
    );
    if (result.modifiedCount === 1) return { success: true, amount: refund.toString(), balance };
  }
  return { success: false, message: "Số tiền vừa thay đổi, vui lòng thử lại." };
}

function getVietnamWeekKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).reduce((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  const localDate = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  // ISO week: Monday through Sunday.  This keeps a weekly limit stable even
  // when the server itself is running in a timezone other than Vietnam.
  const day = localDate.getUTCDay() || 7;
  localDate.setUTCDate(localDate.getUTCDate() + 4 - day);
  const isoYear = localDate.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const week = Math.ceil((((localDate - firstThursday) / 86400000) + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

function getWeeklyBenefitAmount(tier) {
  return new Big(tier.daily || DAILY_REWARD || 0).times(WEEKLY_BENEFIT_RATIO).round(0, Big.roundDown);
}

function formatRemainingCooldown(milliseconds) {
  const totalMinutes = Math.max(1, Math.ceil(milliseconds / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours} giờ${minutes ? ` ${minutes} phút` : ""}` : `${minutes} phút`;
}

function getTierIcon(tierKey) {
  return ({ silver: "🥈", gold: "🥇", platinum: "⚪", emerald: "💚", ruby: "♦️", diamond: "💎" })[tierKey] || "🏆";
}

function progressBar(percent, length = 20) {
  const filled = Math.max(0, Math.min(length, Math.round((Math.max(0, Math.min(100, percent)) / 100) * length)));
  return `[${"━".repeat(filled)}${"─".repeat(length - filled)}]`;
}
function canonicalPlayerId(id) {
  const normalized = String(id || "").replace(/_0$/u, "");
  const privateServer = getCurrentPrivateGameServer();
  if (privateServer?.serverId) {
    const prefix = `private:${privateServer.serverId}:`;
    if (normalized.startsWith(prefix)) return normalized;
    const scopedId = `${prefix}${normalized}`;
    return playerAliasCache.get(scopedId) || scopedId;
  }
  return playerAliasCache.get(normalized) || normalized;
}

function rememberPlayerAlias(alias, playerId) {
  const normalizedAlias = String(alias || "").replace(/_0$/u, "");
  const normalizedPlayer = String(playerId || "").replace(/_0$/u, "");
  if (normalizedAlias && normalizedPlayer) playerAliasCache.set(normalizedAlias, normalizedPlayer);
}

export async function getGamePrivacy(idUserZalo) {
  try {
    const playerId = canonicalPlayerId(idUserZalo);
    const value = await connection.collection(GAME_PRIVACY_COLLECTION).findOne({ playerId });
    return { hideProfile: value?.hideProfile === true, hideTier: value?.hideTier === true };
  } catch {
    return { hideProfile: false, hideTier: false };
  }
}

export async function setGamePrivacy(idUserZalo, changes = {}) {
  try {
    const playerId = canonicalPlayerId(idUserZalo);
    const allowed = {};
    if (typeof changes.hideProfile === "boolean") allowed.hideProfile = changes.hideProfile;
    if (typeof changes.hideTier === "boolean") allowed.hideTier = changes.hideTier;
    if (!Object.keys(allowed).length) return { success: false, message: "Thiết lập không hợp lệ." };
    await connection.collection(GAME_PRIVACY_COLLECTION).updateOne(
      { playerId },
      { $set: { ...allowed, updatedAt: new Date() } },
      { upsert: true }
    );
    return { success: true, data: { ...(await getGamePrivacy(playerId)), ...allowed } };
  } catch (error) {
    console.error("Lỗi cập nhật quyền riêng tư game:", error);
    return { success: false, message: "Không thể lưu thiết lập ẩn danh lúc này." };
  }
}

export async function preloadPlayerAliases() {
  try {
    const docs = await connection.collection("player_identity").find({ aliasId: { $exists: true }, playerId: { $exists: true } }).toArray();
    for (const doc of docs) {
      if (doc.aliasId && doc.playerId) {
        rememberPlayerAlias(doc.aliasId, doc.playerId);
      }
    }
  } catch (err) {
    console.error("Lỗi khi tải cache player aliases:", err);
  }
}

async function persistPlayerAlias(alias, playerId) {
  rememberPlayerAlias(alias, playerId);
  try {
    await connection.collection("player_identity").updateOne(
      { aliasId: String(alias) },
      { $set: { aliasId: String(alias), playerId: String(playerId), updatedAt: new Date() } },
      { upsert: true }
    );
  } catch {}
}

/**
 * Tự động tạo/đồng bộ tài khoản người chơi theo UID Zalo — không cần đăng ký/đăng nhập.
 * Nếu UID Zalo đã có bản ghi thì chỉ cập nhật lại tên hiển thị (nếu đổi tên).
 * Nếu chưa có thì tạo mới ngay với số dư mặc định của bảng (10.000).
 */
export async function ensurePlayerAccount(idUserZalo, senderName, botId, api = null) {
  try {
    const privateServer = getCurrentPrivateGameServer();
    const isPrivateServer = Boolean(privateServer?.serverId);
    const rawZaloId = String(idUserZalo || "").replace(/_0$/u, "");
    const originalZaloId = canonicalPlayerId(idUserZalo);
    idUserZalo = originalZaloId;
    let identityKey = null;
    let avatarUrl = null;
    let resolvedDisplayName = String(senderName || "").trim();
    let resolvedKey = null;

    // Kiểm tra nhanh trong DB: nếu đã có bản ghi theo originalZaloId hoặc rawZaloId thì không cần gọi mạng
    if (!isPrivateServer) {
      const [fastRows] = await connection.execute(
        `SELECT id, playerName, idUserZalo FROM ${NAME_TABLE_PLAYERS} WHERE idUserZalo = ? OR idUserZalo = ? OR username = ? OR username = ?`,
        [idUserZalo, rawZaloId, idUserZalo, rawZaloId]
      );
      if (fastRows.length > 0) {
        const found = fastRows[0];
        const currentName = String(found.playerName || "").trim();
        const shouldRefreshName = resolvedDisplayName &&
          (currentName !== resolvedDisplayName || currentName === String(found.idUserZalo));
        if (shouldRefreshName) {
          await connection.execute(`UPDATE ${NAME_TABLE_PLAYERS} SET playerName = ? WHERE idUserZalo = ?`, [
            resolvedDisplayName,
            found.idUserZalo,
          ]);
        }
        if (originalZaloId !== found.idUserZalo) {
          await persistPlayerAlias(originalZaloId, found.idUserZalo);
        }
        if (rawZaloId !== found.idUserZalo) {
          await persistPlayerAlias(rawZaloId, found.idUserZalo);
        }
        return { success: true, isNew: false, playerId: found.idUserZalo };
      }
    }

    if (api) {
      try {
        const info = await getUserInfoAcrossBots(api, rawZaloId);
        avatarUrl = info?.avatarFull || info?.avatar || null;
        if (!resolvedDisplayName) {
          resolvedDisplayName = String(info?.name || info?.displayName || info?.username || "").trim();
        }
        if (!isPrivateServer && info?.globalId) {
          resolvedKey = info.globalId;
          identityKey = "GLOBAL:" + info.globalId;
        } else if (info?.username && info.username !== "Ẩn") {
          resolvedKey = info.username;
          identityKey = "USERNAME:" + info.username;
        } else {
          const identity = [info?.name, info?.avatarFull || info?.avatar, info?.cover, info?.bio,
            info?.genderId, info?.birthday, info?.phone]
            .map((v) => String(v || "").trim().toLowerCase()).join("|");
          if (identity.replace(/\|/g, "")) {
            identityKey = crypto.createHash("sha256").update(identity).digest("hex");
          }
        }
      } catch {}
    }

    if (resolvedKey && !isPrivateServer) {
      idUserZalo = resolvedKey;
    }

    if (identityKey && !isPrivateServer) {
      const identityDoc = await connection.collection("player_identity").findOne({ identityKey });
      if (identityDoc?.playerId && identityDoc.playerId !== idUserZalo) {
        const [linked] = await connection.execute(`SELECT username FROM ${NAME_TABLE_PLAYERS} WHERE idUserZalo = ?`, [identityDoc.playerId]);
        if (linked.length) {
          await persistPlayerAlias(originalZaloId, identityDoc.playerId);
          await persistPlayerAlias(rawZaloId, identityDoc.playerId);
          return { success: true, isNew: false, playerId: identityDoc.playerId };
        }
      }
    }
    const [rows] = await connection.execute(
      `SELECT id, playerName FROM ${NAME_TABLE_PLAYERS} WHERE idUserZalo = ?`,
      [idUserZalo]
    );

    if (rows.length > 0) {
      const currentName = String(rows[0].playerName || "").trim();
      const shouldRefreshName = resolvedDisplayName &&
        (currentName !== resolvedDisplayName || currentName === String(idUserZalo));
      if (shouldRefreshName) {
        await connection.execute(`UPDATE ${NAME_TABLE_PLAYERS} SET playerName = ? WHERE idUserZalo = ?`, [
          resolvedDisplayName,
          idUserZalo,
        ]);
      }
      if (avatarUrl) await connection.execute(`UPDATE ${NAME_TABLE_PLAYERS} SET avatar = ? WHERE idUserZalo = ?`, [avatarUrl, idUserZalo]);
      if (identityKey && !isPrivateServer) await connection.collection("player_identity").updateOne({ identityKey }, { $set: { identityKey, playerId: idUserZalo, updatedAt: new Date() } }, { upsert: true });
      if (originalZaloId !== idUserZalo) {
        await persistPlayerAlias(originalZaloId, idUserZalo);
      }
      if (rawZaloId !== idUserZalo) {
        await persistPlayerAlias(rawZaloId, idUserZalo);
      }
      await persistPlayerAlias(idUserZalo, idUserZalo);
      return { success: true, isNew: false, playerId: idUserZalo };
    }

    try {
      await connection.execute(
        `INSERT INTO ${NAME_TABLE_PLAYERS} (username, idUserZalo, playerName, serverId, avatar, registrationTime) VALUES (?, ?, ?, ?, ?, NOW())`,
        [idUserZalo, idUserZalo, resolvedDisplayName || originalZaloId, botId, avatarUrl]
      );
    } catch (insertError) {
      const [existing] = await connection.execute(
        `SELECT id, playerName, idUserZalo FROM ${NAME_TABLE_PLAYERS} WHERE idUserZalo = ? OR username = ?`,
        [idUserZalo, idUserZalo]
      );
      if (existing.length > 0) {
        return { success: true, isNew: false, playerId: existing[0].idUserZalo };
      }
      throw insertError;
    }

    if (identityKey && !isPrivateServer) await connection.collection("player_identity").updateOne({ identityKey }, { $set: { identityKey, playerId: idUserZalo, updatedAt: new Date() } }, { upsert: true });
    if (originalZaloId !== idUserZalo) {
      await persistPlayerAlias(originalZaloId, idUserZalo);
    }
    if (rawZaloId !== idUserZalo) {
      await persistPlayerAlias(rawZaloId, idUserZalo);
    }
    await persistPlayerAlias(idUserZalo, idUserZalo);
    return { success: true, isNew: true, playerId: idUserZalo };
  } catch (error) {
    console.error("Lỗi khi tự động tạo tài khoản người chơi theo UID Zalo:", error);
    return { success: false };
  }
}

export async function isHaveLoginAccount(idUserZalo) {
  try {
    idUserZalo = canonicalPlayerId(idUserZalo);
    const [rows] = await connection.execute(
      `SELECT COUNT(*) as count FROM ${NAME_TABLE_PLAYERS} WHERE idUserZalo = ?`,
      [idUserZalo]
    );
    return rows[0].count > 0;
  } catch (error) {
    console.error("Lỗi khi kiểm tra trạng thái đăng nhập của người chơi:", error);
    throw error;
  }
}

export async function banPlayer(idUserZalo) {
  try {
    idUserZalo = canonicalPlayerId(idUserZalo);
    await connection.execute(`UPDATE ${NAME_TABLE_PLAYERS} SET isBanned = 1 WHERE idUserZalo = ?`, [idUserZalo]);
    return { success: true, message: `${nameServer}: Người chơi đã bị ban thành công!` };
  } catch (error) {
    console.error("Lỗi khi ban người chơi:", error);
    return { success: false, message: `${nameServer}: Đã xảy ra lỗi khi ban người chơi!` };
  }
}

export async function unbanPlayer(idUserZalo) {
  try {
    idUserZalo = canonicalPlayerId(idUserZalo);
    await connection.execute(`UPDATE ${NAME_TABLE_PLAYERS} SET isBanned = 0 WHERE idUserZalo = ?`, [idUserZalo]);
    return { success: true, message: `${nameServer}: Đã gỡ ban người chơi thành công!` };
  } catch (error) {
    console.error("Lỗi khi unban người chơi:", error);
    return { success: false, message: `${nameServer}: Đã xảy ra lỗi khi gỡ ban người chơi!` };
  }
}

export async function isPlayerBanned(idUserZalo) {
  try {
    idUserZalo = canonicalPlayerId(idUserZalo);
    const [rows] = await connection.execute(`SELECT isBanned FROM ${NAME_TABLE_PLAYERS} WHERE idUserZalo = ?`, [
      idUserZalo,
    ]);
    return rows.length > 0 && rows[0].isBanned === 1;
  } catch (error) {
    console.error("Lỗi khi kiểm tra trạng thái ban của người chơi:", error);
    throw error;
  }
}

export async function isPlayerActive(idUserZalo) {
  try {
    const [existingLoginRows] = await connection.execute(
      `SELECT username FROM ${NAME_TABLE_PLAYERS} WHERE idUserZalo = ?`,
      [idUserZalo]
    );

    if (existingLoginRows.length === 0) {
      return false;
    }

    const [rows] = await connection.execute(`SELECT active FROM ${NAME_TABLE_ACCOUNT} WHERE username = ?`, [
      existingLoginRows[0].username,
    ]);
    return rows.length > 0 && rows[0].active === 1;
  } catch (error) {
    console.error("Lỗi khi kiểm tra trạng thái kích hoạt của người chơi:", error);
    throw error;
  }
}

export async function claimDailyReward(idUser) {
  try {
    idUser = canonicalPlayerId(idUser);
    const [rows] = await connection.execute(`SELECT * FROM ${NAME_TABLE_PLAYERS} WHERE idUserZalo = ?`, [idUser]);

    if (rows.length === 0) {
      return { success: false, message: `Không thể khởi tạo hồ sơ game của bạn.` };
    }

    const player = rows[0];
    const now = getTimeNow();

    const lastReward = player.lastDailyReward ? new Date(player.lastDailyReward) : null;

    if (
      lastReward &&
      lastReward.getDate() === now.getDate() &&
      lastReward.getMonth() === now.getMonth() &&
      lastReward.getFullYear() === now.getFullYear()
    ) {
      const registrationTime = getTimeToString(lastReward);
      return {
        success: false,
        message: `Bạn đã nhận quà hôm nay lúc ${registrationTime}. Hãy quay lại vào ngày mai!`,
      };
    }

    const tierInfo = getGameTier(player.rankPoints);
    // Daily chỉ là quà hạng. Lãi theo hạng được tính riêng trong sổ tiết kiệm
    // (`.game nganhang`) để tiền trong ví game không tự tăng vô hạn.
    const rewardAmount = new Big(tierInfo.daily || DAILY_REWARD);
    const currentBalance = new Big(player.balance);

    const newBalance = currentBalance.plus(rewardAmount);

    const [updateResult] = await connection.execute(
      `UPDATE ${NAME_TABLE_PLAYERS} SET balance = ?, lastDailyReward = ? WHERE idUserZalo = ?`,
      [newBalance.toString(), now, idUser]
    );

    if (updateResult.affectedRows === 1) {
      const msg = `[Hạng ${tierInfo.name}] Bạn đã nhận Daily ${formatBigNumber(rewardAmount)} VNĐ. Hãy quay lại vào ngày mai để nhận thêm!`;
      return {
        success: true,
        message: msg,
      };
    } else {
      return { success: false, message: `Có lỗi xảy ra khi nhận quà.` };
    }
  } catch (error) {
    console.error("Lỗi khi nhận quà hàng ngày:", error);
    return { success: false, message: `Đã xảy ra lỗi khi nhận quà.` };
  }
}

/** Trợ cấp bằng 21% Daily: dưới Kim Cương mỗi tuần; Kim Cương+ dùng quỹ tuần tích lũy mỗi 5 giờ. */
export async function claimWeeklyAllowance(idUser) {
  try {
    idUser = canonicalPlayerId(idUser);
    const player = await connection.collection(NAME_TABLE_PLAYERS).findOne({ idUserZalo: idUser });
    if (!player) return { success: false, message: "Không thể khởi tạo hồ sơ game của bạn." };

    const tier = getGameTier(player.rankPoints || 0);
    const isDiamondOrHigher = new Big(player.rankPoints || 0).gte(DIAMOND_RANK_POINTS());
    const now = new Date();
    const weekKey = getVietnamWeekKey(now);
    const lastClaimAt = player.lastAllowanceAt ? new Date(player.lastAllowanceAt) : null;
    if (!isDiamondOrHigher && player.lastWeeklyAllowanceWeek === weekKey) {
      return { success: false, message: "Bạn đã nhận trợ cấp tuần này. Hãy quay lại vào tuần sau!" };
    }

    const weeklyFund = getWeeklyBenefitAmount(tier);
    const previousWeekUsed = player.allowanceFundWeek === weekKey ? new Big(player.allowanceFundUsed || 0) : new Big(0);
    if (isDiamondOrHigher && previousWeekUsed.gte(weeklyFund)) {
      return { success: false, message: "⏳ Quỹ trợ cấp tuần này đã dùng hết. Hãy quay lại vào tuần sau!" };
    }
    const elapsedMs = lastClaimAt ? Math.max(0, now.getTime() - lastClaimAt.getTime()) : FIVE_HOUR_COOLDOWN_MS;
    const accruedPercent = isDiamondOrHigher ? Math.min(100, (elapsedMs / FIVE_HOUR_COOLDOWN_MS) * 100) : 100;
    const accruedAmount = weeklyFund.times(accruedPercent).div(100).round(0, Big.roundDown);
    const remainingFund = weeklyFund.minus(previousWeekUsed);
    const amount = isDiamondOrHigher && accruedAmount.gt(remainingFund) ? remainingFund : (isDiamondOrHigher ? accruedAmount : weeklyFund);
    if (amount.lte(0)) return { success: false, message: "Trợ cấp đang tích lũy, hãy thử lại sau ít phút." };
    const newBalance = new Big(player.balance || 0).plus(amount);
    // The old balance is included in the guard so a bet/transfer cannot be
    // overwritten while this reward is being claimed.
    const allowanceGuard = isDiamondOrHigher
      ? { lastAllowanceAt: player.lastAllowanceAt || null, allowanceFundWeek: player.allowanceFundWeek || null }
      : { lastWeeklyAllowanceWeek: { $ne: weekKey } };
    const fundUsedAfter = previousWeekUsed.plus(amount);
    const fundPercentAfter = fundUsedAfter.div(weeklyFund).times(100).toNumber();
    const updated = await connection.collection(NAME_TABLE_PLAYERS).findOneAndUpdate(
      { _id: player._id, balance: player.balance, ...allowanceGuard },
      {
        $set: {
          balance: newBalance.toString(),
          ...(isDiamondOrHigher
            ? { lastAllowanceAt: now, allowanceFundWeek: weekKey, allowanceFundUsed: fundUsedAfter.toString() }
            : { lastWeeklyAllowanceWeek: weekKey }),
        },
      },
      { returnDocument: "after" }
    );
    if (!updated) return { success: false, message: "Số dư vừa thay đổi, hãy dùng lại lệnh trợ cấp." };

    return {
      success: true,
      message: isDiamondOrHigher
        ? `⏳ TRỢ CẤP — ${getTierIcon(tier.key)} hạng ${tier.name}\n` +
          `💰 Đã nhận ${formatBigNumber(amount)} vào ví.\n` +
          `📉 ${accruedPercent < 100 ? `Nhận sớm (tích lũy được ${Math.max(1, Math.floor(elapsedMs / 60000))} phút)` : "Đã tích lũy đủ 5 giờ"}: ${Math.round(accruedPercent)}% / 100%.\n` +
          `📊 Quỹ tuần: đã dùng ${Math.round(fundPercentAfter)}% / 100%.\n` +
          `⏱️ ${progressBar(0)}\n` +
          `📅 ${progressBar(fundPercentAfter)}`
        : `⏳ TRỢ CẤP — ${getTierIcon(tier.key)} hạng ${tier.name}\n💰 Đã nhận ${formatBigNumber(amount)} vào ví.\n📅 ${progressBar(100)} Mỗi tuần nhận 1 lần.`,
    };
  } catch (error) {
    console.error("Lỗi khi nhận trợ cấp:", error);
    return { success: false, message: "Đã xảy ra lỗi khi nhận trợ cấp." };
  }
}

/** Cứu trợ phá sản: Vàng+ , số dư dưới 10.000, mỗi 5 giờ và bằng 100% Daily. */
export async function claimRescueReward(idUser) {
  try {
    idUser = canonicalPlayerId(idUser);
    const player = await connection.collection(NAME_TABLE_PLAYERS).findOne({ idUserZalo: idUser });
    if (!player) return { success: false, message: "Không thể khởi tạo hồ sơ game của bạn." };

    const balance = new Big(player.balance || 0);
    if (balance.gte(RESCUE_BALANCE_CEILING)) {
      return { success: false, message: "🎖️ CỨU TRỢ PHÁ SẢN chỉ áp dụng khi số dư ví game của bạn dưới 10.000 VNĐ." };
    }
    if (new Big(player.rankPoints || 0).lt(GOLD_RANK_POINTS())) {
      const tier = getGameTier(player.rankPoints || 0);
      return {
        success: false,
        message: "🎖️ CỨU TRỢ PHÁ SẢN — cần hạng 🥇 Vàng trở lên.\n" +
          `Hạng hiện tại của bạn: ${tier.name}.\n\n` +
          "📖 Cấp một khoản bằng 100% quà điểm danh khi số dư ví game của bạn rơi xuống dưới 10.000 (phá sản), để có vốn chơi lại.\n" +
          "👉 Xem quyền lợi hạng của bạn: .game quyenloi\n" +
          "👉 Xem chi tiết hạng Vàng: .game tier vang",
      };
    }

    const tier = getGameTier(player.rankPoints || 0);
    const now = new Date();
    const lastClaimAt = player.lastRescueAt ? new Date(player.lastRescueAt) : null;
    const remainingMs = lastClaimAt ? FIVE_HOUR_COOLDOWN_MS - (now.getTime() - lastClaimAt.getTime()) : 0;
    if (remainingMs > 0) {
      return { success: false, message: `⏳ Bạn đã nhận cứu trợ. Hãy quay lại sau ${formatRemainingCooldown(remainingMs)}.` };
    }

    const amount = new Big(tier.daily || DAILY_REWARD || 0);
    const newBalance = balance.plus(amount);
    const updated = await connection.collection(NAME_TABLE_PLAYERS).findOneAndUpdate(
      { _id: player._id, balance: player.balance, lastRescueAt: player.lastRescueAt || null },
      {
        $set: {
          balance: newBalance.toString(),
          lastRescueAt: now,
        },
      },
      { returnDocument: "after" }
    );
    if (!updated) return { success: false, message: "Số dư hoặc thời gian cứu trợ vừa thay đổi, hãy thử lại." };

    return {
      success: true,
      message: `🎖️ CỨU TRỢ PHÁ SẢN — hạng ${tier.name}\n💰 Đã cấp ${formatBigNumber(amount)} VNĐ vào ví (100% Daily).\n⏳ Lần tiếp theo sau 5 giờ.`,
    };
  } catch (error) {
    console.error("Lỗi khi nhận cứu trợ:", error);
    return { success: false, message: "Đã xảy ra lỗi khi nhận cứu trợ." };
  }
}

export async function getMyCard(api, idUser) {
  try {
    idUser = canonicalPlayerId(idUser);
    const [rows] = await connection.execute(`SELECT * FROM ${NAME_TABLE_PLAYERS} WHERE idUserZalo = ?`, [idUser]);

    if (rows.length === 0) {
      return {
        success: false,
        message: `${nameServer}: Không thể khởi tạo hồ sơ game của bạn. Vui lòng thử lại. ❌`,
      };
    }

    const player = rows[0];
    let dataPlayerZalo = {};
    try {
      dataPlayerZalo = (await getUserInfoAcrossBots(api, idUser)) || {};
    } catch {
      // UID có thể thuộc bot khác; dữ liệu game vẫn hiển thị được.
    }

    const totalWinnings = new Big(player.totalWinnings);
    const totalLosses = new Big(player.totalLosses);
    const netProfit = totalWinnings.plus(totalLosses);
    const balance = new Big(player.balance);
    const winRate =
      player.totalGames > 0 ? new Big(player.totalWinGames).div(player.totalGames).times(100) : new Big(0);

    const now = getTimeNow();
    const lastReward = player.lastDailyReward ? new Date(player.lastDailyReward) : null;
    let lastDailyReward = "Chưa nhận quà";
    if (
      lastReward &&
      lastReward.getDate() === now.getDate() &&
      lastReward.getMonth() === now.getMonth() &&
      lastReward.getFullYear() === now.getFullYear()
    ) {
      lastDailyReward = getTimeToString(lastReward);
    }

    const playerInfo = {
      account: player.username,
      idUser: player.idUserZalo,
      playerName: player.playerName,
      avatar: dataPlayerZalo.avatarFull || dataPlayerZalo.avatar || player.avatar || null,
      balance: balance.toString(),
      rankPoints: Number(player.rankPoints || 0),
      registrationTime: getTimeToString(player.registrationTime),
      totalWinnings: totalWinnings.toString(),
      totalLosses: totalLosses.toString(),
      netProfit: netProfit.toString(),
      totalWinGames: player.totalWinGames,
      totalGames: player.totalGames,
      winRate: formatWinRate(winRate),
      lastDailyReward: lastDailyReward,
      ...dataPlayerZalo,
    };

    return { success: true, data: playerInfo };
  } catch (error) {
    console.error("Lỗi khi lấy thông tin người chơi:", error);
    return { success: false, message: `${nameServer}: Đã xảy ra lỗi khi lấy thông tin. ❌` };
  }
}

function formatWinRate(winRate) {
  if (winRate.eq(100)) return "100";
  if (winRate.eq(0)) return "0";
  return winRate.toFixed(1).replace(/\.0$/, "");
}

export async function setLoserGame(idUser, amount, meta = null) {
  try {
    idUser = canonicalPlayerId(idUser);
    const [playerRows] = await connection.execute(`SELECT balance FROM ${NAME_TABLE_PLAYERS} WHERE idUserZalo = ?`, [
      idUser,
    ]);
    if (playerRows.length === 0) {
      return { success: false, message: `${nameServer}: Không tìm thấy người chơi. ❌` };
    }

    const refund = new Big(amount).abs().times("0.05").round(0, Big.roundDown);
    const currentBalance = new Big(playerRows[0].balance || 0).plus(refund).toString();

    let query = `UPDATE ${NAME_TABLE_PLAYERS} SET 
      balance = ?,
      totalLosses = totalLosses + ?,
      totalGames = totalGames + ?
      WHERE idUserZalo = ?`;
    const [result] = await connection.execute(query, [currentBalance, new Big(amount).neg().toString(), 1, idUser]);

    if (result.affectedRows === 1) {
      await addPendingRefund(idUser, refund);
      recordGameHistory({
        playerId: idUser,
        amount: meta?.betAmount || new Big(amount).abs().toString(),
        netAmount: new Big(amount).abs().neg().toString(),
        balanceAfter: currentBalance,
        isWin: false,
        gameName: meta?.gameName || "Trò chơi",
        gameKey: meta?.gameKey || "game",
        choice: meta?.choice || "",
        detail: meta?.detail || "",
      }).catch((err) => console.error("Lỗi tự động ghi lịch sử game thua:", err));

      return { success: true, message: `${nameServer}: Cập nhật lượt thua thành công. ✅` };
    } else {
      return { success: false, message: `${nameServer}: Cập nhật lượt thua thất bại. ❌` };
    }
  } catch (error) {
    console.error("Lỗi khi cập nhật lượt thua:", error);
    return { success: false, message: `${nameServer}: Đã xảy ra lỗi khi cập nhật lượt thua. ❌` };
  }
}

export async function setLoserGameByUsername(username, amount, meta = null) {
  try {
    const [playerRows] = await connection.execute(`SELECT balance, idUserZalo, playerName FROM ${NAME_TABLE_PLAYERS} WHERE username = ?`, [
      username,
    ]);
    if (playerRows.length === 0) {
      return { success: false, message: `${nameServer}: Không tìm thấy người chơi. ❌` };
    }

    const refund = new Big(amount).abs().times("0.05").round(0, Big.roundDown);
    const currentBalance = new Big(playerRows[0].balance || 0).plus(refund).toString();

    let query = `UPDATE ${NAME_TABLE_PLAYERS} SET 
      balance = ?,
      totalLosses = totalLosses + ?,
      totalGames = totalGames + ?
      WHERE username = ?`;
    const [result] = await connection.execute(query, [currentBalance, new Big(amount).neg().toString(), 1, username]);

    if (result.affectedRows === 1) {
      await addPendingRefund(playerRows[0].idUserZalo, refund);
      recordGameHistory({
        playerId: playerRows[0].idUserZalo,
        username,
        playerName: playerRows[0].playerName,
        amount: meta?.betAmount || new Big(amount).abs().toString(),
        netAmount: new Big(amount).abs().neg().toString(),
        balanceAfter: currentBalance,
        isWin: false,
        gameName: meta?.gameName || "Trò chơi",
        gameKey: meta?.gameKey || "game",
        choice: meta?.choice || "",
        detail: meta?.detail || "",
      }).catch((err) => console.error("Lỗi tự động ghi lịch sử game thua:", err));

      return { success: true, message: `${nameServer}: Cập nhật lượt thua thành công. ✅` };
    } else {
      return { success: false, message: `${nameServer}: Cập nhật lượt thua thất bại. ❌` };
    }
  } catch (error) {
    console.error("Lỗi khi cập nhật lượt thua:", error);
    return { success: false, message: `${nameServer}: Đã xảy ra lỗi khi cập nhật lượt thua. ❌` };
  }
}

export async function updatePlayerBalance(idUser, amount, isWin = null, numAmountWin, meta = null) {
  try {
    idUser = canonicalPlayerId(idUser);
    const [playerRows] = await connection.execute(`SELECT balance FROM ${NAME_TABLE_PLAYERS} WHERE idUserZalo = ?`, [
      idUser,
    ]);

    if (playerRows.length === 0) {
      return { success: false, message: `${nameServer}: Không tìm thấy người chơi. ❌` };
    }

    const oldBalance = new Big(playerRows[0].balance).round(0);
    const bigNumAmount = new Big(amount).round(0);
    const settlement = applyGameRewardPolicy(bigNumAmount, isWin, numAmountWin);
    const newBalance = oldBalance.plus(settlement.walletDelta);
    const numBalanceWin = numAmountWin ? new Big(numAmountWin) : new Big(0);
    const isSetWinPoint = numBalanceWin.gt(0) ? 1 : 0;

    let query = `UPDATE ${NAME_TABLE_PLAYERS} SET balance = ?`;
    let params = [newBalance.toString()];

    if (isWin !== null) {
      query += `, 
        totalWinnings = CASE WHEN ? > 0 THEN totalWinnings + ? ELSE totalWinnings END,
        totalLosses = CASE WHEN ? < 0 THEN totalLosses - ? ELSE totalLosses END,
        totalGames = totalGames + 1,
        totalWinGames = totalWinGames + ?`;

      const positiveAmount =
        isSetWinPoint && numAmountWin ? numBalanceWin.toString() : bigNumAmount.gt(0) ? bigNumAmount.toString() : "0";
      const negativeAmount =
        !isSetWinPoint && numAmountWin
          ? numBalanceWin.abs().toString()
          : bigNumAmount.lt(0)
          ? bigNumAmount.abs().toString()
          : "0";

      params.push(bigNumAmount.toString(), positiveAmount, bigNumAmount.toString(), negativeAmount, isWin ? 1 : 0);
    }

    query += ` WHERE idUserZalo = ?`;
    params.push(idUser);

    const [result] = await connection.execute(query, params);

    if (result.affectedRows === 1) {
      if (settlement.refund.gt(0)) await addPendingRefund(idUser, settlement.refund);
      if (settlement.fundContribution.gt(0)) {
        await addToLuckyEnvelopeFund(settlement.fundContribution).catch((error) => console.error("Lỗi cộng Quỹ Lì Xì:", error));
      }
      if (isWin !== null) {
        await connection.execute(
          `UPDATE ${NAME_TABLE_PLAYERS} 
          SET winRate = (totalWinGames / NULLIF(totalGames, 0)) * 100
          WHERE idUserZalo = ?`,
          [idUser]
        );
      }

      if (isWin !== null || meta) {
        const isWinBool = isWin !== null ? Boolean(isWin) : bigNumAmount.gt(0);
        const winAmt = isSetWinPoint && numAmountWin ? numBalanceWin : bigNumAmount;
        recordGameHistory({
          playerId: idUser,
          amount: meta?.betAmount || (numAmountWin ? Math.abs(numAmountWin) : bigNumAmount.abs().toString()),
          netAmount: meta?.netAmount !== undefined ? meta.netAmount : (isWinBool ? winAmt.toString() : bigNumAmount.toString()),
          balanceAfter: newBalance.toString(),
          isWin: isWinBool,
          gameName: meta?.gameName || "Trò chơi",
          gameKey: meta?.gameKey || "game",
          choice: meta?.choice || "",
          detail: meta?.detail || "",
        }).catch((err) => console.error("Lỗi ghi lịch sử game:", err));
      }

      return {
        success: true,
        oldBalance: oldBalance.toString(),
        newBalance: newBalance.toString(),
        refund: settlement.refund.toString(),
        fundContribution: settlement.fundContribution.toString(),
      };
    } else {
      return { success: false, message: `${nameServer}: Cập nhật thất bại. ❌` };
    }
  } catch (error) {
    console.error("Lỗi khi cập nhật số dư:", error);
    return { success: false, message: `${nameServer}: Đã xảy ra lỗi khi cập nhật số dư. ❌` };
  }
}

/** Cập nhật số dư theo kiểu compare-and-set, tránh gửi/rút đồng thời làm âm ví. */
export async function adjustPlayerBalanceSafely(idUser, amount) {
  const normalizedId = canonicalPlayerId(idUser);
  const delta = new Big(amount).round(0);
  if (delta.eq(0)) return { success: true, balance: "0" };
  try {
    const collection = connection.collection(NAME_TABLE_PLAYERS);
    for (let attempt = 0; attempt < 5; attempt++) {
      const player = await collection.findOne({ idUserZalo: normalizedId });
      if (!player) return { success: false, message: "Không tìm thấy người chơi." };
      const oldBalance = new Big(player.balance || 0).round(0);
      const nextBalance = oldBalance.plus(delta);
      if (nextBalance.lt(0)) return { success: false, message: "Số dư không đủ." };
      const result = await collection.updateOne(
        { _id: player._id, balance: player.balance },
        { $set: { balance: nextBalance.toString() } }
      );
      if (result.modifiedCount === 1) return { success: true, oldBalance: oldBalance.toString(), balance: nextBalance.toString() };
    }
    return { success: false, message: "Số dư vừa thay đổi, vui lòng thử lại." };
  } catch (error) {
    console.error("Lỗi cập nhật số dư an toàn:", error);
    return { success: false, message: "Không thể cập nhật số dư." };
  }
}

export async function setPlayerBalance(idUser, amount) {
  try {
    const [rows] = await connection.execute(`SELECT * FROM ${NAME_TABLE_PLAYERS} WHERE idUserZalo = ?`, [idUser]);

    if (rows.length === 0) {
      return { success: false, message: `Zalo ID này chưa có hồ sơ game.` };
    }

    const newBalance = new Big(amount).round(0);

    const [updateResult] = await connection.execute(
      `UPDATE ${NAME_TABLE_PLAYERS} SET balance = ? WHERE idUserZalo = ?`,
      [newBalance.toString(), idUser]
    );

    if (updateResult.affectedRows === 1) {
      return {
        success: true,
        message: `Set tiền thành công: ${formatBigNumber(newBalance)} VNĐ!`,
      };
    } else {
      return { success: false, message: `Có lỗi xảy ra khi nhận quà.` };
    }
  } catch (error) {
    console.error("Lỗi khi set vnd cho người chơi:", error);
    return { success: false, message: `Đã xảy ra lỗi khi set vnd.` };
  }
}

export async function getPlayerBalance(idUser) {
  try {
    idUser = canonicalPlayerId(idUser);
    const [rows] = await connection.execute(`SELECT balance FROM ${NAME_TABLE_PLAYERS} WHERE idUserZalo = ?`, [idUser]);

    if (rows.length > 0) {
      const balance = new Big(rows[0].balance);
      return { success: true, balance: balance.toString() };
    } else {
      return {
        success: false,
        message: `Không thể lấy dữ liệu người chơi. Hãy thử lại lệnh game sau ít phút!`,
      };
    }
  } catch (error) {
    console.error("Lỗi khi lấy số dư người chơi:", error);
    return { success: false, message: `Đã xảy ra lỗi khi lấy số dư!` };
  }
}

export async function getPlayerInfo(idUserZalo) {
  try {
    idUserZalo = canonicalPlayerId(idUserZalo);
    const [rows] = await connection.execute(`SELECT * FROM ${NAME_TABLE_PLAYERS} WHERE idUserZalo = ?`, [idUserZalo]);

    if (rows.length > 0) {
      if (!getCurrentPrivateGameServer()?.serverId && getPrivateGameBotIds().includes(String(rows[0].serverId))) {
        rows[0].rankPoints = 0;
        rows[0].vipExpireAt = null;
      }
      return rows[0];
    } else {
      return null;
    }
  } catch (error) {
    console.error("Lỗi khi lấy thông tin người chơi:", error);
    throw error;
  }
}

/** Hạng tài khoản không tăng từ kết quả chơi game; giữ hàm để tương thích các game cũ. */
export async function addGameRankPoints(idUserZalo, { won = false, jackpot = false } = {}) {
  void idUserZalo; void won; void jackpot;
  return { success: true, points: 0 };
}

/** Đổi tiền trong ví game thành điểm hạng, có khóa lạc quan để tránh trừ tiền hai lần. */
export async function donateForRank(idUserZalo, amount) {
  const donation = new Big(amount).round(0, Big.roundDown);
  const points = Number(donation.div(10000).round(0, Big.roundDown).toString());
  if (points < 1) return { success: false, message: "Số tiền donenat tối thiểu là 10.000 VNĐ." };

  const charged = new Big(points).times(10000);
  try {
    const collection = connection.collection(NAME_TABLE_PLAYERS);
    for (let attempt = 0; attempt < 3; attempt++) {
      const player = await collection.findOne({ idUserZalo: String(idUserZalo) });
      if (!player) return { success: false, message: "Không tìm thấy hồ sơ game của bạn." };
      const oldBalance = new Big(player.balance || 0);
      if (oldBalance.lt(charged)) {
        return { success: false, message: `Số dư không đủ. Bạn chỉ có ${formatBigNumber(oldBalance)} VNĐ.` };
      }

      const oldPoints = Number(player.rankPoints || 0);
      const newBalance = oldBalance.minus(charged);
      const tierChanged = getGameTier(oldPoints).key !== getGameTier(oldPoints + points).key;
      const result = await collection.updateOne(
        { _id: player._id, balance: player.balance },
        { $set: { balance: newBalance.toString(), ...(tierChanged ? { lastDailyReward: null } : {}) }, $inc: { rankPoints: points } }
      );
      if (result.modifiedCount === 1) {
        return {
          success: true,
          charged: charged.toString(),
          points,
          oldPoints,
          newPoints: oldPoints + points,
          oldBalance: oldBalance.toString(),
          newBalance: newBalance.toString(),
        };
      }
    }
    return { success: false, message: "Số dư vừa thay đổi, vui lòng thử lại." };
  } catch (error) {
    console.error("Lỗi khi donenat đổi điểm hạng:", error);
    return { success: false, message: "Không thể donenat lúc này, vui lòng thử lại." };
  }
}

/** Chỉ nâng điểm lên mốc mới, tuyệt đối không hạ điểm/hạng hiện tại. */
export async function raisePlayerRank(idUserZalo, targetPoints) {
  try {
    idUserZalo = canonicalPlayerId(idUserZalo);
    const collection = connection.collection(NAME_TABLE_PLAYERS);
    const player = await collection.findOne({ idUserZalo: String(idUserZalo) });
    if (!player) return { success: false, message: "Người này chưa có hồ sơ game." };
    const oldPoints = Number(player.rankPoints || 0);
    const newPoints = Math.max(0, Math.trunc(Number(targetPoints) || 0));
    if (newPoints <= oldPoints) {
      return { success: false, message: "Người này đã ở hạng bằng hoặc cao hơn, lệnh nâng không thể hạ hạng." };
    }
    const result = await collection.updateOne(
      { _id: player._id, $or: [{ rankPoints: { $lt: newPoints } }, { rankPoints: { $exists: false } }] },
      // Lên hạng là một mốc Daily mới: cho nhận lại một lần ngay lập tức.
      { $set: { rankPoints: newPoints, lastDailyReward: null } }
    );
    if (result.modifiedCount !== 1) return { success: false, message: "Điểm hạng vừa thay đổi, vui lòng thử lại." };
    return { success: true, oldPoints, newPoints };
  } catch (error) {
    console.error("Lỗi khi admin nâng hạng game:", error);
    return { success: false, message: "Không thể nâng hạng lúc này." };
  }
}

/** Hạ hoặc xoá điểm hạng/tier của người chơi về mốc chỉ định (mặc định về 0). */
export async function resetPlayerRank(idUserZalo, targetPoints = 0) {
  try {
    idUserZalo = canonicalPlayerId(idUserZalo);
    const collection = connection.collection(NAME_TABLE_PLAYERS);
    const player = await collection.findOne({ idUserZalo: String(idUserZalo) });
    if (!player) return { success: false, message: "Người này chưa có hồ sơ game." };
    const oldPoints = Number(player.rankPoints || 0);
    const newPoints = Math.max(0, Math.trunc(Number(targetPoints) || 0));
    const result = await collection.updateOne(
      { _id: player._id },
      { $set: { rankPoints: newPoints, vipExpireAt: null } }
    );
    if (result.matchedCount !== 1) return { success: false, message: "Không thể cập nhật hồ sơ người chơi." };
    return { success: true, oldPoints, newPoints };
  } catch (error) {
    console.error("Lỗi khi xoá/hạ điểm hạng game:", error);
    return { success: false, message: "Không thể xoá/hạ hạng lúc này." };
  }
}

export async function recordGameTransfer(transaction) {
  try {
    const senderId = canonicalPlayerId(transaction.senderId);
    const receiverId = canonicalPlayerId(transaction.receiverId);
    const collection = connection.collection("game_transactions");
    await collection.insertOne({
      referenceCode: String(transaction.referenceCode),
      senderId: String(senderId),
      senderName: String(transaction.senderName || transaction.senderId),
      receiverId: String(receiverId),
      receiverName: String(transaction.receiverName || transaction.receiverId),
      amount: new Big(transaction.amount).round(0).toString(),
      senderBalanceBefore: new Big(transaction.senderBalanceBefore).round(0).toString(),
      senderBalanceAfter: new Big(transaction.senderBalanceAfter).round(0).toString(),
      receiverBalanceBefore: new Big(transaction.receiverBalanceBefore).round(0).toString(),
      receiverBalanceAfter: new Big(transaction.receiverBalanceAfter).round(0).toString(),
      botId: String(transaction.botId),
      threadId: String(transaction.threadId),
      createdAt: transaction.createdAt instanceof Date ? transaction.createdAt : new Date(transaction.createdAt || Date.now()),
    });
    return { success: true };
  } catch (error) {
    console.error("Lỗi khi lưu lịch sử chuyển tiền game:", error);
    return { success: false };
  }
}

export async function getGameTransferHistory(idUserZalo, limit = 10) {
  try {
    idUserZalo = canonicalPlayerId(idUserZalo);
    const safeLimit = Math.max(1, Math.min(20, Number(limit) || 10));
    return await connection
      .collection("game_transactions")
      .find({ $or: [{ senderId: String(idUserZalo) }, { receiverId: String(idUserZalo) }] })
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .toArray();
  } catch (error) {
    console.error("Lỗi khi đọc lịch sử chuyển tiền game:", error);
    return [];
  }
}

export async function recordGameHistory({
  playerId,
  username,
  playerName,
  gameName,
  gameKey,
  choice,
  amount,
  netAmount,
  balanceAfter,
  isWin,
  detail,
  createdAt,
  referenceCode,
}) {
  try {
    if (!playerId && username) {
      playerId = await getIdUserZaloByUsername(username);
    }
    if (!playerId) return null;
    playerId = canonicalPlayerId(playerId);

    const netBig = new Big(netAmount || 0).round(0);
    const resolvedIsWin = isWin !== null && isWin !== undefined
      ? Boolean(isWin)
      : (netBig.gt(0) ? true : netBig.lt(0) ? false : null);

    const keyPrefix = String(gameKey || "GM").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || "GM";
    const ref = referenceCode || `${keyPrefix}-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;

    const doc = {
      referenceCode: ref,
      playerId: String(playerId),
      idUserZalo: String(playerId),
      username: username ? String(username) : undefined,
      playerName: playerName ? String(playerName) : undefined,
      gameName: String(gameName || "Trò chơi"),
      gameKey: String(gameKey || "game"),
      choice: choice ? String(choice) : "",
      amount: new Big(amount || 0).abs().round(0).toString(),
      netAmount: netBig.toString(),
      balanceAfter: balanceAfter !== undefined && balanceAfter !== null ? new Big(balanceAfter).round(0).toString() : undefined,
      isWin: resolvedIsWin,
      detail: detail ? String(detail) : "",
      createdAt: createdAt instanceof Date ? createdAt : new Date(createdAt || Date.now()),
    };

    await connection.collection("game_history").insertOne(doc);
    return doc;
  } catch (error) {
    console.error("Lỗi khi lưu lịch sử game:", error);
    return null;
  }
}

export async function getGamePlayerHistory(idUserZalo, limit = 10, username = null) {
  try {
    idUserZalo = canonicalPlayerId(idUserZalo);
    const safeLimit = Math.max(1, Math.min(50, Number(limit) || 10));
    const filters = [
      { playerId: String(idUserZalo) },
      { idUserZalo: String(idUserZalo) },
    ];
    if (username) {
      filters.push({ username: String(username) });
    }
    return await connection
      .collection("game_history")
      .find({ $or: filters })
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .toArray();
  } catch (error) {
    console.error("Lỗi khi đọc lịch sử game của người chơi:", error);
    return [];
  }
}

export async function getIdUserZaloByUsername(username) {
  try {
    const [rows] = await connection.execute(
      `SELECT idUserZalo FROM ${NAME_TABLE_PLAYERS} WHERE username = ?`,
      [username]
    );
    return rows[0]?.idUserZalo || null;
  } catch (error) {
    return null;
  }
}

export async function getAccountVND(username) {
  try {
    const [rows] = await connection.execute(`SELECT vnd FROM ${NAME_TABLE_ACCOUNT} WHERE username = ?`, [username]);

    if (rows.length > 0) {
      return rows[0].vnd;
    } else {
      return null;
    }
  } catch (error) {
    console.error("Lỗi khi lấy số dư VND của tài khoản:", error);
    throw error;
  }
}

export async function updateAccountVND(username, amount) {
  try {
    const [currentBalance] = await connection.execute(`SELECT vnd FROM ${NAME_TABLE_ACCOUNT} WHERE username = ?`, [
      username,
    ]);

    if (currentBalance.length === 0) {
      return { success: false, message: `${nameServer}: Không tìm thấy tài khoản!` };
    }

    const currentVND = new Big(currentBalance[0].vnd);
    const bigIntAmount = new Big(amount);
    const newBalance = currentVND.plus(bigIntAmount);

    const [result] = await connection.execute(`UPDATE ${NAME_TABLE_ACCOUNT} SET vnd = ? WHERE username = ?`, [
      newBalance.toString(),
      username,
    ]);

    if (result.affectedRows === 1) {
      if (settlement.refund.gt(0)) await addPendingRefund(playerRows[0].idUserZalo, settlement.refund);
      return { success: true, message: `${nameServer}: Cập nhật số dư VND thành công. ✅` };
    } else {
      return { success: false, message: `${nameServer}: Cập nhật thất bại. ❌` };
    }
  } catch (error) {
    console.error("Lỗi khi cập nhật số dư VND của tài khoản:", error);
    return { success: false, message: `${nameServer}: Đã xảy ra lỗi khi cập nhật số dư VND!` };
  }
}

export async function getUsernameByIdZalo(idUserZalo) {
  try {
    idUserZalo = canonicalPlayerId(idUserZalo);
    const [rows] = await connection.execute(`SELECT username FROM ${NAME_TABLE_PLAYERS} WHERE idUserZalo = ?`, [
      idUserZalo,
    ]);
    return rows[0].username;
  } catch (error) {
    return null;
  }
}

export async function updatePlayerBalanceByUsername(username, amount, isWin = null, numAmountWin, meta = null) {
  try {
    const [playerRows] = await connection.execute(`SELECT balance, idUserZalo, playerName FROM ${NAME_TABLE_PLAYERS} WHERE username = ?`, [
      username,
    ]);

    if (playerRows.length === 0) {
      return { success: false, message: `${nameServer}: Không tìm thấy người chơi. ❌` };
    }

    const oldBalance = new Big(playerRows[0].balance);
    const bigNumAmount = new Big(amount);
    const settlement = applyGameRewardPolicy(bigNumAmount, isWin, numAmountWin);
    const newBalance = oldBalance.plus(settlement.walletDelta);
    const numBalanceWin = numAmountWin ? new Big(numAmountWin) : new Big(0);
    const isSetWinPoint = numBalanceWin.gt(0) ? 1 : 0;

    let query = `UPDATE ${NAME_TABLE_PLAYERS} SET balance = ?`;
    let params = [newBalance.toString()];

    if (isWin !== null) {
      query += `, 
        totalWinnings = CASE WHEN ? > 0 THEN totalWinnings + ? ELSE totalWinnings END,
        totalLosses = CASE WHEN ? < 0 THEN totalLosses - ? ELSE totalLosses END,
        totalGames = totalGames + 1,
        totalWinGames = totalWinGames + ?`;

      const positiveAmount =
        isSetWinPoint && numAmountWin ? numBalanceWin.toString() : bigNumAmount.gt(0) ? bigNumAmount.toString() : "0";
      const negativeAmount =
        !isSetWinPoint && numAmountWin
          ? numBalanceWin.abs().toString()
          : bigNumAmount.lt(0)
          ? bigNumAmount.abs().toString()
          : "0";

      params.push(bigNumAmount.toString(), positiveAmount, bigNumAmount.toString(), negativeAmount, isWin ? 1 : 0);
    }

    query += ` WHERE username = ?`;
    params.push(username);

    const [result] = await connection.execute(query, params);

    if (result.affectedRows === 1) {
      if (settlement.fundContribution.gt(0)) {
        await addToLuckyEnvelopeFund(settlement.fundContribution).catch((error) => console.error("Lỗi cộng Quỹ Lì Xì:", error));
      }
      if (isWin !== null) {
        await connection.execute(
          `UPDATE ${NAME_TABLE_PLAYERS} 
          SET winRate = (totalWinGames / NULLIF(totalGames, 0)) * 100
          WHERE username = ?`,
          [username]
        );
      }

      if (isWin !== null || meta) {
        const isWinBool = isWin !== null ? Boolean(isWin) : bigNumAmount.gt(0);
        const winAmt = isSetWinPoint && numAmountWin ? numBalanceWin : bigNumAmount;
        recordGameHistory({
          playerId: playerRows[0].idUserZalo,
          username,
          playerName: playerRows[0].playerName,
          amount: meta?.betAmount || (numAmountWin ? Math.abs(numAmountWin) : bigNumAmount.abs().toString()),
          netAmount: meta?.netAmount !== undefined ? meta.netAmount : (isWinBool ? winAmt.toString() : bigNumAmount.toString()),
          balanceAfter: newBalance.toString(),
          isWin: isWinBool,
          gameName: meta?.gameName || "Trò chơi",
          gameKey: meta?.gameKey || "game",
          choice: meta?.choice || "",
          detail: meta?.detail || "",
        }).catch((err) => console.error("Lỗi ghi lịch sử game:", err));
      }

      return {
        success: true,
        oldBalance: oldBalance.toString(),
        newBalance: newBalance.toString(),
        refund: settlement.refund.toString(),
        fundContribution: settlement.fundContribution.toString(),
      };
    } else {
      return { success: false, message: `${nameServer}: Cập nhật thất bại. ❌` };
    }
  } catch (error) {
    console.error("Lỗi khi cập nhật số dư:", error);
    return { success: false, message: `${nameServer}: Đã xảy ra lỗi khi cập nhật số dư. ❌` };
  }
}
