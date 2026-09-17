import { createGlobalBettingGame } from "../shared/global-betting-game.js";
import { createBancaResultImage } from "./canvas.js";
import { chooseBancaResult, FISH_DOORS, normalizeBancaDoor, settleBancaBet } from "./rules.js";

export const handleBancaBet = createGlobalBettingGame({
  command: "banca", aliases: ["banca", "fish", "ban-ca", "bancafish"], title: "BẮN CÁ CƯỢC",
  historyCollection: "banca_history", normalizeDoor: normalizeBancaDoor,
  chooseResult: (players) => chooseBancaResult(players), settle: settleBancaBet,
  serializeResult: (result) => ({ key: result.key, multiplier: result.multiplier }),
  deserializeResult: (row) => ({ key: row.key, multiplier: Number(row.multiplier) }),
  formatOutcome: (result) => { const fish = FISH_DOORS.find((item) => item.key === result.key) || FISH_DOORS[0]; return `${fish.label} trúng đạn • hệ số x${fish.multiplier}`; },
  renderResult: createBancaResultImage, renderBeforeSettlement: false,
  usage: (prefix) => `Cú pháp: ${prefix}banca <số cá|tên cá> <tiền>\nCửa: 1, 2, 3, 6, 7, 8, 9, 10, 11, 12, boss\nMỗi ván chốt sau 30 giây.`,
  oddsSummary: "Cá con x1.5 • Cá vàng nhỏ x2.5 • Cá nóc x4 • Bạch tuộc tím x7 • Cua đỏ x12 • Tôm đỏ x20 • Bạch tuộc hồng x35 • Cá lớn x200 • Cá vàng x500 • Cá rồng x1000 • Boss x10000",
});
