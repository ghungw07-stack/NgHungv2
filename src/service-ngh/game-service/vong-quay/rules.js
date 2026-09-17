export const WHEEL_SEGMENTS = Object.freeze([
  Object.freeze({ multiplier: 0, label: "Mất lượt", weight: 0.58, color: "#9f2732" }),
  Object.freeze({ multiplier: 0.5, label: "Nhận một nửa", weight: 0.22, color: "#245a78" }),
  Object.freeze({ multiplier: 1, label: "Hoàn vốn", weight: 0.08, color: "#28755f" }),
  Object.freeze({ multiplier: 1.5, label: "Thắng ×1.5", weight: 0.055, color: "#8b6421" }),
  Object.freeze({ multiplier: 2, label: "Thắng ×2", weight: 0.04, color: "#583b8b" }),
  Object.freeze({ multiplier: 5, label: "Thắng ×5", weight: 0.018, color: "#b34826" }),
  Object.freeze({ multiplier: 10, label: "Thắng ×10", weight: 0.006, color: "#177777" }),
  Object.freeze({ multiplier: 50, label: "Nổ hũ ×50", weight: 0.001, color: "#d6a52a" }),
]);

export function spinLuckyWheel(random = Math.random) {
  const roll = random();
  let cumulative = 0;
  for (let index = 0; index < WHEEL_SEGMENTS.length; index += 1) {
    cumulative += WHEEL_SEGMENTS[index].weight;
    if (roll < cumulative || index === WHEEL_SEGMENTS.length - 1) return { ...WHEEL_SEGMENTS[index], index };
  }
  return { ...WHEEL_SEGMENTS[0], index: 0 };
}
