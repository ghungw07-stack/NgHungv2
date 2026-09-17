export const SYMBOLS = Object.freeze({
  K: { label: "K", weight: 13, color: "#c94d43", pay: [0, 0, 0, 2, 4, 6, 10] },
  A: { label: "A", weight: 13, color: "#e3b34e", pay: [0, 0, 0, 2, 4, 6, 10] },
  Q: { label: "Q", weight: 12, color: "#7db37c", pay: [0, 0, 0, 1, 2, 3, 5] },
  J: { label: "J", weight: 12, color: "#63a9b9", pay: [0, 0, 0, 1, 2, 3, 5] },
  HAT: { label: "MŨ", weight: 10, color: "#c56eaf", pay: [0, 0, 0, 5, 10, 15, 20] },
  WHISKY: { label: "RƯỢU", weight: 10, color: "#c87743", pay: [0, 0, 0, 5, 10, 15, 20] },
  GUN: { label: "SÚNG", weight: 8, color: "#aeb7c0", pay: [0, 0, 0, 8, 15, 20, 30] },
  WILD: { label: "WILD", weight: 1, color: "#d55047", pay: [0, 0, 0, 10, 20, 30, 50], wild: true },
  SCATTER: { label: "SCATTER", weight: 1, color: "#f2cd48", pay: [0, 0, 0, 0, 0, 0, 0], scatter: true },
});
// The player stake is divided into four fixed base bets before the paytable is applied.
export const BET_UNITS = 4;
export const LOSS_RATE = 0.8;
const bag = Object.entries(SYMBOLS).flatMap(([key, value]) => Array.from({ length: value.weight }, () => key));
const payingSymbols = Object.keys(SYMBOLS).filter(key => !SYMBOLS[key].wild && !SYMBOLS[key].scatter);
function pick(items, random) { return items[Math.floor(random() * items.length)]; }
function randomGrid(random) {
  const grid = Array.from({ length: 3 }, () => Array(6));
  for (let column = 0; column < 6; column += 1) {
    const previous = column ? new Set(grid.map(row => row[column - 1])) : null;
    for (let row = 0; row < 3; row += 1) {
      let symbol = bag[Math.floor(random() * bag.length)];
      // Reroll adjacent repeats twice. Same symbols still occur, but forming
      // three connected reels becomes much rarer without adding fake blanks.
      for (let retry = 0; previous?.has(symbol) && retry < 2; retry += 1) symbol = bag[Math.floor(random() * bag.length)];
      grid[row][column] = symbol;
    }
  }
  return grid;
}
function forceLoss(grid, random) {
  for (let row = 0; row < 3; row += 1) if (grid[row][0] === "WILD") grid[row][0] = pick(payingSymbols, random);
  const firstReel = new Set(grid.map(row => row[0]).filter(symbol => symbol !== "SCATTER"));
  const safeSecondReel = payingSymbols.filter(symbol => !firstReel.has(symbol));
  for (let row = 0; row < 3; row += 1) {
    if (grid[row][1] === "WILD" || firstReel.has(grid[row][1])) grid[row][1] = pick(safeSecondReel, random);
  }
  return grid;
}
function forceWin(grid, random) {
  const symbol = pick(payingSymbols, random);
  for (let column = 0; column < 3; column += 1) grid[Math.floor(random() * 3)][column] = symbol;
  return grid;
}
export function spin(random = Math.random) {
  const shouldLose = random() < LOSS_RATE;
  const grid = randomGrid(random);
  const won = evaluate(grid).multiplier > 0;
  return shouldLose ? (won ? forceLoss(grid, random) : grid) : (won ? grid : forceWin(grid, random));
}
function waysWin(grid, symbol) {
  let reels = 0, ways = 1;
  for (let column = 0; column < grid[0].length; column += 1) {
    const matched = grid.filter(row => row[column] === symbol || (symbol !== "WILD" && row[column] === "WILD")).length;
    if (!matched) break;
    reels += 1; ways *= matched;
  }
  if (reels < 3) return { symbol, reels, ways: 0, basePay: 0, multiplier: 0 };
  const basePay = SYMBOLS[symbol].pay[reels] || 0;
  return { symbol, reels, ways, basePay, multiplier: basePay * ways };
}
export function evaluate(grid) {
  // 3,600-ways style: matching symbols can be on any row. Their count on each
  // consecutive reel from the left is multiplied to form the number of winning ways.
  const lines = Object.keys(SYMBOLS).filter(symbol => symbol !== "SCATTER").map(symbol => waysWin(grid, symbol)).filter(item => item.multiplier > 0);
  const scatters = grid.flat().filter(symbol => symbol === "SCATTER").length;
  const scatterMultiplier = SYMBOLS.SCATTER.pay[scatters] || 0;
  return { lines, scatters, freeSpins: scatters >= 3 ? 10 + (scatters - 3) * 2 : 0, multiplier: lines.reduce((sum, line) => sum + line.multiplier, scatterMultiplier) };
}
