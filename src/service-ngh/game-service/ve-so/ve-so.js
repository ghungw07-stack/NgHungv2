import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { connection, NAME_TABLE_PLAYERS } from "../../../database/state.js";
import { getUsernameByIdZalo, recordGameHistory } from "../../../database/player.js";
import { getApiManager } from "../../../index.js";
import { JSON_DATA_PATH } from "../../../utils/io-json.js";
import { gameMentionPlayer, buildGamePlayerMessage } from "../../../utils/game-mentions.js";
import { sendMessageFromSQL } from "../../chat-zalo/chat-style/chat-style.js";
import { getGlobalPrefix } from "../../service.js";
import { checkBeforeJoinGame } from "../index.js";
import { createLotteryEngine } from "./engine.js";
import { applyLotteryWallet } from "./wallet.js";
import { PRIZES, TICKET_PRICE, purchaseNumbers } from "./rules.js";

var engine;
var timer;
var ticking = false;

const money = amount => `${(amount / 1_000_000_000).toLocaleString("vi-VN")} tỷ`;
const resultText = session => `🎟️ VÉ SỐ 60S • KỲ #${session.code}\n` +
  PRIZES.map(prize => `${prize.name}: ${session.result[prize.key].join(" • ")} (${money(prize.amount)}/vé)`).join("\n");

async function notifyResults(session) {
  const destinations = new Map();
  for (const order of session.orders.filter(order => order.status === "settled")) {
    const key = JSON.stringify([order.botId, order.threadId, order.type]);
    if (!destinations.has(key)) destinations.set(key, []);
    destinations.get(key).push(order);
    await recordGameHistory({
      username: order.username, playerName: order.name, gameName: "Vé số 60s", gameKey: "veso",
      choice: order.numbers.join(", "), amount: order.numbers.length * TICKET_PRICE,
      netAmount: order.payout - order.numbers.length * TICKET_PRICE,
      isWin: order.payout > order.numbers.length * TICKET_PRICE,
      detail: `Kỳ #${session.code}, đặc biệt ${session.result.db[0]}, nhận ${money(order.payout)}`,
      referenceCode: `VS-${order.id}`,
    }).catch(error => console.error("[veso] Lưu lịch sử ví:", error));
  }
  for (const orders of destinations.values()) {
    const first = orders[0];
    const api = getApiManager(first.botId)?.apiZalo;
    if (!api) continue;
    // Chia thông báo để nhiều người/mua nhiều vé không vượt độ dài tin nhắn.
    const rows = orders.flatMap(order => {
      const wins = order.winnings.filter(item => item.prize);
      return [[{ player: order }, `: ${order.numbers.length} vé, nhận ${money(order.payout)}\n`],
        ...wins.map(item => [`  ${item.number}: ${item.prize.name} +${money(item.prize.amount)}\n`])];
    });
    for (let offset = 0; offset < rows.length; offset += 15) {
      const text = buildGamePlayerMessage([offset ? `🎟️ Kỳ #${session.code} (tiếp)\n` : `${resultText(session)}\n\n`,
        rows.slice(offset, offset + 15)], { threadId: first.threadId, botId: first.botId, type: first.type });
      await api.sendMessage({ ...text, ttl: 3_600_000 }, first.threadId, first.type)
        .catch(error => console.error("[veso] Gửi kết quả:", error));
    }
  }
}

export function initializeGameVeSo() {
  if (engine) return engine;
  const file = path.join(JSON_DATA_PATH, "ve-so.json");
  let state = { version: 1, nextCode: 1, current: null, history: [] };
  try {
    state = JSON.parse(fs.readFileSync(file, "utf8"));
    if (state.version !== 1 || !Array.isArray(state.history) || !Number.isInteger(state.nextCode)) {
      throw new Error("Dữ liệu vé số không hợp lệ.");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  engine = createLotteryEngine({
    state,
    save: data => {
      fs.mkdirSync(JSON_DATA_PATH, { recursive: true });
      const temp = `${file}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
      fs.renameSync(temp, file);
    },
    wallet: operation => applyLotteryWallet(connection.collection(NAME_TABLE_PLAYERS), operation),
    notify: notifyResults,
  });
  if (!timer) timer = setInterval(async () => {
    if (ticking || !connection) return;
    ticking = true;
    try { await engine.tick(); }
    catch (error) { console.error("[veso] Phiên đang chờ xử lý lại:", error); }
    finally { ticking = false; }
  }, 1000);
  timer.unref?.();
  console.log("[veso] Đã khởi động vé số 60s: vé 10 tỷ, đặc biệt 500 tỷ.");
  return engine;
}

function help(prefix) {
  return `🎟️ VÉ SỐ 60 GIÂY\nMỗi vé 6 chữ số giá 10 tỷ tiền ảo.\n` +
    `Vé đầu tiên mở kỳ 60 giây chung toàn bot; mua thêm không kéo dài thời gian.\n\n` +
    `${prefix}veso mua — mua 1 vé ngẫu nhiên\n${prefix}veso mua 5 — mua 5 vé ngẫu nhiên\n` +
    `${prefix}veso chon 123456 — mua số tự chọn\n${prefix}veso ve — xem vé của bạn\n` +
    `${prefix}veso phien — xem thời gian còn lại\n${prefix}veso lichsu — xem kết quả gần nhất\n\n` +
    PRIZES.map(prize => `${prize.name}: ${money(prize.amount)} • khớp ${prize.digits} số cuối`).join("\n") +
    `\nMỗi vé chỉ nhận giải cao nhất, trả đủ mức niêm yết vào ví. Tối đa 100 vé/người/kỳ.\n` +
    `Vé trùng số được tính riêng. Kết quả quay ngẫu nhiên, không phụ thuộc vé đã mua.`;
}

export async function handleVeSoCommand(api, message, groupSettings) {
  if (!(await checkBeforeJoinGame(api, message, groupSettings, true))) return;
  const reply = (text, success = true) => sendMessageFromSQL(api, message, { success, message: text }, false, 120_000);
  const prefix = getGlobalPrefix(api.getBotId());
  const content = String(message.data.content || "").trim().split(/\s+/);
  // Hỗ trợ cả lệnh trực tiếp và điều phối qua game nếu được gọi từ menu chung.
  const commandIndex = content[0] === `${prefix}game` ? 1 : 0;
  const action = (content[commandIndex + 1] || "help").toLowerCase();
  try {
    const game = initializeGameVeSo();
    if (["help", "hd", "huongdan"].includes(action)) return reply(help(prefix));
    if (["lichsu", "ls", "kq"].includes(action)) {
      const history = game.state.history.filter(session => session.result).slice(0, 3);
      return reply(history.length ? history.map(resultText).join("\n\n") : "Chưa có kết quả vé số.");
    }
    const session = game.state.current;
    if (["phien", "time", "info"].includes(action)) return reply(session
      ? `🎟️ Kỳ #${session.code}: còn ${Math.max(0, Math.ceil((session.endsAt - Date.now()) / 1000))} giây.\nĐã bán ${session.orders.filter(o => o.status === "paid").reduce((n, o) => n + o.numbers.length, 0)} vé.`
      : `Chưa mở kỳ mới. Dùng ${prefix}veso mua để mua vé và bắt đầu 60 giây.`);
    const username = await getUsernameByIdZalo(message.data.uidFrom);
    if (!username) return reply("Không tìm thấy hồ sơ game.", false);
    if (["ve", "vé", "cuatoi"].includes(action)) {
      const target = session?.orders.some(o => o.username === username && o.status !== "rejected") ? session
        : game.state.history.find(s => s.orders.some(o => o.username === username && o.status !== "rejected"));
      const orders = target?.orders.filter(o => o.username === username && o.status !== "rejected") || [];
      return reply(orders.length ? `🎟️ Vé của bạn • Kỳ #${target.code}\n` + orders.map(o =>
        `${o.numbers.join(", ")}\n${o.status === "pending" ? "Đang xác nhận thanh toán" : o.status === "settled" ? `Đã nhận ${money(o.payout)}` : "Đang chờ xổ"}`).join("\n")
        : `Bạn chưa có vé. Dùng ${prefix}veso mua.`);
    }
    const numbers = purchaseNumbers(action, content.slice(commandIndex + 2));
    const requestId = JSON.stringify([api.getBotId(), message.data.uidFrom, message.threadId,
      message.data.msgId || message.data.cliMsgId || randomUUID()]);
    const bought = await game.buy({ ...gameMentionPlayer(api, message), username, type: message.type }, numbers, requestId);
    return reply(`🎟️ Đã mua ${bought.order.numbers.length} vé • Kỳ #${bought.session.code}\n` +
      `Số vé: ${bought.order.numbers.join(", ")}\nGiá: ${money(bought.order.numbers.length * TICKET_PRICE)} tiền ảo\n` +
      `⏳ Còn ${Math.max(0, Math.ceil((bought.session.endsAt - Date.now()) / 1000))} giây. Đặc biệt: 500 tỷ!`);
  } catch (error) {
    console.error("[veso] Xử lý lệnh:", error);
    return reply(`${error.message}\nXem vé: ${prefix}veso ve • Hướng dẫn: ${prefix}veso`, false);
  }
}
