import crypto from "node:crypto";

export const MYBOT_PAYMENT_PRICE = 70000;
export const MYBOT_PAYMENT_DAYS = 30;
export const MYBOT_PAYMENT_PREFIX = "NGH";

const PAYMENT_RANDOM_LENGTH = 7;
const PAYMENT_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const PAYMENT_CODE_PATTERN = /\bNGH[A-Z]{7}\b/i;

export function normalizePaymentCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return new RegExp(`^${MYBOT_PAYMENT_PREFIX}[A-Z]{${PAYMENT_RANDOM_LENGTH}}$`).test(normalized)
    ? normalized
    : null;
}

export function extractPaymentCode(value) {
  const match = String(value || "").toUpperCase().match(PAYMENT_CODE_PATTERN);
  return match ? normalizePaymentCode(match[0]) : null;
}

export function generatePaymentCode(isTaken = () => false) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let suffix = "";
    for (let index = 0; index < PAYMENT_RANDOM_LENGTH; index += 1) {
      suffix += PAYMENT_ALPHABET[crypto.randomInt(PAYMENT_ALPHABET.length)];
    }
    const code = `${MYBOT_PAYMENT_PREFIX}${suffix}`;
    if (!isTaken(code)) return code;
  }
  throw new Error("Không thể tạo mã thanh toán không trùng lặp");
}

export function buildMyBotPaymentQrUrl({ bankBin, bankAccount, paymentCode, accountName = "THUE BOT" }) {
  const normalizedCode = normalizePaymentCode(paymentCode);
  if (!normalizedCode) throw new Error("Mã thanh toán không hợp lệ");

  const params = new URLSearchParams({
    amount: String(MYBOT_PAYMENT_PRICE),
    addInfo: normalizedCode,
    accountName,
  });
  return `https://img.vietqr.io/image/${bankBin}-${bankAccount}-qr_only.png?${params.toString()}`;
}

export function isExactMyBotPaymentAmount(value) {
  return Number(value) === MYBOT_PAYMENT_PRICE;
}
