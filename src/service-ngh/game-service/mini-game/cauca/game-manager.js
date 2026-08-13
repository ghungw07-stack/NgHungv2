import {
  getActiveGames,
  addGame,
  removeGame,
  addPlayer,
  removePlayer
} from "../index.js";
import {
  sendMessageFromSQL
} from "../../../chat-zalo/chat-style/chat-style.js";
import { formatCurrency } from "../../../../utils/format-util.js";
import { loadPlayerData, savePlayerData, loadGameConfig } from "./dataManager.js";

// ===================== CONSTANTS =====================
export const gameTypeCauCa = "Cau Ca";
export const GAME_MESSAGE_TIME_TO_LIVE = 86400000; // 1 ngày
export const FINAL_MESSAGE_TIME_TO_LIVE = 86400000; // 1 ngày
export const FISHING_COOLDOWN = 10000; // 10 giây cooldown câu cá

// ===================== MAP STATES =====================
export const playerCooldowns = new Map(); // playerId -> timestamp
export const commandTimeouts = new Map(); // threadId -> timeout
export const processingCommands = new Map(); // threadId -> boolean
// Lưu trữ game instances theo playerId (mỗi người chơi có game riêng)
export const playerGames = new Map(); // playerId -> gameInstance

// ===================== TIMEOUT HANDLERS =====================
export function setupCommandTimeout(api, message, threadId, gameInstance, playerId, callback) {
  const existingTimeout = commandTimeouts.get(threadId);
  if (existingTimeout) clearTimeout(existingTimeout);

  const timeoutId = setTimeout(async () => {
    await callback();
  }, FISHING_COOLDOWN);

  commandTimeouts.set(threadId, timeoutId);
}

export function clearCommandTimeout(threadId) {
  const timeout = commandTimeouts.get(threadId);
  if (timeout) {
    clearTimeout(timeout);
    commandTimeouts.delete(threadId);
  }
}

// ===================== COMMAND PROCESS CONTROL =====================
export function setProcessingCommand(threadId, isProcessing) {
  if (isProcessing) processingCommands.set(threadId, true);
  else processingCommands.delete(threadId);
}

export function isProcessingCommand(threadId) {
  return processingCommands.has(threadId);
}

// ===================== GAME LOGIC =====================

export async function startCauCaGame(api, message, player) {
  const threadId = message.threadId;
  const { playerId, playerName } = player;

  // Tải dữ liệu người chơi
  const allPlayers = loadPlayerData();
  let playerData = allPlayers[playerId];

  const config = loadGameConfig();
  const isNewPlayer = !playerData;
  
  if (!playerData) {
    // Người chơi mới - khởi tạo dữ liệu
    playerData = {
      uid: playerId,
      name: playerName,
      level: 0,
      exp: 0,
      money: 200,
      currentArea: 1,
      inventory: {
        fish: {},
        baits: {},
        rods: [],
        tools: [],
        pets: [],
        potions: {},
        tickets: 0,
        skillCards: {}
      },
      equipment: {
        rod: null,
        bait: null
      },
      stats: {
        totalFishCaught: 0,
        rareCaught: 0,
        legendaryCaught: 0,
        mythicalCaught: 0,
        bossAttacks: 0,
        bossKills: 0,
        rodsBroken: 0,
        totalSpent: 0
      },
      redeemedCodes: {}
    };
    
    // Tặng quà khi join lần đầu
    // Tặng 50 mồi cơm
    if (!playerData.inventory.baits["bait_rice"]) {
      playerData.inventory.baits["bait_rice"] = 0;
    }
    playerData.inventory.baits["bait_rice"] += 50;
    
    // Tặng 1 cần câu gỗ
    const starterRod = config.shopItems.find(item => item.id === "rod_wood");
    if (starterRod) {
      if (!playerData.inventory.rods) {
        playerData.inventory.rods = [];
      }
      playerData.inventory.rods.push({
        id: starterRod.id,
        name: starterRod.name,
        effects: starterRod.effects,
        uses: starterRod.effects?.uses || 0,
        purchasedAt: Date.now()
      });
      
      // Tự động trang bị cần câu
      playerData.equipment.rod = {
        id: starterRod.id,
        name: starterRod.name,
        effects: starterRod.effects,
        uses: starterRod.effects?.uses || 0,
        equippedAt: Date.now()
      };
    }
    
    allPlayers[playerId] = playerData;
    savePlayerData(allPlayers);
  }

  // Lưu game instance
  playerGames.set(String(playerId), {
    threadId,
    playerId,
    playerName,
    playerData,
    isActive: true,
    startTime: Date.now(),
    lastActivity: Date.now()
  });

  // Thêm vào activeGames
  addGame(threadId, gameTypeCauCa, playerData);
  addPlayer(threadId, gameTypeCauCa, playerId, playerName);

  const isReturning = playerData.level > 0 || playerData.exp > 0;
  let startMessage = `🎣 CÂU CÁ 🎣\n\n👤 Người chơi: ${playerName}\n`;
  
  if (isNewPlayer) {
    startMessage += `🎁 QUÀ TẶNG KHI JOIN:\n` +
      `• 50x 🪱 Giun Đất\n` +
      `• 1x 🪵 Cần Câu Gỗ (đã tự động trang bị)\n\n` +
      `🌟 Chào mừng đến với game câu cá!\n\n`;
  } else {
    startMessage += `🌟 Chào mừng quay trở lại!\n📊 Tiếp tục từ cấp ${playerData.level}\n\n`;
  }
  
  startMessage += `💡 Gõ các lệnh để chơi:\n` +
    `• cau - Câu cá\n` +
    `• status - Xem thông tin\n` +
    `• shop - Mở cửa hàng\n` +
    `• equip - Trang bị cần câu/mồi\n` +
    `• code <mã> - Đổi code quà tặng\n` +
    `• bank - Quản lý ngân hàng\n` +
    `• nv - Nhiệm vụ ngày\n` +
    `• help - Xem hướng dẫn\n` +
    `• stop - Thoát game`;

  await sendMessageFromSQL(api, message, { success: true, message: startMessage }, false, GAME_MESSAGE_TIME_TO_LIVE);
}

export function endGame(api, message, threadId, gameInstance, reason = null) {
  clearCommandTimeout(threadId);
  setProcessingCommand(threadId, false);

  // Lưu dữ liệu
  if (gameInstance && gameInstance.playerData) {
    const allPlayers = loadPlayerData();
    allPlayers[gameInstance.playerId] = gameInstance.playerData;
    savePlayerData(allPlayers);
  }

  // Xóa game từ playerGames
  if (gameInstance) {
    const playerIdStr = String(gameInstance.playerId);
    playerGames.delete(playerIdStr);
    
    // Xóa game từ activeGames
    removeGame(threadId, gameTypeCauCa);
    removePlayer(threadId, gameTypeCauCa, gameInstance.playerId);
  }

  const endMessage =
    `🛑 KẾT THÚC PHIÊN CHƠI 🛑\n\n` +
    `👤 ${gameInstance?.playerName || 'Người chơi'} đã rời khỏi game\n` +
    `📊 Cấp: ${gameInstance?.playerData?.level || 0} | Vàng: ${formatCurrency(gameInstance?.playerData?.money || 0)}\n` +
    `⏱️ Thời gian chơi: ${gameInstance ? Math.floor((Date.now() - gameInstance.startTime) / 1000) : 0} giây`;

  sendMessageFromSQL(api, message, { success: true, message: endMessage }, false, FINAL_MESSAGE_TIME_TO_LIVE);
}

export function isGameActive(threadId) {
  // Kiểm tra xem có game nào trong thread này không
  for (const game of playerGames.values()) {
    if (String(game.threadId) === String(threadId) && game.isActive) {
      return true;
    }
  }
  return false;
}

export function getCurrentGame(threadId, playerId = null) {
  // Nếu có playerId, lấy game từ playerGames
  if (playerId) {
    const playerIdStr = String(playerId);
    const game = playerGames.get(playerIdStr);
    if (game && game.isActive && String(game.threadId) === String(threadId)) {
      return game;
    }
    return null;
  }
  
  // Fallback: lấy từ activeGames
  const threadGames = getActiveGames().get(threadId);
  if (!threadGames) return null;
  const game = threadGames.get(gameTypeCauCa);
  if (!game) return null;
  return game;
}

export function getPlayerGame(playerId, threadId = null) {
  const playerIdStr = String(playerId);
  
  // Lấy từ playerGames (đang active trong memory)
  const activeGame = playerGames.get(playerIdStr);
  if (activeGame && activeGame.isActive) {
    if (threadId && String(activeGame.threadId) !== String(threadId)) {
      return activeGame;
    }
    return activeGame;
  }

  // Nếu không có trong memory, load từ database
  const allPlayers = loadPlayerData();
  const playerData = allPlayers[playerIdStr];
  if (playerData) {
    return {
      playerId: playerIdStr,
      playerName: playerData.name,
      playerData,
      isActive: false
    };
  }

  return null;
}

export async function startNewGame(api, message, player) {
  try {
    await startCauCaGame(api, message, player);
  } catch (err) {
    console.error("❌ Lỗi khi startNewGame:", err);
    await sendMessageFromSQL(api, message, {
      success: false,
      message: "⚠️ Đã xảy ra lỗi khi bắt đầu game.",
    });
  }
}

