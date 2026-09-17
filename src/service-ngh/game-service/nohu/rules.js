const SYMBOLS = [
  { key: "🍒", label: "Anh đào", mult: 7, weight: 34 },
  { key: "🍋", label: "Chanh", mult: 10, weight: 27 },
  { key: "🔔", label: "Chuông", mult: 16, weight: 19 },
  { key: "⭐", label: "Sao", mult: 30, weight: 12 },
  { key: "7️⃣", label: "Số 7", mult: 70, weight: 6 },
  { key: "💎", label: "Kim cương", mult: 180, weight: 2 },
];

export const GOLD = "🪙";
export const NOHU_WIN_RATE = 0.2;
const JACKPOT_RATE = 0.001;

const pick = (random = Math.random) => {
  let roll = random() * 100;
  for (const item of SYMBOLS) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return SYMBOLS[0];
};

/** Tạo một lượt quay: thắng (có tiền trả về) chính xác 20%, gồm cả nổ hũ. */
export function rollNoHuSlots(random = Math.random) {
  if (random() < JACKPOT_RATE) return Array.from({ length: 3 }, () => ({ key: GOLD, label: "Hũ Vàng" }));
  const normalWinRate = (NOHU_WIN_RATE - JACKPOT_RATE) / (1 - JACKPOT_RATE);
  if (random() < normalWinRate) {
    const matched = pick(random);
    if (random() < 0.12) return [matched, matched, matched];
    let other = pick(random);
    while (other.key === matched.key) other = pick(random);
    return [matched, matched, other];
  }
  const slots = [];
  while (slots.length < 3) {
    const symbol = pick(random);
    if (!slots.some((item) => item.key === symbol.key)) slots.push(symbol);
  }
  return slots;
}
