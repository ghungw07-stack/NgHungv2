export const ROB_COOLDOWN_MS = 30 * 60 * 1000;
export const ROB_SUCCESS_RATE = 0.55;
export const MIN_TARGET_BALANCE = 10_000;
export const MAX_STEAL_AMOUNT = 2_000_000;
export const MAX_FAILURE_FINE = 500_000;

export const SHIELD_PLANS = Object.freeze({
  "1h": { durationMs: 60 * 60 * 1000, price: 50_000, label: "1 giờ" },
  "6h": { durationMs: 6 * 60 * 60 * 1000, price: 250_000, label: "6 giờ" },
  "24h": { durationMs: 24 * 60 * 60 * 1000, price: 800_000, label: "24 giờ" },
});

export function calculateStealAmount(balance, random = Math.random()) {
  const safeBalance = Math.max(0, Math.floor(Number(balance) || 0));
  const ratio = 0.05 + Math.max(0, Math.min(1, random)) * 0.07;
  return Math.max(1, Math.min(MAX_STEAL_AMOUNT, Math.floor(safeBalance * ratio)));
}

export function calculateFailureFine(balance, random = Math.random()) {
  const safeBalance = Math.max(0, Math.floor(Number(balance) || 0));
  if (!safeBalance) return 0;
  const ratio = 0.03 + Math.max(0, Math.min(1, random)) * 0.04;
  return Math.min(safeBalance, MAX_FAILURE_FINE, Math.max(1_000, Math.floor(safeBalance * ratio)));
}

export function remainingText(milliseconds) {
  const minutes = Math.max(1, Math.ceil(milliseconds / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} giờ${rest ? ` ${rest} phút` : ""}` : `${minutes} phút`;
}
