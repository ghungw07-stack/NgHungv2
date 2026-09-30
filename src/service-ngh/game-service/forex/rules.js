import Big from "big.js";

export const FOREX_PAIRS = {
  EURUSD: { name: "Euro / US Dollar", base: 1.1738, digits: 5, pip: 0.0001, spreadPips: 1.2, volatility: 0.00042 },
  GBPUSD: { name: "British Pound / US Dollar", base: 1.3502, digits: 5, pip: 0.0001, spreadPips: 1.8, volatility: 0.00055 },
  USDJPY: { name: "US Dollar / Japanese Yen", base: 147.82, digits: 3, pip: 0.01, spreadPips: 1.5, volatility: 0.00045 },
  AUDUSD: { name: "Australian Dollar / US Dollar", base: 0.6584, digits: 5, pip: 0.0001, spreadPips: 1.6, volatility: 0.0005 },
  USDCHF: { name: "US Dollar / Swiss Franc", base: 0.7956, digits: 5, pip: 0.0001, spreadPips: 1.7, volatility: 0.0004 },
  XAUUSD: { name: "Gold Spot / US Dollar", base: 3768.2, digits: 2, pip: 0.1, spreadPips: 3.5, volatility: 0.0008 },
};

const ALLOWED_LEVERAGE = new Set([10, 25, 50, 100]);

export function normalizeForexPair(value) {
  const pair = String(value || "EURUSD").toUpperCase().replace(/[^A-Z]/gu, "");
  return FOREX_PAIRS[pair] ? pair : null;
}

export function parseForexLeverage(value) {
  const leverage = Number(String(value || "x25").toLowerCase().replace(/^x/u, ""));
  return ALLOWED_LEVERAGE.has(leverage) ? leverage : null;
}

export function formatForexPrice(pair, value) {
  const config = FOREX_PAIRS[pair] || FOREX_PAIRS.EURUSD;
  return Number(value || 0).toFixed(config.digits);
}

export function roundForexPrice(pair, value) {
  return Number(Number(value).toFixed(FOREX_PAIRS[pair].digits));
}

export function getForexQuote(pair, mid) {
  const config = FOREX_PAIRS[pair];
  const halfSpread = config.pip * config.spreadPips / 2;
  return {
    bid: roundForexPrice(pair, mid - halfSpread),
    ask: roundForexPrice(pair, mid + halfSpread),
  };
}

export function calculateForexPosition(position, midPrice) {
  const pair = normalizeForexPair(position?.pair);
  if (!pair) throw new Error("Cặp tiền không hợp lệ.");
  const side = String(position.side || "buy").toLowerCase() === "sell" ? "sell" : "buy";
  const currentQuote = getForexQuote(pair, Number(midPrice));
  const exitPrice = side === "buy" ? currentQuote.bid : currentQuote.ask;
  const entryPrice = new Big(position.entryPrice || 0);
  const margin = new Big(position.margin || 0);
  const leverage = Number(position.leverage || 1);
  const direction = side === "buy" ? new Big(1) : new Big(-1);
  const pnl = entryPrice.gt(0)
    ? margin.times(leverage).times(new Big(exitPrice).minus(entryPrice)).div(entryPrice).times(direction).round(0, Big.roundDown)
    : new Big(0);
  const equity = margin.plus(pnl);
  return {
    exitPrice,
    pnl,
    equity,
    liquidated: equity.lte(0),
    pnlPercent: margin.gt(0) ? pnl.div(margin).times(100) : new Big(0),
  };
}
