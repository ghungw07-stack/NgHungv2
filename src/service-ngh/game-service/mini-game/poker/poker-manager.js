// Game manager: room-per-thread state, phases, dispatch.
// Hỗ trợ 1v1 vs bot HOẶC PvP 2-6 người. Integrate VND qua getPlayerBalance/updatePlayerBalance.

import { buildDeck, shuffle, evaluateBest, compareHands, HAND_NAME_VI, cardToString } from "./poker-core.js";
import { renderTable, renderShowdown, renderPrivateHand, fmtMoney } from "./poker-canvas.js";
import { getPlayerBalance, updatePlayerBalance, isHaveLoginAccount } from "../../../../database/player.js";
import {
  sendMessageComplete,
  sendMessageFailed,
  sendMessageWarning,
  getNameServer,
  COLOR_RED,
  SIZE_18,
  IS_BOLD,
} from "../../../chat-zalo/chat-style/chat-style.js";
import { MultiMsgStyle, MessageStyle } from "../../../../api-zalo/index.js";
import { MessageType, MessageMention } from "../../../../api-zalo/index.js";
import { deleteFile } from "../../../../utils/util.js";
import { jobSendClock } from "../../../../commands/manager-command/check-countdown.js";
import { getGlobalPrefix } from "../../../service.js";

// Lấy "{prefix}{aliasCommand}" dùng cho message (vd: "!poker", ".poker"...)
function cmdPrefix(api) {
  return `${getGlobalPrefix(api.getBotId())}poker`;
}

const PHASE = {
  WAITING: "waiting",   // chờ join + start
  PREFLOP: "preflop",   // chia 2 lá hole, betting round 1
  FLOP: "flop",         // 3 lá community, betting round 2
  TURN: "turn",         // 1 lá thêm, betting round 3
  RIVER: "river",       // 1 lá cuối, betting round 4
  SHOWDOWN: "showdown", // so bài, kết thúc
};

const MAX_PLAYERS = 6;
const MIN_BET_DEFAULT = 1000;
const TURN_TIMEOUT_MS = 60_000;
const JOIN_TIMEOUT_MS = 120_000;

// rooms: Map<threadId, RoomState>
const rooms = new Map();

function newRoom({ threadId, hostId, hostName, minBet, vsBot }) {
  return {
    threadId,
    hostId,
    hostName,
    minBet,
    vsBot, // bool: nếu true thì bot tự join làm đối thủ
    phase: PHASE.WAITING,
    players: [], // [{ userId, name, holeCards, bet, totalBet, balance, folded, allIn, hasActed }]
    deck: [],
    communityCards: [],
    pot: 0,
    currentBet: 0,   // mức bet cao nhất trong vòng hiện tại (cho call/raise)
    currentTurnIdx: 0,
    actionsThisRound: 0,
    createdAt: Date.now(),
    turnTimer: null,
    joinTimer: null,
  };
}

function getRoom(threadId) {
  return rooms.get(threadId);
}

// Check thread có room poker (đang chờ hoặc đang chơi)
export function hasRoomInThread(threadId) {
  return rooms.has(threadId);
}

// Check user có phải player trong room của thread đó
export function isPlayerInRoom(threadId, userId) {
  const room = rooms.get(threadId);
  if (!room) return false;
  return room.players.some((p) => p.userId === userId && !p.isBot);
}

function deleteRoom(threadId) {
  const r = rooms.get(threadId);
  if (r) {
    if (r.turnTimer) clearTimeout(r.turnTimer);
    if (r.joinTimer) clearTimeout(r.joinTimer);
  }
  rooms.delete(threadId);
}

// ===== Public commands =====

export async function createRoom(api, message, minBet, vsBot = false) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;

  if (rooms.has(threadId)) {
    await sendMessageWarning(api, message, `Group này đã có bàn poker đang mở. Dùng ${cmdPrefix(api)} info để xem.`, true, 60000);
    return;
  }

  if (!(await isHaveLoginAccount(senderId))) {
    await sendMessageWarning(api, message, "Bạn cần đăng nhập tài khoản trước (dùng lệnh đăng nhập).", true, 60000);
    return;
  }
  const bal = await getPlayerBalance(senderId);
  if (!bal || Number(bal.balance) < minBet) {
    await sendMessageWarning(api, message, `Số dư không đủ. Cần ít nhất ${fmtMoney(minBet)} VND để vào bàn.`, true, 60000);
    return;
  }

  const room = newRoom({ threadId, hostId: senderId, hostName: senderName, minBet, vsBot });
  rooms.set(threadId, room);

  // host tự join
  await addPlayerToRoom(api, room, senderId, senderName);

  if (vsBot) {
    // Thêm bot vào ngay
    addBotPlayer(room);
    await sendMessageComplete(
      api,
      message,
      `Đã tạo bàn 1v1 vs Bot. Min bet: ${fmtMoney(minBet)} VND.\n` +
        `Dùng ${cmdPrefix(api)} start để bắt đầu.`,
      true,
      120000
    );
  } else {
    await sendMessageComplete(
      api,
      message,
      `Đã tạo bàn Poker. Min bet: ${fmtMoney(minBet)} VND.\n` +
        `Player khác dùng ${cmdPrefix(api)} join để vào. Host dùng ${cmdPrefix(api)} start để bắt đầu (cần ≥2 người).`,
      true,
      120000
    );
    // Tự huỷ sau 2 phút nếu không start
    room.joinTimer = setTimeout(() => {
      if (room.phase === PHASE.WAITING) {
        deleteRoom(threadId);
      }
    }, JOIN_TIMEOUT_MS);
  }
}

export async function joinRoom(api, message) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const room = getRoom(threadId);
  if (!room) {
    await sendMessageWarning(api, message, `Group này chưa có bàn poker. Dùng ${cmdPrefix(api)} create <bet> để tạo.`, true, 60000);
    return;
  }
  if (room.phase !== PHASE.WAITING) {
    await sendMessageWarning(api, message, "Bàn đã bắt đầu, không thể join giữa chừng.", true, 60000);
    return;
  }
  if (room.vsBot) {
    await sendMessageWarning(api, message, "Bàn 1v1 vs Bot đã đủ người chơi.", true, 60000);
    return;
  }
  if (room.players.some((p) => p.userId === senderId)) {
    await sendMessageWarning(api, message, "Bạn đã có trong bàn.", true, 60000);
    return;
  }
  if (room.players.length >= MAX_PLAYERS) {
    await sendMessageWarning(api, message, "Bàn đã đầy.", true, 60000);
    return;
  }
  if (!(await isHaveLoginAccount(senderId))) {
    await sendMessageWarning(api, message, "Bạn cần đăng nhập tài khoản trước.", true, 60000);
    return;
  }
  const bal = await getPlayerBalance(senderId);
  if (!bal || Number(bal.balance) < room.minBet) {
    await sendMessageWarning(api, message, `Số dư không đủ. Cần ít nhất ${fmtMoney(room.minBet)} VND.`, true, 60000);
    return;
  }
  await addPlayerToRoom(api, room, senderId, senderName);
  await sendMessageComplete(
    api,
    message,
    `${senderName} đã join bàn. Hiện có ${room.players.length}/${MAX_PLAYERS} người.`,
    true,
    60000
  );
}

export async function leaveRoom(api, message) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const room = getRoom(threadId);
  if (!room) return;
  if (room.phase !== PHASE.WAITING) {
    await sendMessageWarning(api, message, `Không thể rời bàn khi game đang diễn ra (dùng ${cmdPrefix(api)} fold).`, true, 60000);
    return;
  }
  const idx = room.players.findIndex((p) => p.userId === senderId);
  if (idx === -1) return;
  room.players.splice(idx, 1);
  if (room.players.length === 0) {
    deleteRoom(threadId);
    await sendMessageComplete(api, message, "Bàn đã được hủy (không còn người chơi).", true, 60000);
  } else {
    await sendMessageComplete(api, message, "Bạn đã rời bàn.", true, 60000);
  }
}

export async function startGame(api, message) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const room = getRoom(threadId);
  if (!room) {
    await sendMessageWarning(api, message, "Group này chưa có bàn poker.", true, 60000);
    return;
  }
  if (room.hostId !== senderId) {
    await sendMessageWarning(api, message, "Chỉ host (người tạo bàn) mới được start.", true, 60000);
    return;
  }
  if (room.phase !== PHASE.WAITING) {
    await sendMessageWarning(api, message, "Bàn đã bắt đầu rồi.", true, 60000);
    return;
  }
  if (room.players.length < 2) {
    await sendMessageWarning(api, message, "Cần ít nhất 2 người chơi để bắt đầu.", true, 60000);
    return;
  }
  if (room.joinTimer) {
    clearTimeout(room.joinTimer);
    room.joinTimer = null;
  }
  await beginPreflop(api, message, room);
}

export async function actionFold(api, message) {
  return await handleAction(api, message, "fold");
}
export async function actionCheck(api, message) {
  return await handleAction(api, message, "check");
}
export async function actionCall(api, message) {
  return await handleAction(api, message, "call");
}
export async function actionRaise(api, message, raiseAmount) {
  return await handleAction(api, message, "raise", raiseAmount);
}
export async function actionAllIn(api, message) {
  return await handleAction(api, message, "allin");
}

// User chủ động xin bot gửi lại bài riêng (dùng khi DM đầu game không tới do chưa kết bạn).
export async function sendMyHandAgain(api, message) {
  try {
    await api.addReaction("HEART", message);
  } catch {}
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const room = getRoom(threadId);
  if (!room) {
    await sendMessageWarning(api, message, "Group này chưa có bàn poker đang chạy.", true, 60000);
    return;
  }
  if (room.phase === PHASE.WAITING) {
    await sendMessageWarning(api, message, "Bàn chưa bắt đầu — chưa có bài để gửi.", true, 60000);
    return;
  }
  const p = room.players.find((pl) => pl.userId === senderId);
  if (!p) {
    await sendMessageWarning(api, message, "Bạn không có trong bàn này.", true, 60000);
    return;
  }
  if (p.isBot || p.folded) {
    await sendMessageWarning(api, message, "Bạn đã fold hoặc không có bài.", true, 60000);
    return;
  }
  let imgPath = null;
  try {
    imgPath = await renderPrivateHand({
      playerName: p.name,
      holeCards: p.holeCards,
      communityCards: room.communityCards,
      phase: room.phase,
    });
    const res = await api.sendMessage(
      {
        msg: `🃏 Bài riêng của bạn — bàn ${room.threadId.slice(-4)} (${room.phase}).`,
        attachments: [imgPath],
        ttl: 600000,
      },
      p.userId,
      MessageType.DirectMessage
    );
    const ok = !!(res?.message?.msgId || res?.attachment?.[0]?.msgId);
    if (ok) {
      await sendMessageComplete(api, message, `✅ Đã gửi lại bài riêng cho ${p.name} qua tin nhắn riêng.`, true, 60000);
    } else {
      throw new Error("DM không tới");
    }
  } catch (e) {
    // DM fail -> gửi friend request lại + hướng dẫn user
    if (typeof api.sendFriendRequest === "function") {
      api
        .sendFriendRequest(p.userId, `Hãy kết bạn để mình gửi bài poker riêng cho bạn ${p.name}.`)
        .catch(() => {});
    }
    await sendMessageWarning(
      api,
      message,
      `❌ Không gửi được DM cho ${p.name}.\n` +
        `Vui lòng kết bạn với bot trước (mình đã gửi lời mời), sau đó dùng ${cmdPrefix(api)} mybai để xin lại.`,
      true,
      120000
    );
  } finally {
    if (imgPath) setTimeout(() => deleteFile(imgPath).catch(() => {}), 1000);
  }
}

export async function showInfo(api, message) {
  const threadId = message.threadId;
  const room = getRoom(threadId);
  if (!room) {
    await sendMessageWarning(api, message, "Group này chưa có bàn poker.", true, 60000);
    return;
  }
  const playerList = room.players
    .map((p, i) => `${i + 1}. ${p.name}${p.userId === "_bot_" ? " 🤖" : ""}${p.folded ? " [FOLD]" : ""}`)
    .join("\n");
  await sendMessageComplete(
    api,
    message,
    `📊 Bàn Poker — Phase: ${room.phase}\n` +
      `💰 Pot: ${fmtMoney(room.pot)} VND | Min bet: ${fmtMoney(room.minBet)} VND\n` +
      `👥 Players (${room.players.length}/${MAX_PLAYERS}):\n${playerList}`,
    false,
    120000
  );
}

// ===== Internal =====

async function addPlayerToRoom(api, room, userId, name) {
  const balResp = await getPlayerBalance(userId);
  const balance = balResp ? Number(balResp.balance) : 0;
  room.players.push({
    userId,
    name,
    holeCards: [],
    bet: 0,
    totalBet: 0,
    balance,
    folded: false,
    allIn: false,
    hasActed: false,
    isBot: false,
  });
  // Chủ động gửi friend request để khi vào ván DM bài riêng chắc chắn nhận được.
  // Fire-and-forget; nếu user đã kết bạn / đã reject thì Zalo sẽ no-op hoặc error im lặng.
  if (api && typeof api.sendFriendRequest === "function") {
    api
      .sendFriendRequest(
        userId,
        `Chào ${name}! Mình là bot poker, hãy kết bạn để mình gửi bài riêng cho bạn khi vào ván.`
      )
      .catch(() => {});
  }
}

function addBotPlayer(room) {
  room.players.push({
    userId: "_bot_",
    name: "Bot Dealer",
    holeCards: [],
    bet: 0,
    totalBet: 0,
    balance: 1_000_000_000, // bot luôn đủ tiền
    folded: false,
    allIn: false,
    hasActed: false,
    isBot: true,
  });
}

async function beginPreflop(api, message, room) {
  room.phase = PHASE.PREFLOP;
  room.deck = shuffle(buildDeck());
  room.communityCards = [];
  room.pot = 0;
  room.currentBet = room.minBet;

  // Refresh balance từ DB cho mọi player thật (tránh stale data từ lúc join)
  for (const p of room.players) {
    if (p.isBot) continue;
    try {
      const fresh = await getPlayerBalance(p.userId);
      if (fresh && fresh.balance != null) p.balance = Number(fresh.balance);
    } catch {}
  }

  // Trừ tiền cược tối thiểu (ante) — mỗi người ăn 1 minBet vào pot
  for (const p of room.players) {
    const ante = Math.min(room.minBet, p.balance);
    p.bet = ante;
    p.totalBet = ante;
    p.balance -= ante;
    room.pot += ante;
    if (p.balance === 0) p.allIn = true;
    if (!p.isBot && ante > 0) {
      await updatePlayerBalance(p.userId, -ante);
    }
    // Chia 2 lá hole
    p.holeCards = [room.deck.pop(), room.deck.pop()];
    p.folded = false;
    p.hasActed = false;
    p.allIn = p.allIn || p.balance === 0;
  }

  room.currentTurnIdx = 0;
  room.actionsThisRound = 0;

  // DM bài riêng cho từng người chơi (không gửi cho bot)
  await sendPrivateHandsToAll(api, message, room, "preflop");

  // Gộp canvas + announce + turn prompt vào 1 tin nhắn duy nhất
  const playerList = room.players.map((p) => p.name + (p.isBot ? " 🤖" : "")).join(", ");
  const preludeAnnounce =
    `🃏 PRE-FLOP — Ván bài bắt đầu!\n\n` +
    `👥 Người chơi: ${playerList}\n` +
    `💵 Mỗi người đã đặt ante: ${fmtMoney(room.minBet)} VND\n` +
    `💰 Pot khởi đầu: ${fmtMoney(room.pot)} VND\n\n` +
    `📨 Mỗi người đã được gửi 2 lá bài riêng.\n` +
    `🎯 Mỗi vòng tới lượt từng người: fold/check/call/raise/allin.`;

  // Render canvas một lần ở đây, truyền cho promptCurrentPlayer attach cùng prompt
  const renderPlayers = room.players.map((p) => ({
    userId: p.userId,
    name: p.name,
    holeCards: p.holeCards,
    hidden: !p.folded,
    folded: p.folded,
    bet: p.bet,
    balance: p.balance,
    isWinner: false,
    isCurrentTurn: false,
  }));
  if (renderPlayers[room.currentTurnIdx]) renderPlayers[room.currentTurnIdx].isCurrentTurn = true;
  const imagePath = await renderTable({
    players: renderPlayers,
    communityCards: room.communityCards,
    pot: room.pot,
    phase: room.phase,
    bigBlind: room.minBet,
    smallBlind: Math.floor(room.minBet / 2),
    showAllHoles: false,
  });

  room.pendingAttachment = imagePath;
  room.pendingPrelude = preludeAnnounce;
  await promptCurrentPlayer(api, message, room);
}

const DM_DELAY_MS = 1500;

async function sendPrivateHandsToAll(api, message, room, phase) {
  const failed = []; // những user không nhận được DM (chưa kết bạn / API fail)
  let first = true;
  for (const p of room.players) {
    if (p.isBot || p.folded) continue;
    if (!first) await new Promise((r) => setTimeout(r, DM_DELAY_MS));
    first = false;
    let imgPath = null;
    try {
      imgPath = await renderPrivateHand({
        playerName: p.name,
        holeCards: p.holeCards,
        communityCards: room.communityCards,
        phase,
      });
      const res = await api.sendMessage(
        {
          msg:
            `🃏 Bài riêng của bạn — bàn ${room.threadId.slice(-4)} (${phase}).\n` +
            `Hành động: fold / check / call / raise <amt> / allin / mybai`,
          attachments: [imgPath],
          ttl: 600000,
        },
        p.userId,
        MessageType.DirectMessage
      );
      // Kiểm tra DM có thực sự gửi được không (response có msgId)
      const ok = !!(res?.message?.msgId || res?.attachment?.[0]?.msgId);
      if (!ok) failed.push(p);
    } catch (e) {
      console.error(`[poker] DM bài cho ${p.name} fail:`, e?.message || e);
      failed.push(p);
    } finally {
      if (imgPath) setTimeout(() => deleteFile(imgPath).catch(() => {}), 1000);
    }
  }

  // Nếu có người không nhận được DM -> báo group + gửi friend request
  if (failed.length > 0) {
    const mentions = [];
    let text = "⚠️ Các bạn sau chưa nhận được bài (có thể chưa kết bạn với bot):\n";
    for (const p of failed) {
      const tag = `@${p.name}`;
      const pos = text.length;
      text += `   ${tag}\n`;
      mentions.push(MessageMention(p.userId, tag.length, pos, false));
    }
    text += `\n💡 Hãy kết bạn với bot, sau đó dùng ${cmdPrefix(api)} info để xem lại ván hoặc fold để rời.`;

    try {
      await api.sendMessage(
        { msg: text, mentions, ttl: 300000 },
        room.threadId,
        message.type
      );
    } catch {}

    // Tự gửi friend request để user dễ kết bạn (nếu API support)
    for (const p of failed) {
      try {
        if (typeof api.sendFriendRequest === "function") {
          await api.sendFriendRequest(
            p.userId,
            `Chào ${p.name}! Hãy kết bạn để mình gửi bài poker riêng cho bạn.`
          );
          await new Promise((r) => setTimeout(r, 500));
        }
      } catch (e) {
        console.error(`[poker] sendFriendRequest fail cho ${p.name}:`, e?.message || e);
      }
    }
  }
}

async function broadcastTable(api, message, room, showAll, customMsg = null) {
  const players = room.players.map((p) => ({
    userId: p.userId,
    name: p.name,
    holeCards: p.holeCards,
    hidden: !showAll && !p.folded, // hole ẩn (trừ showdown)
    folded: p.folded,
    bet: p.bet,
    balance: p.balance,
    isWinner: false,
    isCurrentTurn: false,
  }));
  // Đánh dấu lượt hiện tại
  if (room.phase !== PHASE.SHOWDOWN && room.phase !== PHASE.WAITING) {
    if (players[room.currentTurnIdx]) players[room.currentTurnIdx].isCurrentTurn = true;
  }

  const imagePath = await renderTable({
    players,
    communityCards: room.communityCards,
    pot: room.pot,
    phase: room.phase,
    bigBlind: room.minBet,
    smallBlind: Math.floor(room.minBet / 2),
    showAllHoles: showAll,
  });

  const defaultMsg = `🃏 Bàn Poker — ${room.phase.toUpperCase()}\n💰 Pot: ${fmtMoney(room.pot)} VND${
    !showAll ? "\n🔒 Bài hole đã được DM riêng cho từng người." : ""
  }`;
  await api.sendMessage(
    {
      msg: customMsg || defaultMsg,
      attachments: [imagePath],
      ttl: 600000,
    },
    room.threadId,
    message.type
  );
  setTimeout(() => deleteFile(imagePath).catch(() => {}), 1000);
}

async function promptCurrentPlayer(api, message, room) {
  const extraAttachment = room.pendingAttachment;
  const prelude = room.pendingPrelude;
  room.pendingAttachment = null;
  room.pendingPrelude = null;

  const flushPendingAttachment = async () => {
    if (!extraAttachment) return;
    try {
      const caption =
        prelude ||
        `🃏 Bàn Poker — ${room.phase.toUpperCase()}\n💰 Pot: ${fmtMoney(room.pot)} VND`;
      await api.sendMessage(
        { msg: caption, attachments: [extraAttachment], ttl: 600000 },
        room.threadId,
        message.type
      );
    } catch (e) {
      console.error("[poker] flush pending fail:", e?.message || e);
    } finally {
      setTimeout(() => deleteFile(extraAttachment).catch(() => {}), 1000);
    }
  };

  // Nếu không ai còn eligible để bet (tất cả allin/folded) -> fast-forward tới showdown
  const eligibleCount = room.players.filter((p) => !p.folded && !p.allIn).length;
  if (eligibleCount === 0) {
    await flushPendingAttachment();
    await fastForwardToShowdown(api, message, room);
    return;
  }

  // Skip fold/allin với safety counter
  let safety = 0;
  while (
    safety++ < room.players.length * 2 &&
    room.players[room.currentTurnIdx] &&
    (room.players[room.currentTurnIdx].folded || room.players[room.currentTurnIdx].allIn)
  ) {
    room.currentTurnIdx = (room.currentTurnIdx + 1) % room.players.length;
  }

  // Kiểm tra hết vòng (mọi người còn lại đã act và bet bằng currentBet)
  if (isBettingRoundComplete(room)) {
    await flushPendingAttachment();
    await advancePhase(api, message, room);
    return;
  }

  const p = room.players[room.currentTurnIdx];
  if (!p || p.folded || p.allIn) {
    await flushPendingAttachment();
    await fastForwardToShowdown(api, message, room);
    return;
  }

  if (p.isBot) {
    // Bot lượt đầu -> gửi canvas trước (để user thấy bàn ban đầu) rồi bot mới chơi
    await flushPendingAttachment();
    setTimeout(() => botMakeMove(api, message, room).catch((e) => console.error("[poker bot]", e)), 1500);
    return;
  }

  const toCall = Math.max(0, room.currentBet - p.bet);
  const actionLines = [];
  actionLines.push(`   ⛔ fold — Bỏ bài (mất ${fmtMoney(p.bet)} đã cược)`);
  if (toCall === 0) {
    actionLines.push(`   ✔️ check — Bỏ qua, không cược thêm`);
  } else {
    actionLines.push(`   ✅ call — Theo cược, trả ${fmtMoney(toCall)} VND`);
  }
  actionLines.push(`   ⬆️ raise <số> — Tố thêm (vd: raise 5000)`);
  actionLines.push(`   💯 allin — Tất tay (${fmtMoney(p.balance)} VND)`);

  const phaseLabel = {
    preflop: "Pre-flop",
    flop: "Flop",
    turn: "Turn",
    river: "River",
  }[room.phase] || room.phase;
  const tagText = `@${p.name}`;
  const caption =
    `🎯 ${phaseLabel} — Tới lượt ${tagText}!\n\n` +
    `💰 Pot hiện tại: ${fmtMoney(room.pot)} VND\n` +
    `🔥 Cược cao nhất bàn: ${fmtMoney(room.currentBet)} VND\n` +
    `🎲 Bạn đã đặt: ${fmtMoney(p.bet)} VND\n` +
    `💵 Số dư: ${fmtMoney(p.balance)} VND\n\n` +
    `Chọn 1 hành động (gõ lệnh):\n` +
    actionLines.join("\n") +
    `\n\n⏱️ Bạn có 60 giây — không kịp sẽ tự fold.`;

  const fullCaption = prelude ? `${prelude}\n\n${caption}` : caption;
  const isGroup = message.type === MessageType.GroupMessage;
  const nameServer = getNameServer(api);
  const headerOffset = isGroup ? p.name.length + 1 : 0;
  const style = MultiMsgStyle([MessageStyle(headerOffset, nameServer.length, COLOR_RED, SIZE_18, IS_BOLD)]);
  const msg = `${isGroup ? p.name + "\n" : ""}${nameServer}\n${fullCaption}`;
  const mentions = [];
  if (isGroup) mentions.push(MessageMention(p.userId, p.name.length, 0, false));
  const bodyStart = headerOffset + nameServer.length;
  const tagPos = msg.indexOf(tagText, bodyStart);
  if (tagPos >= 0) mentions.push(MessageMention(p.userId, tagText.length, tagPos, false));

  const sendPayload = {
    msg,
    mentions,
    style,
    ttl: TURN_TIMEOUT_MS,
    linkOn: false,
  };
  if (extraAttachment) sendPayload.attachments = [extraAttachment];
  const sent = await api.sendMessage(sendPayload, room.threadId, message.type);
  if (extraAttachment) setTimeout(() => deleteFile(extraAttachment).catch(() => {}), 1000);

  const promptMsgId = sent?.message?.msgId || sent?.attachment?.[0]?.msgId;
  const promptCliMsgId = sent?.message?.cliMsgId || sent?.attachment?.[0]?.cliMsgId;
  if (promptMsgId) {
    const reactTarget = {
      type: message.type,
      threadId: room.threadId,
      data: {
        cliMsgId: promptCliMsgId || Date.now().toString(),
        msgId: String(promptMsgId),
        uidFrom: api.getBotId(),
      },
    };
    room.reactTarget = reactTarget;
    room.countdownJobKey = jobSendClock.addJob(
      api,
      reactTarget,
      Math.floor(TURN_TIMEOUT_MS / 1000),
      `poker_turn_${room.threadId}`
    );
  } else {
    room.reactTarget = null;
    room.countdownJobKey = null;
  }

  // Auto fold sau timeout
  if (room.turnTimer) clearTimeout(room.turnTimer);
  room.turnTimer = setTimeout(async () => {
    if (rooms.get(room.threadId) === room && room.players[room.currentTurnIdx] === p && !p.folded) {
      p.folded = true;
      p.hasActed = true;
      // Stop countdown job + gỡ CLOCK khi timeout
      if (room.countdownJobKey) {
        jobSendClock.cancelJobByKey(room.countdownJobKey).catch(() => {});
        room.countdownJobKey = null;
      }
      if (room.reactTarget) {
        api.addReaction("UNDO", room.reactTarget).catch(() => {});
        room.reactTarget = null;
      }
      await afterAction(api, message, room);
    }
  }, TURN_TIMEOUT_MS);
}

async function botMakeMove(api, message, room) {
  if (!rooms.get(room.threadId)) return;
  const bot = room.players[room.currentTurnIdx];
  if (!bot || !bot.isBot) return;
  try {
    const toCall = Math.max(0, room.currentBet - bot.bet);
    const eva = evaluateBest(bot.holeCards, room.communityCards);
    const strength = eva.result.rank;

    let action;
    if (strength >= 5) {
      action = Math.random() < 0.3 ? "raise" : "call";
    } else if (strength >= 3) {
      action = toCall > 0 && Math.random() < 0.15 ? "fold" : "call";
    } else if (strength === 2) {
      action = toCall > bot.balance / 3 ? "fold" : "call";
    } else {
      if (toCall === 0) action = "check";
      else action = Math.random() < 0.6 ? "fold" : "call";
    }

    if (toCall === 0 && action === "call") action = "check";
    // Bot không đủ tiền call mà toCall > 0 -> chuyển allin
    if (action === "call" && bot.balance < toCall) action = "allin";

    let raiseAmt = 0;
    if (action === "raise") {
      raiseAmt = Math.min(room.minBet * 2, Math.max(0, bot.balance - toCall));
      // Nếu không đủ raise an toàn -> call hoặc fold
      if (raiseAmt < room.minBet) action = bot.balance > toCall ? "call" : "fold";
    }

    await applyAction(room, bot, action, raiseAmt);
    await afterAction(api, message, room);
  } catch (e) {
    console.error("[poker bot] error, force fold bot:", e?.message || e);
    // Force fold bot để không treo bàn
    if (bot && rooms.get(room.threadId) === room) {
      bot.folded = true;
      bot.hasActed = true;
      try {
        await afterAction(api, message, room);
      } catch {}
    }
  }
}

// Map action -> reaction name (ReactionMap keys)
const ACTION_REACTIONS = {
  fold: "TIEUTAN",       // ;! — bỏ bài, tan tành
  check: "OK",           // /-ok — bỏ qua
  call: "LIKE",          // /-strong — theo cược
  raise: "TUYỆT VỜI",    // :)) — tố thêm, hứng khởi
  allin: "THẤY TIỀN SÁNG MẮT", // $-) — tất tay, máu
};

async function reactAction(api, message, action) {
  const r = ACTION_REACTIONS[action];
  if (!r) return;
  try {
    await api.addReaction(r, message);
  } catch {}
}

async function handleAction(api, message, action, raiseAmount = 0) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const room = getRoom(threadId);
  if (!room) {
    await sendMessageWarning(api, message, "Group này chưa có bàn poker.", true, 60000);
    return;
  }
  if (room.phase === PHASE.WAITING || room.phase === PHASE.SHOWDOWN) {
    await sendMessageWarning(api, message, "Không phải lúc thực hiện action.", true, 60000);
    return;
  }
  const p = room.players[room.currentTurnIdx];
  if (!p || p.userId !== senderId) {
    await sendMessageWarning(api, message, "Chưa đến lượt bạn.", true, 30000);
    return;
  }
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
  }
  // Stop countdown job + gỡ reaction khi player đã act
  if (room.countdownJobKey) {
    jobSendClock.cancelJobByKey(room.countdownJobKey).catch(() => {});
    room.countdownJobKey = null;
  }
  if (room.reactTarget) {
    api.addReaction("UNDO", room.reactTarget).catch(() => {});
    room.reactTarget = null;
  }

  const toCall = Math.max(0, room.currentBet - p.bet);
  // Khi check mà có raise -> tự convert thành call/allin (không cần thông báo)
  if (action === "check" && toCall > 0) {
    action = p.balance < toCall ? "allin" : "call";
  }
  if (action === "call" && toCall === 0) action = "check";
  if (action === "raise") {
    const amt = Number(raiseAmount);
    if (!amt || amt < room.minBet) {
      await sendMessageWarning(api, message, `Raise tối thiểu ${fmtMoney(room.minBet)} VND. Hãy gõ lại lệnh.`, true, 30000);
      restartTurnState(api, message, room, p);
      return;
    }
    if (toCall + amt > p.balance) {
      await sendMessageWarning(
        api,
        message,
        `Không đủ số dư để raise ${fmtMoney(amt)}. Số dư còn: ${fmtMoney(p.balance)}. Hãy gõ lại.`,
        true,
        30000
      );
      restartTurnState(api, message, room, p);
      return;
    }
  }

  await reactAction(api, message, action);
  await applyAction(room, p, action, Number(raiseAmount) || 0);
  await afterAction(api, message, room);
}

// Re-setup turn timer + CLOCK khi validation fail — user vẫn có 60s gõ lại, không cần gửi prompt mới.
function restartTurnState(api, message, room, p) {
  if (room.turnTimer) clearTimeout(room.turnTimer);
  room.turnTimer = setTimeout(async () => {
    if (rooms.get(room.threadId) === room && room.players[room.currentTurnIdx] === p && !p.folded) {
      p.folded = true;
      p.hasActed = true;
      await afterAction(api, message, room);
    }
  }, TURN_TIMEOUT_MS);
}

async function applyAction(room, p, action, raiseAmount) {
  p.hasActed = true;
  const toCall = Math.max(0, room.currentBet - p.bet);

  if (action === "fold") {
    p.folded = true;
    return;
  }
  if (action === "check") {
    return;
  }
  if (action === "call") {
    const pay = Math.min(toCall, p.balance);
    p.bet += pay;
    p.totalBet += pay;
    p.balance -= pay;
    room.pot += pay;
    if (p.balance === 0) p.allIn = true;
    if (!p.isBot) await updatePlayerBalance(p.userId, -pay);
    return;
  }
  if (action === "raise") {
    const total = toCall + raiseAmount;
    const pay = Math.min(total, p.balance);
    p.bet += pay;
    p.totalBet += pay;
    p.balance -= pay;
    room.pot += pay;
    room.currentBet = p.bet;
    if (p.balance === 0) p.allIn = true;
    if (!p.isBot) await updatePlayerBalance(p.userId, -pay);
    // Reset hasActed cho mọi người khác để họ phải re-act với mức bet mới
    for (const op of room.players) {
      if (op !== p && !op.folded && !op.allIn) op.hasActed = false;
    }
    return;
  }
  if (action === "allin") {
    const pay = p.balance;
    p.bet += pay;
    p.totalBet += pay;
    p.balance = 0;
    room.pot += pay;
    p.allIn = true;
    if (p.bet > room.currentBet) {
      room.currentBet = p.bet;
      for (const op of room.players) {
        if (op !== p && !op.folded && !op.allIn) op.hasActed = false;
      }
    }
    if (!p.isBot) await updatePlayerBalance(p.userId, -pay);
    return;
  }
}

async function afterAction(api, message, room) {
  // Còn lại 1 người -> winner
  const active = room.players.filter((p) => !p.folded);
  if (active.length === 1) {
    await payoutSingleWinner(api, message, room, active[0]);
    return;
  }

  // Next turn
  room.currentTurnIdx = (room.currentTurnIdx + 1) % room.players.length;
  await promptCurrentPlayer(api, message, room);
}

function isBettingRoundComplete(room) {
  const eligible = room.players.filter((p) => !p.folded && !p.allIn);
  if (eligible.length === 0) return true;
  for (const p of eligible) {
    if (!p.hasActed) return false;
    if (p.bet !== room.currentBet) return false;
  }
  return true;
}

// Khi không còn ai có thể bet (tất cả allin/folded ở giữa ván) -> deal nốt community cards
// rồi tới thẳng showdown so bài. Cần thiết để tránh vòng lặp khi all-in sớm.
async function fastForwardToShowdown(api, message, room) {
  // Deal cho đủ 5 lá community (nếu thiếu)
  while (room.communityCards.length < 5 && room.deck.length > 0) {
    room.communityCards.push(room.deck.pop());
  }
  // Nếu còn ≥1 player chưa fold -> showdown bình thường
  // Nếu chỉ 1 người chưa fold -> payout single winner
  const remaining = room.players.filter((p) => !p.folded);
  if (remaining.length === 1) {
    await payoutSingleWinner(api, message, room, remaining[0]);
  } else {
    await showdown(api, message, room);
  }
}

async function advancePhase(api, message, room) {
  // Nếu không ai còn active để bet (tất cả allin/folded) -> fast-forward thay vì advance từng phase
  const eligibleCount = room.players.filter((p) => !p.folded && !p.allIn).length;
  if (eligibleCount === 0) {
    await fastForwardToShowdown(api, message, room);
    return;
  }

  // Reset round
  for (const p of room.players) {
    p.bet = 0;
    p.hasActed = false;
  }
  room.currentBet = 0;
  room.currentTurnIdx = 0;
  // Bỏ qua người đã fold với safety counter
  let safety = 0;
  while (
    safety++ < room.players.length * 2 &&
    room.players[room.currentTurnIdx] &&
    (room.players[room.currentTurnIdx].folded || room.players[room.currentTurnIdx].allIn)
  ) {
    room.currentTurnIdx = (room.currentTurnIdx + 1) % room.players.length;
  }

  if (room.phase === PHASE.PREFLOP) {
    room.phase = PHASE.FLOP;
    room.communityCards.push(room.deck.pop(), room.deck.pop(), room.deck.pop());
  } else if (room.phase === PHASE.FLOP) {
    room.phase = PHASE.TURN;
    room.communityCards.push(room.deck.pop());
  } else if (room.phase === PHASE.TURN) {
    room.phase = PHASE.RIVER;
    room.communityCards.push(room.deck.pop());
  } else if (room.phase === PHASE.RIVER) {
    await showdown(api, message, room);
    return;
  }

  await broadcastTable(api, message, room, false);
  // Delay 50ms để canvas hiển thị xong rồi mới gửi turn prompt (tránh 2 tin nháy dính nhau)
  await new Promise((r) => setTimeout(r, 50));
  await promptCurrentPlayer(api, message, room);
}

async function payoutSingleWinner(api, message, room, winner) {
  room.phase = PHASE.SHOWDOWN;
  const payout = room.pot;
  winner.balance += payout;
  if (!winner.isBot) await updatePlayerBalance(winner.userId, payout, true, payout);

  // Đánh giá handName chỉ khi có đủ ≥3 community cards (flop trở đi); chưa thì tay đoán không có ý nghĩa
  const canShowHand = room.communityCards.length >= 3;
  if (canShowHand) {
    const evals = room.players.map((p) => {
      const e = evaluateBest(p.holeCards, room.communityCards);
      return { player: p, handName: HAND_NAME_VI[e.result.rank] };
    });
    for (const e of evals) e.player.handName = e.handName;
  }

  // Render canvas showdown — lật toàn bộ hole cards để mọi người thấy bot/opponent đã có bài gì
  const playersRender = room.players.map((p) => ({
    userId: p.userId,
    name: p.name,
    holeCards: p.holeCards,
    hidden: false,
    folded: p.folded,
    bet: p.totalBet,
    balance: p.balance,
    handName: p.handName || null,
    isWinner: p === winner,
  }));
  const imagePath = await renderShowdown({
    winners: [{ userId: winner.userId, name: winner.name, handName: winner.handName }],
    allPlayers: playersRender,
    communityCards: room.communityCards,
    pot: room.pot,
  });

  // Liệt kê bài của các player đã fold để user biết
  const foldedLines = room.players
    .filter((p) => p.folded)
    .map((p) => `   • ${p.name}${p.isBot ? " 🤖" : ""} (FOLD): ${p.handName || "?"}`)
    .join("\n");

  await api.sendMessage(
    {
      msg:
        `🏆 ${winner.name} thắng do còn lại một mình!\n` +
        `💰 Nhận: ${fmtMoney(payout)} VND\n` +
        (foldedLines ? `\n📜 Bài của người đã fold:\n${foldedLines}` : ""),
      attachments: [imagePath],
      ttl: 600000,
    },
    room.threadId,
    message.type
  );
  setTimeout(() => deleteFile(imagePath).catch(() => {}), 1000);
  deleteRoom(room.threadId);
}

async function showdown(api, message, room) {
  room.phase = PHASE.SHOWDOWN;
  const contenders = room.players.filter((p) => !p.folded);
  // Đánh giá từng tay
  const evals = contenders.map((p) => {
    const e = evaluateBest(p.holeCards, room.communityCards);
    return {
      player: p,
      result: e.result,
      handName: HAND_NAME_VI[e.result.rank],
    };
  });
  // Tìm tay mạnh nhất
  evals.sort((a, b) => compareHands(b.result, a.result));
  const top = evals[0];
  const winners = evals.filter((e) => compareHands(e.result, top.result) === 0);

  const share = Math.floor(room.pot / winners.length);
  const remainder = room.pot - share * winners.length;
  for (let i = 0; i < winners.length; i++) {
    const w = winners[i];
    const give = share + (i === 0 ? remainder : 0);
    w.player.balance += give;
    if (!w.player.isBot) await updatePlayerBalance(w.player.userId, give, true, give);
  }

  // Gán handName cho mọi người để hiển thị
  for (const e of evals) e.player.handName = e.handName;

  const playersRender = room.players.map((p) => {
    const e = evals.find((x) => x.player === p);
    return {
      userId: p.userId,
      name: p.name,
      holeCards: p.holeCards,
      hidden: false,
      folded: p.folded,
      bet: p.totalBet,
      balance: p.balance,
      handName: e ? e.handName : null,
      isWinner: winners.some((w) => w.player === p),
    };
  });

  const imagePath = await renderShowdown({
    winners: winners.map((w) => ({ userId: w.player.userId, name: w.player.name, handName: w.handName })),
    allPlayers: playersRender,
    communityCards: room.communityCards,
    pot: room.pot,
  });

  const winnerLines = winners
    .map((w) => `🏆 ${w.player.name} — ${w.handName} (+${fmtMoney(share + (winners[0] === w ? remainder : 0))} VND)`)
    .join("\n");
  await api.sendMessage(
    {
      msg: `🃏 SHOWDOWN!\n${winnerLines}\n\n💰 Pot: ${fmtMoney(room.pot)} VND`,
      attachments: [imagePath],
      ttl: 600000,
    },
    room.threadId,
    message.type
  );
  setTimeout(() => deleteFile(imagePath).catch(() => {}), 1000);

  deleteRoom(room.threadId);
}

