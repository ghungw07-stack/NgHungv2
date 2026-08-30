import { MessageStyle, MessageType, MultiMsgStyle } from "../../../api-zalo/index.js";
import { getGlobalPrefix } from "../../service.js";
import { getUserInfoBasic } from "../../info-service/user-info.js";
import {
  COLOR_GREEN,
  IS_BOLD,
  SIZE_16,
  getNameServer,
  getServerStyle,
} from "../../chat-zalo/chat-style/chat-style.js";
import { removeMention } from "../../../utils/format-util.js";
import fs from "fs";
import path from "path";
import { DATA_ROOT } from "../../../utils/io-json.js";
import {
  createWerewolfDeathImage,
  createWerewolfEndImage,
  createWerewolfLobbyImage,
  createWerewolfNightImage,
  createWerewolfPhaseImage,
  createWerewolfRankImage,
  createWerewolfRoleImage,
} from "../../../utils/canvas/ma-soi.js";
import {
  ROLE,
  applyDeaths,
  buildRoleDeck,
  canJoinWolfBite,
  createNightActions,
  createPlayer,
  determineWinner,
  isWolf,
  linkLovers,
  livingPlayers,
  playerTeam,
  roleName,
  seerResult,
  selectWolfVictims,
  shuffle,
} from "./engine.js";

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 24;
const DEFAULT_PLAYERS = 12;
const LOBBY_TIMEOUT_MS = Number(process.env.MASOI_LOBBY_MS) || 15 * 60_000;
const START_DELAY_MS = Number(process.env.MASOI_START_DELAY_MS) || 10_000;
const SETUP_TIMEOUT_MS = Number(process.env.MASOI_SETUP_MS) || 60_000;
const NIGHT_TIMEOUT_MS = Number(process.env.MASOI_NIGHT_MS) || 60_000;
const WITCH_TIMEOUT_MS = Number(process.env.MASOI_WITCH_MS) || 60_000;
const DAY_TIMEOUT_MS = Number(process.env.MASOI_DAY_MS) || 90_000;
const DAY_REMINDER_BEFORE_END_MS = 15_000;
const HUNTER_TIMEOUT_MS = Number(process.env.MASOI_HUNTER_MS) || 60_000;
const NEXT_PHASE_DELAY_MS = Number(process.env.MASOI_NEXT_PHASE_MS) || 10_000;

// Một process có thể chạy nhiều tài khoản bot, vì vậy mọi khóa đều chứa botId.
const rooms = new Map();
const roomCodes = new Map();
const lobbyReactions = new Map();
const recentReaction = new Map();
const pendingFriendPlayers = new Map();
const friendRequestCooldown = new Map();
const FRIEND_RETRY_MS = 15_000;
const FRIEND_RETRY_LIMIT = 20;
const FRIEND_REQUEST_COOLDOWN_MS = 5 * 60_000;
const RANK_FILE = path.join(DATA_ROOT, "data", "ma_soi_rank.json");
const IMAGE_REF_FILE = path.join(DATA_ROOT, "data", "ma_soi_image_refs.json");

function loadRankData() {
  try {
    return JSON.parse(fs.readFileSync(RANK_FILE, "utf8"));
  } catch {
    return {};
  }
}

const rankData = loadRankData();
const latestWerewolfGroupImageRefs = new Map(
  Object.entries((() => {
    try {
      return JSON.parse(fs.readFileSync(IMAGE_REF_FILE, "utf8"));
    } catch {
      return {};
    }
  })())
);

function saveRankData() {
  try {
    fs.writeFileSync(RANK_FILE, `${JSON.stringify(rankData, null, 2)}\n`, "utf8");
  } catch (error) {
    console.error("[MaSoi] Không lưu được bảng xếp hạng:", error?.message || error);
  }
}

function saveWerewolfImageRefs() {
  try {
    fs.writeFileSync(IMAGE_REF_FILE, `${JSON.stringify(Object.fromEntries(latestWerewolfGroupImageRefs), null, 2)}\n`, "utf8");
  } catch (error) {
    console.error("[MaSoi] Không lưu được mã ảnh để thu hồi:", error?.message || error);
  }
}

function groupImageRefKey(api, threadId) {
  return `${api.getBotId()}_${normalizeId(threadId)}`;
}

const RULES = `🐺 LUẬT MA SÓI 🐺

• Phe Dân: loại hết Sói để thắng.
• Phe Sói: áp đảo số Dân để thắng.
• Ban đêm: setup đầu ván chạy trước; vai có kỹ năng hành động bí mật qua tin nhắn riêng Bot.
• Ban ngày: cả làng thảo luận rồi bỏ phiếu treo cổ.

⚖️ BIẾN THỂ BOT
• Sói Nguyền vu oan để Tiên Tri thấy mục tiêu là Sói trong cùng đêm.
• Cô Bé hé nhìn biết bầy Sói; bầy Sói nhận 2 nghi phạm nếu Cô Bé còn sống.
• Phù Thủy chỉ được báo và cứu nạn nhân Sói cắn chính.

🎭 CÁC VAI
🐺 Ma Sói: cùng bầy chọn một người để giết mỗi đêm; bầy biết nhau và chat bí mật qua Bot.
🧑‍🌾 Dân Làng: không có kỹ năng, ban ngày thảo luận và bỏ phiếu.
🔮 Tiên Tri: mỗi đêm soi một người, biết họ thuộc phe Sói hay Dân.
🛡️ Bảo Vệ: chặn đòn cắn Sói; được tự bảo vệ nhưng không cùng một người hai đêm liên tiếp.
🧪 Phù Thủy: có một bình Cứu và một bình Độc, mỗi bình chỉ dùng một lần cả ván.
🏹 Thợ Săn: chết do cắn, độc hay treo cổ đều được bắn ngay một người hoặc bỏ qua.
💘 Thần Tình Yêu: setup đêm đầu ghép hai người, có thể gồm chính mình; sau đó hết kỹ năng.
❤️ Người Yêu: một người chết thì người kia chết theo; cặp khác phe có thể cùng thắng.
🤪 Thằng Ngố: thắng một mình nếu bị treo cổ ban ngày; chết ban đêm không tính.
🌕 Sói Trắng: thức cùng bầy, bị soi ra Sói, chỉ thắng khi là người sống sót duy nhất; đêm chẵn được cắn lén một Sói.
👧 Cô Bé: có thể hé nhìn để biết bầy Sói, đổi lại Sói nhận gợi ý hai nghi phạm.
🌗 Bán Sói: khởi đầu phe Dân; trúng đòn cắn chính thì không chết mà hóa Sói.
🔍 Cảnh Sát: theo dõi một hoặc hai người; nếu mục tiêu bị Sói hại sẽ biết hai nghi phạm, đúng một người là Sói.
🐺 Sói Tiên Tri: mỗi đêm chọn soi đúng vai một người HOẶC cùng bầy cắn.
🩸 Phù Thủy Sói: thuộc phe Sói, Tiên Tri thấy là Dân; mỗi đêm dò tìm Tiên Tri thật.
🌑 Sói Nguyền: mỗi đêm chọn vu oan một người HOẶC cùng bầy cắn.
🐶 Sói Con: cùng bầy cắn; nếu chết, đêm kế tiếp bầy Sói được cắn hai người.
🔪 Sát Thủ: mỗi đêm tự giết một người, chỉ thắng khi sống sót cuối cùng.
🎶 Người Thổi Sáo: mỗi đêm mê hoặc hai người, thắng khi mọi người còn sống đều bị mê hoặc.`;

const ROLE_GUIDE = {
  [ROLE.WOLF]: "Mỗi đêm cùng bầy chọn con mồi. Dùng: masoi can <số> · masoi chat <nội dung>",
  [ROLE.VILLAGER]: "Không có kỹ năng đêm. Ban ngày suy luận và bỏ phiếu.",
  [ROLE.SEER]: "Mỗi đêm soi phe một người. Dùng: masoi soi <số>",
  [ROLE.GUARD]: "Chặn đòn cắn Sói; được tự bảo vệ, không cùng mục tiêu hai đêm liền. Dùng: masoi bao <số>",
  [ROLE.WITCH]: "Có 1 bình Cứu và 1 bình Độc. Bot chỉ báo nạn nhân cắn chính ở lượt Phù Thủy.",
  [ROLE.HUNTER]: "Khi chết vì bất kỳ nguyên nhân nào, dùng: masoi ban <số> hoặc masoi ban 0.",
  [ROLE.CUPID]: "Setup đầu ván ghép hai người, có thể gồm bạn. Dùng: masoi ghep <số 1> <số 2>",
  [ROLE.FOOL]: "Thắng một mình ngay khi bị treo cổ ban ngày; chết ban đêm không thắng.",
  [ROLE.WHITE_WOLF]: "Biết bầy Sói nhưng chỉ thắng khi sống sót duy nhất. Đêm chẵn dùng: masoi canlen <số Sói>.",
  [ROLE.LITTLE_GIRL]: "Mỗi đêm chọn masoi henhin để biết bầy Sói, hoặc masoi nhammat để an toàn.",
  [ROLE.HALF_WOLF]: "Khởi đầu phe Dân; nếu trúng cắn chính và không được chắn, bạn hóa Sói thay vì chết.",
  [ROLE.DETECTIVE]: "Theo dõi 1–2 người. Dùng: masoi theodoi <số> [số]",
  [ROLE.WOLF_SEER]: "Mỗi đêm chọn soi đúng vai HOẶC cắn. Dùng: masoi soi <số> / masoi can <số>.",
  [ROLE.WOLF_WITCH]: "Tiên Tri thấy bạn là Dân. Mỗi đêm dò Tiên Tri: masoi do <số>.",
  [ROLE.CURSE_WOLF]: "Mỗi đêm chọn vu oan HOẶC cắn. Dùng: masoi nguyen <số> / masoi can <số>.",
  [ROLE.WOLF_CUB]: "Cùng bầy cắn; khi chết, đêm kế tiếp bầy được cắn hai người.",
  [ROLE.SERIAL_KILLER]: "Mỗi đêm giết một người; chỉ thắng khi sống sót cuối cùng. Dùng: masoi giet <số>.",
  [ROLE.PIED_PIPER]: "Mỗi đêm mê hoặc tối đa hai người. Dùng: masoi mehoac <số 1> <số 2>.",
};

const ROLE_COMMANDS = {
  [ROLE.WOLF]: "can1 hoặc can 1 · chat <nội dung>",
  [ROLE.VILLAGER]: "Không có hành động ban đêm",
  [ROLE.SEER]: "soi1 hoặc soi 1",
  [ROLE.GUARD]: "bao1 hoặc bao 1",
  [ROLE.WITCH]: "cuu · doc1 · xong",
  [ROLE.HUNTER]: "ban1 · ban0 để bỏ qua",
  [ROLE.CUPID]: "ghep 1 2",
  [ROLE.FOOL]: "Ban ngày dùng v1, v2... để vote",
  [ROLE.WHITE_WOLF]: "can1 · đêm chẵn: canlen2",
  [ROLE.LITTLE_GIRL]: "henhin hoặc nhammat",
  [ROLE.HALF_WOLF]: "Sau khi hóa Sói: can1 · chat <nội dung>",
  [ROLE.DETECTIVE]: "theodoi 1 2",
  [ROLE.WOLF_SEER]: "soi1 hoặc can1",
  [ROLE.WOLF_WITCH]: "do1 hoặc do 1",
  [ROLE.CURSE_WOLF]: "nguyen1 hoặc can1",
  [ROLE.WOLF_CUB]: "can1 hoặc can 1",
  [ROLE.SERIAL_KILLER]: "giet1 hoặc giet 1",
  [ROLE.PIED_PIPER]: "mehoac 1 2",
};

const BARE_PRIVATE_ACTIONS = new Set([
  "check", "role", "vai", "help", "hd", "list", "danhsach", "ds", "chat", "ghep", "ban", "vote",
  "leave", "roi", "ra",
  "boqua", "will", "dichuc",
  "cuu", "khongcuu", "doc", "xong", "can", "soi", "bao", "nguyen", "do", "canlen",
  "henhin", "nhin", "nhammat", "khongnhin", "theodoi", "giet", "mehoac",
]);

function normalizeId(value) {
  return String(value);
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

async function fetchPlayerIdentity(api, userId, fallbackName = null) {
  const id = normalizeId(userId);
  try {
    const profile = await getUserInfoBasic(api, id);
    return {
      name: fallbackName || profile?.zaloName || profile?.displayName || id,
      avatar: profile?.avatar || profile?.avatarFull || null,
    };
  } catch {
    return { name: fallbackName || id, avatar: null };
  }
}

function parsePrivateActionText(value) {
  const normalized = normalizeText(value);
  if (normalized === "boqua") return ["vote", "0"];
  const shortVote = normalized.match(/^v\s*(\d+)$/);
  if (shortVote) return ["vote", shortVote[1]];
  const match = normalized.match(/^([a-z]+)\s*(.*)$/);
  if (!match || !BARE_PRIVATE_ACTIONS.has(match[1])) return null;
  const args = match[2] ? match[2].trim().split(/\s+/).filter(Boolean) : [];
  return [match[1], ...args];
}

function roomKey(botId, threadId) {
  return `${botId}_${threadId}`;
}

function codeKey(botId, code) {
  return `${botId}_${String(code).toUpperCase()}`;
}

function getRoomInThread(api, threadId) {
  return rooms.get(roomKey(api.getBotId(), threadId));
}

function getPlayerRoom(api, userId) {
  const botId = api.getBotId();
  const id = normalizeId(userId);
  return [...rooms.values()].find(
    (room) => room.botId === botId && room.players.some((player) => player.id === id)
  );
}

function generateCode(botId) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (roomCodes.has(codeKey(botId, code)));
  return code;
}

function extractMsgId(sent) {
  return (
    sent?.message?.msgId ??
    sent?.msgId ??
    sent?.data?.msgId ??
    sent?.attachment?.[0]?.msgId ??
    sent?.attachments?.[0]?.msgId ??
    (Array.isArray(sent) ? sent[0]?.msgId : null) ??
    null
  );
}

function extractCliMsgId(sent) {
  return (
    sent?.message?.cliMsgId ??
    sent?.cliMsgId ??
    sent?.attachment?.[0]?.cliMsgId ??
    sent?.attachment?.[0]?.clientId ??
    sent?.attachments?.[0]?.cliMsgId ??
    sent?.attachments?.[0]?.clientId ??
    sent?.data?.cliMsgId ??
    (Array.isArray(sent) ? sent[0]?.cliMsgId ?? sent[0]?.clientId : null) ??
    null
  );
}

async function sendGroup(api, room, text, ttl = 300_000) {
  return sendStyledGroupNotice(api, room, text, ttl);
}

async function sendStyledGroupNotice(api, room, body, ttl = 300_000) {
  const serverName = getNameServer(api);
  const serverStyle = getServerStyle(api);
  const msg = `${serverName}\n${body}`;
  const style = MultiMsgStyle([
    MessageStyle(
      0,
      serverName.length,
      serverStyle.color,
      serverStyle.size,
      serverStyle.bold,
      serverStyle.italic,
      serverStyle.underline,
      serverStyle.strike
    ),
    MessageStyle(serverName.length + 1, body.length, COLOR_GREEN, SIZE_16, IS_BOLD),
  ]);
  return api.sendMessage(
    { msg, style, ttl, linkOn: false },
    room.threadId,
    MessageType.GroupMessage
  );
}

async function acceptPendingFriendRequest(api, userId) {
  const id = normalizeId(userId);
  try {
    const response = await api.getFriendRequestList();
    const requests = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
    const pending = requests.some((request) => normalizeId(request?.userId || request?.uid || request?.id) === id);
    if (!pending) return false;
    await api.acceptFriendRequest(id);
    friendRequestCooldown.delete(`${api.getBotId()}_${id}`);
    return true;
  } catch (error) {
    console.error(`[MaSoi] Không tự duyệt được kết bạn với ${id}:`, error?.message || error);
    return false;
  }
}

async function sendWerewolfFriendRequest(api, userId) {
  const id = normalizeId(userId);
  const key = `${api.getBotId()}_${id}`;
  const now = Date.now();
  if (now - (friendRequestCooldown.get(key) || 0) < FRIEND_REQUEST_COOLDOWN_MS) return false;
  friendRequestCooldown.set(key, now);
  try {
    await api.sendFriendRequest(
      id,
      "🐺 Vui lòng kết bạn với Bot để nhận vai và hành động bí mật khi chơi Ma Sói."
    );
    return true;
  } catch (error) {
    // Đã là bạn hoặc đã có lời mời chờ duyệt cũng có thể trả lỗi; lượt retry sẽ kiểm tra DM lại.
    console.warn(`[MaSoi] Không gửi mới được lời mời kết bạn tới ${id}:`, error?.message || error);
    return false;
  }
}

async function sendDirect(api, userId, text, ttl = 600_000) {
  const id = normalizeId(userId);
  try {
    return await api.sendMessage({ msg: text, ttl }, id, MessageType.DirectMessage);
  } catch (error) {
    const accepted = await acceptPendingFriendRequest(api, id);
    if (accepted) return api.sendMessage({ msg: text, ttl }, id, MessageType.DirectMessage);
    throw error;
  }
}

async function reply(api, message, text, ttl = 120_000) {
  return api.sendMessage({ msg: text, ttl }, message.threadId, message.type);
}

async function removeGeneratedImage(imagePath) {
  if (!imagePath) return;
  await fs.promises.unlink(imagePath).catch(() => {});
}

async function recallPreviousRoomImage(api, room) {
  const refKey = groupImageRefKey(api, room.threadId);
  const ref = room.lastImageRef || latestWerewolfGroupImageRefs.get(refKey);
  room.lastImageRef = null;
  if (latestWerewolfGroupImageRefs.delete(refKey)) saveWerewolfImageRefs();
  if (!ref) return;
  try {
    await api.undoMessage({
      type: MessageType.GroupMessage,
      threadId: room.threadId,
      data: { quote: { globalMsgId: ref.msgId, cliMsgId: ref.cliMsgId } },
    });
  } catch (error) {
    console.error(`[MaSoi#${room.code}] Không thu hồi được ảnh cũ:`, error?.message || error);
  }
}

async function sendGroupImageInner(api, room, text, createImage, ttl, fallbackText = text) {
  let imagePath = null;
  try {
    await recallPreviousRoomImage(api, room);
    imagePath = await createImage();
    const sent = await api.sendMessage({ msg: text, attachments: [imagePath], ttl }, room.threadId, MessageType.GroupMessage);
    const msgId = extractMsgId(sent);
    const cliMsgId = extractCliMsgId(sent);
    room.lastImageRef = msgId && cliMsgId ? { msgId, cliMsgId } : null;
    const refKey = groupImageRefKey(api, room.threadId);
    if (room.lastImageRef) latestWerewolfGroupImageRefs.set(refKey, room.lastImageRef);
    else latestWerewolfGroupImageRefs.delete(refKey);
    saveWerewolfImageRefs();
    return sent;
  } catch (error) {
    console.error(`[MaSoi#${room.code}] Không gửi được ảnh nhóm:`, error?.message || error);
    return sendGroup(api, room, fallbackText, ttl);
  } finally {
    await removeGeneratedImage(imagePath);
  }
}

async function sendGroupImage(api, room, text, createImage, ttl = 300_000, fallbackText = text) {
  const previous = room.imageQueue || Promise.resolve();
  const current = previous
    .catch(() => {})
    .then(() => sendGroupImageInner(api, room, text, createImage, ttl, fallbackText));
  room.imageQueue = current;
  return current;
}

async function sendDirectImage(api, room, player, text, createImage, ttl = 600_000) {
  let imagePath = null;
  try {
    imagePath = await createImage();
    return await api.sendMessage(
      { msg: text, attachments: [imagePath], ttl },
      normalizeId(player.id),
      MessageType.DirectMessage
    );
  } catch (error) {
    const accepted = await acceptPendingFriendRequest(api, player.id);
    if (accepted && imagePath) {
      try {
        return await api.sendMessage(
          { msg: text, attachments: [imagePath], ttl },
          normalizeId(player.id),
          MessageType.DirectMessage
        );
      } catch {}
    }
    console.error(`[MaSoi#${room.code}] Không gửi được ảnh vai cho ${player.name}:`, error?.message || error);
    return sendDirect(api, player.id, text, ttl);
  } finally {
    await removeGeneratedImage(imagePath);
  }
}

function clearRoomTimer(room) {
  if (room.timer) clearTimeout(room.timer);
  if (room.dayReminderTimer) clearTimeout(room.dayReminderTimer);
  room.timer = null;
  room.dayReminderTimer = null;
}

function scheduleRoom(room, delay, callback) {
  clearRoomTimer(room);
  const token = ++room.transitionToken;
  room.timer = setTimeout(async () => {
    if (!rooms.has(room.key) || room.transitionToken !== token) return;
    try {
      await callback();
    } catch (error) {
      console.error(`[MaSoi#${room.code}] Lỗi chuyển lượt:`, error);
    }
  }, delay);
}

function deleteRoom(room) {
  clearRoomTimer(room);
  for (const [key, pending] of pendingFriendPlayers.entries()) {
    if (pending.roomKey !== room.key) continue;
    if (pending.timer) clearTimeout(pending.timer);
    pendingFriendPlayers.delete(key);
  }
  rooms.delete(room.key);
  roomCodes.delete(codeKey(room.botId, room.code));
  if (room.lobbyMsgId) lobbyReactions.delete(normalizeId(room.lobbyMsgId));
}

function playerList(room, { aliveOnly = true, excludeId = null } = {}) {
  const players = aliveOnly ? livingPlayers(room) : room.players;
  return players
    .filter((player) => player.id !== excludeId)
    .map((player, index) => `${index + 1}. ${player.name}${player.alive ? "" : " ☠️"}`)
    .join("\n");
}

function indexedPlayers(room, { aliveOnly = true, excludeId = null } = {}) {
  return (aliveOnly ? livingPlayers(room) : room.players).filter((player) => player.id !== excludeId);
}

function targetFromToken(room, token, options = {}) {
  const players = indexedPlayers(room, options);
  const index = Number.parseInt(token, 10) - 1;
  return Number.isInteger(index) && index >= 0 && index < players.length ? players[index] : null;
}

function lobbyText(room, prefix) {
  return `🐺 SẢNH MA SÓI (${room.players.length}/${room.capacity})
🔑 Mã phòng: ${room.code}
👑 Chủ phòng: ${room.hostName}

• Chat Nhóm: thả ❤️ vào tin này hoặc gõ ${prefix}masoi join
• Chat Riêng: masoi ${room.code}
• Bắt đầu khi đủ ≥${MIN_PLAYERS}: ${prefix}masoi start
🤝 Vui lòng kết bạn với Bot để nhận vai và chơi`;
}

async function updateLobby(api, room, prefix) {
  const sent = await sendGroupImage(api, room, lobbyText(room, prefix), () => createWerewolfLobbyImage(room));
  const oldMsgId = room.lobbyMsgId;
  room.lobbyMsgId = extractMsgId(sent);
  if (oldMsgId) lobbyReactions.delete(normalizeId(oldMsgId));
  if (room.lobbyMsgId) lobbyReactions.set(normalizeId(room.lobbyMsgId), room.key);
}

async function setRoomChatLocked(api, room, locked, { restore = false } = {}) {
  if (!restore && room.permissions?.lockChat === false) return true;
  const targetValue = restore ? room.originalLockSendMsg : locked ? 1 : 0;
  if (room.chatLockValue === targetValue) return true;
  const settings = { ...(room.groupSettingSnapshot || {}), lockSendMsg: targetValue };
  try {
    await api.changeGroupSetting(room.threadId, settings);
    room.chatLockValue = targetValue;
    return true;
  } catch (error) {
    console.error(`[MaSoi#${room.code}] Không đổi được lockchat:`, error?.message || error);
    return false;
  }
}

function rolePrivateText(room, player) {
  let extra = (ROLE_GUIDE[player.role] || "").replaceAll("masoi ", "");
  if (isWolf(player)) {
    const pack = room.players.filter((candidate) => isWolf(candidate) && candidate.id !== player.id);
    extra += `\n🐺 Bầy Sói: ${pack.length ? pack.map((candidate) => `${candidate.name} — ${roleName(candidate)}`).join(", ") : "chỉ có bạn"}`;
  }
  return `🐺 MA SÓI — PHÒNG ${room.code}
🎭 Vai của bạn: ${roleName(player)}
⚔️ Phe hiện tại: ${playerTeam(player) === "village" ? "Dân" : playerTeam(player) === "wolf" ? "Sói" : "Độc lập"}

${extra}

👥 Người chơi còn sống:
${playerList(room)}

Lệnh nhanh: ${ROLE_COMMANDS[player.role] || "Không có"}
${room.options?.willEnabled ? "📜 Di chúc: will <nội dung>" : "📜 Di chúc đã tắt ở phòng này"}
Gõ “list” để xem người còn sống; “check” để xem lại vai; “help” để xem hướng dẫn.`;
}

async function sendRoleCard(api, room, player) {
  const team = playerTeam(player) === "village" ? "Dân" : playerTeam(player) === "wolf" ? "Sói" : "Độc lập";
  return sendDirectImage(
    api,
    room,
    player,
    rolePrivateText(room, player),
    () => createWerewolfRoleImage({
      playerId: player.id,
      playerName: player.name,
      playerAvatar: player.avatar,
      roleName: roleName(player),
      teamName: team,
      description: (ROLE_GUIDE[player.role] || "").replaceAll("masoi ", ""),
      commands: `${ROLE_COMMANDS[player.role] || "Không có"}${room.options?.willEnabled ? " · will <nội dung>" : ""}`,
      roomCode: room.code,
    })
  );
}

function privateHelpText(room) {
  return `🐺 MA SÓI — HƯỚNG DẪN CHAT RIÊNG
• check — gửi lại thẻ vai
• list — danh sách người còn sống
• vote <số> hoặc v<số> — bỏ phiếu ban ngày
• boqua hoặc v0 — bỏ phiếu trắng
• Kỹ năng không cần chữ masoi: soi1, giet 2, cuu, doc 3...
${room.options?.willEnabled ? "• will <nội dung> — đặt hoặc sửa di chúc" : "• Phòng này đã tắt di chúc"}`;
}

function parseCreateOptions(args = []) {
  const normalized = args.map(normalizeText);
  const countText = normalized.find((value) => /^\d+$/.test(value));
  return {
    requested: countText ? Number.parseInt(countText, 10) : DEFAULT_PLAYERS,
    sheriffEnabled: !normalized.includes("nosheriff"),
    willEnabled: !normalized.includes("nowill"),
  };
}

async function createRoom(api, message, createArgs = [], groupInfo = null) {
  const botId = api.getBotId();
  const threadId = message.threadId;
  const existingRoom = getRoomInThread(api, threadId);
  if (existingRoom) {
    if (existingRoom.phase !== "waiting") return reply(api, message, "⚠️ Ván Ma Sói của nhóm đang diễn ra, không thể vào giữa chừng.");
    const result = await addPlayer(api, existingRoom, message.data.uidFrom, message.data.dName, message);
    if (!result.success) await reply(api, message, `❌ ${result.message}`);
    return;
  }
  if (getPlayerRoom(api, message.data.uidFrom)) {
    return reply(api, message, "⚠️ Bạn đang ở một phòng Ma Sói khác với Bot này.");
  }
  const createOptions = parseCreateOptions(createArgs);
  const requested = createOptions.requested;
  if (!Number.isInteger(requested) || requested < MIN_PLAYERS || requested > MAX_PLAYERS) {
    return reply(api, message, `⚠️ Số người phải từ ${MIN_PLAYERS} đến ${MAX_PLAYERS}.`);
  }
  const hostId = normalizeId(message.data.uidFrom);
  const hostIdentity = await fetchPlayerIdentity(api, hostId, message.data.dName || null);
  const roomCreatedWhileWaiting = getRoomInThread(api, threadId);
  if (roomCreatedWhileWaiting) {
    if (roomCreatedWhileWaiting.phase !== "waiting") return reply(api, message, "⚠️ Ván Ma Sói của nhóm đang diễn ra, không thể vào giữa chừng.");
    const result = await addPlayer(api, roomCreatedWhileWaiting, hostId, hostIdentity.name, message, { profile: hostIdentity });
    if (!result.success) await reply(api, message, `❌ ${result.message}`);
    return;
  }
  const code = generateCode(botId);
  const key = roomKey(botId, threadId);
  const room = {
    key,
    botId,
    threadId,
    code,
    capacity: requested,
    hostId,
    hostName: hostIdentity.name,
    players: [createPlayer({ id: hostId, name: hostIdentity.name, avatar: hostIdentity.avatar, role: null })],
    phase: "waiting",
    day: 0,
    night: 0,
    timer: null,
    dayReminderTimer: null,
    transitionToken: 0,
    lobbyMsgId: null,
    lastImageRef: null,
    imageQueue: null,
    votes: new Map(),
    witch: { healAvailable: true, poisonAvailable: true },
    wolfCubBonus: 0,
    nightBiteCount: 1,
    actions: createNightActions(),
    hunterQueue: [],
    afterHunter: null,
    deadWarned: new Set(),
    options: {
      sheriffEnabled: createOptions.sheriffEnabled,
      willEnabled: createOptions.willEnabled,
    },
    permissions: {
      muteDead: true,
      lockChat: true,
    },
    groupSettingSnapshot: { ...(groupInfo?.setting || {}) },
    originalLockSendMsg: groupInfo?.setting?.lockSendMsg ? 1 : 0,
    chatLockValue: groupInfo?.setting?.lockSendMsg ? 1 : 0,
  };
  rooms.set(key, room);
  roomCodes.set(codeKey(botId, code), key);
  const prefix = getGlobalPrefix(botId);
  await updateLobby(api, room, prefix);
  if (await ensureWerewolfFriend(api, hostId)) {
    await sendDirect(api, hostId, `✅ Bạn đã tạo phòng Ma Sói ${code}. Tin nhắn riêng hoạt động bình thường.`).catch(() => {});
  } else {
    queuePendingFriendPlayer(api, room, hostId, room.hostName);
    await sendGroup(api, room, "🤝 Chủ phòng vui lòng đồng ý lời mời kết bạn của Bot để nhận vai và chơi.").catch(() => {});
  }
  scheduleRoom(room, LOBBY_TIMEOUT_MS, async () => {
    await sendGroup(api, room, `⌛ Sảnh Ma Sói ${room.code} đã tự giải tán sau 5 phút.`);
    deleteRoom(room);
  });
}

function pendingFriendKey(api, userId) {
  return `${api.getBotId()}_${normalizeId(userId)}`;
}

function clearPendingFriendPlayer(api, userId) {
  const key = pendingFriendKey(api, userId);
  const pending = pendingFriendPlayers.get(key);
  if (pending?.timer) clearTimeout(pending.timer);
  pendingFriendPlayers.delete(key);
}

async function isWerewolfFriend(api, userId) {
  const id = normalizeId(userId);
  const friends = await api.getAllFriends();
  const list = Array.isArray(friends?.data) ? friends.data : Array.isArray(friends) ? friends : [];
  return list.some((friend) => normalizeId(friend?.userId || friend?.uid || friend?.id) === id);
}

async function ensureWerewolfFriend(api, userId, { sendRequest = true } = {}) {
  const id = normalizeId(userId);
  if (await acceptPendingFriendRequest(api, id)) return true;
  try {
    if (await isWerewolfFriend(api, id)) return true;
  } catch (error) {
    console.error(`[MaSoi] Không kiểm tra được bạn bè ${id}:`, error?.message || error);
    // Nếu API danh sách lỗi tạm thời, thử DM để không chặn nhầm người đã kết bạn.
    try {
      await sendDirect(api, id, "🐺 Bot đang kiểm tra kết nối để bạn tham gia Ma Sói.", 60_000);
      return true;
    } catch {}
  }
  if (sendRequest) await sendWerewolfFriendRequest(api, id);
  return false;
}

function queuePendingFriendPlayer(api, room, userId, userName) {
  const id = normalizeId(userId);
  const key = pendingFriendKey(api, id);
  const previous = pendingFriendPlayers.get(key);
  if (previous?.roomKey === room.key) return;
  if (previous?.timer) clearTimeout(previous.timer);

  const pending = { roomKey: room.key, userId: id, userName: userName || id, attempts: 0, timer: null };
  const retry = async () => {
    const currentRoom = rooms.get(pending.roomKey);
    const existingPlayer = currentRoom?.players.find((player) => player.id === id);
    if (!currentRoom || currentRoom.phase !== "waiting" || (!existingPlayer && currentRoom.players.length >= currentRoom.capacity)) {
      clearPendingFriendPlayer(api, id);
      return;
    }
    pending.attempts += 1;
    try {
      await sendDirect(api, id, `✅ Bot đã xác nhận kết bạn thành công với bạn ở phòng Ma Sói ${currentRoom.code}.`);
      clearPendingFriendPlayer(api, id);
      if (existingPlayer) return;
      await addPlayer(api, currentRoom, id, pending.userName, null, { friendConnected: true, announce: true });
        return;
    } catch {}
    if (pending.attempts >= FRIEND_RETRY_LIMIT) {
      clearPendingFriendPlayer(api, id);
      return;
    }
    pending.timer = setTimeout(retry, FRIEND_RETRY_MS);
  };
  pending.timer = setTimeout(retry, FRIEND_RETRY_MS);
  pendingFriendPlayers.set(key, pending);
}

async function addPlayer(api, room, userId, userName, sourceMessage = null, options = {}) {
  const id = normalizeId(userId);
  if (room.phase !== "waiting") return { success: false, message: "Ván đang diễn ra, không thể vào giữa chừng." };
  if (room.players.some((player) => player.id === id)) return { success: false, message: "Bạn đã ở trong phòng rồi." };
  if (getPlayerRoom(api, id)) return { success: false, message: "Bạn đang ở một phòng Ma Sói khác." };
  if (room.players.length >= room.capacity) return { success: false, message: "Phòng đã đủ người." };
  if (!options.friendConnected && !(await ensureWerewolfFriend(api, id))) {
    queuePendingFriendPlayer(api, room, id, userName);
    return {
      success: false,
      pendingFriend: true,
      message: "🤝 Vui lòng kết bạn với Bot để chơi. Bot đã gửi lời mời; sau khi bạn đồng ý, Bot sẽ tự thêm bạn vào sảnh.",
    };
  }
  clearPendingFriendPlayer(api, id);
  try {
    await sendDirect(api, id, `✅ Đã kết nối tin nhắn riêng. Bạn đang vào phòng Ma Sói ${room.code}.`);
  } catch {
    await sendWerewolfFriendRequest(api, id);
    queuePendingFriendPlayer(api, room, id, userName);
    return {
      success: false,
      pendingFriend: true,
      message: "🤝 Chưa gửi được tin riêng. Vui lòng đồng ý kết bạn với Bot; Bot sẽ tự thêm bạn vào sảnh sau đó.",
    };
  }
  const identity = options.profile || await fetchPlayerIdentity(api, id, userName || null);
  room.players.push(createPlayer({ id, name: identity.name, avatar: identity.avatar, role: null }));
  await updateLobby(api, room, getGlobalPrefix(room.botId));
  await sendGroup(
    api,
    room,
    `✅ ${identity.name} đã tham gia phòng (${room.players.length}/${room.capacity}).`
  );
  return { success: true };
}

async function leaveLobby(api, message, room) {
  const senderId = normalizeId(message.data.uidFrom);
  if (room.phase !== "waiting") return reply(api, message, "⚠️ Không thể rời khi ván đang chạy.");
  if (senderId === room.hostId) return cancelRoom(api, message, room);
  const index = room.players.findIndex((player) => player.id === senderId);
  if (index === -1) return reply(api, message, "Bạn không ở trong phòng này.");
  const [removed] = room.players.splice(index, 1);
  await reply(api, message, `🚪 ${removed.name} đã rời phòng.`);
  await updateLobby(api, room, getGlobalPrefix(room.botId));
}

async function cancelRoom(api, message, room, canManage = false) {
  const senderId = normalizeId(message.data.uidFrom);
  if (senderId !== room.hostId && !canManage) return reply(api, message, "Chỉ chủ phòng hoặc quản trị viên được hủy.");
  if (room.phase !== "waiting") await setRoomChatLocked(api, room, false, { restore: true });
  await sendGroup(api, room, "🚪 Phòng Ma Sói đã giải tán.");
  deleteRoom(room);
}

async function startGame(api, message, room, canManage = false) {
  const senderId = normalizeId(message.data.uidFrom);
  if (senderId !== room.hostId && !canManage) return reply(api, message, "Chỉ chủ phòng hoặc quản trị viên được bắt đầu.");
  if (room.phase !== "waiting") return reply(api, message, "Ván đã bắt đầu rồi.");
  if (room.players.length < MIN_PLAYERS) return reply(api, message, `Cần ít nhất ${MIN_PLAYERS} người để bắt đầu.`);
  clearRoomTimer(room);
  const roles = buildRoleDeck(room.players.length, Math.random, {
    excludedRoles: room.options.sheriffEnabled ? [] : [ROLE.DETECTIVE],
  });
  room.players.forEach((player, index) => Object.assign(
    player,
    createPlayer({ id: player.id, name: player.name, avatar: player.avatar, role: roles[index] })
  ));
  room.phase = "starting";
  await setRoomChatLocked(api, room, true);
  if (room.lobbyMsgId) lobbyReactions.delete(normalizeId(room.lobbyMsgId));

  const failures = [];
  for (const player of room.players) {
    try {
      await sendRoleCard(api, room, player);
    } catch {
      failures.push(player.name);
    }
  }
  const startText = `🐺 VÁN MA SÓI BẮT ĐẦU!\n🎭 Bot đã phát vai qua tin nhắn riêng.\n🌙 ${Math.ceil(START_DELAY_MS / 1000)} giây nữa bắt đầu setup đầu ván.${
      failures.length ? `\n⚠️ Không gửi được vai cho: ${failures.join(", ")}. Hãy nhắn riêng Bot rồi gõ “check”.` : ""
    }`;
  await sendGroupImage(
    api,
    room,
    startText,
    () => createWerewolfPhaseImage({
      title: "VÁN MA SÓI BẮT ĐẦU",
      subtitle: `Phòng ${room.code} · ${room.players.length} người chơi`,
      duration: Math.ceil(START_DELAY_MS / 1000),
      accent: "#B58CFF",
      players: storyPlayers(room),
    })
  );
  scheduleRoom(room, START_DELAY_MS, () => beginSetup(api, room));
}

async function beginSetup(api, room) {
  if (!rooms.has(room.key)) return;
  const cupid = room.players.find((player) => player.alive && player.role === ROLE.CUPID);
  if (!cupid) return beginNight(api, room);
  room.phase = "setup";
  await setRoomChatLocked(api, room, true);
  await sendGroupImage(
    api,
    room,
    `💘 SETUP ĐẦU VÁN — Thần Tình Yêu đang bí mật ghép đôi (${Math.ceil(SETUP_TIMEOUT_MS / 1000)} giây).`,
    () => createWerewolfPhaseImage({
      title: "SETUP ĐẦU VÁN",
      subtitle: "Thần Tình Yêu đang bí mật ghép đôi",
      duration: Math.ceil(SETUP_TIMEOUT_MS / 1000),
      accent: "#EC72A8",
      players: storyPlayers(room),
    })
  );
  await sendDirect(
    api,
    cupid.id,
    `💘 Hãy ghép hai người (được gồm chính bạn):\n${playerList(room)}\n\nDùng: ghep <số 1> <số 2>`
  ).catch(() => {});
  scheduleRoom(room, SETUP_TIMEOUT_MS, async () => {
    const choices = shuffle(livingPlayers(room)).slice(0, 2);
    if (choices.length === 2) await completeCupid(api, room, cupid, choices[0], choices[1], true);
    else await beginNight(api, room);
  });
}

async function completeCupid(api, room, cupid, first, second, automatic = false) {
  clearRoomTimer(room);
  const lovers = linkLovers(room, first.id, second.id);
  await Promise.all(
    lovers.map((lover) => {
      const partner = lover.id === first.id ? second : first;
      return sendDirect(api, lover.id, `❤️ Bạn và ${partner.name} đã trở thành Người Yêu. Một người chết, người kia chết theo.`).catch(() => {});
    })
  );
  await sendDirect(api, cupid.id, `✅ ${automatic ? "Bot tự chọn" : "Bạn đã ghép"} ${first.name} ❤️ ${second.name}.`).catch(() => {});
  await sendGroup(api, room, "💘 Thần Tình Yêu đã hoàn tất ghép đôi. Màn đêm bắt đầu.");
  return beginNight(api, room);
}

function wolfPack(room, aliveOnly = true) {
  return room.players.filter((player) => isWolf(player) && (!aliveOnly || player.alive));
}

function storyPlayers(room) {
  return room.players.map((player) => ({ ...player, displayRole: roleName(player) }));
}

function nightStory(room) {
  const fallen = room.players.filter((player) => !player.alive);
  if (room.night === 1) {
    return "Đêm đầu tiên phủ xuống ngôi làng. Sau những cánh cửa đóng kín, bầy Sói bắt đầu đánh hơi con mồi, còn các năng lực bí mật âm thầm thức giấc. Ai sẽ còn được nhìn thấy bình minh?";
  }
  const fallenText = fallen.length
    ? `Những cái tên đã hóa thành ký ức: ${fallen.map((player) => player.name).join(", ")}.`
    : "Cho tới lúc này, ngôi làng vẫn chưa mất đi ai.";
  return `Đêm ${room.night} trở lại, nặng nề hơn sau ${room.day} ngày phán xét. ${fallenText} ${livingPlayers(room).length} người còn sống tiếp tục che giấu thân phận, trong khi bóng tối chuẩn bị viết thêm một chương mới.`;
}

function deathStory(room, deaths, heading) {
  const remaining = livingPlayers(room).length;
  if (!deaths.length) {
    return heading.includes("BÌNH MINH")
      ? `Bình minh ngày ${room.day + 1} len qua mái làng. Không có thi thể nào được tìm thấy sau đêm ${room.night}; ${remaining} người vẫn còn sống, nhưng sự bình yên này có thể chỉ là khoảng lặng trước cơn bão.`
      : `Phán quyết khép lại mà không có ai phải ngã xuống. ${remaining} người còn sống trở về trong nghi kỵ, chờ màn đêm tiếp theo.`;
  }
  const events = deaths.map(({ player, cause }) => `${player.name} ${cause}`).join("; ");
  const opening = heading.includes("TREO CỔ")
    ? "Tiếng tranh luận tắt dần khi sợi dây phán quyết được kéo lên."
    : `Bình minh sau đêm ${room.night} mang theo tin dữ.`;
  return `${opening} ${events}. Vai trò của người đã khuất được hé lộ trước cả làng. Chỉ còn ${remaining} người sống sót để tiếp tục cuộc săn tìm sự thật.`;
}

function winnerTitle(winner) {
  const titles = {
    village: "PHE DÂN CHIẾN THẮNG",
    wolf: "PHE SÓI CHIẾN THẮNG",
    white_wolf: "SÓI TRẮNG ĐỘC TÔN",
    serial: "SÁT THỦ ĐỘC TÔN",
    piper: "NGƯỜI THỔI SÁO THẮNG",
    lovers: "TÌNH YÊU CHIẾN THẮNG",
    fool: "THẰNG NGỐ CHIẾN THẮNG",
    draw: "NGÔI LÀNG KHÔNG CÓ KẺ THẮNG",
  };
  return titles[winner.type] || "VÁN MA SÓI KHÉP LẠI";
}

function endingStory(room, winner, names) {
  const stories = {
    village: "Khi tiếng tru cuối cùng tắt hẳn, dân làng mở cửa bước ra ánh sáng. Những suy luận, sự hy sinh và lòng can đảm đã giúp họ quét sạch bóng Sói khỏi ngôi làng.",
    wolf: "Những ngọn đèn cuối cùng lần lượt tắt. Bầy Sói đã gieo đủ nghi ngờ để con người tự loại bỏ lẫn nhau, rồi đường hoàng chiếm lấy ngôi làng trong màn đêm.",
    white_wolf: "Không còn đồng loại, cũng chẳng còn kẻ thù. Sói Trắng phản bội tất cả và đứng một mình giữa ngôi làng hoang vắng — kẻ sống sót duy nhất.",
    serial: "Trong lúc hai phe giằng co, một lưỡi dao đơn độc lặng lẽ kết liễu tất cả. Sát Thủ là cái bóng cuối cùng còn đứng dưới bình minh lạnh giá.",
    piper: "Khúc sáo len qua từng căn nhà cho đến khi không còn ai cưỡng lại. Cả ngôi làng bước theo một giai điệu duy nhất và Người Thổi Sáo hoàn tất lời nguyền.",
    lovers: "Giữa lời nguyền và những cuộc săn, hai trái tim khác phe vẫn bảo vệ nhau tới cuối cùng. Tình yêu đã thắng cả dân làng lẫn bầy Sói.",
    fool: "Tiếng reo hò kết tội bỗng hóa thành tiếng cười. Dân làng đã treo đúng người mong muốn bị treo, và Thằng Ngố một mình đoạt chiến thắng.",
    draw: "Không còn tiếng nói nào để kể tiếp câu chuyện. Ngôi làng chìm vào im lặng, để lại một ván đấu không có người chiến thắng.",
  };
  const winners = names.length ? `Danh dự thuộc về ${names.join(", ")}.` : "Không ai được xướng tên chiến thắng.";
  return `${stories[winner.type] || winner.text} ${winners} Muốn phục thù? Dùng ${getGlobalPrefix(room.botId)}masoi create để mở một biên niên sử mới.`;
}

async function beginNight(api, room) {
  if (!rooms.has(room.key)) return;
  clearRoomTimer(room);
  room.phase = "night";
  room.night += 1;
  room.actions = createNightActions();
  room.nightBiteCount = 1 + (room.wolfCubBonus || 0);
  room.wolfCubBonus = 0;
  room.mainWolfVictims = [];
  room.witchVictimId = null;
  await setRoomChatLocked(api, room, true);
  await sendGroupImage(
    api,
    room,
    `🌙 ĐÊM ${room.night} — cả làng nhắm mắt\n🎭 Vai có kỹ năng mở tin nhắn riêng với Bot.\n⏳ Có ${Math.ceil(NIGHT_TIMEOUT_MS / 1000)} giây hành động.${room.nightBiteCount > 1 ? `\n🐶 Sói Con đã chết: bầy Sói được chọn ${room.nightBiteCount} nạn nhân!` : ""}`,
    () => createWerewolfNightImage({
      night: room.night,
      duration: Math.ceil(NIGHT_TIMEOUT_MS / 1000),
      players: storyPlayers(room),
      story: nightStory(room),
    })
  );
  await promptNightRoles(api, room);
  scheduleRoom(room, NIGHT_TIMEOUT_MS, () => closeNightActions(api, room));
}

async function promptNightRoles(api, room) {
  const list = playerList(room);
  const jobs = [];
  for (const player of livingPlayers(room)) {
    let prompt = null;
    if (canJoinWolfBite(player)) {
      prompt = `🐺 ĐÊM ${room.night}\n${list}\n\nDùng: can <${room.nightBiteCount > 1 ? `${room.nightBiteCount} số` : "số"}>`;
      if (player.role === ROLE.WOLF_SEER) prompt += "\nHoặc: soi<số> (soi đúng vai, không cắn)";
      if (player.role === ROLE.CURSE_WOLF) prompt += "\nHoặc: nguyen<số> (vu oan, không cắn)";
      if (player.role === ROLE.WHITE_WOLF && room.night % 2 === 0) prompt += "\nCắn lén Sói: canlen<số>";
    } else if (player.role === ROLE.SEER) prompt = `🔮 Chọn người soi:\n${list}\n\nsoi<số> hoặc soi <số>`;
    else if (player.role === ROLE.GUARD) prompt = `🛡️ Chọn người bảo vệ (không trùng đêm trước):\n${list}\n\nbao<số> hoặc bao <số>`;
    else if (player.role === ROLE.WITCH) prompt = "🧪 Hãy chờ Bot chốt cú cắn chính; sau đó Bot sẽ báo riêng cho bạn.";
    else if (player.role === ROLE.LITTLE_GIRL) prompt = "👧 Chọn: henhin hoặc nhammat";
    else if (player.role === ROLE.DETECTIVE) prompt = `🔍 Theo dõi 1–2 người:\n${list}\n\ntheodoi <số> [số]`;
    else if (player.role === ROLE.WOLF_WITCH) prompt = `🩸 Dò Tiên Tri thật:\n${list}\n\ndo<số> hoặc do <số>`;
    else if (player.role === ROLE.SERIAL_KILLER) prompt = `🔪 Chọn nạn nhân:\n${list}\n\ngiet<số> hoặc giet <số>`;
    else if (player.role === ROLE.PIED_PIPER) prompt = `🎶 Mê hoặc 2 người:\n${list}\n\nmehoac <số 1> <số 2>`;
    if (prompt) jobs.push(sendDirect(api, player.id, prompt).catch(() => {}));
  }
  await Promise.all(jobs);
}

async function closeNightActions(api, room) {
  if (room.phase !== "night") return;
  clearRoomTimer(room);
  room.mainWolfVictims = selectWolfVictims(room).filter((id) => room.players.some((player) => player.id === id && player.alive));
  room.witchVictimId = room.mainWolfVictims[0] || null;
  const witch = room.players.find((player) => player.alive && player.role === ROLE.WITCH);
  if (!witch || (!room.witch.healAvailable && !room.witch.poisonAvailable)) return resolveNight(api, room);

  room.phase = "witch";
  const victim = room.players.find((player) => player.id === room.witchVictimId);
  const victimText = victim ? `🐺 Nạn nhân Sói cắn chính: ${victim.name}.` : "🐺 Đêm nay bầy Sói chưa chốt được nạn nhân chính.";
  const commands = [];
  if (room.witch.healAvailable && victim) commands.push("cuu hoặc cuu 1 — dùng bình Cứu cho nạn nhân chính");
  if (room.witch.poisonAvailable) commands.push(`doc<số> hoặc doc <số> — dùng bình Độc\n${playerList(room)}`);
  commands.push("xong — kết thúc lượt");
  await sendDirect(api, witch.id, `🧪 LƯỢT PHÙ THỦY\n${victimText}\n\n${commands.join("\n")}`).catch(() => {});
  scheduleRoom(room, WITCH_TIMEOUT_MS, () => resolveNight(api, room));
}

function chooseDetectiveSuspects(room, watchedId) {
  const attackers = [...room.actions.wolfVotes.entries()]
    .filter(([, targets]) => targets.includes(watchedId))
    .map(([id]) => room.players.find((player) => player.id === id))
    .filter(Boolean);
  const actualWolf = shuffle(attackers.length ? attackers : wolfPack(room))[0];
  if (!actualWolf) return [];
  const decoys = room.players.filter((player) => player.id !== actualWolf.id && !isWolf(player));
  const decoy = shuffle(decoys)[0];
  return shuffle([actualWolf, decoy].filter(Boolean));
}

async function resolveNight(api, room) {
  if (!["night", "witch"].includes(room.phase)) return;
  clearRoomTimer(room);
  room.phase = "resolving";
  const actions = room.actions;
  const framed = new Set(actions.framedTarget ? [actions.framedTarget] : []);

  const seer = room.players.find((player) => player.role === ROLE.SEER);
  const seerTarget = room.players.find((player) => player.id === actions.seerTarget);
  if (seer?.alive && seerTarget) {
    await sendDirect(api, seer.id, `🔮 Kết quả: ${seerTarget.name} thuộc phe “${seerResult(seerTarget, framed)}”.`).catch(() => {});
  }
  const wolfSeer = room.players.find((player) => player.role === ROLE.WOLF_SEER);
  const wolfSeerTarget = room.players.find((player) => player.id === actions.wolfSeerTarget);
  if (wolfSeer?.alive && wolfSeerTarget) {
    await sendDirect(api, wolfSeer.id, `🐺 Kết quả soi: ${wolfSeerTarget.name} là ${roleName(wolfSeerTarget)}.`).catch(() => {});
  }
  const wolfWitch = room.players.find((player) => player.role === ROLE.WOLF_WITCH);
  const probeTarget = room.players.find((player) => player.id === actions.wolfWitchTarget);
  if (wolfWitch?.alive && probeTarget) {
    await sendDirect(api, wolfWitch.id, `🩸 ${probeTarget.name} ${probeTarget.role === ROLE.SEER ? "CHÍNH LÀ Tiên Tri thật" : "không phải Tiên Tri thật"}.`).catch(() => {});
  }

  const deathQueue = [];
  const protectedId = actions.guardTarget;
  const guard = room.players.find((player) => player.role === ROLE.GUARD);
  if (guard?.alive) guard.lastProtectedId = protectedId || null;
  const wolfHarmedIds = [];
  for (const victimId of room.mainWolfVictims) {
    const victim = room.players.find((player) => player.id === victimId && player.alive);
    if (!victim) continue;
    const isPrimary = victim.id === room.witchVictimId;
    const blocked = victim.id === protectedId || (isPrimary && actions.witchHeal);
    if (blocked) continue;
    wolfHarmedIds.push(victim.id);
    if (victim.role === ROLE.HALF_WOLF && !victim.converted) {
      victim.converted = true;
      await sendDirect(api, victim.id, "🌗 Bạn bị Ma Sói cắn nhưng không chết — bạn đã HÓA SÓI!").catch(() => {});
      for (const wolf of wolfPack(room).filter((player) => player.id !== victim.id)) {
        await sendDirect(api, wolf.id, `🌗 ${victim.name} đã hóa Sói và gia nhập bầy.`).catch(() => {});
      }
    } else {
      deathQueue.push({ id: victim.id, cause: "bị bầy Sói cắn" });
    }
  }
  if (actions.witchHeal && room.witch.healAvailable && room.witchVictimId) room.witch.healAvailable = false;
  if (actions.witchPoisonTarget && room.witch.poisonAvailable) {
    room.witch.poisonAvailable = false;
    deathQueue.push({ id: actions.witchPoisonTarget, cause: "trúng độc của Phù Thủy" });
  }
  if (actions.serialTarget) deathQueue.push({ id: actions.serialTarget, cause: "bị Sát Thủ hạ sát" });
  if (actions.whiteWolfTarget && actions.whiteWolfTarget !== protectedId) {
    deathQueue.push({ id: actions.whiteWolfTarget, cause: "bị Sói Trắng cắn lén" });
  }

  for (const targetId of actions.charmTargets) {
    const target = room.players.find((player) => player.id === targetId && player.alive);
    if (target) target.charmed = true;
  }

  const deaths = applyDeaths(room, deathQueue);

  const detective = room.players.find((player) => player.role === ROLE.DETECTIVE && player.alive);
  if (detective) {
    const harmedTonight = new Set([...wolfHarmedIds, ...deaths.map(({ player }) => player.id)]);
    const harmed = actions.detectiveTargets.find((id) => harmedTonight.has(id));
    if (harmed) {
      const suspects = chooseDetectiveSuspects(room, harmed);
      if (suspects.length) {
        await sendDirect(api, detective.id, `🔍 Người bạn theo dõi đã bị hại. Hai nghi phạm: ${suspects.map((player) => player.name).join(" hoặc ")} — đúng một người là Sói.`).catch(() => {});
      }
    }
  }

  const girl = room.players.find((player) => player.role === ROLE.LITTLE_GIRL);
  if (girl?.alive && actions.littleGirlPeek) {
    await sendDirect(api, girl.id, `👧 Bạn đã hé nhìn và thấy bầy Sói: ${wolfPack(room).map((player) => player.name).join(", ") || "không còn ai"}.`).catch(() => {});
    const nonWolves = livingPlayers(room).filter((player) => !isWolf(player) && player.id !== girl.id);
    const decoy = shuffle(nonWolves)[0];
    const suspects = shuffle([girl, decoy].filter(Boolean));
    for (const wolf of wolfPack(room)) {
      await sendDirect(api, wolf.id, `👁️ Bầy cảm nhận Cô Bé đang hé nhìn. Hai nghi phạm: ${suspects.map((player) => player.name).join(" hoặc ")}.`).catch(() => {});
    }
  }

  await announceDeaths(api, room, deaths, `☀️ BÌNH MINH — KẾT QUẢ ĐÊM ${room.night}`);
  await processHunters(api, room, deaths, async () => {
    if (await finishIfWinner(api, room)) return;
    await beginDay(api, room);
  });
}

async function announceDeaths(api, room, deaths, heading) {
  const body = deaths.length
    ? deaths.map(({ player, cause }) => `☠️ ${player.name} — ${cause} — ${roleName(player)}`).join("\n")
    : "🌤️ Không ai chết.";
  await sendGroupImage(
    api,
    room,
    `${heading}\n${body}`,
    () => createWerewolfDeathImage({
      heading,
      players: storyPlayers(room),
      deaths: deaths.map(({ player, cause }) => ({
        player: { ...player, displayRole: roleName(player) },
        cause,
      })),
      story: deathStory(room, deaths, heading),
    })
  );
  await Promise.all(
    deaths.map(async ({ player, cause }) => {
      try {
        await sendDirect(
          api,
          player.id,
          `☠️ BẠN ĐÃ NGÃ XUỐNG\n🎭 Vai của bạn: ${roleName(player)}\n⚰️ Nguyên nhân: ${cause}\n\n👻 Bạn đã bị loại khỏi ván. Hãy giữ kín thông tin và theo dõi phần còn lại của trận đấu.`
        );
      } catch {
        await sendWerewolfFriendRequest(api, player.id).catch(() => {});
      }
    })
  );
  if (room.options?.willEnabled) {
    const wills = deaths
      .filter(({ player }) => player.will)
      .map(({ player }) => `📜 ${player.name}: “${player.will}”`);
    if (wills.length) await sendGroup(api, room, `📜 DI CHÚC ĐỂ LẠI\n${wills.join("\n")}`, 300_000);
  }
}

async function processHunters(api, room, deaths, continuation) {
  const hunters = deaths.filter(({ player }) => player.role === ROLE.HUNTER).map(({ player }) => player.id);
  room.hunterQueue.push(...hunters.filter((id) => !room.hunterQueue.includes(id)));
  room.afterHunter = continuation;
  return promptNextHunter(api, room);
}

async function promptNextHunter(api, room) {
  const hunterId = room.hunterQueue.shift();
  if (!hunterId) {
    const continuation = room.afterHunter;
    room.afterHunter = null;
    if (continuation) await continuation();
    return;
  }
  const hunter = room.players.find((player) => player.id === hunterId);
  if (!hunter) return promptNextHunter(api, room);
  room.phase = "hunter";
  room.activeHunterId = hunter.id;
  await sendGroup(api, room, `🏹 ${hunter.name} là Thợ Săn và có ${Math.ceil(HUNTER_TIMEOUT_MS / 1000)} giây để bắn hoặc bỏ qua.`);
  await sendDirect(api, hunter.id, `🏹 Chọn người bắn:\n${playerList(room)}\n\nban<số> hoặc ban <số> · ban0 để không bắn`).catch(() => {});
  scheduleRoom(room, HUNTER_TIMEOUT_MS, async () => {
    await sendGroup(api, room, `🏹 ${hunter.name} đã không bắn.`);
    room.activeHunterId = null;
    await promptNextHunter(api, room);
  });
}

async function beginDay(api, room) {
  if (!rooms.has(room.key)) return;
  room.phase = "day";
  room.day += 1;
  room.votes = new Map();
  await setRoomChatLocked(api, room, false);
  const list = playerList(room);
  await sendGroupImage(
    api,
    room,
    `☀️ NGÀY ${room.day} — thảo luận & bỏ phiếu\n⏳ Có ${Math.ceil(DAY_TIMEOUT_MS / 1000)} giây.\n💬 Vote trong nhóm: v1, v2... · v0 để bỏ phiếu trắng\n✉️ Hoặc nhắn riêng Bot: vote <số>\n\n${list}`,
    () => createWerewolfPhaseImage({
      title: `NGÀY ${room.day}`,
      subtitle: "Thảo luận và bỏ phiếu treo cổ",
      duration: Math.ceil(DAY_TIMEOUT_MS / 1000),
      accent: "#F8C75C",
      players: storyPlayers(room),
    })
  );
  await Promise.all(
    livingPlayers(room).map((player) =>
      sendDirect(api, player.id, `⚖️ Bỏ phiếu ngày ${room.day}:\n${list}\n\nTrong nhóm: v<số> · Chat riêng: vote <số> · số 0 để trắng`).catch(() => {})
    )
  );
  scheduleRoom(room, DAY_TIMEOUT_MS, () => resolveDay(api, room));
  room.dayReminderTimer = setTimeout(async () => {
    if (!rooms.has(room.key) || room.phase !== "day") return;
    await sendGroup(api, room, "⏰ Còn 15 giây để vote, ai chưa vote thì nhanh tay vote!").catch(() => {});
  }, Math.max(0, DAY_TIMEOUT_MS - DAY_REMINDER_BEFORE_END_MS));
}

async function resolveDay(api, room) {
  if (room.phase !== "day") return;
  clearRoomTimer(room);
  room.phase = "resolving";
  await setRoomChatLocked(api, room, true);
  const tally = new Map();
  for (const targetId of room.votes.values()) {
    if (targetId) tally.set(targetId, (tally.get(targetId) || 0) + 1);
  }
  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length || (ranked[1] && ranked[0][1] === ranked[1][1])) {
    await sendGroup(api, room, ranked.length ? "⚖️ Phiếu hòa — hôm nay không ai bị treo cổ." : "⚖️ Không đủ phiếu — hôm nay không ai bị treo cổ.");
    if (await finishIfWinner(api, room)) return;
    scheduleRoom(room, NEXT_PHASE_DELAY_MS, () => beginNight(api, room));
    return;
  }
  const target = room.players.find((player) => player.id === ranked[0][0] && player.alive);
  if (!target) {
    scheduleRoom(room, NEXT_PHASE_DELAY_MS, () => beginNight(api, room));
    return;
  }
  if (target.role === ROLE.FOOL) {
    await finishGame(api, room, { type: "fool", winners: [target.id], text: `${target.name} là Thằng Ngố và đã bị treo cổ đúng mục tiêu` });
    return;
  }
  const deaths = applyDeaths(room, [{ id: target.id, cause: "bị dân làng treo cổ" }]);
  await announceDeaths(api, room, deaths, "⚖️ KẾT QUẢ TREO CỔ");
  await processHunters(api, room, deaths, async () => {
    if (await finishIfWinner(api, room)) return;
    scheduleRoom(room, NEXT_PHASE_DELAY_MS, () => beginNight(api, room));
  });
}

async function finishIfWinner(api, room) {
  const winner = determineWinner(room);
  if (!winner) return false;
  await finishGame(api, room, winner);
  return true;
}

function rankTitle(wins) {
  if (wins >= 20) return "👑 Huyền Thoại Làng Sói";
  if (wins >= 10) return "🐺 Bậc Thầy Săn Sói";
  if (wins >= 5) return "⚔️ Người Chơi Kỳ Cựu";
  return "🌱 Tân Binh";
}

function recordGameResult(room, winner) {
  const botId = normalizeId(room.botId);
  const threadId = normalizeId(room.threadId);
  rankData[botId] ||= {};
  rankData[botId][threadId] ||= {};
  const winnerIds = new Set(winner.winners.map(normalizeId));
  for (const player of room.players) {
    const current = rankData[botId][threadId][player.id] || { name: player.name, games: 0, wins: 0, points: 0 };
    // Điểm rank là số trận thắng; dữ liệu cũ cũng được chuẩn hóa theo luật này.
    current.points = Number(current.wins || 0);
    current.name = player.name;
    current.games += 1;
    if (winnerIds.has(player.id)) {
      current.wins += 1;
      current.points += 1;
    }
    current.lastPlayedAt = Date.now();
    rankData[botId][threadId][player.id] = current;
  }
  saveRankData();
}

function groupRankData(api, threadId) {
  return Object.entries(rankData[normalizeId(api.getBotId())]?.[normalizeId(threadId)] || {})
    .map(([id, player]) => {
      const games = Number(player.games || 0);
      const wins = Number(player.wins || 0);
      const points = wins;
      return { id, ...player, games, wins, points, winRate: games ? Math.round((wins / games) * 100) : 0, title: rankTitle(wins) };
    })
    .sort((a, b) => b.points - a.points || b.wins - a.wins || b.games - a.games)
    .slice(0, 10);
}

async function sendGroupRank(api, message) {
  const entries = groupRankData(api, message.threadId);
  if (!entries.length) return reply(api, message, "🏆 Nhóm chưa có dữ liệu xếp hạng Ma Sói.");
  let imagePath = null;
  try {
    imagePath = await createWerewolfRankImage({
      groupName: message.data?.groupName || `Nhóm ${message.threadId}`,
      players: entries,
    });
    return await api.sendMessage(
      { msg: "🏆 Bảng xếp hạng Ma Sói", attachments: [imagePath], ttl: 300_000 },
      message.threadId,
      message.type
    );
  } catch (error) {
    console.error("[MaSoi] Không tạo được canvas rank:", error?.message || error);
    return reply(api, message, entries.map((player, index) => `${index + 1}. ${player.name} — ${player.points} điểm`).join("\n"));
  } finally {
    await removeGeneratedImage(imagePath);
  }
}

async function finishGame(api, room, winner) {
  clearRoomTimer(room);
  room.phase = "ended";
  await setRoomChatLocked(api, room, false, { restore: true });
  recordGameResult(room, winner);
  const names = winner.winners
    .map((id) => room.players.find((player) => player.id === id)?.name)
    .filter(Boolean);
  const reveal = room.players
    .map((player) => `${player.alive ? "✅" : "☠️"} ${player.name}: ${roleName(player)}`)
    .join("\n");
  const resultText = `🏆 KẾT THÚC VÁN MA SÓI\n${winner.text}.\n🎉 Người thắng: ${names.join(", ") || "không có"}`;
  await sendGroupImage(
    api,
    room,
    resultText,
    () => createWerewolfEndImage({
      winnerTitle: winnerTitle(winner),
      winnerText: winner.text,
      winnerNames: names,
      winnerIds: winner.winners,
      players: storyPlayers(room),
      story: endingStory(room, winner, names),
    }),
    600_000,
    `${resultText}\n\n🎭 CÔNG KHAI VAI\n${reveal}`
  );
  deleteRoom(room);
}

function requirePhase(room, phase) {
  return Array.isArray(phase) ? phase.includes(room.phase) : room.phase === phase;
}

async function broadcastWolfChat(api, room, sender, content) {
  if (!isWolf(sender) || !sender.alive) return false;
  const text = content.trim();
  if (!text) return false;
  await Promise.all(
    wolfPack(room)
      .filter((wolf) => wolf.id !== sender.id)
      .map((wolf) => sendDirect(api, wolf.id, `🐺 [${sender.name}]: ${text}`).catch(() => {}))
  );
  await sendDirect(api, sender.id, "✅ Đã gửi vào kênh chat bầy Sói.").catch(() => {});
  return true;
}

async function submitDayVote(api, room, player, token, { confirmDirect = false } = {}) {
  if (room.phase !== "day") return { success: false, message: "Hiện chưa tới thời gian bỏ phiếu." };
  if (!player?.alive) return { success: false, message: "Bạn đã chết, không thể bỏ phiếu." };

  let target = null;
  if (String(token) !== "0") target = targetFromToken(room, token);
  if (String(token) !== "0" && !target) {
    return { success: false, message: "Số phiếu không hợp lệ. Gõ list trong chat riêng để xem." };
  }
  if (target && target.id === player.id) {
    return { success: false, message: "Bạn không thể tự bỏ phiếu cho chính mình." };
  }

  room.votes.set(player.id, target?.id || null);
  if (confirmDirect) {
    await sendDirect(api, player.id, `✅ Đã bỏ phiếu ${target ? target.name : "trắng"}.`);
  }
  await sendStyledGroupNotice(
    api,
    room,
    `${player.name} đã bỏ phiếu ${target ? target.name : "trắng"}.\nĐã bỏ phiếu: ${room.votes.size}/${livingPlayers(room).length}`
  );
  if (room.votes.size >= livingPlayers(room).length) await resolveDay(api, room);
  return { success: true };
}

async function handlePrivateGameAction(api, message, room, parts) {
  const senderId = normalizeId(message.data.uidFrom);
  const player = room.players.find((candidate) => candidate.id === senderId);
  if (!player) return false;
  const action = normalizeText(parts[1]);

  if (["check", "role", "vai"].includes(action)) {
    if (!player.role) await sendDirect(api, player.id, `⏳ Phòng ${room.code} chưa bắt đầu nên bạn chưa có vai.`);
    else await sendRoleCard(api, room, player);
    return true;
  }
  if (["help", "hd"].includes(action)) {
    await sendDirect(api, player.id, privateHelpText(room));
    return true;
  }
  if (["list", "danhsach", "ds"].includes(action)) {
    await sendDirect(api, player.id, `👥 Người còn sống:\n${playerList(room)}`);
    return true;
  }
  if (action === "chat") return broadcastWolfChat(api, room, player, parts.slice(2).join(" "));

  if (["will", "dichuc"].includes(action)) {
    if (!room.options?.willEnabled) {
      await sendDirect(api, player.id, "❌ Phòng này đã tắt di chúc bằng tùy chọn nowill.");
      return true;
    }
    if (!player.role || !player.alive) {
      await sendDirect(api, player.id, "❌ Chỉ người còn sống trong ván mới được đặt di chúc.");
      return true;
    }
    const content = parts.slice(2).join(" ").trim().slice(0, 500);
    if (!content) {
      await sendDirect(api, player.id, player.will ? `📜 Di chúc hiện tại: ${player.will}` : "📜 Dùng: will <nội dung>");
      return true;
    }
    player.will = content;
    await sendDirect(api, player.id, "✅ Đã lưu di chúc. Di chúc sẽ công khai khi bạn chết.");
    return true;
  }

  if (room.phase === "setup" && player.role === ROLE.CUPID && action === "ghep") {
    const first = targetFromToken(room, parts[2]);
    const second = targetFromToken(room, parts[3]);
    if (!first || !second || first.id === second.id) {
      await sendDirect(api, player.id, "❌ Chọn hai số hợp lệ và khác nhau. Gõ list để xem.");
      return true;
    }
    await completeCupid(api, room, player, first, second);
    return true;
  }

  if (room.phase === "hunter" && room.activeHunterId === player.id && action === "ban") {
    if (String(parts[2]) === "0") {
      clearRoomTimer(room);
      room.activeHunterId = null;
      await sendGroup(api, room, `🏹 ${player.name} đã chọn không bắn.`);
      await promptNextHunter(api, room);
      return true;
    }
    const target = targetFromToken(room, parts[2]);
    if (!target) {
      await sendDirect(api, player.id, "❌ Mục tiêu không hợp lệ.");
      return true;
    }
    clearRoomTimer(room);
    room.activeHunterId = null;
    const deaths = applyDeaths(room, [{ id: target.id, cause: `bị Thợ Săn ${player.name} bắn` }]);
    await announceDeaths(api, room, deaths, "🏹 PHÁT SÚNG CUỐI CÙNG");
    room.hunterQueue.push(...deaths.filter(({ player: dead }) => dead.role === ROLE.HUNTER).map(({ player: dead }) => dead.id));
    await promptNextHunter(api, room);
    return true;
  }

  if (room.phase === "day" && action === "vote") {
    const result = await submitDayVote(api, room, player, parts[2], { confirmDirect: true });
    if (!result.success) await sendDirect(api, player.id, `❌ ${result.message}`);
    return true;
  }

  if (room.phase === "witch" && player.role === ROLE.WITCH) {
    if (action === "cuu") {
      if (!room.witch.healAvailable) await sendDirect(api, player.id, "❌ Bình Cứu đã dùng rồi.");
      else if (!room.witchVictimId) await sendDirect(api, player.id, "❌ Không có nạn nhân cắn chính để cứu.");
      else {
        room.actions.witchHeal = true;
        await sendDirect(api, player.id, "✅ Đã chọn dùng bình Cứu cho nạn nhân cắn chính.");
      }
      return true;
    }
    if (action === "khongcuu") {
      room.actions.witchHeal = false;
      await sendDirect(api, player.id, "✅ Đã chọn không cứu.");
      return true;
    }
    if (action === "doc") {
      if (!room.witch.poisonAvailable) await sendDirect(api, player.id, "❌ Bình Độc đã dùng rồi.");
      else {
        const target = targetFromToken(room, parts[2]);
        if (!target) await sendDirect(api, player.id, "❌ Mục tiêu không hợp lệ.");
        else {
          room.actions.witchPoisonTarget = target.id;
          await sendDirect(api, player.id, `✅ Đã chọn đầu độc ${target.name}.`);
        }
      }
      return true;
    }
    if (action === "xong") {
      await sendDirect(api, player.id, "✅ Đã chốt lượt Phù Thủy.");
      await resolveNight(api, room);
      return true;
    }
  }

  if (room.phase !== "night") {
    await sendDirect(api, player.id, `⏳ Hiện đang ở giai đoạn ${room.phase}; lệnh này chưa dùng được.`);
    return true;
  }
  if (!player.alive) {
    await sendDirect(api, player.id, "☠️ Bạn đã chết, không thể hành động.");
    return true;
  }

  const setTarget = async (token, validator = () => true) => {
    const target = targetFromToken(room, token);
    if (!target || !validator(target)) {
      await sendDirect(api, player.id, "❌ Mục tiêu không hợp lệ. Gõ list để xem số mới nhất.");
      return null;
    }
    return target;
  };

  if (action === "can" && canJoinWolfBite(player)) {
    const limit = room.nightBiteCount;
    const tokens = parts.slice(2, 2 + limit);
    const targets = [];
    for (const token of tokens) {
      const target = await setTarget(token, (candidate) => !isWolf(candidate));
      if (target && !targets.some((candidate) => candidate.id === target.id)) targets.push(target);
    }
    if (!targets.length) return true;
    room.actions.wolfVotes.set(player.id, targets.map((target) => target.id));
    if (player.role === ROLE.WOLF_SEER) room.actions.wolfSeerTarget = null;
    if (player.role === ROLE.CURSE_WOLF) room.actions.framedTarget = null;
    
    const targetNames = targets.map((target) => target.name).join(", ");
    await sendDirect(api, player.id, `✅ Đã chọn cắn: ${targetNames}.`);
    
    // Broadcast cho các đồng đội Sói khác
    await Promise.all(
      wolfPack(room)
        .filter((wolf) => wolf.id !== player.id)
        .map((wolf) => sendDirect(api, wolf.id, `🐺 Đồng đội ${player.name} chọn cắn: ${targetNames}`).catch(() => {}))
    );
    
    return true;
  }
  if (action === "soi" && [ROLE.SEER, ROLE.WOLF_SEER].includes(player.role)) {
    const target = await setTarget(parts[2]);
    if (!target) return true;
    if (player.role === ROLE.SEER) room.actions.seerTarget = target.id;
    else {
      room.actions.wolfSeerTarget = target.id;
      room.actions.wolfVotes.delete(player.id);
    }
    await sendDirect(api, player.id, `✅ Đã chọn soi ${target.name}; kết quả trả khi hết đêm.`);
    return true;
  }
  if (action === "bao" && player.role === ROLE.GUARD) {
    const target = await setTarget(parts[2]);
    if (!target) return true;
    if (player.lastProtectedId === target.id) {
      await sendDirect(api, player.id, "❌ Không được bảo vệ cùng một người hai đêm liên tiếp.");
      return true;
    }
    room.actions.guardTarget = target.id;
    await sendDirect(api, player.id, `✅ Đêm nay bạn bảo vệ ${target.name}.`);
    return true;
  }
  if (action === "nguyen" && player.role === ROLE.CURSE_WOLF) {
    const target = await setTarget(parts[2]);
    if (!target) return true;
    room.actions.framedTarget = target.id;
    room.actions.wolfVotes.delete(player.id);
    await sendDirect(api, player.id, `✅ Đã vu oan ${target.name}; đêm nay Tiên Tri sẽ thấy họ là Sói.`);
    return true;
  }
  if (action === "do" && player.role === ROLE.WOLF_WITCH) {
    const target = await setTarget(parts[2]);
    if (!target) return true;
    room.actions.wolfWitchTarget = target.id;
    await sendDirect(api, player.id, `✅ Đã chọn dò ${target.name}; kết quả trả khi hết đêm.`);
    return true;
  }
  if (action === "canlen" && player.role === ROLE.WHITE_WOLF) {
    if (room.night % 2 !== 0) {
      await sendDirect(api, player.id, "❌ Sói Trắng chỉ cắn lén vào đêm chẵn (cách một đêm)." );
      return true;
    }
    const target = await setTarget(parts[2], (candidate) => isWolf(candidate) && candidate.id !== player.id);
    if (!target) return true;
    room.actions.whiteWolfTarget = target.id;
    await sendDirect(api, player.id, `✅ Đã chọn cắn lén ${target.name}.`);
    return true;
  }
  if (["henhin", "nhin"].includes(action) && player.role === ROLE.LITTLE_GIRL) {
    room.actions.littleGirlPeek = true;
    await sendDirect(api, player.id, "👧 Bạn đã chọn hé nhìn. Kết quả đến cuối đêm, nhưng bầy Sói có thể truy ra bạn.");
    return true;
  }
  if (["nhammat", "khongnhin"].includes(action) && player.role === ROLE.LITTLE_GIRL) {
    room.actions.littleGirlPeek = false;
    await sendDirect(api, player.id, "✅ Bạn nhắm mắt và giữ an toàn.");
    return true;
  }
  if (action === "theodoi" && player.role === ROLE.DETECTIVE) {
    const targets = [];
    for (const token of parts.slice(2, 4)) {
      const target = await setTarget(token);
      if (target && !targets.some((candidate) => candidate.id === target.id)) targets.push(target);
    }
    if (!targets.length) return true;
    room.actions.detectiveTargets = targets.map((target) => target.id);
    await sendDirect(api, player.id, `✅ Đang theo dõi: ${targets.map((target) => target.name).join(", ")}.`);
    return true;
  }
  if (action === "giet" && player.role === ROLE.SERIAL_KILLER) {
    const target = await setTarget(parts[2], (candidate) => candidate.id !== player.id);
    if (!target) return true;
    room.actions.serialTarget = target.id;
    await sendDirect(api, player.id, `✅ Đã chọn hạ sát ${target.name}.`);
    return true;
  }
  if (action === "mehoac" && player.role === ROLE.PIED_PIPER) {
    const targets = [];
    for (const token of parts.slice(2, 4)) {
      const target = await setTarget(token, (candidate) => candidate.id !== player.id && !candidate.charmed);
      if (target && !targets.some((candidate) => candidate.id === target.id)) targets.push(target);
    }
    const availableCount = livingPlayers(room).filter(
      (candidate) => candidate.id !== player.id && !candidate.charmed
    ).length;
    const requiredCount = Math.min(2, availableCount);
    if (targets.length < requiredCount) {
      await sendDirect(api, player.id, `❌ Đêm nay phải chọn ${requiredCount} người khác nhau chưa bị mê hoặc.`);
      return true;
    }
    if (!targets.length) return true;
    room.actions.charmTargets = targets.map((target) => target.id);
    await sendDirect(api, player.id, `✅ Đã chọn mê hoặc: ${targets.map((target) => target.name).join(", ")}.`);
    return true;
  }

  await sendDirect(api, player.id, `❌ Lệnh không phù hợp với vai/lượt hiện tại.\n${(ROLE_GUIDE[player.role] || "").replaceAll("masoi ", "")}`);
  return true;
}

export async function handleWerewolfPrivateAction(api, message) {
  if (message.type !== MessageType.DirectMessage || typeof message.data?.content !== "string") return false;
  const raw = message.data.content.trim();
  const senderId = normalizeId(message.data.uidFrom);
  let room = getPlayerRoom(api, senderId);
  const hasMasoiPrefix = /^!?masoi(?:\s|$)/i.test(normalizeText(raw));
  if (!hasMasoiPrefix && !room) return false;

  let parts;
  if (hasMasoiPrefix) {
    const afterMasoi = raw.replace(/^!?masoi\s*/i, "");
    const parsedAction = parsePrivateActionText(afterMasoi);
    parts = parsedAction
      ? ["masoi", ...parsedAction]
      : ["masoi", ...afterMasoi.split(/\s+/).filter(Boolean)];
  } else {
    const parsedAction = parsePrivateActionText(raw);
    if (!parsedAction) return false;
    parts = ["masoi", ...parsedAction];
  }

  if (!room) {
    const code = String(parts[1] || "").toUpperCase();
    const key = roomCodes.get(codeKey(api.getBotId(), code));
    room = key ? rooms.get(key) : null;
    if (!room) {
      await reply(api, message, "❌ Không tìm thấy phòng. Dùng: masoi MÃ_PHÒNG");
      return true;
    }
    const result = await addPlayer(api, room, senderId, message.data.dName || senderId);
    if (!result.success) await reply(api, message, `❌ ${result.message}`);
    else await reply(api, message, `✅ Đã vào phòng ${room.code}. Quay lại nhóm để theo dõi sảnh.`);
    return true;
  }

  const action = normalizeText(parts[1]);
  if (["leave", "roi", "ra"].includes(action) && room.phase === "waiting") {
    return leaveLobby(api, message, room).then(() => true);
  }
  await handlePrivateGameAction(api, message, room, parts);
  return true;
}

export async function handleWerewolfGroupVote(api, message) {
  if (message.type !== MessageType.GroupMessage || typeof message.data?.content !== "string") return false;
  const room = getRoomInThread(api, message.threadId);
  if (!room || room.phase === "waiting") return false;
  const player = room.players.find((candidate) => candidate.id === normalizeId(message.data.uidFrom));
  if (!player) return false;
  const content = normalizeText(message.data.content);

  if (["check", "vai"].includes(content)) {
    try {
      await sendRoleCard(api, room, player);
      await reply(api, message, "✅ Bot đã gửi lại thẻ vai qua chat riêng.");
    } catch {
      await sendWerewolfFriendRequest(api, player.id);
      await reply(api, message, "🤝 Chưa gửi được thẻ vai. Vui lòng đồng ý kết bạn với Bot rồi gõ check lại.");
    }
    return true;
  }
  if (["help", "hd"].includes(content)) {
    try {
      await sendDirect(api, player.id, privateHelpText(room));
      await reply(api, message, "✅ Bot đã gửi hướng dẫn qua chat riêng.");
    } catch {
      await sendWerewolfFriendRequest(api, player.id);
      await reply(api, message, "🤝 Vui lòng kết bạn với Bot để nhận hướng dẫn riêng.");
    }
    return true;
  }

  const match = content.match(/^(?:v|vote)\s*(\d+)$/);
  const voteToken = content === "boqua" ? "0" : match?.[1];
  if (voteToken === undefined || room.phase !== "day") return false;
  const result = await submitDayVote(api, room, player, voteToken);
  if (!result.success) await reply(api, message, `❌ ${result.message}`);
  return true;
}

export async function handleWerewolfGroupRestriction(api, message, canManage = false) {
  if (message.type !== MessageType.GroupMessage) return false;
  const room = getRoomInThread(api, message.threadId);
  if (!room || ["waiting", "ended"].includes(room.phase)) return false;

  const senderId = normalizeId(message.data?.uidFrom);
  const player = room.players.find((candidate) => candidate.id === senderId);
  const content = typeof message.data?.content === "string" ? message.data.content.trim() : "";
  const prefix = getGlobalPrefix(api.getBotId());
  const isPrefixedCommand = Boolean(prefix) && content.startsWith(prefix);
  const isRoomControl = isPrefixedCommand && normalizeText(content.slice(prefix.length)).startsWith("masoi");
  if ((canManage && isPrefixedCommand) || (player?.id === room.hostId && isRoomControl)) return false;

  const nightLocked = room.permissions?.lockChat !== false && room.phase !== "day";
  const deadMuted = room.permissions?.muteDead !== false && Boolean(player && !player.alive);
  if (!nightLocked && !deadMuted) return false;

  await api.deleteMessage(message, false).catch(() => {});
  if (deadMuted && !room.deadWarned.has(senderId)) {
    room.deadWarned.add(senderId);
    await sendDirect(api, senderId, "☠️ Bạn đã chết nên không thể chat hoặc vote trong nhóm cho tới khi ván kết thúc.").catch(() => {});
  }
  return true;
}

async function updateRoomPermissions(api, message, room, parts, canManage) {
  const senderId = normalizeId(message.data.uidFrom);
  if (senderId !== room.hostId && !canManage) {
    return reply(api, message, "❌ Chỉ chủ phòng hoặc quản trị viên được đổi permission.");
  }
  const target = normalizeText(parts[2]);
  const valueToken = normalizeText(parts[3]);
  let muteDead;
  let lockChat;
  if (["on", "off"].includes(target)) {
    const enabled = target === "on";
    muteDead = enabled;
    lockChat = enabled;
  } else if (["mute", "lockchat"].includes(target) && ["on", "off"].includes(valueToken)) {
    const enabled = valueToken === "on";
    if (target === "mute") muteDead = enabled;
    else lockChat = enabled;
  } else {
    return reply(
      api,
      message,
      "Dùng: masoi permission on|off\nHoặc: masoi permission mute|lockchat on|off"
    );
  }

  if (muteDead !== undefined) room.permissions.muteDead = muteDead;
  if (lockChat !== undefined && room.permissions.lockChat !== lockChat) {
    room.permissions.lockChat = lockChat;
    if (room.phase !== "waiting" && room.phase !== "ended") {
      if (!lockChat) await setRoomChatLocked(api, room, false, { restore: true });
      else if (room.phase !== "day") await setRoomChatLocked(api, room, true);
    }
  }
  return reply(
    api,
    message,
    `✅ Permission Ma Sói\n• Mute người chết: ${room.permissions.muteDead ? "bật" : "tắt"}\n• Khóa chat đêm: ${room.permissions.lockChat ? "bật" : "tắt"}`
  );
}

export async function handleWerewolfCommand(api, message, canManage = false, groupInfo = null) {
  const content = removeMention(message).trim();
  const parts = content.split(/\s+/);
  const sub = normalizeText(parts[1] || "help");
  let room = getRoomInThread(api, message.threadId);

  if (["create", "tao"].includes(sub)) return createRoom(api, message, parts.slice(2), groupInfo);
  if (["rules", "rule", "luat"].includes(sub)) return reply(api, message, RULES, 600_000);
  if (sub === "rank") return sendGroupRank(api, message);
  if (["help", "hd", "huongdan"].includes(sub)) {
    const prefix = getGlobalPrefix(api.getBotId());
    return reply(
      api,
      message,
      `🐺 MA SÓI — HƯỚNG DẪN 🐺\n\n1️⃣ QUẢN LÝ PHÒNG\n• ${prefix}masoi create [số] [nosheriff] [nowill] — tạo sảnh, mặc định 12, tối đa 24\n• ${prefix}masoi start — bắt đầu khi đủ ≥4\n• ${prefix}masoi luat — luật và 18 vai\n• ${prefix}masoi rank — bảng xếp hạng nhóm\n• ${prefix}masoi huy — hủy phòng\n• ${prefix}masoi permission on|off\n• ${prefix}masoi permission mute|lockchat on|off\n\n2️⃣ THAM GIA\n• Thả ❤️ hoặc ${prefix}masoi join\n• Rời sảnh: ${prefix}masoi leave\n• Chat riêng để vào: masoi MÃ_PHÒNG\n🤝 Vui lòng kết bạn với Bot để chơi; Bot sẽ tự gửi hoặc tự duyệt lời mời.\n\n3️⃣ TRONG VÁN\n• Vote nhóm: v3, v 3, vote 3 · boqua\n• Chat riêng: vote 3 · check · help · list\n• Kỹ năng riêng không cần masoi: soi3, giet 2, cuu, doc 3, ban 4...\n• Di chúc: will <nội dung>\n• Chưa nhận thẻ vai: gõ check trong nhóm hoặc chat riêng.`
    );
  }
  if (!room) return reply(api, message, "⚠️ Nhóm hiện không có phòng Ma Sói. Dùng masoi create [số người].");
  if (sub === "permission") return updateRoomPermissions(api, message, room, parts, canManage);
  if (["check", "vai"].includes(sub)) {
    const player = room.players.find((candidate) => candidate.id === normalizeId(message.data.uidFrom));
    if (!player) return reply(api, message, "❌ Bạn không ở trong phòng Ma Sói này.");
    if (!player.role) return reply(api, message, "⏳ Ván chưa bắt đầu nên chưa có thẻ vai.");
    try {
      await sendRoleCard(api, room, player);
      return reply(api, message, "✅ Bot đã gửi lại thẻ vai qua chat riêng.");
    } catch {
      await sendWerewolfFriendRequest(api, player.id);
      return reply(api, message, "🤝 Vui lòng kết bạn với Bot rồi dùng check lại.");
    }
  }
  if (["join", "vao"].includes(sub)) {
    const result = await addPlayer(api, room, message.data.uidFrom, message.data.dName, message);
    if (!result.success) await reply(api, message, `❌ ${result.message}`);
    return;
  }
  if (["start", "batdau"].includes(sub)) return startGame(api, message, room, canManage);
  if (["leave", "roi", "ra"].includes(sub)) return leaveLobby(api, message, room);
  if (["cancel", "huy"].includes(sub)) return cancelRoom(api, message, room, canManage);
  if (["status", "xem", "tinhtrang"].includes(sub)) {
    return reply(
      api,
      message,
      `🐺 Phòng ${room.code} — ${room.phase}\n👥 Còn sống: ${livingPlayers(room).length}/${room.players.length}\n🌙 Đêm ${room.night} · ☀️ Ngày ${room.day}\n⚙️ Cảnh Sát: ${room.options.sheriffEnabled ? "bật" : "tắt"} · Di chúc: ${room.options.willEnabled ? "bật" : "tắt"}\n🔐 Mute chết: ${room.permissions.muteDead ? "bật" : "tắt"} · Lock đêm: ${room.permissions.lockChat ? "bật" : "tắt"}\n${playerList(room, { aliveOnly: false })}`
    );
  }
  return handleWerewolfCommand(
    api,
    { ...message, data: { ...message.data, content: `${parts[0]} help` } },
    canManage,
    groupInfo
  );
}

export async function handleWerewolfReaction(api, reaction) {
  const rMsg = reaction.data?.content?.rMsg?.[0];
  const msgIds = [rMsg?.gMsgID, rMsg?.cMsgID].filter(Boolean).map(normalizeId);
  const reactionType = reaction.data?.content?.rType;
  if (!msgIds.length || ![3, 5].includes(Number(reactionType))) return false;
  const msgId = msgIds.find((id) => lobbyReactions.has(id));
  const key = msgId && lobbyReactions.get(msgId);
  const room = key ? rooms.get(key) : null;
  if (!room || room.botId !== api.getBotId()) return false;
  const senderId = normalizeId(reaction.data.uidFrom);
  const dedupKey = `${msgId}_${senderId}`;
  const now = Date.now();
  if (now - (recentReaction.get(dedupKey) || 0) < 5_000) return true;
  recentReaction.set(dedupKey, now);
  let name = senderId;
  let profile = null;
  try {
    const info = await api.getInfoMembers([senderId]);
    const user = info?.profiles?.[senderId];
    name = user?.zaloName || user?.displayName || name;
    profile = { name, avatar: user?.avatar || user?.avatarFull || null };
  } catch {}
  const result = await addPlayer(api, room, senderId, name, null, profile ? { profile } : {});
  if (!result.success) {
    const delivered = await sendDirect(api, senderId, `❌ ${result.message}`).then(() => true).catch(() => false);
    if (!delivered) await sendGroup(api, room, `⚠️ ${name}: ${result.message}`).catch(() => {});
  }
  return true;
}

// Chỉ dùng cho kiểm thử tự động và chẩn đoán, không phải API lệnh người dùng.
export const __werewolfDebug = { rooms, roomCodes, lobbyReactions, parsePrivateActionText };
