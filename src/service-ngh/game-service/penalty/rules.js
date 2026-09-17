const CELLS = [
  [1, "Góc chữ A trái", 2.96], [2, "Góc cao giữa", 2.28], [3, "Góc chữ A phải", 2.96],
  [4, "Tầm ngang trái", 2.03], [5, "Tầm ngang giữa", 1.80], [6, "Tầm ngang phải", 2.03],
  [7, "Sát đất trái", 1.94], [8, "Sát đất giữa", 1.77], [9, "Sát đất phải", 1.94],
];

export const PENALTY_CELLS = Object.freeze(Object.fromEntries(CELLS.map(([number, label, multiplier]) => [number, Object.freeze({ number, label, multiplier })])));

function normalize(value) {
  return String(value || "").trim().toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[\s_-]+/g, "");
}

const aliases = new Map();
for (const cell of Object.values(PENALTY_CELLS)) {
  aliases.set(String(cell.number), cell);
  aliases.set(normalize(cell.label), cell);
}
for (const [alias, cell] of [
  ["traicao", PENALTY_CELLS[1]], ["traic", PENALTY_CELLS[1]], ["giua cao", PENALTY_CELLS[2]], ["phai cao", PENALTY_CELLS[3]],
  ["trai", PENALTY_CELLS[4]], ["giua", PENALTY_CELLS[5]], ["phai", PENALTY_CELLS[6]],
  ["traithap", PENALTY_CELLS[7]], ["giuathap", PENALTY_CELLS[8]], ["phaithap", PENALTY_CELLS[9]],
]) aliases.set(normalize(alias), cell);

export function resolvePenaltyCell(value) { return aliases.get(normalize(value)) || null; }

export const PENALTY_WIN_RATE = 0.2;

export function shootPenalty(cell, random = Math.random) {
  if (!cell?.multiplier) throw new Error("Ô sút không hợp lệ.");
  return random() < PENALTY_WIN_RATE;
}
