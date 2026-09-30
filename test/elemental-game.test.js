import test from "node:test";
import assert from "node:assert/strict";

import {
  BONUS_MULTIPLIERS,
  ELEMENT_SYMBOLS,
  applyElementalSpin,
  createElementalState,
  getPartialCashout,
  normalizeElementalState,
  openElementalRound,
  rollBonusMultiplier,
  rollElementSymbol,
} from "../src/service-ngh/game-service/nguyen-to/rules.js";

test("elemental symbol boundaries match the published probabilities", () => {
  assert.equal(rollElementSymbol(() => 0), ELEMENT_SYMBOLS.WATER);
  assert.equal(rollElementSymbol(() => 0.249999), ELEMENT_SYMBOLS.WATER);
  assert.equal(rollElementSymbol(() => 0.25), ELEMENT_SYMBOLS.EARTH);
  assert.equal(rollElementSymbol(() => 0.369999), ELEMENT_SYMBOLS.EARTH);
  assert.equal(rollElementSymbol(() => 0.37), ELEMENT_SYMBOLS.FIRE);
  assert.equal(rollElementSymbol(() => 0.399999), ELEMENT_SYMBOLS.FIRE);
  assert.equal(rollElementSymbol(() => 0.4), ELEMENT_SYMBOLS.WIND);
  assert.equal(rollElementSymbol(() => 0.849999), ELEMENT_SYMBOLS.WIND);
  assert.equal(rollElementSymbol(() => 0.85), ELEMENT_SYMBOLS.SKULL);
});

test("skull pushes all rings back without going below zero", () => {
  const result = applyElementalSpin({ fire: 2, earth: 1, water: 0, bet: "10000", active: true }, ELEMENT_SYMBOLS.SKULL);
  assert.deepEqual(
    { fire: result.state.fire, earth: result.state.earth, water: result.state.water },
    { fire: 1, earth: 0, water: 0 },
  );
  assert.equal(result.state.active, true);

  const empty = applyElementalSpin(createElementalState(), ELEMENT_SYMBOLS.SKULL);
  assert.equal(empty.state.fire, 0);
  assert.equal(empty.state.bet, null);
});

test("partial cashout adds differences and steps eligible rings back once", () => {
  const result = getPartialCashout({ fire: 3, earth: 2, water: 1, bet: "10000", active: true });
  assert.equal(result.available, true);
  assert.equal(result.multiplier, "20.7");
  assert.deepEqual(result.rings.map((ring) => [ring.ring, ring.multiplier]), [
    ["fire", "15.5"],
    ["earth", "5.2"],
  ]);
  assert.deepEqual(
    { fire: result.state.fire, earth: result.state.earth, water: result.state.water },
    { fire: 2, earth: 1, water: 1 },
  );
  assert.equal(result.state.active, false);
});

test("opening a round keeps progress, locks the bet and resets round payout", () => {
  const state = openElementalRound({
    fire: 3,
    earth: 2,
    water: 1,
    bet: "10000",
    active: false,
    roundPayout: "205000",
  }, "10000");
  assert.deepEqual(
    { fire: state.fire, earth: state.earth, water: state.water },
    { fire: 3, earth: 2, water: 1 },
  );
  assert.equal(state.bet, "10000");
  assert.equal(state.active, true);
  assert.equal(state.roundPayout, "0");
});

test("wind closes the round but preserves all ring progress", () => {
  const result = applyElementalSpin({
    fire: 3,
    earth: 2,
    water: 1,
    bet: "10000",
    active: true,
  }, ELEMENT_SYMBOLS.WIND);
  assert.deepEqual(
    { fire: result.state.fire, earth: result.state.earth, water: result.state.water },
    { fire: 3, earth: 2, water: 1 },
  );
  assert.equal(result.state.active, false);
  assert.equal(result.state.bet, "10000");
});

test("partial cashout stays disabled when every ring has fewer than two cells", () => {
  const result = getPartialCashout({ fire: 1, earth: 1, water: 1, bet: "50000" });
  assert.equal(result.available, false);
  assert.equal(result.multiplier, "0");
});

test("earth and water completion pay immediately then move back one cell", () => {
  const earth = applyElementalSpin({ earth: 5, bet: "10000" }, ELEMENT_SYMBOLS.EARTH);
  assert.equal(earth.state.earth, 5);
  assert.equal(earth.payouts[0].multiplier, "20.5");

  const water = applyElementalSpin({ water: 3, bet: "10000" }, ELEMENT_SYMBOLS.WATER);
  assert.equal(water.state.water, 3);
  assert.equal(water.payouts[0].multiplier, "7");
});

test("fire completion resets fire and pays bonus plus x200", () => {
  const result = applyElementalSpin({ fire: 7, earth: 2, bet: "10000" }, ELEMENT_SYMBOLS.FIRE, () => 0.61);
  assert.equal(result.state.fire, 0);
  assert.equal(result.state.earth, 2);
  assert.equal(result.state.bet, "10000");
  assert.equal(result.payouts[0].bonusMultiplier, "400");
  assert.equal(result.payouts[0].multiplier, "600");
});

test("all five fire bonus multipliers occupy equal random intervals", () => {
  assert.deepEqual([0.01, 0.21, 0.41, 0.61, 0.81].map((value) => rollBonusMultiplier(() => value)), BONUS_MULTIPLIERS);
});

test("normalization clamps progress and releases a stale bet on an empty board", () => {
  const state = normalizeElementalState({ fire: 999, earth: -2, water: "bad", bet: "50000", spins: -1 });
  assert.equal(state.fire, 7);
  assert.equal(state.earth, 0);
  assert.equal(state.water, 0);
  assert.equal(state.bet, "50000");

  const empty = normalizeElementalState({ bet: "50000" });
  assert.equal(empty.bet, null);

  const corrupt = normalizeElementalState({ active: true, bet: "oops", roundPayout: "NaN" });
  assert.equal(corrupt.active, false);
  assert.equal(corrupt.bet, null);
  assert.equal(corrupt.roundPayout, "0");
});
