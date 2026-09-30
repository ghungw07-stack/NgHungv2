import Big from "big.js";
import fs from "fs/promises";
import { randomUUID } from "crypto";
import {
  adjustPlayerBalanceSafely,
  connection,
  getPlayerBalance,
  recordGameHistory,
} from "../../../database/index.js";
import { formatCurrency, parseGameAmount } from "../../../utils/format-util.js";
import { gameSenderMessage } from "../../../utils/game-mentions.js";
import { sendMessageFromSQL } from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import { checkBeforeJoinGame } from "../index.js";
import { getCurrentPrivateGameServer, getPrivateGameServerForApi } from "../private-game-server.js";
import { createForexTerminalImage } from "./canvas.js";
import {
  FOREX_PAIRS,
  calculateForexPosition,
  formatForexPrice,
  getForexQuote,
  normalizeForexPair,
  parseForexLeverage,
  roundForexPrice,
} from "./rules.js";

export { calculateForexPosition, formatForexPrice, normalizeForexPair, parseForexLeverage } from "./rules.js";

const MARKET_INTERVAL = 60_000;
const MAX_OPEN_POSITIONS = 5;
const MIN_MARGIN = new Big(100_000);
const OPEN_FEE_RATE = new Big("0.0015");
const CLOSE_FEE_RATE = new Big("0.0015");

function serverKey(api) {
  const privateServer = getCurrentPrivateGameServer() || (api ? getPrivateGameServerForApi(api) : null);
  return String(privateServer?.serverId || api?.getBotId?.() || "global");
}

function forexArgs(message) {
  const raw = typeof message?.data?.content === "object"
    ? message.data.content?.title || ""
    : message?.data?.content || "";
  const tokens = String(raw).trim().split(/\s+/u).filter(Boolean);
  const index = tokens.findIndex((token) => /(?:^|[!>./#$?%^&*+\-])forex$/iu.test(token));
  return index >= 0 ? tokens.slice(index + 1) : tokens.slice(1);
}

function roundPrice(pair, value) {
  return roundForexPrice(pair, value);
}

function seedCandles(pair, points = 60) {
  const config = FOREX_PAIRS[pair];
  let price = config.base * (0.985 + Math.random() * 0.03);
  const start = Date.now() - points * MARKET_INTERVAL;
  const candles = [];
  for (let index = 0; index < points; index++) {
    const open = price;
    const drift = (config.base - open) / config.base * 0.025;
    const move = drift + (Math.random() - 0.5) * config.volatility * 2;
    const close = Math.max(config.base * 0.65, open * (1 + move));
    const wick = open * config.volatility * (0.15 + Math.random() * 0.8);
    candles.push({
      t: start + index * MARKET_INTERVAL,
      o: roundPrice(pair, open),
      h: roundPrice(pair, Math.max(open, close) + wick),
      l: roundPrice(pair, Math.min(open, close) - wick),
      c: roundPrice(pair, close),
    });
    price = close;
  }
  return candles;
}

function nextCandle(pair, previous, timestamp) {
  const config = FOREX_PAIRS[pair];
  const open = Number(previous?.c || config.base);
  const meanReversion = (config.base - open) / config.base * 0.018;
  const impulse = (Math.random() - 0.5) * config.volatility * 2;
  const close = Math.max(config.base * 0.65, open * (1 + meanReversion + impulse));
  const wick = open * config.volatility * (0.18 + Math.random() * 0.9);
  return {
    t: timestamp,
    o: roundPrice(pair, open),
    h: roundPrice(pair, Math.max(open, close) + wick),
    l: roundPrice(pair, Math.min(open, close) - wick),
    c: roundPrice(pair, close),
  };
}

function createMarketDocument(id, now = Date.now()) {
  const candles = Object.fromEntries(Object.keys(FOREX_PAIRS).map((pair) => [pair, seedCandles(pair)]));
  const prices = Object.fromEntries(Object.entries(candles).map(([pair, series]) => [pair, series.at(-1).c]));
  return { _id: id, prices, candles, updatedAt: new Date(now) };
}

async function refreshMarket(collection, document, now = Date.now()) {
  const lastUpdate = new Date(document.updatedAt || 0).getTime();
  const missingTicks = Math.min(120, Math.max(0, Math.floor((now - lastUpdate) / MARKET_INTERVAL)));
  if (!missingTicks) return document;

  const candles = { ...(document.candles || {}) };
  const prices = { ...(document.prices || {}) };
  for (const pair of Object.keys(FOREX_PAIRS)) {
    const series = Array.isArray(candles[pair]) && candles[pair].length ? [...candles[pair]] : seedCandles(pair);
    for (let index = 0; index < missingTicks; index++) {
      series.push(nextCandle(pair, series.at(-1), lastUpdate + (index + 1) * MARKET_INTERVAL));
    }
    candles[pair] = series.slice(-72);
    prices[pair] = candles[pair].at(-1).c;
  }

  const updatedAt = new Date(lastUpdate + missingTicks * MARKET_INTERVAL);
  const result = await collection.updateOne(
    { _id: document._id, updatedAt: document.updatedAt },
    { $set: { prices, candles, updatedAt } }
  );
  return result.modifiedCount === 1
    ? { ...document, prices, candles, updatedAt }
    : (await collection.findOne({ _id: document._id })) || document;
}

async function getMarket(api) {
  const id = serverKey(api);
  const collection = connection.collection("forex_markets");
  let document = await collection.findOne({ _id: id });
  if (!document) {
    document = createMarketDocument(id);
    try {
      await collection.insertOne(document);
    } catch {
      document = await collection.findOne({ _id: id });
    }
  }
  return refreshMarket(collection, document);
}

const forexMarketTimer = setInterval(async () => {
  try {
    if (!connection) return;
    const collection = connection.collection("forex_markets");
    const markets = await collection.find({}).toArray();
    await Promise.all(markets.map((document) => refreshMarket(collection, document)));
  } catch (error) {
    console.error("[forex] Không thể cập nhật thị trường:", error?.message || error);
  }
}, 30_000);
forexMarketTimer.unref?.();

function help(prefix) {
  return `💹 FOREX TERMINAL — GIAO DỊCH KÝ QUỸ

${prefix}forex bang [EURUSD]
— Xem terminal nến M1, watchlist và các lệnh đang mở

${prefix}forex buy EURUSD 1m x25
— BUY EUR/USD bằng 1 triệu tiền ký quỹ, đòn bẩy x25
${prefix}forex sell XAUUSD 2m x50
— SELL vàng bằng 2 triệu tiền ký quỹ, đòn bẩy x50

${prefix}forex lenh
— Xem P/L thả nổi và Equity hiện tại
${prefix}forex dong <mã_lệnh|all>
— Chốt một lệnh hoặc toàn bộ lệnh đang mở
${prefix}forex top
— Top lợi nhuận Forex đã chốt

Cặp hỗ trợ: EURUSD · GBPUSD · USDJPY · AUDUSD · USDCHF · XAUUSD
Đòn bẩy: x10 · x25 · x50 · x100. Ký quỹ tối thiểu 100.000 VNĐ; phí mở/đóng 0,15%. Giá mô phỏng cập nhật mỗi phút. Equity về 0 sẽ mất toàn bộ ký quỹ.`;
}

async function playerSnapshot(playerId, server, market) {
  const positions = await connection.collection("forex_positions")
    .find({ server, playerId: String(playerId), status: "open" })
    .sort({ openedAt: -1 })
    .toArray();
  return positions.map((position) => ({
    ...position,
    ...calculateForexPosition(position, market.prices[position.pair]),
  }));
}

async function sendTerminal(api, message, market, pair, positions, wallet) {
  const image = await createForexTerminalImage({
    market,
    pair,
    positions,
    wallet,
    playerName: message.data.dName || message.data.uidFrom,
  });
  try {
    await api.sendMessage({
      ...gameSenderMessage(message, `💹 Forex M1 · ${pair} · Giá cập nhật mỗi phút.`),
      attachments: [image],
      ttl: 120_000,
      isUseProphylactic: true,
    }, message.threadId, message.type);
  } finally {
    await fs.unlink(image).catch(() => {});
  }
}

async function openPosition(api, message, market, server, args, side) {
  const playerId = String(message.data.uidFrom);
  const pair = normalizeForexPair(args[1]);
  const rawMargin = args[2];
  const leverage = parseForexLeverage(args[3]);
  if (!pair || !rawMargin || !leverage) {
    return sendMessageFromSQL(api, message, {
      success: false,
      message: `Dùng: ${getGlobalPrefix(api.getBotId())}forex ${side} <EURUSD|GBPUSD|USDJPY|AUDUSD|USDCHF|XAUUSD> <tiền> <x10|x25|x50|x100>`,
    }, true, 30_000);
  }

  const balanceResult = await getPlayerBalance(playerId);
  if (!balanceResult?.success) {
    return sendMessageFromSQL(api, message, { success: false, message: balanceResult?.message || "Không lấy được số dư." }, true, 30_000);
  }
  let margin;
  try {
    const parsed = parseGameAmount(rawMargin, balanceResult.balance);
    margin = parsed === "allin"
      ? new Big(balanceResult.balance).div(new Big(1).plus(OPEN_FEE_RATE)).round(0, Big.roundDown)
      : new Big(parsed).round(0, Big.roundDown);
  } catch {
    return sendMessageFromSQL(api, message, { success: false, message: "Tiền ký quỹ không hợp lệ." }, true, 30_000);
  }
  if (margin.lt(MIN_MARGIN)) {
    return sendMessageFromSQL(api, message, { success: false, message: `Ký quỹ tối thiểu ${formatCurrency(MIN_MARGIN)} VNĐ.` }, true, 30_000);
  }

  const positions = connection.collection("forex_positions");
  const openCount = await positions.countDocuments({ server, playerId, status: "open" });
  if (openCount >= MAX_OPEN_POSITIONS) {
    return sendMessageFromSQL(api, message, { success: false, message: `Bạn chỉ được mở tối đa ${MAX_OPEN_POSITIONS} lệnh cùng lúc.` }, true, 30_000);
  }

  const fee = margin.times(OPEN_FEE_RATE).round(0, Big.roundUp);
  const charged = margin.plus(fee);
  const debit = await adjustPlayerBalanceSafely(playerId, charged.neg().toString());
  if (!debit.success) {
    return sendMessageFromSQL(api, message, { success: false, message: `Số dư không đủ cho ký quỹ và phí mở lệnh. Cần ${formatCurrency(charged)} VNĐ.` }, true, 30_000);
  }

  const currentQuote = getForexQuote(pair, market.prices[pair]);
  const entryPrice = side === "buy" ? currentQuote.ask : currentQuote.bid;
  const position = {
    _id: randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase(),
    server,
    playerId,
    playerName: message.data.dName || playerId,
    pair,
    side,
    leverage,
    margin: margin.toString(),
    openFee: fee.toString(),
    entryPrice: String(entryPrice),
    status: "open",
    openedAt: new Date(),
  };
  try {
    await positions.insertOne(position);
  } catch (error) {
    await adjustPlayerBalanceSafely(playerId, charged.toString());
    throw error;
  }

  recordGameHistory({
    playerId,
    gameName: "Forex",
    gameKey: "forex",
    choice: `${side.toUpperCase()} ${pair} x${leverage}`,
    amount: margin.toString(),
    netAmount: fee.neg().toString(),
    isWin: null,
    detail: `Mở lệnh #${position._id} tại ${formatForexPrice(pair, entryPrice)}; ký quỹ ${formatCurrency(margin)} VNĐ`,
  }).catch(() => {});

  return sendMessageFromSQL(api, message, {
    success: true,
    message: `✅ MỞ LỆNH THÀNH CÔNG
━━━━━━━━━━━━━━━━━━
${side === "buy" ? "🟢 BUY" : "🔴 SELL"} ${pair} · x${leverage}
🎫 Mã lệnh: ${position._id}
💹 Giá vào: ${formatForexPrice(pair, entryPrice)}
💰 Ký quỹ: ${formatCurrency(margin)} VNĐ
🧾 Phí mở: ${formatCurrency(fee)} VNĐ
📦 Quy mô vị thế: ${formatCurrency(margin.times(leverage))} VNĐ
💳 Ví còn lại: ${formatCurrency(debit.balance)} VNĐ`,
  }, true, 30_000);
}

async function closeOnePosition(api, message, market, position) {
  const positions = connection.collection("forex_positions");
  const calculation = calculateForexPosition(position, market.prices[position.pair]);
  const grossReturn = calculation.equity.gt(0) ? calculation.equity : new Big(0);
  const closeFee = grossReturn.gt(0) ? grossReturn.times(CLOSE_FEE_RATE).round(0, Big.roundUp) : new Big(0);
  const payout = grossReturn.gt(closeFee) ? grossReturn.minus(closeFee) : new Big(0);
  const claimed = await positions.updateOne(
    { _id: position._id, status: "open" },
    { $set: { status: "settling", exitPrice: String(calculation.exitPrice), pnl: calculation.pnl.toString(), closeFee: closeFee.toString(), settlingAt: new Date() } }
  );
  if (claimed.modifiedCount !== 1) return null;

  const credit = payout.gt(0) ? await adjustPlayerBalanceSafely(position.playerId, payout.toString()) : { success: true, balance: null };
  if (!credit.success) {
    await positions.updateOne({ _id: position._id, status: "settling" }, { $set: { status: "open" }, $unset: { settlingAt: "", exitPrice: "", pnl: "", closeFee: "" } });
    throw new Error("Không thể hoàn tiền ký quỹ vào ví.");
  }

  const netResult = payout.minus(position.margin || 0).minus(position.openFee || 0);
  await positions.updateOne(
    { _id: position._id, status: "settling" },
    { $set: { status: calculation.liquidated ? "liquidated" : "closed", payout: payout.toString(), netResult: netResult.toString(), closedAt: new Date() }, $unset: { settlingAt: "" } }
  );
  recordGameHistory({
    playerId: position.playerId,
    gameName: "Forex",
    gameKey: "forex",
    choice: `${position.side.toUpperCase()} ${position.pair} x${position.leverage}`,
    amount: position.margin,
    netAmount: netResult.toString(),
    isWin: netResult.gt(0) ? true : netResult.lt(0) ? false : null,
    detail: `Đóng #${position._id} tại ${formatForexPrice(position.pair, calculation.exitPrice)}`,
  }).catch(() => {});
  return { position, calculation, payout, closeFee, netResult, wallet: credit.balance };
}

async function settleLiquidatedPositions(api, message, market, server, playerId) {
  const openPositions = await connection.collection("forex_positions")
    .find({ server, playerId: String(playerId), status: "open" })
    .toArray();
  for (const position of openPositions) {
    if (calculateForexPosition(position, market.prices[position.pair]).liquidated) {
      await closeOnePosition(api, message, market, position);
    }
  }
}

async function closePositions(api, message, market, server, target) {
  const playerId = String(message.data.uidFrom);
  const positionsCollection = connection.collection("forex_positions");
  const query = { server, playerId, status: "open" };
  if (String(target).toLowerCase() !== "all") query._id = String(target || "").toUpperCase();
  const positions = await positionsCollection.find(query).sort({ openedAt: 1 }).toArray();
  if (!positions.length) {
    return sendMessageFromSQL(api, message, { success: false, message: "Không tìm thấy lệnh Forex đang mở cần đóng." }, true, 30_000);
  }

  const results = [];
  for (const position of positions) {
    const result = await closeOnePosition(api, message, market, position);
    if (result) results.push(result);
  }
  const totalPayout = results.reduce((sum, result) => sum.plus(result.payout), new Big(0));
  const totalNet = results.reduce((sum, result) => sum.plus(result.netResult), new Big(0));
  const lines = results.map(({ position, calculation, netResult }) =>
    `${netResult.gte(0) ? "🟢" : "🔴"} #${position._id} ${position.side.toUpperCase()} ${position.pair}: ${netResult.gte(0) ? "+" : ""}${formatCurrency(netResult)} VNĐ · giá ${formatForexPrice(position.pair, calculation.exitPrice)}`
  );
  return sendMessageFromSQL(api, message, {
    success: true,
    message: `💼 ĐÃ ĐÓNG ${results.length} LỆNH
${lines.join("\n")}

💵 Hoàn về ví: ${formatCurrency(totalPayout)} VNĐ
📊 Kết quả ròng: ${totalNet.gte(0) ? "+" : ""}${formatCurrency(totalNet)} VNĐ`,
  }, true, 60_000);
}

export async function handleForex(api, message, groupSettings) {
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return true;

  const prefix = getGlobalPrefix(api.getBotId());
  const args = forexArgs(message);
  const action = String(args[0] || "").toLowerCase();
  if (!action || ["help", "huongdan", "hướngdẫn"].includes(action)) {
    return sendMessageFromSQL(api, message, { success: true, message: help(prefix) }, true, 60_000);
  }

  const market = await getMarket(api);
  const server = serverKey(api);
  const playerId = String(message.data.uidFrom);
  await settleLiquidatedPositions(api, message, market, server, playerId);
  const normalizedAction = action === "mua" ? "buy" : action === "ban" || action === "bán" ? "sell" : action;

  if (["bang", "xem", "chart", "lenh", "lệnh", "vi", "ví"].includes(normalizedAction)) {
    const selectedPair = normalizeForexPair(args[1]) || "EURUSD";
    const [balance, positions] = await Promise.all([
      getPlayerBalance(playerId),
      playerSnapshot(playerId, server, market),
    ]);
    await sendTerminal(api, message, market, selectedPair, positions, balance?.balance || 0);
    return true;
  }

  if (["buy", "sell"].includes(normalizedAction)) {
    return openPosition(api, message, market, server, args, normalizedAction);
  }

  if (["dong", "đóng", "close"].includes(normalizedAction)) {
    if (!args[1]) {
      return sendMessageFromSQL(api, message, { success: false, message: `Dùng: ${prefix}forex dong <mã_lệnh|all>` }, true, 30_000);
    }
    return closePositions(api, message, market, server, args[1]);
  }

  if (normalizedAction === "top") {
    const rows = await connection.collection("forex_positions").aggregate([
      { $match: { server, status: { $in: ["closed", "liquidated"] } } },
      { $group: { _id: "$playerId", name: { $last: "$playerName" }, profit: { $sum: { $toDecimal: "$netResult" } }, trades: { $sum: 1 } } },
      { $sort: { profit: -1 } },
      { $limit: 10 },
    ]).toArray();
    const lines = rows.map((row, index) => `${index + 1}. ${row.name || row._id} — ${formatCurrency(row.profit?.toString?.() || 0)} VNĐ (${row.trades} lệnh)`);
    return sendMessageFromSQL(api, message, { success: true, message: `🏆 TOP FOREX TRADER\n${lines.join("\n") || "Chưa có lệnh nào được chốt."}` }, true, 60_000);
  }

  return sendMessageFromSQL(api, message, { success: false, message: help(prefix) }, true, 60_000);
}
