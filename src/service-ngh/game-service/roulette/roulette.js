import { createGlobalBettingGame } from "../shared/global-betting-game.js";
import { createRouletteHistoryImage, createRouletteResultImage } from "./canvas.js";
import { chooseRouletteResult, getRouletteOutcome, normalizeRouletteDoor, settleRouletteBet } from "./rules.js";

export const handleRouletteBet = createGlobalBettingGame({
  command: "roulette", aliases: ["rl", "rou"], title: "ROULETTE", historyCollection: "roulette_history",
  normalizeDoor: normalizeRouletteDoor, chooseResult: (players) => chooseRouletteResult(players), settle: settleRouletteBet,
  serializeResult: (result) => ({ number: result.number }), deserializeResult: (row) => ({ number: Number(row.number) }),
  formatOutcome: (result) => { const o = getRouletteOutcome(result.number); return result.number === 0 ? "Số 0 — MÀU XANH" : `Số ${result.number} — ${o.color === "do" ? "ĐỎ" : "ĐEN"} • ${o.parity === "chan" ? "CHẴN" : "LẺ"} • ${o.size === "tai" ? "TÀI" : "XỈU"}`; },
  renderResult: createRouletteResultImage, renderHistory: createRouletteHistoryImage,
  usage: (prefix) => `Cú pháp: ${prefix}roulette <cửa> <tiền>\nCửa chính: do, den, chan, le, tai, xiu\nSố đơn: so0 ... so36\nCột: cot1 ... cot3\nNhóm 12 số: chuc1 ... chuc3\nSoi cầu: ${prefix}roulette soicau`,
  oddsSummary: "Tỷ lệ: cửa chính 1:1 • cột/nhóm 1:2 • số đơn 1:35",
});
