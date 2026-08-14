import { isAdmin } from "../../../index.js";
import { removeMention } from "../../../utils/format-util.js";
import { sendMessageComplete, sendMessageFromSQL } from "../../chat-zalo/chat-style/chat-style.js";
import { handleRankMiniGameCommand } from "../../info-service/rank-chat.js";
import { getGlobalPrefix } from "../../service.js";
import { gameTypeZaclWarrior, handleGameZaclWarriorMessage, handleZaclWarriorCommand } from "./zacl-warrior/index.js";
import { gameTypeCaro, handleCaroCommand, handleCaroGame, handleCaroReaction } from "./caro-game/index.js";
import { gameTypeDoanSo, handleGuessNumberCommand, handleGuessNumberGame } from "./guessNumber.js";
import { gameTypeVuaTiengViet, handleVuaTiengVietGame, startVuaTiengVietGame } from "./vuatiengviet.js";
import {gameTypeDuoiHinhBatChu ,handleDuoiHinhBatChuGame, startDuoiHinhBatChuGame} from "./duoihinhbatchu/dhbc.js"
import {
  checkResultNoiTu,
  cleanupGameNoiTu,
  gameTypeNoiTu,
  handleWordChainCommand,
  handleWordChainMessage,
  memberLeaveGameNoiTu,
  vocabularyLookup,
} from "./wordChain.js";
import { gameTypeDoanTu, handleWordGuessCommand, handleWordGuessGame } from "./wordGuess.js";
import { showDetailedRankCaro } from "./caro-game/caro.js";
import { gameTypeAiLaTrieuPhu, handleAiLaTrieuPhuCommand, handleAiLaTrieuPhuMessage } from "./ailatrieuphu/index.js";
import { gameTypeCauCa, handleCauCaCommand, handleCauCaMessage } from "./cauca/index.js";

const activeGames = new Map(); // Map<threadId, Map<gameType, gameInstance>>
const gamePlayers = new Map(); // Map<threadId_gameType, Map<playerId, playerInfo>>
const TIME_TO_LIVE = 86400000;

export function getActiveGames() {
  return activeGames;
}

export function getGamePlayers() {
  return gamePlayers;
}

export function getGamePlayerKey(threadId, gameType) {
  return `${threadId}_${gameType}`;
}

export function addPlayer(threadId, gameType, playerId, playerName) {
  const key = getGamePlayerKey(threadId, gameType);
  if (!gamePlayers.has(key)) {
    gamePlayers.set(key, new Map());
  }
  gamePlayers.get(key).set(playerId, {
    id: playerId,
    name: playerName,
    joinedAt: new Date(),
  });
}

export function getPlayerInfo(threadId, gameType, playerId) {
  const key = getGamePlayerKey(threadId, gameType);
  if (!gamePlayers.has(key)) return null;
  return gamePlayers.get(key).get(playerId);
}

export function getAllPlayers(threadId, gameType) {
  const key = getGamePlayerKey(threadId, gameType);
  if (!gamePlayers.has(key)) return [];
  return Array.from(gamePlayers.get(key).values());
}

export function checkPlayerJoined(threadId, gameType, playerId) {
  const key = getGamePlayerKey(threadId, gameType);
  if (!gamePlayers.has(key)) return false;
  return gamePlayers.get(key).has(playerId);
}

export function removePlayer(threadId, gameType, playerId) {
  const key = getGamePlayerKey(threadId, gameType);
  if (gamePlayers.has(key)) {
    gamePlayers.get(key).delete(playerId);
  }
}

export function isPlayerInGame(threadId, gameType, playerId) {
  const key = getGamePlayerKey(threadId, gameType);
  return gamePlayers.has(key) && gamePlayers.get(key).has(playerId);
}

export function addGame(threadId, gameType, gameInstance) {
  let threadGames = activeGames.get(threadId);
  if (!threadGames || !(threadGames instanceof Map)) {
    threadGames = new Map();
    activeGames.set(threadId, threadGames);
  }
  threadGames.set(gameType, gameInstance);
}

export function removeGame(threadId, gameType, delPlayer = true) {
  const threadGames = activeGames.get(threadId);
  if (threadGames) {
    threadGames.delete(gameType);
    if (threadGames.size === 0) {
      activeGames.delete(threadId);
    }
    if (delPlayer) {
      const key = getGamePlayerKey(threadId, gameType);
      gamePlayers.delete(key);
    }
  }
}

export async function handleChatWithGame(api, message, isCallGame, groupSettings, groupInfo) {
  if (isCallGame) return;
  const threadId = message.threadId;
  if (!groupSettings[threadId]) groupSettings[threadId] = {};
  const activeGame = groupSettings[threadId].activeGame;
  if (activeGame === false) return;
  let isReaction = false;

  let content = message.data.content;
  const senderId = message.data.uidFrom;

  if (typeof content === "string") {
    content = content.trim().toLowerCase();
    const threadGames = activeGames.get(threadId);

    if (threadGames && threadGames instanceof Map) {
      for (const [gameType, gameInstance] of Array.from(threadGames.entries())) {
        if (!isPlayerInGame(threadId, gameType, senderId)) {
          continue;
        }
        try {
          switch (gameType) {
            case gameTypeDoanSo:
              isReaction = await handleGuessNumberGame(api, message, groupInfo);
              break;
            case gameTypeNoiTu:
              isReaction = await handleWordChainMessage(api, message, groupInfo);
              break;
            case gameTypeDoanTu:
              isReaction = await handleWordGuessGame(api, message);
              break;
            case gameTypeVuaTiengViet:
              isReaction = await handleVuaTiengVietGame(api, message, groupInfo);
              break;
            case gameTypeZaclWarrior:
              isReaction = await handleGameZaclWarriorMessage(api, message);
              break;
            case gameTypeCaro:
              isReaction = await handleCaroGame(api, message, groupInfo);
              break;
            case gameTypeAiLaTrieuPhu:
              isReaction = await handleAiLaTrieuPhuMessage(api, message);
              break;
           case gameTypeCauCa:
             isReaction = await handleCauCaMessage(api, message);
             break;
               case gameTypeDuoiHinhBatChu:
              isReaction = await handleDuoiHinhBatChuGame(api, message, groupInfo);
              break;
          }
          if (isReaction) {
            await api.addReaction("UNDO", [message]);
            await api.addReaction("OK", [message]);
          }
        } catch (error) {
          await api.addReaction("UNDO", [message]);
          await api.addReaction("TIEUTAN", [message]);
          console.error(`Lỗi xử lý game ${gameType}:`, error);
        }
      }
    }
  }
}

export async function handleMiniGameCommand(api, message, groupSettings, gameType, aliasCommand) {
  const botId = api.getBotId();
  const prefix = getGlobalPrefix(botId);
  const content = removeMention(message);
  const context = content.replace(prefix + aliasCommand, "").trim();
  const isAdminLevelHighest = isAdmin(botId, message.data.uidFrom, message.threadId);
  const isMainBot = api.apiManager.isMainBot;
  const args = context.split(/\s+/);
  const command = args[0];
  const senderName = message.data.dName;
  const senderId = message.data.uidFrom;
  const threadId = message.threadId;
  const isGameNoiTu = gameType === gameTypeNoiTu;
  const isGameZaclWarrior = gameType === gameTypeZaclWarrior;
  const isGameVuaTiengViet = gameType === gameTypeVuaTiengViet;
  const isGameDuoiHinhBatChu = gameType === gameTypeDuoiHinhBatChu;
  const isGameDoanSo = gameType === gameTypeDoanSo;
  const isGameCaro = gameType === gameTypeCaro;
  const isGameAiLaTrieuPhu = gameType === gameTypeAiLaTrieuPhu;
  const isGameCauCa = gameType === gameTypeCauCa;
  if (isAdminLevelHighest || groupSettings[threadId]?.activeGame) {
    if (isGameCaro) {
      if (command === "rank" || command === "top" || command === "bxh") {
        await showDetailedRankCaro(api, message);
      } else {
        await handleCaroCommand(api, message, aliasCommand, prefix);
      }
      return;
    }

    if (isGameAiLaTrieuPhu) {
      if (command === "rank" || command === "top" || command === "bxh") {
        await handleRankMiniGameCommand(api, message, gameType);
        return;
      }
      await handleAiLaTrieuPhuCommand(api, message, aliasCommand);
      return;
    }

    if (isGameCauCa) {
      await handleCauCaCommand(api, message, aliasCommand);
      return;
    }

    const result = {
      success: true,
      message:
        `🎮 Chào Mừng Đến Với Trò Chơi > ${gameType} <!` +
        `${isGameDoanSo ? `\n📝 ${prefix + aliasCommand} start [số lớn nhất]: Khởi động game đoán số` : ""}` +
        `\n🔗 ${prefix + aliasCommand} join: tham gia game.` +
        `\n🚪 ${prefix + aliasCommand} leave: rời khỏi cuộc chơi.` +
        `${isGameVuaTiengViet ? `\n📝 Khi đã tham gia, ghi chữ check để xem lại câu hỏi` : ""}` +
        `${isGameVuaTiengViet ? `\n📝 Có thể dùng điểm thành tích để trợ giúp giải đáp án bằng cách chat dapan` : ""}` +
        `${isGameZaclWarrior ? `\n📝 ${prefix + aliasCommand} help: hướng dẫn các lệnh tương tác với game` : ""}` +
        `${isGameNoiTu ? `\n📝 ${prefix + aliasCommand} tracuu: tra thông tin từ vựng` : ""}` +
        `${isGameNoiTu && isAdminLevelHighest ? `\n📝 ${prefix + aliasCommand} reset: làm mới trò chơi nối từ` : ""}`,
    };

    if (!command) {
      await sendMessageFromSQL(api, message, result, false, TIME_TO_LIVE);
      return;
    }

    if (command === "rank" || command === "top" || command === "bxh") {
      await handleRankMiniGameCommand(api, message, gameType);
      return;
    } else if (command === "tracuu" && isGameNoiTu) {
      const keyword = args.slice(1).join(" ");
      await vocabularyLookup(api, message, keyword);
      return;
    } else if (command === "reset" && isAdminLevelHighest) {
      switch (true) {
        case isGameNoiTu:
          cleanupGameNoiTu(threadId);
          await sendMessageComplete(
            api,
            message,
            "Đã làm mới lại trò chơi nối từ và kickout toàn bộ người chơi khỏi phiên game hiện tại!",
            true,
            180000
          );
          break;
      }
      return;
    } else if (command === "dapan" && isGameNoiTu && isAdminLevelHighest && isMainBot) {
      const keyword = args.slice(1).join(" ");
      await checkResultNoiTu(api, message, keyword);
      return;
    } else if (command === "start") {
      switch (gameType) {
        case gameTypeDoanSo:
          const startNumber = args[1] || "Invalid";
          await handleGuessNumberCommand(api, message, aliasCommand, startNumber);
          break;
      }
    } else if (command === "play") {
      switch (gameType) {
        case gameTypeAiLaTrieuPhu:
          await handleAiLaTrieuPhuCommand(api, message, aliasCommand);
          break;
      }
      return;
    } else if (command == "join" || command == "leave") {
      const activeGame = groupSettings[threadId].activeGame;
      if (activeGame === false) {
        if (isAdmin(api.getBotId(), senderId, threadId)) {
          const text =
            "🚫 Trò chơi hiện tại không được kích hoạt trong nhóm này.\n\n" +
            "🛠️ Quản trị viên hãy dùng lệnh !gameactive để kích hoạt tương tác game cho nhóm!";
          const result = {
            success: false,
            message: text,
          };
          await sendMessageFromSQL(api, message, result, true, TIME_TO_LIVE);
        }
        return;
      }

      const threadGames = activeGames.get(threadId);
      if (threadGames && threadGames.has(gameType)) {
        if (command === "join") {
          if (checkPlayerJoined(threadId, gameType, senderId)) {
            const result = {
              success: true,
              message: "✅ Bạn đã là người chơi trong phiên game này!...",
            };
            await sendMessageFromSQL(api, message, result, false, TIME_TO_LIVE);
          } else {
            let subCaption = "";
            if (isGameVuaTiengViet) {
              const game = threadGames.get(gameType);
              subCaption += `\nCụm từ hiện tại cần giải đáp là:\n` + game.scrambledWord;
            }
            const result = {
              success: true,
              message: `🎉 Bạn đã tham gia trò chơi ${gameType}!`,
            };
            await sendMessageFromSQL(api, message, result, true, TIME_TO_LIVE);
            addPlayer(threadId, gameType, senderId, senderName);
          }
        } else if (command === "leave") {
          if (checkPlayerJoined(threadId, gameType, senderId)) {
            const result = {
              success: true,
              message: `✅ Bạn đã rời trò chơi ${gameType}!`,
            };
            await sendMessageFromSQL(api, message, result, false, TIME_TO_LIVE);
            if (isGameNoiTu) {
              await memberLeaveGameNoiTu(api, message);
            } else {
              removePlayer(threadId, gameType, senderId);
            }
          } else {
            const result = {
              success: true,
              message: `❌ Bạn chưa tham gia trò chơi ${gameType}!...`,
            };
            await sendMessageFromSQL(api, message, result, false, TIME_TO_LIVE);
          }
        }

      } else {
        if (command === "leave") {
          const result = {
            success: true,
            message: `❌ Bạn chưa tham gia trò chơi ${gameType}!...`,
          };
          await sendMessageFromSQL(api, message, result, false, TIME_TO_LIVE);
          return;
        }
      }

      if (command === "join") {
        switch (gameType) {
          case gameTypeDoanSo:
            await handleGuessNumberCommand(api, message, aliasCommand);
            break;
          case gameTypeNoiTu:
            await handleWordChainCommand(api, message);
            break;
          case gameTypeDoanTu:
            await handleWordGuessCommand(api, message, threadId, command);
            break;
          case gameTypeVuaTiengViet:
            await startVuaTiengVietGame(api, message, threadId);
            break;
          case gameTypeZaclWarrior:
            await handleZaclWarriorCommand(api, message, aliasCommand, groupSettings);
            break;
          case gameTypeAiLaTrieuPhu:
            await handleAiLaTrieuPhuCommand(api, message, aliasCommand);
            break;
          case gameTypeCauCa:
            await handleCauCaCommand(api, message, aliasCommand);
            break;
          case gameTypeDuoiHinhBatChu:
            await startDuoiHinhBatChuGame(api, message, threadId);
            break;
        }
      }
    } else {
      await sendMessageFromSQL(api, message, result, false, TIME_TO_LIVE);
    }
  }
}
