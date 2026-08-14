import Big from "big.js";
import { MessageType } from "../../../api-zalo/index.js";
import {
  addGameRankPoints,
  ensurePlayerAccount,
  getPlayerBalance,
  isPlayerBanned,
  updatePlayerBalance,
} from "../../../database/player.js";
import { isAdmin } from "../../../index.js";
import { createHorseRaceGif, createHorseRaceLobbyImage } from "../../../utils/canvas/horse-race.js";
import { formatCurrency, parseGameAmount, removeMention } from "../../../utils/format-util.js";
import { deleteFile } from "../../../utils/util.js";
import { getGlobalPrefix } from "../../service.js";
import { getUserInfoAcrossBots } from "../../info-service/user-info.js";

const TIME_TO_LIVE = 10 * 60 * 1000;
const LOBBY_TIMEOUT_MS = 5 * 60 * 1000;
const MIN_BET = new Big(1000);
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const REACTION_DEDUP_MS = 5000;

// Mỗi tài khoản bot chỉ mở một phòng trong một nhóm. Các Map này dùng chung cho
// command và event reaction trong cùng tiến trình bot.
const rooms = new Map();
const lobbyReactions = new Map();
const recentReactions = new Map();

function normalizeId(value) {
  return String(value ?? "");
}

function roomKey(botId, threadId) {
  return `${normalizeId(botId)}:${normalizeId(threadId)}`;
}

function getInitials(name) {
  return (
    String(name || "?")
      .trim()
      .split(/\s+/)
      .slice(-2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "?"
  );
}

function extractMsgId(sent) {
  return normalizeId(
    sent?.message?.msgId ??
      sent?.msgId ??
      sent?.attachment?.[0]?.msgId ??
      sent?.attachments?.[0]?.msgId ??
      sent?.data?.msgId ??
      (Array.isArray(sent) ? sent[0]?.msgId : "") ??
      ""
  );
}

function extractCliMsgId(sent) {
  return normalizeId(
    sent?.message?.cliMsgId ??
      sent?.cliMsgId ??
      sent?.attachment?.[0]?.cliMsgId ??
      sent?.attachment?.[0]?.clientId ??
      sent?.attachments?.[0]?.cliMsgId ??
      sent?.attachments?.[0]?.clientId ??
      sent?.data?.cliMsgId ??
      (Array.isArray(sent) ? sent[0]?.cliMsgId ?? sent[0]?.clientId : "") ??
      ""
  );
}

async function sendGroupText(api, room, msg, options = {}) {
  return api.sendMessage(
    { msg, ttl: options.ttl ?? TIME_TO_LIVE, mentions: options.mentions || [], quote: options.quote },
    room.threadId,
    MessageType.GroupMessage
  );
}

async function reply(api, message, msg, ttl = TIME_TO_LIVE) {
  return api.sendMessage({ msg, quote: message, ttl }, message.threadId, message.type);
}

async function resolvePlayer(api, uid, fallbackName) {
  const info = await getUserInfoAcrossBots(api, uid).catch(() => null);
  const name = info?.name || fallbackName || "Tay đua";
  return {
    uid: normalizeId(uid),
    name,
    initials: getInitials(name),
    avatar: info?.avatarFull || info?.avatar || null,
    joinedAt: Date.now(),
  };
}

function removeRoom(room) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
  rooms.delete(room.key);
  if (room.lobbyMsgId) lobbyReactions.delete(room.lobbyMsgId);
}

async function recallLobby(api, room) {
  if (room.lobbyMsgId) lobbyReactions.delete(room.lobbyMsgId);
  const ref = room.lobbyMsgRef;
  room.lobbyMsgId = null;
  room.lobbyMsgRef = null;
  if (!ref?.msgId || !ref?.cliMsgId) return;
  try {
    await api.undoMessage({
      type: MessageType.GroupMessage,
      threadId: room.threadId,
      data: { quote: { globalMsgId: ref.msgId, cliMsgId: ref.cliMsgId } },
    });
  } catch (error) {
    console.error("[DUA-NGUA] Không thu hồi được ảnh phòng cũ:", error?.message || error);
  }
}

async function sendLobbySnapshotInner(api, room, { recall = true } = {}) {
  if (recall) await recallLobby(api, room);
  let imagePath;
  try {
    imagePath = await createHorseRaceLobbyImage({
      hostName: room.hostName,
      betLabel: formatCurrency(room.betAmount),
      players: room.players,
      maxPlayers: MAX_PLAYERS,
    });
    const prefix = getGlobalPrefix(room.botId);
    const sent = await api.sendMessage(
      {
        msg:
          `🏇 PHÒNG ĐUA NGỰA — cược ${formatCurrency(room.betAmount)} VNĐ/người\n` +
          `❤️ Thả tim ảnh này để vào phòng (${room.players.length}/${MAX_PLAYERS}).\n` +
          `👑 Chủ phòng dùng ${prefix}duangua start để bắt đầu.`,
        attachments: [imagePath],
        ttl: TIME_TO_LIVE,
      },
      room.threadId,
      MessageType.GroupMessage
    );
    const msgId = extractMsgId(sent);
    const cliMsgId = extractCliMsgId(sent);
    room.lobbyMsgId = msgId || null;
    room.lobbyMsgRef = msgId && cliMsgId ? { msgId, cliMsgId } : null;
    if (msgId && room.status === "waiting") lobbyReactions.set(msgId, room.key);
    return sent;
  } finally {
    if (imagePath) await deleteFile(imagePath).catch(() => {});
  }
}

// Xếp hàng ảnh phòng để nhiều reaction gần nhau không gửi ảnh song song/trùng clientId.
function sendLobbySnapshot(api, room, options = {}) {
  const previous = room.snapshotQueue || Promise.resolve();
  const current = previous.catch(() => {}).then(() => sendLobbySnapshotInner(api, room, options));
  room.snapshotQueue = current;
  return current;
}

function scheduleLobbyTimeout(api, room) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = setTimeout(async () => {
    if (rooms.get(room.key) !== room || room.status !== "waiting") return;
    await recallLobby(api, room);
    removeRoom(room);
    await sendGroupText(api, room, "⌛ Phòng đua ngựa đã tự hủy vì quá 5 phút chưa bắt đầu.", { ttl: 60_000 }).catch(
      () => {}
    );
  }, LOBBY_TIMEOUT_MS);
  room.timer.unref?.();
}

async function addPlayer(api, room, uid, fallbackName) {
  const playerId = normalizeId(uid);
  if (room.status !== "waiting") return { success: false, message: "Cuộc đua đã bắt đầu rồi." };
  if (room.players.some((player) => player.uid === playerId)) {
    return { success: false, message: "Bạn đã ở trong phòng đua rồi." };
  }
  if (room.players.length >= MAX_PLAYERS) return { success: false, message: "Phòng đã đủ 8 tay đua." };

  // Giữ chỗ trước mọi await để hai webhook reaction trùng nhau không thêm một người hai lần.
  const placeholder = { uid: playerId, name: fallbackName || playerId, initials: "?", avatar: null, joinedAt: Date.now() };
  room.players.push(placeholder);
  try {
    if (await isPlayerBanned(playerId)) throw new Error("PLAYER_BANNED");
    await ensurePlayerAccount(playerId, fallbackName || playerId, room.botId);
    const balance = await getPlayerBalance(playerId);
    if (!balance.success || new Big(balance.balance).lt(room.betAmount)) throw new Error("NOT_ENOUGH_BALANCE");

    const profile = await resolvePlayer(api, playerId, fallbackName);
    Object.assign(placeholder, profile);
    return { success: true, player: placeholder };
  } catch (error) {
    const index = room.players.indexOf(placeholder);
    if (index !== -1) room.players.splice(index, 1);
    if (error?.message === "PLAYER_BANNED") return { success: false, message: "Tài khoản game của bạn đã bị khóa." };
    if (error?.message === "NOT_ENOUGH_BALANCE") {
      return {
        success: false,
        message: `Bạn không đủ ${formatCurrency(room.betAmount)} VNĐ để vào phòng.`,
      };
    }
    console.error("[DUA-NGUA] Lỗi thêm người chơi:", error);
    return { success: false, message: "Không thể ghi danh vào phòng lúc này." };
  }
}

async function notifyJoinFailure(api, room, uid, name, message) {
  const directSent = await api
    .sendMessage({ msg: `❌ ${message}`, ttl: 60_000 }, uid, MessageType.DirectMessage)
    .then(() => true)
    .catch(() => false);
  if (directSent) return;
  const prefix = `⚠️ `;
  await sendGroupText(api, room, `${prefix}${name}: ${message}`, {
    ttl: 60_000,
    mentions: [{ uid, pos: prefix.length, len: name.length }],
  }).catch(() => {});
}

async function createRoom(api, message, betText) {
  const botId = normalizeId(api.getBotId());
  const threadId = normalizeId(message.threadId);
  const key = roomKey(botId, threadId);
  const senderId = normalizeId(message.data.uidFrom);
  const senderName = message.data.dName || senderId;

  const joinExistingRoom = async (room) => {
    const result = await addPlayer(api, room, senderId, senderName);
    if (!result.success) return reply(api, message, `❌ ${result.message}`);
    await reply(api, message, `✅ ${result.player.name} đã vào phòng đua (${room.players.length}/${MAX_PLAYERS}).`);
    await sendLobbySnapshot(api, room);
  };

  if (rooms.has(key)) {
    await joinExistingRoom(rooms.get(key));
    return;
  }
  if (await isPlayerBanned(senderId)) {
    await reply(api, message, "❌ Tài khoản game của bạn đã bị khóa.");
    return;
  }
  await ensurePlayerAccount(senderId, senderName, botId);
  const balance = await getPlayerBalance(senderId);
  if (!balance.success) {
    await reply(api, message, `❌ ${balance.message}`);
    return;
  }

  let betAmount;
  try {
    const parsed = parseGameAmount(betText, balance.balance);
    betAmount = parsed === "allin" ? new Big(balance.balance) : new Big(parsed);
  } catch {
    await reply(api, message, "❌ Số tiền cược không hợp lệ. Ví dụ: duangua 10k hoặc duangua 1m.");
    return;
  }
  if (betAmount.lt(MIN_BET)) {
    await reply(api, message, `❌ Tiền cược tối thiểu là ${formatCurrency(MIN_BET)} VNĐ.`);
    return;
  }
  if (betAmount.gt(new Big(balance.balance))) {
    await reply(api, message, "❌ Bạn không đủ số dư để tạo phòng với mức cược này.");
    return;
  }

  const host = await resolvePlayer(api, senderId, senderName);
  if (rooms.has(key)) {
    await joinExistingRoom(rooms.get(key));
    return;
  }
  const room = {
    key,
    botId,
    threadId,
    hostId: senderId,
    hostName: host.name,
    betAmount,
    players: [host],
    status: "waiting",
    createdAt: Date.now(),
    lobbyMsgId: null,
    lobbyMsgRef: null,
    timer: null,
    snapshotQueue: null,
  };
  rooms.set(key, room);
  try {
    await sendLobbySnapshot(api, room, { recall: false });
    scheduleLobbyTimeout(api, room);
  } catch (error) {
    removeRoom(room);
    console.error("[DUA-NGUA] Lỗi tạo phòng:", error);
    await reply(api, message, "❌ Không gửi được ảnh phòng đua ngựa lúc này.");
  }
}

async function validatePlayers(room) {
  const eligible = [];
  const removed = [];
  for (const player of room.players) {
    const balance = await getPlayerBalance(player.uid);
    if (balance.success && new Big(balance.balance).gte(room.betAmount)) eligible.push(player);
    else removed.push(player);
  }
  return { eligible, removed };
}

async function settleRace(room, winner) {
  const losers = room.players.filter((player) => player.uid !== winner.uid);
  const winnerProfit = room.betAmount.mul(losers.length);
  const applied = [];

  try {
    for (const loser of losers) {
      const result = await updatePlayerBalance(loser.uid, room.betAmount.neg().toString());
      if (!result.success) throw new Error(`Không trừ được tiền của ${loser.name}`);
      applied.push({ uid: loser.uid, delta: room.betAmount.neg() });
    }
    const winnerResult = await updatePlayerBalance(winner.uid, winnerProfit.toString());
    if (!winnerResult.success) throw new Error(`Không cộng được tiền cho ${winner.name}`);
    applied.push({ uid: winner.uid, delta: winnerProfit });
  } catch (error) {
    for (const item of applied.reverse()) {
      const rollback = await updatePlayerBalance(item.uid, item.delta.neg().toString()).catch(() => null);
      if (!rollback?.success) console.error(`[DUA-NGUA] Không hoàn tác được số dư của ${item.uid}`);
    }
    throw error;
  }

  // Ghi thống kê sau khi toàn bộ tiền đã chuyển thành công; lỗi thống kê không ảnh hưởng kết quả cược.
  await Promise.allSettled([
    ...losers.map((loser) => updatePlayerBalance(loser.uid, "0", false, room.betAmount.neg().toString())),
    updatePlayerBalance(winner.uid, "0", true, winnerProfit.toString()),
    ...losers.map((loser) => addGameRankPoints(loser.uid, { won: false })),
    addGameRankPoints(winner.uid, { won: true }),
  ]);
  return winnerProfit;
}

function buildResultMessage(room, ranking, winnerProfit) {
  let msg = `🏁 KẾT QUẢ ĐUA NGỰA\n💰 Cược: ${formatCurrency(room.betAmount)} VNĐ/người\n\n`;
  const mentions = [];
  const medals = ["🥇", "🥈", "🥉"];
  ranking.forEach((player, index) => {
    const prefix = `${medals[index] || `${index + 1}.`} `;
    const pos = msg.length + prefix.length;
    msg += `${prefix}${player.name}`;
    if (index === 0) msg += `  +${formatCurrency(winnerProfit)} VNĐ`;
    else msg += `  -${formatCurrency(room.betAmount)} VNĐ`;
    msg += "\n";
    mentions.push({ uid: player.uid, pos, len: player.name.length });
  });
  msg += "\n🏆 Người về nhất ăn toàn bộ tiền cược của các đối thủ.";
  return { msg, mentions };
}

async function startRace(api, message, room) {
  const senderId = normalizeId(message.data.uidFrom);
  if (senderId !== room.hostId) {
    await reply(api, message, "❌ Chỉ chủ phòng mới được bắt đầu cuộc đua.");
    return;
  }
  if (room.status !== "waiting") {
    await reply(api, message, "⚠️ Cuộc đua đang chạy rồi.");
    return;
  }
  if (room.players.length < MIN_PLAYERS) {
    await reply(api, message, "⚠️ Cần ít nhất 2 người. Hãy bảo thành viên thả ❤️ vào ảnh phòng.");
    return;
  }

  room.status = "racing";
  const { eligible, removed } = await validatePlayers(room);
  if (removed.some((player) => player.uid === room.hostId)) {
    room.status = "waiting";
    await reply(api, message, "❌ Chủ phòng không còn đủ tiền cược để bắt đầu.");
    return;
  }
  room.players = eligible;
  if (removed.length) {
    await sendGroupText(
      api,
      room,
      `⚠️ Đã loại vì không còn đủ tiền cược: ${removed.map((player) => player.name).join(", ")}`,
      { ttl: 60_000 }
    );
  }
  if (room.players.length < MIN_PLAYERS) {
    room.status = "waiting";
    await sendLobbySnapshot(api, room);
    await reply(api, message, "⚠️ Không còn đủ 2 người có số dư hợp lệ để bắt đầu.");
    return;
  }

  let gifPath;
  let paid = false;
  try {
    await sendGroupText(api, room, `🏇 Đang đưa ${room.players.length} tay đua vào vạch xuất phát...`, {
      quote: message,
      ttl: 60_000,
    });
    const race = await createHorseRaceGif(room.players);
    gifPath = race.gifPath;
    const winnerProfit = await settleRace(room, race.ranking[0]);
    paid = true;

    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    await recallLobby(api, room);
    await api.sendMessage(
      {
        msg: "🏁 XUẤT PHÁT!",
        attachments: [gifPath],
        ttl: TIME_TO_LIVE,
        isUseProphylactic: true,
      },
      room.threadId,
      MessageType.GroupMessage
    );
    await new Promise((resolve) => setTimeout(resolve, race.durationMs));
    const result = buildResultMessage(room, race.ranking, winnerProfit);
    await sendGroupText(api, room, result.msg, { mentions: result.mentions });
    removeRoom(room);
  } catch (error) {
    console.error("[DUA-NGUA] Lỗi bắt đầu cuộc đua:", error);
    if (paid) {
      removeRoom(room);
      await sendGroupText(api, room, "⚠️ Tiền thưởng đã được xử lý nhưng bot không gửi được đầy đủ GIF/kết quả.").catch(
        () => {}
      );
    } else {
      room.status = "waiting";
      scheduleLobbyTimeout(api, room);
      if (!room.lobbyMsgId) await sendLobbySnapshot(api, room, { recall: false }).catch(() => {});
      await reply(api, message, "❌ Không thể bắt đầu hoặc chuyển tiền cược. Phòng vẫn được giữ nguyên.");
    }
  } finally {
    if (gifPath) await deleteFile(gifPath).catch(() => {});
  }
}

async function leaveRoom(api, message, room) {
  const senderId = normalizeId(message.data.uidFrom);
  if (room.status !== "waiting") return reply(api, message, "❌ Cuộc đua đã bắt đầu, không thể rời phòng.");
  if (senderId === room.hostId) return reply(api, message, "⚠️ Chủ phòng hãy dùng duangua huy để đóng phòng.");
  const index = room.players.findIndex((player) => player.uid === senderId);
  if (index === -1) return reply(api, message, "⚠️ Bạn chưa ở trong phòng đua.");
  room.players.splice(index, 1);
  await sendLobbySnapshot(api, room);
}

async function cancelRoom(api, message, room) {
  const senderId = normalizeId(message.data.uidFrom);
  if (senderId !== room.hostId && !isAdmin(room.botId, senderId, room.threadId)) {
    await reply(api, message, "❌ Chỉ chủ phòng hoặc admin mới được hủy phòng.");
    return;
  }
  if (room.status !== "waiting") {
    await reply(api, message, "❌ Cuộc đua đang chạy, không thể hủy.");
    return;
  }
  await recallLobby(api, room);
  removeRoom(room);
  await reply(api, message, "✅ Đã hủy phòng đua ngựa.", 60_000);
}

function guide(prefix) {
  return (
    `🏇 ĐUA NGỰA — tiền ảo, không quy đổi tiền mặt\n\n` +
    `• ${prefix}duangua <tiền>: tạo phòng (VD: ${prefix}duangua 10k)\n` +
    `• Thả ❤️ vào ảnh phòng để tham gia\n` +
    `• ${prefix}duangua start: chủ phòng bắt đầu\n` +
    `• ${prefix}duangua roi: rời phòng\n` +
    `• ${prefix}duangua huy: hủy phòng\n\n` +
    `Từ 2–${MAX_PLAYERS} người; người về nhất ăn tiền cược của tất cả đối thủ.`
  );
}

export async function handleHorseRaceCommand(api, message) {
  const prefix = getGlobalPrefix(api.getBotId());
  if (message.type !== MessageType.GroupMessage) {
    await reply(api, message, "⚠️ Lệnh đua ngựa chỉ sử dụng trong nhóm.");
    return;
  }

  const content = removeMention(message).trim();
  const parts = content.split(/\s+/);
  const sub = (parts[1] || "").toLowerCase();
  const key = roomKey(api.getBotId(), message.threadId);
  const room = rooms.get(key);

  if (["start", "batdau"].includes(sub)) {
    if (!room) return reply(api, message, `⚠️ Chưa có phòng. Tạo bằng ${prefix}duangua 10k.`);
    return startRace(api, message, room);
  }
  if (["huy", "cancel"].includes(sub)) {
    if (!room) return reply(api, message, "⚠️ Nhóm chưa có phòng đua ngựa.");
    return cancelRoom(api, message, room);
  }
  if (["roi", "leave"].includes(sub)) {
    if (!room) return reply(api, message, "⚠️ Nhóm chưa có phòng đua ngựa.");
    return leaveRoom(api, message, room);
  }
  if (["xem", "status"].includes(sub)) {
    if (!room) return reply(api, message, "⚠️ Nhóm chưa có phòng đua ngựa.");
    return sendLobbySnapshot(api, room);
  }
  if (!sub || ["help", "hd"].includes(sub)) return reply(api, message, guide(prefix));
  return createRoom(api, message, parts.slice(1).join(" "));
}

export async function handleHorseRaceReaction(api, reaction) {
  const msgId = normalizeId(reaction.data?.content?.rMsg?.[0]?.gMsgID || "");
  const reactionType = reaction.data?.content?.rType;
  if (!msgId || reactionType !== 5) return false;
  const key = lobbyReactions.get(msgId);
  const room = key ? rooms.get(key) : null;
  if (!room || room.botId !== normalizeId(api.getBotId())) return false;

  const senderId = normalizeId(reaction.data.uidFrom);
  const dedupKey = `${msgId}:${senderId}`;
  const now = Date.now();
  if (now - (recentReactions.get(dedupKey) || 0) < REACTION_DEDUP_MS) return true;
  recentReactions.set(dedupKey, now);
  if (recentReactions.size > 500) {
    for (const [entryKey, time] of recentReactions) {
      if (now - time > REACTION_DEDUP_MS) recentReactions.delete(entryKey);
    }
  }

  let name = senderId;
  try {
    const info = await api.getInfoMembers([senderId]);
    const profile = info?.profiles?.[senderId];
    name = profile?.zaloName || profile?.displayName || senderId;
  } catch {}

  const result = await addPlayer(api, room, senderId, name);
  if (result.success) await sendLobbySnapshot(api, room);
  else await notifyJoinFailure(api, room, senderId, name, result.message);
  return true;
}

// Chỉ phục vụ kiểm thử tự động/chẩn đoán.
export const __horseRaceDebug = { rooms, lobbyReactions, recentReactions };
