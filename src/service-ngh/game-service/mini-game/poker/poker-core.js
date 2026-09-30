// Texas Hold'em core: deck, card, hand evaluator.
// Bài: rank A=14, K=13, Q=12, J=11, T=10, 9..2 = 9..2
// Suit: ♠=spade, ♥=heart, ♦=diamond, ♣=club

export const SUITS = ["spade", "heart", "diamond", "club"];
export const SUIT_SYMBOLS = { spade: "♠", heart: "♥", diamond: "♦", club: "♣" };
export const SUIT_COLORS = { spade: "#000000", club: "#000000", heart: "#d00000", diamond: "#d00000" };
export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
export const RANK_VALUE = Object.fromEntries(RANKS.map((r, i) => [r, i + 2])); // 2..14

export function buildDeck() {
  const deck = [];
  for (const s of SUITS) {
    for (const r of RANKS) deck.push({ rank: r, suit: s, value: RANK_VALUE[r] });
  }
  return deck;
}

export function shuffle(deck) {
  const a = [...deck];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function cardToString(c) {
  return `${c.rank}${SUIT_SYMBOLS[c.suit]}`;
}

// Hand categories (cao → thấp giá trị, dùng số càng lớn càng mạnh):
export const HAND_RANK = {
  HIGH_CARD: 1,
  ONE_PAIR: 2,
  TWO_PAIR: 3,
  THREE_KIND: 4,
  STRAIGHT: 5,
  FLUSH: 6,
  FULL_HOUSE: 7,
  FOUR_KIND: 8,
  STRAIGHT_FLUSH: 9,
  ROYAL_FLUSH: 10,
};

export const HAND_NAME_VI = {
  [HAND_RANK.HIGH_CARD]: "Mậu thầu",
  [HAND_RANK.ONE_PAIR]: "Một đôi",
  [HAND_RANK.TWO_PAIR]: "Hai đôi",
  [HAND_RANK.THREE_KIND]: "Sám cô",
  [HAND_RANK.STRAIGHT]: "Sảnh",
  [HAND_RANK.FLUSH]: "Thùng",
  [HAND_RANK.FULL_HOUSE]: "Cù lũ",
  [HAND_RANK.FOUR_KIND]: "Tứ quý",
  [HAND_RANK.STRAIGHT_FLUSH]: "Thùng phá sảnh",
  [HAND_RANK.ROYAL_FLUSH]: "Sảnh rồng",
};

// Đánh giá 5 lá bài. Trả về { rank: HAND_RANK.*, tiebreaker: [...] }
// tiebreaker là mảng số dùng để so sánh khi cùng rank (lex compare, giá trị càng cao càng mạnh).
function evaluate5(cards) {
  const values = cards.map((c) => c.value).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const isFlush = suits.every((s) => s === suits[0]);
  // Sảnh: 5 giá trị liên tiếp. Lưu ý: A-2-3-4-5 (wheel), giá trị cao nhất = 5
  let isStraight = false;
  let straightHigh = 0;
  const unique = [...new Set(values)];
  if (unique.length === 5) {
    if (unique[0] - unique[4] === 4) {
      isStraight = true;
      straightHigh = unique[0];
    } else if (unique[0] === 14 && unique[1] === 5 && unique[2] === 4 && unique[3] === 3 && unique[4] === 2) {
      isStraight = true;
      straightHigh = 5; // wheel: A-2-3-4-5, sảnh nhỏ nhất
    }
  }

  // Đếm số lần xuất hiện của mỗi rank
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  const grouped = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]; // số lần xuất hiện giảm dần
    return b[0] - a[0]; // cùng số lần thì giá trị giảm dần
  });
  const groupCounts = grouped.map((g) => g[1]);
  const groupValues = grouped.map((g) => g[0]);

  if (isStraight && isFlush) {
    if (straightHigh === 14) return { rank: HAND_RANK.ROYAL_FLUSH, tiebreaker: [14] };
    return { rank: HAND_RANK.STRAIGHT_FLUSH, tiebreaker: [straightHigh] };
  }
  if (groupCounts[0] === 4) {
    return { rank: HAND_RANK.FOUR_KIND, tiebreaker: groupValues };
  }
  if (groupCounts[0] === 3 && groupCounts[1] === 2) {
    return { rank: HAND_RANK.FULL_HOUSE, tiebreaker: groupValues };
  }
  if (isFlush) {
    return { rank: HAND_RANK.FLUSH, tiebreaker: values };
  }
  if (isStraight) {
    return { rank: HAND_RANK.STRAIGHT, tiebreaker: [straightHigh] };
  }
  if (groupCounts[0] === 3) {
    return { rank: HAND_RANK.THREE_KIND, tiebreaker: groupValues };
  }
  if (groupCounts[0] === 2 && groupCounts[1] === 2) {
    return { rank: HAND_RANK.TWO_PAIR, tiebreaker: groupValues };
  }
  if (groupCounts[0] === 2) {
    return { rank: HAND_RANK.ONE_PAIR, tiebreaker: groupValues };
  }
  return { rank: HAND_RANK.HIGH_CARD, tiebreaker: values };
}

// So sánh 2 kết quả evaluate. Trả về > 0 nếu a mạnh hơn, < 0 nếu b mạnh hơn, 0 nếu hòa.
export function compareHands(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.tiebreaker.length, b.tiebreaker.length); i++) {
    const av = a.tiebreaker[i] || 0;
    const bv = b.tiebreaker[i] || 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

// Chọn 5 lá tốt nhất từ 7 lá (2 hole + 5 community). Trả về { result, bestFive }.
export function evaluateBest(holeCards, communityCards) {
  const all = [...holeCards, ...communityCards];
  if (all.length < 5) {
    return { result: evaluate5(all.concat(Array(5 - all.length).fill({ value: 0, suit: "spade" }))), bestFive: all };
  }
  // Combination nC5: 21 combos cho 7 lá. Đủ nhanh.
  let best = null;
  let bestFive = null;
  const n = all.length;
  for (let i = 0; i < n - 4; i++) {
    for (let j = i + 1; j < n - 3; j++) {
      for (let k = j + 1; k < n - 2; k++) {
        for (let l = k + 1; l < n - 1; l++) {
          for (let m = l + 1; m < n; m++) {
            const five = [all[i], all[j], all[k], all[l], all[m]];
            const r = evaluate5(five);
            if (!best || compareHands(r, best) > 0) {
              best = r;
              bestFive = five;
            }
          }
        }
      }
    }
  }
  return { result: best, bestFive };
}

