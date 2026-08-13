import Big from "big.js";

const MULTIPLIERS = Object.freeze({ k: "1000", m: "1000000", b: "1000000000", t: "1000000000000" });

export function parseAmount(input, balance) {
  const raw = String(input || "").trim().toLowerCase();
  if (raw === "all") return new Big(balance || 0);
  const match = raw.match(/^(\d+(?:\.\d+)?)([kmbt])?$/);
  if (!match) throw new Error("Số tiền không hợp lệ");
  const value = new Big(match[1]).times(MULTIPLIERS[match[2]] || 1).round(0, Big.roundDown);
  if (value.lte(0)) throw new Error("Số tiền phải lớn hơn 0");
  return value;
}

export function formatMoney(value) {
  const text = new Big(value || 0).round(0, Big.roundDown).toFixed(0);
  return text.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
