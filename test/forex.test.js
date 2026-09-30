import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";

import {
  calculateForexPosition,
  formatForexPrice,
  normalizeForexPair,
  parseForexLeverage,
} from "../src/service-ngh/game-service/forex/rules.js";
import { createForexTerminalImage } from "../src/service-ngh/game-service/forex/canvas.js";

test("chuẩn hóa cặp tiền và đòn bẩy Forex", () => {
  assert.equal(normalizeForexPair("eur/usd"), "EURUSD");
  assert.equal(normalizeForexPair("xau-usd"), "XAUUSD");
  assert.equal(normalizeForexPair("btc-usd"), null);
  assert.equal(parseForexLeverage("x25"), 25);
  assert.equal(parseForexLeverage("100"), 100);
  assert.equal(parseForexLeverage("x500"), null);
});

test("BUY lời khi giá tăng và SELL lời khi giá giảm", () => {
  const buy = calculateForexPosition({ pair: "EURUSD", side: "buy", entryPrice: "1.10000", margin: "1000000", leverage: 25 }, 1.111);
  const sell = calculateForexPosition({ pair: "EURUSD", side: "sell", entryPrice: "1.10000", margin: "1000000", leverage: 25 }, 1.089);
  assert.equal(buy.pnl.gt(0), true);
  assert.equal(sell.pnl.gt(0), true);
  assert.equal(buy.liquidated, false);
  assert.equal(formatForexPrice("USDJPY", 147.8), "147.800");
});

test("vị thế bị thanh lý khi lỗ hết tiền ký quỹ", () => {
  const result = calculateForexPosition({ pair: "EURUSD", side: "buy", entryPrice: "1.10000", margin: "1000000", leverage: 100 }, 1.08);
  assert.equal(result.pnl.lt(-1000000), true);
  assert.equal(result.liquidated, true);
});

test("canvas terminal Forex render được ảnh PNG", async () => {
  const pairs = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCHF", "XAUUSD"];
  const prices = { EURUSD: 1.1738, GBPUSD: 1.3502, USDJPY: 147.82, AUDUSD: 0.6584, USDCHF: 0.7956, XAUUSD: 3768.2 };
  const candles = Object.fromEntries(pairs.map((pair) => [pair, Array.from({ length: 48 }, (_, index) => {
    const base = prices[pair] * (1 + (index - 24) * 0.00005);
    return { t: Date.now() + index * 60000, o: base, h: base * 1.0003, l: base * 0.9997, c: base * 1.0001 };
  })]));
  const output = await createForexTerminalImage({ market: { prices, candles }, pair: "EURUSD", positions: [], wallet: "1000000000", playerName: "Trader NGH" });
  try {
    const image = await fs.readFile(output);
    assert.equal(image.subarray(1, 4).toString(), "PNG");
    assert.equal(image.length > 10000, true);
  } finally {
    await fs.unlink(output).catch(() => {});
  }
});
