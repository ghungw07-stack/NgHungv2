export const BACCARAT_DOORS = Object.freeze([
  "con",
  "cái",
  "hòa",
  "con_đôi",
  "cái_đôi",
  "long_con",
  "long_cái",
]);

const DOOR_LABELS = Object.freeze({
  con: "Tay con",
  "cái": "Nhà cái",
  "hòa": "Hòa",
  "con_đôi": "Con đôi",
  "cái_đôi": "Cái đôi",
  long_con: "Long bảo Con",
  "long_cái": "Long bảo Cái",
});

const DOOR_ALIASES = Object.freeze({
  con: "con",
  player: "con",
  cai: "cái",
  banker: "cái",
  hoa: "hòa",
  tie: "hòa",
  condoi: "con_đôi",
  doicon: "con_đôi",
  playerpair: "con_đôi",
  caidoi: "cái_đôi",
  doicai: "cái_đôi",
  bankerpair: "cái_đôi",
  longcon: "long_con",
  baocon: "long_con",
  longbaocon: "long_con",
  dragoncon: "long_con",
  playerdragon: "long_con",
  longcai: "long_cái",
  baocai: "long_cái",
  longbaocai: "long_cái",
  dragoncai: "long_cái",
  bankerdragon: "long_cái",
});

const DRAGON_PROFIT_BY_MARGIN = Object.freeze({
  4: 1,
  5: 2,
  6: 4,
  7: 6,
  8: 10,
  9: 30,
});

export function normalizeBaccaratDoor(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]/g, "");
  return DOOR_ALIASES[key] || null;
}

export function getBaccaratDoorLabel(door) {
  return DOOR_LABELS[door] || String(door || "Không rõ");
}

export function isBaccaratPair(cards) {
  return Array.isArray(cards) && cards.length >= 2 && cards[0]?.rank === cards[1]?.rank;
}

export function isBaccaratNatural(deal) {
  return deal.player.length === 2 && deal.banker.length === 2 && (deal.pScore >= 8 || deal.bScore >= 8);
}

function dragonProfit(side, deal) {
  if (deal.resultDoor === "hòa" || deal.resultDoor !== side) return 0;
  if (isBaccaratNatural(deal)) return 1;
  const margin = side === "con" ? deal.pScore - deal.bScore : deal.bScore - deal.pScore;
  return DRAGON_PROFIT_BY_MARGIN[margin] || 0;
}

export function evaluateBaccaratBet(door, deal) {
  if (door === "con" || door === "cái") {
    if (deal.resultDoor === "hòa") return { outcome: "push", totalMultiplier: 1, profitMultiplier: 0 };
    if (deal.resultDoor !== door) return { outcome: "lose", totalMultiplier: 0, profitMultiplier: -1 };
    const profitMultiplier = door === "con" ? 1 : 0.95;
    return { outcome: "win", totalMultiplier: profitMultiplier + 1, profitMultiplier };
  }

  if (door === "hòa") {
    return deal.resultDoor === "hòa"
      ? { outcome: "win", totalMultiplier: 9, profitMultiplier: 8 }
      : { outcome: "lose", totalMultiplier: 0, profitMultiplier: -1 };
  }

  if (door === "con_đôi" || door === "cái_đôi") {
    const cards = door === "con_đôi" ? deal.player : deal.banker;
    return isBaccaratPair(cards)
      ? { outcome: "win", totalMultiplier: 12, profitMultiplier: 11 }
      : { outcome: "lose", totalMultiplier: 0, profitMultiplier: -1 };
  }

  if (door === "long_con" || door === "long_cái") {
    const profitMultiplier = dragonProfit(door === "long_con" ? "con" : "cái", deal);
    return profitMultiplier > 0
      ? { outcome: "win", totalMultiplier: profitMultiplier + 1, profitMultiplier }
      : { outcome: "lose", totalMultiplier: 0, profitMultiplier: -1 };
  }

  return { outcome: "lose", totalMultiplier: 0, profitMultiplier: -1 };
}

export function getWinningBaccaratDoors(deal) {
  return BACCARAT_DOORS.filter((door) => evaluateBaccaratBet(door, deal).outcome === "win");
}

export function buildBaccaratRoad(history, maxRows = 6) {
  const rows = Math.max(1, Number(maxRows) || 6);
  const placements = [];
  const occupied = new Set();
  let streakStartColumn = -1;
  let column = -1;
  let row = 0;
  let lastDoor = null;
  let lastPlacement = null;
  let pendingTies = 0;

  for (const item of history || []) {
    if (item?.door === "hòa") {
      if (lastPlacement) lastPlacement.ties += 1;
      else pendingTies += 1;
      continue;
    }
    if (item?.door !== "con" && item?.door !== "cái") continue;

    if (item.door !== lastDoor) {
      streakStartColumn += 1;
      column = streakStartColumn;
      row = 0;
      while (occupied.has(`${column}:${row}`)) column += 1;
      streakStartColumn = column;
    } else if (row + 1 < rows && !occupied.has(`${column}:${row + 1}`)) {
      row += 1;
    } else {
      column += 1;
      while (occupied.has(`${column}:${row}`)) column += 1;
    }

    lastPlacement = { column, row, door: item.door, ties: pendingTies };
    pendingTies = 0;
    lastDoor = item.door;
    occupied.add(`${column}:${row}`);
    placements.push(lastPlacement);
  }

  return placements;
}
