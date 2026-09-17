import Big from "big.js";

export const GAME_REFUND_RATE = new Big("0.05");
export const GAME_FUND_RATE = new Big("0.05");
export const HOURLY_LUCKY_MINIMUM = new Big("3000000000");

/**
 * Chính sách quyết toán chung cho các trò chơi có ghi nhận thắng/thua.
 * - Thắng: giữ lại 5% phần thắng vào quỹ lì xì.
 * - Thua: ghi nhận 5% khoản thua vào quỹ hoàn trả để người chơi tự nhận.
 */
export function applyGameRewardPolicy(amount, isWin, winningAmount = null) {
  const original = new Big(amount || 0).round(0);
  if (isWin === null || isWin === undefined || original.eq(0)) {
    return { original, walletDelta: original, fundContribution: new Big(0), refund: new Big(0) };
  }

  if (isWin === true && original.gt(0)) {
    const basis = winningAmount !== null && winningAmount !== undefined
      ? new Big(winningAmount || 0).abs().round(0)
      : original;
    const fundContribution = basis.times(GAME_FUND_RATE).round(0, Big.roundDown);
    return { original, walletDelta: original.minus(fundContribution), fundContribution, refund: new Big(0) };
  }

  if (isWin === false && original.lt(0)) {
    const refund = original.abs().times(GAME_REFUND_RATE).round(0, Big.roundDown);
    return { original, walletDelta: original, fundContribution: new Big(0), refund };
  }

  return { original, walletDelta: original, fundContribution: new Big(0), refund: new Big(0) };
}

export function getHourlyLuckyMaximum(dailyAmount) {
  const daily = new Big(dailyAmount || 0).round(0, Big.roundDown);
  return daily.gt(HOURLY_LUCKY_MINIMUM) ? daily : HOURLY_LUCKY_MINIMUM;
}

export function randomBigInteger(minimum, maximum, random = Math.random) {
  const min = new Big(minimum).round(0, Big.roundDown);
  const max = new Big(maximum).round(0, Big.roundDown);
  if (max.lte(min)) return min;
  // Các mốc hiện tại dưới Number.MAX_SAFE_INTEGER. Làm tròn xuống để tiền luôn nguyên.
  const span = max.minus(min).plus(1).toNumber();
  return min.plus(Math.floor(random() * span));
}
