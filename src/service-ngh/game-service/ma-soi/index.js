import { MessageType } from "../../../api-zalo/index.js";
import { isAdmin } from "../../../index.js";
import { getGlobalPrefix } from "../../service.js";
import { gameState } from "../game-manager.js";
import {
  getMaSoiRoleCard,
  ensureMaSoiCupidCard,
  createMaSoiLobbyImage,
  createMaSoiResultImage,
  createMaSoiNightImage,
  createMaSoiDayImage,
  createMaSoiTrialImage,
  createMaSoiTopImage,
} from "../../../utils/canvas/ma-soi-card.js";
import { clearImagePath } from "../../../utils/canvas/index.js";
import { readGroupSettings, writeGroupSettings } from "../../../utils/io-json.js";
import { getMessageCache, markMessageUndo as markMessageCacheUndo } from "../../../utils/message-cache.js";

const GAME_KEY = "masoi";
const MIN_PLAYERS = 4;
const MAX_PLAYERS = 16;
const LOBBY_DURATION_MS = 5 * 75_000;
const NIGHT_DURATION_MS = 75_000;
const VOTE_DURATION_MS = 65_000;
const HUNTER_SHOT_DURATION_MS = 30_000;
const ROLE_CARD_SEND_CONCURRENCY = 4;
const roomTimers = new Map();
const MA_SOI_ACTIONS = new Set([
  "join",
  "leave",
  "list",
  "start",
  "set",
  "top",
  "rank",
  "cancel",
  "vai",
  "help",
  "huongdan",
  "v",
  "vote",
]);

const ROLES = {
  villager: { name: "Dân làng", team: "village", night: false },
  fakeWolf: { name: "Người giả sói", team: "village", night: false },
  wolf: { name: "Sói", team: "wolf", night: true },
  alphaWolf: { name: "Sói nguyên", team: "wolf", night: true },
  wolfWitch: { name: "Sói phù thủy", team: "wolf", night: true },
  seer: { name: "Tiên tri", team: "village", night: true },
  guard: { name: "Bảo vệ", team: "village", night: true },
  witch: { name: "Phù thủy", team: "village", night: true },
  hunter: { name: "Thợ săn", team: "village", night: false },
  cupid: { name: "Thần tình yêu", team: "village", night: true },
  clone: { name: "Nhân bản", team: "village", night: true },
  cultLeader: { name: "Trưởng giáo phái", team: "cult", night: true },
};

function getTeamLabel(team) {
  if (team === "wolf") return "🐺Sói";
  if (team === "cult") return "Phe thứ 3";
  return "Dân làng";
}

function getPlayerTeam(player) {
  return ROLES[player?.role]?.team || "village";
}

function isWolfMixedCouple(first, second) {
  const firstIsWolf = getPlayerTeam(first) === "wolf";
  const secondIsWolf = getPlayerTeam(second) === "wolf";
  return firstIsWolf !== secondIsWolf;
}

function getSeerReport(target) {
  if (target.role === "fakeWolf") {
    return { role: "wolf", team: "wolf", roleName: ROLES.wolf.name, teamLabel: getTeamLabel("wolf") };
  }
  if (target.role === "wolfWitch") {
    return { role: "villager", team: "village", roleName: ROLES.villager.name, teamLabel: getTeamLabel("village") };
  }
  return { role: target.role, team: ROLES[target.role].team, roleName: ROLES[target.role].name, teamLabel: getTeamLabel(ROLES[target.role].team) };
}

function teamIcon(team) {
  if (team === "wolf") return "🐺";
  if (team === "cult") return "🕯️";
  return "🏡";
}

export async function initializeGameMaSoi(api = null) {
  const data = ensureState();
  const rooms = Object.values(data.rooms || {});

  // KHÔNG xóa phòng khi bot restart.
  // State của phòng đã nằm trong gameState và sẽ tiếp tục được dùng sau khi bot lên lại.
  for (const room of rooms) {
    normalizeRoomAfterRestart(room);
    applyMaSoiDeadMutes(room);
  }

  if (api) {
    await restoreMaSoiRooms(api);
  }

  await ensureMaSoiCupidCard();
  console.log(`Khởi động minigame ma sói hoàn tất - khôi phục ${rooms.length} phòng`);
}

export async function handleMaSoiCommand(api, message, groupSettings) {
  await ensureMaSoiRuntimeRestored(api);
  const prefix = getGlobalPrefix(api?.getBotId?.());
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const content = String(message.data.content || "").trim();
  const commandText = content.startsWith(prefix) ? content.slice(prefix.length).trim() : content;
  const body = commandText.replace(/^\S+/, "").trim();
  const { action, args } = parseMaSoiAction(body);

  if (message.type === MessageType.DirectMessage) {
    await send(api, message, buildHelp(prefix), 60000);
    return;
  }

  if (!canUseMaSoiInGroup(message, groupSettings)) {
    return;
  }

  if (!action) return;
  if (!MA_SOI_ACTIONS.has(action)) return;

  await reactMaSoiCommand(api, message);

  switch (action) {
    case "join":
      await joinRoom(api, message);
      break;
    case "leave":
      await leaveRoom(api, message);
      break;
    case "list":
      await showList(api, message);
      break;
    case "start":
      await startGame(api, message);
      break;
    case "top":
    case "rank":
      await showMaSoiTop(api, message);
      break;
    case "cancel":
      await cancelRoom(api, message);
      break;
    case "vai":
      await resendRole(api, message);
      break;
    case "help":
    case "huongdan":
      await send(api, message, buildGuide(prefix), 180000);
      break;
    case "v":
    case "vote":
      await voteLynch(api, message, args[0]);
      break;
    default:
      break;
  }
}

async function reactMaSoiCommand(api, message) {
  try {
    await api.addReaction("thanks", message);
  } catch (error) {
    console.error("Lỗi khi thả reaction lệnh Ma Sói:", error?.message || error);
  }
}

function parseMaSoiAction(body) {
  const parts = String(body || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { action: "", args: [] };
  const first = parts[0].toLowerCase();
  const compactVote = first.match(/^v(\d+)$/);
  if (compactVote) return { action: "v", args: [compactVote[1], ...parts.slice(1)] };
  return { action: first, args: parts.slice(1) };
}

function canUseMaSoiInGroup(message, groupSettings) {
  if (!groupSettings) return true;
  return groupSettings[message.threadId]?.activeBot === true;
}

export async function handleMaSoiPrivateInput(api, message) {
  await ensureMaSoiRuntimeRestored(api);
  const rawContent = message?.data?.content;
  const content = typeof rawContent === "string" ? rawContent.trim().toLowerCase() : "";
  if (!content) return false;

  const data = ensureState();
  const senderId = message.data.uidFrom;
  const room = Object.values(data.rooms).find((item) => findPlayerByUserId(item, senderId) && !["lobby", "ended"].includes(item.phase));
  if (!room) return false;

  const player = findPlayerByUserId(room, senderId);
  if (!player) return false;

  if (normalizeUserId(getPendingHunterId(room)) === normalizeUserId(senderId)) {
    await handleHunterShot(api, message, room, content);
    return true;
  }

  if (!player.alive) {
    await send(api, message, "Bạn đã chết nên không thể dùng kỹ năng nữa.");
    return true;
  }

  if (room.phase === "cupid") {
    await handleCupidChoice(api, message, room, content);
    return true;
  }

  if (room.phase !== "night") return false;

  if (player.role === "witch") {
    await handleWitchAction(api, message, room, content);
    return true;
  }

  if (player.role === "alphaWolf" && (content.startsWith("nguyen") || content.startsWith("nguyền"))) {
    await handleAlphaWolfCurse(api, message, room, content);
    return true;
  }

  if (player.role === "wolfWitch" && content.startsWith("soi")) {
    await handleWolfWitchPeek(api, message, room, content);
    return true;
  }

  if (player.role === "wolfWitch" && content.startsWith("truyentin")) {
    await handleWolfWitchBroadcast(api, message, room, content);
    return true;
  }

  const targetIndex = parseTargetIndex(content);
  if (!targetIndex) return false;

  const target = getLivingByIndex(room, targetIndex);
  if (!target) {
    await send(api, message, "Số mục tiêu không hợp lệ hoặc người đó đã chết.");
    return true;
  }

  switch (player.role) {
    case "wolf":
    case "alphaWolf":
      {
        const wolfKey = player.id;
        const oldTargetId = room.night.wolves[wolfKey] || room.night.wolves[senderId];
        if (oldTargetId) {
          await send(api, message, `Bạn đã chọn cắn ${room.players[oldTargetId]?.name || "mục tiêu này"} trong đêm nay, không thể đổi mục tiêu.`);
          return true;
        }
      }
      room.night.wolves[player.id] = target.id;
      saveGameData();
      await notifyWolfBiteChoice(api, room, player, target);
      await maybeNotifyWitch(api, room);
      await maybeResolveNight(api, room);
      return true;
    case "wolfWitch":
      await send(api, message, "Sói phù thủy không thể cắn người. Dùng soi <số> hoặc truyentin <nội dung>.");
      return true;
    case "cultLeader":
      await handleCultLeaderRecruit(api, message, room, target);
      return true;
    case "seer":
      if (room.night.seer) {
        await send(api, message, `Tiên tri đã soi ${room.players[room.night.seer]?.name || "mục tiêu này"} trong đêm nay, không thể soi tiếp.`);
        return true;
      }
      room.night.seer = target.id;
      saveGameData();
      {
        const report = getSeerReport(target);
        await send(api, message, `👁️ Soi ${target.name}:\n› Vai trò: ${roleIcon(report.role)} ${report.roleName}\n› Phe: ${teamIcon(report.team)} ${report.teamLabel}`);
      }
      await maybeResolveNight(api, room);
      return true;
    case "guard":
      if (room.night.guard) {
        await send(api, message, `Bảo vệ đã che chở ${room.players[room.night.guard]?.name || "mục tiêu này"} trong đêm nay, không thể đổi mục tiêu.`);
        return true;
      }
      if (room.lastGuardTarget === target.id) {
        await send(api, message, "Bảo vệ không thể che chở cùng một người 2 đêm liên tiếp.");
        return true;
      }
      room.night.guard = target.id;
      saveGameData();
      await send(api, message, `Bạn đã bảo vệ ${target.name}.`);
      await maybeResolveNight(api, room);
      return true;
    case "clone":
      if (room.cloneTargets?.[player.id] || room.cloneTargets?.[senderId]) {
        await send(api, message, "Bạn đã chọn mục tiêu Nhân bản rồi, không thể chọn lại.");
        return true;
      }
      if (normalizeUserId(target.id) === normalizeUserId(senderId) || normalizeUserId(target.id) === normalizeUserId(player.id)) {
        await send(api, message, "Nhân bản không thể chọn chính mình.");
        return true;
      }
      room.cloneTargets ||= {};
      room.night.clone[player.id] = target.id;
      room.cloneTargets[player.id] = target.id;
      saveGameData();
      await send(api, message, `Bạn đã chọn nhân bản ${target.name}. Khi người này chết, bạn sẽ nhận kỹ năng của họ.`);
      await maybeResolveNight(api, room);
      return true;
    default:
      await send(api, message, "Vai của bạn không có hành động ban đêm bằng số.");
      return true;
  }
}

function ensureState() {
  if (!gameState.data[GAME_KEY]) {
    gameState.data[GAME_KEY] = { rooms: {}, history: [], scores: {}, forcedWolves: {}, forcedWolfNames: {} };
  }
  gameState.data[GAME_KEY].rooms ||= {};
  gameState.data[GAME_KEY].history ||= [];
  gameState.data[GAME_KEY].scores ||= {};
  gameState.data[GAME_KEY].forcedWolves ||= {};
  gameState.data[GAME_KEY].forcedWolfNames ||= {};
  gameState.changes[GAME_KEY] ??= false;
  return gameState.data[GAME_KEY];
}

function saveGameData() {
  gameState.changes[GAME_KEY] = true;
}

function clearForcedWolves(threadId, room = null) {
  const data = ensureState();
  const targetRoom = room || data.rooms?.[threadId] || null;
  const hadRoomForced = Boolean(targetRoom?.nextForcedWolves?.length || Object.keys(targetRoom?.nextForcedWolfNames || {}).length);
  if (targetRoom) {
    targetRoom.nextForcedWolves = [];
    targetRoom.nextForcedWolfNames = {};
  }
  if (!data.forcedWolves?.[threadId] && !data.forcedWolfNames?.[threadId] && !hadRoomForced) return;
  delete data.forcedWolves[threadId];
  delete data.forcedWolfNames[threadId];
  saveGameData();
}

async function joinRoom(api, message) {
  const data = ensureState();
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName || senderId;
  const senderAvatar = await getPlayerAvatar(api, senderId);
  let room = data.rooms[threadId];

  if (!room) {
    room = createRoom(threadId, senderId, senderName, senderAvatar);
    data.rooms[threadId] = room;
    saveGameData();
    scheduleLobbyTimer(api, room);
    await sendLobby(api, room, `${senderName} vừa tạo phòng Ma Sói! Cần >=4 người để chơi (tối đa 16).`);
    return;
  }

  if (room.phase !== "lobby") {
    await send(api, message, "Ván Ma Sói đã bắt đầu, không thể tham gia thêm.");
    return;
  }
  if (room.players[senderId]) {
    await send(api, message, "Bạn đã ở trong phòng Ma Sói rồi.");
    return;
  }
  if (Object.keys(room.players).length >= MAX_PLAYERS) {
    await send(api, message, `Phòng đã đủ ${MAX_PLAYERS} người.`);
    return;
  }

  room.players[senderId] = createPlayer(senderId, senderName, senderAvatar);
  saveGameData();
  await sendLobby(api, room, `${senderName} vào sảnh (${Object.keys(room.players).length}/${MAX_PLAYERS}) - cần thêm ${Math.max(0, MIN_PLAYERS - Object.keys(room.players).length)} người`);
}

async function leaveRoom(api, message) {
  const room = getRoom(message.threadId);
  const senderId = message.data.uidFrom;
  if (!room || !room.players[senderId]) {
    await send(api, message, "Bạn chưa ở trong phòng Ma Sói.");
    return;
  }
  if (room.phase !== "lobby") {
    await send(api, message, "Ván đã bắt đầu, không thể rời phòng.");
    return;
  }

  delete room.players[senderId];
  if (room.ownerId === senderId) {
    const nextOwner = Object.values(room.players)[0];
    room.ownerId = nextOwner?.id || null;
  }
  if (!room.ownerId) {
    clearRoomTimers(message.threadId);
    delete ensureState().rooms[message.threadId];
  }
  saveGameData();
  if (room.ownerId) await sendLobby(api, room, `${message.data.dName || senderId} đã rời phòng Ma Sói.`);
  else await send(api, message, "Đã rời phòng Ma Sói.");
}

async function showList(api, message) {
  const room = getRoom(message.threadId);
  if (!room) {
    await send(api, message, "Nhóm này chưa có phòng Ma Sói. Dùng masoi join để tạo/tham gia.");
    return;
  }
  await send(api, message, formatPlayerList(room, room.phase !== "lobby"));
}

async function showMaSoiTop(api, message) {
  const scores = Object.values(ensureState().scores || {})
    .sort(compareMaSoiScores)
    .slice(0, 10);
  const imagePath = await createMaSoiTopImage(scores);
  try {
    await api.sendMessage(
      { msg: "🏆 Bảng xếp hạng Ma Sói", attachments: [imagePath], ttl: 180000, isUseProphylactic: true },
      message.threadId,
      MessageType.GroupMessage
    );
  } finally {
    await clearImagePath(imagePath).catch(() => {});
  }
}

function compareMaSoiScores(a, b) {
  const scoreDiff = (b.score || 0) - (a.score || 0);
  if (scoreDiff) return scoreDiff;
  const aFirstScoreAt = a.firstScoreAt || a.lastWinAt || 0;
  const bFirstScoreAt = b.firstScoreAt || b.lastWinAt || 0;
  return aFirstScoreAt - bFirstScoreAt;
}

async function setNextWolves(api, message) {
  const data = ensureState();
  const room = getRoom(message.threadId);
  const senderId = message.data.uidFrom;
  if (room && room.ownerId !== senderId && !isMaSoiAdmin(api, senderId, message.threadId)) return;
  if (!room && !isMaSoiAdmin(api, senderId, message.threadId)) return;
  if (room && room.phase !== "lobby") {
    await send(api, message, "Chỉ set Sói cho ván tiếp theo khi phòng đang ở sảnh.");
    return;
  }

  const mentions = getCurrentMessageMentions(message);
  const mentionedIds = mentions.map((mention) => normalizeUserId(getMentionUserId(mention))).filter(Boolean);
  const newIds = mentionedIds.length ? mentionedIds : [normalizeUserId(senderId)];
  const missingIds = room ? newIds.filter((id) => !findPlayerByUserId(room, id)) : [];
  if (missingIds.length) {
    const missingNames = missingIds.map((id) => getMentionName(message, id) || id);
    await send(api, message, `${missingNames.join(", ")} chưa join phòng Ma Sói. Người được set phải join phòng trước khi set.`);
    return;
  }

  data.forcedWolves ||= {};
  data.forcedWolfNames ||= {};
  const oldNames = data.forcedWolfNames[message.threadId] || {};
  const oldIds = (data.forcedWolves[message.threadId] || [])
    .map(normalizeUserId)
    .filter((id) => (room ? findPlayerByUserId(room, id) : oldNames[id] && oldNames[id] !== id));
  const targetIds = [...new Set([...oldIds, ...newIds])].slice(0, 2);
  const newNames = Object.fromEntries(
    newIds.map((id) => [
      id,
      findPlayerByUserId(room, id)?.name || getMentionName(message, id) || (id === normalizeUserId(senderId) ? message.data.dName : "") || id,
    ])
  );
  const nameMap = { ...oldNames, ...newNames };
  data.forcedWolves[message.threadId] = targetIds;
  data.forcedWolfNames[message.threadId] = Object.fromEntries(targetIds.map((id) => [id, nameMap[id] || id]));
  if (room) {
    room.nextForcedWolves = targetIds;
    room.nextForcedWolfNames = data.forcedWolfNames[message.threadId];
  }
  saveGameData();

  const names = targetIds.map((id) => findPlayerByUserId(room, id)?.name || data.forcedWolfNames[message.threadId]?.[id] || id);
  await send(api, message, `Đã set ${names.join(", ")} làm Sói cho ván tiếp theo. Tối đa 2 người.`);
}

async function startGame(api, message) {
  const room = getRoom(message.threadId);
  const senderId = message.data.uidFrom;
  if (!room) {
    await send(api, message, "Chưa có phòng Ma Sói. Dùng masoi join trước.");
    return;
  }
  if (room.ownerId !== senderId && !isMaSoiAdmin(api, senderId, message.threadId)) {
    await send(api, message, "Chỉ chủ phòng hoặc admin mới được bắt đầu.");
    return;
  }
  if (room.phase !== "lobby") {
    await send(api, message, "Ván Ma Sói đã bắt đầu rồi.");
    return;
  }

  const players = Object.values(room.players);
  if (players.length < MIN_PLAYERS) {
    await send(api, message, `Cần ít nhất ${MIN_PLAYERS} người để bắt đầu.`);
    return;
  }

  clearRoomTimer(room.threadId, "lobby");
  clearMaSoiDeadMutes(room);
  assignRoles(room);
  room.phase = hasAliveRole(room, "cupid") ? "cupid" : "night";
  room.day = 0;
  room.night = createNightState();
  room.votes = {};
  room.voteResolving = false;
  await applyMaSoiChatLock(api, room, "night");
  await deleteLobbyMessage(api, room);
  saveGameData();

  // Keep role delivery quick without flooding Zalo. sendMessage now assigns a
  // unique clientId to every attachment, while this small pool caps upload load.
  let failedRoleDeliveries = 0;
  const playersToNotify = Object.values(room.players);
  let nextPlayerIndex = 0;
  const sendNextRoleCard = async () => {
    while (nextPlayerIndex < playersToNotify.length) {
      const player = playersToNotify[nextPlayerIndex++];
      try {
        const delivered = await sendRoleCard(api, player, room);
        if (!delivered) failedRoleDeliveries += 1;
      } catch (error) {
        failedRoleDeliveries += 1;
        console.error(`MaSoi role DM failed for ${player.id}:`, error?.message || error);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(ROLE_CARD_SEND_CONCURRENCY, playersToNotify.length) }, sendNextRoleCard)
  );
  if (failedRoleDeliveries) {
    console.warn(`MaSoi: ${failedRoleDeliveries} role card(s) could not be delivered privately.`);
  }

  if (room.phase === "cupid") {
    const cupid = Object.values(room.players).find((item) => item.role === "cupid");
    await send(api, message, "Đã chia vai qua inbox. Đêm đầu bắt đầu: Thần Tình Yêu hãy nhắn riêng bot để ghép đôi.");
    await dmPlayer(api, cupid.id, `Bạn là Thần Tình Yêu.\n${formatLivingTargets(room)}\nNhắn 1 số để ghép người đó với bạn, hoặc nhắn 2 số để ghép đôi hai người khác.`);
    await notifyRolesWaitingForCupid(api, room, cupid.id);
  } else {
    await startNight(api, room, "Đã chia vai qua inbox. Đêm đầu bắt đầu.");
  }
}

async function cancelRoom(api, message) {
  const room = getRoom(message.threadId);
  const senderId = message.data.uidFrom;
  if (!room) {
    await send(api, message, "Không có phòng Ma Sói để hủy.");
    return;
  }
  if (room.ownerId !== senderId && !isMaSoiAdmin(api, senderId, message.threadId)) {
    await send(api, message, "Chỉ chủ phòng hoặc admin mới được hủy.");
    return;
  }
  await deleteLobbyMessage(api, room);
  clearRoomTimers(message.threadId);
  await clearMaSoiChatLock(api, room);
  clearMaSoiDeadMutes(room);
  clearForcedWolves(message.threadId, room);
  delete ensureState().rooms[message.threadId];
  saveGameData();
  await send(api, message, "Đã hủy phòng Ma Sói.");
}

async function resendRole(api, message) {
  const room = getRoom(message.threadId);
  const senderId = message.data.uidFrom;
  if (!room || !room.players[senderId] || room.phase === "lobby") {
    await send(api, message, "Bạn chưa có vai trong ván Ma Sói hiện tại.");
    return;
  }
  await sendRoleCard(api, room.players[senderId], room);
  await send(api, message, "Bot đã gửi lại vai qua inbox.");
}

async function voteLynch(api, message, voteText) {
  const room = getRoom(message.threadId);
  const senderId = message.data.uidFrom;
  if (!room || room.phase !== "day" || room.voteResolving) {
    await send(api, message, "Hiện tại chưa phải lúc vote.");
    return;
  }
  const voter = room.players[senderId];
  if (!voter || !voter.alive) {
    await send(api, message, "Chỉ người còn sống trong ván mới được bỏ phiếu.");
    return;
  }
  if (room.votes[senderId]) {
    await send(api, message, "Bạn đã bỏ phiếu trong lượt ban ngày này rồi, không thể vote lại.");
    return;
  }

  if ((voteText || "").toLowerCase() === "skip") {
    room.votes[senderId] = "skip";
    saveGameData();
    await send(api, message, `${voter.name} đã bỏ phiếu trắng.\n${formatVoteProgress(room)}`);
    await maybeResolveVote(api, room);
    return;
  }

  const target = getLivingByIndex(room, Number(voteText));
  if (!target) {
    await send(api, message, `Số không hợp lệ.\n${formatLivingTargets(room)}\nDùng masoi v <số> hoặc masoi v skip.`);
    return;
  }
  if (target.id === senderId) {
    await send(api, message, "Bạn không thể tự vote chính mình.");
    return;
  }
  room.votes[senderId] = target.id;
  saveGameData();
  await send(api, message, `${voter.name} đã bỏ phiếu treo ${target.name}.\n${formatVoteProgress(room)}`);
  await maybeResolveVote(api, room);
}

function createRoom(threadId, ownerId, ownerName, ownerAvatar = "") {
  return {
    threadId,
    ownerId,
    ownerName,
    phase: "lobby",
    day: 0,
    players: { [ownerId]: createPlayer(ownerId, ownerName, ownerAvatar) },
    lovers: [],
    loverTeam: null,
    votes: {},
    voteResolving: false,
    night: createNightState(),
    witch: { heal: true, poison: true },
    alphaCurseUsed: false,
    pendingAlphaCurse: null,
    cloneTargets: {},
    cloneCopied: {},
    cult: { members: [], lastRecruitNight: 0 },
    maSoiChatLock: { active: false, didLock: false, previousLockSendMsg: null },
    lastGuardTarget: null,
    pendingHunter: null,
    nextForcedWolves: [],
    nextForcedWolfNames: {},
    lobbyMessage: null,
    publicImageMessage: null,
    code: String(Math.floor(1000 + Math.random() * 9000)),
    createdAt: Date.now(),
    lobbyDeadlineAt: Date.now() + LOBBY_DURATION_MS,
    nightDeadlineAt: null,
    voteDeadlineAt: null,
    hunterDeadlineAt: null,
  };
}

function createPlayer(id, name, avatar = "") {
  return { id, name, avatar: normalizeAvatarUrl(avatar), role: null, alive: true, deathReason: null };
}

async function getPlayerAvatar(api, userId) {
  const fromProfile = (profile) =>
    normalizeAvatarUrl(profile?.avatar || profile?.avatar_25 || profile?.avatarUrl || profile?.photo || "");

  try {
    const response = await api.getUserInfo(userId);
    const profile =
      response?.unchanged_profiles?.[userId] ||
      response?.changed_profiles?.[userId] ||
      response?.profiles?.[userId];
    const avatar = fromProfile(profile);
    if (avatar) return avatar;
  } catch (error) {
    console.error("MaSoi getUserInfo avatar error:", error.message || error);
  }

  try {
    const response = await api.getUserAvatar(userId);
    return normalizeAvatarUrl(response?.avatar || response?.url || response?.data?.avatar || response?.data?.url || "");
  } catch (error) {
    console.error("MaSoi getUserAvatar error:", error.message || error);
    return "";
  }
}

function normalizeAvatarUrl(url) {
  if (!url) return "";
  const value = String(url).trim();
  if (!value) return "";
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("http://")) return value.replace(/^http:\/\//, "https://");
  return value;
}

function createNightState() {
  return {
    wolves: {},
    seer: null,
    guard: null,
    witch: { action: null, target: null },
    alphaCurse: null,
    clone: {},
    cultRecruit: null,
    wolfWitchPeek: null,
    wolfWitchBroadcast: false,
    witchNotifiedVictim: null,
  };
}

function assignRoles(room) {
  const data = ensureState();
  const playerEntries = Object.entries(room.players).map(([key, player]) => ({ key, player }));
  const players = shuffle(playerEntries);
  const roles = buildRoleDeck(players.length);
  const forcedSource = room.nextForcedWolves?.length ? room.nextForcedWolves : data.forcedWolves?.[room.threadId] || [];
  const forcedIds = forcedSource.map(normalizeUserId).slice(0, 2);
  const forcedPlayers = shuffle(
    forcedIds
      .map((id) => players.find((entry) => isSamePlayerId(entry, id)))
      .filter(Boolean)
  );
  const assigned = new Set();

  for (const entry of forcedPlayers) {
    const role = takeForcedWolfRole(roles);
    if (!role) break;
    entry.player.role = role;
    assigned.add(getPlayerEntryId(entry));
  }

  const remainingPlayers = players.filter((entry) => !assigned.has(getPlayerEntryId(entry)));
  remainingPlayers.forEach((entry, index) => {
    entry.player.role = roles[index];
  });
  players.forEach((entry) => {
    entry.player.alive = true;
    entry.player.deathReason = null;
  });
  clearForcedWolves(room.threadId, room);
  room.alphaCurseUsed = false;
  room.pendingAlphaCurse = null;
  room.cloneTargets = {};
  room.cloneCopied = {};
  room.cult = { members: [], lastRecruitNight: 0 };
}

function getPlayerEntryId(entry) {
  return normalizeUserId(entry?.player?.id || entry?.key);
}

function isSamePlayerId(entry, userId) {
  const normalizedId = normalizeUserId(userId);
  return normalizeUserId(entry?.key) === normalizedId || normalizeUserId(entry?.player?.id) === normalizedId;
}

function takeForcedWolfRole(roles) {
  const preferred = ["wolf", "alphaWolf"];
  for (const role of preferred) {
    const index = roles.indexOf(role);
    if (index >= 0) return roles.splice(index, 1)[0];
  }
  return null;
}

function buildRoleDeck(count) {
  const decks = {
    4: ["wolf", "villager", "villager", "villager"],
    5: ["wolf", "seer", "guard", "fakeWolf", "villager"],
    6: ["wolf", "seer", "guard", "fakeWolf", "villager", "villager"],
    7: ["wolf", "wolf", "seer", "guard", "fakeWolf", "villager", "villager"],
    8: ["wolf", "wolf", "seer", "guard", "witch", "fakeWolf", "villager", "villager"],
    9: ["wolf", "wolf", "seer", "guard", "witch", "hunter", "fakeWolf", "villager", "villager"],
    10: ["alphaWolf", "wolf", "seer", "guard", "witch", "hunter", "fakeWolf", "villager", "villager", "villager"],
    11: ["alphaWolf", "wolf", "seer", "guard", "witch", "hunter", "cupid", "fakeWolf", "villager", "villager", "villager"],
    12: ["alphaWolf", "wolf", "seer", "guard", "witch", "hunter", "cupid", "clone", "fakeWolf", "villager", "villager", "villager"],
    13: ["alphaWolf", "wolf", "wolfWitch", "seer", "guard", "witch", "hunter", "cupid", "clone", "cultLeader", "fakeWolf", "villager", "villager"],
    14: ["alphaWolf", "wolf", "wolfWitch", "seer", "guard", "witch", "hunter", "cupid", "clone", "cultLeader", "fakeWolf", "villager", "villager", "villager"],
    15: ["alphaWolf", "wolf", "wolfWitch", "seer", "guard", "witch", "hunter", "cupid", "clone", "cultLeader", "fakeWolf", "villager", "villager", "villager", "villager"],
    16: ["alphaWolf", "wolf", "wolfWitch", "seer", "guard", "witch", "hunter", "cupid", "clone", "cultLeader", "fakeWolf", "villager", "villager", "villager", "villager", "villager"],
  };
  return shuffle(decks[count] || []);
}

async function sendRoleCard(api, player, room) {
  const role = ROLES[player.role];
  const imagePath = await getMaSoiRoleCard(player.role, player.name, player.avatar);
  const loverText = room.lovers.includes(player.id)
    ? `\nBạn đang được ghép đôi với ${room.players[room.lovers.find((id) => id !== player.id)]?.name || "một người chơi"}.`
    : "";
  const wolfText = formatWolfTeammates(room, player);
  const caption = `Vai của bạn: ${role.name}.${loverText}${wolfText}`;
  const textPayload = { msg: caption, ttl: 300000 };
  if (imagePath) {
    try {
      await api.sendMessage({ ...textPayload, attachments: [imagePath], isUseProphylactic: true }, player.id, MessageType.DirectMessage);
      if (imagePath?.includes("assets\\temp") || imagePath?.includes("assets/temp")) {
        await clearImagePath(imagePath).catch(() => {});
      }
      return true;
    } catch (error) {
      console.error(`MaSoi role card image failed for ${player.id}:`, error.message || error);
    }
  }

  try {
    await api.sendMessage(textPayload, player.id, MessageType.DirectMessage);
    return true;
  } catch (error) {
    console.error(`MaSoi role DM failed for ${player.id}:`, error.message || error);
    return false;
  } finally {
    if (imagePath?.includes("assets\\temp") || imagePath?.includes("assets/temp")) {
      await clearImagePath(imagePath).catch(() => {});
    }
  }
}

function formatWolfTeammates(room, player) {
  if (ROLES[player.role].team !== "wolf") return "";
  const wolves = Object.values(room.players).filter(
    (item) => item.alive && ROLES[item.role].team === "wolf" && item.id !== player.id
  );
  return wolves.length ? `\nĐồng đội sói: ${wolves.map((item) => item.name).join(", ")}` : "";
}

function formatLoverTargetNotice(room, player) {
  if (room.loverTeam !== "couple" || !Array.isArray(room.lovers) || !room.lovers.includes(player.id)) return "";
  const loverId = room.lovers.find((id) => id !== player.id);
  const lover = room.players?.[loverId];
  if (!lover) return "";
  return `\n💞 Người yêu của bạn: ${lover.name}. Đừng cắn/kéo nhầm người này, PHE CẶP ĐÔI chỉ thắng khi hai bạn là 2 người cuối cùng còn sống.`;
}

async function startNight(api, room, intro = "") {
  clearRoomTimer(room.threadId, "vote");
  room.phase = "night";
  room.voteResolving = false;
  room.day += 1;
  room.night = createNightState();
  room.votes = {};
  room.nightDeadlineAt = Date.now() + NIGHT_DURATION_MS;
  room.voteDeadlineAt = null;
  room.hunterDeadlineAt = null;
  await applyMaSoiChatLock(api, room, "night");
  await applyAlphaCurse(api, room);
  saveGameData();
  scheduleNightTimer(api, room);
  let nightAnnouncementSent = false;
  let nightImagePath = null;
  try {
    nightImagePath = await createMaSoiNightImage(room);
    await sendMaSoiPublicImage(
      api,
      room,
      {
        msg: `\n${intro || `ĐÊM ${room.day} BUÔNG XUỐNG...`} Các vai năng lực hãy DM bot.`,
        attachments: [nightImagePath],
        ttl: 120000,
        isUseProphylactic: true,
      }
    );
    nightAnnouncementSent = true;
  } catch (error) {
    console.error("MaSoi night image failed:", error.message || error);
  } finally {
    if (nightImagePath) await clearImagePath(nightImagePath).catch(() => {});
  }

  if (!nightAnnouncementSent) await api.sendMessage(
    { msg: `${intro || `Đêm ${room.day} bắt đầu.`}\nNgười có chức năng hãy nhắn riêng bot theo số mục tiêu.\n${formatLivingTargets(room)}`, ttl: 120000 },
    room.threadId,
    MessageType.GroupMessage
  );

  await sendNightActionPrompts(api, room);
  await maybeResolveNight(api, room);
}

function shouldWaitForCupidRole(role) {
  return ["wolf", "alphaWolf", "wolfWitch", "seer", "guard", "witch", "clone", "cultLeader"].includes(role);
}

async function notifyRolesWaitingForCupid(api, room, cupidId) {
  const players = Object.values(room.players).filter(
    (player) => player.alive && player.id !== cupidId && shouldWaitForCupidRole(player.role)
  );
  for (const player of players) {
    await sendNightPrompt(
      api,
      player.id,
      "Đêm đầu đang chờ Cupid ghép đôi. Sau khi Cupid chọn xong, bot sẽ gửi danh sách số để bạn dùng kỹ năng."
    );
    await sleep(180);
  }
}

async function sendNightActionPrompts(api, room) {
  for (const player of Object.values(room.players).filter((item) => item.alive)) {
    const role = player.role;
    if (ROLES[role]?.team === "wolf") {
      await sendNightPrompt(api, player.id, buildWolfNightPrompt(room, player));
    } else if (role === "seer") {
      await sendNightPrompt(api, player.id, `Đêm ${room.day}: chọn 1 người để soi bằng số.\n${formatLivingTargets(room, player.id)}`);
    } else if (role === "guard") {
      await sendNightPrompt(api, player.id, `Đêm ${room.day}: chọn 1 người để bảo vệ bằng số.\n${formatLivingTargets(room)}${room.lastGuardTarget ? "\nKhông được bảo vệ trùng người đêm trước." : ""}`);
    } else if (role === "witch") {
      await sendNightPrompt(api, player.id, `Đêm ${room.day}: chờ Sói chọn mục tiêu. Khi bot báo nạn nhân, gõ cuu để cứu hoặc skip để bỏ qua. Bạn vẫn có thể dùng giet <số> nếu còn bình độc.\n${formatLivingTargets(room)}`);
    } else if (role === "clone" && cloneNeedsTarget(room, player)) {
      await sendNightPrompt(api, player.id, `Đêm ${room.day}: chọn 1 người khác để nhân bản bằng số. Khi người đó chết, bạn sẽ nhận kỹ năng của họ.\n${formatLivingTargets(room, player.id)}`);
    } else if (role === "cultLeader" && canCultLeaderRecruit(room) && hasCultRecruitTarget(room, player.id)) {
      await sendNightPrompt(api, player.id, `Đêm ${room.day}: chọn 1 người để mời vào giáo phái bằng số. Sau khi chọn, đêm sau nghỉ và đêm kế tiếp mới được chọn lại.\n${formatLivingTargets(room, player.id)}${formatLoverTargetNotice(room, player)}`);
      await sendNightPrompt(api, player.id, formatCultMembers(room));
    } else if (role === "cultLeader") {
      await sendNightPrompt(api, player.id, `Đêm ${room.day}: bạn chưa thể mời thêm người vào giáo phái.${formatLoverTargetNotice(room, player)}\n${formatCultMembers(room)}`);
    }
    await sleep(180);
  }
}

function buildWolfNightPrompt(room, player) {
  if (player.role === "wolfWitch") {
    return `Đêm ${room.day}: Sói phù thủy không thể cắn người. Gõ soi <số> để tìm Tiên tri, hoặc truyentin <nội dung> để nhắn cả bầy Sói.\n${formatLivingTargets(room, player.id)}${formatWolfTeammates(room, player)}${formatLoverTargetNotice(room, player)}`;
  }
  const alphaHint =
    player.role === "alphaWolf" && !room.alphaCurseUsed
      ? "\nBạn là Sói nguyên: có thể gõ nguyen <số> một lần trong cả ván để nguyền 1 người thành Sói thường từ đêm sau."
      : "";
  if (canWolfBite(player.role)) {
    return `Đêm ${room.day}: chọn 1 dân để cắn bằng số.${alphaHint}\n${formatLivingTargets(room, player.id)}${formatWolfTeammates(room, player)}${formatLoverTargetNotice(room, player)}`;
  }
  return `Đêm ${room.day}: bạn thuộc bầy Sói.\n${formatLivingTargets(room, player.id)}${formatWolfTeammates(room, player)}${formatLoverTargetNotice(room, player)}`;
}

async function sendNightPrompt(api, userId, msg) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const sent = await dmPlayer(api, userId, msg);
    if (sent) return true;
    await sleep(650);
  }
  return false;
}

async function handleCupidChoice(api, message, room, content) {
  const player = findPlayerByUserId(room, message.data.uidFrom);
  if (player.role !== "cupid") {
    await send(api, message, "Chỉ Thần Tình Yêu được chọn ghép đôi lúc này.");
    return;
  }

  if (room.lovers?.length) {
    await send(api, message, "Thần Tình Yêu đã ghép đôi trong ván này, không thể chọn lại.");
    return;
  }

  const nums = content.match(/\d+/g)?.map(Number) || [];
  if (nums.length < 1) {
    await send(api, message, `Hãy nhập 1 số để ghép người đó với bạn, hoặc 2 số để ghép đôi hai người khác.\n${formatLivingTargets(room)}`);
    return;
  }
  const first = nums.length >= 2 ? getLivingByIndex(room, nums[0]) : player;
  const second = getLivingByIndex(room, nums.length >= 2 ? nums[1] : nums[0]);
  if (!first || !second || first.id === second.id || (nums.length >= 2 && (first.id === player.id || second.id === player.id))) {
    await send(api, message, `Cặp đôi không hợp lệ. Nhập 1 số để ghép với bạn, hoặc 2 số khác nhau để ghép hai người khác.\n${formatLivingTargets(room)}`);
    return;
  }

  const crossTeamLovers = isWolfMixedCouple(first, second);
  const coupleTeamText = "💞 Hai bạn khác phe → trở thành PHE CẶP ĐÔI, chỉ thắng khi là 2 người cuối cùng còn sống.";
  const coupleTeamSuffix = crossTeamLovers ? `\n${coupleTeamText}` : "";
  room.lovers = [first.id, second.id];
  room.loverTeam = crossTeamLovers ? "couple" : null;
  saveGameData();
  if (first.id === player.id) {
    await dmPlayer(api, first.id, `💘 Bạn đã trao trái tim cho ${second.name}. Hai bạn là cặp đôi — một người chết, người kia chết theo vì đau lòng.`);
    await dmPlayer(api, second.id, `💘 Thần Tình Yêu (${first.name}) đã chọn bạn làm người yêu. Hai bạn là cặp đôi — một người chết, người kia chết theo vì đau lòng.${coupleTeamSuffix}`);
  } else {
    await dmPlayer(api, first.id, `💘 Thần Tình Yêu (${player.name}) đã ghép bạn với ${second.name}. Hai bạn là cặp đôi — một người chết, người kia chết theo vì đau lòng.${coupleTeamSuffix}`);
    await dmPlayer(api, second.id, `💘 Thần Tình Yêu (${player.name}) đã ghép bạn với ${first.name}. Hai bạn là cặp đôi — một người chết, người kia chết theo vì đau lòng.${coupleTeamSuffix}`);
  }
  await send(api, message, `Đã ghép đôi ${first.name} và ${second.name}.`);
  await startNight(api, room, "Thần Tình Yêu đã hoàn tất. Đêm đầu bắt đầu.");
}

async function handleWitchAction(api, message, room, content) {
  const witch = findPlayerByUserId(room, message.data.uidFrom);
  const alive = getAlivePlayers(room);
  if (room.night.witch?.action) {
    await send(api, message, "Phù thủy đã dùng hành động trong đêm nay, không thể đổi hoặc dùng thêm.");
    return;
  }
  if (content === "skip") {
    room.night.witch = { action: "skip", target: null };
  } else if (content === "cuu") {
    if (!room.witch.heal) {
      await send(api, message, "Bình cứu đã dùng rồi.");
      return;
    }
    const victimId = getWolfVictim(room);
    if (!victimId) {
      await send(api, message, "Chưa có nạn nhân để cứu. Hãy chờ sói chọn mục tiêu hoặc dùng skip.");
      return;
    }
    room.night.witch = { action: "heal", target: victimId };
  } else if (content.startsWith("giet")) {
    if (!room.witch.poison) {
      await send(api, message, "Bình giết đã dùng rồi.");
      return;
    }
    const target = getLivingByIndex(room, Number(content.match(/\d+/)?.[0]));
    if (!target) {
      await send(api, message, `Mục tiêu không hợp lệ.\n${formatLivingTargets(room, witch.id)}`);
      return;
    }
    room.night.witch = { action: "poison", target: target.id };
  } else {
    await send(api, message, `Lệnh phù thủy: cuu / giet <số> / skip\n${formatLivingTargets(room)}`);
    return;
  }

  saveGameData();
  await send(api, message, "Đã ghi nhận hành động của Phù thủy.");
  await maybeResolveNight(api, room);
}

async function notifyWolfBiteChoice(api, room, actor, target) {
  const wolves = getAlivePlayers(room).filter((item) => ROLES[item.role].team === "wolf");
  if (!wolves.length) return;

  for (const wolf of wolves) {
    const text = wolf.id === actor.id
      ? `🐺 Đã chốt cắn: ${target.name}`
      : `🐺 [Phe sói] ${actor.name} đã chọn cắn ${target.name}.`;
    await sendNightPrompt(
      api,
      wolf.id,
      text
    );
    await sleep(250);
  }
}

async function handleWolfWitchPeek(api, message, room, content) {
  const wolfWitch = findPlayerByUserId(room, message.data.uidFrom);
  if (wolfWitch.role !== "wolfWitch") {
    await send(api, message, "Chỉ Sói phù thủy mới dùng được lệnh soi này.");
    return;
  }

  if (room.night.wolfWitchPeek) {
    await send(api, message, `Sói phù thủy đã soi ${room.players[room.night.wolfWitchPeek]?.name || "mục tiêu này"} trong đêm nay, không thể soi tiếp.`);
    return;
  }

  const target = getLivingByIndex(room, Number(content.match(/\d+/)?.[0]));
  if (target) {
    room.night.wolfWitchPeek = target.id;
    saveGameData();
  }
  if (!target) {
    await send(api, message, `Mục tiêu soi không hợp lệ.\n${formatLivingTargets(room, wolfWitch.id)}`);
    return;
  }

  await send(api, message, `${target.name} ${target.role === "seer" ? "là Tiên tri" : "không phải Tiên tri"}.`);
}

async function handleWolfWitchBroadcast(api, message, room, content) {
  const wolfWitch = findPlayerByUserId(room, message.data.uidFrom);
  if (wolfWitch.role !== "wolfWitch") {
    await send(api, message, "Chỉ Sói phù thủy mới dùng được lệnh truyền tin.");
    return;
  }

  if (room.night.wolfWitchBroadcast) {
    await send(api, message, "Sói phù thủy đã truyền tin trong đêm nay, không thể gửi thêm.");
    return;
  }

  const text = content.replace(/^truyentin\s*/i, "").trim();
  if (!text) {
    await send(api, message, "Dùng: truyentin <nội dung>");
    return;
  }

  room.night.wolfWitchBroadcast = true;
  saveGameData();
  const wolves = getAlivePlayers(room).filter((item) => ROLES[item.role].team === "wolf");
  await Promise.allSettled(
    wolves.map((wolf) => dmPlayer(api, wolf.id, `Tin từ Sói phù thủy ${wolfWitch.name}:\n${text}`))
  );
  await send(api, message, "Đã truyền tin cho cả bầy Sói.");
}

async function handleAlphaWolfCurse(api, message, room, content) {
  const alphaWolf = findPlayerByUserId(room, message.data.uidFrom);
  if (alphaWolf.role !== "alphaWolf") {
    await send(api, message, "Chỉ Sói nguyên mới dùng được lệnh nguyền.");
    return;
  }
  if (room.alphaCurseUsed) {
    await send(api, message, "Sói nguyên đã dùng lượt nguyền trong ván này rồi.");
    return;
  }

  const target = getLivingByIndex(room, Number(content.match(/\d+/)?.[0]));
  if (!target) {
    await send(api, message, `Mục tiêu nguyền không hợp lệ.\n${formatLivingTargets(room, alphaWolf.id)}`);
    return;
  }
  if (target.id === alphaWolf.id) {
    await send(api, message, "Sói nguyên không thể tự nguyền chính mình.");
    return;
  }
  if (ROLES[target.role].team === "wolf") {
    await send(api, message, "Không thể nguyền một người đã thuộc phe Sói.");
    return;
  }

  room.alphaCurseUsed = true;
  room.night.alphaCurse = { alphaId: alphaWolf.id, target: target.id };
  saveGameData();
  await send(api, message, `😈 Đã nguyền ${target.name} — sẽ biến thành sói khi trời sáng`);
  await maybeResolveNight(api, room);
}

async function handleCultLeaderRecruit(api, message, room, target) {
  const leader = findPlayerByUserId(room, message.data.uidFrom);
  if (leader.role !== "cultLeader") {
    await send(api, message, "Chỉ Trưởng giáo phái mới được mời người vào giáo phái.");
    return;
  }
  if (room.night?.cultRecruit) {
    const recruited = room.players[room.night.cultRecruit]?.name || "mục tiêu này";
    await send(api, message, `Trưởng giáo phái đã mời ${recruited} trong đêm nay, không thể chọn thêm người.`);
    return;
  }
  if (!canCultLeaderRecruit(room)) {
    const nextNight = (room.cult?.lastRecruitNight || 0) + 2;
    await send(api, message, `Trưởng giáo phái đang hồi chiêu. Đêm ${nextNight} mới được chọn tiếp.`);
    return;
  }
  if (target.id === leader.id) {
    await send(api, message, "Trưởng giáo phái không thể tự mời chính mình.");
    return;
  }

  room.cult ||= { members: [], lastRecruitNight: 0 };
  room.cult.members ||= [];
  if (room.cult.members.includes(target.id)) {
    await send(api, message, `${target.name} đã ở trong giáo phái.`);
    return;
  }

  room.cult.members.push(target.id);
  room.cult.lastRecruitNight = room.day;
  room.night.cultRecruit = target.id;
  saveGameData();
  await send(api, message, `Đã mời ${target.name} vào giáo phái.`);
  await dmPlayer(api, target.id, "Bạn đã bị kéo vào phe thứ 3, mau chóng tìm ra Trưởng giáo phái");
  await send(api, message, formatCultMembers(room));
  const win = checkWin(room);
  if (win) {
    await endGame(api, room, win.message, win.team);
    return;
  }
  await maybeResolveNight(api, room);
}

function canCultLeaderRecruit(room) {
  if (room.night?.cultRecruit) return false;
  return room.day === 1 || room.day - (room.cult?.lastRecruitNight || 0) >= 2;
}

function hasCultRecruitTarget(room, leaderId) {
  const members = new Set(room.cult?.members || []);
  return getAlivePlayers(room).some((player) => player.id !== leaderId && !members.has(player.id));
}

function cloneNeedsTarget(room, clone) {
  if (!clone?.alive || clone.role !== "clone") return false;
  if (room.cloneCopied?.[clone.id] || room.cloneTargets?.[clone.id]) return false;
  return getAlivePlayers(room).some((player) => player.id !== clone.id);
}

function canWolfBite(role) {
  return role === "wolf" || role === "alphaWolf";
}

async function maybeNotifyWitch(api, room) {
  const witch = Object.values(room.players).find((item) => item.alive && item.role === "witch");
  if (!witch || room.night.witch.action) return;
  const victimId = getWolfVictim(room);
  if (!victimId || room.night.witchNotifiedVictim === victimId) return;
  room.night.witchNotifiedVictim = victimId;
  saveGameData();
  await dmPlayer(
    api,
    witch.id,
    `Sói đang nhắm ${room.players[victimId].name}.\nGõ cuu để cứu người này, hoặc skip để bỏ qua. Nếu bạn không nhắn gì thì hết đêm bot tự bỏ qua.\nBình cứu: ${room.witch.heal ? "còn" : "hết"} | Bình độc: ${room.witch.poison ? "còn" : "hết"}\n${formatLivingTargets(room)}`
  );
}

async function maybeResolveNight(api, room) {
  if (room.phase !== "night") return;
  const living = getAlivePlayers(room);
  const wolves = living.filter((item) => canWolfBite(item.role));
  const needsWolf = wolves.length > 0;
  const wolfDone = !needsWolf || wolves.every((wolf) => room.night.wolves[wolf.id]);
  const seerDone = !hasAliveRole(room, "seer") || room.night.seer;
  const guardDone = !hasAliveRole(room, "guard") || room.night.guard;
  const cloneDone = getAlivePlayers(room)
    .filter((item) => cloneNeedsTarget(room, item))
    .every((clone) => room.night.clone[clone.id]);
  const cultLeader = living.find((item) => item.role === "cultLeader");
  const cultDone = !cultLeader || !canCultLeaderRecruit(room) || !hasCultRecruitTarget(room, cultLeader.id) || room.night.cultRecruit;
  const witch = living.find((item) => item.role === "witch");
  const witchNeedsHealChoice = witch && room.witch.heal && getWolfVictim(room);
  const witchDone = !witchNeedsHealChoice || room.night.witch.action;

  if (!wolfDone || !seerDone || !guardDone || !cloneDone || !cultDone || !witchDone) return;
  clearRoomTimer(room.threadId, "night");
  await resolveNight(api, room);
}

async function resolveNight(api, room) {
  if (room.phase !== "night") return;
  clearRoomTimer(room.threadId, "night");
  const deaths = [];
  const wolfVictim = getWolfVictim(room);
  const guarded = room.night.guard;
  const witchAction = room.night.witch;

  if (wolfVictim && wolfVictim !== guarded && !(witchAction.action === "heal" && witchAction.target === wolfVictim)) {
    deaths.push({ id: wolfVictim, reason: "bị sói cắn" });
  }
  if (witchAction.action === "heal" && room.witch.heal) room.witch.heal = false;
  if (witchAction.action === "poison" && room.witch.poison) {
    room.witch.poison = false;
    deaths.push({ id: witchAction.target, reason: "bị phù thủy dùng bình giết" });
  }
  if (guarded) room.lastGuardTarget = guarded;

  const finalDeaths = applyDeaths(room, deaths);
  await applyCloneCopies(api, room, finalDeaths);
  queueAlphaCurse(room);
  saveGameData();

  const win = checkWin(room);
  if (win) {
    await endGame(api, room, `TRỜI SÁNG. ${formatDeaths(room, finalDeaths)}\n${win.message}`, win.team);
    return;
  }

  const hunter = finalDeaths.find((dead) => room.players[dead.id]?.role === "hunter");
  if (hunter) {
    await promptHunter(api, room, hunter.id, "night", { deaths: finalDeaths });
    return;
  }

  await startDayAfterNight(api, room, finalDeaths);
}

async function startDayAfterNight(api, room, finalDeaths) {
  room.phase = "day";
  room.voteResolving = false;
  room.votes = {};
  room.voteDeadlineAt = Date.now() + VOTE_DURATION_MS;
  room.nightDeadlineAt = null;
  room.hunterDeadlineAt = null;
  await applyMaSoiChatLock(api, room, "day");
  saveGameData();
  scheduleVoteTimer(api, room);
  const dayMessage = `NGÀY ${room.day} - ${getAlivePlayers(room).length} người còn sống\nTRỜI SÁNG. ${formatDeaths(room, finalDeaths)}\n\nBan ngày thảo luận và bỏ phiếu: masoi v <số> hoặc masoi v skip.\n${formatLivingTargets(room)}`;
  let dayImagePath = null;
  try {
    dayImagePath = await createMaSoiDayImage(room, finalDeaths);
    await sendMaSoiPublicImage(
      api,
      room,
      { msg: dayMessage, attachments: [dayImagePath], ttl: 300000, isUseProphylactic: true },
    );
  } catch (error) {
    console.error("MaSoi day image failed:", error.message || error);
    await api.sendMessage({ msg: dayMessage, ttl: 300000 }, room.threadId, MessageType.GroupMessage);
  } finally {
    if (dayImagePath) await clearImagePath(dayImagePath).catch(() => {});
  }
}

function queueAlphaCurse(room) {
  const curse = room.night.alphaCurse;
  if (!curse?.target) return null;
  const target = room.players[curse.target];
  if (!target?.alive || ROLES[target.role].team === "wolf") return null;
  room.pendingAlphaCurse = { alphaId: curse.alphaId, target: curse.target, activateNight: room.day + 1 };
  return target;
}

async function applyAlphaCurse(api, room) {
  const curse = room.pendingAlphaCurse;
  if (!curse?.target || curse.activateNight !== room.day) return null;
  const target = room.players[curse.target];
  room.pendingAlphaCurse = null;
  if (!target?.alive || ROLES[target.role].team === "wolf") return null;
  const oldRole = ROLES[target.role]?.name || "vai cũ";
  target.role = "wolf";
  await dmPlayer(api, target.id, `Bạn đã bị Sói nguyên nguyền. Từ đêm ${room.day} bạn trở thành Sói thường, mất chức năng cũ (${oldRole}) và theo phe Sói.`);
  await sendRoleCard(api, target, room);
  await notifyWolvesAlphaCurse(api, room, target);
  return target;
}

async function notifyWolvesAlphaCurse(api, room, target) {
  const wolves = getAlivePlayers(room).filter((player) => ROLES[player.role].team === "wolf");
  const text = `😈 [Phe sói] ${target.name} đã bị nguyền thành sói, gia nhập bầy`;
  await Promise.allSettled(wolves.map((wolf) => dmPlayer(api, wolf.id, text)));
}

async function maybeResolveVote(api, room, force = false) {
  if (room.phase !== "day" || room.voteResolving) return;
  const living = getAlivePlayers(room);
  if (!force && Object.keys(room.votes).length < living.length) return;
  clearRoomTimer(room.threadId, "vote");
  room.voteResolving = true;
  room.phase = "trial";
  saveGameData();

  const counts = new Map();
  for (const vote of Object.values(room.votes)) {
    counts.set(vote, (counts.get(vote) || 0) + 1);
  }
  const skipCount = counts.get("skip") || 0;
  counts.delete("skip");
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const tied = sorted.length > 1 && sorted[1][1] === top?.[1];
  const voteRows = sorted.map(([id, count]) => ({ id, name: room.players[id]?.name || "Không rõ", count }));
  const trialVoteData = { voteRows, skipCount, totalVotes: Object.keys(room.votes).length };
  const topVoteCount = top?.[1] || 0;

  if (skipCount > topVoteCount) {
    await sendTrialResult(api, room, { lynched: false, reason: "skip", targetName: "Không ai", voteCount: topVoteCount, ...trialVoteData });
    await sleep(5000);
    await startNight(api, room);
    return;
  }

  if (!top || tied || (skipCount > 0 && skipCount === topVoteCount)) {
    await sendTrialResult(api, room, { lynched: false, reason: "tie", targetName: "Không ai", voteCount: topVoteCount, ...trialVoteData });
    await sleep(5000);
    await startNight(api, room);
    return;
  }

  const targetId = top[0];
  const target = room.players[targetId];
  const deaths = applyDeaths(room, [{ id: targetId, reason: "bị dân làng treo cổ" }]);
  await applyCloneCopies(api, room, deaths);
  saveGameData();
  const win = checkWin(room);
  if (win) {
    await endGame(api, room, `${formatDeaths(room, deaths)}\n${win.message}`, win.team);
    return;
  }
  if (room.players[targetId]?.role === "hunter") {
    await sendTrialResult(api, room, { lynched: true, targetName: target?.name, targetId, targetRole: target?.role, voteCount: top[1], deaths, ...trialVoteData });
    await promptHunter(api, room, targetId, "vote", { deaths });
    return;
  }
  await sendTrialResult(api, room, { lynched: true, targetName: target?.name, targetId, targetRole: target?.role, voteCount: top[1], deaths, ...trialVoteData });
  await startNight(api, room);
}

async function sendTrialResult(api, room, result) {
  let imagePath = null;
  const message = formatTrialResultText(room, result);
  try {
    imagePath = await createMaSoiTrialImage(room, result);
    await sendMaSoiPublicImage(
      api,
      room,
      { msg: `${message}`, attachments: [imagePath], ttl: 120000, isUseProphylactic: true }
    );
  } catch (error) {
    console.error("MaSoi trial image failed:", error.message || error);
    await api.sendMessage({ msg: `${message}`, ttl: 120000 }, room.threadId, MessageType.GroupMessage);
  } finally {
    if (imagePath) await clearImagePath(imagePath).catch(() => {});
  }
}

function formatTrialResultText(room, result) {
  if (result.lynched) {
    const target = room.players[result.targetId];
    const role = result.targetRole || target?.role;
    const roleName = ROLES[role]?.name || "Không rõ vai";
    const loverDeaths = (result.deaths || []).filter((death) => death.id !== result.targetId && death.reason === "chết theo người yêu");
    const loverText = loverDeaths.map((death) => formatLoverVoteDeath(room, death)).join("\n");
    return `🗳 ${result.targetName || target?.name || "Một người chơi"} bị treo cổ.\n(Vai thật: ${roleIcon(role)} ${roleName})${loverText ? `\n${loverText}` : ""}`;
  }
  if (result.reason === "skip") {
    return `🗳 Đa số bỏ phiếu trắng (${result.skipCount || 0}) — không ai bị treo cổ.`;
  }
  return "🗳 Hòa phiếu — không ai bị treo cổ.";
}

function formatLoverVoteDeath(room, death) {
  const player = room.players[death.id];
  const role = player?.role;
  const roleName = ROLES[role]?.name || "Không rõ vai";
  return `💀 ${player?.name || "Một người chơi"} đã chết. (Vai: ${roleIcon(role)} ${roleName}) 💔 (chết theo người yêu)`;
}

async function promptHunter(api, room, hunterId, source = "night", context = {}) {
  const token = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  room.pendingHunter = { id: hunterId, source, context, token };
  room.phase = "hunterShot";
  room.hunterDeadlineAt = Date.now() + HUNTER_SHOT_DURATION_MS;
  room.nightDeadlineAt = null;
  room.voteDeadlineAt = null;
  saveGameData();
  scheduleHunterTimer(api, room, token);
  await api.sendMessage({ msg: `Thợ săn ${room.players[hunterId].name} đã chết và có 30 giây để bắn theo. Hãy nhắn riêng bot số mục tiêu.\n${formatLivingTargets(room)}`, ttl: 180000 }, room.threadId, MessageType.GroupMessage);
  await dmPlayer(api, hunterId, `Bạn là Thợ săn, hãy chọn 1 người để bắn theo trong 30 giây bằng số.\n${formatLivingTargets(room)}`);
}

async function handleHunterShot(api, message, room, content) {
  const pending = normalizePendingHunter(room.pendingHunter);
  const target = getLivingByIndex(room, parseTargetIndex(content));
  if (!target) {
    await send(api, message, `Mục tiêu không hợp lệ.\n${formatLivingTargets(room)}`);
    return;
  }
  await send(api, message, `Bạn đã chọn bắn theo ${target.name}.`);
  clearRoomTimer(room.threadId, "hunter");
  room.pendingHunter = null;
  room.hunterDeadlineAt = null;
  const deaths = applyDeaths(room, [{ id: target.id, reason: "bị thợ săn bắn" }]);
  await applyCloneCopies(api, room, deaths);
  saveGameData();
  const win = checkWin(room);
  if (win) {
    await endGame(api, room, `${formatDeaths(room, deaths)}\n${win.message}`, win.team);
    return;
  }
  await api.sendMessage({ msg: `${formatDeaths(room, deaths)}`, ttl: 120000 }, room.threadId, MessageType.GroupMessage);
  await continueAfterHunter(api, room, pending, deaths);
}

function normalizePendingHunter(pendingHunter) {
  if (!pendingHunter) return null;
  if (typeof pendingHunter === "string") return { id: pendingHunter, source: "vote", context: {}, token: null };
  return pendingHunter;
}

function getPendingHunterId(room) {
  return normalizePendingHunter(room.pendingHunter)?.id || null;
}

async function handleHunterTimeout(api, room, token) {
  const pending = normalizePendingHunter(room.pendingHunter);
  if (!pending || pending.token !== token) return;
  room.pendingHunter = null;
  room.hunterDeadlineAt = null;
  saveGameData();
  await api.sendMessage({ msg: `Thợ săn không chọn mục tiêu trong 30 giây, bỏ qua lượt bắn.`, ttl: 120000 }, room.threadId, MessageType.GroupMessage);
  await continueAfterHunter(api, room, pending, []);
}

async function continueAfterHunter(api, room, pending, shotDeaths = []) {
  if (pending?.source === "night") {
    const nightDeaths = pending.context?.deaths || [];
    await startDayAfterNight(api, room, [...nightDeaths, ...shotDeaths]);
    return;
  }

  await sleep(5000);
  await startNight(api, room);
}

function applyDeaths(room, deaths) {
  const final = [];
  const seen = new Set();
  for (const death of deaths.filter((item) => item?.id && room.players[item.id]?.alive)) {
    if (seen.has(death.id)) continue;
    seen.add(death.id);
    room.players[death.id].alive = false;
    room.players[death.id].deathReason = death.reason;
    final.push(death);
    if (room.lovers.includes(death.id)) {
      const loverId = room.lovers.find((id) => id !== death.id);
      if (loverId && room.players[loverId]?.alive) {
        room.players[loverId].alive = false;
        room.players[loverId].deathReason = "chết theo người yêu";
        final.push({ id: loverId, reason: "chết theo người yêu" });
      }
    }
  }
  applyMaSoiDeadMutes(room);
  return final;
}

async function applyCloneCopies(api, room, deaths) {
  if (!deaths.length || !room.cloneTargets) return;
  const deadIds = new Set(deaths.map((death) => death.id));

  for (const [cloneId, targetId] of Object.entries(room.cloneTargets)) {
    const clone = room.players[cloneId];
    const target = room.players[targetId];
    if (!clone?.alive || !target || !deadIds.has(targetId) || room.cloneCopied?.[cloneId]) continue;

    const copiedRole = target.role === "clone" ? "villager" : target.role;
    clone.role = copiedRole;
    room.cloneCopied ||= {};
    room.cloneCopied[cloneId] = { targetId, role: copiedRole, copiedAtDay: room.day };
    await dmPlayer(api, clone.id, `${target.name} đã chết. Bạn nhận được kỹ năng của ${ROLES[copiedRole]?.name || "vai mới"}.`);
    await sendRoleCard(api, clone, room);
  }
}

function checkWin(room) {
  const alive = getAlivePlayers(room);
  if (hasCoupleWon(room, alive)) {
    const names = room.lovers.map((id) => room.players[id]?.name).filter(Boolean).join(" và ");
    return { team: "couple", message: `Phe Cặp Đôi thắng: ${names} là 2 người cuối cùng còn sống.` };
  }
  const crossTeamCoupleAlive = hasCrossTeamCoupleAlive(room, alive);
  if (!crossTeamCoupleAlive && hasCultWon(room, alive)) return { team: "cult", message: "Phe thứ 3 thắng: Trưởng giáo phái đã kéo toàn bộ người sống vào giáo phái." };
  const wolves = alive.filter((item) => ROLES[item.role].team === "wolf");
  const nonWolves = alive.filter((item) => ROLES[item.role].team !== "wolf");
  const cultLeaderAlive = alive.some((item) => item.role === "cultLeader");
  if (!crossTeamCoupleAlive && wolves.length === 0 && !cultLeaderAlive) return { team: "village", message: "Phe dân làng thắng: tất cả sói và phe thứ 3 đã bị loại." };
  if (!crossTeamCoupleAlive && wolves.length >= nonWolves.length) return { team: "wolf", message: "Phe sói thắng: số sói đã lớn hơn hoặc bằng số người không thuộc phe sói." };
  return null;
}

function hasCoupleWon(room, alive = getAlivePlayers(room)) {
  if (room.loverTeam !== "couple" || !Array.isArray(room.lovers) || room.lovers.length !== 2) return false;
  const aliveIds = new Set(alive.map((player) => player.id));
  return alive.length === 2 && room.lovers.every((id) => aliveIds.has(id));
}

function hasCrossTeamCoupleAlive(room, alive = getAlivePlayers(room)) {
  if (room.loverTeam !== "couple" || !Array.isArray(room.lovers) || room.lovers.length !== 2) return false;
  const aliveIds = new Set(alive.map((player) => player.id));
  return room.lovers.every((id) => aliveIds.has(id));
}

function hasCultWon(room, alive = getAlivePlayers(room)) {
  const leader = alive.find((player) => player.role === "cultLeader");
  if (!leader) return false;
  const members = new Set(room.cult?.members || []);
  return alive.length >= 1 && alive.every((player) => player.id === leader.id || members.has(player.id));
}

async function endGame(api, room, reason, winnerTeam = "village") {
  room.phase = "ended";
  clearRoomTimers(room.threadId);
  updateMaSoiScores(room, winnerTeam);
  const summary = Object.values(room.players)
    .map((player) => `${roleIcon(player.role)} ${player.name} — ${ROLES[player.role].name} ${player.alive ? "✅" : "☠️"}`)
    .join("\n");
  const resultReason = getWinnerCanvasReason(winnerTeam);
  const imagePath = await createMaSoiResultImage(room, winnerTeam, resultReason);
  await clearMaSoiChatLock(api, room);
  clearMaSoiDeadMutes(room);
  ensureState().history.unshift({ threadId: room.threadId, endedAt: Date.now(), players: Object.values(room.players), reason });
  ensureState().history = ensureState().history.slice(0, 20);
  clearForcedWolves(room.threadId, room);
  delete ensureState().rooms[room.threadId];
  saveGameData();
  await sendMaSoiPublicImage(
    api,
    room,
    { msg: `${getWinnerTitle(winnerTeam)}\n${reason}\n\n📜 Bảng vai trò:\n${summary}`, attachments: [imagePath], ttl: 300000 },
  );
  await clearImagePath(imagePath).catch(() => {});
}

function updateMaSoiScores(room, winnerTeam) {
  const data = ensureState();
  data.scores ||= {};

  for (const player of Object.values(room.players || {})) {
    let isWinner = false;
    let bonus = 1;

    if (winnerTeam === "village") {
      // Tất cả phe Dân đều được điểm, kể cả đã chết
      isWinner = ROLES[player.role]?.team === "village";

    } else if (winnerTeam === "wolf") {
      // Tất cả phe Sói đều được điểm, kể cả đã chết
      isWinner = ROLES[player.role]?.team === "wolf";

    } else if (winnerTeam === "couple") {
      // Giữ nguyên: cặp đôi chiến thắng
      isWinner = player.alive && room.lovers?.includes(player.id);

    } else if (winnerTeam === "cult") {
      // Chỉ Trưởng giáo phái còn sống được +3
      // Thành viên giáo phái không được cộng điểm
      isWinner = player.alive && player.role === "cultLeader";
      bonus = 3;
    }

    if (!isWinner) continue;

    const id = normalizeUserId(player.id);

    const entry = data.scores[id] || {
      id,
      name: player.name,
      avatar: player.avatar,
      score: 0,
      wins: 0,
    };

    entry.name = player.name || entry.name;
    entry.avatar = player.avatar || entry.avatar || "";
    entry.firstScoreAt ||= Date.now();
    entry.score = (entry.score || 0) + bonus;
    entry.wins = (entry.wins || 0) + 1;
    entry.lastWinAt = Date.now();

    data.scores[id] = entry;
  }

  saveGameData();
}

function isWinningAlivePlayer(room, player, winnerTeam) {
  if (winnerTeam === "couple") return room.lovers?.includes(player.id);
  if (winnerTeam === "wolf") return ROLES[player.role]?.team === "wolf";
  if (winnerTeam === "village") return ROLES[player.role]?.team === "village";
  if (winnerTeam === "cult") {
    return player.role === "cultLeader" || (room.cult?.members || []).includes(player.id);
  }
  return false;
}

function getWinnerCanvasReason(winnerTeam) {
  if (winnerTeam === "couple") return "Phe Cặp Đôi là hai người cuối cùng còn sống";
  if (winnerTeam === "village") return "Dân làng đã loại hết sói và phe thứ 3";
  if (winnerTeam === "cult") return "Phe thứ 3 đã lan khắp ngôi làng";
  return "Bầy sói toàn thắng";
}

function getWinnerTitle(winnerTeam) {
  if (winnerTeam === "couple") return "💞 PHE CẶP ĐÔI THẮNG!";
  if (winnerTeam === "village") return "🏡 PHE DÂN LÀNG THẮNG!";
  if (winnerTeam === "cult") return "🕯️ PHE THỨ 3 THẮNG!";
  return "🐺 BẦY SÓI THẮNG!";
}

function getWolfVictim(room) {
  const votes = Object.values(room.night.wolves || {});
  if (!votes.length) return null;
  const aliveWolves = getAlivePlayers(room).filter((player) => canWolfBite(player.role)).length;
  const requiredVotes = aliveWolves <= 1 ? 1 : Math.ceil(aliveWolves * 2 / 3);
  const counts = new Map();
  votes.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const tied = sorted.length > 1 && sorted[1][1] === top?.[1];
  if (!top || tied || top[1] < requiredVotes) return null;
  return top[0];
}

function getRoom(threadId) {
  return ensureState().rooms[threadId] || null;
}

function getAlivePlayers(room) {
  return Object.values(room.players).filter((player) => player.alive);
}

function hasAliveRole(room, role) {
  return getAlivePlayers(room).some((player) => player.role === role);
}

function getLivingByIndex(room, index) {
  if (!Number.isInteger(index) || index < 1) return null;
  return getAlivePlayers(room)[index - 1] || null;
}

function parseTargetIndex(text) {
  const match = String(text || "").match(/^\d+$/);
  return match ? Number(match[0]) : null;
}

function formatLivingTargets(room, excludeId = null) {
  return getAlivePlayers(room)
    .map((player, index) => `${index + 1}. ${player.name}${player.id === excludeId ? " (bạn)" : ""}`)
    .join("\n");
}

function formatCultMembers(room) {
  const memberIds = room.cult?.members || [];
  if (!memberIds.length) return "🕯️ Thành viên giáo phái hiện tại: chưa có ai.";
  const members = memberIds
    .map((id, index) => {
      const player = room.players?.[id];
      if (!player) return `${index + 1}. ${id}`;
      return `${index + 1}. ${player.name}${player.alive ? "" : " (đã chết)"}`;
    })
    .join("\n");
  return `🕯️ Thành viên giáo phái hiện tại:\n${members}`;
}

function formatPlayerList(room, showStatus = false) {
  const players = Object.values(room.players);
  return (
    `Phòng Ma Sói (${players.length}/${MAX_PLAYERS}) - trạng thái: ${room.phase}\n` +
    players.map((player, index) => `${index + 1}. ${player.name}${showStatus ? ` - ${player.alive ? "sống" : "chết"}` : ""}`).join("\n")
  );
}

function formatVoteProgress(room) {
  const livingCount = getAlivePlayers(room).length;
  return `Đã vote: ${Object.keys(room.votes).length}/${livingCount}`;
}

function getCurrentMessageMentions(message) {
  const content = String(message.data?.content || "");
  return (Array.isArray(message.data?.mentions) ? message.data.mentions : []).filter((mention) => {
    if (!Number.isFinite(mention.pos) || !Number.isFinite(mention.len)) return true;
    const text = content.slice(mention.pos, mention.pos + mention.len);
    return text.includes("@");
  });
}

function getMentionUserId(mention) {
  return mention?.uid || mention?.userId || mention?.id || mention?.user_id || "";
}

function getMentionName(message, userId) {
  const mention = getCurrentMessageMentions(message).find((item) => normalizeUserId(getMentionUserId(item)) === normalizeUserId(userId));
  if (!mention) return "";
  return String(mention.name || mention.displayName || "")
    .replace("@", "")
    .trim() || String(message.data?.content || "")
    .substr(mention.pos, mention.len)
    .replace("@", "")
    .trim();
}

function findPlayerByUserId(room, userId) {
  if (!room?.players) return null;
  const normalizedId = normalizeUserId(userId);
  const entry = Object.entries(room.players).find(
    ([key, player]) => normalizeUserId(key) === normalizedId || normalizeUserId(player.id) === normalizedId
  );
  return entry?.[1] || null;
}

function normalizeUserId(userId) {
  return String(userId || "").replace(/_0$/, "");
}

async function sendLobby(api, room, caption) {
  const players = Object.values(room.players);
  const imagePath = await createMaSoiLobbyImage(players, room.code);
  const need = Math.max(0, MIN_PLAYERS - players.length);
  const prefix = getGlobalPrefix(api?.getBotId?.());
  const text =
    `${caption}\n\n` +
    "📩 LƯU Ý: Hãy kết bạn / mở chat với bot trước, vì vai trò sẽ được gửi qua tin nhắn riêng.\n\n" +
    `👉 Gõ "${prefix}masoi join" hoặc thả ❤️ vào ảnh sảnh để tham gia.\n` +
    "✅✅✅";
  await sendMaSoiPublicImage(
    api,
    room,
    {
      msg: `${text}\n\n🐺 ${players[players.length - 1]?.name || room.ownerName} vào sảnh (${players.length}/${MAX_PLAYERS})${need ? ` - cần thêm ${need} người` : ""}`,
      attachments: [imagePath],
      ttl: 0,
    }
  );
  await clearImagePath(imagePath).catch(() => {});
  saveGameData();
}

async function deleteLobbyMessage(api, room) {
  await deleteMaSoiPublicImageMessage(api, room);
  room.lobbyMessage = null;
}

async function sendMaSoiPublicImage(api, room, payload) {
  await deleteMaSoiPublicImageMessage(api, room);
  const sent = await api.sendMessage(payload, room.threadId, MessageType.GroupMessage);
  room.publicImageMessage = normalizeSentMessage(sent, room.threadId, api);
  room.lobbyMessage = room.publicImageMessage;
  saveGameData();
  return sent;
}

async function deleteMaSoiPublicImageMessage(api, room) {
  const message = room?.publicImageMessage || room?.lobbyMessage || findLatestCachedPublicImageMessage(room?.threadId, api);
  if (!message) return;
  const messageToDelete = ensureSentMessageOwner(message, api);
  const deleted = await tryUndoOrDeleteMessage(api, messageToDelete);
  if (!deleted && (room?.publicImageMessage || room?.lobbyMessage)) {
    const cachedMessage = findLatestCachedPublicImageMessage(room?.threadId, api);
    if (cachedMessage) await tryUndoOrDeleteMessage(api, cachedMessage);
  }
  room.publicImageMessage = null;
  room.lobbyMessage = null;
  saveGameData();
}

async function tryUndoOrDeleteMessage(api, message) {
  const undone = await undoMaSoiPublicImageMessage(api, message).then(() => true).catch(() => false);
  if (undone) {
    markMessageCacheUndo(message?.data?.cliMsgId);
    return true;
  }
  const deleted = await api.deleteMessage(message, false).then(() => true).catch(() => false);
  if (deleted) markMessageCacheUndo(message?.data?.cliMsgId);
  return deleted;
}

async function undoMaSoiPublicImageMessage(api, message) {
  if (!message?.data?.msgId || !message?.data?.cliMsgId) throw new Error("Missing MaSoi public image message id");
  const undoMessage = {
    ...message,
    data: {
      ...message.data,
      quote: {
        globalMsgId: message.data.msgId,
        cliMsgId: message.data.cliMsgId,
      },
    },
  };
  await api.undoMessage(undoMessage);
}

function applyMaSoiDeadMutes(room) {
  const deadPlayers = Object.values(room.players || {}).filter((player) => !player.alive);
  if (!deadPlayers.length) return;

  const settings = readGroupSettings();
  const threadSettings = settings[room.threadId] || {};
  threadSettings.muteList ||= {};
  settings[room.threadId] = threadSettings;

  for (const player of deadPlayers) {
    if (threadSettings.muteList[player.id] && !threadSettings.muteList[player.id].masoi) continue;
    threadSettings.muteList[player.id] = {
      name: player.name,
      timeMute: -1,
      masoi: true,
    };
  }

  writeGroupSettings(settings);
}

function clearMaSoiDeadMutes(room) {
  const settings = readGroupSettings();
  const threadSettings = settings[room.threadId];
  if (!threadSettings?.muteList) return;

  const participantIds = new Set(Object.keys(room.players || {}));
  let changed = false;
  for (const [userId, muteInfo] of Object.entries(threadSettings.muteList)) {
    if (muteInfo?.masoi && participantIds.has(userId)) {
      delete threadSettings.muteList[userId];
      changed = true;
    }
  }

  if (changed) writeGroupSettings(settings);
}

async function applyMaSoiChatLock(api, room, phase) {
  if (phase === "night") {
    await lockMaSoiChat(api, room);
  } else {
    await clearMaSoiChatLock(api, room);
  }
}

async function lockMaSoiChat(api, room) {
  if (!api?.changeGroupSetting || !room?.threadId) return;
  room.maSoiChatLock ||= { active: false, didLock: false, previousLockSendMsg: null };
  if (room.maSoiChatLock.active) return;

  const previousLockSendMsg = await getCurrentLockSendMsg(api, room.threadId);
  room.maSoiChatLock = {
    active: true,
    didLock: false,
    previousLockSendMsg,
  };

  if (previousLockSendMsg === 1) {
    saveGameData();
    return;
  }

  try {
    await api.changeGroupSetting(room.threadId, { lockSendMsg: 1 });
    room.maSoiChatLock.didLock = true;
    saveGameData();
  } catch (error) {
    room.maSoiChatLock.active = false;
    console.error("MaSoi lock chat failed:", error.message || error);
  }
}

async function clearMaSoiChatLock(api, room) {
  if (!api?.changeGroupSetting || !room?.threadId || !room.maSoiChatLock?.active) return;
  const lockState = room.maSoiChatLock;
  room.maSoiChatLock = { active: false, didLock: false, previousLockSendMsg: null };

  if (!lockState.didLock || lockState.previousLockSendMsg === 1) {
    saveGameData();
    return;
  }

  try {
    await api.changeGroupSetting(room.threadId, { lockSendMsg: 0 });
  } catch (error) {
    console.error("MaSoi unlock chat failed:", error.message || error);
  } finally {
    saveGameData();
  }
}

async function getCurrentLockSendMsg(api, threadId) {
  if (!api?.getGroupInfo) return null;
  try {
    const response = await api.getGroupInfo(threadId);
    const groupInfo = response?.gridInfoMap?.[threadId] || response?.gridInfoMap?.[String(threadId).replace(/^g/, "")];
    const value = groupInfo?.setting?.lockSendMsg;
    return value === undefined || value === null ? null : Number(value);
  } catch (error) {
    console.error("MaSoi get lock chat state failed:", error.message || error);
    return null;
  }
}

function normalizeSentMessage(sent, threadId, api) {
  const data = sent?.data || sent?.attachment?.[0]?.data || sent?.attachment?.[0] || sent?.message?.data || sent?.message || sent;
  const cliMsgId = data?.cliMsgId || data?.clientId || data?.clientMsgId;
  const msgId = data?.msgId || data?.globalMsgId || data?.messageId;
  if (!cliMsgId || !msgId) return null;
  return {
    type: MessageType.GroupMessage,
    threadId,
    data: {
      cliMsgId,
      msgId,
      uidFrom: data?.uidFrom || data?.ownerId || apiBotIdFallback(api),
    },
  };
}

function ensureSentMessageOwner(message, api) {
  return {
    ...message,
    data: {
      ...message.data,
      uidFrom: message?.data?.uidFrom || apiBotIdFallback(api),
    },
  };
}

function apiBotIdFallback(api) {
  return typeof api?.getBotId === "function" ? api.getBotId() : null;
}

function isMaSoiAdmin(api, userId, threadId) {
  const botId = apiBotIdFallback(api);
  return Boolean(botId && isAdmin(botId, userId, threadId));
}

function findLatestCachedPublicImageMessage(threadId, api) {
  if (!threadId) return null;
  const botId = String(apiBotIdFallback(api) || "");
  const normalizedThreadId = String(threadId);
  return Object.values(getMessageCache())
    .filter((item) => {
      if (String(item?.threadId) !== normalizedThreadId) return false;
      if (String(item?.type) !== String(MessageType.GroupMessage)) return false;
      if (item?.isUndo) return false;
      if (String(item?.msgType || "") !== "chat.photo") return false;
      const ownerId = String(item?.uidFrom || "");
      if (botId && ownerId && ownerId !== botId && ownerId !== "0") return false;
      return isMaSoiPublicImageTitle(getCachedMessageTitle(item));
    })
    .sort((left, right) => Number(right.timestamp || 0) - Number(left.timestamp || 0))
    .map((item) => createMessageFromCachedImage(item, normalizedThreadId, botId))
    [0] || null;
}

function createMessageFromCachedImage(item, threadId, botId) {
  const ownerId = String(item.uidFrom || botId);
  return {
    type: MessageType.GroupMessage,
    threadId,
    data: {
      cliMsgId: String(item.cliMsgId),
      msgId: String(item.msgId),
      uidFrom: ownerId === "0" ? botId : ownerId,
    },
  };
}

function getCachedMessageTitle(item) {
  return typeof item?.content === "string" ? item.content : item?.content?.title || "";
}

function isMaSoiPublicImageTitle(title) {
  const text = normalizeSearchText(title);
  return ["ma soi", "masoi", "dem ", "troi sang", "phien toa", "bang top ma soi"].some((keyword) => text.includes(keyword));
}

function normalizeSearchText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function roleIcon(role) {
  const map = {
    villager: "👨‍🌾",
    fakeWolf: "🎭",
    guard: "🛡️",
    seer: "👁️",
    wolf: "🐺",
    alphaWolf: "🐺",
    wolfWitch: "🐺",
    witch: "🧪",
    hunter: "🏹",
    cupid: "💘",
    clone: "🪞",
    cultLeader: "🕯️",
  };
  return map[role] || "🎭";
}

function formatDeaths(room, deaths) {
  if (!deaths.length) return "🎉 Đêm bình yên — không ai chết!";
  return `NGƯỜI CHẾT:\n${deaths.map((death) => formatDeathDetail(room, death)).join("\n")}`;
}

function formatDeathDetail(room, death) {
  const player = room.players[death.id];
  const name = player?.name || "Một người chơi";
  const role = player?.role;
  const roleName = ROLES[role]?.name || "Không rõ vai";
  return `💀 ${name} đã chết. - Vai: ${roleIcon(role)} ${roleName} (${death.reason})`;
}

function buildHelp(prefix) {
  return (
    "GAME MA SÓI\n" +
    `${prefix}masoi join - tham gia phòng (hoặc thả ❤️ vào ảnh sảnh)\n` +
    `${prefix}masoi leave - rời phòng\n` +
    `${prefix}masoi list - xem danh sách\n` +
    `${prefix}masoi start - bắt đầu\n` +
    `${prefix}masoi cancel - hủy phòng\n` +
    `${prefix}masoi vai - bot DM lại vai\n` +
    `${prefix}masoi huongdan - hướng dẫn cách chơi và vai trò\n` +
    `${prefix}masoi v <số> - vote treo cổ\n` +
    `${prefix}masoi v skip - bỏ phiếu trắng\n\n` +
    "Bộ vai tăng dần theo số người: Người giả sói từ 5, Thợ săn từ 9, Sói nguyên từ 10, Cupid từ 11, Nhân bản từ 12, Sói phù thủy và Trưởng giáo phái từ 13.\n" +
    "Sói phù thủy không thể cắn người; dùng: soi <số> để tìm Tiên tri, truyentin <nội dung> để gửi tin cho bầy Sói.\n" +
    "Trưởng giáo phái cách 1 đêm chọn 1 người vào giáo phái; thành viên giáo phái không có quyền chọn thêm người.\n" +
    "Ban đêm inbox bot: gõ số mục tiêu. Phù thủy dùng: cuu / giet <số> / skip."
  );
}

function buildGuide(prefix) {
  return (
    "HƯỚNG DẪN MA SÓI\n\n" +
    "Cách chơi:\n" +
    `- Tạo/tham gia: ${prefix}masoi join\n` +
    `- Chủ phòng bắt đầu: ${prefix}masoi start\n` +
    `- Xem danh sách: ${prefix}masoi list\n` +
    `- Xem lại vai: ${prefix}masoi vai\n` +
    "- Ban đêm: bot khóa chat nhóm, người có chức năng nhắn riêng bot theo hướng dẫn.\n" +
    `- Ban ngày: thảo luận và vote bằng ${prefix}masoi v <số>, hoặc ${prefix}masoi v skip.\n` +
    "- Người chết giữ trạng thái mute và không được tham gia tiếp.\n\n" +
    "Điều kiện thắng:\n" +
    "- Phe dân làng thắng khi loại hết Sói và Trưởng giáo phái.\n" +
    "- Phe Sói thắng khi số Sói lớn hơn hoặc bằng số dân còn sống.\n" +
    "- Phe thứ 3 thắng khi Trưởng giáo phái còn sống và đã kéo toàn bộ người sống còn lại vào giáo phái.\n\n" +
    "Chức năng từng vai:\n" +
    "🐺 Sói: mỗi đêm chọn 1 người để cắn. Sói chỉ cắn thành công khi đủ số phiếu chung mục tiêu.\n" +
    "🐺 Sói nguyên: thuộc phe Sói, có thể cắn và dùng nguyen <số> một lần để biến 1 người thành Sói thường từ đêm sau nếu còn sống.\n" +
    "🐺 Sói phù thủy: thuộc phe Sói nhưng không thể cắn. Dùng soi <số> để kiểm tra ai là Tiên tri, dùng truyentin <nội dung> để gửi tin riêng cho cả bầy Sói.\n" +
    "🔮 Tiên tri: mỗi đêm chọn 1 người để soi, biết vai và phe của người đó.\n" +
    "🎭 Người giả sói: thuộc phe Dân làng, không có kỹ năng; nếu bị Tiên tri soi sẽ hiện là Sói và phe Sói.\n" +
    "🛡️ Bảo vệ: mỗi đêm bảo vệ 1 người, không được bảo vệ cùng một người 2 đêm liên tiếp.\n" +
    "🧪 Phù thủy: có 1 bình cứu và 1 bình giết, mỗi bình dùng một lần. Lệnh: cuu / giet <số> / skip.\n" +
    "🏹 Thợ săn: khi chết được nhắn riêng bot chọn 1 người để bắn theo.\n" +
    "💘 Thần tình yêu: đầu ván nhập 1 số để ghép đôi với mình, hoặc 2 số để ghép đôi hai người khác; một người chết thì người còn lại chết theo vì đau lòng.\n" +
    "🪞 Nhân bản: nếu chưa chọn mục tiêu thì mỗi đêm được chọn 1 người khác; khi người đó chết sẽ nhận kỹ năng của họ. Đã chọn rồi thì không được chọn lại.\n" +
    "🕯️ Trưởng giáo phái: cách 1 đêm chọn 1 người vào giáo phái. Người bị kéo nhận thông báo phe thứ 3; thành viên giáo phái không thể kéo thêm người.\n" +
    "👨‍🌾 Dân làng: không có kỹ năng ban đêm, dùng thảo luận và vote để tìm Sói hoặc Trưởng giáo phái."
  );
}

async function send(api, message, msg, ttl = 30000) {
  await api.sendMessage({ msg: `${msg}`, quote: message, ttl }, message.threadId, message.type);
}

async function dmPlayer(api, userId, msg) {
  try {
    await api.sendMessage({ msg: `${msg}`, ttl: 300000 }, userId, MessageType.DirectMessage);
    return true;
  } catch (error) {
    console.error(`MaSoi private message failed for ${userId}:`, error.message || error);
    return false;
  }
}

function shuffle(items) {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

let maSoiRuntimeRestored = false;
let maSoiRuntimeRestoring = null;

function normalizeRoomAfterRestart(room) {
  if (!room) return;

  room.createdAt ||= Date.now();
  room.lobbyDeadlineAt ??= room.createdAt + LOBBY_DURATION_MS;
  room.nightDeadlineAt ??= room.phase === "night" ? Date.now() + NIGHT_DURATION_MS : null;
  room.voteDeadlineAt ??= room.phase === "day" ? Date.now() + VOTE_DURATION_MS : null;
  room.hunterDeadlineAt ??= room.phase === "hunterShot" ? Date.now() + HUNTER_SHOT_DURATION_MS : null;

  room.night ||= createNightState();
  room.votes ||= {};
  room.pendingHunter = room.pendingHunter || null;
  room.maSoiChatLock ||= { active: false, didLock: false, previousLockSendMsg: null };
}

async function ensureMaSoiRuntimeRestored(api) {
  if (maSoiRuntimeRestored || !api) return;
  if (maSoiRuntimeRestoring) {
    await maSoiRuntimeRestoring;
    return;
  }

  maSoiRuntimeRestoring = restoreMaSoiRooms(api)
    .catch((error) => {
      console.error("MaSoi restore rooms error:", error?.message || error);
    })
    .finally(() => {
      maSoiRuntimeRestored = true;
      maSoiRuntimeRestoring = null;
    });

  await maSoiRuntimeRestoring;
}

async function restoreMaSoiRooms(api) {
  const rooms = Object.values(ensureState().rooms || {});
  if (!rooms.length) {
    maSoiRuntimeRestored = true;
    return;
  }

  for (const room of rooms) {
    normalizeRoomAfterRestart(room);
    applyMaSoiDeadMutes(room);

    if (room.phase === "lobby") {
      scheduleLobbyTimer(api, room);
    } else if (room.phase === "night") {
      scheduleNightTimer(api, room);
    } else if (room.phase === "day") {
      scheduleVoteTimer(api, room);
    } else if (room.phase === "hunterShot") {
      const pending = normalizePendingHunter(room.pendingHunter);
      if (pending?.token) scheduleHunterTimer(api, room, pending.token);
    } else if (room.phase === "trial") {
      // Nếu bot tắt đúng lúc đang chuyển từ kết quả vote sang đêm mới,
      // tiếp tục sang đêm thay vì để phòng kẹt vĩnh viễn ở phase "trial".
      setTimeout(() => {
        const currentRoom = getRoom(room.threadId);
        if (currentRoom?.phase === "trial") {
          startNight(api, currentRoom).catch((error) =>
            console.error("MaSoi resume trial error:", error?.message || error)
          );
        }
      }, 500);
    }
  }

  saveGameData();
  maSoiRuntimeRestored = true;
  console.log(`MaSoi: đã phục hồi runtime cho ${rooms.length} phòng sau restart`);
}

function getRemainingDelay(deadlineAt, fallbackMs) {
  const deadline = Number(deadlineAt);
  if (!Number.isFinite(deadline) || deadline <= 0) return fallbackMs;
  return Math.max(0, deadline - Date.now());
}

function scheduleLobbyTimer(api, room) {
  clearRoomTimer(room.threadId, "lobby");
  room.lobbyDeadlineAt ??= (room.createdAt || Date.now()) + LOBBY_DURATION_MS;

  const timers = roomTimers.get(room.threadId) || {};
  timers.lobby = setTimeout(async () => {
    const currentRoom = getRoom(room.threadId);
    if (!currentRoom || currentRoom.phase !== "lobby" || currentRoom.createdAt !== room.createdAt) return;
    await deleteLobbyMessage(api, currentRoom);
    clearForcedWolves(currentRoom.threadId, currentRoom);
    delete ensureState().rooms[currentRoom.threadId];
    clearRoomTimer(currentRoom.threadId, "lobby");
    saveGameData();
    await api.sendMessage(
      { msg: `Phòng Ma Sói đã tự hủy vì sau 5 phút chưa bắt đầu.`, ttl: 120000 },
      currentRoom.threadId,
      MessageType.GroupMessage
    ).catch(() => {});
  }, getRemainingDelay(room.lobbyDeadlineAt, LOBBY_DURATION_MS));

  roomTimers.set(room.threadId, timers);
  saveGameData();
}

function scheduleNightTimer(api, room) {
  clearRoomTimer(room.threadId, "night");
  room.nightDeadlineAt ??= Date.now() + NIGHT_DURATION_MS;

  const timers = roomTimers.get(room.threadId) || {};
  timers.night = setTimeout(async () => {
    const currentRoom = getRoom(room.threadId);
    if (!currentRoom || currentRoom.phase !== "night" || currentRoom.day !== room.day) return;
    await resolveNight(api, currentRoom);
  }, getRemainingDelay(room.nightDeadlineAt, NIGHT_DURATION_MS));

  roomTimers.set(room.threadId, timers);
  saveGameData();
}

function scheduleVoteTimer(api, room) {
  clearRoomTimer(room.threadId, "vote");
  room.voteDeadlineAt ??= Date.now() + VOTE_DURATION_MS;

  const timers = roomTimers.get(room.threadId) || {};
  timers.vote = setTimeout(async () => {
    const currentRoom = getRoom(room.threadId);
    if (!currentRoom || currentRoom.phase !== "day") return;
    await maybeResolveVote(api, currentRoom, true);
  }, getRemainingDelay(room.voteDeadlineAt, VOTE_DURATION_MS));

  roomTimers.set(room.threadId, timers);
  saveGameData();
}

function scheduleHunterTimer(api, room, token) {
  clearRoomTimer(room.threadId, "hunter");
  room.hunterDeadlineAt ??= Date.now() + HUNTER_SHOT_DURATION_MS;

  const timers = roomTimers.get(room.threadId) || {};
  timers.hunter = setTimeout(async () => {
    const currentRoom = getRoom(room.threadId);
    if (!currentRoom || currentRoom.phase !== "hunterShot") return;
    await handleHunterTimeout(api, currentRoom, token);
  }, getRemainingDelay(room.hunterDeadlineAt, HUNTER_SHOT_DURATION_MS));

  roomTimers.set(room.threadId, timers);
  saveGameData();
}

function clearRoomTimer(threadId, type) {
  const timers = roomTimers.get(threadId);
  if (!timers?.[type]) return;
  clearTimeout(timers[type]);
  delete timers[type];
  if (!timers.lobby && !timers.night && !timers.vote && !timers.hunter) roomTimers.delete(threadId);
  else roomTimers.set(threadId, timers);
}

function clearRoomTimers(threadId) {
  const timers = roomTimers.get(threadId);
  if (!timers) return;
  if (timers.lobby) clearTimeout(timers.lobby);
  if (timers.night) clearTimeout(timers.night);
  if (timers.vote) clearTimeout(timers.vote);
  if (timers.hunter) clearTimeout(timers.hunter);
  roomTimers.delete(threadId);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Compatibility exports: the command and event pipeline still uses these
// names.  The new Ma Sói implementation keeps its own concise public API.
export async function handleWerewolfCommand(api, message, canManage = false) {
  const prefix = getGlobalPrefix(api?.getBotId?.());
  const raw = String(message?.data?.content || "").trim();
  const commandText = prefix && raw.startsWith(prefix) ? raw.slice(prefix.length).trim() : raw;
  const argsText = commandText
    .replace(/^game\s+masoi\b/i, "")
    .replace(/^masoi\b/i, "")
    .trim();
  const [first = "help", ...rest] = argsText.split(/\s+/).filter(Boolean);
  const aliases = { create: "join", huy: "cancel", luat: "help", status: "list" };
  const action = aliases[first.toLowerCase()] || first.toLowerCase();
  const compatibleMessage = {
    ...message,
    data: { ...message.data, content: `${prefix}masoi ${[action, ...rest].join(" ")}` },
  };
  await handleMaSoiCommand(api, compatibleMessage, null);
  return true;
}

export async function handleWerewolfPrivateAction(api, message) {
  return handleMaSoiPrivateInput(api, message);
}

export async function handleWerewolfGroupVote(api, message) {
  const content = String(message?.data?.content || "").trim();
  const match = content.match(/^(?:v|vote)\s*(\d+|skip)$/i);
  if (!match) return false;
  const room = getRoom(message.threadId);
  if (!room || room.phase !== "day") return false;
  await voteLynch(api, message, match[1]);
  return true;
}

export async function handleWerewolfGroupRestriction(api, message) {
  const room = getRoom(message?.threadId);
  return Boolean(room?.maSoiChatLock?.active && room.phase === "night");
}

export async function handleWerewolfReaction(api, reaction) {
  const data = reaction?.data || {};
  const rMsg = data?.content?.rMsg?.[0];
  const room = getRoom(reaction?.threadId || data?.threadId);
  const reactionType = Number(data?.content?.rType);
  const reactionIcon = String(data?.content?.rIcon || data?.content?.icon || "").toLowerCase();
  const reactedId = String(rMsg?.gMsgID || rMsg?.cMsgID || "");
  const lobbyId = String(room?.publicImageMessage?.data?.msgId || room?.lobbyMessage?.data?.msgId || "");
  const isJoinReaction = [3, 5].includes(reactionType) || ["/-heart", "❤️", "❤", "/heart"].includes(reactionIcon);
  if (!room || room.phase !== "lobby" || !isJoinReaction || !reactedId || reactedId !== lobbyId) return false;
  const senderId = data.uidFrom;
  if (!senderId) return false;
  await joinRoom(api, {
    type: MessageType.GroupMessage,
    threadId: room.threadId,
    data: { uidFrom: senderId, dName: data.dName || senderId, content: "masoi join" },
  });
  return true;
}
