import { BOARD_SIZE } from "../core/game-manager.js";
import { getRandomEmptyCell } from "../core/board.js";
import { getDifficultyConfig } from "./bot-difficulties.js";
import EasyCaro from "../game-level/easy-caro.js";
import NormalCaro from "../game-level/normal-caro.js";
import HardCaro from "../game-level/hard-caro.js";
import MasterCaro from "../game-level/master-caro.js";

/**
 * Make a bot move với AI được cải thiện theo độ khó
 */
export async function makeBotMoveXO(api, message, threadId, gameInstance) {
  const difficulty = getDifficultyConfig(gameInstance.botDifficulty);
  const botId = api.getBotId();
  let moveIndex;

  const botSymbol = gameInstance.players.get(botId).symbol;

  let botInstance = gameInstance.caroBot;
  if (!botInstance) {
    if (difficulty?.level === 4) {
      botInstance = new MasterCaro();
    } else if (difficulty?.level === 3) {
      botInstance = new HardCaro();
    } else if (difficulty?.level === 2) {
      botInstance = new NormalCaro();
    } else {
      botInstance = new EasyCaro();
    }
    gameInstance.caroBot = botInstance;
  }

  moveIndex = botInstance.makeMove(gameInstance.board, botSymbol, gameInstance.moves);

  // Fallback nếu không tìm được nước đi hợp lệ
  if (moveIndex === null || moveIndex === undefined) {
    moveIndex = getRandomEmptyCell(gameInstance.board);
  }

  // Validate move
  const row = Math.floor(moveIndex / BOARD_SIZE);
  const col = moveIndex % BOARD_SIZE;

  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE || gameInstance.board[row][col] !== null) {
    moveIndex = getRandomEmptyCell(gameInstance.board);
    if (moveIndex === null) {
      console.error("Error - No empty cells available for bot move");
      return { moveNumber: null, moveIndex: null };
    }
  }

  // Always recalculate row/col after potential moveIndex change
  const finalRow = Math.floor(moveIndex / BOARD_SIZE);
  const finalCol = moveIndex % BOARD_SIZE;

  // Place the bot's piece
  gameInstance.board[finalRow][finalCol] = botSymbol;

  const moveNumber = moveIndex + 1; // 1-based for user display
  gameInstance.moves.push({ player: botId, position: moveIndex, symbol: botSymbol });
  gameInstance.lastMoveTime = Date.now();

  return { moveNumber, moveIndex };
}
