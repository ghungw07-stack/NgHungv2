import { formatCurrency, removeMention } from "../../../../utils/format-util.js";
import { readAdmins } from "../../../../utils/io-json.js";
import { sendMessageFromSQL } from "../../../chat-zalo/chat-style/chat-style.js";
import {
  gameTypeCauCa,
  GAME_MESSAGE_TIME_TO_LIVE,
  FINAL_MESSAGE_TIME_TO_LIVE,
  playerCooldowns,
  clearCommandTimeout,
  setProcessingCommand,
  isProcessingCommand,
  startCauCaGame,
  startNewGame,
  endGame,
  isGameActive,
  getCurrentGame,
} from "./game-manager.js";
import { loadGameConfig, loadPlayerData, savePlayerData } from "./dataManager.js";
import { parseItemInput } from "./fuzzySearch.js";
import { formatPlayerInfo, formatHelpDisplay } from "./uiEnhancements.js";
import { CauCaGame } from "./game-class.js";
import { handleDailyCommand } from "./daily-quest.js";
import * as bank from "./bank.js";
import { bossService } from "./boss.js";
import { getActiveGames } from "../index.js";
export { gameTypeCauCa };

function parseQuantity(str) {
  if (!str) return NaN;
  const lower = str.toLowerCase().trim();
  let multiplier = 1;
  let numStr = lower;

  if (lower.endsWith('k') || lower.endsWith('nghìn')) {
    multiplier = 1000;
    numStr = lower.slice(0, - (lower.endsWith('k') ? 1 : 5));
  } else if (lower.endsWith('m') || lower.endsWith('triệu')) {
    multiplier = 1000000;
    numStr = lower.slice(0, - (lower.endsWith('m') ? 1 : 5));
  } else if (lower.endsWith('b') || lower.endsWith('tỉ')) {
    multiplier = 1000000000;
    numStr = lower.slice(0, - (lower.endsWith('b') ? 1 : 3));
  }

  const num = parseFloat(numStr);
  if (isNaN(num)) return NaN;
  return Math.floor(num * multiplier);
}

export async function handleCauCaCommand(api, message, aliasCommand) {
  try {
    const threadId = message?.threadId;
    const senderId = message?.data?.uidFrom;
    const senderName = message?.data?.dName;
    const content = removeMention(message).toLowerCase().trim();
    const args = content.split(/\s+/);
    const command = args[1];

    if (!threadId || !senderId || !senderName) {
      console.error("❌ Invalid message data in handleCauCaCommand");
      await sendMessageFromSQL(api, message, {
        success: false,
        message: "❌ Dữ liệu tin nhắn không hợp lệ!"
      }, false, FINAL_MESSAGE_TIME_TO_LIVE);
      return;
    }

    const cooldownKey = `${threadId}-${senderId}`;
    const lastPlayTime = playerCooldowns.get(cooldownKey);
    const now = Date.now();

    // ========== START GAME ==========
    if (command === "play" || command === "start" || command === "join") {
      if (lastPlayTime && now - lastPlayTime < 60000) {
        const remaining = Math.ceil((60000 - (now - lastPlayTime)) / 1000);
        await sendMessageFromSQL(api, message, {
          success: false,
          message: `⏳ Vui lòng đợi ${remaining}s nữa để chơi lại!`
        }, false, FINAL_MESSAGE_TIME_TO_LIVE);
        return;
      }

      playerCooldowns.set(cooldownKey, now);
      await startCauCaGame(api, message, { playerId: senderId, playerName: senderName });
      return;
    }

    // ========== HELP ==========
    if (command === "help" || command === "huongdan" || !command) {
      const helpText = formatHelpDisplay(aliasCommand);
      await sendMessageFromSQL(api, message, {
        success: true,
        message: helpText
      }, false, FINAL_MESSAGE_TIME_TO_LIVE);
      return;
    }

    // ========== CHECK GAME ==========
    const currentGame = getCurrentGame(threadId, senderId);
    if (!currentGame || !currentGame.isActive) {
      await sendMessageFromSQL(api, message, {
        success: false,
        message: `❌ Bạn chưa bắt đầu game! Dùng \`${aliasCommand} start\` để chơi.`
      }, false, FINAL_MESSAGE_TIME_TO_LIVE);
      return;
    }

    currentGame.lastActivity = Date.now();
    const input = content.replace(aliasCommand, "").trim().toLowerCase();

    // ========== IN-GAME COMMANDS ==========
    if (input === "status" || input === "trangthai") return handleStatus(api, message, currentGame, senderName);
    if (input === "shop" || input === "cuahang" || input.startsWith("shop ") || input.startsWith("cuahang ")) {
      let page = 1;
      if (input.startsWith("shop ") || input.startsWith("cuahang ")) {
        const parts = input.split(/\s+/);
        if (parts.length > 1) {
          const p = parseInt(parts[1], 10);
          if (!isNaN(p) && p > 0) page = p;
        }
      }
      return handleShop(api, message, currentGame, page);
    }
    if (input === "stop" || input === "dung") return handleStop(api, message, currentGame);

    const result = {
      success: false,
      message: "❌ Lệnh không hợp lệ! Dùng cau, shop, status, stop..."
    };
    await sendMessageFromSQL(api, message, result, false, GAME_MESSAGE_TIME_TO_LIVE);
  } catch (error) {
    console.error("❌ Error in handleCauCaCommand:", error);
    await sendMessageFromSQL(api, message, {
      success: false,
      message: "❌ Có lỗi xảy ra khi xử lý lệnh!"
    }, false, FINAL_MESSAGE_TIME_TO_LIVE);
  }
}

// ==================== MESSAGE HANDLER ====================
export async function handleCauCaMessage(api, message) {
  const threadId = message.threadId;
  const senderId = message.data.uidFrom;
  const senderName = message.data.dName;
  const content = message.data.content?.trim().toLowerCase();
  if (!content) return false;

  const currentGame = getCurrentGame(threadId, senderId);
  if (!currentGame || !currentGame.isActive) return false;

  // ========== IN-GAME COMMANDS ==========
  if (content === "help" || content === "huongdan") {
    const helpText = formatHelpDisplay();
    await sendMessageFromSQL(api, message, {
      success: true,
      message: helpText
    }, false, GAME_MESSAGE_TIME_TO_LIVE);
    return true;
  }

  if (content === "cau" || content === "cauca" || content === "cau ca") {
    await handleFish(api, message, currentGame);
    return true;
  }

  if (content === "giatcau" || content === "reel") {
    await sendMessageFromSQL(api, message, { success: true, message: "🎣 Hệ thống câu hiện tự động kéo cá khi cắn câu. Tiếp tục dùng 'cauca' để câu nhiều lần!" }, false, GAME_MESSAGE_TIME_TO_LIVE);
    return true;
  }

  if (content === "status" || content === "trangthai") {
    await handleStatus(api, message, currentGame, senderName);
    return true;
  }

  if (content === "info") {
    await handleStatus(api, message, currentGame, senderName);
    return true;
  }

  if (content === "inventory" || content === "tui" || content === "túi" || content === "bag") {
    await handleInventory(api, message, currentGame);
    return true;
  }

  if (content === "shop" || content === "cuahang" || content.startsWith("shop ") || content.startsWith("cuahang ")) {
    let page = 1;
    if (content.startsWith("shop ") || content.startsWith("cuahang ")) {
      const parts = content.split(/\s+/);
      if (parts.length > 1) {
        const p = parseInt(parts[1], 10);
        if (!isNaN(p) && p > 0) page = p;
      }
    }
    await handleShop(api, message, currentGame, page);
    return true;
  }

  if (content === "location") {
    const cfg = loadGameConfig();
    const currentId = String(currentGame.playerData.currentArea);
    let text = "🚢 DANH SÁCH KHU VỰC\n\n";
    (cfg.areas || []).forEach(a => {
      const mark = String(a.id) === currentId ? " (đang ở)" : "";
      const req = a.levelRequired ? ` - Cần Lv.${a.levelRequired}` : "";
      text += `• [${a.id}] ${a.name}${req}${mark}\n`;
    });
    text += "\nDùng: goto <id|tên> để di chuyển";
    await sendMessageFromSQL(api, message, { success: true, message: text }, false, GAME_MESSAGE_TIME_TO_LIVE);
    return true;
  }

  if (content.startsWith("goto ")) {
    const target = content.slice(5).trim();
    const cfg = loadGameConfig();
    let area = cfg.areas.find(a => String(a.id) === target);
    if (!area) {
      area = cfg.areas.find(a => a.name?.toLowerCase().includes(target));
    }
    if (!area) {
      await sendMessageFromSQL(api, message, { success: false, message: "❌ Không tìm thấy khu vực!" }, false, GAME_MESSAGE_TIME_TO_LIVE);
      return true;
    }
    const playerLevel = currentGame.playerData.level || 0;
    if (playerLevel < (area.levelRequired || 1)) {
      await sendMessageFromSQL(api, message, { success: false, message: `❌ Cần cấp ${area.levelRequired} để đến ${area.name}` }, false, GAME_MESSAGE_TIME_TO_LIVE);
      return true;
    }
    currentGame.playerData.currentArea = area.id;
    const allPlayers = loadPlayerData();
    allPlayers[currentGame.playerId] = currentGame.playerData;
    savePlayerData(allPlayers);
    await sendMessageFromSQL(api, message, { success: true, message: `✅ Đã di chuyển đến: ${area.name} (ID ${area.id})` }, false, GAME_MESSAGE_TIME_TO_LIVE);
    return true;
  }

  if (content.startsWith("set ")) {
    const args = content.split(/\s+/);
    const slotNum = parseInt(args[args.length - 1], 10);
    const name = isNaN(slotNum) ? content.slice(4).trim() : args.slice(1, -1).join(' ');
    const gameInstance = new CauCaGame(currentGame.threadId, currentGame.playerId, currentGame.playerName, currentGame.playerData);
    const result = gameInstance.equipItem(name);
    currentGame.playerData = gameInstance.playerData;
    const allPlayers = loadPlayerData();
    allPlayers[currentGame.playerId] = gameInstance.playerData;
    savePlayerData(allPlayers);
    const note = !isNaN(slotNum) && slotNum > 1 ? "\nℹ️ Slots 2+ dùng cần dự phòng tự động khi câu nhiều slot." : "";
    await sendMessageFromSQL(api, message, { success: result.success, message: result.message + note }, false, GAME_MESSAGE_TIME_TO_LIVE);
    return true;
  }

  if (content.startsWith("use ")) {
    const args = content.slice(4).trim().split(/\s+/);
    const itemType = args[0]?.toLowerCase();
    const index = parseInt(args[1]) - 1; // Convert to 0-based index

    if (itemType === 'rod' && !isNaN(index)) {
      // Handle rod usage by index
      const inv = currentGame.playerData.inventory || {};
      if (inv.rods && Array.isArray(inv.rods) && inv.rods[index]) {
        // Equip the rod to the specified slot or default to slot 1
        const slotNum = args[2] ? parseInt(args[2]) : 1; // Default to slot 1
        const gameInstance = new CauCaGame(currentGame.threadId, currentGame.playerId, currentGame.playerName, currentGame.playerData);
        const result = gameInstance.equipItem(`rod ${index + 1} ${slotNum}`);
        currentGame.playerData = gameInstance.playerData;
        const allPlayers = loadPlayerData();
        allPlayers[currentGame.playerId] = gameInstance.playerData;
        savePlayerData(allPlayers);
        await sendMessageFromSQL(api, message, result, false, GAME_MESSAGE_TIME_TO_LIVE);
        return true;
      } else {
        await sendMessageFromSQL(api, message, { success: false, message: "❌ Cần câu không tồn tại trong túi đồ!" }, false, GAME_MESSAGE_TIME_TO_LIVE);
        return true;
      }
    } else {
      // Handle other items normally
      const name = content.slice(4).trim();
      const gameInstance = new CauCaGame(currentGame.threadId, currentGame.playerId, currentGame.playerName, currentGame.playerData);
      const result = gameInstance.equipItem(name);
      currentGame.playerData = gameInstance.playerData;
      const allPlayers = loadPlayerData();
      allPlayers[currentGame.playerId] = gameInstance.playerData;
      savePlayerData(allPlayers);
      await sendMessageFromSQL(api, message, result, false, GAME_MESSAGE_TIME_TO_LIVE);
      return true;
    }
  }

  if (content.startsWith("buy ")) {
    const item = content.slice(4).trim();
    await handleBuy(api, message, currentGame, item);
    return true;
  }

  if (content.startsWith("sell ")) {
    const item = content.slice(5).trim();
    await handleSell(api, message, currentGame, item);
    return true;
  }

  if (content === "sell" || content === "sellall" || content === "sell all") {
    await handleSell(api, message, currentGame, "all");
    return true;
  }

  if (content === "bank" || content.startsWith("bank ")) {
    await handleBank(api, message, currentGame, content);
    return true;
  }

  if (content === "slot" || content.startsWith("slot ") || content === "mua slot") {
    await handleSlot(api, message, currentGame, content);
    return true;
  }

  if (content === "nv" || content === "nhiemvu" || content.startsWith("nv ") || content.startsWith("nhiemvu ")) {
    await handleQuests(api, message, currentGame);
    return true;
  }

  if (content === "lucky" || content === "quay" || content === "spin") {
    await handleLucky(api, message, currentGame);
    return true;
  }

  if ((content.startsWith("lucky ") || content.startsWith("spin ") || content.startsWith("quay ")) && !content.endsWith("all")) {
    const parts = content.split(/\s+/);
    const n = parseInt(parts[1], 10);
    if (!isNaN(n) && n > 0) {
      await handleLuckyMany(api, message, currentGame, n);
      return true;
    }
  }

  if (content === "lucky all" || content === "quay all" || content === "spin all") {
    await handleLuckyAll(api, message, currentGame);
    return true;
  }

  if (content.startsWith("code ")) {
    const code = content.slice(5).trim();
    await handleRedeemCode(api, message, currentGame, code);
    return true;
  }
  if (content === "code" || content === "code list" || content === "code danh sách" || content === "code danhsach") {
    await handleRedeemCode(api, message, currentGame, "list");
    return true;
  }

  if (content.startsWith("giftcode")) {
    const rest = content.slice(8).trim();
    if (rest.startsWith("use ")) {
      await handleRedeemCode(api, message, currentGame, rest.slice(4).trim());
    } else {
      await handleRedeemCode(api, message, currentGame, "list");
    }
    return true;
  }

  if (content === "bxh" || content === "rank" || content.startsWith("bxh ") || content.startsWith("rank ")) {
    const parts = content.split(/\s+/);
    const type = parts[1] || 'level';
    await handleRank(api, message, type);
    return true;
  }

  if (content === "equip" || content.startsWith("equip ")) {
    await handleEquip(api, message, currentGame, content);
    return true;
  }

  if (content === "stop" || content === "dung") {
    await handleStop(api, message, currentGame);
    return true;
  }

  if (content === "map") {
    await handleMap(api, message, currentGame);
    return true;
  }

  if (content === "boss" || content === "boss status") {
    await handleBossStatus(api, message, currentGame);
    return true;
  }

  if (content === "boss help") {
    const bossHelpText = `🐉 HƯỚNG DẪN LỆNH BOSS 🐉\n\n` +
      `• boss hoặc boss status: Xem trạng thái boss hiện tại\n` +
      `• boss list: Xem danh sách boss có thể triệu hồi\n` +
      `• boss <số thứ tự>: Triệu hồi boss theo số thứ tự (vd: boss 1) (chỉ admin)\n` +
      `• boss attack <sát thương> hoặc attack <sát thương>: Tấn công boss\n` +
      `• boss defeat hoặc boss kill: Tiêu diệt boss ngay lập tức (chỉ admin)\n\n` +
      `💡 Boss xuất hiện định kỳ hoặc có thể triệu hồi thủ công.`;
    await sendMessageFromSQL(api, message, { success: true, message: bossHelpText }, false, GAME_MESSAGE_TIME_TO_LIVE);
    return true;
  }

  if (content === "boss list") {
    await handleBossList(api, message);
    return true;
  }

  if (content.startsWith("boss ")) {
    const parts = content.split(/\s+/);
    if (parts.length === 2 && !isNaN(parts[1])) {
      const index = parseInt(parts[1]) - 1; // 1-based to 0-based
      await handleSpawnBossByIndex(api, message, index);
      return true;
    }
  }

  if (content.startsWith("boss attack ") || content.startsWith("ttack")) {
    const damageStr = content.startsWith("attack") ? content.slice(12).trim() : content.slice(11).trim();
    const damage = parseInt(damageStr);
    if (!isNaN(damage) && damage > 0) {
      await handleBossAttack(api, message, currentGame, damage);
      return true;
    }
  }

  if (content === "boss defeat" || content === "boss kill") {
    const senderId = message.data.uidFrom;
    const adminData = readAdmins();
    const isAdmin = Object.values(adminData).some(admins => admins.includes(senderId));
    if (!isAdmin) {
      await sendMessageFromSQL(api, message, { success: false, message: "❌ Chỉ admin mới dùng được lệnh này!" }, false, GAME_MESSAGE_TIME_TO_LIVE);
      return true;
    }
    const result = bossService.defeatBossInstantly();
    await sendMessageFromSQL(api, message, result, false, GAME_MESSAGE_TIME_TO_LIVE);
    return true;
  }

  if (content === "buff") {
    await handleBuffList(api, message, currentGame);
    return true;
  }

  if (content.startsWith("buff ")) {
    await handleBuff(api, message, currentGame, content);
    return true;
  }

  return false;
}

// ==================== FUNCTION HANDLERS ====================
async function handleFish(api, message, game) {
  // Check for active boss
  const activeBoss = bossService.getActiveBoss();
  if (activeBoss) {
    await sendMessageFromSQL(api, message, { success: false, message: "❌ Không thể câu cá khi có boss đang hoạt động! Hãy đánh bại boss trước." }, false, GAME_MESSAGE_TIME_TO_LIVE);
    return;
  }

  if (isProcessingCommand(game.threadId)) return;
  setProcessingCommand(game.threadId, true);
  try {
    const gameInstance = new CauCaGame(game.threadId, game.playerId, game.playerName, game.playerData);
    const result = gameInstance.catchFish();

    // Cập nhật playerData và lưu
    game.playerData = gameInstance.playerData;
    const allPlayers = loadPlayerData();
    allPlayers[game.playerId] = gameInstance.playerData;
    savePlayerData(allPlayers);

    await sendMessageFromSQL(api, message, result, false, GAME_MESSAGE_TIME_TO_LIVE);
  } finally {
    setProcessingCommand(game.threadId, false);
  }
}

async function handleStatus(api, message, game, playerName) {
  const text = formatPlayerInfo(game.playerData, playerName, {});
  await sendMessageFromSQL(api, message, { success: true, message: text }, false, GAME_MESSAGE_TIME_TO_LIVE);
}

async function handleShop(api, message, game, _page = 1) {
  const cfg = loadGameConfig();
  const items = cfg.shopItems || [];
  const coins = game.playerData.money || 0;
  const level = game.playerData.level || 1;

  const fmtDays = d => d ? `(Hạn: ${d} ngày)` : '';
  const fmtLv = lv => lv && lv > 0 ? ` (Cần Lv.${lv})` : '';

  const rentalRods = items.filter(i => i.type === 'rod' && (i.price || 0) > 0 && i.isPurchasable !== false);
  const specialRods = items.filter(i => i.type === 'rod' && i.isPurchasable === false);
  const passes = items.filter(i => i.type === 'pass');
  const baits = items.filter(i => i.type === 'bait' && (i.price || 0) > 0 && i.isPurchasable !== false);
  const specialBaits = items.filter(i => i.type === 'bait' && i.isPurchasable === false);

  let text = `🏪 CỬA HÀNG CÂU CÁ 🏪\n\n`;

  // Rental rods
  text += `\n🔱 CẦN CÂU (Thuê):\n`;
  if (rentalRods.length > 0) {
    rentalRods.forEach((it, index) => {
      text += `${index + 1}. ${it.name.replace(/^.*?\s/, m => m)} - ${(it.price || 0)} Coins ${fmtDays(it.durationDays)}\n`;
    });
  } else {
    text += `• (Không có)\n`;
  }

  // Special rods
  text += `\n💎 CẦN CÂU ĐẶC BIỆT:\n`;
  if (specialRods.length > 0) {
    for (const it of specialRods) {
      text += `• ${it.name} - Chỉ có trong vòng quay may mắn\n`;
    }
  } else {
    text += `• (Không có)\n`;
  }

  // Passes
  text += `\n🎫 VÉ CÂU:\n`;
  if (passes.length > 0) {
    passes.forEach((it, index) => {
      text += `${rentalRods.length + index + 1}. ${it.name} - ${(it.price || 0)} Coins ${fmtDays(it.durationDays)}${fmtLv(it.levelRequired)}\n`;
    });
  } else {
    text += `• (Không có)\n`;
  }

  // Baits
  text += `\n🪱 MỒI CÂU:\n`;
  if (baits.length > 0) {
    baits.forEach((it, index) => {
      text += `${rentalRods.length + passes.length + index + 1}. ${it.name} - ${(it.price || 0)} Coins\n`;
    });
  } else {
    text += `• (Không có)\n`;
  }

  // Special baits
  text += `\n💎 MỒI CÂU ĐẶC BIỆT:\n`;
  if (specialBaits.length > 0) {
    for (const it of specialBaits) {
      text += `• ${it.name} - Chỉ có trong vòng quay may mắn\n`;
    }
  } else {
    text += `• (Không có)\n`;
  }

  text += `\n💰 Ví của bạn: ${coins.toLocaleString()} Coins\n` +
          `⭐ Cấp độ của bạn: ${level}\n` +
          `💡 Dùng: buy <số thứ tự> [số lượng] để mua`;

  await sendMessageFromSQL(api, message, { success: true, message: text }, false, GAME_MESSAGE_TIME_TO_LIVE);
}

async function handleBuy(api, message, game, item) {
  const args = item.split(/\s+/);
  const itemIndex = parseInt(args[0]) - 1; // Convert to 0-based index
  const quantity = args.length > 1 ? parseQuantity(args[1]) : 1; // Default to 1 if no quantity specified

  if (isNaN(itemIndex) || itemIndex < 0 || isNaN(quantity) || quantity < 1) {
    await sendMessageFromSQL(api, message, { success: false, message: "❌ Cú pháp: buy <số thứ tự> [số lượng]" }, false, GAME_MESSAGE_TIME_TO_LIVE);
    return;
  }

  const gameInstance = new CauCaGame(game.threadId, game.playerId, game.playerName, game.playerData);
  const result = gameInstance.buyItem(itemIndex, quantity);

  // Cập nhật playerData và lưu
  game.playerData = gameInstance.playerData;
  const allPlayers = loadPlayerData();
  allPlayers[game.playerId] = gameInstance.playerData;
  savePlayerData(allPlayers);

  await sendMessageFromSQL(api, message, result, false, GAME_MESSAGE_TIME_TO_LIVE);
}

async function handleSell(api, message, game, item) {
  const gameInstance = new CauCaGame(game.threadId, game.playerId, game.playerName, game.playerData);
  const result = gameInstance.sellFish(item);
  
  // Cập nhật playerData và lưu
  game.playerData = gameInstance.playerData;
  const allPlayers = loadPlayerData();
  allPlayers[game.playerId] = gameInstance.playerData;
  savePlayerData(allPlayers);
  
  await sendMessageFromSQL(api, message, result, false, GAME_MESSAGE_TIME_TO_LIVE);
}

async function handleBank(api, message, game, content) {
  const allPlayers = loadPlayerData();
  const player = allPlayers[game.playerId];
  if (!player) {
    await sendMessageFromSQL(api, message, {
      success: false,
      message: "❌ Không tìm thấy dữ liệu người chơi!"
    }, false, GAME_MESSAGE_TIME_TO_LIVE);
    return;
  }

  const args = content.split(/\s+/).slice(1);
  const subCommand = args[0] || 'info';

  let result;
  switch (subCommand) {
    case 'info':
      result = bank.getInfo(player.uid, allPlayers);
      break;
    case 'vay':
    case 'borrow':
      const amount = parseInt(args[1]);
      if (!amount || amount <= 0) {
        result = { success: false, message: "❌ Số tiền không hợp lệ!" };
      } else {
        result = bank.borrowGold(player.uid, player.name, amount, allPlayers);
      }
      break;
    case 'tra':
    case 'repay':
      result = bank.repayDebt(player.uid, 'all', allPlayers);
      break;
    case 'gui':
    case 'deposit':
      const depositAmount = parseInt(args[1]);
      if (!depositAmount || depositAmount <= 0) {
        result = { success: false, message: "❌ Số tiền không hợp lệ!" };
      } else {
        result = bank.depositGold(player.uid, depositAmount, allPlayers);
      }
      break;
    case 'rut':
    case 'withdraw':
      const withdrawAmount = args[1] === 'all' ? 'all' : parseInt(args[1]);
      if (!withdrawAmount || (withdrawAmount !== 'all' && withdrawAmount <= 0)) {
        result = { success: false, message: "❌ Số tiền không hợp lệ!" };
      } else {
        result = bank.withdrawGold(player.uid, withdrawAmount, allPlayers);
      }
      break;
    default:
      result = bank.getInfo(player.uid, allPlayers);
  }

  // Cập nhật playerData
  if (allPlayers[player.uid]) {
    game.playerData = allPlayers[player.uid];
  }

  await sendMessageFromSQL(api, message, result, false, GAME_MESSAGE_TIME_TO_LIVE);
}

async function handleQuests(api, message, game) {
  const allPlayers = loadPlayerData();
  const player = allPlayers[game.playerId];
  if (!player) {
    await sendMessageFromSQL(api, message, {
      success: false,
      message: "❌ Không tìm thấy dữ liệu người chơi!"
    }, false, GAME_MESSAGE_TIME_TO_LIVE);
    return;
  }

  const args = message.data.content?.trim().split(/\s+/) || [];
  const result = handleDailyCommand('!cauca', player, player.name, args.slice(1));
  
  // Cập nhật playerData
  if (allPlayers[player.uid]) {
    game.playerData = allPlayers[player.uid];
  }

  await sendMessageFromSQL(api, message, {
    success: true,
    message: result
  }, false, GAME_MESSAGE_TIME_TO_LIVE);
}

async function handleLucky(api, message, game) {
  const gameInstance = new CauCaGame(game.threadId, game.playerId, game.playerName, game.playerData);
  const result = gameInstance.spinLucky();

  // Cập nhật playerData và lưu
  game.playerData = gameInstance.playerData;
  const allPlayers = loadPlayerData();
  allPlayers[game.playerId] = gameInstance.playerData;
  savePlayerData(allPlayers);

  await sendMessageFromSQL(api, message, result, false, GAME_MESSAGE_TIME_TO_LIVE);
}

async function handleLuckyAll(api, message, game) {
  const gameInstance = new CauCaGame(game.threadId, game.playerId, game.playerName, game.playerData);
  const result = gameInstance.spinLuckyAll();

  // Cập nhật playerData và lưu
  game.playerData = gameInstance.playerData;
  const allPlayers = loadPlayerData();
  allPlayers[game.playerId] = gameInstance.playerData;
  savePlayerData(allPlayers);

  await sendMessageFromSQL(api, message, result, false, GAME_MESSAGE_TIME_TO_LIVE);
}

async function handleLuckyMany(api, message, game, n) {
  const gameInstance = new CauCaGame(game.threadId, game.playerId, game.playerName, game.playerData);
  const result = gameInstance.spinLuckyMany(n);

  game.playerData = gameInstance.playerData;
  const allPlayers = loadPlayerData();
  allPlayers[game.playerId] = gameInstance.playerData;
  savePlayerData(allPlayers);

  await sendMessageFromSQL(api, message, result, false, GAME_MESSAGE_TIME_TO_LIVE);
}

async function handleRank(api, message, type) {
  const allPlayers = loadPlayerData();
  const entries = Object.values(allPlayers || {});
  if (!entries || entries.length === 0) {
    await sendMessageFromSQL(api, message, { success: true, message: "🏆 Chưa có dữ liệu xếp hạng." }, false, GAME_MESSAGE_TIME_TO_LIVE);
    return;
  }

  const key = (type || 'level').toLowerCase();
  let title = 'Level';
  let getter = (p) => p.level || 0;
  if (key === 'coin' || key === 'coins' || key === 'vang' || key === 'money') {
    title = 'Coins';
    getter = (p) => p.money || 0;
  } else if (key === 'cauca' || key === 'fish' || key === 'catch') {
    title = 'Cá Câu Được';
    getter = (p) => (p.stats?.totalFishCaught) || 0;
  }

  const sorted = entries
    .map(p => ({ name: p.name || p.uid || 'Người chơi', value: getter(p) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 20);

  let text = `🏆 BẢNG XẾP HẠNG ${title.toUpperCase()}\n\n`;
  sorted.forEach((e, i) => {
    const rankIcon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    const val = typeof e.value === 'number' ? e.value.toLocaleString() : String(e.value);
    text += `${rankIcon} ${e.name} — ${val}\n`;
  });

  await sendMessageFromSQL(api, message, { success: true, message: text }, false, GAME_MESSAGE_TIME_TO_LIVE);
}

async function handleInventory(api, message, game) {
  const inv = game.playerData.inventory || {};
  let text = "🎒 TÚI ĐỒ CỦA BẠN\n\n";
  
  // Hiển thị cá
  const fishList = Object.entries(inv.fish || {});
  if (fishList.length > 0) {
    text += "🐟 CÁ:\n";
    fishList.slice(0, 20).forEach(([name, qty]) => {
      text += `  • ${name} x${qty}\n`;
    });
    if (fishList.length > 20) {
      text += `  ... và ${fishList.length - 20} loại khác\n`;
    }
    text += "\n";
  } else {
    text += "🐟 CÁ: Không có\n\n";
  }

  // Hiển thị mồi
  const baitList = Object.entries(inv.baits || {})
    .map(([id, qty]) => {
      const config = loadGameConfig();
      const allItems = [...(config.shopItems || []), ...(config.shopItem || [])];
      const item = allItems.find(it => it.id === id);
      const name = item?.name || id;
      return { id, name, qty };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  if (baitList.length > 0) {
    text += "🪱 MỒI:\n";
    baitList.slice(0, 10).forEach((b, idx) => {
      text += `  [${idx + 1}] ${b.name} x${b.qty}\n`;
    });
    if (baitList.length > 10) {
      text += `  ... và ${baitList.length - 10} loại khác\n`;
    }
    text += "\n";
  }

  // Hiển thị cần câu
  if (inv.rods && Array.isArray(inv.rods) && inv.rods.length > 0) {
    text += "🎣 CẦN CÂU:\n";
    const rodsSorted = [...inv.rods].sort((a, b) => a.name.localeCompare(b.name));
    rodsSorted.slice(0, 10).forEach((rod, idx) => {
      text += `  [${idx + 1}] ${rod.name} (Độ bền: ${rod.uses || 0})\n`;
    });
    if (inv.rods.length > 10) {
      text += `  ... và ${inv.rods.length - 10} cần câu khác\n`;
    }
    text += "\n💡 Dùng: use rod <số thứ tự> để trang bị\n";
  }

  // Hiển thị dụng cụ
  if (inv.tools && Array.isArray(inv.tools) && inv.tools.length > 0) {
    text += "🔧 DỤNG CỤ:\n";
    inv.tools.slice(0, 10).forEach(tool => {
      text += `  • ${tool.name}\n`;
    });
    if (inv.tools.length > 10) {
      text += `  ... và ${inv.tools.length - 10} dụng cụ khác\n`;
    }
    text += "\n";
  }

  // Hiển thị pets
  if (inv.pets && Array.isArray(inv.pets) && inv.pets.length > 0) {
    text += "🐾 PET:\n";
    inv.pets.slice(0, 10).forEach(pet => {
      text += `  • ${pet.name} (Level ${pet.level || 1})\n`;
    });
    if (inv.pets.length > 10) {
      text += `  ... và ${inv.pets.length - 10} pet khác\n`;
    }
    text += "\n";
  }

  // Hiển thị vé
  if (inv.tickets && inv.tickets > 0) {
    text += `🎟️ Vé quay may mắn: ${inv.tickets}\n`;
  }

  // Hiển thị equipment đang dùng
  if (game.playerData.equipment?.rod) {
    text += `\n🎣 Đang dùng: ${game.playerData.equipment.rod.name}`;
  }
  if (game.playerData.equipment?.bait) {
    text += `\n🪱 Mồi đã chọn: ${game.playerData.equipment.bait.name}`;
  }

  text += "\n\n💡 Nhanh: equip bait <index> | equip rod <index> | equip #<index>";

  await sendMessageFromSQL(api, message, { success: true, message: text }, false, GAME_MESSAGE_TIME_TO_LIVE);
}

async function handleStop(api, message, game) {
  // Lưu dữ liệu trước khi dừng
  const gameInstance = new CauCaGame(game.threadId, game.playerId, game.playerName, game.playerData);
  gameInstance.saveData();

  const moneyText = formatCurrency(game.playerData.money || 0);
  const text = `🛑 DỪNG GAME 🛑\n👤 ${game.playerName}\n📊 Cấp: ${game.playerData.level} | Vàng: ${moneyText}\n⏱️ Thời gian chơi: ${Math.floor((Date.now() - game.startTime) / 1000)} giây\n💾 Dữ liệu đã được lưu!`;
  await sendMessageFromSQL(api, message, { success: true, message: text }, false, FINAL_MESSAGE_TIME_TO_LIVE);
  endGame(api, message, game.threadId, game);
}

async function handleRedeemCode(api, message, game, code) {
  // Hiển thị danh sách code nếu không truyền mã hoặc yêu cầu list
  const requestedList = !code || code.toLowerCase() === 'list' || code.toLowerCase() === 'danh sách' || code.toLowerCase() === 'danhsach';
  if (requestedList) {
    const cfg = loadGameConfig();
    const giftCodes = cfg.giftCodes || {};
    if (!giftCodes || Object.keys(giftCodes).length === 0) {
      await sendMessageFromSQL(api, message, { success: true, message: "🎁 Hiện chưa có code nào khả dụng." }, false, GAME_MESSAGE_TIME_TO_LIVE);
      return;
    }
    let text = "🎁 DANH SÁCH CODE QUÀ TẶNG\n\n";
    const redeemed = game.playerData.redeemedCodes || {};
    Object.entries(giftCodes).forEach(([key, info]) => {
      const name = info?.name || key;
      const desc = info?.description || "";
      const isUsed = Boolean(redeemed[key]);
      text += `• ${key} — ${name}${desc ? `\n  ${desc}` : ''}${isUsed ? "\n  ✅ ĐÃ ĐỔI" : "\n  🔓 Chưa đổi"}\n\n`;
    });
    text += "💡 Dùng: code <MÃ> để nhận quà";
    await sendMessageFromSQL(api, message, { success: true, message: text }, false, GAME_MESSAGE_TIME_TO_LIVE);
    return;
  }

  // Đổi code cụ thể
  const gameInstance = new CauCaGame(game.threadId, game.playerId, game.playerName, game.playerData);
  const result = gameInstance.redeemCode(code);

  // Cập nhật playerData và lưu
  game.playerData = gameInstance.playerData;
  const allPlayers = loadPlayerData();
  allPlayers[game.playerId] = gameInstance.playerData;
  savePlayerData(allPlayers);

  await sendMessageFromSQL(api, message, result, false, GAME_MESSAGE_TIME_TO_LIVE);
}

async function handleEquip(api, message, game, content) {
  if (content === "equip") {
    // Show current equipment
    let text = "🎒 TRANG BỊ HIỆN TẠI\n\n";
    if (game.playerData.equipment?.rod) {
      text += `🎣 Cần câu: ${game.playerData.equipment.rod.name}\n`;
    } else {
      text += "🎣 Cần câu: Chưa trang bị\n";
    }
    if (game.playerData.equipment?.bait) {
      text += `🪱 Mồi: ${game.playerData.equipment.bait.name}\n`;
    } else {
      text += "🪱 Mồi: Chưa trang bị\n";
    }
    await sendMessageFromSQL(api, message, { success: true, message: text }, false, GAME_MESSAGE_TIME_TO_LIVE);
    return;
  }

  // Equip item
  const itemInput = content.slice(6).trim(); // remove "equip "
  const gameInstance = new CauCaGame(game.threadId, game.playerId, game.playerName, game.playerData);
  const result = gameInstance.equipItem(itemInput);

  // Cập nhật playerData và lưu
  game.playerData = gameInstance.playerData;
  const allPlayers = loadPlayerData();
  allPlayers[game.playerId] = gameInstance.playerData;
  savePlayerData(allPlayers);

  await sendMessageFromSQL(api, message, result, false, GAME_MESSAGE_TIME_TO_LIVE);
}

async function handleSlot(api, message, game, content) {
  const args = content.split(/\s+/);
  const sub = args[1] || 'info';
  const gameInstance = new CauCaGame(game.threadId, game.playerId, game.playerName, game.playerData);
  if (sub === 'buy' || content === 'mua slot') {
    const result = gameInstance.purchaseSlot();
    game.playerData = gameInstance.playerData;
    const allPlayers = loadPlayerData();
    allPlayers[game.playerId] = gameInstance.playerData;
    savePlayerData(allPlayers);
    await sendMessageFromSQL(api, message, result, false, GAME_MESSAGE_TIME_TO_LIVE);
    return;
  }
  // info
  const potential = gameInstance.calculateFishingSlots(game.playerData.level);
  const active = game.playerData.activeSlots || 1;
  const cost = 50000;
  let info = `🎯 SLOT CÂU
• Đang kích hoạt: ${active}/${potential}
• Giá mở slot tiếp: ${cost.toLocaleString()} VND
• Yêu cầu: slot 2 trở lên cần thêm cần câu (trong túi) và đủ mồi cho mỗi slot.

💡 Lệnh: slot buy (mua)
`;
  await sendMessageFromSQL(api, message, { success: true, message: info }, false, GAME_MESSAGE_TIME_TO_LIVE);
}

async function handleMap(api, message, game) {
  const cfg = loadGameConfig();
  const currentId = String(game.playerData.currentArea);
  let text = "🗺️ BẢN ĐỒ KHU VỰC\n\n";
  (cfg.areas || []).forEach(a => {
    const mark = String(a.id) === currentId ? " (đang ở)" : "";
    const req = a.levelRequired ? ` - Cần Lv.${a.levelRequired}` : "";
    text += `• [${a.id}] ${a.name}${req}${mark}\n`;
  });
  text += "\n💡 Dùng: goto <id|tên> để di chuyển";
  await sendMessageFromSQL(api, message, { success: true, message: text }, false, GAME_MESSAGE_TIME_TO_LIVE);
}

async function handleBuffList(api, message, game) {
  const cfg = loadGameConfig();
  const items = cfg.shopItems || [];
  let text = "🎁 DANH SÁCH ITEM ĐỂ BUFF\n\n";
  text += "🔹 Đặc biệt:\n";
  text += "exp - Kinh nghiệm\n";
  text += "gold - Vàng\n";
  text += "tickets - Vé quay\n\n";
  text += "🔹 Items:\n";
  items.forEach((item, index) => {
    if (index < 999) {
      text += `${index + 1}. ${item.name}\n`;
    }
  });
  text += "\n💡 Dùng: buff <số thứ tự|keyword> <số lượng> [@UID] (chỉ admin)\n";
  text += "📝 Số lượng hỗ trợ: k (nghìn), m (triệu), b (tỉ), nghìn, triệu, tỉ";
  await sendMessageFromSQL(api, message, { success: true, message: text }, false, GAME_MESSAGE_TIME_TO_LIVE);
}

async function handleBuff(api, message, game, content) {
  const senderId = message.data.uidFrom;
  const adminData = readAdmins();
  const isAdmin = Object.values(adminData).some(admins => admins.includes(senderId));
  if (!isAdmin) {
    await sendMessageFromSQL(api, message, { success: false, message: "❌ Chỉ admin mới dùng được lệnh buff!" }, false, GAME_MESSAGE_TIME_TO_LIVE);
    return;
  }

  const args = content.split(/\s+/).slice(1);
  if (args.length < 2) {
    await sendMessageFromSQL(api, message, { success: false, message: "❌ Cú pháp: buff <số thứ tự|keyword> <số lượng> [@UID]" }, false, GAME_MESSAGE_TIME_TO_LIVE);
    return;
  }

  const itemInput = args[0].toLowerCase();
  const quantity = parseQuantity(args[1]);
  let targetUid = senderId;
  if (args[2] && args[2].startsWith('@')) {
    targetUid = args[2].slice(1);
  }

  const allPlayers = loadPlayerData();
  const targetPlayer = allPlayers[targetUid];
  if (!targetPlayer) {
    await sendMessageFromSQL(api, message, { success: false, message: "❌ Người chơi không tồn tại!" }, false, GAME_MESSAGE_TIME_TO_LIVE);
    return;
  }

  let itemName = "";
  if (itemInput === "exp") {
    if (isNaN(quantity) || quantity < 1) {
      await sendMessageFromSQL(api, message, { success: false, message: "❌ Số lượng phải lớn hơn 0!" }, false, GAME_MESSAGE_TIME_TO_LIVE);
      return;
    }
    targetPlayer.exp = (targetPlayer.exp || 0) + quantity;
    itemName = "Kinh nghiệm";
  } else if (itemInput === "gold") {
    if (isNaN(quantity) || quantity < 1) {
      await sendMessageFromSQL(api, message, { success: false, message: "❌ Số lượng phải lớn hơn 0!" }, false, GAME_MESSAGE_TIME_TO_LIVE);
      return;
    }
    targetPlayer.money = (targetPlayer.money || 0) + quantity;
    itemName = "Vàng";
  } else if (itemInput === "tickets") {
    if (isNaN(quantity) || quantity < 1) {
      await sendMessageFromSQL(api, message, { success: false, message: "❌ Số lượng phải lớn hơn 0!" }, false, GAME_MESSAGE_TIME_TO_LIVE);
      return;
    }
    if (!targetPlayer.inventory) targetPlayer.inventory = {};
    targetPlayer.inventory.tickets = (targetPlayer.inventory.tickets || 0) + quantity;
    itemName = "Vé quay";
  } else {
    // Handle as item index
    const itemIndex = parseInt(itemInput) - 1;
    if (isNaN(itemIndex) || itemIndex < 0 || itemIndex >= 999 || isNaN(quantity) || quantity < 1) {
      await sendMessageFromSQL(api, message, { success: false, message: "❌ Số thứ tự (1-999) và số lượng không hợp lệ!" }, false, GAME_MESSAGE_TIME_TO_LIVE);
      return;
    }

    const cfg = loadGameConfig();
    const items = cfg.shopItems || [];
    const item = items[itemIndex];
    if (!item) {
      await sendMessageFromSQL(api, message, { success: false, message: "❌ Item không tồn tại!" }, false, GAME_MESSAGE_TIME_TO_LIVE);
      return;
    }

    // Add item to inventory or stats
    if (!targetPlayer.inventory) targetPlayer.inventory = {};
    if (item.type === 'bait') {
      if (!targetPlayer.inventory.baits) targetPlayer.inventory.baits = {};
      targetPlayer.inventory.baits[item.id] = (targetPlayer.inventory.baits[item.id] || 0) + quantity;
    } else if (item.type === 'rod') {
      if (!targetPlayer.inventory.rods) targetPlayer.inventory.rods = [];
      for (let i = 0; i < quantity; i++) {
        targetPlayer.inventory.rods.push({ ...item, uses: item.durability || 100 });
      }
    } else if (item.type === 'exp' || item.type === 'experience') {
      targetPlayer.exp = (targetPlayer.exp || 0) + quantity;
    } else if (item.type === 'money' || item.type === 'gold') {
      targetPlayer.money = (targetPlayer.money || 0) + quantity;
    } else if (item.type === 'tickets' || item.type === 'lucky') {
      targetPlayer.inventory.tickets = (targetPlayer.inventory.tickets || 0) + quantity;
    } else {
      // Other items, assume fish or general
      if (!targetPlayer.inventory.fish) targetPlayer.inventory.fish = {};
      targetPlayer.inventory.fish[item.name] = (targetPlayer.inventory.fish[item.name] || 0) + quantity;
    }
    itemName = item.name;
  }

  // Update game playerData if buffing self
  if (targetUid === game.playerId) {
    game.playerData = targetPlayer;
  }

  savePlayerData(allPlayers);

  const targetName = targetPlayer.name || targetUid;
  await sendMessageFromSQL(api, message, { success: true, message: `✅ Đã buff ${quantity}x ${itemName} cho ${targetName}!` }, false, GAME_MESSAGE_TIME_TO_LIVE);
}

async function handleBossList(api, message) {
  const bossList = bossService.getBossList();
  let text = "🐉 DANH SÁCH BOSS CÓ THỂ TRIỆU HỒI\n\n";
  bossList.forEach((bossName, index) => {
    text += `${index + 1}. ${bossName}\n`;
  });
  text += "\n💡 Dùng: boss <số thứ tự> để triệu hồi boss";
  await sendMessageFromSQL(api, message, { success: true, message: text }, false, GAME_MESSAGE_TIME_TO_LIVE);
}

async function handleSpawnBossByIndex(api, message, index) {
  const boss = bossService.spawnBossByIndex(index);
  if (!boss) {
    await sendMessageFromSQL(api, message, { success: false, message: "❌ Chỉ số boss không hợp lệ!" }, false, GAME_MESSAGE_TIME_TO_LIVE);
    return;
  }
  const cfg = loadGameConfig();
  const area = cfg.areas?.find(a => a.id === boss.areaId);
  const areaName = area ? area.name : 'Unknown';
  const status = bossService.getBossStatus();
  await sendMessageFromSQL(api, message, { success: true, message: `🐉 Đã triệu hồi boss: ${boss.name} tại ${areaName}!\n\n${status.message}` }, false, GAME_MESSAGE_TIME_TO_LIVE);
}

async function handleBossStatus(api, message, currentGame) {
  const status = bossService.getBossStatus();
  await sendMessageFromSQL(api, message, { success: true, message: status.message }, false, GAME_MESSAGE_TIME_TO_LIVE);
}

async function handleBossAttack(api, message, currentGame, damage) {
  // Calculate random damage between 5-10% of boss HP, considering active slots
  const activeBoss = bossService.getActiveBoss();
  if (!activeBoss) {
    await sendMessageFromSQL(api, message, { success: false, message: 'Hiện không có boss nào đang hoạt động.' }, false, GAME_MESSAGE_TIME_TO_LIVE);
    return;
  }

  const activeSlots = currentGame.playerData.activeSlots || 1;
  let totalDamage = 0;
  for (let i = 0; i < activeSlots; i++) {
    const minDamage = Math.floor(activeBoss.maxHp * 0.05); // 5% of max HP
    const maxDamage = Math.floor(activeBoss.maxHp * 0.10); // 10% of max HP
    const randomDamage = Math.floor(Math.random() * (maxDamage - minDamage + 1)) + minDamage;
    totalDamage += randomDamage;
  }

  const result = bossService.attackBoss(currentGame.playerId, currentGame.playerName, totalDamage);
  await sendMessageFromSQL(api, message, result, false, GAME_MESSAGE_TIME_TO_LIVE);
}

