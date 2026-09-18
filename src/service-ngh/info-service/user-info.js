import { getBusinessAccount } from "./business-account.js";
import * as cv from "../../utils/canvas/index.js";
import { deepParseJSON, deepStringifyJSON, removeMention } from "../../utils/format-util.js";
import { getGlobalPrefix } from "../service.js";
import { apiManager } from "../../index.js";
import { handleI4BgImgCommand } from "./i4bgimg.js";
import { handleI4ImageCommand } from "./i4image.js";

globalThis.__basicUserCache ||= new Map();
globalThis.__basicUserRequests ||= new Map();
var basicUserCache = globalThis.__basicUserCache;
var basicUserRequests = globalThis.__basicUserRequests;
const BASIC_USER_TTL_MS = Math.max(30000, Number(process.env.NGH_USER_CACHE_TTL_MS) || 5 * 60 * 1000);
const BASIC_USER_CACHE_SIZE = Math.max(1000, Number(process.env.NGH_USER_CACHE_SIZE) || 50000);

export async function userInfoCommand(api, message, aliasCommand) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  let content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  content = content.replace(`${prefix}${aliasCommand}`, "").trim();

  if (content.startsWith("bgimg")) {
    await handleI4BgImgCommand(api, message, aliasCommand);
    return;
  }
  if (content.startsWith("img") || content.startsWith("image")) {
    await handleI4ImageCommand(api, message, aliasCommand);
    return;
  }
  if (content.includes("text")) {
    await userInfoCommandText(api, message, aliasCommand);
    return;
  }
  let imagePath = null;

  try {
    let targetUserId =
      message.data.mentions?.[0]?.uid ||
      (content === "-f" ? message.data?.idTo || threadId : content ? content : senderId);
    if (targetUserId === threadId && message.type === 1) {
      targetUserId = senderId;
    }

    const userInfo = await getUserInfoAcrossBots(api, targetUserId);
    if (!userInfo) {
      await sendErrorMessage(api, message, threadId, "❌ Không thể lấy thông tin người dùng này.");
      return;
    }

    imagePath = await cv.createUserInfoImage(userInfo);
    await api.sendMessage({ msg: "", attachments: [imagePath], ttl: 6000000, isUseProphylactic: true }, threadId, message.type);
  } catch (error) {
    console.error("Lỗi khi lấy thông tin người dùng:", error);
    await sendErrorMessage(
      api,
      message,
      threadId,
      "❌ Đã xảy ra lỗi khi lấy thông tin người dùng. Vui lòng thử lại sau."
    );
  } finally {
    if (imagePath) {
      await cv.clearImagePath(imagePath);
    }
  }
}

export async function userInfoCommandText(api, message, aliasCommand) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  let content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  content = content.replace(`${prefix}${aliasCommand}`, "").trim();
  content = content.replace("text", "").trim();

  try {
    let targetUserId =
      message.data.mentions?.[0]?.uid ||
      (content === "-f" ? message.data?.idTo || threadId : content ? content : senderId);
    if (targetUserId === threadId && message.type === 1) {
      targetUserId = senderId;
    }
    const userInfo = await getUserInfoAcrossBots(api, targetUserId);
    if (!userInfo) {
      await sendErrorMessage(api, message, threadId, "❌ Không thể lấy thông tin người dùng này.");
      return;
    }
    let userInfoText = deepStringifyJSON(userInfo, 2).replaceAll(`"`, "");
    // Object.entries(userInfo)
    //   .map(([key, value]) => `${key}: ${deepStringifyJSON(value.toString())}`)
    //   .join("\n");
    await api.sendMessage({ msg: userInfoText, ttl: 6000000  }, threadId, message.type);
  } catch (error) {
    console.error("Lỗi khi lấy thông tin người dùng:", error);
    await sendErrorMessage(
      api,
      message,
      threadId,
      "❌ Đã xảy ra lỗi khi lấy thông tin người dùng. Vui lòng thử lại sau."
    );
  }
}

export async function getUsersInfoBasic(api, userIds) {
  const userInfoResponse = await api.getInfoMembers(userIds);
  return userInfoResponse.profiles;
}

export async function getUserInfoBasic(api, userId) {
  const cacheKey = `${api.getBotId()}:${userId}`;
  const cached = basicUserCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < BASIC_USER_TTL_MS) return cached.data;
  if (basicUserRequests.has(cacheKey)) return basicUserRequests.get(cacheKey);

  const request = api.getInfoMembers([userId])
    .then((response) => {
      const data = response.profiles[userId] || Object.values(response.profiles || {})[0];
      if (data) {
        basicUserCache.set(cacheKey, { data, timestamp: Date.now() });
        while (basicUserCache.size > BASIC_USER_CACHE_SIZE) {
          basicUserCache.delete(basicUserCache.keys().next().value);
        }
      }
      return data;
    })
    .catch((error) => {
      if (cached) return cached.data;
      throw error;
    })
    .finally(() => basicUserRequests.delete(cacheKey));
  basicUserRequests.set(cacheKey, request);
  return request;
  // {
  //   displayName:
  //   zaloName:
  //   avatar:
  //   accountStatus:
  //   type:
  //   lastUpdateTime:
  //   globalId:
  //   id:
  // }
}

export async function getUsersInfoData(api, userIds) {
  const [userInfoResponse, basicInfoResponse] = await Promise.all([
    api.getUserInfo(userIds),
    api.getInfoMembers(userIds).catch(() => ({ profiles: {} })),
  ]);
  let objDataUser = {};
  for (const idx in userIds) {
    const userId = userIds[idx];
    let avatarResponse = null;
    try {
      avatarResponse = await api.getUserAvatar(userId);
    } catch {}
    const userInfo = userInfoResponse.unchanged_profiles?.[userId] || userInfoResponse.changed_profiles?.[userId];
    const basicInfo = basicInfoResponse.profiles?.[userId];
    const avatarFull = getBestAvatarUrl(avatarResponse, true);
    objDataUser[userId] = getAllInfoUser({
      ...userInfo,
      globalId: userInfo?.globalId || userInfo?.global_id || basicInfo?.globalId || basicInfo?.global_id,
      avatarFull: avatarFull || userInfo?.avatar || basicInfo?.avatar,
      avatarFallback: basicInfo?.avatar || userInfo?.avatar,
    });
  }
  return objDataUser;
}

export async function getUserInfoData(api, userId) {
  let realUserId = userId;
  if (/^\d{10}$/.test(userId)) {
    try {
      const foundUser = await api.findUser(userId);
      if (foundUser && foundUser.uid) {
        realUserId = foundUser.uid;
      }
    } catch (e) {
      return null;
    }
  }
  const userInfoResponse = await api.getUserInfo(realUserId);
  let avatarResponse = null;
  try {
    avatarResponse = await api.getUserAvatar(realUserId);
  } catch {}
  const userInfo = userInfoResponse.unchanged_profiles?.[realUserId] || userInfoResponse.changed_profiles?.[realUserId];
  if (!userInfo) return null;
  let basicInfo = null;
  try {
    const basicInfoResponse = await api.getInfoMembers([realUserId]);
    basicInfo = basicInfoResponse.profiles?.[realUserId] || null;
  } catch {}
  const avatarFull = getBestAvatarUrl(avatarResponse, true);
  return getAllInfoUser({
    ...basicInfo,
    ...userInfo,
    globalId: userInfo?.globalId || userInfo?.global_id || basicInfo?.globalId || basicInfo?.global_id,
    avatarFull: avatarFull || userInfo?.avatar || basicInfo?.avatar,
    avatarFallback: basicInfo?.avatar || userInfo?.avatar,
    cover: getBestCoverUrl([userInfo, basicInfo, avatarResponse]),
  });
}

// UID người dùng có thể chỉ hợp lệ với một bot cụ thể. Khi bot hiện tại
// không tra được, thử các bot đang chạy trong cùng hệ thống.
export async function getUserInfoAcrossBots(api, userId) {
  userId = String(userId || "").replace(/^private:[^:]+:/, "").replace(/_0$/, "");
  if (!userId || !/^\d+$/.test(userId)) return null;

  const withTimeout = (promise, ms = 2000) =>
    Promise.race([
      promise,
      new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), ms);
        timer?.unref?.();
      }),
    ]).catch(() => null);

  try {
    const direct = await withTimeout(getUserInfoData(api, userId), 2000);
    if (direct) return direct;
  } catch {}
  try {
    const response = await withTimeout(api.getInfoMembers([userId]), 2000);
    const profile = response?.profiles?.[userId] || Object.values(response?.profiles || {})[0];
    if (profile) return getAllInfoUser(profile);
  } catch {}
  const managers = Object.values(apiManager?.apiManagerObject || {});
  for (const manager of managers) {
    const otherApi = manager?.apiZalo;
    if (!otherApi || otherApi === api) continue;
    if (!otherApi.cookie || !otherApi.secretKey) continue;
    try {
      const info = await withTimeout(getUserInfoData(otherApi, userId), 1500);
      if (info) return info;
    } catch {}
    try {
      const response = await withTimeout(otherApi.getInfoMembers([userId]), 1500);
      const profile = response?.profiles?.[userId] || Object.values(response?.profiles || {})[0];
      if (profile) return getAllInfoUser(profile);
    } catch {}
  }
  return null;
}

function getBestAvatarUrl(data, acceptAnyImageUrl = false) {
  const candidates = [];
  const visited = new Set();

  function walk(value, key = "", depth = 0) {
    if (depth > 5 || value == null) return;
    if (typeof value === "string") {
      const normalizedUrl = value.trim().replace(/\\\//g, "/").replace(/^\/\//, "https://");
      const normalizedKey = String(key).toLowerCase();
      const hint = `${normalizedKey} ${normalizedUrl}`.toLowerCase();
      const isCoverImage = /(cover|background|wallpaper|banner|bg[_-]?profile|profile[_-]?bg)/.test(hint);
      if (/^https?:\/\//i.test(normalizedUrl) && !isCoverImage &&
          (acceptAnyImageUrl || /(avatar|avt|profile|photo|image|zalo|jpg|jpeg|png|webp)/i.test(hint))) {
        let score = 0;
        if (/(full|original|origin|large|720|1080|2048|high)/.test(hint)) score += 100;
        if (/(avatar|avt|profile)/.test(hint)) score += 30;
        if (/(thumb|thumbnail|small|25|50|75|100|120)/.test(hint)) score -= 80;
        const sizes = [...hint.matchAll(/(?:^|[^\d])(\d{2,4})[x_](\d{2,4})(?:[^\d]|$)/g)];
        for (const match of sizes) score += Math.min(80, (Number(match[1]) * Number(match[2])) / 10000);
        candidates.push({ url: normalizedUrl, score });
      }
      return;
    }
    if (typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    for (const [childKey, childValue] of Object.entries(value)) walk(childValue, `${key}.${childKey}`, depth + 1);
  }

  walk(deepParseJSON(data));
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.url || null;
}

function getBestCoverUrl(data) {
  const candidates = [];
  const visited = new Set();

  function walk(value, key = "", depth = 0) {
    if (depth > 6 || value == null) return;
    if (typeof value === "string") {
      const url = value.trim().replace(/\\\//g, "/").replace(/^\/\//, "https://");
      const hint = `${key} ${url}`.toLowerCase();
      if (/^https?:\/\//i.test(url) && /(cover|background|wallpaper|banner|bg[_-]?profile|profile[_-]?bg)/.test(hint)) {
        let score = 0;
        if (/(cover|bg_profile|background)/.test(hint)) score += 80;
        if (/(full|original|origin|large|720|1080|2048|high)/.test(hint)) score += 60;
        if (/(thumb|thumbnail|small|50|100|120)/.test(hint)) score -= 50;
        candidates.push({ url, score });
      }
      return;
    }
    if (typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    for (const [childKey, childValue] of Object.entries(value)) {
      walk(childValue, `${key}.${childKey}`, depth + 1);
    }
  }

  walk(deepParseJSON(data));
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.url || null;
}

export function getAllInfoUser(userInfo) {
  const currentTime = Date.now();
  const lastActionTime = userInfo.lastActionTime || 0;
  const isOnline = currentTime - lastActionTime <= 180000;

  const cover = userInfo.cover || getBestCoverUrl(userInfo);
  const avatarCandidates = [
    userInfo.avatarFull,
    userInfo.bk_full_avatar,
    getBestAvatarUrl(userInfo),
    userInfo.avatarFallback,
    userInfo.avatar,
  ].filter(Boolean);
  const bestAvatar = avatarCandidates.find((url) => normalizeImageUrl(url) !== normalizeImageUrl(cover)) || null;
  return {
    title: "Thông Tin Người Dùng",
    uid: userInfo.userId || "Không xác định",
    globalId: userInfo.globalId || userInfo.global_id || null,
    name: formatName(userInfo.zaloName),
    avatar: bestAvatar,
    avatarFallback: userInfo.avatarFallback,
    cover,
    avatarFull: bestAvatar,
    gender: formatGender(userInfo.gender),
    genderId: userInfo.gender,
    ...getBusinessAccount(userInfo),
    isActive: userInfo.isActive,
    isActivePC: userInfo.isActivePC,
    isActiveWeb: userInfo.isActiveWeb,
    isValid: userInfo.isValid,
    username: userInfo.username || userInfo.userName || "Ẩn",
    bizPkg: userInfo.bizPkg,
    birthday: formatDate(userInfo.dob || userInfo.sdob) || "Ẩn",
    phone: userInfo.phone || "Ẩn",
    lastActive: formatTimestamp(userInfo.lastActionTime),
    createdDate: formatTimestamp(userInfo.createdTs),
    bio: userInfo.status || "Không có thông tin bio",
    isOnline: isOnline,
    footer: `${randomEmoji()} Chúc bạn một ngày tốt lành!`,
  };
}

function normalizeImageUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(String(url).trim().replace(/\\\//g, "/").replace(/^\/\//, "https://"));
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return String(url).trim();
  }
}

function randomEmoji() {
  const emojis = ["😊", "🌟", "🎉", "🌈", "🌺", "🍀", "🌞", "🌸"];
  return emojis[Math.floor(Math.random() * emojis.length)];
}

function formatName(name) {
  const safeName = name || "Không xác định";
  return safeName.length > 30 ? safeName.slice(0, 27) + "..." : safeName;
}

function formatGender(gender) {
  return gender === 0 ? "Nam 👨" : gender === 1 ? "Nữ 👩" : "Không xác định 🤖";
}

function formatTimestamp(timestamp) {
  if (typeof timestamp === "number") {
    timestamp = timestamp > 1e10 ? timestamp / 1000 : timestamp;
    const date = new Date(timestamp * 1000);
    return date.toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }
  return "Ẩn";
}

function formatDate(date) {
  if (typeof date === "number") {
    const dateObj = new Date(date * 1000);
    return dateObj.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }
  return date || "Ẩn";
}

async function sendErrorMessage(api, message, threadId, errorMsg) {
  await api.sendMessage({ msg: errorMsg, quote: message }, threadId, message.type);
}

/**
 * Lấy globalId (UID toàn cục Zalo) của user từ cache — không gọi API.
 * globalId giống nhau trên mọi bot account, dùng để block toàn hệ thống.
 * @param {string} botId - botId của bot đang xử lý
 * @param {string} userId - UID local của user (theo góc nhìn bot này)
 * @returns {string|null} globalId hoặc null nếu chưa có trong cache
 */
export function getCachedGlobalId(botId, userId) {
  const normalizedId = String(userId || "").replace(/_0$/, "");
  const cacheKey = `${botId}:${normalizedId}`;
  const cache = globalThis.__basicUserCache || basicUserCache;
  if (!cache) return null;
  const cached = cache.get(cacheKey)?.data;
  if (cached) {
    const gid = cached.globalId || cached.global_id;
    return gid ? String(gid) : null;
  }
  // Thử cả key với _0 suffix
  const cacheKeyWithSuffix = `${botId}:${normalizedId}_0`;
  const cachedWithSuffix = cache.get(cacheKeyWithSuffix)?.data;
  if (cachedWithSuffix) {
    const gid = cachedWithSuffix.globalId || cachedWithSuffix.global_id;
    return gid ? String(gid) : null;
  }
  return null;
}
