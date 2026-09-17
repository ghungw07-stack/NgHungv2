import { createGlobalBettingGame } from "../shared/global-betting-game.js";
import { createKenoHistoryImage, createKenoResultImage } from "./canvas.js";
import { chooseKenoResult, normalizeKenoDoor, settleKenoBet } from "./rules.js";

export const handleKenoBet = createGlobalBettingGame({
  command: "keno", aliases: ["kn"], title: "KENO", historyCollection: "keno_history",
  normalizeDoor: normalizeKenoDoor, chooseResult: (players) => chooseKenoResult(players), settle: settleKenoBet,
  serializeResult: (result) => ({ numbers: result.numbers }), deserializeResult: (row) => ({ numbers: row.numbers.map(Number) }),
  formatOutcome: (result) => `10 số đã ra: ${result.numbers.join(" • ")}`,
  renderResult: createKenoResultImage, renderHistory: createKenoHistoryImage,
  usage: (prefix) => `Cú pháp: ${prefix}keno <1 đến 5 số> <tiền>\nVí dụ: ${prefix}keno 2,8,19 100k\nCác số hợp lệ từ 1 đến 40\nSoi cầu: ${prefix}keno soicau`,
  oddsSummary: "Chọn càng nhiều số, giải trúng đủ càng lớn; vé 3 số trúng 2 được hoàn cược.",
});
