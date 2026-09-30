export const ELEMENT_SYMBOLS = Object.freeze({
  FIRE: "fire",
  EARTH: "earth",
  WATER: "water",
  WIND: "wind",
  SKULL: "skull",
});

export const RING_CONFIG = Object.freeze({
  fire: Object.freeze({
    key: "fire",
    label: "LỬA",
    color: "#ff4b2e",
    steps: Object.freeze(["3.9", "12.5", "28", "52", "85", "133", "200"]),
    cells: 8,
    completionLabel: "THƯỞNG",
  }),
  earth: Object.freeze({
    key: "earth",
    label: "ĐẤT",
    color: "#58d66b",
    steps: Object.freeze(["2.5", "7.7", "16", "27.5", "44"]),
    cells: 6,
    completionLabel: "+20.5",
    completionMultiplier: "20.5",
  }),
  water: Object.freeze({
    key: "water",
    label: "NƯỚC",
    color: "#4bc4ff",
    steps: Object.freeze(["1.55", "4.85", "10"]),
    cells: 4,
    completionLabel: "+7",
    completionMultiplier: "7",
  }),
});

export const BONUS_MULTIPLIERS = Object.freeze([100, 200, 300, 400, 500]);

// Gió chiếm phần lớn kết quả, còn Đầu lâu tạo lực lùi cho cả ba vòng.
export const SYMBOL_WEIGHTS = Object.freeze([
  Object.freeze({ symbol: ELEMENT_SYMBOLS.WATER, weight: 25 }),
  Object.freeze({ symbol: ELEMENT_SYMBOLS.EARTH, weight: 12 }),
  Object.freeze({ symbol: ELEMENT_SYMBOLS.FIRE, weight: 3 }),
  Object.freeze({ symbol: ELEMENT_SYMBOLS.WIND, weight: 45 }),
  Object.freeze({ symbol: ELEMENT_SYMBOLS.SKULL, weight: 15 }),
]);

export function createElementalState() {
  return {
    fire: 0,
    earth: 0,
    water: 0,
    bet: null,
    active: false,
    roundPayout: "0",
    spins: 0,
    updatedAt: null,
  };
}

function safeProgress(value, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(maximum, Math.trunc(parsed))) : 0;
}

function safeBet(value) {
  if (value == null) return null;
  const parsed = String(value).trim();
  return /^(?:[1-9]\d*)$/u.test(parsed) ? parsed : null;
}

function safePayout(value) {
  const parsed = String(value ?? "0").trim();
  return /^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(parsed) ? parsed : "0";
}

export function normalizeElementalState(value = {}) {
  const state = {
    fire: safeProgress(value.fire, RING_CONFIG.fire.steps.length),
    earth: safeProgress(value.earth, RING_CONFIG.earth.steps.length),
    water: safeProgress(value.water, RING_CONFIG.water.steps.length),
    bet: safeBet(value.bet),
    active: Boolean(value.active),
    roundPayout: safePayout(value.roundPayout),
    spins: Math.max(0, Math.trunc(Number(value.spins) || 0)),
    updatedAt: value.updatedAt || null,
  };
  if (!state.bet) state.active = false;
  if (!state.active && !hasRingProgress(state)) state.bet = null;
  return state;
}

export function hasRingProgress(state) {
  return state.fire > 0 || state.earth > 0 || state.water > 0;
}

export function rollElementSymbol(random = Math.random) {
  const roll = Math.max(0, Math.min(0.999999999999, Number(random()))) * 100;
  let cumulative = 0;
  for (const entry of SYMBOL_WEIGHTS) {
    cumulative += entry.weight;
    if (roll < cumulative) return entry.symbol;
  }
  return SYMBOL_WEIGHTS.at(-1).symbol;
}

export function rollBonusMultiplier(random = Math.random) {
  const roll = Math.max(0, Math.min(0.999999999999, Number(random())));
  return BONUS_MULTIPLIERS[Math.floor(roll * BONUS_MULTIPLIERS.length)];
}

function copyState(state) {
  return normalizeElementalState(state);
}

export function applyElementalSpin(currentState, symbol, random = Math.random) {
  const state = copyState(currentState);
  const payouts = [];
  let headline = "";
  state.spins += 1;

  if (symbol === ELEMENT_SYMBOLS.SKULL) {
    state.fire = Math.max(0, state.fire - 1);
    state.earth = Math.max(0, state.earth - 1);
    state.water = Math.max(0, state.water - 1);
    headline = "Đầu lâu đẩy lùi cả ba vòng 1 ô";
  } else if (symbol === ELEMENT_SYMBOLS.WIND) {
    state.active = false;
    headline = "Gió cuốn mất ván cược, tiến độ các vòng được giữ nguyên";
  } else if (symbol === ELEMENT_SYMBOLS.FIRE) {
    state.fire += 1;
    headline = "Lửa lấp đầy 1 ô vòng ngoài";
    if (state.fire >= RING_CONFIG.fire.cells) {
      const bonusMultiplier = rollBonusMultiplier(random);
      payouts.push({
        type: "fire-bonus",
        ring: "fire",
        multiplier: String(200 + bonusMultiplier),
        bonusMultiplier: String(bonusMultiplier),
      });
      state.fire = 0;
      headline = `Bùng nổ thưởng Lửa ×${bonusMultiplier} + hoàn vòng ×200`;
    }
  } else if (symbol === ELEMENT_SYMBOLS.EARTH) {
    state.earth += 1;
    headline = "Đất lấp đầy 1 ô vòng giữa";
    if (state.earth >= RING_CONFIG.earth.cells) {
      payouts.push({ type: "earth-free", ring: "earth", multiplier: RING_CONFIG.earth.completionMultiplier });
      state.earth = RING_CONFIG.earth.steps.length;
      headline = "Vòng Đất hoàn tất, nhận Rút Tiền Miễn Phí ×20.5";
    }
  } else if (symbol === ELEMENT_SYMBOLS.WATER) {
    state.water += 1;
    headline = "Nước lấp đầy 1 ô vòng trong";
    if (state.water >= RING_CONFIG.water.cells) {
      payouts.push({ type: "water-free", ring: "water", multiplier: RING_CONFIG.water.completionMultiplier });
      state.water = RING_CONFIG.water.steps.length;
      headline = "Vòng Nước hoàn tất, nhận Rút Tiền Miễn Phí ×7";
    }
  } else {
    throw new Error(`Biểu tượng nguyên tố không hợp lệ: ${symbol}`);
  }

  if (!state.active && !hasRingProgress(state)) state.bet = null;
  return { state, symbol, payouts, headline };
}

export function getPartialCashout(state) {
  const nextState = copyState(state);
  const rings = [];
  let multiplier = 0;

  for (const key of ["fire", "earth", "water"]) {
    const progress = nextState[key];
    if (progress < 2) continue;
    const steps = RING_CONFIG[key].steps;
    const current = Number(steps[progress - 1]);
    const previous = Number(steps[progress - 2]);
    const difference = Number((current - previous).toFixed(8));
    rings.push({ ring: key, from: progress, to: progress - 1, multiplier: String(difference) });
    multiplier += difference;
    nextState[key] -= 1;
  }

  if (!hasRingProgress(nextState)) nextState.bet = null;
  nextState.active = false;
  return {
    available: rings.length > 0,
    multiplier: String(Number(multiplier.toFixed(8))),
    rings,
    state: nextState,
  };
}

export function resetElementalState(currentState = {}) {
  const state = createElementalState();
  state.spins = Math.max(0, Math.trunc(Number(currentState.spins) || 0));
  return state;
}

export function openElementalRound(currentState, bet) {
  const state = copyState(currentState);
  state.bet = String(bet);
  state.active = true;
  state.roundPayout = "0";
  return state;
}
