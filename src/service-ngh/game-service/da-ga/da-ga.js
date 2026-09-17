import { createGlobalBettingGame } from "../shared/global-betting-game.js";
import { createDaGaHistoryImage, createDaGaResultGif } from "./render.js";
import { chooseDaGaResult, DA_GA_DOORS, normalizeDaGaDoor, settleDaGaBet } from "./rules.js";

export const handleDaGaBet = createGlobalBettingGame({
  command: "daga",
  aliases: ["da-ga", "dagacua"],
  title: "ĐÁ GÀ",
  historyCollection: "daga_history",
  normalizeDoor: normalizeDaGaDoor,
  chooseResult: chooseDaGaResult,
  settle: settleDaGaBet,
  serializeResult: result => ({ winner: result.winner, rounds: result.rounds, seed: result.seed }),
  deserializeResult: row => ({ winner: row.winner, rounds: row.rounds, seed: row.seed }),
  formatOutcome: result => `${DA_GA_DOORS[result.winner].label.toUpperCase()} ${result.winner === "hoa" ? "— BẤT PHÂN THẮNG BẠI" : `THẮNG SAU ${result.rounds} HIỆP`}`,
  renderResult: createDaGaResultGif,
  renderHistory: createDaGaHistoryImage,
  usage: prefix => `Cú pháp:\n• ${prefix}daga do <tiền>\n• ${prefix}daga xanh <tiền>\n• ${prefix}daga hoa <tiền>\n• ${prefix}daga soicau`,
  oddsSummary: "Tỷ lệ trả thưởng: Gà Đỏ/Gà Xanh x1.90 • Hòa x8.50",
  renderBeforeSettlement: true,
});
