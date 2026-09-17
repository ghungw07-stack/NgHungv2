import { createGlobalBettingGame } from "../shared/global-betting-game.js";
import { createLongHoHistoryImage, createLongHoResultImage } from "./canvas.js";
import { LONG_HO_DOORS, cardRankLabel, chooseLongHoResult, normalizeLongHoDoor, settleLongHoBet } from "./rules.js";

export const handleLongHoBet = createGlobalBettingGame({
  command: "longho",
  aliases: ["lh", "long-ho"],
  title: "LONG HỔ",
  historyCollection: "longho_history",
  normalizeDoor: normalizeLongHoDoor,
  chooseResult: (players) => chooseLongHoResult(players),
  settle: settleLongHoBet,
  serializeResult: (result) => ({ longCard: result.longCard, hoCard: result.hoCard, resultDoor: result.resultDoor }),
  deserializeResult: (row) => ({ longCard: row.longCard, hoCard: row.hoCard, resultDoor: row.resultDoor }),
  formatOutcome: (result) => `Long ${cardRankLabel(result.longCard.rank)}${result.longCard.suit} • Hổ ${cardRankLabel(result.hoCard.rank)}${result.hoCard.suit} — ${result.resultDoor === "hoa" ? "HÒA" : `${LONG_HO_DOORS[result.resultDoor].label.toUpperCase()} THẮNG`}`,
  renderResult: createLongHoResultImage,
  renderHistory: createLongHoHistoryImage,
  usage: (prefix) => `Cú pháp:\n• ${prefix}longho long <tiền>\n• ${prefix}longho ho <tiền>\n• ${prefix}longho hoa <tiền>\n• ${prefix}longho soicau`,
  oddsSummary: "Tỷ lệ: Long/Hổ 1:0.95 • Hòa 1:8",
});
