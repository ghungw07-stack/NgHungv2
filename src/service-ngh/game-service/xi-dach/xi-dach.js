import Big from "big.js";
import chalk from "chalk";
import { MessageType } from "../../../api-zalo/index.js";
import { sendMessageFromSQL } from "../../chat-zalo/chat-style/chat-style.js";
import { getPlayerBalance, updatePlayerBalance, ensurePlayerAccount, isPlayerBanned, addGameRankPoints } from "../../../database/player.js";
import { isAdmin } from "../../../index.js";
import { getGlobalPrefix } from "../../service.js";
import { formatCurrency, parseGameAmount, removeMention } from "../../../utils/format-util.js";
import { gameState } from "../game-manager.js";
import {
  createXiDachWaitingImage,
  createXiDachPlayingImage,
  createXiDachHandImage,
  createXiDachResultImage,
} from "../../../utils/canvas/xidach.js";

/* ============================================================================
 * XÌ DÁCH — game bài giải trí nhiều người, bàn do 1 người tạo và làm nhà cái.
 * Tiền trong game là tiền ảo, không quy đổi tiền mặt.
 * ==========================================================================*/

const MIN_BET = 1000;
const MAX_PLAYERS = 7; // không tính nhà cái
const MAX_CARDS = 5; // tối đa 5 lá / người (ngũ linh)
const TURN_TIMEOUT_MS = 90_000; // 90s mỗi lượt, quá giờ tự động "dằn"
const JOIN_TIMEOUT_MS = 5 * 60_000; // bàn chờ quá 5 phút không ai bắt đầu sẽ tự hủy

// Cửa sổ thời gian để chặn 1 người bị thêm trùng vào bàn khi nhóm có nhiều tài khoản bot
// cùng nhận và xử lý CHUNG 1 hành động thật (xem ghi chú chi tiết ở addPlayerToTable).
const DUPLICATE_JOIN_WINDOW_MS = 4000;

const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS = ["♠", "♥", "♦", "♣"];

// key = `${botId}_${threadId}` => table object
const tables = new Map();
// key = playerId => { tableKey, timer }  (lượt riêng đang chờ "rút"/"dằn")
const pendingTurns = new Map();
// key = msgId (tin nhắn mời thả tim) => tableKey
const joinReactionMap = new Map();
// key = `${msgId}_${senderId}` => timestamp; chặn trường hợp Zalo bắn trùng webhook reaction
// cho đúng 1 lần thả tim thật (đồng bộ đa thiết bị / gateway retry).
const recentReactionJoins = new Map();
const REACTION_DEDUP_WINDOW_MS = 5000;

function isDuplicateReactionEvent(msgId, senderId) {
  const key = `${msgId}_${senderId}`;
  const now = Date.now();
  const last = recentReactionJoins.get(key);
  recentReactionJoins.set(key, now);
  // dọn rác định kỳ đơn giản để Map không phình to
  if (recentReactionJoins.size > 500) {
    for (const [k, t] of recentReactionJoins) {
      if (now - t > REACTION_DEDUP_WINDOW_MS) recentReactionJoins.delete(k);
    }
  }
  return last !== undefined && now - last < REACTION_DEDUP_WINDOW_MS;
}

import { getUsersInfoBasic } from "../../info-service/user-info.js";

/**
 * Chuẩn hóa UID Zalo về dạng chuỗi để so sánh nhất quán giữa các nơi trong file này
 * (vào bàn bằng gõ lệnh, vào bàn bằng thả tim, nhà cái, v.v.).
 *
 * LƯU Ý QUAN TRỌNG: KHÔNG được ép qua Number() rồi đổi lại String() — UID Zalo là số
 * rất lớn (15-19 chữ số), vượt quá độ chính xác số nguyên an toàn của JavaScript, nên
 * Number() sẽ LÀM TRÒN sai lệch UID thật. Nếu làm vậy, ID dùng trong bàn Xì Dách sẽ
 * KHÁC với ID gốc đã lưu tài khoản/số dư trong database (ví dụ qua "daily", "buff",
 * "nap"...), khiến người chơi bị bot coi là "tài khoản mới" (số dư mặc định 10.000đ)
 * và bị từ chối vào bàn vì "không đủ số dư" dù tài khoản thật của họ có đủ tiền.
 * Vì vậy chỉ String() thuần, không làm tròn số.
 */
function normalizePlayerId(id) {
  return String(id);
}

function tableKey(botId, threadId, code) {
  return `${botId}_${threadId}_${code}`;
}

/**
 * LƯU Ý: đã THỬ chặn theo "chỉ bot chính (isMainBot) mới xử lý" để fix tận gốc vụ 1 người
 * bị nhân thành nhiều người chơi khi nhóm có nhiều tài khoản bot cùng nhận 1 sự kiện.
 * NHƯNG cách đó đã bị GỠ BỎ: nếu áp dụng, các nhóm CHỈ có bot con (không có bot chính)
 * sẽ không chơi được Xì Dách nữa — tệ hơn bug ban đầu. Nên hiện tại đang dựa vào lớp
 * chặn trùng theo (tên hiển thị + khung thời gian ngắn) trong addPlayerToTable làm
 * tuyến phòng thủ chính cho vấn đề này (xem DUPLICATE_JOIN_WINDOW_MS).
 */

/** Sinh mã bàn ngẫu nhiên 4 chữ số, đảm bảo không trùng bàn nào đang mở trong nhóm */
function generateUniqueTableCode(botId, threadId) {
  let code;
  do {
    code = Math.floor(1000 + Math.random() * 9000).toString();
  } while (tables.has(tableKey(botId, threadId, code)));
  return code;
}

function getTablesInThread(botId, threadId) {
  return [...tables.values()].filter((t) => t.botId === botId && t.threadId === threadId);
}

/** Các bàn mà người này đang làm nhà cái trong nhóm */
function findDealerTables(botId, threadId, senderId) {
  return getTablesInThread(botId, threadId).filter((t) => t.dealer.id === senderId);
}

/** Các bàn mà người này đang tham gia (nhà cái hoặc người chơi) trong nhóm */
function findParticipantTables(botId, threadId, senderId) {
  return getTablesInThread(botId, threadId).filter(
    (t) => t.dealer.id === senderId || t.players.some((p) => p.id === senderId)
  );
}

/** Chỉ trả về bàn khi kết quả lọc là duy nhất — nếu 0 hoặc nhiều hơn 1, để lệnh gọi tự xử lý (yêu cầu nhập mã) */
function resolveSenderTable(botId, threadId, senderId, finderFn) {
  const list = finderFn(botId, threadId, senderId);
  return list.length === 1 ? list[0] : null;
}

function formatTableList(list) {
  return list
    .map(
      (t) =>
        `🔑 Mã ${t.code} — Nhà cái ${t.dealer.name} — Cược ${formatCurrency(t.betAmount)} VNĐ — ${t.players.length}/${MAX_PLAYERS} người${
          t.status === "playing" ? " (đang chơi)" : ""
        }`
    )
    .join("\n");
}

function saveGameData() {
  gameState.changes.xidach = true;
}

/* --------------------------- Ảnh bàn & thu hồi tin nhắn -------------------------- */

/** Lấy msgId (định danh tin nhắn) từ kết quả trả về của api.sendMessage (text hoặc ảnh) */
function extractMsgId(sent) {
  return (
    sent?.message?.msgId ??
    sent?.msgId ??
    sent?.attachment?.[0]?.msgId ??
    sent?.attachments?.[0]?.msgId ??
    sent?.data?.msgId ??
    (Array.isArray(sent) ? sent[0]?.msgId : null) ??
    null
  );
}

/** Lấy cliMsgId (chỉ cần cho việc thu hồi tin nhắn) */
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

/** Lấy số dư của 1 nhóm user, trả về map { [id]: Big } — dùng để hiển thị trên ảnh bàn chờ */
async function fetchBalances(ids) {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  const map = {};
  await Promise.all(
    uniqueIds.map(async (id) => {
      try {
        const result = await getPlayerBalance(id);
        map[id] = result?.success ? new Big(result.balance) : new Big(0);
      } catch (err) {
        console.error("Lỗi khi lấy số dư Xì Dách:", err?.message || err);
        map[id] = new Big(0);
      }
    })
  );
  return map;
}

/** Lấy avatar của 1 nhóm user, trả về map { [id]: avatarUrl|null } */
async function fetchAvatars(api, ids) {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  const map = {};
  if (uniqueIds.length === 0) return map;
  try {
    const profiles = await getUsersInfoBasic(api, uniqueIds);
    for (const id of uniqueIds) map[id] = profiles?.[id]?.avatar || null;
  } catch (err) {
    console.error("Lỗi khi lấy avatar Xì Dách:", err?.message || err);
  }
  return map;
}

/** Thu hồi tin nhắn ảnh bàn cũ (nếu có) trước khi gửi ảnh mới */
async function recallTableMessage(api, table) {
  const ref = table.tableMsgRef;
  table.tableMsgRef = null;
  if (!ref) return;
  try {
    const msgUndo = {
      type: MessageType.GroupMessage,
      threadId: table.threadId,
      data: { quote: { globalMsgId: ref.msgId, cliMsgId: ref.cliMsgId } },
    };
    await api.undoMessage(msgUndo);
  } catch (err) {
    console.error("Lỗi khi thu hồi ảnh bàn Xì Dách cũ:", err);
  }
}

/**
 * Gửi ảnh trạng thái bàn hiện tại vào nhóm (thu hồi ảnh bàn trước đó nếu có).
 * status "waiting" -> ảnh bàn chờ; status "playing" -> ảnh bàn đang chơi.
 *
 * LƯU Ý: hàm này được XẾP HÀNG theo từng bàn (xem `table._snapshotQueue` ở dưới cùng file).
 * Lý do: nếu nhiều người vào bàn gần như cùng lúc (vd. 4 người thả tim liên tiếp), mỗi lượt
 * vào đều gọi hàm này để cập nhật ảnh bàn — nếu để chạy SONG SONG, nhiều lệnh gửi ảnh sẽ gọi
 * api.sendMessage cùng lúc, và bên trong lib Zalo dùng "clientId = Date.now()" cho mỗi ảnh,
 * nên 2 lệnh gửi rơi vào cùng 1 mili-giây sẽ bị trùng clientId -> Zalo trả lỗi
 * "Tham số không hợp lệ" và ảnh đó gửi thất bại. Xếp hàng chạy tuần tự (mỗi lần chỉ 1 lệnh
 * gửi ảnh cho 1 bàn) sẽ tránh được va chạm này.
 */
async function sendTableSnapshot(api, table, opts = {}) {
  const prev = table._snapshotQueue || Promise.resolve();
  const run = prev.catch(() => {}).then(() => sendTableSnapshotInner(api, table, opts));
  table._snapshotQueue = run;
  return run;
}

async function sendTableSnapshotInner(api, table, { recall } = {}) {
  // Luôn thu hồi ảnh bàn trước đó (dù đang "chờ người" hay đang "playing") trước khi gửi
  // ảnh mới, để nhóm chat không bị dồn nhiều ảnh cũ của cùng 1 bàn/cùng 1 lượt chơi.
  const shouldRecall = recall ?? true;
  if (shouldRecall) await recallTableMessage(api, table);

  const avatarMap = await fetchAvatars(api, [table.dealer.id, ...table.players.map((p) => p.id)]);

  let imagePath;
  let caption;

  if (table.status === "waiting") {
    const balanceMap = await fetchBalances([table.dealer.id, ...table.players.map((p) => p.id)]);
    imagePath = await createXiDachWaitingImage({
      tableLabel: table.code,
      dealerId: table.dealer.id,
      dealerName: table.dealer.name,
      dealerAvatar: avatarMap[table.dealer.id],
      dealerBalance: balanceMap[table.dealer.id],
      betAmount: table.betAmount,
      players: table.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: avatarMap[p.id],
        balance: balanceMap[p.id],
      })),
      maxPlayers: MAX_PLAYERS,
    });
    caption =
      `🎴 Bàn Xì Dách #${table.code} của ${table.dealer.name}\n` +
      `❤️ Thả tim ảnh này hoặc gõ "vao ${table.code}" để tham gia.\n👑 Nhà cái gõ "batdau" khi đủ người.`;
  } else {
    const round = table.round;
    const currentId = round ? round.order[round.turnIndex] ?? table.dealer.id : null;
    const currentName =
      currentId === table.dealer.id ? table.dealer.name : table.players.find((p) => p.id === currentId)?.name;
    imagePath = await createXiDachPlayingImage({
      tableLabel: table.code,
      dealerName: table.dealer.name,
      dealerId: table.dealer.id,
      dealerAvatar: avatarMap[table.dealer.id],
      players: table.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: avatarMap[p.id],
        cardCount: round?.hands?.[p.id]?.cards?.length || 0,
      })),
      maxPlayers: MAX_PLAYERS,
      betAmount: table.betAmount,
      currentTurnId: currentId,
      centerText: currentName ? `🎯 Đang chờ ${currentName} rút/dằn...` : "Chưa có bài đánh",
    });
    caption = `🎴 Ván Xì Dách #${table.code} đang diễn ra — cược ${formatCurrency(table.betAmount)} VNĐ/người.`;
  }

  try {
    const sent = await api.sendMessage({ msg: caption, attachments: [imagePath] }, table.threadId, MessageType.GroupMessage);
    const msgId = extractMsgId(sent);
    const cliMsgId = extractCliMsgId(sent);
    table.tableMsgRef = msgId && cliMsgId ? { msgId, cliMsgId } : null;
    if (!table.tableMsgRef) {
      console.warn(
        "Không lấy được msgId/cliMsgId của ảnh bàn Xì Dách vừa gửi — sẽ KHÔNG thu hồi được ảnh này ở lần cập nhật sau. Kết quả trả về từ api.sendMessage:",
        sent
      );
    }

    if (table.joinMsgId) joinReactionMap.delete(table.joinMsgId);
    if (table.status === "waiting" && msgId) {
      const newMsgId = msgId.toString();
      table.joinMsgId = newMsgId;
      joinReactionMap.set(newMsgId, tableKey(table.botId, table.threadId, table.code));
    } else {
      table.joinMsgId = null;
    }
  } catch (err) {
    console.error("Lỗi khi gửi ảnh bàn Xì Dách:", err?.message || err);
  }
}

/**
 * Nếu người này từng gửi lời mời kết bạn cho bot thì tự động đồng ý.
 * @returns {Promise<boolean>} true nếu vừa đồng ý (hoặc đã là bạn bè từ trước và không cần làm gì).
 */
async function autoAcceptFriendIfPending(api, playerId) {
  try {
    const list = await api.getFriendRequestList();
    const requests = Array.isArray(list?.data) ? list.data : Array.isArray(list) ? list : [];
    const isPending = requests.some((r) => (r?.userId || r?.uid || r?.id) === playerId);
    if (isPending) {
      await api.acceptFriendRequest(playerId);
      return true;
    }
    return false;
  } catch (err) {
    console.error("Lỗi khi tự động đồng ý kết bạn (xidach):", err?.message || err);
    return false;
  }
}

/**
 * Gửi tin nhắn riêng, và nếu thất bại thì thử tự động đồng ý lời mời kết bạn
 * đang chờ của người này rồi gửi lại đúng 1 lần trước khi từ bỏ.
 * Dùng cho mọi lần gửi DM trong game (ảnh bài, thông báo lượt, kết quả...).
 */
async function sendDirectMessageWithFriendRetry(api, playerId, sendFn) {
  try {
    return await sendFn();
  } catch (err) {
    const accepted = await autoAcceptFriendIfPending(api, playerId);
    if (accepted) {
      // vừa đồng ý kết bạn xong, thử gửi lại ngay 1 lần
      return await sendFn();
    }
    throw err;
  }
}

/** Gửi ảnh bài riêng cho 1 người chơi qua tin nhắn riêng (tự retry nếu vừa kết bạn được) */
async function sendHandImage(api, playerId, playerName, cards, { badge, caption } = {}) {
  return sendDirectMessageWithFriendRetry(api, playerId, async () => {
    const imagePath = await createXiDachHandImage({ playerName, cards, badge });
    return api.sendMessage({ msg: caption || "🎴 Bài của bạn", attachments: [imagePath] }, playerId, MessageType.DirectMessage);
  });
}

export function initializeGameXiDach() {
  if (!gameState.data.xidach) gameState.data.xidach = {};
  // TẠM: đánh dấu phiên bản để xác nhận đúng bản code (có fix chống trùng người chơi) đang chạy.
  // Sau khi restart, log này PHẢI xuất hiện — nếu không thấy, tức là bot vẫn đang chạy code cũ.
  console.log(chalk.magentaBright("Khởi động module minigame Xì Dách hoàn tất — [FIX join-dedup v2]"));
}

/* ---------------------------- Bài & tính điểm ---------------------------- */

function createShuffledDeck() {
  const deck = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cardPoint(card) {
  if (card.rank === "A") return 1;
  if (["10", "J", "Q", "K"].includes(card.rank)) return 10;
  return parseInt(card.rank, 10);
}

function cardLabel(card) {
  return `${card.rank}${card.suit}`;
}

function handLabel(cards) {
  return cards.map(cardLabel).join(" ");
}

function handTotal(cards) {
  return cards.reduce((sum, c) => sum + cardPoint(c), 0);
}

/**
 * Đánh giá 1 bộ bài, trả về:
 *  - total: tổng điểm
 *  - busted: có bị quá 21 (nổ) không
 *  - type: "xiBang" | "nguLinh" | "xiDach" | "sap" | "normal"
 *  - rank: độ mạnh của loại bài để so sánh (số càng lớn càng mạnh)
 *  - multiplier: hệ số ăn/thua so với mức cược khi bài này thắng
 * Thứ tự mạnh yếu: Xì bàng > Ngũ linh > Xì dách > Sáp > điểm thường.
 */
function evaluateHand(cards) {
  const total = handTotal(cards);
  const busted = total > 21;

  let type = "normal";
  let rank = 0;
  let multiplier = 1;

  if (!busted) {
    if (cards.length === 2 && cards[0].rank === "A" && cards[1].rank === "A") {
      type = "xiBang";
      rank = 4;
      multiplier = 4;
    } else if (cards.length === 2 && total === 21) {
      type = "xiDach";
      rank = 2;
      multiplier = 2;
    } else if (cards.length === MAX_CARDS) {
      type = "nguLinh";
      rank = 3;
      multiplier = 3;
    } else if (cards.length >= 3 && cards.every((c) => cardPoint(c) === cardPoint(cards[0]))) {
      type = "sap";
      rank = 1;
      multiplier = cards.length === 3 ? 2 : cards.length === 4 ? 3 : 4;
    }
  }

  return { total, busted, type, rank, multiplier, cards };
}

function typeLabel(evalResult) {
  switch (evalResult.type) {
    case "xiBang":
      return "Xì Bàng";
    case "nguLinh":
      return "Ngũ Linh";
    case "xiDach":
      return "Xì Dách";
    case "sap":
      return `Sáp ${evalResult.cards.length}`;
    default:
      return evalResult.busted ? "Nổ" : `${evalResult.total} điểm`;
  }
}

/** So sánh 2 bộ bài KHÔNG nổ, trả >0 nếu a mạnh hơn b, <0 nếu ngược lại, 0 nếu hòa */
function compareHands(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  return a.total - b.total;
}

/** Có được rút thêm bài không (tự dừng nếu đã đạt bộ bài "ăn ngay") */
function mustStand(cards) {
  const evalResult = evaluateHand(cards);
  return evalResult.busted || evalResult.type === "xiBang" || evalResult.type === "xiDach" || cards.length >= MAX_CARDS;
}

/* ------------------------------- Bàn chơi -------------------------------- */

function getTable(botId, threadId, code) {
  if (code) return tables.get(tableKey(botId, threadId, code));
  const list = getTablesInThread(botId, threadId);
  return list.length === 1 ? list[0] : null;
}

function clearPendingTurn(playerId) {
  const pending = pendingTurns.get(playerId);
  if (pending?.timer) clearTimeout(pending.timer);
  pendingTurns.delete(playerId);
}

function removeTable(table) {
  tables.delete(tableKey(table.botId, table.threadId, table.code));
  if (table.joinMsgId) joinReactionMap.delete(table.joinMsgId);
  if (table.round) {
    for (const id of [...table.round.order, table.dealer.id]) clearPendingTurn(id);
  }
}

/* ------------------------------ Lệnh nhóm -------------------------------- */

export async function handleXiDachCommand(api, message, groupSettings) {
  const threadId = message.threadId;
  const senderId = normalizePlayerId(message.data.uidFrom);
  const senderName = message.data.dName || senderId;
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);

  if (await isPlayerBanned(senderId)) {
    await sendMessageFromSQL(
      api,
      message,
      { success: false, message: "Tài khoản của bạn đã bị khóa, không thể chơi game." },
      true,
      30000
    );
    return;
  }

  // luôn đảm bảo người chơi có tài khoản game tự động theo Zalo UID
  await ensurePlayerAccount(senderId, senderName, botId);

  const content = removeMention(message).trim();
  const parts = content.split(/\s+/);
  const sub = (parts[1] || "").toLowerCase();

  switch (sub) {
    case "tao":
    case "create":
      return createTable(api, message, parts.slice(2).join(" "));

    case "vao":
    case "join":
      return joinTableCommand(api, message);

    case "roi":
    case "leave":
      return leaveTable(api, message);

    case "batdau":
    case "start":
      return startRound(api, message);

    case "huy":
    case "cancel":
      return cancelTable(api, message);

    case "xem":
    case "status":
      return viewTable(api, message);

    case "bai":
    case "card":
      return viewMyCards(api, message);

    default: {
      // Cho phép tạo bàn NHANH, khỏi gõ "tao": "xidach 1b" / "xd 1b" cũng tạo bàn cược 1 tỷ
      // y hệt "xidach tao 1b". Chỉ áp dụng khi từ đầu tiên sau "xidach" TRÔNG GIỐNG 1 mức
      // cược hợp lệ (số + hậu tố k/m/b/%/... hoặc "all"/"allin"), để không đụng các lệnh khác.
      if (sub && isLikelyBetAmountToken(sub)) {
        return createTable(api, message, parts.slice(1).join(" "));
      }
      return sendGuide(api, message, prefix);
    }
  }
}

/** Từ (token) này có trông giống 1 mức cược hợp lệ không, vd: "1b", "500k", "2.5m", "50%", "all", "allin" */
function isLikelyBetAmountToken(token) {
  const t = token.toLowerCase();
  if (t === "all" || t === "allin") return true;
  return /^\d+(\.\d+)?(%|k|m|b|kb|bb)?$/.test(t);
}

async function sendGuide(api, message, prefix) {
  const guide =
    `🎴 XÌ DÁCH — HƯỚNG DẪN\n` +
    `⚖️ Game giải trí miễn phí — tiền ảo KHÔNG quy đổi tiền mặt.\n\n` +
    `📋 Lệnh trong nhóm:\n` +
    `- ${prefix}xidach tao <cược>: Tạo bàn, bạn sẽ là nhà cái (vd: ${prefix}xidach tao 1m)\n` +
    `- ${prefix}xidach vao: Vào bàn duy nhất đang chờ (hoặc thả ❤️ vào tin nhắn mời).\n` +
    `- ${prefix}xidach roi: Rời bàn (trước khi bắt đầu)\n` +
    `- ${prefix}xidach batdau: Nhà cái bắt đầu ván\n` +
    `- ${prefix}xidach huy: Hủy bàn (nhà cái/admin)\n` +
    `- ${prefix}xidach xem: Xem trạng thái bàn\n` +
    `- ${prefix}xidach bai: Xem lại bài của bạn (nhắn riêng)\n\n` +
    `🎮 Trong ván: khi tới lượt, bot sẽ nhắn riêng cho bạn, gõ "rút" để bốc thêm 1 lá hoặc "dằn" để dừng.\n` +
    `👥 Số người chơi: 1-${MAX_PLAYERS} người (chưa kể nhà cái). Nhà cái luôn chơi cuối cùng.\n\n` +
    `🏆 Cách ăn tiền (so với mức cược):\n` +
    `- Xì Bàng (2 lá Át): x4\n` +
    `- Ngũ Linh (5 lá không nổ): x3\n` +
    `- Xì Dách (2 lá = 21 điểm): x2\n` +
    `- Sáp 3/4 lá cùng điểm: x2/x3\n` +
    `- So điểm thường (ai gần 21 hơn thắng): x1\n` +
    `- Quá 21 điểm (Nổ): thua ngay mức cược\n` +
    `👉 Nhà cái và từng người chơi so bài độc lập với nhau.`;

  await sendMessageFromSQL(api, message, { success: true, message: guide }, false, 300000);
}

async function createTable(api, message, betText) {
  const botId = api.getBotId();
  const threadId = message.threadId;
  const senderId = normalizePlayerId(message.data.uidFrom);
  const senderName = message.data.dName || senderId;

  const joinExistingTable = async (table) => {
    if (table.status !== "waiting") {
      await sendMessageFromSQL(api, message, { success: false, message: "Bàn Xì Dách của nhóm đang chơi, vui lòng đợi ván sau." }, true, 30000);
      return;
    }
    const result = await addPlayerToTable(api, table, senderId, senderName);
    await sendMessageFromSQL(api, message, result, true, 30000);
    if (result.success) {
      await autoAcceptFriendIfPending(api, senderId);
      await sendTableSnapshot(api, table);
      saveGameData();
    }
  };

  const existingTable = getTablesInThread(botId, threadId)[0];
  if (existingTable) return joinExistingTable(existingTable);

  if (!betText) {
    await sendMessageFromSQL(
      api,
      message,
      { success: false, message: "Vui lòng nhập mức cược, vd: !xidach tao 1m" },
      true,
      30000
    );
    return;
  }

  const balanceResult = await getPlayerBalance(senderId);
  if (!balanceResult.success) {
    await sendMessageFromSQL(api, message, { success: false, message: balanceResult.message }, true, 30000);
    return;
  }

  let betAmount;
  try {
    const parsed = parseGameAmount(betText, balanceResult.balance);
    betAmount = parsed === "allin" ? new Big(balanceResult.balance) : parsed;
  } catch {
    await sendMessageFromSQL(api, message, { success: false, message: "Mức cược không hợp lệ." }, true, 30000);
    return;
  }

  if (betAmount.lt(MIN_BET)) {
    await sendMessageFromSQL(
      api,
      message,
      { success: false, message: `Mức cược tối thiểu là ${formatCurrency(new Big(MIN_BET))} VNĐ.` },
      true,
      30000
    );
    return;
  }

  // Nếu hai người tạo gần như đồng thời, người hoàn tất sau sẽ vào bàn đầu tiên.
  const tableCreatedWhileWaiting = getTablesInThread(botId, threadId)[0];
  if (tableCreatedWhileWaiting) return joinExistingTable(tableCreatedWhileWaiting);

  const code = generateUniqueTableCode(botId, threadId);
  const table = {
    botId,
    threadId,
    code,
    betAmount,
    dealer: { id: normalizePlayerId(senderId), name: senderName }, // chuẩn hóa để so sánh nhất quán với ID người chơi (tránh lệch do mất độ chính xác UID lớn)
    players: [],
    status: "waiting",
    round: null,
    joinMsgId: null,
    tableMsgRef: null,
    createdAt: Date.now(),
  };
  tables.set(tableKey(botId, threadId, code), table);

  await sendTableSnapshot(api, table, { recall: false });

  setTimeout(() => {
    const t = getTable(botId, threadId, code);
    if (t && t.status === "waiting" && t.players.length === 0) {
      removeTable(t);
    }
  }, JOIN_TIMEOUT_MS);
}

async function addPlayerToTable(api, table, playerIdRaw, playerName) {
  // CHUẨN HÓA ID về string ngay từ đầu — tránh trường hợp cùng 1 người nhưng
  // uidFrom đến từ event "message" (gõ "vao") và event "reaction" (thả tim)
  // có kiểu dữ liệu khác nhau (string vs number), khiến so sánh === không nhận ra
  // là cùng 1 người và push trùng vào bàn.
  const playerId = normalizePlayerId(playerIdRaw);

  // LOG CHẨN ĐOÁN (không đổi hành vi): nếu còn gặp lại tình trạng trùng người chơi,
  // xem log này để biết chính xác kiểu dữ liệu/giá trị ID thật, thay vì đoán mò.
  console.log(
    `[XiDach#${table.code}] Yêu cầu vào bàn: raw=${JSON.stringify(playerIdRaw)} type=${typeof playerIdRaw} ` +
      `normalized=${playerId} name=${playerName} idsHienCoTrongBan=${JSON.stringify(table.players.map((p) => p.id))}`
  );

  if (table.status !== "waiting") return { success: false, message: "Bàn đang chơi, vui lòng đợi ván sau." };
  if (playerId === String(table.dealer.id)) return { success: false, message: "Bạn là nhà cái của bàn này rồi." };
  if (table.players.some((p) => String(p.id) === playerId)) return { success: false, message: "Bạn đã ở trong bàn rồi." };
  if (table.players.length >= MAX_PLAYERS) return { success: false, message: "Bàn đã đủ người chơi." };

  // CHẶN TRÙNG THEO TÊN TRONG THỜI GIAN NGẮN: nhóm test có nhiều tài khoản bot cùng là
  // thành viên (Hoàng Tùng, Nguyễn Gia Hưng, Mai Thị Thu Hoa, Phương...), nên 1 hành động
  // thật (gõ "vao" / thả tim 1 lần) bị TỪNG tài khoản bot nhận và xử lý riêng, mỗi lần lại
  // ra 1 ID khác nhau cho CÙNG 1 người → check "table.players.some(id trùng)" ở trên không
  // bắt được. Vá tạm: nếu cùng TÊN vừa vào bàn này trong vài giây trước, coi là xử lý trùng
  // (do bot khác đã xử lý) và bỏ qua, không cộng thêm người chơi nữa.
  const now = Date.now();
  const recentSameName = table.players.find(
    (p) => p.name === playerName && now - (p.joinedAt || 0) < DUPLICATE_JOIN_WINDOW_MS
  );
  if (recentSameName) {
    return { success: false, message: `${playerName} vừa vào bàn rồi (đang xử lý), khỏi gõ/thả tim lại nhé.` };
  }

  // Giữ chỗ NGAY LẬP TỨC (đồng bộ, trước khi có bất kỳ await nào) để chặn race condition:
  // nếu cùng 1 người gửi 2 yêu cầu vào bàn gần như cùng lúc (vd. thả tim + gõ "vao"),
  // lần gọi thứ 2 phải thấy chỗ đã bị chiếm ngay ở bước kiểm tra "table.players.some(...)"
  // phía trên, thay vì cả hai lần gọi cùng vượt qua kiểm tra rồi cùng push -> nhân đôi người chơi.
  const placeholder = { id: playerId, name: playerName, joinedAt: now };
  table.players.push(placeholder);

  try {
    if (await isPlayerBanned(playerId)) {
      table.players.splice(table.players.indexOf(placeholder), 1);
      return { success: false, message: "Tài khoản của bạn đã bị khóa." };
    }

    await ensurePlayerAccount(playerId, playerName, table.botId);

    const balanceResult = await getPlayerBalance(playerId);
    if (!balanceResult.success || new Big(balanceResult.balance).lt(table.betAmount)) {
      table.players.splice(table.players.indexOf(placeholder), 1);
      return { success: false, message: `Số dư không đủ để vào bàn (cần ${formatCurrency(table.betAmount)} VNĐ).` };
    }

    return { success: true, message: `${playerName} đã vào bàn (${table.players.length}/${MAX_PLAYERS}).` };
  } catch (err) {
    const idx = table.players.indexOf(placeholder);
    if (idx !== -1) table.players.splice(idx, 1);
    throw err;
  }
}

async function joinTableCommand(api, message) {
  const botId = api.getBotId();
  const threadId = message.threadId;
  // LOG CHẨN ĐOÁN: in toàn bộ message.data thô để tìm hiểu vì sao cùng 1 người
  // (theo phản ánh của admin) lại có thể ra nhiều ID khác nhau qua đường gõ "vao".
  console.log(`[XiDach][gõ-vao] message.data thô:`, JSON.stringify(message.data));
  const senderId = normalizePlayerId(message.data.uidFrom);
  const senderName = message.data.dName || senderId;

  const content = removeMention(message).trim();
  const parts = content.split(/\s+/);
  const codeArg = (parts[2] || "").trim();

  let table;
  if (codeArg) {
    table = getTable(botId, threadId, codeArg);
    if (!table) {
      await sendMessageFromSQL(api, message, { success: false, message: `Không tìm thấy bàn mã ${codeArg}.` }, true, 30000);
      return;
    }
  } else {
    const waitingTables = getTablesInThread(botId, threadId).filter((t) => t.status === "waiting");
    if (waitingTables.length === 0) {
      await sendMessageFromSQL(api, message, { success: false, message: "Nhóm này chưa có bàn Xì Dách nào đang chờ." }, true, 30000);
      return;
    }
    if (waitingTables.length > 1) {
      await sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Nhóm này đang có nhiều bàn, hãy chọn mã:\n${formatTableList(waitingTables)}\n👉 Gõ "vao <mã>" để vào đúng bàn.`,
        },
        true,
        60000
      );
      return;
    }
    table = waitingTables[0];
  }

  const result = await addPlayerToTable(api, table, senderId, senderName);
  await sendMessageFromSQL(api, message, result, true, 30000);
  if (result.success) {
    await autoAcceptFriendIfPending(api, senderId);
    await sendTableSnapshot(api, table);
    saveGameData();
  }
}

export async function handleXiDachReaction(api, reaction) {
  const msgId = reaction.data?.content?.rMsg?.[0]?.gMsgID?.toString() || "";
  const rType = reaction.data?.content?.rType;
  if (!msgId || rType !== 5) return false; // 5 = thả tim ❤️
  const key = joinReactionMap.get(msgId);
  if (!key) return false;

  // LOG CHẨN ĐOÁN: in toàn bộ reaction.data thô để tìm hiểu vì sao cùng 1 người
  // (theo phản ánh của admin) lại có thể ra nhiều ID khác nhau qua đường thả tim.
  console.log(`[XiDach][thả-tim] reaction.data thô:`, JSON.stringify(reaction.data));

  const table = [...tables.values()].find((t) => tableKey(t.botId, t.threadId, t.code) === key);
  if (!table) {
    joinReactionMap.delete(msgId);
    return false;
  }

  // CỐT LÕI CỦA FIX: bàn này do đúng 1 tài khoản bot tạo ra (table.botId lúc "tao").
  // Nếu nhóm có nhiều tài khoản bot cùng nhận được sự kiện thả tim này, chỉ tài khoản
  // bot ĐÃ TẠO BÀN mới được xử lý tiếp — các tài khoản bot khác coi như không nhận được
  // (return false), y hệt cách đường gõ "vao" đã lọc theo botId từ trước qua getTable().
  // Nhờ vậy 1 hành động thật chỉ được đúng 1 bot xử lý, dù bao nhiêu bot cùng nhận sự kiện.
  if (table.botId !== api.getBotId()) return false;

  const senderId = normalizePlayerId(reaction.data.uidFrom);

  // Chặn trường hợp cùng 1 lần thả tim thật nhưng Zalo bắn 2 webhook "reaction"
  // (đồng bộ đa thiết bị / gateway retry) cho cùng msgId + senderId trong thời gian ngắn.
  if (isDuplicateReactionEvent(msgId, senderId)) return true;

  let senderName = senderId;
  try {
    const info = await api.getInfoMembers([senderId]);
    senderName = info?.profiles?.[senderId]?.zaloName || senderId;
    console.log(
      `[XiDach][thả-tim] Tra cứu profile cho senderId=${senderId}: profilesKeys=${JSON.stringify(
        Object.keys(info?.profiles || {})
      )} => senderName=${senderName}`
    );
  } catch (err) {
    console.log(`[XiDach][thả-tim] getInfoMembers lỗi cho senderId=${senderId}:`, err?.message || err);
  }

  const result = await addPlayerToTable(api, table, senderId, senderName);
  if (result.success) {
    await autoAcceptFriendIfPending(api, senderId);
    await sendTableSnapshot(api, table);
    saveGameData();
  }
  return true;
}

async function leaveTable(api, message) {
  const botId = api.getBotId();
  const threadId = message.threadId;
  const senderId = normalizePlayerId(message.data.uidFrom);

  const content = removeMention(message).trim();
  const parts = content.split(/\s+/);
  const codeArg = (parts[2] || "").trim();

  const table = codeArg ? getTable(botId, threadId, codeArg) : resolveSenderTable(botId, threadId, senderId, findParticipantTables);
  if (!table) {
    await sendMessageFromSQL(
      api,
      message,
      { success: false, message: "Không tìm thấy bàn phù hợp. Nếu bạn ở nhiều bàn, hãy gõ 'roi <mã>'." },
      true,
      30000
    );
    return;
  }
  if (table.status !== "waiting") {
    await sendMessageFromSQL(api, message, { success: false, message: "Ván đang diễn ra, không thể rời bàn." }, true, 30000);
    return;
  }
  if (senderId === table.dealer.id) {
    await sendMessageFromSQL(
      api,
      message,
      { success: false, message: "Bạn là nhà cái, dùng lệnh 'huy' nếu muốn đóng bàn." },
      true,
      30000
    );
    return;
  }

  const idx = table.players.findIndex((p) => p.id === senderId);
  if (idx === -1) {
    await sendMessageFromSQL(api, message, { success: false, message: "Bạn không ở trong bàn này." }, true, 30000);
    return;
  }
  table.players.splice(idx, 1);
  await sendMessageFromSQL(api, message, { success: true, message: "Bạn đã rời bàn." }, true, 30000);
}

async function cancelTable(api, message) {
  const botId = api.getBotId();
  const threadId = message.threadId;
  const senderId = normalizePlayerId(message.data.uidFrom);

  const content = removeMention(message).trim();
  const parts = content.split(/\s+/);
  const codeArg = (parts[2] || "").trim();

  let table = codeArg ? getTable(botId, threadId, codeArg) : resolveSenderTable(botId, threadId, senderId, findDealerTables);
  if (!table && !codeArg) {
    // Nếu nhóm chỉ có đúng 1 bàn, admin có thể hủy dù không phải nhà cái
    const allTables = getTablesInThread(botId, threadId);
    if (allTables.length === 1) table = allTables[0];
  }
  if (!table) {
    await sendMessageFromSQL(
      api,
      message,
      { success: false, message: "Không tìm thấy bàn phù hợp. Nếu nhóm có nhiều bàn, hãy gõ 'huy <mã>'." },
      true,
      30000
    );
    return;
  }
  if (senderId !== table.dealer.id && !isAdmin(botId, senderId, threadId)) {
    await sendMessageFromSQL(api, message, { success: false, message: "Chỉ nhà cái hoặc admin mới được hủy bàn." }, true, 30000);
    return;
  }

  await recallTableMessage(api, table);
  removeTable(table);
  await sendMessageFromSQL(api, message, { success: true, message: "Đã hủy bàn Xì Dách." }, true, 30000);
}

async function viewTable(api, message) {
  const botId = api.getBotId();
  const threadId = message.threadId;

  const content = removeMention(message).trim();
  const parts = content.split(/\s+/);
  const codeArg = (parts[2] || "").trim();

  const allTables = getTablesInThread(botId, threadId);
  if (allTables.length === 0) {
    await sendMessageFromSQL(api, message, { success: false, message: "Nhóm này chưa có bàn Xì Dách nào." }, true, 30000);
    return;
  }

  let table;
  if (codeArg) {
    table = getTable(botId, threadId, codeArg);
    if (!table) {
      await sendMessageFromSQL(api, message, { success: false, message: `Không tìm thấy bàn mã ${codeArg}.` }, true, 30000);
      return;
    }
  } else if (allTables.length > 1) {
    await sendMessageFromSQL(
      api,
      message,
      {
        success: true,
        message: `🎴 Nhóm này đang có ${allTables.length} bàn:\n${formatTableList(allTables)}\n👉 Gõ "xem <mã>" để xem chi tiết 1 bàn.`,
      },
      false,
      30000
    );
    return;
  } else {
    table = allTables[0];
  }

  let msg = `🎴 BÀN XÌ DÁCH #${table.code}\n👑 Nhà cái: ${table.dealer.name}\n💰 Cược: ${formatCurrency(table.betAmount)} VNĐ\n`;
  msg += `📌 Trạng thái: ${table.status === "waiting" ? "Đang chờ người chơi" : "Đang chơi"}\n`;
  msg += `👥 Người chơi (${table.players.length}/${MAX_PLAYERS}):\n`;
  msg += table.players.length ? table.players.map((p, i) => `${i + 1}. ${p.name}`).join("\n") : "Chưa có ai.";

  if (table.status === "playing" && table.round) {
    const currentId = table.round.order[table.round.turnIndex] ?? table.dealer.id;
    const currentName =
      currentId === table.dealer.id ? table.dealer.name : table.players.find((p) => p.id === currentId)?.name;
    msg += `\n\n🎯 Đang tới lượt: ${currentName || "?"}`;
  }

  await sendMessageFromSQL(api, message, { success: true, message: msg }, false, 30000);
}

async function viewMyCards(api, message) {
  const botId = api.getBotId();
  const threadId = message.threadId;
  const senderId = normalizePlayerId(message.data.uidFrom);

  const content = removeMention(message).trim();
  const parts = content.split(/\s+/);
  const codeArg = (parts[2] || "").trim();

  const table = codeArg ? getTable(botId, threadId, codeArg) : resolveSenderTable(botId, threadId, senderId, findParticipantTables);
  if (!table || table.status !== "playing" || !table.round) {
    await sendMessageFromSQL(api, message, { success: false, message: "Hiện không có ván nào đang diễn ra." }, true, 30000);
    return;
  }

  const hand = table.round.hands[senderId];
  if (!hand) {
    await sendMessageFromSQL(api, message, { success: false, message: "Bạn không tham gia ván này." }, true, 30000);
    return;
  }

  const evalResult = evaluateHand(hand.cards);
  const playerName = message.data.dName || senderId;
  try {
    await sendHandImage(api, senderId, playerName, hand.cards, {
      caption: `🎴 Bài của bạn: ${handLabel(hand.cards)}\n📊 ${typeLabel(evalResult)}`,
    });
    if (message.type !== MessageType.DirectMessage) {
      await sendMessageFromSQL(api, message, { success: true, message: "Đã gửi bài vào tin nhắn riêng cho bạn." }, true, 15000);
    }
  } catch {
    await sendMessageFromSQL(
      api,
      message,
      { success: false, message: "Không gửi được tin nhắn riêng, hãy kết bạn với bot trước." },
      true,
      30000
    );
  }
}

/* ------------------------------- Bắt đầu ván ------------------------------ */

async function startRound(api, message) {
  const botId = api.getBotId();
  const threadId = message.threadId;
  const senderId = normalizePlayerId(message.data.uidFrom);

  const content = removeMention(message).trim();
  const parts = content.split(/\s+/);
  const codeArg = (parts[2] || "").trim();

  const table = codeArg ? getTable(botId, threadId, codeArg) : resolveSenderTable(botId, threadId, senderId, findDealerTables);
  if (!table) {
    await sendMessageFromSQL(
      api,
      message,
      { success: false, message: "Không tìm thấy bàn phù hợp. Nếu bạn làm nhà cái nhiều bàn, hãy gõ 'batdau <mã>'." },
      true,
      30000
    );
    return;
  }
  if (senderId !== table.dealer.id) {
    await sendMessageFromSQL(api, message, { success: false, message: "Chỉ nhà cái mới được bắt đầu ván." }, true, 30000);
    return;
  }
  if (table.status !== "waiting") {
    await sendMessageFromSQL(api, message, { success: false, message: "Ván đang diễn ra rồi." }, true, 30000);
    return;
  }
  if (table.players.length === 0) {
    await sendMessageFromSQL(api, message, { success: false, message: "Cần ít nhất 1 người chơi để bắt đầu." }, true, 30000);
    return;
  }

  // lọc lại người chơi đủ số dư ngay trước khi chia bài
  const eligiblePlayers = [];
  const removedNames = [];
  for (const p of table.players) {
    const balanceResult = await getPlayerBalance(p.id);
    if (balanceResult.success && new Big(balanceResult.balance).gte(table.betAmount)) {
      eligiblePlayers.push(p);
    } else {
      removedNames.push(p.name);
    }
  }

  if (eligiblePlayers.length === 0) {
    await sendMessageFromSQL(
      api,
      message,
      { success: false, message: "Không còn ai đủ số dư để chơi ván này." },
      true,
      30000
    );
    return;
  }

  table.players = eligiblePlayers;
  table.status = "playing";

  const deck = createShuffledDeck();
  const hands = {};
  for (const p of table.players) hands[p.id] = { cards: [deck.pop(), deck.pop()] };
  hands[table.dealer.id] = { cards: [deck.pop(), deck.pop()] };

  table.round = {
    deck,
    hands,
    order: table.players.map((p) => p.id),
    turnIndex: 0,
  };
  saveGameData();

  await sendTableSnapshot(api, table);

  if (removedNames.length) {
    await api.sendMessage(
      { msg: `⚠️ Không đủ số dư nên bị loại khỏi ván này: ${removedNames.join(", ")}`, ttl: 30000 },
      table.threadId,
      MessageType.GroupMessage
    );
  }

  await beginTurn(api, table);
}

async function dealCardTo(table, playerId) {
  const card = table.round.deck.pop();
  table.round.hands[playerId].cards.push(card);
  return card;
}

/**
 * Tạo message có gắn tag (@mention) thật vào đúng người chơi, dùng cho các thông báo
 * trong nhóm (vd: "Tới lượt: {name}"). Truyền template với đúng 1 chỗ "{name}".
 */
function buildTaggedMessage(template, playerId, playerName) {
  const idx = template.indexOf("{name}");
  if (idx === -1) return { msg: template, mentions: [] };
  const before = template.slice(0, idx);
  const after = template.slice(idx + "{name}".length);
  const msg = before + playerName + after;
  return { msg, mentions: [{ uid: playerId, pos: before.length, len: playerName.length }] };
}

async function beginTurn(api, table) {
  const round = table.round;
  const currentId = round.order[round.turnIndex] ?? table.dealer.id;
  const isDealerTurn = round.turnIndex >= round.order.length;
  const actualId = isDealerTurn ? table.dealer.id : currentId;
  const actualName = isDealerTurn ? table.dealer.name : table.players.find((p) => p.id === actualId)?.name;

  await sendTableSnapshot(api, table);

  const hand = round.hands[actualId];

  if (mustStand(hand.cards)) {
    await notifyHandLocked(api, table, actualId, actualName);
    return advanceTurn(api, table);
  }

  await sendTurnPrompt(api, table, actualId, actualName);
}

async function notifyHandLocked(api, table, playerId, playerName) {
  const cards = table.round.hands[playerId].cards;
  const evalResult = evaluateHand(cards);
  try {
    await sendHandImage(api, playerId, playerName, cards, {
      caption: `🎴 Bài của bạn: ${handLabel(cards)}\n📊 ${typeLabel(evalResult)}\n✅ Bài đã tự dừng, không thể rút thêm.`,
    });
  } catch {}
  // Không công bố điểm/loại bài ra nhóm — chỉ báo đã xong lượt.
  await api.sendMessage(
    { msg: `✅ ${playerName} đã hoàn tất lượt.`, ttl: 30000 },
    table.threadId,
    MessageType.GroupMessage
  );
}

async function sendTurnPrompt(api, table, playerId, playerName) {
  const hand = table.round.hands[playerId];
  const evalResult = evaluateHand(hand.cards);

  try {
    await sendHandImage(api, playerId, playerName, hand.cards, {
      badge: `Tới lượt bạn, có ${TURN_TIMEOUT_MS / 1000} giây.`,
      caption:
        `🎴 Bài của bạn\n` +
        `• rút — bốc thêm 1 lá\n` +
        `• dằn — dừng, giữ bài\n` +
        `📊 Hiện tại: ${typeLabel(evalResult)}`,
    });
  } catch {
    // Không gửi được bài riêng giữa ván (vd. vừa hủy kết bạn với bot) — đá luôn khỏi bàn
    // thay vì để họ nằm im trong bàn có thể gây lỗi ở các bước sau (kết ván, xem bài...).
    const idx = table.players.findIndex((p) => p.id === playerId);
    if (idx !== -1) table.players.splice(idx, 1);

    const failMsg = buildTaggedMessage(
      `⚠️ Không gửi được bài riêng cho {name} (chưa/không còn kết bạn với bot). Đã đá khỏi bàn để ván tiếp tục.`,
      playerId,
      playerName
    );
    await api.sendMessage(
      { msg: failMsg.msg, mentions: failMsg.mentions, ttl: 30000 },
      table.threadId,
      MessageType.GroupMessage
    );
    return advanceTurn(api, table);
  }

  const turnMsg = buildTaggedMessage(
    `🎯 Tới lượt: {name}. Bot đã gửi bài vào tin nhắn riêng, hãy trả lời bot.`,
    playerId,
    playerName
  );
  await api.sendMessage(
    { msg: turnMsg.msg, mentions: turnMsg.mentions, ttl: 30000 },
    table.threadId,
    MessageType.GroupMessage
  );

  const timer = setTimeout(() => {
    handlePlayerAction(api, table, playerId, "dan", true).catch((err) =>
      console.error("Lỗi khi tự động dằn (timeout xì dách):", err)
    );
  }, TURN_TIMEOUT_MS);

  pendingTurns.set(playerId, { tableKey: tableKey(table.botId, table.threadId, table.code), timer });
}

async function advanceTurn(api, table) {
  table.round.turnIndex++;
  saveGameData();
  if (table.round.turnIndex > table.round.order.length) {
    return settleRound(api, table);
  }
  await beginTurn(api, table);
}

/**
 * Xử lý hành động "rút"/"dằn" nhắn riêng từ người chơi.
 * @returns {boolean} true nếu tin nhắn riêng này đã được xử lý bởi game xì dách
 */
export async function handleXiDachPrivateAction(api, message) {
  if (message.type !== MessageType.DirectMessage) return false;
  const senderId = normalizePlayerId(message.data.uidFrom);
  const pending = pendingTurns.get(senderId);
  if (!pending) return false;

  const rawContent = message.data.content;
  if (typeof rawContent !== "string") return false;
  const normalized = rawContent
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^!/, "");

  let action = null;
  if (["rut", "rut them", "boc", "hit"].includes(normalized)) action = "rut";
  else if (["dan", "dung", "stand", "stop"].includes(normalized)) action = "dan";
  else return false;

  const table = [...tables.values()].find((t) => tableKey(t.botId, t.threadId, t.code) === pending.tableKey);
  if (!table) {
    clearPendingTurn(senderId);
    return false;
  }

  // Cùng lý do như handleXiDachReaction: chỉ đúng tài khoản bot đã tạo bàn này mới được
  // xử lý tiếp tin nhắn riêng "rút"/"dằn" — tránh trường hợp nhiều tài khoản bot cùng xử lý
  // 1 tin nhắn riêng, dẫn đến "Tới lượt..." + ảnh bàn bị gửi lặp lại nhiều lần cho cùng 1 lượt.
  if (table.botId !== api.getBotId()) return false;

  await handlePlayerAction(api, table, senderId, action, false);
  return true;
}

async function handlePlayerAction(api, table, playerId, action, isTimeout) {
  clearPendingTurn(playerId);

  if (!table.round) return;
  const round = table.round;
  const currentId = round.order[round.turnIndex] ?? table.dealer.id;
  if (currentId !== playerId) return; // không phải lượt của người này (đã bị timeout xử lý trước đó)

  const hand = round.hands[playerId];
  const playerName = playerId === table.dealer.id ? table.dealer.name : table.players.find((p) => p.id === playerId)?.name;

  if (action === "rut" && !mustStand(hand.cards)) {
    const card = await dealCardTo(table, playerId);
    const evalResult = evaluateHand(hand.cards);
    const stoppedNow = mustStand(hand.cards);
    const extraNote = stoppedNow ? `\n✅ Bài đã tự dừng.` : `\n👉 Gõ "rút" để bốc thêm hoặc "dằn" để dừng.`;
    try {
      await sendHandImage(api, playerId, playerName, hand.cards, {
        caption: `🃏 Bạn đã rút: ${cardLabel(card)}\n🎴 Bài hiện tại: ${handLabel(hand.cards)} (${typeLabel(
          evalResult
        )})${extraNote}`,
      });
    } catch {}

    if (stoppedNow) {
      // Không công bố điểm/loại bài ra nhóm — chỉ báo đã xong lượt.
      await api.sendMessage(
        { msg: `✅ ${playerName} đã hoàn tất lượt.`, ttl: 30000 },
        table.threadId,
        MessageType.GroupMessage
      );
      return advanceTurn(api, table); // beginTurn bên trong sẽ tự cập nhật lại ảnh bàn
    }

    // Vẫn còn được rút tiếp — cập nhật ảnh bàn ở nhóm để mọi người thấy số lá mới
    // (ảnh chỉ hiện SỐ LÁ, không hiện điểm/loại bài — xem createXiDachPlayingImage).
    await sendTableSnapshot(api, table);
    return sendTurnPrompt(api, table, playerId, playerName);
  }

  // dằn (hoặc rút khi đã bị buộc dừng)
  const evalResult = evaluateHand(hand.cards);
  try {
    await sendHandImage(api, playerId, playerName, hand.cards, {
      caption: isTimeout
        ? `⌛ Hết giờ, bot tự động "dằn" giúp bạn.\n🎴 Bài: ${handLabel(hand.cards)} (${typeLabel(evalResult)})`
        : `✋ Bạn đã dằn.\n🎴 Bài: ${handLabel(hand.cards)} (${typeLabel(evalResult)})`,
    });
  } catch {}

  // Không công bố điểm/loại bài ra nhóm — chỉ báo đã xong lượt.
  await api.sendMessage(
    { msg: `✅ ${playerName} đã hoàn tất lượt.`, ttl: 30000 },
    table.threadId,
    MessageType.GroupMessage
  );

  await advanceTurn(api, table);
}

/* -------------------------------- Kết ván --------------------------------- */

async function settleRound(api, table) {
  const round = table.round;
  const dealerHand = round.hands[table.dealer.id];
  const dealerEval = evaluateHand(dealerHand.cards);

  const resultPlayers = [];
  let dealerNetTotal = new Big(0);

  for (const p of table.players) {
    const hand = round.hands[p.id];
    const playerEval = evaluateHand(hand.cards);

    let netDelta;
    let outcomeLabel;

    if (playerEval.busted) {
      netDelta = table.betAmount.neg();
      outcomeLabel = "Thua (Nổ)";
    } else if (dealerEval.busted) {
      netDelta = table.betAmount.mul(playerEval.multiplier);
      outcomeLabel = `Thắng x${playerEval.multiplier}`;
    } else {
      const cmp = compareHands(playerEval, dealerEval);
      if (cmp > 0) {
        netDelta = table.betAmount.mul(playerEval.multiplier);
        outcomeLabel = `Thắng x${playerEval.multiplier}`;
      } else if (cmp < 0) {
        netDelta = table.betAmount.mul(dealerEval.multiplier).neg();
        outcomeLabel = `Thua x${dealerEval.multiplier}`;
      } else {
        netDelta = new Big(0);
        outcomeLabel = "Hòa";
      }
    }

    await updatePlayerBalance(p.id, netDelta.toNumber(), netDelta.gt(0), netDelta.toNumber());
    await addGameRankPoints(p.id, { won: netDelta.gt(0) });
    dealerNetTotal = dealerNetTotal.minus(netDelta);

    resultPlayers.push({
      name: p.name,
      cards: hand.cards,
      label: `${typeLabel(playerEval)} — ${netDelta.gte(0) ? "+" : ""}${formatCurrency(netDelta)} VNĐ`,
      outcome: outcomeLabel,
    });
  }

  await updatePlayerBalance(table.dealer.id, dealerNetTotal.toNumber(), dealerNetTotal.gt(0), dealerNetTotal.toNumber());
  await addGameRankPoints(table.dealer.id, { won: dealerNetTotal.gt(0) });

  // Không thu hồi ảnh "đang diễn ra" cũ nữa — ảnh kết quả được gửi nối tiếp,
  // giữ nguyên chuỗi log diễn biến ván đấu (giống bot mẫu).

  // Công bố kết quả CHỈ bằng ảnh — không kèm text mô tả thắng/thua.
  try {
    const resultImagePath = await createXiDachResultImage({
      dealerName: table.dealer.name,
      dealerCards: dealerHand.cards,
      dealerLabel: `${typeLabel(dealerEval)} (${dealerEval.total})`,
      players: resultPlayers,
    });
    await api.sendMessage(
      { msg: `🎴 #${table.code}`, attachments: [resultImagePath], ttl: 300000 },
      table.threadId,
      MessageType.GroupMessage
    );
  } catch (err) {
    console.error("Lỗi khi gửi ảnh kết quả Xì Dách:", err?.message || err);
  }

  // Đóng bàn ngay sau ván — mỗi bàn (mỗi mã) chỉ dùng cho đúng 1 ván.
  // Ai muốn chơi tiếp thì tạo bàn mới ("tao <cược>") và sẽ nhận mã bàn mới,
  // để không bị lẫn với các bàn khác đang mở song song trong cùng nhóm.
  removeTable(table);
  saveGameData();
}
