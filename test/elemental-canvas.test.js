import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import { createElementalImage } from "../src/service-ngh/game-service/nguyen-to/canvas.js";

test("elemental canvas renders every randomized symbol", async () => {
  for (const symbol of ["fire", "earth", "water", "wind", "skull"]) {
    const output = await createElementalImage({
      fire: 4,
      earth: 3,
      water: 2,
      bet: "100000",
      active: true,
      spins: 12,
    }, {
      symbol,
      balance: "987654321",
      payout: symbol === "earth" ? "2050000" : "0",
      payoutMultiplier: symbol === "earth" ? "20.5" : null,
      headline: `Kết quả ${symbol}`,
    });

    try {
      const image = await fs.readFile(output);
      assert.equal(image.subarray(1, 4).toString(), "PNG");
      assert.equal(image.length > 50_000, true);
    } finally {
      await fs.unlink(output).catch(() => {});
    }
  }
});
