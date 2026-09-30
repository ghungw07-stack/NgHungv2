import Big from "big.js";

function isAtLeast(value, minimum) {
  try {
    return new Big(value || 0).gte(minimum || 0);
  } catch {
    return false;
  }
}

/**
 * Overlord được gửi và nhận không giới hạn. Nếu Overlord nằm ở một trong hai
 * phía thì giao dịch cũng không bị chặn bởi hạn mức của phía còn lại.
 * Giữ quyền miễn hạn mức Kim Long trở lên đã có từ trước.
 */
export function isBankTransferLimitExempt({
  senderTierKey,
  receiverTierKey,
  senderRankPoints,
  receiverRankPoints,
  kimLongMin,
}) {
  if (senderTierKey === "overlord" || receiverTierKey === "overlord") return true;
  return isAtLeast(senderRankPoints, kimLongMin) || isAtLeast(receiverRankPoints, kimLongMin);
}
