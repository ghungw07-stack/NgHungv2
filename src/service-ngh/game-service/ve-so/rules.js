import { randomInt } from "node:crypto";

export const TICKET_PRICE = 10_000_000_000;
export const DRAW_DURATION = 60_000;
export const MAX_TICKETS = 100;
export const PRIZES = Object.freeze([
  { key: "db", name: "Đặc biệt", digits: 6, count: 1, amount: 500_000_000_000 },
  { key: "g1", name: "Giải nhất", digits: 5, count: 1, amount: 100_000_000_000 },
  { key: "g2", name: "Giải nhì", digits: 5, count: 1, amount: 50_000_000_000 },
  { key: "g3", name: "Giải ba", digits: 5, count: 2, amount: 30_000_000_000 },
  { key: "g4", name: "Giải tư", digits: 5, count: 7, amount: 20_000_000_000 },
  { key: "g5", name: "Giải năm", digits: 4, count: 1, amount: 10_000_000_000 },
  { key: "g6", name: "Giải sáu", digits: 4, count: 3, amount: 5_000_000_000 },
  { key: "g7", name: "Giải bảy", digits: 3, count: 1, amount: 2_000_000_000 },
  { key: "g8", name: "Giải tám", digits: 2, count: 1, amount: 1_000_000_000 },
].map(Object.freeze));

export function randomTicket(drawInt = randomInt) {
  return String(drawInt(1_000_000)).padStart(6, "0");
}

export function drawLottery(drawInt = randomInt) {
  return Object.fromEntries(PRIZES.map(prize => [prize.key,
    Array.from({ length: prize.count }, () => String(drawInt(10 ** prize.digits)).padStart(prize.digits, "0")),
  ]));
}

export function ticketPrize(number, result) {
  if (!/^\d{6}$/.test(number)) throw new Error("Vé phải có đúng 6 chữ số.");
  return PRIZES.find(prize => result[prize.key]?.includes(number.slice(-prize.digits))) || null;
}

export function purchaseNumbers(action, args, drawInt = randomInt) {
  if (action === "chon" || action === "chọn") {
    const numbers = args.join(",").split(",");
    if (!numbers.length || numbers.length > MAX_TICKETS || numbers.some(n => !/^\d{6}$/.test(n))) {
      throw new Error("Nhập từ 1 đến 100 số vé, mỗi số đúng 6 chữ số; cách nhau bằng dấu phẩy hoặc dấu cách.");
    }
    return numbers;
  }
  if (action !== "mua" || args.length > 1 || (args.length && !/^\d{1,3}$/.test(args[0]))) {
    throw new Error("Dùng veso mua [số lượng] hoặc veso chon <6 chữ số>.");
  }
  const count = Number(args[0] ?? 1);
  if (count < 1 || count > MAX_TICKETS) throw new Error("Mỗi lần mua từ 1 đến 100 vé.");
  return Array.from({ length: count }, () => randomTicket(drawInt));
}
