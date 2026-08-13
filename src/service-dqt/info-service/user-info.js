import * as cv from "../../utils/canvas/index.js";
import { deepParseJSON, deepStringifyJSON, removeMention } from "../../utils/format-util.js";
import { getGlobalPrefix } from "../service.js";

export async function userInfoCommand(api, message, aliasCommand) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  let content = removeMention(message);
  const prefix = getGlobalPrefix(api.getBotId());
  content = content.replace(`${prefix}${aliasCommand}`, "").trim();
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

    const userInfo = await getUserInfoData(api, targetUserId);
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
    const targetUserId =
      message.data.mentions?.[0]?.uid ||
      (content === "-f" ? message.data?.idTo || threadId : content ? content : senderId);
    if (targetUserId === threadId && message.type === 1) {
      targetUserId = senderId;
    }
    const userInfo = await getUserInfoData(api, targetUserId);
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
  const userInfoResponse = await api.getInfoMembers([userId]);
  const userInfo = userInfoResponse.profiles[userId];
  return userInfo;
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
  let basicInfo = null;
  try {
    const basicInfoResponse = await api.getInfoMembers([realUserId]);
    basicInfo = basicInfoResponse.profiles?.[realUserId] || Object.values(basicInfoResponse.profiles || {})[0];
  } catch {}
  const avatarFull = getBestAvatarUrl(avatarResponse, true);
  return getAllInfoUser({
    ...userInfo,
    avatarFull: avatarFull || userInfo?.avatar || basicInfo?.avatar,
    avatarFallback: basicInfo?.avatar || userInfo?.avatar,
  });
}

function getBestAvatarUrl(data, acceptAnyImageUrl = false) {
  const candidates = [];
  const visited = new Set();

  function walk(value, key = "", depth = 0) {
    if (depth > 5 || value == null) return;
    if (typeof value === "string") {
      const normalizedUrl = value.trim().replace(/\\\//g, "/").replace(/^\/\//, "https://");
      const hint = `${key} ${normalizedUrl}`.toLowerCase();
      if (/^https?:\/\//i.test(normalizedUrl) && !/(cover|background|wallpaper)/.test(key) &&
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

export function getAllInfoUser(userInfo) {
  const currentTime = Date.now();
  const lastActionTime = userInfo.lastActionTime || 0;
  const isOnline = currentTime - lastActionTime <= 180000;

  const bestAvatar = userInfo.avatarFull || userInfo.bk_full_avatar || getBestAvatarUrl(userInfo) || userInfo.avatar;
  return {
    title: "Thông Tin Người Dùng",
    uid: userInfo.userId || "Không xác định",
    name: formatName(userInfo.zaloName),
    avatar: bestAvatar,
    avatarFallback: userInfo.avatarFallback,
    cover: userInfo.cover,
    avatarFull: bestAvatar,
    gender: formatGender(userInfo.gender),
    genderId: userInfo.gender,
    businessAccount: userInfo.bizPkg?.label ? "Có" : "Không",
    businessType: getTextTypeBusiness(userInfo.bizPkg.pkgId),
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

function getTextTypeBusiness(type) {
  return type === 1 ? "Basic" : type === 3 ? "Pro" : type === 2 ? "Không xác định" : "Chưa Đăng Ký";
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
