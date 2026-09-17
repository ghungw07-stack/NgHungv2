export const MINES_BOARD_SIZE = 25;

export function createMinePositions(mineCount, random = Math.random) {
  const count = Number(mineCount);
  if (!Number.isInteger(count) || count < 1 || count > 24) throw new RangeError("Số mìn phải từ 1 đến 24");
  const cells = Array.from({ length: MINES_BOARD_SIZE }, (_, index) => index + 1);
  for (let index = cells.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [cells[index], cells[swap]] = [cells[swap], cells[index]];
  }
  return new Set(cells.slice(0, count));
}

// Mức chi trả 96% khớp bảng mẫu: 3 mìn mở 1/5/10/hết ô ≈ 1.09x/1.93x/4.85x/2208x.
export function calculateMinesMultiplier(mineCount, openedSafeCount, houseReturn = 0.96) {
  const mines = Number(mineCount), opened = Number(openedSafeCount);
  if (!Number.isInteger(mines) || mines < 1 || mines > 24) throw new RangeError("Số mìn không hợp lệ");
  if (!Number.isInteger(opened) || opened < 0 || opened > MINES_BOARD_SIZE - mines) throw new RangeError("Số ô đã mở không hợp lệ");
  if (opened === 0) return 1;
  let survivalProbability = 1;
  for (let step = 0; step < opened; step += 1) survivalProbability *= (MINES_BOARD_SIZE - mines - step) / (MINES_BOARD_SIZE - step);
  return Number((houseReturn / survivalProbability).toFixed(4));
}

export function normalizeMineCell(value) {
  const match = String(value || "").trim().match(/^(?:o|ô)?\s*(\d{1,2})$/i);
  if (!match) return null;
  const cell = Number(match[1]);
  return cell >= 1 && cell <= MINES_BOARD_SIZE ? cell : null;
}
