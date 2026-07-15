import { BOARD_SIZE } from "../core/game-manager.js";

/**
 * Chuyển đổi tọa độ từ vị trí số (1-256) sang tọa độ (hàng, cột) (0-15, 0-15)
 * @param {number} position - Vị trí (1-256)
 * @returns {Object} - Đối tượng {row, col}
 */
export function positionToCoordinates(position) {
  // Đảm bảo position là 0-based
  const zeroBasedPosition = position - 1;
  return {
    row: Math.floor(zeroBasedPosition / BOARD_SIZE),
    col: zeroBasedPosition % BOARD_SIZE,
  };
}

/**
 * Chuyển đổi từ tọa độ (hàng, cột) sang vị trí số (1-256)
 * @param {number} row - Hàng (0-15)
 * @param {number} col - Cột (0-15)
 * @returns {number} - Vị trí (1-256)
 */
export function coordinatesToPosition(row, col) {
  return row * BOARD_SIZE + col + 1; // +1 vì vị trí hiển thị cho người dùng là 1-based
}

/**
 * Kiểm tra xem một tọa độ có hợp lệ trên bàn cờ không
 * @param {number} row - Hàng
 * @param {number} col - Cột
 * @returns {boolean} - true nếu tọa độ hợp lệ, false nếu không
 */
export function isValidCoordinate(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

/**
 * Chuyển đổi vị trí thành ký hiệu tọa độ cờ vua (A1, B2, ...)
 * @param {number} position - Vị trí (1-256)
 * @returns {string} - Tọa độ theo kiểu cờ vua (A1, B2, ...)
 */
export function positionToChessNotation(position) {
  const { row, col } = positionToCoordinates(position);
  const colLetter = String.fromCharCode(65 + col); // 65 là mã ASCII của 'A'
  return `${colLetter}${row + 1}`;
}

/**
 * Định dạng thời gian trôi qua thành chuỗi
 * @param {number} ms - Thời gian tính bằng mili giây
 * @returns {string} - Chuỗi thời gian định dạng "mm:ss"
 */
export function formatElapsedTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Kiểm tra xem vị trí có nằm trên đường thắng lợi không
 * @param {Array} winningLine - Mảng các tọa độ tạo thành đường thắng lợi
 * @param {number} row - Hàng cần kiểm tra
 * @param {number} col - Cột cần kiểm tra
 * @returns {boolean} - true nếu vị trí nằm trên đường thắng lợi, false nếu không
 */
export function isOnWinningLine(winningLine, row, col) {
  if (!winningLine) return false;
  
  return winningLine.some(cell => cell.row === row && cell.col === col);
}

/**
 * Tạo bản sao sâu của trạng thái trò chơi
 * @param {Object} gameInstance - Trạng thái trò chơi hiện tại
 * @returns {Object} - Bản sao sâu của trạng thái trò chơi
 */
export function cloneGameState(gameInstance) {
  // Tạo bản sao của bàn cờ
  const boardCopy = gameInstance.board.map(row => [...row]);
  
  // Tạo bản sao của danh sách người chơi
  const playersCopy = new Map();
  gameInstance.players.forEach((player, id) => {
    playersCopy.set(id, { ...player });
  });
  
  // Tạo bản sao của danh sách nước đi
  const movesCopy = gameInstance.moves.map(move => ({ ...move }));
  
  // Tạo đối tượng trò chơi mới
  return {
    type: gameInstance.type,
    board: boardCopy,
    currentPlayer: gameInstance.currentPlayer,
    players: playersCopy,
    moves: movesCopy,
    isBot: gameInstance.isBot,
    botDifficulty: gameInstance.botDifficulty,
    bet: gameInstance.bet,
    winner: gameInstance.winner,
    lastMoveTime: gameInstance.lastMoveTime,
    winningLine: gameInstance.winningLine ? [...gameInstance.winningLine] : null
  };
} 