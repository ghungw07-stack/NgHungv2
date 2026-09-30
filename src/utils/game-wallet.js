import Big from "big.js";

export const EMPTY_GAME_WALLET_MESSAGE = "Ví game đã hết tiền, bạn không thể đặt cược. Nếu có tiền trong ngân hàng, hãy rút về ví bằng .game nganhang rut <số tiền | all>.";

export function requireGameWalletBalance(balance) {
  if (new Big(balance || 0).lte(0)) {
    const error = new Error(EMPTY_GAME_WALLET_MESSAGE);
    error.code = "EMPTY_GAME_WALLET";
    throw error;
  }
}

export function getEmptySavingsMessage(action, source) {
  if (new Big(source || 0).gt(0)) return null;
  return action === "rut"
    ? "Ngân hàng của bạn không còn tiền để rút."
    : "Ví game đã hết tiền, không có tiền để gửi ngân hàng.";
}

export function parseSavingsArguments(content, prefix) {
  const escaped = String(prefix).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(content || "")
    .replace(new RegExp(`^\\s*${escaped}\\s*(?:game\\s+)?(?:nganhang|nh)\\b`, "iu"), "")
    .trim().split(/\s+/u).filter(Boolean);
}
