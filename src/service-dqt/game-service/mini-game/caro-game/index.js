/**
 * Module chính của trò chơi Caro
 *
 * File này export các chức năng chính được sử dụng trong trò chơi Caro
 */

// Exports từ file caro.js
export { handleCaroCommand, handleCaroReaction, handleCaroGame } from "./caro.js";

// Exports từ core/game-manager.js
export {
  gameTypeCaro,
  BOARD_SIZE,
  GAME_MESSAGE_TIME_TO_LIVE,
  FINAL_MESSAGE_TIME_TO_LIVE,
  setupTurnTimeout,
  clearTurnTimeout,
  startCaroGame,
  endGame,
  setProcessingMove,
  isProcessingMove,
} from "./core/game-manager.js";

export { checkWinner, getInitialBotMove, deepCopyBoard, getRandomEmptyCell } from "./core/board.js";

export { makeBotMoveXO } from "./utils/algorithm.js";

export {
  positionToCoordinates,
  coordinatesToPosition,
  isValidCoordinate,
  positionToChessNotation,
  formatElapsedTime,
  isOnWinningLine,
  cloneGameState,
} from "./utils/game-utils.js";

export {
  getBotDifficulties,
  getDifficultyConfig,
  getAvailableDifficulties,
  getBotDifficultiesInfo,
  isDifficultyValid,
} from "./utils/bot-difficulties.js";
