import Big from "big.js";
import { MessageType } from "../../../api-zalo/index.js";
import { getPlayerBalance, updatePlayerBalance, ensurePlayerAccount, isPlayerBanned, addGameRankPoints } from "../../../database/player.js";
import { sendMessageFromSQL } from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import { formatCurrency, parseGameAmount, removeMention } from "../../../utils/format-util.js";
import { createXiDachHandImage } from "../../../utils/canvas/xidach.js";
import { createCardTableLobbyImage } from "../../../utils/canvas/card-table.js";
import { deleteFile } from "../../../utils/util.js";

const MIN_BET = 1000;
const MAX_PLAYERS = 4;
const tables = new Map();
const joinReactionMap = new Map();
const recentReactions = new Map();
const RANKS = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];
const SUITS = ["♠", "♣", "♦", "♥"];

const id = (value) => String(value);
const keyOf = (botId, threadId, game) => `${botId}_${threadId}_${game}`;
const cardText = (card) => `${card.rank}${card.suit}`;
const playerName = (message) => message.data.dName || id(message.data.uidFrom);

function extractMessageRef(sent) {
  const item = Array.isArray(sent) ? sent[0] : sent;
  const msgId = item?.message?.msgId ?? item?.msgId ?? item?.attachment?.[0]?.msgId ?? item?.attachments?.[0]?.msgId ?? item?.data?.msgId;
  const cliMsgId = item?.message?.cliMsgId ?? item?.cliMsgId ?? item?.attachment?.[0]?.cliMsgId ?? item?.attachment?.[0]?.clientId ?? item?.attachments?.[0]?.cliMsgId ?? item?.data?.cliMsgId;
  return msgId ? { msgId: String(msgId), cliMsgId: cliMsgId ? String(cliMsgId) : null } : null;
}

async function recallLobby(api, table) {
  if (!table.lobbyRef?.msgId || !table.lobbyRef?.cliMsgId) return;
  try {
    await api.undoMessage({ type: MessageType.GroupMessage, threadId: table.threadId, data: { quote: { globalMsgId: table.lobbyRef.msgId, cliMsgId: table.lobbyRef.cliMsgId } } });
  } catch {}
}

async function sendLobby(api, table) {
  await recallLobby(api, table);
  if (table.joinMsgId) joinReactionMap.delete(table.joinMsgId);
  const imagePath = await createCardTableLobbyImage({ game: table.game, ownerName: table.owner.name, players: table.players, betAmount: table.bet, maxPlayers: MAX_PLAYERS });
  const root = `${getGlobalPrefix(table.botId)}${table.game}`;
  try {
    const sent = await api.sendMessage({ msg: `♥ Thả tim ảnh để vào bàn · Chủ bàn gõ "${root} batdau".`, attachments: [imagePath], ttl: 600000 }, table.threadId, MessageType.GroupMessage);
    const ref = extractMessageRef(sent);
    table.lobbyRef = ref;
    table.joinMsgId = ref?.msgId || null;
    if (table.joinMsgId) joinReactionMap.set(table.joinMsgId, table.key);
  } finally {
    await deleteFile(imagePath);
  }
}

function removeTable(table) {
  tables.delete(table.key);
  if (table.joinMsgId) joinReactionMap.delete(table.joinMsgId);
}

function deck() {
  const cards = RANKS.flatMap((rank) => SUITS.map((suit) => ({ rank, suit })));
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function cardValue(card) {
  return RANKS.indexOf(card.rank) * 4 + SUITS.indexOf(card.suit);
}

function sortHand(cards) {
  return [...cards].sort((a, b) => cardValue(a) - cardValue(b));
}

async function reply(api, message, text, success = true) {
  return sendMessageFromSQL(api, message, { success, message: text }, true, 180000);
}

async function getBet(message, raw) {
  const balance = await getPlayerBalance(id(message.data.uidFrom));
  if (!balance.success) throw new Error(balance.message || "Không lấy được số dư.");
  const parsed = parseGameAmount(raw, balance.balance);
  const bet = parsed === "allin" ? new Big(balance.balance) : new Big(parsed);
  if (bet.lt(MIN_BET)) throw new Error(`Cược tối thiểu ${formatCurrency(MIN_BET)} VNĐ.`);
  if (new Big(balance.balance).lt(bet)) throw new Error("Số dư không đủ.");
  return bet;
}

async function sendHand(api, userId, name, cards, badge) {
  const sorted = sortHand(cards);
  const imagePath = await createXiDachHandImage({ playerName: name, cards: sorted, badge });
  const list = sorted.map((card, index) => `${index + 1}. ${cardText(card)}`).join("  ·  ");
  try {
    await api.sendMessage({ msg: `Bài của bạn:\n${list}`, attachments: [imagePath], ttl: 600000 }, userId, MessageType.DirectMessage);
  } finally {
    await deleteFile(imagePath);
  }
}

async function createTable(api, message, game, betRaw) {
  const tableKey = keyOf(api.getBotId(), message.threadId, game);
  const existing = tables.get(tableKey);
  if (existing) {
    if (existing.status !== "waiting") return reply(api, message, "Bàn của nhóm đang chơi, vui lòng đợi ván sau.", false);
    return joinTable(api, message, game);
  }
  const commandRoot = `${getGlobalPrefix(api.getBotId())}${game}`;
  if (!betRaw) return reply(api, message, `Thiếu mức cược. Ví dụ: ${commandRoot} tao 10k`, false);
  try {
    const bet = await getBet(message, betRaw);
    const createdWhileWaiting = tables.get(tableKey);
    if (createdWhileWaiting) {
      if (createdWhileWaiting.status !== "waiting") return reply(api, message, "Bàn của nhóm đang chơi, vui lòng đợi ván sau.", false);
      return joinTable(api, message, game);
    }
    const owner = { id: id(message.data.uidFrom), name: playerName(message) };
    tables.set(tableKey, { key: tableKey, game, botId: api.getBotId(), threadId: message.threadId, owner, players: [owner], bet, status: "waiting" });
    await sendLobby(api, tables.get(tableKey));
    return reply(api, message, `Đã tạo bàn ${game === "baicao" ? "Bài Cào" : "Tiến Lên"} cược ${formatCurrency(bet)} VNĐ.\nGõ "${commandRoot} vao" để tham gia; chủ bàn gõ "${commandRoot} batdau".`);
  } catch (error) {
    return reply(api, message, error.message, false);
  }
}

async function joinTable(api, message, game) {
  const table = tables.get(keyOf(api.getBotId(), message.threadId, game));
  if (!table || table.status !== "waiting") return reply(api, message, "Không có bàn đang chờ.", false);
  const result = await addPlayer(table, id(message.data.uidFrom), playerName(message));
  if (!result.success) return reply(api, message, result.message, false);
  await sendLobby(api, table);
  return reply(api, message, `${playerName(message)} đã vào bàn (${table.players.length}/${MAX_PLAYERS}).`);
}

async function addPlayer(table, userId, name) {
  if (table.players.some((p) => p.id === userId)) return { success: false, message: "Bạn đã ở trong bàn." };
  if (table.players.length >= MAX_PLAYERS) return { success: false, message: "Bàn đã đủ người." };
  const balance = await getPlayerBalance(userId);
  if (!balance.success || new Big(balance.balance).lt(table.bet)) return { success: false, message: "Số dư không đủ mức cược của bàn." };
  await ensurePlayerAccount(userId, name || userId, table.botId);
  table.players.push({ id: userId, name: name || userId });
  return { success: true };
}

async function leaveTable(api, message, game) {
  const table = tables.get(keyOf(api.getBotId(), message.threadId, game));
  if (!table || table.status !== "waiting") return reply(api, message, "Bạn không thể rời lúc này.", false);
  const userId = id(message.data.uidFrom);
  if (!table.players.some((p) => p.id === userId)) return reply(api, message, "Bạn không ở trong bàn.", false);
  if (table.owner.id === userId) {
    removeTable(table);
    return reply(api, message, "Chủ bàn đã rời, bàn chơi được hủy.");
  }
  table.players = table.players.filter((p) => p.id !== userId);
  await sendLobby(api, table);
  return reply(api, message, "Bạn đã rời bàn.");
}

function baiCaoScore(cards) {
  const isFaces = cards.every((card) => ["J", "Q", "K"].includes(card.rank));
  const points = cards.reduce((sum, card) => sum + (card.rank === "A" ? 1 : Number(card.rank) || 10), 0) % 10;
  return { tier: isFaces ? 2 : 1, points, label: isFaces ? "Ba Tây" : `${points} nút` };
}

async function startBaiCao(api, message, table) {
  if (table.players.length < 2) return reply(api, message, "Cần ít nhất 2 người.", false);
  const dealer = table.owner;
  const dealerBalance = await getPlayerBalance(dealer.id);
  if (!dealerBalance.success || new Big(dealerBalance.balance).lt(table.bet.mul(table.players.length - 1))) {
    return reply(api, message, "Chủ bàn không đủ tiền để trả tối đa cho mọi người.", false);
  }
  for (const p of table.players.filter((item) => item.id !== dealer.id)) {
    const balance = await getPlayerBalance(p.id);
    if (!balance.success || new Big(balance.balance).lt(table.bet)) return reply(api, message, `${p.name} không còn đủ tiền cược.`, false);
  }
  table.status = "playing";
  if (table.joinMsgId) joinReactionMap.delete(table.joinMsgId);
  const cards = deck();
  const hands = Object.fromEntries(table.players.map((p) => [p.id, [cards.pop(), cards.pop(), cards.pop()]]));
  await Promise.all(table.players.map((p) => sendHand(api, p.id, p.name, hands[p.id], "BÀI CÀO · 3 LÁ")));
  const dealerScore = baiCaoScore(hands[dealer.id]);
  let dealerNet = new Big(0);
  const lines = [`NHÀ CÁI ${dealer.name}: ${hands[dealer.id].map(cardText).join(" ")} · ${dealerScore.label}`];
  for (const p of table.players.filter((item) => item.id !== dealer.id)) {
    const score = baiCaoScore(hands[p.id]);
    const cmp = score.tier !== dealerScore.tier ? score.tier - dealerScore.tier : score.points - dealerScore.points;
    const delta = cmp > 0 ? table.bet : cmp < 0 ? table.bet.neg() : new Big(0);
    await updatePlayerBalance(p.id, delta.toNumber(), delta.gt(0), delta.toNumber());
    await addGameRankPoints(p.id, { won: delta.gt(0) });
    dealerNet = dealerNet.minus(delta);
    lines.push(`${p.name}: ${hands[p.id].map(cardText).join(" ")} · ${score.label} · ${cmp > 0 ? "THẮNG" : cmp < 0 ? "THUA" : "HÒA"} ${delta.eq(0) ? "" : `${delta.gt(0) ? "+" : ""}${formatCurrency(delta)}`}`);
  }
  await updatePlayerBalance(dealer.id, dealerNet.toNumber(), dealerNet.gt(0), dealerNet.toNumber());
  await addGameRankPoints(dealer.id, { won: dealerNet.gt(0) });
  removeTable(table);
  return reply(api, message, `KẾT QUẢ BÀI CÀO\n\n${lines.join("\n")}`);
}

function analyzePlay(cards) {
  const sorted = sortHand(cards);
  const ranks = sorted.map((c) => RANKS.indexOf(c.rank));
  const counts = new Map(ranks.map((rank) => [rank, ranks.filter((x) => x === rank).length]));
  const unique = [...counts.keys()].sort((a, b) => a - b);
  const high = cardValue(sorted.at(-1));
  if (cards.length === 1) return { type: "single", size: 1, high };
  if (unique.length === 1 && cards.length === 2) return { type: "pair", size: 2, high };
  if (unique.length === 1 && cards.length === 3) return { type: "triple", size: 3, high };
  if (unique.length === 1 && cards.length === 4) return { type: "four", size: 4, high };
  if (cards.length >= 3 && !unique.includes(12) && unique.length === cards.length && unique.every((v, i) => i === 0 || v === unique[i - 1] + 1)) {
    return { type: "straight", size: cards.length, high };
  }
  if (cards.length >= 6 && cards.length % 2 === 0 && unique.length === cards.length / 2 && unique.every((v, i) => counts.get(v) === 2 && (i === 0 || v === unique[i - 1] + 1))) {
    return { type: "pairs", size: cards.length, high };
  }
  return null;
}

function beats(play, previous) {
  if (!previous) return true;
  if (play.type === previous.type && play.size === previous.size) return play.high > previous.high;
  const previousIsTwo = previous.type === "single" && Math.floor(previous.high / 4) === 12;
  return previousIsTwo && (play.type === "four" || (play.type === "pairs" && play.size >= 6));
}

async function startTienLen(api, message, table) {
  if (table.players.length < 2) return reply(api, message, "Cần ít nhất 2 người.", false);
  for (const p of table.players) {
    const balance = await getPlayerBalance(p.id);
    if (!balance.success || new Big(balance.balance).lt(table.bet.mul(table.players.length - 1))) return reply(api, message, `${p.name} không đủ số dư đảm bảo ván.`, false);
  }
  table.status = "playing";
  if (table.joinMsgId) joinReactionMap.delete(table.joinMsgId);
  const cards = deck();
  table.hands = Object.fromEntries(table.players.map((p) => [p.id, sortHand(Array.from({ length: 13 }, () => cards.pop()))]));
  const openingPlayerId = table.players.find((p) => table.hands[p.id].some((card) => card.rank === "3" && card.suit === "♠"))?.id;
  table.turn = Math.max(0, table.players.findIndex((p) => p.id === openingPlayerId));
  table.firstTurn = true;
  table.lastPlay = null;
  table.lastPlayer = null;
  table.passed = new Set();
  const commandRoot = `${getGlobalPrefix(api.getBotId())}tienlen`;
  await Promise.all(table.players.map((p) => sendHand(api, p.id, p.name, table.hands[p.id], `Đánh bằng: ${commandRoot} danh 1 2 ...`)));
  return reply(api, message, `Tiến Lên bắt đầu! ${table.players[table.turn].name} giữ 3♠ và đi trước.\nGõ "${commandRoot} danh <số lá>" hoặc "${commandRoot} bo".`);
}

function nextTurn(table) {
  for (let i = 0; i < table.players.length; i++) {
    table.turn = (table.turn + 1) % table.players.length;
    if (!table.passed.has(table.players[table.turn].id)) return;
  }
}

async function playTienLen(api, message, table, indexes) {
  const userId = id(message.data.uidFrom);
  const current = table.players[table.turn];
  if (current.id !== userId) return reply(api, message, `Chưa tới lượt bạn. Đang chờ ${current.name}.`, false);
  const hand = table.hands[userId];
  const uniqueIndexes = [...new Set(indexes.map((x) => Number(x) - 1))];
  if (!uniqueIndexes.length || uniqueIndexes.some((x) => !Number.isInteger(x) || x < 0 || x >= hand.length)) return reply(api, message, "Số thứ tự lá bài không hợp lệ.", false);
  const selected = uniqueIndexes.map((x) => hand[x]);
  if (table.firstTurn && !selected.some((card) => card.rank === "3" && card.suit === "♠")) {
    return reply(api, message, "Lượt mở màn phải có lá 3♠.", false);
  }
  const play = analyzePlay(selected);
  if (!play) return reply(api, message, "Bộ bài không hợp lệ.", false);
  if (!beats(play, table.lastPlay)) return reply(api, message, "Bộ bài chưa đủ lớn để chặn lượt trước.", false);
  table.hands[userId] = hand.filter((_, index) => !uniqueIndexes.includes(index));
  table.lastPlay = play;
  table.lastPlayer = userId;
  table.firstTurn = false;
  if (table.hands[userId].length === 0) return finishTienLen(api, message, table, current);
  nextTurn(table);
  await sendHand(api, userId, current.name, table.hands[userId], `Còn ${table.hands[userId].length} lá`);
  return reply(api, message, `${current.name} đánh: ${selected.map(cardText).join(" ")}\nTới lượt ${table.players[table.turn].name}.`);
}

async function passTienLen(api, message, table) {
  const userId = id(message.data.uidFrom);
  const current = table.players[table.turn];
  if (current.id !== userId) return reply(api, message, `Chưa tới lượt bạn.`, false);
  if (!table.lastPlay) return reply(api, message, "Bạn đang có quyền đi đầu, không thể bỏ lượt.", false);
  table.passed.add(userId);
  const active = table.players.filter((p) => !table.passed.has(p.id));
  if (active.length === 1 && active[0].id === table.lastPlayer) {
    table.turn = table.players.findIndex((p) => p.id === table.lastPlayer);
    table.lastPlay = null;
    table.passed = new Set();
    return reply(api, message, `${current.name} bỏ lượt. ${table.players[table.turn].name} thắng vòng và được đi mới.`);
  }
  nextTurn(table);
  return reply(api, message, `${current.name} bỏ lượt. Tới lượt ${table.players[table.turn].name}.`);
}

async function finishTienLen(api, message, table, winner) {
  const prize = table.bet.mul(table.players.length - 1);
  for (const p of table.players) {
    const delta = p.id === winner.id ? prize : table.bet.neg();
    await updatePlayerBalance(p.id, delta.toNumber(), delta.gt(0), delta.toNumber());
    await addGameRankPoints(p.id, { won: delta.gt(0) });
  }
  removeTable(table);
  return reply(api, message, `${winner.name} đã hết bài và thắng ${formatCurrency(prize)} VNĐ!`);
}

async function guide(api, message, game) {
  const p = getGlobalPrefix(api.getBotId());
  const root = `${p}${game}`;
  const name = game === "baicao" ? "BÀI CÀO 3 LÁ" : "TIẾN LÊN MIỀN NAM";
  let text = `${name}\n${root} tao <cược> · tạo bàn\n${root} vao · vào bàn\n${root} roi · rời bàn\n${root} batdau · bắt đầu\n${root} xem · xem bàn\n${root} huy · hủy bàn`;
  if (game === "tienlen") text += `\n${root} bai · gửi lại bài riêng\n${root} danh 1 2 ... · đánh theo số lá\n${root} bo · bỏ lượt`;
  return reply(api, message, text);
}

export async function handleCardTableCommand(api, message, groupSettings, game) {
  const userId = id(message.data.uidFrom);
  if (await isPlayerBanned(userId)) return reply(api, message, "Tài khoản game đã bị khóa.", false);
  await ensurePlayerAccount(userId, playerName(message), api.getBotId());
  const parts = removeMention(message).trim().split(/\s+/);
  const sub = String(parts[1] || "").toLowerCase();
  const table = tables.get(keyOf(api.getBotId(), message.threadId, game));
  if (["tao", "create"].includes(sub)) return createTable(api, message, game, parts.slice(2).join(" "));
  if (["vao", "join"].includes(sub)) return joinTable(api, message, game);
  if (["roi", "leave"].includes(sub)) return leaveTable(api, message, game);
  if (["huy", "cancel"].includes(sub)) {
    if (!table || table.owner.id !== userId) return reply(api, message, "Chỉ chủ bàn mới được hủy.", false);
    removeTable(table);
    return reply(api, message, "Đã hủy bàn chơi.");
  }
  if (["xem", "status"].includes(sub)) {
    if (!table) return reply(api, message, "Nhóm chưa có bàn chơi.", false);
    return reply(api, message, `${game === "baicao" ? "BÀI CÀO" : "TIẾN LÊN"} · ${table.status === "waiting" ? "ĐANG CHỜ" : "ĐANG CHƠI"}\nCược: ${formatCurrency(table.bet)} VNĐ\nNgười chơi (${table.players.length}/${MAX_PLAYERS}): ${table.players.map((p) => p.name).join(", ")}`);
  }
  if (["batdau", "start"].includes(sub)) {
    if (!table || table.owner.id !== userId || table.status !== "waiting") return reply(api, message, "Chỉ chủ bàn đang chờ mới được bắt đầu.", false);
    return game === "baicao" ? startBaiCao(api, message, table) : startTienLen(api, message, table);
  }
  if (game === "tienlen" && sub === "danh" && table?.status === "playing") return playTienLen(api, message, table, parts.slice(2));
  if (game === "tienlen" && ["bo", "pass"].includes(sub) && table?.status === "playing") return passTienLen(api, message, table);
  if (game === "tienlen" && ["bai", "card"].includes(sub) && table?.status === "playing") {
    const player = table.players.find((p) => p.id === userId);
    if (!player) return reply(api, message, "Bạn không ở trong bàn.", false);
    await sendHand(api, userId, player.name, table.hands[userId], `Còn ${table.hands[userId].length} lá`);
    return reply(api, message, "Đã gửi lại bài qua tin nhắn riêng.");
  }
  return guide(api, message, game);
}

export async function handleCardTableReaction(api, reaction) {
  const msgId = reaction.data?.content?.rMsg?.[0]?.gMsgID?.toString() || "";
  if (!msgId || reaction.data?.content?.rType !== 5) return false;
  const tableKey = joinReactionMap.get(msgId);
  if (!tableKey) return false;
  const table = tables.get(tableKey);
  if (!table || table.status !== "waiting") {
    joinReactionMap.delete(msgId);
    return false;
  }
  if (table.botId !== api.getBotId()) return false;

  const userId = id(reaction.data.uidFrom);
  const dedupeKey = `${msgId}_${userId}`;
  const now = Date.now();
  if (now - (recentReactions.get(dedupeKey) || 0) < 5000) return true;
  recentReactions.set(dedupeKey, now);

  // Reaction cũng phải tuân thủ trạng thái bot/game; chỉ admin cấp cao được bỏ qua.
  const [{ groupSettingsAll }, { isAdmin }] = await Promise.all([
    import("../../../automations/event-send-msg.js"),
    import("../../../index.js"),
  ]);
  const settings = groupSettingsAll.getByID(table.botId)?.[table.threadId];
  const isHighestAdmin = isAdmin(table.botId, userId);
  if ((!settings?.activeBot || !settings?.activeGame) && !isHighestAdmin) return true;
  if (await isPlayerBanned(userId)) return true;

  let name = userId;
  try {
    const info = await api.getInfoMembers([userId]);
    name = info?.profiles?.[userId]?.zaloName || userId;
  } catch {}
  const result = await addPlayer(table, userId, name);
  if (!result.success) return true;
  await sendLobby(api, table);
  await api.sendMessage({ msg: `${name} đã vào bàn bằng cách thả tim (${table.players.length}/${MAX_PLAYERS}).`, ttl: 60000 }, table.threadId, MessageType.GroupMessage);
  return true;
}
