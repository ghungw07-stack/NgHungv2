import fs from "fs";
import path from "path";
import { JSON_DATA_PATH } from "../../../../utils/io-json.js";

const CONFIGS_DIR = path.join(JSON_DATA_PATH, "voice-configs");
const DEFAULT_CONFIG_PATH = path.join(JSON_DATA_PATH, "vclip-config.json");
const SCHEMA_VERSION = 2;

const DEFAULT_CONFIG = Object.freeze({
  _version: SCHEMA_VERSION,
  apiKey: "",
  baseURL: "https://api-tts.vclip.io",
  characterLimit: 1000,
  voices: [],
  vipUsers: {},
  performance: {
    responseTimeout: 60000,
    retryAttempts: 30,
  },
  stats: {
    totalRequests: 0,
    totalChars: 0,
    totalErrors: 0,
    lastReset: 0,
    userStats: {},
  },
  lastVoice: null,
});


const cache = new Map();

function ensureDir() {
  if (!fs.existsSync(CONFIGS_DIR)) fs.mkdirSync(CONFIGS_DIR, { recursive: true });
}

function pathOf(botId) {
  return path.join(CONFIGS_DIR, `${botId}.json`);
}

function cloneDefault() {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

/** Merge raw config từ disk với default để đảm bảo đủ field. */
function withDefaults(raw) {
  const base = cloneDefault();
  if (!raw || typeof raw !== "object") return base;
  return {
    ...base,
    ...raw,
    _version: SCHEMA_VERSION,
    performance: { ...base.performance, ...(raw.performance || {}) },
    stats: {
      ...base.stats,
      ...(raw.stats || {}),
      userStats: { ...(raw.stats?.userStats || {}) },
    },
    vipUsers: { ...(raw.vipUsers || {}) },
    voices: Array.isArray(raw.voices) ? raw.voices : [],
  };
}

function readFromDisk(botId) {
  const file = pathOf(botId);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (err) {
    console.error(`[voice-config] Đọc lỗi ${botId}.json:`, err.message);
    return null;
  }
}

function writeToDisk(botId, config) {
  ensureDir();
  const target = pathOf(botId);
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, target);
  try { fs.chmodSync(target, 0o600); } catch {}
}

/** Đọc factory default từ vclip-config.json (in-memory, không bao giờ ghi). */
function readDefaultFromDisk() {
  if (!fs.existsSync(DEFAULT_CONFIG_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(DEFAULT_CONFIG_PATH, "utf-8"));
  } catch (err) {
    console.error(`[voice-config] Đọc lỗi vclip-config.json:`, err.message);
    return null;
  }
}

/** Config có "đủ dùng" không (có apiKey hoặc có voices). */
function isUsable(raw) {
  return !!(raw && (raw.apiKey || (Array.isArray(raw.voices) && raw.voices.length)));
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Lấy config của 1 bot.
 *  - Có file riêng (apiKey hoặc voices) → dùng file đó.
 *  - Không có / rỗng → load `vclip-config.json` làm default (in-memory).
 *  - Không có cả default → trả về DEFAULT_CONFIG rỗng.
 * Stats/lastVoice của bot luôn ưu tiên giữ kể cả khi đang dùng default.
 */
export function getVoiceConfig(botId) {
  if (!botId) throw new Error("getVoiceConfig: thiếu botId");
  const key = String(botId);
  if (cache.has(key)) return cache.get(key);

  const botRaw = readFromDisk(key);
  let merged;

  if (isUsable(botRaw)) {
    merged = withDefaults(botRaw);
  } else {
    const defaultRaw = readDefaultFromDisk();
    if (isUsable(defaultRaw)) {
      merged = withDefaults(defaultRaw);
      // Giữ stats/vipUsers/lastVoice riêng của bot (nếu file bot tồn tại nhưng thiếu apiKey/voices)
      if (botRaw) {
        if (botRaw.stats) {
          merged.stats = { ...merged.stats, ...botRaw.stats, userStats: { ...(botRaw.stats.userStats || {}) } };
        }
        if (botRaw.vipUsers) merged.vipUsers = { ...botRaw.vipUsers };
        if (botRaw.lastVoice) merged.lastVoice = botRaw.lastVoice;
      }
    } else {
      merged = withDefaults(botRaw);
    }
  }

  cache.set(key, merged);
  return merged;
}

/** Bot này đã có file riêng "đủ dùng" (apiKey hoặc voices) chưa? */
export function hasBotConfig(botId) {
  return isUsable(readFromDisk(String(botId)));
}

/** Có factory default (vclip-config.json) "đủ dùng" không? */
export function hasDefaultConfig() {
  return isUsable(readDefaultFromDisk());
}

/** Lưu config + invalidate cache. */
export function saveVoiceConfig(botId, config) {
  if (!botId) throw new Error("saveVoiceConfig: thiếu botId");
  const merged = withDefaults(config);
  writeToDisk(String(botId), merged);
  cache.set(String(botId), merged);
  return merged;
}

export function clearVoiceConfigCache(botId) {
  if (botId) cache.delete(String(botId));
  else cache.clear();
}

/** Reset config của bot về default (file vẫn tồn tại nhưng rỗng). */
export function clearVoiceConfig(botId) {
  return saveVoiceConfig(botId, cloneDefault());
}

/** Update 1 field cấp 1 của config. */
export function updateVoiceConfig(botId, key, value) {
  const config = getVoiceConfig(botId);
  switch (key) {
    case "characterLimit":
      config.characterLimit = Math.max(1, parseInt(value, 10) || DEFAULT_CONFIG.characterLimit);
      break;
    case "apiKey":
    case "baseURL":
      config[key] = String(value || "");
      break;
    case "performance":
      config.performance = { ...config.performance, ...(value || {}) };
      break;
    default:
      throw new Error(`updateVoiceConfig: key không hỗ trợ "${key}"`);
  }
  return saveVoiceConfig(botId, config);
}

// ─── Voices ────────────────────────────────────────────────────────────────

export function getVoicesByBot(botId) {
  return getVoiceConfig(botId).voices;
}

export function getRandomVoiceByBot(botId) {
  const voices = getVoicesByBot(botId);
  if (!voices.length) return null;
  return voices[Math.floor(Math.random() * voices.length)];
}

export function addVoiceToConfig(botId, id, name) {
  const config = getVoiceConfig(botId);
  if (!config.voices.find((v) => v.id === String(id))) {
    config.voices.push({ id: String(id), name: String(name) });
    saveVoiceConfig(botId, config);
  }
  return config;
}

/** Xoá voice theo id hoặc index (1-based). */
export function removeVoiceFromConfig(botId, idOrIndex) {
  const config = getVoiceConfig(botId);
  const idx = parseInt(idOrIndex, 10);
  if (!isNaN(idx) && idx >= 1 && idx <= config.voices.length) {
    config.voices.splice(idx - 1, 1);
  } else {
    config.voices = config.voices.filter((v) => v.id !== String(idOrIndex));
  }
  return saveVoiceConfig(botId, config);
}

// ─── VIP users ─────────────────────────────────────────────────────────────

export function getUserVIPConfig(botId, userId) {
  return getVoiceConfig(botId).vipUsers[String(userId)] || null;
}

export function getVIPListByBot(botId) {
  return getVoiceConfig(botId).vipUsers;
}

/**
 * Thêm/cập nhật VIP user. Field hỗ trợ:
 *   { apiKey?, baseURL?, model?, limitPerDay, enabled, expiresAt }
 * `expiresAt = 0` nghĩa là không hết hạn.
 */
export function addUserVIP(botId, userId, vip = {}) {
  const config = getVoiceConfig(botId);
  config.vipUsers[String(userId)] = {
    apiKey: vip.apiKey || "",
    baseURL: vip.baseURL || "",
    model: vip.model || "",
    limitPerDay: Number(vip.limitPerDay) || 10000,
    enabled: vip.enabled !== false,
    expiresAt:
      vip.expiresAt === 0
        ? 0
        : vip.expiresAt || Date.now() + 30 * 24 * 60 * 60 * 1000, // mặc định 30 ngày
  };
  saveVoiceConfig(botId, config);
  return config.vipUsers[String(userId)];
}

export function removeUserVIP(botId, userId) {
  const config = getVoiceConfig(botId);
  if (config.vipUsers[String(userId)]) {
    delete config.vipUsers[String(userId)];
    saveVoiceConfig(botId, config);
    return true;
  }
  return false;
}

// ─── Stats & daily limit ───────────────────────────────────────────────────

/** Cập nhật stats sau khi user dùng voice xong. */
export function setLastVoiceUser(botId, userId, userName, charsUsed = 0) {
  const config = getVoiceConfig(botId);
  const uid = String(userId);

  config.lastVoice = {
    userName: String(userName || ""),
    userId: uid,
    time: Date.now(),
    voiceUsed: (config.lastVoice?.voiceUsed || 0) + 1,
    totalChars: (config.lastVoice?.totalChars || 0) + charsUsed,
  };

  config.stats.totalRequests = (config.stats.totalRequests || 0) + 1;
  config.stats.totalChars = (config.stats.totalChars || 0) + charsUsed;

  if (!config.stats.userStats[uid]) {
    config.stats.userStats[uid] = { usedToday: 0, lastUse: 0 };
  }
  config.stats.userStats[uid].usedToday += charsUsed;
  config.stats.userStats[uid].lastUse = Date.now();

  saveVoiceConfig(botId, config);
  return config.lastVoice;
}

export function getLastVoiceUser(botId) {
  return getVoiceConfig(botId).lastVoice;
}

/** Reset usedToday của user nếu đã sang ngày mới (so với lastUse của user đó). */
export function checkAndResetDailyLimit(botId, userId) {
  const config = getVoiceConfig(botId);
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const uid = String(userId);
  const userStats = config.stats.userStats[uid] || { usedToday: 0, lastUse: 0 };

  if (userStats.lastUse && Date.now() - userStats.lastUse > ONE_DAY) {
    userStats.usedToday = 0;
    config.stats.userStats[uid] = userStats;
    saveVoiceConfig(botId, config);
  }

  return {
    usedToday: userStats.usedToday,
    limit: config.characterLimit,
    remaining: Math.max(0, config.characterLimit - userStats.usedToday),
    isVIP: false,
  };
}

/** Lấy limit còn lại của user — tự apply VIP nếu user là VIP đang active. */
export function getRemainingLimit(botId, userId) {
  const config = getVoiceConfig(botId);
  const vip = config.vipUsers[String(userId)];
  const vipActive =
    vip && vip.enabled && (vip.expiresAt === 0 || vip.expiresAt > Date.now());

  if (vipActive) {
    const stats = config.stats.userStats[String(userId)] || { usedToday: 0, lastUse: 0 };
    return {
      usedToday: stats.usedToday,
      limit: vip.limitPerDay,
      remaining: Math.max(0, vip.limitPerDay - stats.usedToday),
      isVIP: true,
    };
  }
  return checkAndResetDailyLimit(botId, userId);
}
