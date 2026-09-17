import Big from 'big.js';
export const MODES = Object.freeze({ de: { label: 'Dễ', columns: 4 }, vua: { label: 'Vừa', columns: 3 }, kho: { label: 'Khó', columns: 2 } });
export const TOWER_LOSS_RATE = 0.8;
export const normalize = value => String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export function resolveTowerBomb(columns, selected, random = Math.random) {
  if (!Number.isInteger(columns) || columns < 2 || !Number.isInteger(selected) || selected < 1 || selected > columns) throw new Error('Ô tháp không hợp lệ');
  return random() < TOWER_LOSS_RATE ? selected : selected % columns + 1;
}
export function multiplier(mode, floor) {
  if (!MODES[mode] || !Number.isInteger(floor) || floor < 0 || floor > 8) throw new Error('Tầng hoặc chế độ không hợp lệ');
  const n = MODES[mode].columns;
  return floor === 0 ? new Big(1) : new Big(n).pow(floor).times('0.96').div(new Big(n - 1).pow(floor));
}
export function payout(amount, mode, floor) {
  const stake = new Big(amount), gross = stake.times(multiplier(mode, floor));
  const fee = gross.gt(stake) ? gross.minus(stake).times('0.05') : new Big(0);
  return gross.minus(fee).round(0, Big.roundDown);
}
