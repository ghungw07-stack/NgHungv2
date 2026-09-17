import Big from "big.js";
import { randomInt } from "node:crypto";

export const BOARDING_MS = 20_000;
export const DOUBLING_MS = 10_000;
export const FLIGHT_UPDATE_MS = 10_000;
export const MIN_BET = 10_000;
export const MAX_MULTIPLIER = 100;
export const HISTORY_LIMIT = 20;

export function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").trim().toLowerCase();
}

export function isCashout(value) {
  return /^(?:rut|nhay)$/.test(normalize(value));
}

export function parseAutoCashout(value) {
  if (value == null) return null;
  const text = String(value).trim().toLowerCase();
  const multiplier = Number(text.replace(/x$/, "").replace(",", "."));
  if (!/^\d+(?:[.,]\d{1,2})?x?$/.test(text) || !Number.isFinite(multiplier) || multiplier <= 1 || multiplier > MAX_MULTIPLIER) {
    throw new Error("Mốc tự rút phải lớn hơn 1x và không quá 100x, tối đa 2 số thập phân.");
  }
  return multiplier;
}

export const INSTANT_CRASH_RATE = 0.8;

export function chooseCrashPoint(draw = () => randomInt(1, 2 ** 48) / 2 ** 48) {
  const gate = draw();
  if (!Number.isFinite(gate) || gate <= 0 || gate >= 1) throw new Error("Invalid crash draw");
  if (gate < INSTANT_CRASH_RATE) return 1;
  const u = draw();
  if (!Number.isFinite(u) || u <= 0 || u >= 1) throw new Error("Invalid crash draw");
  return Math.min(MAX_MULTIPLIER, Math.max(1, Math.floor(100 / u) / 100));
}

export function flightDuration(multiplier) {
  return Math.log2(multiplier) * DOUBLING_MS;
}

export function multiplierAt(elapsedMs) {
  const raw = Math.min(MAX_MULTIPLIER, 2 ** (Math.max(0, elapsedMs) / DOUBLING_MS));
  return Math.floor(raw * 100 + 1e-9) / 100;
}

export function settleTicket(stake, multiplier) {
  const amount = new Big(stake);
  if (amount.lte(0) || !Number.isFinite(multiplier) || multiplier < 1 || multiplier > MAX_MULTIPLIER) {
    throw new Error("Invalid crash settlement");
  }
  const gross = amount.times(String(multiplier));
  const profit = gross.minus(amount);
  const returned = amount.plus(profit.times("0.95")).round(0, Big.roundDown);
  return { returned: returned.toFixed(0), profit: returned.minus(amount).toFixed(0), fee: gross.minus(returned).toString() };
}
