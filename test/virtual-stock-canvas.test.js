import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";

import { createVirtualStockMarketImage } from "../src/service-ngh/game-service/cophieuao/canvas.js";

test("canvas cổ phiếu terminal render được PNG", async () => {
  const prices = { SUNWIN: 10000, HITCLUB: 18500, HUNG: 7500, HUN: 24000, MESSI: 12000, RONALDO: 32000 };
  const history = Object.fromEntries(Object.entries(prices).map(([symbol, price], symbolIndex) => [
    symbol,
    Array.from({ length: 48 }, (_, index) => Math.round(price * (1 + Math.sin((index + symbolIndex) / 6) * 0.04))),
  ]));
  const output = await createVirtualStockMarketImage({
    market: { prices, history },
    symbol: "HUNG",
    portfolio: { holdings: { HUNG: { qty: 1000, cost: "7000000" } } },
    wallet: "100000000",
    playerName: "Trader NGH",
  });
  try {
    const image = await fs.readFile(output);
    assert.equal(image.subarray(1, 4).toString(), "PNG");
    assert.equal(image.length > 10000, true);
  } finally {
    await fs.unlink(output).catch(() => {});
  }
});
