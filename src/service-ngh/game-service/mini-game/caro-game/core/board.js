import { BOARD_SIZE, WIN_CONDITION } from "./game-manager.js";

/**
 * Returns a strategic initial move for bot
 * Được cải tiến để lựa chọn các vị trí chiến lược tốt nhất
 */
export function getInitialBotMove(board) {
  // Nước đi đầu tiên có tầm quan trọng đặc biệt trong cờ caro
  const centerRow = Math.floor(BOARD_SIZE / 2);
  const centerCol = Math.floor(BOARD_SIZE / 2);
  
  // Chiến thuật mạnh: 
  // 1. Đánh vào trung tâm (tốt nhất)
  // 2. Đánh vào các vị trí xung quanh trung tâm
  // 3. Thêm yếu tố ngẫu nhiên để không bị đoán trước
  
  const strategicMoves = [];
  
  // Trung tâm: Vị trí mạnh nhất
  if (board[centerRow][centerCol] === null) {
    strategicMoves.push({
      position: centerRow * BOARD_SIZE + centerCol,
      weight: 10
    });
  }
  
  // Vòng 1: Các ô xung quanh trung tâm
  const innerOffsets = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1]
  ];
  
  for (const [dr, dc] of innerOffsets) {
    const r = centerRow + dr;
    const c = centerCol + dc;
    
    if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === null) {
      // Góc ưu tiên thấp hơn các ô cạnh
      const isCorner = Math.abs(dr) === 1 && Math.abs(dc) === 1;
      strategicMoves.push({
        position: r * BOARD_SIZE + c,
        weight: isCorner ? 5 : 8
      });
    }
  }
  
  // Chọn vị trí dựa trên trọng số
  // 80% chọn vị trí có trọng số cao nhất, 20% chọn ngẫu nhiên để khó đoán
  strategicMoves.sort((a, b) => b.weight - a.weight);
  
  if (Math.random() < 0.8 && strategicMoves.length > 0) {
    // Lấy các vị trí có trọng số cao nhất
    const maxWeight = strategicMoves[0].weight;
    const bestMoves = strategicMoves.filter(move => move.weight === maxWeight);
    
    // Chọn ngẫu nhiên trong số các vị trí tốt nhất
    return bestMoves[Math.floor(Math.random() * bestMoves.length)].position;
  } 
  else if (strategicMoves.length > 0) {
    // Chọn ngẫu nhiên từ tất cả các vị trí chiến lược
    return strategicMoves[Math.floor(Math.random() * strategicMoves.length)].position;
  }
  
  // Fallback: Nếu không có vị trí chiến lược, chọn ngẫu nhiên
  return getRandomEmptyCell(board);
}

/**
 * Tạo bản sao sâu của board
 * @param {Array<Array>} board - Bàn cờ gốc
 * @returns {Array<Array>} - Bản sao của bàn cờ
 */
export function deepCopyBoard(board) {
  return board.map((row) => [...row]);
}

/**
 * Get a random empty cell for bot moves
 */
export function getRandomEmptyCell(board) {
  const emptyCells = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === null) {
        emptyCells.push(r * BOARD_SIZE + c);
      }
    }
  }

  if (emptyCells.length === 0) return null;
  return emptyCells[Math.floor(Math.random() * emptyCells.length)];
}

/**
 * Check if the last move resulted in a win
 * Returns the winning line if there is a winner, otherwise null
 */
export function checkWinner(board, lastRow, lastCol) {
  // Sử dụng hàm tìm đường thắng lợi
  const winningLine = findWinningLine(board, lastRow, lastCol);
  return winningLine !== null ? winningLine : false;
}

/**
 * Tìm đường thắng lợi (5 quân liên tiếp)
 * Trả về một mảng các tọa độ của quân cờ tạo thành đường thắng lợi
 */
export function findWinningLine(board, lastRow, lastCol) {
  const symbol = board[lastRow][lastCol];
  if (!symbol) return null;

  // Kiểm tra 4 hướng: ngang, dọc, chéo xuống, chéo lên
  const directions = [
    [0, 1], // Ngang
    [1, 0], // Dọc
    [1, 1], // Chéo xuống
    [1, -1], // Chéo lên
  ];

  for (const [dr, dc] of directions) {
    let winningCells = [{ row: lastRow, col: lastCol }];

    // Kiểm tra theo chiều thuận
    for (let i = 1; i < WIN_CONDITION; i++) {
      const r = lastRow + dr * i;
      const c = lastCol + dc * i;

      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === symbol) {
        winningCells.push({ row: r, col: c });
      } else {
        break;
      }
    }

    // Kiểm tra theo chiều nghịch
    for (let i = 1; i < WIN_CONDITION; i++) {
      const r = lastRow - dr * i;
      const c = lastCol - dc * i;

      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === symbol) {
        winningCells.push({ row: r, col: c });
      } else {
        break;
      }
    }

    // Nếu đủ 5 quân liên tiếp thì trả về danh sách tọa độ
    if (winningCells.length >= WIN_CONDITION) {
      return winningCells;
    }
  }

  return null;
}

/**
 * Lấy dãy quân cờ theo một hướng
 */
export function getLine(board, row, col, dr, dc, length) {
  const line = [];

  // Lấy các ô từ trước vị trí hiện tại
  for (let i = 1; i <= length; i++) {
    const r = row - dr * i;
    const c = col - dc * i;

    if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
      line.unshift(board[r][c]); // Thêm vào đầu mảng
    } else {
      break;
    }
  }

  // Thêm vị trí hiện tại
  line.push(board[row][col]);

  // Lấy các ô từ sau vị trí hiện tại
  for (let i = 1; i <= length; i++) {
    const r = row + dr * i;
    const c = col + dc * i;

    if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
      line.push(board[r][c]);
    } else {
      break;
    }
  }

  return line;
}

/**
 * Kiểm tra xem một dãy có khớp với mẫu không
 */
export function matchPattern(line, pattern) {
  if (line.length < pattern.length) return false;

  // Kiểm tra từ mọi vị trí bắt đầu có thể
  for (let start = 0; start <= line.length - pattern.length; start++) {
    let match = true;

    for (let i = 0; i < pattern.length; i++) {
      // Nếu pattern[i] là null, bất kỳ giá trị nào cũng được
      // Ngược lại, giá trị phải khớp
      if (pattern[i] !== null && line[start + i] !== pattern[i]) {
        match = false;
        break;
      }
    }

    if (match) return true;
  }

  return false;
}

/**
 * Đánh giá giá trị vị trí trên bàn cờ
 */
export function evaluatePositionValue(row, col, board) {
  // Ưu tiên trung tâm hơn biên
  const centerRow = BOARD_SIZE / 2;
  const centerCol = BOARD_SIZE / 2;

  // Tính khoảng cách từ trung tâm (càng gần càng tốt)
  const distanceFromCenter = Math.sqrt(Math.pow(row - centerRow, 2) + Math.pow(col - centerCol, 2));

  // Điểm vị trí từ 0-10, càng gần trung tâm càng cao
  const maxDistance = Math.sqrt(Math.pow(BOARD_SIZE, 2) / 2);
  const positionScore = 10 * (1 - distanceFromCenter / maxDistance);

  return positionScore;
} 