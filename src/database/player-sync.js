import { Big } from "big.js";

const BIG_SUM_FIELDS = ["balance", "totalWinnings", "totalLosses", "pendingRefund"];
const NUMBER_SUM_FIELDS = ["totalGames", "totalWinGames"];
const LATEST_DATE_FIELDS = [
  "lastDailyReward", "lastMemberRewardAt", "lastRescueAt", "lastAllowanceAt",
  "lastRefundClaimAt", "vipExpireAt",
];
export const EXCLUSIVE_OVERLORD_PLAYER_ID = "t_m7e09z0izz";

export function isHiddenLeaderboardPlayer(player = {}) {
  const playerId = String(player.idUserZalo || player.idUser || player.username || "")
    .replace(/^private:[^:]+:/u, "")
    .replace(/_0$/u, "");
  return playerId === EXCLUSIVE_OVERLORD_PLAYER_ID;
}

export function resolveGamePlayerAliasChain(id, aliases = new Map()) {
  const original = String(id || "").replace(/_0$/u, "");
  let current = original;
  const visited = new Set();
  while (!visited.has(current)) {
    visited.add(current);
    const next = String(aliases.get(current) || current).replace(/_0$/u, "");
    if (next === current) return current;
    current = next;
  }
  throw new Error(`Vòng lặp liên kết tài khoản game: ${original}`);
}

export function getExactGameIdentityProfile(profilesOrResponse = {}, userId) {
  const normalizedId = String(userId || "").replace(/_0$/u, "");
  if (!normalizedId) return null;
  // Zalo API có thể trả về profiles dưới nhiều key khác nhau:
  // - profiles (dạng cũ / một số endpoint)
  // - changed_profiles / unchanged_profiles (dạng mới getInfoMembers)
  const lookup = (map) => {
    if (!map || typeof map !== "object") return null;
    return map[normalizedId] || map[`${normalizedId}_0`] || null;
  };
  return (
    lookup(profilesOrResponse?.[normalizedId] != null || profilesOrResponse?.[`${normalizedId}_0`] != null
      ? profilesOrResponse
      : null) ||
    lookup(profilesOrResponse?.profiles) ||
    lookup(profilesOrResponse?.changed_profiles) ||
    lookup(profilesOrResponse?.unchanged_profiles) ||
    null
  );
}

export function getStableGameIdentity(profile = {}) {
  const username = String(profile?.username || profile?.userName || "").trim();
  if (username && username !== "Ẩn") {
    return { resolvedKey: username, identityKey: `USERNAME:${username}` };
  }
  return { resolvedKey: null, identityKey: null };
}

export function selectLocalGamePlayer(directPlayer, cachedPlayer, hasStableIdentity) {
  return directPlayer || (hasStableIdentity ? null : cachedPlayer);
}

export function isGamePlayerOwnedByBot(player, botId) {
  return Boolean(player) && !player.mergedInto && String(player.serverId || "") === String(botId || "");
}

// globalId is only evidence within the bot that returned the exact UID profile.
// Never resolve a legacy wallet by display name, avatar, or another bot's ID.
export function isVerifiedLegacyGamePlayer(player, profile, botId) {
  const legacyId = String(profile?.globalId || "");
  return Boolean(legacyId) && isGamePlayerOwnedByBot(player, botId) &&
    String(player.idUserZalo) === legacyId;
}

export function getGameAssets(balance = "0", savings = "0") {
  return {
    walletBalance: new Big(balance || 0).toString(),
    savings: new Big(savings || 0).toString(),
    totalAssets: new Big(balance || 0).plus(savings || 0).toString(),
  };
}

export function hasGameDisplayName(value) {
  const name = String(value || "").trim();
  return Boolean(name) && !["Ẩn", "Không xác định", "Người chơi"].includes(name) &&
    !/^\d{8,}$/u.test(name) && !/^[A-Z0-9]{24,}$/u.test(name) &&
    !/^t_[a-z0-9]+$/iu.test(name) && !name.startsWith("private:");
}

export function selectGameDisplayName(...values) {
  const name = values.find(hasGameDisplayName);
  return name ? String(name).trim() : "";
}

export function resolveGamePlayerAliasTarget(aliasId, playerId, directPlayer = null, targetPlayer = null) {
  const alias = String(aliasId || "").replace(/_0$/u, "");
  const target = String(targetPlayer?.mergedInto || playerId || "").replace(/_0$/u, "");
  if (!alias || !target || alias === target) return target || alias;
  if (directPlayer && String(directPlayer.idUserZalo || "").replace(/_0$/u, "") === alias && !directPlayer.mergedInto) {
    return alias;
  }
  return target;
}

export function mergeGamePlayerDocuments(target = {}, source = {}) {
  const merged = {};
  for (const field of BIG_SUM_FIELDS) {
    merged[field] = new Big(target[field] || 0).plus(source[field] || 0).toString();
  }
  merged.netProfit = calculateGameNetProfit(merged.totalWinnings, merged.totalLosses);
  for (const field of NUMBER_SUM_FIELDS) {
    merged[field] = Number(target[field] || 0) + Number(source[field] || 0);
  }
  merged.winRate = merged.totalGames > 0 ? (merged.totalWinGames / merged.totalGames) * 100 : 0;
  merged.rankPoints = Number(target.rankPoints || 0) + Number(source.rankPoints || 0);
  merged.isBanned = Boolean(target.isBanned || source.isBanned);
  merged.registrationTime = [target.registrationTime, source.registrationTime]
    .filter(Boolean)
    .map((value) => new Date(value))
    .sort((a, b) => a - b)[0] || new Date();
  merged.playerName = target.playerName || source.playerName;
  merged.avatar = target.avatar || source.avatar || null;
  merged.specialTier = String(target.idUserZalo || target.username || "") === EXCLUSIVE_OVERLORD_PLAYER_ID
    ? (target.specialTier || source.specialTier || null)
    : null;
  merged.maybayReceipts = { ...(source.maybayReceipts || {}), ...(target.maybayReceipts || {}) };

  for (const field of LATEST_DATE_FIELDS) {
    const values = [target[field], source[field]].filter(Boolean).map((value) => new Date(value));
    if (values.length) merged[field] = new Date(Math.max(...values.map(Number)));
  }

  const targetWeek = String(target.allowanceFundWeek || "");
  const sourceWeek = String(source.allowanceFundWeek || "");
  if (targetWeek && targetWeek === sourceWeek) {
    merged.allowanceFundWeek = targetWeek;
    merged.allowanceFundUsed = new Big(target.allowanceFundUsed || 0).plus(source.allowanceFundUsed || 0).toString();
  } else if (sourceWeek > targetWeek) {
    merged.allowanceFundWeek = sourceWeek;
    merged.allowanceFundUsed = String(source.allowanceFundUsed || "0");
  } else {
    merged.allowanceFundWeek = targetWeek || sourceWeek || null;
    merged.allowanceFundUsed = String(target.allowanceFundUsed || source.allowanceFundUsed || "0");
  }
  merged.lastMemberRewardDay = [target.lastMemberRewardDay, source.lastMemberRewardDay].filter(Boolean).sort().at(-1) || null;
  merged.lastWeeklyAllowanceWeek = [target.lastWeeklyAllowanceWeek, source.lastWeeklyAllowanceWeek].filter(Boolean).sort().at(-1) || null;
  return merged;
}

export function calculateGameNetProfit(totalWinnings, totalLosses) {
  return new Big(totalWinnings || 0).minus(new Big(totalLosses || 0).abs()).toString();
}
