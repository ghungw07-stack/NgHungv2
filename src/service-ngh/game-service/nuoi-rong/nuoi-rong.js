/**
 * ĐẢO RỒNG — BERK: Game nuôi rồng (kiểu Take Care For Groups)
 *
 * Vào đảo bằng lệnh {prefix}nuoirong (alias: nr / daorong / rong).
 * Khi đã ở trên đảo: gõ thẳng lệnh, KHÔNG cần prefix:
 *   diemdanh · lich · choan <rồng> <số> · vuotve <rồng> · ai · quay · no · ap
 *   list · xem <mã> · tienhoa <mã> · sanh · thu · gauntlet <mã> · nhiemvu · top · help · roi
 *
 * Tên bot trong mọi tin nhắn lấy từ nameServer (src/database/index.js) — KHÔNG hardcode.
 * Author: KairoDev
 */
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import schedule from "node-schedule";
import chalk from "chalk";
import { MultiMsgStyle, MessageStyle, MessageType } from "../../../api-zalo/index.js";
import { nameServer } from "../../../database/index.js";
import { isAdmin } from "../../../index.js";
import { getGlobalPrefix } from "../../service.js";
import { getTimeNow, removeMention } from "../../../utils/format-util.js";
import { clearImagePath } from "../../../utils/canvas/index.js";
import {
  RARITIES, ROLES, SPECIES, EGG_POOLS, EGG_HATCH_TIME, EGG_NAMES,
  DRAGON_LEVEL_CAP, EVOLVE_GATES, feedCostForLevel, playerXpNeed, dragonStats,
  stageEnemy, stageRewards, WHEEL_TIERS, DAILY_QUESTS,
  CHECKIN_BASE_GOLD, CHECKIN_STREAK_BONUS, CHECKIN_STREAK_BONUS_CAP, MONTH_MILESTONES,
  PET_COOLDOWN_MS, PET_REWARD_FISH, PET_BOND_XP, BOND_XP_PER_LEVEL, PET_BUFF_PCT, PET_BUFF_MS,
  IDLE_CAP_MS, idleGoldPerHour, hallUpgradeCost, HALL_MAX,
  GAUNTLET_RUNS_PER_DAY, gauntletWaveEnemy, gauntletWaveReward,
  STARTER, SESSION_IDLE_MS,
} from "./data-nuoi-rong.js";
import { drawIslandCard, drawWheelCard, drawEggHatchCard, drawDragonDetailCard } from "./cv-nuoi-rong.js";

const COLOR_RED = "db342e";
const SIZE_18 = "18";
const IS_BOLD = true;
export const TIME_TO_LIVE = 10800000; // 3h
const TTL_SHORT = 120000;

const SEP = "─────────────────────────";

// ==================== LƯU TRỮ ====================
const DATA_DIR = path.join(process.cwd(), "assets", "json-data");
const DATA_FILE_PATH = path.join(DATA_DIR, "nuoi-rong.json");

function readSnapshot(file, fallback) {
  try {
    return JSON.parse(fsSync.readFileSync(file, "utf8"));
  } catch {
    return structuredClone(fallback);
  }
}

function writeSnapshot(file, value) {
  fsSync.mkdirSync(path.dirname(file), { recursive: true });
  const temporaryFile = `${file}.tmp`;
  fsSync.writeFileSync(temporaryFile, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fsSync.renameSync(temporaryFile, file);
}

const state = { data: null, dirty: false, loading: null };
let saveJob = null;

async function loadData() {
  const parsed = readSnapshot(DATA_FILE_PATH, {players:{},sessions:{}});
  return {players:parsed.players||{},sessions:parsed.sessions||{}};
}

async function flushData() {
  if (!state.dirty || !state.data) return;
  state.dirty = false;
  try {
    await fs.mkdir(path.dirname(DATA_FILE_PATH), { recursive: true });
    writeSnapshot(DATA_FILE_PATH, state.data);
  } catch (error) {
    console.error("Lỗi ghi dữ liệu nuôi rồng:", error);
  }
}

async function ensureLoaded() {
  if (state.data) return state.data;
  if (!state.loading) state.loading = loadData().then((d) => ((state.data = d), d));
  return state.loading;
}

function markDirty() {
  state.dirty = true;
  if (state.data) { writeSnapshot(DATA_FILE_PATH,state.data); state.dirty=false; }
}

export async function initializeNuoiRongService() {
  await ensureLoaded();
  if (saveJob) saveJob.cancel();
  saveJob = schedule.scheduleJob("*/5 * * * * *", flushData);
  console.log(chalk.magentaBright("Khởi động và nạp dữ liệu game Nuôi Rồng (Đảo Rồng) hoàn tất"));
}

// ==================== TIỆN ÍCH ====================
const fmt = (n) => Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

function todayStr() {
  const d = getTimeNow();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function monthStr() {
  const d = getTimeNow();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function dayMonthLabel() {
  const d = getTimeNow();
  return `${d.getDate()}/${d.getMonth() + 1}`;
}
function fmtDur(ms) {
  ms = Math.max(0, ms);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0) return `${h}h${m}m`;
  if (m > 0) return `${m}p${s}s`;
  return `${s}s`;
}
function genCode(player) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while ((player.dragons || []).some((d) => d.code === code));
  return code;
}
function weightedPick(items, weightOf) {
  const total = items.reduce((s, it) => s + weightOf(it), 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= weightOf(it);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}
function pickSpeciesFromPool(poolKey) {
  const pool = EGG_POOLS[poolKey] || EGG_POOLS.common;
  const rarKeys = Object.keys(pool);
  const rarity = weightedPick(rarKeys, (k) => pool[k]);
  const candidates = Object.values(SPECIES).filter((s) => s.rarity === rarity);
  const sp = candidates[Math.floor(Math.random() * candidates.length)] || SPECIES.sw2;
  return sp;
}

// ==================== NGƯỜI CHƠI ====================
function newDragon(player, speciesKey, rarityKey = null) {
  const sp = SPECIES[speciesKey] || SPECIES.sw2;
  return {
    code: genCode(player),
    species: sp.key,
    rarity: rarityKey || sp.rarity,
    level: 1,
    bondXp: 0,
    bondLevel: 0,
    evolves: 0,
    restUntil: 0,
    lastPet: 0,
    hatchedAt: Date.now(),
  };
}

function ensurePlayer(data, uid, name) {
  if (!data.players[uid]) {
    const player = {
      name: name || String(uid),
      createdAt: Date.now(),
      level: 1,
      xp: 0,
      gold: STARTER.gold,
      fish: STARTER.fish,
      gem: STARTER.gem,
      stone: STARTER.stone,
      amber: STARTER.amber,
      hpTinh: STARTER.hpTinh,
      vikings: STARTER.vikings,
      season: STARTER.season,
      stage: 1,
      hall: 1,
      buildings: { chuong: 1, aoca: 1, loap: 1 },
      incubator: [],
      eggStorage: [],
      dragons: [],
      tickets: { low: 0, mid: 0, high: 0 },
      trust: {},
      buffs: { idleUntil: 0 },
      lastCollect: Date.now(),
      daily: null,
      checkin: { last: null, streak: 0, monthDays: {}, milestonesClaimed: {} },
      stats: { fights: 0, wins: 0, hatches: 0 },
    };
    player.dragons.push(newDragon(player, STARTER.species));
    player.incubator.push({ pool: "starter", startAt: Date.now(), hatchMs: EGG_HATCH_TIME.starter });
    data.players[uid] = player;
    markDirty();
  }
  const player = data.players[uid];
  if (name && player.name !== name) {
    player.name = name;
    markDirty();
  }
  ensureDaily(player);
  return player;
}

function ensureDaily(player) {
  const today = todayStr();
  if (!player.daily || player.daily.date !== today) {
    player.daily = { date: today, progress: {}, claimed: [], freeSpinUsed: false, gauntletUsed: 0 };
    markDirty();
  }
  return player.daily;
}

function addQuestProgress(player, counter, amount = 1) {
  const daily = ensureDaily(player);
  daily.progress[counter] = (daily.progress[counter] || 0) + amount;
  markDirty();
}

function claimableQuests(player) {
  const daily = ensureDaily(player);
  return DAILY_QUESTS.filter(
    (q) => !daily.claimed.includes(q.id) && (daily.progress[q.counter] || 0) >= q.target
  );
}

function addPlayerXp(player, xp) {
  player.xp += xp;
  const lines = [];
  while (player.xp >= playerXpNeed(player.level)) {
    player.xp -= playerXpNeed(player.level);
    player.level += 1;
    player.vikings += 1;
    lines.push(`🆙 Đảo lên Cấp ${player.level}! (+1 👥 Dân Viking)`);
  }
  markDirty();
  return lines;
}

function grantReward(player, reward) {
  if (!reward) return;
  if (reward.gold) player.gold += reward.gold;
  if (reward.fish) player.fish += reward.fish;
  if (reward.gem) player.gem += reward.gem;
  if (reward.stone) player.stone += reward.stone;
  if (reward.amber) player.amber += reward.amber;
  if (reward.ticketLow) player.tickets.low += reward.ticketLow;
  if (reward.ticketMid) player.tickets.mid += reward.ticketMid;
  if (reward.ticketHigh) player.tickets.high += reward.ticketHigh;
  if (reward.eggEpic) addEgg(player, "epic");
  markDirty();
}

function addEgg(player, poolKey) {
  const slots = player.buildings.loap || 1;
  if (player.incubator.length < slots) {
    player.incubator.push({ pool: poolKey, startAt: Date.now(), hatchMs: EGG_HATCH_TIME[poolKey] || EGG_HATCH_TIME.common });
    markDirty();
    return "incubating";
  }
  player.eggStorage.push(poolKey);
  markDirty();
  return "stored";
}

function readyEggs(player) {
  const now = Date.now();
  return player.incubator.filter((e) => now - e.startAt >= e.hatchMs);
}

// Rồng đang đứng ở mốc tiến hóa và CHƯA tiến hóa đủ số lần cho mốc đó
function needEvolveAtGate(dragon) {
  return (dragon.evolves || 0) < (dragon.level >= 20 ? 2 : 1);
}

function findDragon(player, query) {
  if (!query) return null;
  const q = query.toLowerCase().replace(/^#/, "");
  const dragons = [...player.dragons].sort((a, b) => b.level - a.level);
  return (
    dragons.find((d) => d.code === q) ||
    dragons.find((d) => d.code.endsWith(q) || d.code.startsWith(q)) ||
    dragons.find((d) => d.species.startsWith(q)) ||
    dragons.find((d) => {
      const sp = SPECIES[d.species];
      return (
        sp &&
        (sp.name.toLowerCase().includes(q) || (sp.nickname || "").toLowerCase().includes(q))
      );
    }) ||
    null
  );
}

function dragonLabel(dragon) {
  const sp = SPECIES[dragon.species] || SPECIES.sw2;
  return sp.nickname ? `${sp.name} (${sp.nickname})` : sp.name;
}

function starsText(dragon) {
  const total = 5;
  const rarity = RARITIES[dragon.rarity] || RARITIES.thuong;
  const filled = Math.min(total, rarity.stars + (dragon.evolves || 0));
  return "★".repeat(filled) + "☆".repeat(total - filled);
}

// ==================== GỬI TIN NHẮN (nameServer từ src, style đỏ đậm) ====================
async function sendGameMessage(api, message, caption, { imagePath = null, ttl = TIME_TO_LIVE } = {}) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName || String(senderId);
  const isGroup = message.type === MessageType.GroupMessage;

  const style = MultiMsgStyle([
    MessageStyle(isGroup ? senderName.length + 1 : 0, nameServer.length, COLOR_RED, SIZE_18, IS_BOLD),
  ]);
  const msg = `${isGroup ? senderName + "\n" : ""}${nameServer}\n${caption}`;

  try {
    return await api.sendMessage(
      {
        msg,
        quote: message,
        mentions: isGroup ? [{ pos: 0, uid: senderId, len: senderName.length }] : [],
        style,
        ttl,
        linkOn: false,
        ...(imagePath ? { attachments: [imagePath], isUseProphylactic: true } : {}),
      },
      threadId,
      message.type
    );
  } catch (error) {
    console.error("Lỗi gửi tin nhắn nuôi rồng:", error?.message || error);
  } finally {
    if (imagePath) await clearImagePath(imagePath);
  }
}

async function reactOk(api, message) {
  try {
    await api.addReaction("thanks", message);
  } catch {}
}

// ==================== KHỐI HEADER + GỢI Ý ====================
function headerBlock(player) {
  return (
    `🐉 ${player.name} — Cấp ${player.level}\n` +
    `🪙 Vàng ${fmt(player.gold)}\n` +
    `🐟 Cá ${fmt(player.fish)}\n` +
    `🔷 Đá Tiến Hóa ${fmt(player.stone)}\n` +
    `💎 Ngọc ${fmt(player.gem)}\n` +
    `🗺️ Ải ${player.stage} · 🐲 ${player.dragons.length} rồng · 🏛️ Sảnh ${player.hall}`
  );
}

function buildSuggestions(player, { limit = 4, showStatus = false } = {}) {
  const now = Date.now();
  const daily = ensureDaily(player);
  const lines = [];

  if (showStatus) {
    const ready = player.dragons.filter((d) => d.restUntil <= now).length;
    lines.push(`• 🗺️ Ải hiện tại: ${player.stage} · Rồng sẵn sàng: ${ready}/${player.dragons.length}`);
  }

  const eggsReady = readyEggs(player).length;
  if (eggsReady > 0) lines.push(`• 🐣 no : trứng nở rồi — nhận rồng mới`);

  const claimable = claimableQuests(player);
  if (claimable.length > 0) {
    const q = claimable[0];
    lines.push(`• 🎁 nhiemvu ${q.id} : nhiệm vụ «${q.name}» xong chưa nhận`);
  }

  if (player.checkin.last !== todayStr()) {
    lines.push(`• 📅 diemdanh : điểm danh hôm nay chưa làm`);
  }

  const totalTickets = player.tickets.low + player.tickets.mid + player.tickets.high;
  if (totalTickets > 0) {
    lines.push(`• 🎡 quay : còn ${totalTickets} vé quay thưởng`);
  } else if (!daily.freeSpinUsed) {
    lines.push(`• 🎡 quay : lượt quay miễn phí hôm nay còn`);
  }

  const feedable = player.dragons.find(
    (d) => d.level < DRAGON_LEVEL_CAP && !EVOLVE_GATES[d.level] && player.fish >= feedCostForLevel(d.level)
  );
  if (feedable) {
    lines.push(`• 🍖 choan ${feedable.species} 10 : đủ cá cho ${dragonLabel(feedable)} lên cấp`);
  }
  const gated = player.dragons.find((d) => EVOLVE_GATES[d.level] && needEvolveAtGate(d));
  if (gated) {
    lines.push(`• 🧬 tienhoa ${gated.code} : ${dragonLabel(gated)} chạm mốc Lv${gated.level} — cần ${EVOLVE_GATES[gated.level]}🔷`);
  }

  lines.push(`• ⚔️ ai : đánh ải ${player.stage} kiếm đá quý + vé quay`);

  const pettable = player.dragons.find((d) => now - (d.lastPet || 0) >= PET_COOLDOWN_MS);
  if (pettable) {
    lines.push(`• 🤚 vuotve ${pettable.species} : vuốt ve ${dragonLabel(pettable)} nhận cá + buff vàng`);
  }

  if (daily.gauntletUsed < GAUNTLET_RUNS_PER_DAY) {
    lines.push(`• ⚔️🔥 gauntlet : còn lượt Gauntlet sinh tồn hôm nay — nhớ kèm mã rồng: gauntlet <mã_rồng> (xem mã: list)`);
  }

  if (player.incubator.length === 0) {
    if (player.eggStorage.length > 0) {
      lines.push(`• 🥚 ap : lò ấp trống — ấp trứng mới ngay`);
    } else {
      lines.push(`• 🔥 Lò ấp: 0/${player.buildings.loap} ô · 0 trứng sẵn sàng`);
    }
  }

  const idleGold = calcIdleGold(player);
  if (idleGold >= 500) lines.push(`• 💰 thu : ${fmt(idleGold)} vàng nhàn rỗi đang chờ`);

  return lines.slice(0, limit).join("\n");
}

function composeReply(player, body, { limit = 4, showStatus = false } = {}) {
  return (
    `${SEP}\n` +
    `${headerBlock(player)}\n` +
    `${SEP}\n` +
    `${body}\n` +
    `${SEP}\n` +
    `💡 VIỆC ĐÁNG LÀM NGAY:\n` +
    buildSuggestions(player, { limit, showStatus })
  );
}

// ==================== VÀNG NHÀN RỖI ====================
function calcIdleGold(player) {
  const now = Date.now();
  const elapsed = Math.min(IDLE_CAP_MS, now - (player.lastCollect || now));
  const rate = idleGoldPerHour(player);
  let gold = (rate * elapsed) / 3600000;
  // đơn giản hóa: buff còn hạn thì +10% toàn bộ phần thu
  if ((player.buffs?.idleUntil || 0) > now) gold *= 1 + PET_BUFF_PCT / 100;
  return Math.floor(gold);
}

// ==================== MÔ PHỎNG CHIẾN ĐẤU ====================
function simulateFight(myStats, myRole, foeStats, foeRole) {
  let hp1 = myStats.hp;
  let hp2 = foeStats.hp;
  let atk1 = myStats.atk * (myRole === "tankich" ? 1.15 : 1) * (foeRole === "xaoquyet" ? 0.85 : 1);
  let atk2 = foeStats.atk * (foeRole === "tankich" ? 1.15 : 1) * (myRole === "xaoquyet" ? 0.85 : 1);
  const def1 = myStats.def * (myRole === "phongthu" ? 1.2 : 1);
  const def2 = foeStats.def * (foeRole === "phongthu" ? 1.2 : 1);

  let rounds = 0;
  const MAX_ROUNDS = 15;
  while (rounds < MAX_ROUNDS && hp1 > 0 && hp2 > 0) {
    rounds++;
    const hits = myRole === "tocdo" && Math.random() < 0.25 ? 2 : 1;
    for (let i = 0; i < hits; i++) {
      let dmg = Math.max(6, atk1 * (0.9 + Math.random() * 0.25) - def2 * 0.5);
      if (myRole === "sacben" && Math.random() < 0.2) dmg *= 2;
      hp2 -= dmg;
    }
    if (hp2 <= 0) break;

    const foeHits = foeRole === "tocdo" && Math.random() < 0.25 ? 2 : 1;
    for (let i = 0; i < foeHits; i++) {
      let dmg = Math.max(5, atk2 * (0.9 + Math.random() * 0.25) - def1 * 0.5);
      if (foeRole === "sacben" && Math.random() < 0.2) dmg *= 2;
      hp1 -= dmg;
    }
    if (myRole === "hove" && hp1 > 0) hp1 = Math.min(myStats.hp, hp1 + myStats.hp * 0.08);
    if (foeRole === "hove" && hp2 > 0) hp2 = Math.min(foeStats.hp, hp2 + foeStats.hp * 0.08);
  }
  return { win: hp2 <= 0 && hp1 > 0, rounds, hpLeft: Math.max(0, Math.round(hp1)) };
}

// ==================== CÁC LỆNH ====================
async function cmdEnter(api, message, player, sessions, sessionKey) {
  sessions[sessionKey] = Date.now();
  markDirty();
  const body =
    `🐉 Đang ở Đảo Rồng — từ giờ gõ thẳng lệnh, không cần thêm chữ gì trước nữa.\n` +
    `💡 Việc đáng làm ngay:\n` +
    buildSuggestions(player, { limit: 3 }) +
    `\nGõ roi để rời đảo · help để xem đủ lệnh.`;

  let imagePath = null;
  try {
    imagePath = await drawIslandCard(player, await tryGetAvatar(api, message.data.uidFrom));
  } catch (error) {
    console.error("Lỗi vẽ thẻ đảo rồng:", error?.message || error);
  }
  await sendGameMessage(api, message, body, { imagePath });
}

async function tryGetAvatar(api, uid) {
  try {
    const info = await api.getGroupMembers([uid + "_0"]);
    return info?.profiles?.[uid]?.avatar || null;
  } catch {
    return null;
  }
}

async function cmdProfile(api, message, player) {
  let imagePath = null;
  try {
    imagePath = await drawIslandCard(player, await tryGetAvatar(api, message.data.uidFrom));
  } catch (error) {
    console.error("Lỗi vẽ thẻ đảo rồng:", error?.message || error);
  }
  const body = `🏝️ HỒ SƠ ĐẢO RỒNG · BERK\n👥 Dân Viking ${player.vikings} · 🟠 Hổ Phách ${fmt(player.amber)} · 🔮 H.P Tinh ${player.hpTinh} · 🏆 Mùa Giải ${player.season}\n🏠 Chuồng Lv${player.buildings.chuong} · 🎣 Ao Cá Lv${player.buildings.aoca} · 🔥 Lò Ấp Lv${player.buildings.loap} · 🥚 Ấp ${player.incubator.length}/${player.buildings.loap}`;
  await sendGameMessage(api, message, composeReply(player, body, { limit: 5 }), { imagePath });
}

async function cmdCheckin(api, message, player) {
  const today = todayStr();
  if (player.checkin.last === today) {
    const body = `📅 Hôm nay điểm danh rồi!\n🔥 Chuỗi: ${player.checkin.streak} ngày liên tiếp — quay lại vào ngày mai nhé.`;
    await sendGameMessage(api, message, composeReply(player, body), { ttl: TTL_SHORT });
    return;
  }

  const d = getTimeNow();
  const yesterday = new Date(d.getTime() - 86400000);
  const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  player.checkin.streak = player.checkin.last === yStr ? player.checkin.streak + 1 : 1;
  player.checkin.last = today;

  const mKey = monthStr();
  if (!player.checkin.monthDays[mKey]) player.checkin.monthDays[mKey] = [];
  if (!player.checkin.monthDays[mKey].includes(d.getDate())) player.checkin.monthDays[mKey].push(d.getDate());

  const bonus = Math.min(CHECKIN_STREAK_BONUS_CAP, CHECKIN_STREAK_BONUS * (player.checkin.streak - 1));
  const gold = CHECKIN_BASE_GOLD + bonus;
  player.gold += gold;
  addQuestProgress(player, "checkin");

  // Mốc lịch tháng — tự động nhận khi chạm mốc
  const daysThisMonth = player.checkin.monthDays[mKey].length;
  if (!player.checkin.milestonesClaimed[mKey]) player.checkin.milestonesClaimed[mKey] = [];
  const milestoneLines = [];
  for (const ms of MONTH_MILESTONES) {
    if (daysThisMonth >= ms.days && !player.checkin.milestonesClaimed[mKey].includes(ms.days)) {
      player.checkin.milestonesClaimed[mKey].push(ms.days);
      grantReward(player, ms.reward);
      milestoneLines.push(`🎊 Mốc ${ms.days} ngày/tháng: ${ms.rewardText}`);
    }
  }
  markDirty();

  const body =
    `📅 ĐIỂM DANH ngày ${dayMonthLabel()} — nhận ${fmt(gold)}🪙!\n` +
    `🔥 Chuỗi: ${player.checkin.streak} ngày liên tiếp.\n` +
    `📆 Lịch tháng: ${daysThisMonth} ngày — xem mốc thưởng: lich` +
    (milestoneLines.length ? `\n${milestoneLines.join("\n")}` : "");
  await sendGameMessage(api, message, composeReply(player, body));
}

async function cmdCalendar(api, message, player) {
  const mKey = monthStr();
  const days = player.checkin.monthDays[mKey] || [];
  const claimed = player.checkin.milestonesClaimed[mKey] || [];
  const msLines = MONTH_MILESTONES.map((ms) => {
    const done = days.length >= ms.days;
    const mark = claimed.includes(ms.days) ? "✅" : done ? "🎁" : "⬜";
    return `${mark} ${ms.days} ngày — ${ms.rewardText}`;
  }).join("\n");
  const body =
    `📆 LỊCH ĐIỂM DANH THÁNG ${mKey.split("-")[1]}/${mKey.split("-")[0]}\n` +
    `Đã điểm danh ${days.length} ngày: ${days.sort((a, b) => a - b).join(", ") || "—"}\n` +
    `🔥 Chuỗi hiện tại: ${player.checkin.streak} ngày\n${SEP}\n` +
    `🎯 MỐC THƯỞNG (tự nhận khi điểm danh):\n${msLines}`;
  await sendGameMessage(api, message, composeReply(player, body));
}

async function cmdFeed(api, message, player, args) {
  const query = args[0];
  const want = Math.max(1, Math.min(50, parseInt(args[1]) || 1));
  const dragon = query ? findDragon(player, query) : player.dragons[0];
  if (!dragon) {
    await sendGameMessage(api, message, composeReply(player, `❌ Không tìm thấy rồng «${query || ""}». Gõ list để xem mã đàn rồng.`), { ttl: TTL_SHORT });
    return;
  }

  let fed = 0;
  let used = 0;
  let gateNote = "";
  while (fed < want) {
    if (dragon.level >= DRAGON_LEVEL_CAP) {
      gateNote = `\n🏁 ${dragonLabel(dragon)} đã đạt cấp tối đa ${DRAGON_LEVEL_CAP}!`;
      break;
    }
    const gate = EVOLVE_GATES[dragon.level];
    if (gate && needEvolveAtGate(dragon)) {
      gateNote = `\n⛔ Chạm mốc Lv${dragon.level}: cần tiến hóa để vượt — gõ tienhoa ${dragon.code} (cần ${gate}🔷).`;
      break;
    }
    const cost = feedCostForLevel(dragon.level);
    if (player.fish < cost) {
      if (fed === 0) {
        await sendGameMessage(
          api,
          message,
          composeReply(player, `🐟 Không đủ cá! Cần ${fmt(cost)}🐟 để cho ${dragonLabel(dragon)} lên 1 cấp (đang có ${fmt(player.fish)}🐟).\n💡 Kiếm cá: ai · vuotve · quay`),
          { ttl: TTL_SHORT }
        );
        return;
      }
      break;
    }
    player.fish -= cost;
    used += cost;
    dragon.level += 1;
    fed++;
  }
  if (fed > 0) addQuestProgress(player, "feed", fed);
  markDirty();

  const stats = dragonStats(dragon);
  const body =
    `🍖 ${dragonLabel(dragon)} +${fed} cấp → Lv${dragon.level}` +
    (used > 0 ? ` (dùng ${fmt(used)}🐟)` : "") +
    `\n💪 HP ${stats.hp} · ATK ${stats.atk} · DEF ${stats.def}` +
    gateNote;
  await sendGameMessage(api, message, composeReply(player, body));
}

async function cmdPet(api, message, player, args) {
  const dragon = args[0] ? findDragon(player, args[0]) : player.dragons[0];
  if (!dragon) {
    await sendGameMessage(api, message, composeReply(player, `❌ Không tìm thấy rồng «${args[0] || ""}». Gõ list để xem mã.`), { ttl: TTL_SHORT });
    return;
  }
  const now = Date.now();
  const remain = PET_COOLDOWN_MS - (now - (dragon.lastPet || 0));
  if (remain > 0) {
    await sendGameMessage(api, message, composeReply(player, `🕒 ${dragonLabel(dragon)} vừa được vuốt ve rồi — quay lại sau ${fmtDur(remain)} nhé.`), { ttl: TTL_SHORT });
    return;
  }

  dragon.lastPet = now;
  player.fish += PET_REWARD_FISH;
  dragon.bondXp += PET_BOND_XP;
  let bondLine = "";
  while (dragon.bondXp >= BOND_XP_PER_LEVEL) {
    dragon.bondXp -= BOND_XP_PER_LEVEL;
    dragon.bondLevel = Math.min(10, (dragon.bondLevel || 0) + 1);
    bondLine = `\n💞 Gắn kết lên cấp ${dragon.bondLevel} — chỉ số +2%!`;
  }
  player.buffs.idleUntil = now + PET_BUFF_MS;
  addQuestProgress(player, "pet");
  markDirty();

  const body =
    `🤚💞 Bạn vuốt ve ${dragonLabel(dragon)} — nó lim dim sung sướng!\n` +
    `🎁 +${PET_REWARD_FISH}🐟 · +${PET_BOND_XP} XP gắn kết${bondLine}\n` +
    `✨ Buff đảo: +${PET_BUFF_PCT}% vàng nhàn rỗi trong ${fmtDur(PET_BUFF_MS)} (cộng khi thu).`;
  await sendGameMessage(api, message, composeReply(player, body));
}

async function cmdStage(api, message, player, args) {
  const now = Date.now();
  let dragon = args[0] ? findDragon(player, args[0]) : null;
  if (!dragon) {
    dragon = [...player.dragons].sort((a, b) => b.level - a.level).find((d) => d.restUntil <= now);
  }
  if (!dragon) {
    await sendGameMessage(api, message, composeReply(player, `😴 Cả đàn rồng đang nghỉ! Chờ chút rồi thử lại (xem list).`), { ttl: TTL_SHORT });
    return;
  }
  if (dragon.restUntil > now) {
    await sendGameMessage(api, message, composeReply(player, `😴 ${dragonLabel(dragon)} đang nghỉ, còn ${fmtDur(dragon.restUntil - now)}.`), { ttl: TTL_SHORT });
    return;
  }

  const stage = player.stage;
  const enemy = stageEnemy(stage);
  const myStats = dragonStats(dragon);
  const sp = SPECIES[dragon.species] || SPECIES.sw2;
  const myRole = ROLES[sp.role] || ROLES.tankich;
  const foeRole = ROLES[enemy.role] || ROLES.tankich;
  const result = simulateFight(myStats, sp.role, enemy, enemy.role);
  player.stats.fights += 1;

  if (!result.win) {
    dragon.restUntil = now + 10 * 60 * 1000;
    markDirty();
    const body =
      `💥 ẢI ${stage} — THUA sau ${result.rounds} lượt...\n` +
      `${dragonLabel(dragon)} [${myRole.name}] địch ${enemy.name} [${foeRole.name}]\n` +
      `😤 ${dragonLabel(dragon)} cần nghỉ 10 phút.\n` +
      `💡 Mẹo: choan ${dragon.species} vài cấp hoặc vuotve tăng gắn kết rồi thử lại!`;
    await sendGameMessage(api, message, composeReply(player, body));
    return;
  }

  const rewards = stageRewards(stage);
  player.stats.wins += 1;
  player.gold += rewards.gold;
  player.fish += rewards.fish;
  player.stone += rewards.stone;
  player.tickets.low += rewards.ticketLow;
  player.tickets.mid += rewards.ticketMid;
  player.tickets.high += rewards.ticketHigh;
  player.trust[sp.role] = (player.trust[sp.role] || 0) + 1;
  player.stage += 1;
  addQuestProgress(player, "stageWin");
  const levelUpLines = addPlayerXp(player, rewards.xp);

  let eggLine = "";
  if (Math.random() < rewards.eggChance) {
    const where = addEgg(player, "common");
    eggLine = `\n🥚 Rớt 1 Trứng Thường — ${where === "incubating" ? "đã cho vào lò ấp!" : "cất vào kho (gõ ap khi lò trống)."}`;
  }
  markDirty();

  const extraTickets =
    (rewards.ticketMid ? `\n🎟️ Vé quay Trung 🥈 +${rewards.ticketMid}` : "") +
    (rewards.ticketHigh ? `\n🎟️ Vé quay Cao 🥇 +${rewards.ticketHigh}` : "");

  const body =
    `⚔️ ẢI ${stage} — THẮNG! (${result.rounds} lượt)\n` +
    `${dragonLabel(dragon)} [${myRole.name}] địch ${enemy.name} [${foeRole.name}]\n` +
    `${myRole.icon} Vai trò ${myRole.name} — hiệu ứng: ${myRole.effectIcon}${myRole.effectName}\n` +
    `🎁 Phần thưởng:\n` +
    `🪙 Vàng +${fmt(rewards.gold)}\n` +
    `🐟 Cá +${fmt(rewards.fish)}\n` +
    `🔷 Đá Tiến Hóa +${rewards.stone}\n` +
    `✨ Kinh nghiệm +${rewards.xp}\n` +
    `🤝 Trust ${myRole.name} +1\n` +
    `🎟️ Vé quay Thấp 🥉 +1 — quay liền: quay${extraTickets}\n` +
    `🗺️ Mở ải ${player.stage}!` +
    eggLine +
    (levelUpLines.length ? `\n${levelUpLines.join("\n")}` : "");
  await sendGameMessage(api, message, composeReply(player, body, { limit: 6, showStatus: true }));
}

async function cmdSpin(api, message, player, args) {
  const daily = ensureDaily(player);
  let tierKey = null;
  const asked = (args[0] || "").toLowerCase();
  if (["thap", "thấp", "low"].includes(asked)) tierKey = "thap";
  else if (["trung", "mid"].includes(asked)) tierKey = "trung";
  else if (["cao", "high"].includes(asked)) tierKey = "cao";

  let usedFree = false;
  if (!tierKey) {
    if (player.tickets.low > 0) tierKey = "thap";
    else if (player.tickets.mid > 0) tierKey = "trung";
    else if (player.tickets.high > 0) tierKey = "cao";
    else if (!daily.freeSpinUsed) {
      tierKey = "thap";
      usedFree = true;
    } else {
      await sendGameMessage(api, message, composeReply(player, `🎟️ Hết vé quay và lượt miễn phí hôm nay!\n💡 Kiếm vé: thắng ải (ai) — mỗi ải +1 vé Thấp.`), { ttl: TTL_SHORT });
      return;
    }
  } else {
    const map = { thap: "low", trung: "mid", cao: "high" };
    if (player.tickets[map[tierKey]] <= 0) {
      if (tierKey === "thap" && !daily.freeSpinUsed) usedFree = true;
      else {
        await sendGameMessage(api, message, composeReply(player, `🎟️ Không còn vé quay bậc ${WHEEL_TIERS[tierKey].name}!`), { ttl: TTL_SHORT });
        return;
      }
    }
  }

  if (usedFree) daily.freeSpinUsed = true;
  else {
    const map = { thap: "low", trung: "mid", cao: "high" };
    player.tickets[map[tierKey]] -= 1;
  }

  const tier = WHEEL_TIERS[tierKey];
  const seg = weightedPick(tier.segments, (s) => s.weight);
  let resultText = "";
  if (seg.key === "gold") {
    player.gold += seg.amount;
    resultText = `🪙 Vàng +${fmt(seg.amount)}!`;
  } else if (seg.key === "fish") {
    player.fish += seg.amount;
    resultText = `🐟 Cá +${fmt(seg.amount)}!`;
  } else if (seg.key === "stone") {
    player.stone += seg.amount;
    resultText = `🔷 Đá Tiến Hóa +${seg.amount}!`;
  } else if (seg.key === "gem") {
    player.gem += seg.amount;
    resultText = `💎 Ngọc +${seg.amount}!`;
  } else if (seg.key === "egg") {
    const where = addEgg(player, "epic");
    resultText = `🥚 Trứng Sử Thi ×1 — ${where === "incubating" ? "đã vào lò ấp!" : "cất vào kho!"}`;
  }
  addQuestProgress(player, "spin");
  markDirty();

  let imagePath = null;
  try {
    imagePath = await drawWheelCard(tier, seg, player.tickets);
  } catch (error) {
    console.error("Lỗi vẽ vòng quay:", error?.message || error);
  }

  const body =
    `🎡 VÒNG QUAY ${tier.name} ${tier.medal} — kim dừng ở... ${resultText}\n` +
    (usedFree ? `🆓 Dùng lượt quay miễn phí hôm nay.\n` : "") +
    `🎟️ Vé còn: Thấp ${player.tickets.low} · Trung ${player.tickets.mid} · Cao ${player.tickets.high}`;
  await sendGameMessage(api, message, composeReply(player, body), { imagePath });
}

async function cmdHatch(api, message, player) {
  const now = Date.now();
  const idx = player.incubator.findIndex((e) => now - e.startAt >= e.hatchMs);
  if (idx === -1) {
    if (player.incubator.length === 0) {
      const stored = player.eggStorage.length;
      const body = `🔥 Lò ấp: 0/${player.buildings.loap} ô · ${stored} trứng trong kho.` + (stored > 0 ? `\n👉 Gõ ap để ấp trứng.` : `\n💡 Kiếm trứng từ đánh ải (ai) và vòng quay Cao.`);
      await sendGameMessage(api, message, composeReply(player, body), { ttl: TTL_SHORT });
      return;
    }
    const lines = player.incubator
      .map((e, i) => `🥚 Ô ${i + 1}: ${EGG_NAMES[e.pool] || "Trứng"} — còn ${fmtDur(e.hatchMs - (now - e.startAt))}`)
      .join("\n");
    await sendGameMessage(api, message, composeReply(player, `⏳ Chưa có trứng nở.\n${lines}`), { ttl: TTL_SHORT });
    return;
  }

  const egg = player.incubator.splice(idx, 1)[0];
  const sp = pickSpeciesFromPool(egg.pool);
  const dragon = newDragon(player, sp.key);
  player.dragons.push(dragon);
  player.stats.hatches += 1;
  addQuestProgress(player, "hatch");
  // tự nạp trứng kho vào lò nếu còn chỗ
  let autoLine = "";
  if (player.eggStorage.length > 0 && player.incubator.length < player.buildings.loap) {
    const pool = player.eggStorage.shift();
    player.incubator.push({ pool, startAt: Date.now(), hatchMs: EGG_HATCH_TIME[pool] || EGG_HATCH_TIME.common });
    autoLine = `\n🔥 Tự động ấp tiếp 1 ${EGG_NAMES[pool] || "trứng"} từ kho.`;
  }
  markDirty();

  const rarity = RARITIES[dragon.rarity] || RARITIES.thuong;
  let imagePath = null;
  try {
    imagePath = await drawEggHatchCard(dragon);
  } catch (error) {
    console.error("Lỗi vẽ thẻ trứng nở:", error?.message || error);
  }

  const body =
    `🎉 Nở 1 rồng!\n` +
    `🥚 ${dragonLabel(dragon)} (${rarity.name}) — mã #${dragon.code}\n` +
    `👉 Xem đàn rồng: list · Cho ăn để lên cấp: choan <mã_rồng> <số>` +
    autoLine;
  await sendGameMessage(api, message, composeReply(player, body, { limit: 4 }), { imagePath });
}

async function cmdIncubate(api, message, player) {
  const slots = player.buildings.loap;
  if (player.incubator.length >= slots) {
    const now = Date.now();
    const lines = player.incubator
      .map((e, i) => {
        const left = e.hatchMs - (now - e.startAt);
        return `🥚 Ô ${i + 1}: ${EGG_NAMES[e.pool] || "Trứng"} — ${left <= 0 ? "SẴN SÀNG NỞ (gõ no)" : "còn " + fmtDur(left)}`;
      })
      .join("\n");
    await sendGameMessage(api, message, composeReply(player, `🔥 Lò ấp đầy (${player.incubator.length}/${slots}):\n${lines}`), { ttl: TTL_SHORT });
    return;
  }
  if (player.eggStorage.length === 0) {
    await sendGameMessage(api, message, composeReply(player, `📦 Kho không còn trứng!\n💡 Kiếm trứng từ đánh ải (ai) và vòng quay Cao.`), { ttl: TTL_SHORT });
    return;
  }
  const pool = player.eggStorage.shift();
  player.incubator.push({ pool, startAt: Date.now(), hatchMs: EGG_HATCH_TIME[pool] || EGG_HATCH_TIME.common });
  markDirty();
  const body = `🔥 Đã cho 1 ${EGG_NAMES[pool] || "trứng"} vào lò ấp (${player.incubator.length}/${slots}).\n⏳ Nở sau ${fmtDur(EGG_HATCH_TIME[pool] || EGG_HATCH_TIME.common)}.`;
  await sendGameMessage(api, message, composeReply(player, body));
}

async function cmdList(api, message, player) {
  const now = Date.now();
  const lines = player.dragons
    .map((d) => {
      const sp = SPECIES[d.species] || SPECIES.sw2;
      const role = ROLES[sp.role] || ROLES.tankich;
      const rest = d.restUntil > now ? ` · 😴 nghỉ ${fmtDur(d.restUntil - now)}` : "";
      return `#${d.code} ${dragonLabel(d)} — Lv${d.level}/${DRAGON_LEVEL_CAP} ${starsText(d)} · ${role.icon} ${role.name}${rest}`;
    })
    .join("\n");
  const body = `🐲 ĐÀN RỒNG CỦA BẠN (${player.dragons.length}):\n${lines}\n👉 Chi tiết: xem <mã> · Cho ăn: choan <mã> <số> · Vuốt ve: vuotve <mã>`;
  await sendGameMessage(api, message, composeReply(player, body));
}

async function cmdView(api, message, player, args) {
  const dragon = findDragon(player, args[0]);
  if (!dragon) {
    await sendGameMessage(api, message, composeReply(player, `❌ Không tìm thấy rồng «${args[0] || ""}». Gõ list để xem mã.`), { ttl: TTL_SHORT });
    return;
  }
  const sp = SPECIES[dragon.species] || SPECIES.sw2;
  const role = ROLES[sp.role] || ROLES.tankich;
  const rarity = RARITIES[dragon.rarity] || RARITIES.thuong;
  const stats = dragonStats(dragon);
  let imagePath = null;
  try {
    imagePath = await drawDragonDetailCard(dragon);
  } catch (error) {
    console.error("Lỗi vẽ thẻ rồng:", error?.message || error);
  }
  const gate = EVOLVE_GATES[dragon.level];
  const body =
    `🐲 ${dragonLabel(dragon)} — mã #${dragon.code}\n` +
    `${starsText(dragon)} · ${rarity.name} · ${role.icon} ${role.name} (${role.desc})\n` +
    `📶 Lv${dragon.level}/${DRAGON_LEVEL_CAP} · Tiến hóa ${dragon.evolves || 0} lần\n` +
    `💪 HP ${stats.hp} · ATK ${stats.atk} · DEF ${stats.def}\n` +
    `💞 Gắn kết Lv${dragon.bondLevel || 0} (${dragon.bondXp}/${BOND_XP_PER_LEVEL} XP)` +
    (gate ? `\n⛔ Đang kẹt mốc Lv${dragon.level} — tienhoa ${dragon.code} (cần ${gate}🔷)` : "");
  await sendGameMessage(api, message, composeReply(player, body), { imagePath });
}

async function cmdEvolve(api, message, player, args) {
  const dragon = findDragon(player, args[0]);
  if (!dragon) {
    await sendGameMessage(api, message, composeReply(player, `❌ Không tìm thấy rồng «${args[0] || ""}». Gõ list để xem mã.`), { ttl: TTL_SHORT });
    return;
  }
  const gate = EVOLVE_GATES[dragon.level];
  if (!gate || !needEvolveAtGate(dragon)) {
    const nextGate = Object.keys(EVOLVE_GATES).map(Number).find((g) => g > dragon.level);
    await sendGameMessage(
      api,
      message,
      composeReply(player, `ℹ️ ${dragonLabel(dragon)} chưa cần tiến hóa lúc này.` + (nextGate ? ` Mốc kế tiếp: Lv${nextGate}.` : ` Đã qua hết mốc!`)),
      { ttl: TTL_SHORT }
    );
    return;
  }
  if (player.stone < gate) {
    await sendGameMessage(api, message, composeReply(player, `🔷 Không đủ Đá Tiến Hóa! Cần ${gate}🔷 (đang có ${player.stone}🔷).\n💡 Kiếm đá: đánh ải (ai) · vòng quay.`), { ttl: TTL_SHORT });
    return;
  }
  player.stone -= gate;
  dragon.evolves = (dragon.evolves || 0) + 1;
  player.hpTinh += 1;
  markDirty();
  const stats = dragonStats(dragon);
  const body =
    `🧬 TIẾN HÓA THÀNH CÔNG!\n` +
    `${dragonLabel(dragon)} ${starsText(dragon)} — chỉ số +15% vĩnh viễn!\n` +
    `💪 HP ${stats.hp} · ATK ${stats.atk} · DEF ${stats.def}\n` +
    `🔮 +1 H.P Tinh · Dùng ${gate}🔷\n` +
    `🍖 Tiếp tục choan ${dragon.code} để vượt Lv${dragon.level}!`;
  await sendGameMessage(api, message, composeReply(player, body));
}

async function cmdHall(api, message, player, args) {
  if ((args[0] || "").toLowerCase() === "nang") {
    if (player.hall >= HALL_MAX) {
      await sendGameMessage(api, message, composeReply(player, `🏛️ Sảnh đã đạt cấp tối đa ${HALL_MAX}!`), { ttl: TTL_SHORT });
      return;
    }
    const cost = hallUpgradeCost(player.hall);
    if (player.gold < cost.gold || player.stone < cost.stone) {
      await sendGameMessage(
        api,
        message,
        composeReply(player, `🏛️ Nâng Sảnh ${player.hall} → ${player.hall + 1} cần ${fmt(cost.gold)}🪙 + ${cost.stone}🔷.\nBạn đang có ${fmt(player.gold)}🪙 · ${player.stone}🔷.`),
        { ttl: TTL_SHORT }
      );
      return;
    }
    player.gold -= cost.gold;
    player.stone -= cost.stone;
    player.hall += 1;
    player.vikings += 3;
    player.buildings.chuong += 1;
    if (player.hall % 3 === 0) player.buildings.loap += 1;
    markDirty();
    const body =
      `🏛️ SẢNH LÊN CẤP ${player.hall}!\n` +
      `👥 +3 Dân Viking · 🏠 Chuồng Lv${player.buildings.chuong}` +
      (player.hall % 3 === 0 ? ` · 🔥 Lò Ấp +1 ô (${player.buildings.loap})` : "") +
      `\n💰 Vàng nhàn rỗi giờ ${fmt(idleGoldPerHour(player))}🪙/giờ.`;
    await sendGameMessage(api, message, composeReply(player, body));
    return;
  }
  const cost = hallUpgradeCost(player.hall);
  const body =
    `🏛️ SẢNH CHÍNH — Cấp ${player.hall}/${HALL_MAX}\n` +
    `💰 Vàng nhàn rỗi: ${fmt(idleGoldPerHour(player))}🪙/giờ (thu bằng: thu)\n` +
    `🏠 Chuồng Lv${player.buildings.chuong} · 🎣 Ao Cá Lv${player.buildings.aoca} · 🔥 Lò Ấp ${player.incubator.length}/${player.buildings.loap} ô\n` +
    (player.hall < HALL_MAX ? `⬆️ Nâng cấp: sanh nang — cần ${fmt(cost.gold)}🪙 + ${cost.stone}🔷` : `🏁 Đã đạt cấp tối đa!`);
  await sendGameMessage(api, message, composeReply(player, body));
}

async function cmdCollect(api, message, player) {
  const gold = calcIdleGold(player);
  if (gold < 1) {
    await sendGameMessage(api, message, composeReply(player, `💰 Chưa có vàng nhàn rỗi — quay lại sau nhé! (${fmt(idleGoldPerHour(player))}🪙/giờ)`), { ttl: TTL_SHORT });
    return;
  }
  const buffed = (player.buffs?.idleUntil || 0) > Date.now();
  player.gold += gold;
  player.lastCollect = Date.now();
  markDirty();
  const body =
    `💰 Thu ${fmt(gold)}🪙 vàng nhàn rỗi!\n` +
    `⚙️ Tốc độ: ${fmt(idleGoldPerHour(player))}🪙/giờ${buffed ? ` · ✨ đang buff +${PET_BUFF_PCT}%` : ""} (tích tối đa 8h).`;
  await sendGameMessage(api, message, composeReply(player, body));
}

async function cmdGauntlet(api, message, player, args) {
  const daily = ensureDaily(player);
  if (daily.gauntletUsed >= GAUNTLET_RUNS_PER_DAY) {
    await sendGameMessage(api, message, composeReply(player, `⚔️🔥 Hết lượt Gauntlet hôm nay — quay lại vào ngày mai!`), { ttl: TTL_SHORT });
    return;
  }
  const dragon = findDragon(player, args[0]);
  if (!dragon) {
    await sendGameMessage(api, message, composeReply(player, `❌ Gauntlet cần kèm mã rồng: gauntlet <mã_rồng> (xem mã: list)`), { ttl: TTL_SHORT });
    return;
  }

  daily.gauntletUsed += 1;
  const sp = SPECIES[dragon.species] || SPECIES.sw2;
  const myStats = dragonStats(dragon);
  let hpPool = myStats.hp;
  let wave = 0;
  let totalGold = 0;
  let totalFish = 0;
  let totalAmber = 0;
  while (hpPool > 0 && wave < 30) {
    const foe = gauntletWaveEnemy(player.stage, wave + 1);
    const res = simulateFight({ ...myStats, hp: hpPool }, sp.role, foe, foe.role);
    if (!res.win) break;
    wave += 1;
    hpPool = res.hpLeft;
    const rw = gauntletWaveReward(wave);
    totalGold += rw.gold;
    totalFish += rw.fish;
    totalAmber += rw.amber;
  }
  player.gold += totalGold;
  player.fish += totalFish;
  player.amber += totalAmber;
  const xpLines = addPlayerXp(player, 40 * wave);
  markDirty();

  const body =
    `⚔️🔥 GAUNTLET SINH TỒN — ${dragonLabel(dragon)}\n` +
    `🌊 Sống sót ${wave} đợt!\n` +
    `🎁 +${fmt(totalGold)}🪙 · +${fmt(totalFish)}🐟` +
    (totalAmber > 0 ? ` · +${totalAmber}🟠 Hổ Phách` : "") +
    `\n✨ Kinh nghiệm +${40 * wave}` +
    (xpLines.length ? `\n${xpLines.join("\n")}` : "") +
    `\n🕐 Lượt còn hôm nay: ${GAUNTLET_RUNS_PER_DAY - daily.gauntletUsed}/${GAUNTLET_RUNS_PER_DAY}`;
  await sendGameMessage(api, message, composeReply(player, body));
}

async function cmdQuest(api, message, player, args) {
  const daily = ensureDaily(player);
  const id = parseInt(args[0]);
  if (id) {
    const quest = DAILY_QUESTS.find((q) => q.id === id);
    if (!quest) {
      await sendGameMessage(api, message, composeReply(player, `❌ Không có nhiệm vụ số ${id}.`), { ttl: TTL_SHORT });
      return;
    }
    if (daily.claimed.includes(id)) {
      await sendGameMessage(api, message, composeReply(player, `✅ Nhiệm vụ «${quest.name}» đã nhận thưởng rồi!`), { ttl: TTL_SHORT });
      return;
    }
    if ((daily.progress[quest.counter] || 0) < quest.target) {
      await sendGameMessage(
        api,
        message,
        composeReply(player, `⏳ Nhiệm vụ «${quest.name}»: ${daily.progress[quest.counter] || 0}/${quest.target} — chưa xong!`),
        { ttl: TTL_SHORT }
      );
      return;
    }
    daily.claimed.push(id);
    grantReward(player, quest.reward);
    markDirty();
    const body = `🎁 NHẬN THƯỞNG NHIỆM VỤ ${id}\n«${quest.name}» — ${quest.rewardText}!`;
    await sendGameMessage(api, message, composeReply(player, body));
    return;
  }

  const lines = DAILY_QUESTS.map((q) => {
    const prog = Math.min(q.target, daily.progress[q.counter] || 0);
    const mark = daily.claimed.includes(q.id) ? "✅" : prog >= q.target ? "🎁" : "⏳";
    return `${mark} ${q.id}. ${q.name} (${prog}/${q.target}) — ${q.rewardText}`;
  }).join("\n");
  const body = `📋 NHIỆM VỤ HẰNG NGÀY:\n${lines}\n👉 Nhận thưởng: nhiemvu <số> (🎁 = nhận được)`;
  await sendGameMessage(api, message, composeReply(player, body));
}

async function cmdSpeciesList(api, message, player) {
  const order = ["thuong", "hiem", "caocap", "suthi", "huyenthoai"];
  const total = Object.keys(SPECIES).length;
  const lines = [];
  for (const rk of order) {
    const rarity = RARITIES[rk];
    const names = Object.values(SPECIES)
      .filter((s) => s.rarity === rk)
      .map((s) => (s.nickname ? `${s.name} (${s.nickname})` : s.name));
    if (!names.length) continue;
    lines.push(`${"★".repeat(rarity.stars)} ${rarity.name}:\n   ${names.join(" · ")}`);
  }
  const owned = new Set(player.dragons.map((d) => d.species));
  const body =
    `📜 CÁC LOÀI RỒNG TẠI BERK (${total} loài):\n` +
    lines.join("\n") +
    `\n🐲 Bạn đã sở hữu ${owned.size}/${total} loài.` +
    `\n💡 Trứng càng hiếm càng dễ ra rồng xịn — săn trứng từ ải (ai), vòng quay Cao và mốc lịch tháng!`;
  await sendGameMessage(api, message, composeReply(player, body));
}

async function cmdTop(api, message, player, data) {
  const players = Object.values(data.players)
    .sort((a, b) => b.level - a.level || b.xp - a.xp || b.gold - a.gold)
    .slice(0, 10);
  const medals = ["🥇", "🥈", "🥉"];
  const lines = players
    .map((p, i) => `${medals[i] || `${i + 1}.`} ${p.name} — Cấp ${p.level} · Ải ${p.stage} · ${p.dragons.length}🐲 · ${fmt(p.gold)}🪙`)
    .join("\n");
  const body = `🏆 BẢNG XẾP HẠNG ĐẢO RỒNG:\n${lines}`;
  await sendGameMessage(api, message, composeReply(player, body));
}

async function cmdHelp(api, message, player) {
  const prefix = getGlobalPrefix(api.getBotId());
  const body =
    `📖 LỆNH ĐẢO RỒNG (gõ thẳng, không cần prefix):\n` +
    `🏝️ dao — hồ sơ đảo + thẻ đảo\n` +
    `📅 diemdanh — điểm danh ngày · lich — lịch tháng\n` +
    `🐲 list — đàn rồng · xem <mã> — chi tiết rồng\n` +
    `📜 loairong — xem đủ ${Object.keys(SPECIES).length} loài rồng theo độ hiếm\n` +
    `🍖 choan <rồng> <số> — cho ăn lên cấp\n` +
    `🤚 vuotve <rồng> — vuốt ve (+cá, +gắn kết, buff vàng)\n` +
    `⚔️ ai [rồng] — đánh ải kiếm đá + vé quay\n` +
    `🎡 quay [thap/trung/cao] — vòng quay thưởng\n` +
    `🥚 no — nhận rồng nở · ap — ấp trứng trong kho\n` +
    `🧬 tienhoa <mã> — tiến hóa tại mốc Lv10/20\n` +
    `🏛️ sanh — sảnh chính · sanh nang — nâng cấp\n` +
    `💰 thu — thu vàng nhàn rỗi\n` +
    `⚔️🔥 gauntlet <mã> — sinh tồn theo đợt (1 lượt/ngày)\n` +
    `📋 nhiemvu — nhiệm vụ ngày · 🏆 top — xếp hạng\n` +
    `🛶 roi — rời đảo (vào lại: ${prefix}nuoirong)`;
  await sendGameMessage(api, message, composeReply(player, body, { limit: 3 }));
}

async function cmdLeave(api, message, sessions, sessionKey) {
  delete sessions[sessionKey];
  markDirty();
  const prefix = getGlobalPrefix(api.getBotId());
  await sendGameMessage(api, message, `🛶 Bạn đã rời Đảo Rồng. Hẹn gặp lại!\n👉 Vào lại đảo: ${prefix}nuoirong`, { ttl: TTL_SHORT });
}

// ==================== ROUTER ====================
const ISLAND_COMMANDS = new Set([
  "dao", "profile", "info", "diemdanh", "lich", "choan", "vuotve", "ai", "quay", "no", "ap",
  "list", "xem", "tienhoa", "sanh", "thu", "thuvang", "gauntlet", "nhiemvu", "top", "bxh",
  "loairong", "help", "roi",
]);

export async function nuoiRongContinuation(api, message, content) {
  const text = String(content || "").trim();
  if (!text) return null;
  const parts = text.split(/\s+/);
  let command = (parts[0] || "").toLowerCase();
  if (["nr", "nuoirong", "daorong", "rong"].includes(command) && parts.length > 1) {
    parts.shift();
    command = (parts[0] || "").toLowerCase();
  }
  if (!ISLAND_COMMANDS.has(command)) return null;

  const data = await ensureLoaded();
  const sessionKey = `${message.threadId}_${message.data.uidFrom}`;
  const lastActive = data.sessions[sessionKey];
  if (!lastActive) return null;
  if (Date.now() - lastActive > SESSION_IDLE_MS) {
    delete data.sessions[sessionKey];
    markDirty();
    return null;
  }
  return `${getGlobalPrefix(api.getBotId())}nuoirong ${parts.join(" ")}`;
}

async function routeIslandCommand(api, message, player, data, sessionKey, command, args) {
  const sessions = data.sessions;
  switch (command) {
    case "dao":
    case "profile":
    case "info":
      return cmdProfile(api, message, player);
    case "diemdanh":
      return cmdCheckin(api, message, player);
    case "lich":
      return cmdCalendar(api, message, player);
    case "choan":
      return cmdFeed(api, message, player, args);
    case "vuotve":
      return cmdPet(api, message, player, args);
    case "ai":
      return cmdStage(api, message, player, args);
    case "quay":
      return cmdSpin(api, message, player, args);
    case "no":
      return cmdHatch(api, message, player);
    case "ap":
      return cmdIncubate(api, message, player);
    case "list":
      return cmdList(api, message, player);
    case "xem":
      return cmdView(api, message, player, args);
    case "tienhoa":
      return cmdEvolve(api, message, player, args);
    case "sanh":
      return cmdHall(api, message, player, args);
    case "thu":
    case "thuvang":
      return cmdCollect(api, message, player);
    case "gauntlet":
      return cmdGauntlet(api, message, player, args);
    case "nhiemvu":
      return cmdQuest(api, message, player, args);
    case "top":
    case "bxh":
      return cmdTop(api, message, player, data);
    case "loairong":
      return cmdSpeciesList(api, message, player);
    case "help":
      return cmdHelp(api, message, player);
    case "roi":
      return cmdLeave(api, message, sessions, sessionKey);
  }
}

function checkGameActive(groupSettings, threadId) {
  if (!groupSettings) return true;
  return groupSettings[threadId]?.activeGame === true;
}

/**
 * Lệnh có prefix: {prefix}nuoirong [lệnh con...]
 * Gọi từ src/commands/command.js (khu vực numHandleCommand === 5).
 */
export async function handleNuoiRongCommand(api, message, groupSettings, aliasCommand = "nuoirong") {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName || String(senderId);
  const prefix = getGlobalPrefix(api.getBotId());

  if (!checkGameActive(groupSettings, threadId)) {
    if (isAdmin(api.getBotId(), senderId, threadId)) {
      await sendGameMessage(
        api,
        message,
        `🚫 Trò chơi chưa được bật trong nhóm này.\n🛠️ Quản trị viên dùng lệnh ${prefix}gameactive để bật tương tác game!`,
        { ttl: TTL_SHORT }
      );
    }
    return;
  }

  const data = await ensureLoaded();
  const player = ensurePlayer(data, senderId, senderName);
  const sessionKey = `${threadId}_${senderId}`;

  await reactOk(api, message);

  // Bóc lệnh con sau "{prefix}nuoirong"
  let content = removeMention(message).trim();
  if (content.toLowerCase().startsWith(prefix)) content = content.slice(prefix.length).trim();
  const parts = content.split(/\s+/);
  const first = (parts[0] || "").toLowerCase();
  if (["nuoirong", "nr", "daorong", "rong", aliasCommand.toLowerCase()].includes(first)) parts.shift();
  const command = (parts[0] || "").toLowerCase();
  const args = parts.slice(1);

  data.sessions[sessionKey] = Date.now();
  markDirty();

  if (!command) {
    await cmdEnter(api, message, player, data.sessions, sessionKey);
    return;
  }
  if (ISLAND_COMMANDS.has(command)) {
    await routeIslandCommand(api, message, player, data, sessionKey, command, args);
    return;
  }
  await sendGameMessage(api, message, composeReply(player, `❓ Lệnh «${command}» không có trên đảo. Gõ help để xem đủ lệnh.`), { ttl: TTL_SHORT });
}

/**
 * Chat không prefix khi đang ở trên đảo.
 * Gọi từ handleOnChatUser (src/service-debug/service.js). Trả về true nếu đã xử lý.
 */
export async function handleNuoiRongChat(api, message, groupSettings) {
  try {
    const content = message?.data?.content;
    if (typeof content !== "string") return false;
    const threadId = message.threadId;
    const senderId = message.data.uidFrom;
    const prefix = getGlobalPrefix(api.getBotId());

    let text = removeMention(message).trim();
    if (!text || text.startsWith(prefix)) return false;

    const data = await ensureLoaded();
    const sessionKey = `${threadId}_${senderId}`;
    const lastActive = data.sessions[sessionKey];
    if (!lastActive) return false;
    if (Date.now() - lastActive > SESSION_IDLE_MS) {
      delete data.sessions[sessionKey];
      markDirty();
      return false;
    }

    const parts = text.split(/\s+/);
    let first = (parts[0] || "").toLowerCase();
    // hỗ trợ kiểu gõ "nr choan deadly 10" như bản gốc
    if (["nr", "nuoirong", "daorong"].includes(first) && parts.length > 1) {
      parts.shift();
      first = (parts[0] || "").toLowerCase();
    }
    if (!ISLAND_COMMANDS.has(first)) return false;
    if (!checkGameActive(groupSettings, threadId)) return false;

    const senderName = message.data.dName || String(senderId);
    const player = ensurePlayer(data, senderId, senderName);
    data.sessions[sessionKey] = Date.now();
    markDirty();

    await reactOk(api, message);
    await routeIslandCommand(api, message, player, data, sessionKey, first, parts.slice(1));
    return true;
  } catch (error) {
    console.error("Lỗi xử lý chat nuôi rồng:", error);
    return false;
  }
}
