import Big from "big.js";

const FEE_MULTIPLIER = new Big("1.003");
const MAX_SHARE_QUANTITY = Number.MAX_SAFE_INTEGER;

export function calculatePurchaseQuote(budgetValue, balanceValue, sharePrice) {
  const budget = new Big(budgetValue);
  const balance = new Big(balanceValue);
  const spendLimit = budget.lt(balance) ? budget : balance;
  const priceWithFee = new Big(sharePrice).times(FEE_MULTIPLIER);
  let quantity = spendLimit.div(priceWithFee).round(0, Big.roundDown);

  if (quantity.gt(MAX_SHARE_QUANTITY)) {
    throw new RangeError("Số lượng cổ phiếu vượt giới hạn an toàn.");
  }

  let qty = Number(quantity.toString());
  let cost = quantity.times(priceWithFee).round(0);

  // Half-up rounding can exceed the spending limit by less than one dong.
  // Removing at most one share avoids a quantity-sized correction loop.
  if (cost.gt(spendLimit) && qty > 0) {
    qty -= 1;
    quantity = new Big(qty);
    cost = quantity.times(priceWithFee).round(0);
  }

  return { qty, cost };
}
