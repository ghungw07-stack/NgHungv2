import Big from "big.js";
import fs from "fs/promises";
import { connection, getPlayerBalance, getUsernameByIdZalo, updatePlayerBalanceByUsername, recordGameHistory } from "../../../database/index.js";
import { formatCurrency, parseGameAmount as parseGameAmountBase } from "../../../utils/format-util.js";
import { sendMessageFromSQL } from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import { checkBeforeJoinGame } from "../index.js";
import { getCurrentPrivateGameServer, getPrivateGameServerForApi } from "../private-game-server.js";
import { gameSenderMessage } from "../../../utils/game-mentions.js";
import { createVirtualStockMarketImage } from "./canvas.js";

const BASE = { SUNWIN: 10000, HITCLUB: 18500, HUNG: 7500, HUN: 24000, MESSI: 12000, RONALDO: 32000 };
const COMPANY_NAMES = {
  SUNWIN: "SunWin",
  HITCLUB: "HitClub",
  HUNG: "Hưng Group",
  HUN: "Hun Group",
  MESSI: "Messi Club",
  RONALDO: "Ronaldo Club",
};
const LEGACY_SYMBOL_MAP = { VNB: "SUNWIN", ZLO: "HITCLUB", BEN: "HUNG", GO88: "HUNG", CFE: "HUN", PHO: "MESSI", GAM: "RONALDO" };
const MARKET_INTERVAL = 5 * 60_000;
const FEE_RATE = 0.003; // 0.3%
const PROFIT_TAX_RATE = 0.05; // 5% thuế trên phần lời khi bán
const MIN_TRANSACTION = 10000; // 10.000 VNĐ

const key = (api) => {
  const p = getCurrentPrivateGameServer() || (api ? getPrivateGameServerForApi(api) : null);
  if (p?.serverId) return String(p.serverId);
  return String(api?.getBotId?.() || "global");
};

function getCoPhieuAoArgs(message) {
  const text = String(
    typeof message?.data?.content === "object"
      ? message.data.content?.title || ""
      : message?.data?.content || ""
  ).trim();
  const tokens = text.split(/\s+/).filter(Boolean);
  const idx = tokens.findIndex((t) => /(?:^|[!>./#$?%^&*+\-])cophieuao$/i.test(t));
  if (idx !== -1) {
    return tokens.slice(idx + 1);
  }
  return tokens.slice(1);
}

// Cổ Phiếu Ảo mua theo tiền: chuẩn hóa `all` về số dư trước khi bọc Big.
function parseGameAmount(amount, balance) {
  const parsed = parseGameAmountBase(amount, balance);
  return parsed === "allin" ? balance : parsed;
}

function seedHistory(price, points = 48) {
  const values = [Number(price)];
  for (let i = 1; i < points; i++) {
    const previous = values[0];
    const move = (Math.random() - 0.52) * 0.028;
    values.unshift(Math.max(Number(price) * 0.55, Math.round(previous * (1 + move))));
  }
  values[values.length - 1] = Number(price);
  return values;
}

const freshHistory = (prices) => Object.fromEntries(Object.entries(BASE).map(([symbol, price]) => {
  const history = prices?.[symbol];
  return [symbol, Array.isArray(history) && history.length > 1 ? history.slice(-48) : seedHistory(Number(prices?.[symbol] || price))];
}));

function nextPrices(prices) {
  return Object.fromEntries(Object.entries(BASE).map(([symbol, base]) => {
    const current = Number(prices?.[symbol] || base), drift = (base - current) / base * .03, move = (Math.random() - .5) * .10 + drift;
    return [symbol, Math.max(base * .25, Math.round(current * (1 + move)))];
  }));
}

async function refreshMarket(col, doc, now = Date.now()) {
  const history = freshHistory(doc.history || Object.fromEntries(Object.entries(doc.prices || BASE).map(([symbol, price]) => [symbol, [price]])));
  if (now - new Date(doc.updatedAt).getTime() < MARKET_INTERVAL) {
    if (!doc.history) { await col.updateOne({ _id: doc._id }, { $set: { history } }); return { ...doc, history }; }
    return doc;
  }
  const prices = nextPrices(doc.prices);
  Object.keys(prices).forEach((symbol) => { history[symbol] = [...history[symbol], prices[symbol]].slice(-48); });
  await col.updateOne({ _id: doc._id, updatedAt: doc.updatedAt }, { $set: { prices, history, updatedAt: now } });
  return { ...doc, prices, history, updatedAt: now };
}

async function market(api) {
  const id = key(api), col = connection.collection("virtual_stock_market"), now = Date.now();
  let doc = await col.findOne({ _id: id });
  if (!doc) {
    doc = { _id: id, prices: { ...BASE }, history: freshHistory(), updatedAt: now };
    await col.insertOne(doc);
    return doc;
  }
  const legacy = Object.keys(doc.prices || {}).some((symbol) => LEGACY_SYMBOL_MAP[symbol]);
  if (legacy) {
    const prices = { ...doc.prices }, history = { ...doc.history };
    for (const [oldSymbol, newSymbol] of Object.entries(LEGACY_SYMBOL_MAP)) {
      if (prices[oldSymbol] != null && prices[newSymbol] == null) prices[newSymbol] = prices[oldSymbol];
      if (history[oldSymbol] && !history[newSymbol]) history[newSymbol] = history[oldSymbol];
      delete prices[oldSymbol];
      delete history[oldSymbol];
    }
    for (const symbol of Object.keys(BASE)) {
      prices[symbol] ??= BASE[symbol];
      history[symbol] ??= [prices[symbol]];
    }
    await col.updateOne({ _id: id }, { $set: { prices, history } });
    doc = { ...doc, prices, history };
    const portfolios = connection.collection("virtual_stock_portfolios");
    for await (const portfolio of portfolios.find({ server: id })) {
      const holdings = { ...(portfolio.holdings || {}) }, migrated = {};
      for (const [symbol, holding] of Object.entries(holdings)) {
        const target = LEGACY_SYMBOL_MAP[symbol] || symbol;
        migrated[target] = migrated[target] ? { qty: migrated[target].qty + holding.qty, cost: new Big(migrated[target].cost).plus(holding.cost || 0).toString() } : holding;
      }
      if (JSON.stringify(holdings) !== JSON.stringify(migrated)) await portfolios.updateOne({ _id: portfolio._id }, { $set: { holdings: migrated } });
    }
  }
  return refreshMarket(col, doc, now);
}

const marketTimer = setInterval(async () => {
  try {
    if (!connection) return;
    const col = connection.collection("virtual_stock_market"), docs = await col.find({}).toArray();
    await Promise.all(docs.map((doc) => refreshMarket(col, doc)));
  } catch (error) {
    console.error("[cophieuao] Không thể cập nhật giá định kỳ:", error?.message || error);
  }
}, 60_000);
marketTimer.unref?.();

function stockHelp(prefix) {
  return `📈 CỔ PHIẾU ẢO — SUNWIN · HITCLUB · HUNG · HUN · MESSI · RONALDO

${prefix}cophieuao bang
— Bảng giá (biểu đồ 4 giờ) và danh mục của bạn

${prefix}cophieuao mua HUNG all
— Dùng toàn bộ số dư mua tối đa cổ phiếu HUNG
${prefix}cophieuao mua HUNG 1m
— Mua bằng 1.000.000 VNĐ, tự tính số cổ phiếu
${prefix}cophieuao mua HUNG 50cp
— Mua đúng 50 cổ phiếu

${prefix}cophieuao ban HUNG 20
— Bán 20 cổ phiếu
${prefix}cophieuao ban HUNG all
— Bán toàn bộ cổ phiếu mã HUNG

${prefix}cophieuao vi / top
— Danh mục / top nhà đầu tư

Giá cập nhật mỗi 5 phút và có xu hướng hồi về giá gốc. Phí giao dịch 0,3% mỗi chiều; khi bán có lãi thu thêm 5% trên phần lời. Giao dịch tối thiểu 10.000 VNĐ.`;
}

export async function handleCoPhieuAo(api, message, groupSettings) {
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return true;

  const prefix = getGlobalPrefix(api.getBotId());
  const args = getCoPhieuAoArgs(message);
  const action = (args[0] || "").toLowerCase();

  if (!action) {
    return sendMessageFromSQL(api, message, { success: true, message: stockHelp(prefix) }, true, 30000);
  }

  const server = key(api);
  const uid = message.data.uidFrom;
  const m = await market(api);
  const port = connection.collection("virtual_stock_portfolios");

  // Xem bảng giá
  if (["bang", "xem"].includes(action)) {
    const image = await createVirtualStockMarketImage(m);
    try {
      await api.sendMessage(
        {
          ...gameSenderMessage(message, "📈 Bảng giá cập nhật mỗi 5 phút."),
          attachments: [image],
          ttl: 60_000,
          isUseProphylactic: true,
        },
        message.threadId,
        message.type
      );
    } finally {
      await fs.unlink(image).catch(() => {});
    }
    return true;
  }

  // Xem top hoặc xem ví danh mục
  if (action === "vi" || action === "top") {
    if (action === "top") {
      const rows = await port.find({ server }).sort({ value: -1 }).limit(10).toArray();
      return sendMessageFromSQL(
        api,
        message,
        {
          success: true,
          message: `🏆 TOP NHÀ ĐẦU TƯ\n${
            rows.map((x, i) => `${i + 1}. ${x.name || x.uid} — ${formatCurrency(x.value || 0)} VNĐ`).join("\n") || "Chưa có dữ liệu"
          }`,
        },
        true,
        30000
      );
    }

    const rawUid = String(uid).replace(/_0$/u, "");
    const scopedUid = getCurrentPrivateGameServer()?.serverId
      ? `private:${getCurrentPrivateGameServer().serverId}:${rawUid}`
      : rawUid;
    const d = (await port.findOne({ server, $or: [{ uid: rawUid }, { uid: scopedUid }] })) || { holdings: {} };

    const value = Object.entries(d.holdings || {}).reduce(
      (n, [s, h]) => n.plus(new Big(h.qty).times(m.prices[s] || 0)),
      new Big(0)
    );

    const rows = Object.entries(d.holdings || {}).map(([s, h]) => {
      const cost = new Big(h.cost || 0);
      const current = new Big(h.qty).times(m.prices[s] || 0);
      const pnl = current.minus(cost);
      const pct = cost.gt(0) ? pnl.div(cost).times(100) : new Big(0);
      return `${s} (${COMPANY_NAMES[s] || s}): ${formatCurrency(h.qty)} CP • vốn ${formatCurrency(cost)} VNĐ • hiện tại ${formatCurrency(current)} VNĐ\n   ${
        pnl.gte(0) ? "📈 Lãi" : "📉 Lỗ"
      } ${pnl.gte(0) ? "+" : ""}${formatCurrency(pnl)} VNĐ (${pct.gte(0) ? "+" : ""}${pct.toFixed(2)}%)`;
    });

    return sendMessageFromSQL(
      api,
      message,
      {
        success: true,
        message: `💼 DANH MỤC ĐẦU TƯ\n${
          rows.join("\n") || "Trống (Chưa sở hữu cổ phiếu nào)"
        }\n\nTổng giá trị hiện tại: ${formatCurrency(value)} VNĐ\n*Lời/lỗ chưa trừ phí 0.3% và thuế khi bán.*`,
      },
      true,
      30000
    );
  }

  // Mua / Bán
  const rawSymbol = String(args[1] || "").toUpperCase();
  const symbol = LEGACY_SYMBOL_MAP[rawSymbol] || rawSymbol;
  const rawAmount = args[2];

  if (!["mua", "ban"].includes(action) || !m.prices[symbol] || !rawAmount) {
    return sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: `Dùng: ${prefix}cophieuao mua|ban <SUNWIN|HITCLUB|HUNG|HUN|MESSI|RONALDO> <tiền|sốcp|all>`,
      },
      true,
      30000
    );
  }

  const user = await getUsernameByIdZalo(uid);
  if (!user) {
    return sendMessageFromSQL(
      api,
      message,
      {
        success: false,
        message: "Không tìm thấy thông tin tài khoản người chơi. Hãy dùng lệnh !game để đăng ký!",
      },
      true,
      30000
    );
  }

  const rawUid = String(uid).replace(/_0$/u, "");
  const scopedUid = getCurrentPrivateGameServer()?.serverId
    ? `private:${getCurrentPrivateGameServer().serverId}:${rawUid}`
    : rawUid;
  let d =
    (await port.findOne({ server, $or: [{ uid: rawUid }, { uid: scopedUid }] })) || {
      server,
      uid: scopedUid,
      name: message.data.dName || uid,
      holdings: {},
    };

  const h = d.holdings[symbol] || { qty: 0, cost: "0" };
  const sharePrice = m.prices[symbol];

  if (action === "mua") {
    const bal = await getPlayerBalance(uid);
    if (!bal?.success || bal.balance == null) {
      return sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: bal?.message || "Không thể lấy số dư người chơi.",
        },
        true,
        30000
      );
    }

    const currentBal = new Big(bal.balance);
    const isAll = ["all", "allin", "max", "tatca", "het"].includes(String(rawAmount).toLowerCase());
    const byShares = !isAll && String(rawAmount).toLowerCase().endsWith("cp");

    let qty;
    let cost;

    if (byShares) {
      const shareStr = String(rawAmount).replace(/cp$/i, "").trim();
      qty = parseInt(shareStr, 10);
      if (!Number.isInteger(qty) || qty < 1) {
        return sendMessageFromSQL(api, message, { success: false, message: "Số cổ phiếu không hợp lệ." }, true, 30000);
      }
      cost = new Big(qty).times(sharePrice).times(1 + FEE_RATE).round(0);
      if (cost.gt(currentBal)) {
        return sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message: `Số dư không đủ. Mua ${formatCurrency(qty)} CP ${symbol} cần ${formatCurrency(cost)} VNĐ (gồm phí 0.3%) nhưng bạn chỉ có ${formatCurrency(currentBal)} VNĐ.`,
          },
          true,
          30000
        );
      }
    } else {
      let budget;
      if (isAll) {
        budget = currentBal;
      } else {
        try {
          const parsed = parseGameAmount(rawAmount, bal.balance);
          budget = new Big(parsed);
        } catch {
          return sendMessageFromSQL(api, message, { success: false, message: "Số tiền hoặc số cổ phiếu không hợp lệ." }, true, 30000);
        }
      }

      if (budget.gt(currentBal)) {
        return sendMessageFromSQL(
          api,
          message,
          {
            success: false,
            message: `Số dư không đủ. Bạn chỉ có ${formatCurrency(currentBal)} VNĐ.`,
          },
          true,
          30000
        );
      }

      const priceWithFee = new Big(sharePrice).times(1 + FEE_RATE);
      qty = Math.floor(budget.div(priceWithFee).toNumber());
      cost = new Big(qty).times(sharePrice).times(1 + FEE_RATE).round(0);

      // Đảm bảo sau khi làm tròn, tổng tiền không vượt quá số dư hoặc ngân sách yêu cầu
      while (cost.gt(currentBal) && qty > 0) {
        qty--;
        cost = new Big(qty).times(sharePrice).times(1 + FEE_RATE).round(0);
      }
      if (!isAll) {
        while (cost.gt(budget) && qty > 0) {
          qty--;
          cost = new Big(qty).times(sharePrice).times(1 + FEE_RATE).round(0);
        }
      }
    }

    if (!Number.isInteger(qty) || qty < 1) {
      const minOneShare = new Big(sharePrice).times(1 + FEE_RATE).round(0);
      return sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Số dư không đủ để mua tối thiểu 1 cổ phiếu ${symbol} (Giá 1 CP + phí: ${formatCurrency(minOneShare)} VNĐ).`,
        },
        true,
        30000
      );
    }

    if (cost.lt(MIN_TRANSACTION)) {
      return sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Giao dịch tối thiểu 10.000 VNĐ. Số tiền mua hiện tại là ${formatCurrency(cost)} VNĐ (${formatCurrency(qty)} CP).`,
        },
        true,
        30000
      );
    }

    await updatePlayerBalanceByUsername(user, cost.neg());
    h.qty += qty;
    h.cost = new Big(h.cost).plus(cost).toString();

    recordGameHistory({
      username: user,
      gameName: "Cổ Phiếu Ảo",
      gameKey: "cophieuao",
      choice: `Mua ${qty} CP ${symbol}`,
      amount: cost.toString(),
      netAmount: cost.neg().toString(),
      isWin: null,
      detail: `Mua ${formatCurrency(qty)} CP ${symbol} giá ${formatCurrency(sharePrice)} VNĐ/CP (Phí 0.3%)`,
    }).catch(() => {});

    if (h.qty) d.holdings[symbol] = h;
    else delete d.holdings[symbol];

    d.value = Object.entries(d.holdings).reduce(
      (n, [s, x]) => n.plus(new Big(x.qty).times(m.prices[s] || 0)),
      new Big(0)
    ).toString();

    const saveUid = d.uid || scopedUid || rawUid;
    await port.updateOne({ server, uid: saveUid }, { $set: d }, { upsert: true });

    const newBal = currentBal.minus(cost);
    const msg = `✅ GIAO DỊCH MUA THÀNH CÔNG!\n━━━━━━━━━━━━━━━━━━\n📈 Mã: ${symbol} (${COMPANY_NAMES[symbol] || symbol})\n🔢 Số lượng mua: +${formatCurrency(qty)} CP\n💵 Giá khớp: ${formatCurrency(sharePrice)} VNĐ/CP\n💳 Tổng thanh toán: -${formatCurrency(cost)} VNĐ (đã gồm phí 0.3%)\n💼 Sở hữu hiện tại: ${formatCurrency(h.qty)} CP\n💰 Số dư còn lại: ${formatCurrency(newBal)} VNĐ`;
    return sendMessageFromSQL(api, message, { success: true, message: msg }, true, 30000);
  } else {
    // action === "ban"
    const isAll = ["all", "allin", "max", "tatca", "het"].includes(String(rawAmount).toLowerCase());
    let qty;
    if (isAll) {
      qty = h.qty;
    } else if (String(rawAmount).toLowerCase().endsWith("cp")) {
      qty = parseInt(String(rawAmount).replace(/cp$/i, "").trim(), 10);
    } else {
      qty = parseInt(String(rawAmount).trim(), 10);
    }

    if (!Number.isInteger(qty) || qty < 1) {
      return sendMessageFromSQL(api, message, { success: false, message: "Số lượng cổ phiếu muốn bán không hợp lệ." }, true, 30000);
    }

    if (h.qty < 1) {
      return sendMessageFromSQL(
        api,
        message,
        { success: false, message: `Bạn hiện không sở hữu cổ phiếu ${symbol} nào để bán.` },
        true,
        30000
      );
    }

    if (qty > h.qty) {
      return sendMessageFromSQL(
        api,
        message,
        {
          success: false,
          message: `Bạn chỉ đang sở hữu ${formatCurrency(h.qty)} CP ${symbol}, không đủ để bán ${formatCurrency(qty)} CP.`,
        },
        true,
        30000
      );
    }

    const gross = new Big(qty).times(sharePrice);
    const costOfSold = new Big(h.cost).times(qty).div(h.qty);
    const gain = gross.minus(costOfSold);
    const tradingFee = gross.times(FEE_RATE);
    const profitTax = gain.gt(0) ? gain.times(PROFIT_TAX_RATE) : new Big(0);
    const receive = gross.minus(tradingFee).minus(profitTax).round(0);

    await updatePlayerBalanceByUsername(user, receive);
    const remainingCost = new Big(h.cost).times(h.qty - qty).div(h.qty).round(0);
    h.cost = remainingCost.toString();
    h.qty -= qty;

    recordGameHistory({
      username: user,
      gameName: "Cổ Phiếu Ảo",
      gameKey: "cophieuao",
      choice: `Bán ${qty} CP ${symbol}`,
      amount: gross.toString(),
      netAmount: receive.minus(costOfSold).round(0).toString(),
      isWin: gain.gt(0) ? true : gain.lt(0) ? false : null,
      detail: `Bán ${formatCurrency(qty)} CP ${symbol} nhận ${formatCurrency(receive)} VNĐ`,
    }).catch(() => {});

    if (h.qty) d.holdings[symbol] = h;
    else delete d.holdings[symbol];

    d.value = Object.entries(d.holdings).reduce(
      (n, [s, x]) => n.plus(new Big(x.qty).times(m.prices[s] || 0)),
      new Big(0)
    ).toString();

    const saveUid = d.uid || scopedUid || rawUid;
    await port.updateOne({ server, uid: saveUid }, { $set: d }, { upsert: true });

    const pnlFormatted = gain.gte(0) ? `+${formatCurrency(gain.round(0))} VNĐ` : `-${formatCurrency(gain.abs().round(0))} VNĐ`;
    const msg = `✅ GIAO DỊCH BÁN THÀNH CÔNG!\n━━━━━━━━━━━━━━━━━━\n📉 Mã: ${symbol} (${COMPANY_NAMES[symbol] || symbol})\n🔢 Số lượng bán: -${formatCurrency(qty)} CP\n💵 Giá khớp: ${formatCurrency(sharePrice)} VNĐ/CP\n💰 Thực nhận: +${formatCurrency(receive)} VNĐ\n📊 Lợi nhuận: ${pnlFormatted} (Phí 0.3%${gain.gt(0) ? ", thuế lãi 5%" : ""})\n💼 Còn lại: ${formatCurrency(h.qty)} CP`;
    return sendMessageFromSQL(api, message, { success: true, message: msg }, true, 30000);
  }
}
