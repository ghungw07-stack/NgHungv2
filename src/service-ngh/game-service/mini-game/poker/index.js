// Entry point cho lệnh !poker
import { removeMention } from "../../../../utils/format-util.js";
import { getGlobalPrefix } from "../../../service.js";
import { sendMessageComplete, sendMessageWarning } from "../../../chat-zalo/chat-style/chat-style.js";
import {
  createRoom,
  joinRoom,
  leaveRoom,
  startGame,
  actionFold,
  actionCheck,
  actionCall,
  actionRaise,
  actionAllIn,
  showInfo,
  sendMyHandAgain,
  hasRoomInThread,
  isPlayerInRoom,
} from "./poker-manager.js";

// Các từ khóa có thể dùng trực tiếp (không cần prefix) khi đang trong room poker
const SHORT_ACTIONS = new Set([
  "fold",
  "check",
  "call",
  "raise",
  "allin",
  "all-in",
  "info",
  "status",
  "mybai",
  "hand",
  "card",
]);

// Handle non-prefix chat: user trong room poker gõ thẳng "fold", "call 5000", "raise 1000", v.v.
// Return true nếu đã xử lý (caller skip xử lý khác).
export async function handlePokerChat(api, message) {
  const threadId = message.threadId;
  if (!hasRoomInThread(threadId)) return false;
  const senderId = message.data?.uidFrom;
  if (!senderId) return false;
  if (!isPlayerInRoom(threadId, senderId)) return false;

  const content = String(message.data?.content || "").trim();
  if (!content) return false;
  const tokens = content.split(/\s+/);
  const word = tokens[0]?.toLowerCase();
  if (!SHORT_ACTIONS.has(word)) return false;

  switch (word) {
    case "fold":
      await actionFold(api, message);
      return true;
    case "check":
      await actionCheck(api, message);
      return true;
    case "call":
      await actionCall(api, message);
      return true;
    case "raise":
      await actionRaise(api, message, parseInt(tokens[1], 10));
      return true;
    case "allin":
    case "all-in":
      await actionAllIn(api, message);
      return true;
    case "info":
    case "status":
      await showInfo(api, message);
      return true;
    case "mybai":
    case "hand":
    case "card":
      await sendMyHandAgain(api, message);
      return true;
  }
  return false;
}

function buildHelp(prefix, alias) {
  const c = `${prefix}${alias}`;
  return (
    `🃏 POKER — HƯỚNG DẪN\n\n` +
    `  ${c} create <bet>: Tạo bàn PvP — chờ ai đó join\n` +
    `  ${c} create <bet> bot: Chơi 1v1 với Bot\n` +
    `  ${c} join: Tham gia bàn đang chờ\n` +
    `  ${c} leave: Rời bàn (chỉ trước start)\n` +
    `  ${c} start: Host bắt đầu (cần ≥2 người)\n\n` +
    `🎯 LỆNH KHI ĐÃ TRONG BÀN\n` +
    `  fold: BỎ bài, mất tiền đã cược\n` +
    `  check: BỎ QUA — khi không ai raise\n` +
    `  call: THEO mức cược cao nhất\n` +
    `  raise <số>: TỐ THÊM (vd: raise 5000)\n` +
    `  allin: TẤT TAY toàn bộ số dư\n` +
    `  info: Xem trạng thái bàn\n` +
    `  mybai: Bot lại bài riêng (nếu chưa nhận)\n\n` +
    `💡 LƯU Ý\n` +
    `• Tối đa 6 người/bàn, tối thiểu 2 người mới start được.\n` +
    `  lệnh mybai để xin lại bài nếu chưa nhận được DM.\n`
  );
}

export async function handlePokerCommand(api, message, aliasCommand) {
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const content = removeMention(message);
  const query = content.replace(`${prefix}${aliasCommand}`, "").trim();
  const tokens = query.length > 0 ? query.split(/\s+/) : [];

  if (tokens.length === 0) {
    await sendMessageComplete(api, message, buildHelp(prefix, aliasCommand), false, 300000);
    return;
  }

  const sub = tokens[0].toLowerCase();

  switch (sub) {
    case "create": {
      const bet = parseInt(tokens[1], 10);
      if (!bet || bet < 100) {
        await sendMessageWarning(
          api,
          message,
          `Min bet không hợp lệ. Tối thiểu 100 VND.\nVí dụ: ${prefix}${aliasCommand} create 1000`,
          true,
          60000
        );
        return;
      }
      const vsBot = (tokens[2] || "").toLowerCase() === "bot";
      await createRoom(api, message, bet, vsBot);
      return;
    }
    case "join":
      await joinRoom(api, message);
      return;
    case "leave":
    case "quit":
      await leaveRoom(api, message);
      return;
    case "start":
    case "begin":
      await startGame(api, message);
      return;
    case "info":
    case "status":
      await showInfo(api, message);
      return;
    case "mybai":
    case "hand":
    case "card":
      await sendMyHandAgain(api, message);
      return;
    case "fold":
      await actionFold(api, message);
      return;
    case "check":
      await actionCheck(api, message);
      return;
    case "call":
      await actionCall(api, message);
      return;
    case "raise":
    case "r":
      await actionRaise(api, message, parseInt(tokens[1], 10));
      return;
    case "allin":
    case "all-in":
      await actionAllIn(api, message);
      return;
    default:
      await sendMessageComplete(api, message, buildHelp(prefix, aliasCommand), false, 180000);
      return;
  }
}

