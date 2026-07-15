// Expert Bot - AI chơi cờ Caro với trình độ cao cấp
// Tập hợp tất cả các thuật toán trong một class độc lập

import { BOARD_SIZE, WIN_CONDITION } from "../core/game-manager.js";

export default class NormalCaro {
  constructor() {
    this.config = {
      enableDebug: false, // Tắt debug mode
    };
    this.directions = [
      [0, 1], // ngang
      [1, 0], // dọc
      [1, 1], // chéo chính
      [1, -1], // chéo phụ
    ];
    this.eightDirections = [
      [0, 1], // Phải
      [1, 0], // Dưới
      [0, -1], // Trái
      [-1, 0], // Trên
      [-1, -1], // Trên-trái
      [-1, 1], // Trên-phải
      [1, -1], // Dưới-trái
      [1, 1], // Dưới-phải
    ];
  }

  /**
   * Thay đổi cấu hình cho bot
   * @param {Object} config - Cấu hình mới
   */
  setConfig(config) {
    this.config = { ...this.config, ...config };
  }

  /**
   * Tính nước đi tối ưu dựa trên bàn cờ hiện tại
   * @param {Array} board - Bàn cờ hiện tại
   * @param {Array} moves - Lịch sử các nước đi
   * @param {String} botSymbol - Ký hiệu của bot (X hoặc O)
   * @returns {Number} Vị trí tốt nhất để đánh (index từ 0 - BOARD_SIZE*BOARD_SIZE-1)
   */
  makeMove(board, botSymbol, moves) {
    const playerSymbol = botSymbol === "X" ? "O" : "X";
    if (!moves) moves = this.getAllMoves(board);

    // 0. Khởi Tạo Nước Đi Đầu Tiên Và Thứ Hai
    if (moves.length === 0) return this.getInitialMove(board);
    if (moves.length === 1 && moves[0].symbol === playerSymbol) {
      return this.getSecondMove(board, moves[0].position, botSymbol);
    }

    // 1.1 THẮNG NGAY - Ưu tiên tuyệt đối
    const winMove = this.findWinningMove(board, botSymbol);
    if (winMove !== null) return winMove;

    // 1.2 CHẶN THẮNG NGAY - Ưu tiên tuyệt đối
    const playerWinMove = this.findWinningMove(board, playerSymbol);
    if (playerWinMove !== null) return playerWinMove;

    // 2.1 TẠO 4 QUÂN LIÊN TIẾP TỐT NHẤT
    const create4MoveBest = this.findCreateBestFourMove(board, botSymbol);
    if (create4MoveBest !== null) return create4MoveBest;

    // 2.2 TẠO 4 QUÂN LIÊN TIẾP Bị CHẶN MỘT ĐẦU
    const create4Move = this.findCreateFourMove(board, botSymbol);
    if (create4Move !== null) return create4Move;

    // 3.2 CHẶN 3 QUÂN NGUY HIỂM NHẤT
    let unblockedThreeAttackMoves = this.findUnblockedTheardAttackMoves(board, playerSymbol);
    unblockedThreeAttackMoves = unblockedThreeAttackMoves.filter((move) => move.maxLineCount >= 4);
    unblockedThreeAttackMoves = unblockedThreeAttackMoves.filter((move) =>
      move.threeDirections.some((direction) => direction.priority === 3)
    );
    if (unblockedThreeAttackMoves.length > 0) {
      return unblockedThreeAttackMoves[0].position;
    }

    // 3.1 Kiểm Tra Bẩy Fork Đa Cửa Thắng
    const criticalBlockMove = this.checkCriticalOpponentThreats(board, botSymbol);
    if (criticalBlockMove !== null) return criticalBlockMove;

    // 3.2: Kiểm tra mối đe dọa tiềm ẩn của ta để tấn công
    const criticalWinMove = this.checkCriticalOpponentThreats(board, playerSymbol);
    if (criticalWinMove !== null) return criticalWinMove;

    // 3.3 Mở 3 Quân Tấn Công
    const attackThreeMove = this.findUnblockedTheardAttackMoves(board, botSymbol);
    if (attackThreeMove.length > 0) {
      return attackThreeMove[0].position;
    }

    // 3.4 TẠO ĐƯỜNG 2 VÀ CHẶN PATTERNS ĐỐI THỦ
    const twoMoveBlockThread = this.findTwoMoveBlockThread(board, botSymbol, playerSymbol);
    if (twoMoveBlockThread !== null) {
      return twoMoveBlockThread;
    }

    const bestMove = this.checkBoardStateAndAttackOpportunity(board, botSymbol);
    if (bestMove !== null) return bestMove;

    const twoBestMove = this.findTwoBestMove(board, botSymbol, playerSymbol);
    if (twoBestMove !== null) return twoBestMove;

    // Fallback cuối cùng: chọn vị trí trung tâm
    return this.getInitialMove(board);
  }

  // =================================================================
  // CÁC HÀM CƠ BẢN VÀ TIỆN ÍCH
  // =================================================================

  /**
   * Quét toàn bộ board và trả về danh sách các moves đã đi
   * @param {Array} board - Bàn cờ hiện tại
   * @returns {Array} moves - Danh sách các nước đã đi dạng { position, symbol }
   */
  getAllMoves(board) {
    const moves = [];
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const cell = board[row][col];
        if (cell === "X" || cell === "O") {
          moves.push({ position: row * BOARD_SIZE + col, symbol: cell });
        }
      }
    }
    return moves;
  }

  /**
   * Kiểm tra người thắng cuộc
   */
  checkWinner(board, lastRow, lastCol) {
    const symbol = board[lastRow][lastCol];
    if (!symbol) return false;

    for (const [dr, dc] of this.directions) {
      let count = 1; // Bắt đầu với quân hiện tại

      // Đếm theo một hướng
      for (let i = 1; i < WIN_CONDITION; i++) {
        const r = lastRow + dr * i;
        const c = lastCol + dc * i;
        if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === symbol) {
          count++;
        } else {
          break;
        }
      }

      // Đếm theo hướng ngược lại
      for (let i = 1; i < WIN_CONDITION; i++) {
        const r = lastRow - dr * i;
        const c = lastCol - dc * i;
        if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === symbol) {
          count++;
        } else {
          break;
        }
      }

      // Nếu đủ 5 quân liên tiếp
      if (count >= WIN_CONDITION) {
        return true;
      }
    }

    return false;
  }

  /**
   * In thông tin debug (có thể tắt/bật)
   */
  debugLog(message) {
    if (this.config.enableDebug) {
      console.log(`[DEBUG] ${message}`);
    }
  }

  // =================================================================
  // CÁC HÀM THUẬT TOÁN CHIẾN THUẬT
  // =================================================================

  /**
   * Chuyển đổi position sang tọa độ
   */
  positionToCoord(position) {
    return `(${Math.floor(position / BOARD_SIZE)}, ${position % BOARD_SIZE})`;
  }

  /**
   * Chuyển đổi tọa độ sang position
   */
  coordToPosition(row, col) {
    return row * BOARD_SIZE + col;
  }

  /**
   * Tính khoảng cách từ trung tâm
   */
  getDistanceFromCenter(row, col) {
    const center = Math.floor(BOARD_SIZE / 2);
    return Math.abs(row - center) + Math.abs(col - center);
  }

  /**
   * Đếm quân cờ xung quanh một vị trí
   */
  countNearbyPieces(board, row, col, symbol, radius) {
    let count = 0;
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (dr === 0 && dc === 0) continue; // Bỏ qua vị trí trung tâm
        const r = row + dr;
        const c = col + dc;
        if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === symbol) {
          count++;
        }
      }
    }
    return count;
  }

  /**
   * Nước đi đầu tiên - Chọn vị trí trung tâm
   */
  getInitialMove(board) {
    const center = Math.floor(BOARD_SIZE / 2);
    // Ưu tiên vị trí trung tâm và xung quanh với yếu tố ngẫu nhiên
    const centerPositions = [
      [center, center], // Trung tâm
      [center - 1, center], // Trên
      [center + 1, center], // Dưới
      [center, center - 1], // Trái
      [center, center + 1], // Phải
      [center - 1, center - 1], // Trên-trái
      [center - 1, center + 1], // Trên-phải
      [center + 1, center - 1], // Dưới-trái
      [center + 1, center + 1], // Dưới-phải
    ];

    // Xáo trộn ngẫu nhiên vị trí
    for (let i = centerPositions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [centerPositions[i], centerPositions[j]] = [centerPositions[j], centerPositions[i]];
    }

    // 70% cơ hội chọn vị trí trung tâm
    if (Math.random() < 0.7 && board[center][center] === null) {
      return this.coordToPosition(center, center);
    }

    // Nếu không -> chọn vị trí ngẫu nhiên từ danh sách
    for (const [row, col] of centerPositions) {
      if (row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE && board[row][col] === null) {
        return this.coordToPosition(row, col);
      }
    }

    // Fallback nếu các vị trí ưu tiên đều đã bị chiếm
    return this.coordToPosition(center, center);
  }

  /**
   * Nước đi thứ hai - Phản ứng với nước đi đầu của đối thủ
   */
  getSecondMove(board, firstPosition) {
    const firstRow = Math.floor(firstPosition / BOARD_SIZE);
    const firstCol = firstPosition % BOARD_SIZE;

    const adjacent = [
      [firstRow - 1, firstCol - 1],
      [firstRow - 1, firstCol],
      [firstRow - 1, firstCol + 1],
      [firstRow, firstCol - 1],
      [firstRow, firstCol + 1],
      [firstRow + 1, firstCol - 1],
      [firstRow + 1, firstCol],
      [firstRow + 1, firstCol + 1],
    ];

    for (const [row, col] of adjacent) {
      if (row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE && board[row][col] === null) {
        return this.coordToPosition(row, col);
      }
    }

    return this.getRandomEmptyCell(board);
  }

  /**
   * Tìm nước đi thắng ngay (4 quân liên tiếp + 1 ô trống)
   */
  findWinningMove(board, symbol) {
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col] !== null) continue;

        // Thử đặt quân vào vị trí này
        board[row][col] = symbol;

        // Kiểm tra xem có thắng không
        if (this.checkWinner(board, row, col)) {
          board[row][col] = null; // Khôi phục
          return this.coordToPosition(row, col);
        }

        board[row][col] = null; // Khôi phục
      }
    }

    return null;
  }

  /**
   * Tìm nước đi tạo 4 quân liên tiếp với lựa chọn tốt nhất
   */
  findCreateBestFourMove(board, botSymbol) {
    const opponent = botSymbol === "X" ? "O" : "X";
    let bestMove = null;
    let bestList = [];

    const criticalPatterns = [
      { pattern: [opponent, null, botSymbol, botSymbol, botSymbol, null, null], moveIndex: 5 },
      { pattern: [null, null, botSymbol, botSymbol, botSymbol, null, opponent], moveIndex: 1 },
    ];

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col] !== null) continue;

        for (const [dr, dc] of this.eightDirections) {
          const line = [],
            positions = [];
          for (let i = -1; i <= 5; i++) {
            const r = row + dr * i,
              c = col + dc * i;
            if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
              line.push(board[r][c]);
              positions.push([r, c]);
            } else {
              line.push(undefined);
              positions.push(null);
            }
          }

          for (const { pattern, moveIndex } of criticalPatterns) {
            const match = pattern.every((v, i) => v === null || v === line[i]);
            if (match) {
              const [r, c] = positions[moveIndex];
              if (r === row && c === col) return this.coordToPosition(row, col);
            }
          }
        }
      }
    }

    if (bestList.length > 0) {
      bestMove = bestList.reduce((prev, curr) => (curr.priority > prev.priority ? curr : prev)).position;
    }

    return bestMove;
  }

  /**
   * Tìm nước đi tạo 4 quân liên tiếp
   */
  findCreateFourMove(board, botSymbol) {
    const opponent = botSymbol === "X" ? "O" : "X";
    let bestMove = null;

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col] !== null) continue;

        for (const [dr, dc] of this.eightDirections) {
          let count = 0;
          let blocks = 0;

          // Đếm một hướng
          for (let i = 1; i <= 4; i++) {
            const r = row + dr * i,
              c = col + dc * i;
            if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) {
              blocks++;
              break;
            }
            if (board[r][c] === botSymbol) count++;
            else if (board[r][c] === opponent) {
              blocks++;
              break;
            } else break;
          }

          // Đếm hướng ngược lại
          for (let i = 1; i <= 4; i++) {
            const r = row - dr * i,
              c = col - dc * i;
            if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) {
              blocks++;
              break;
            }
            if (board[r][c] === botSymbol) count++;
            else if (board[r][c] === opponent) {
              blocks++;
              break;
            } else break;
          }

          // Nếu có 3+ quân và chỉ bị chặn 1 đầu, không gần biên
          if (count >= 3 && blocks === 1 && row > 0 && row < BOARD_SIZE - 1 && col > 0 && col < BOARD_SIZE - 1) {
            this.debugLog(
              `Tìm thấy đường 3 bị chặn một đầu tại ${this.positionToCoord(this.coordToPosition(row, col))}`
            );
            return this.coordToPosition(row, col);
          }
        }
      }
    }

    return bestMove;
  }

  /**
   * Phân tích tất cả các mối đe dọa của đối thủ
   */
  analyzeAllThreats(board, opponent) {
    const threats = {
      criticalThreats: [], // Mối đe dọa nghiêm trọng (4 quân, fork)
      majorThreats: [], // Mối đe dọa lớn (3 quân mở)
      minorThreats: [], // Mối đe dọa nhỏ (2 quân, 3 quân đóng)
    };

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col] !== null) continue;

        // Phân tích mối đe dọa tại vị trí này
        const threatLevel = this.analyzeThreatAtPosition(board, row, col, opponent);

        const threat = {
          row,
          col,
          position: this.coordToPosition(row, col),
          ...threatLevel,
        };

        if (threatLevel.isCritical) {
          threats.criticalThreats.push(threat);
        } else if (threatLevel.isMajor) {
          threats.majorThreats.push(threat);
        } else if (threatLevel.isMinor) {
          threats.minorThreats.push(threat);
        }
      }
    }

    return threats;
  }

  /**
   * Phân tích mức độ đe dọa tại một vị trí cụ thể
   */
  analyzeThreatAtPosition(board, row, col, opponent) {
    const result = {
      isCritical: false,
      isMajor: false,
      isMinor: false,
      lines: [],
      maxCount: 0,
      openEnds: 0,
      totalScore: 0,
    };

    // Thử đặt quân đối thủ tại vị trí này
    board[row][col] = opponent;

    for (const [dr, dc] of this.directions) {
      let count = 1;
      let leftOpen = false;
      let rightOpen = false;
      let leftBlocked = false;
      let rightBlocked = false;

      // Kiểm tra hướng dương
      for (let i = 1; i < WIN_CONDITION; i++) {
        const r = row + dr * i,
          c = col + dc * i;
        if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
          if (board[r][c] === opponent) {
            count++;
          } else if (board[r][c] === null) {
            rightOpen = true;
            break;
          } else {
            rightBlocked = true;
            break;
          }
        } else {
          rightBlocked = true;
          break;
        }
      }

      // Kiểm tra hướng âm
      for (let i = 1; i < WIN_CONDITION; i++) {
        const r = row - dr * i,
          c = col - dc * i;
        if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
          if (board[r][c] === opponent) {
            count++;
          } else if (board[r][c] === null) {
            leftOpen = true;
            break;
          } else {
            leftBlocked = true;
            break;
          }
        } else {
          leftBlocked = true;
          break;
        }
      }

      if (count >= 2) {
        const line = {
          direction: [dr, dc],
          count,
          leftOpen,
          rightOpen,
          leftBlocked,
          rightBlocked,
          openEnds: (leftOpen ? 1 : 0) + (rightOpen ? 1 : 0),
        };
        result.lines.push(line);
        result.maxCount = Math.max(result.maxCount, count);
        result.openEnds += line.openEnds;

        // Tính điểm cho đường này
        let lineScore = count * count;
        if (line.openEnds === 2) lineScore *= 2;
        if (count >= 4) lineScore *= 5;
        result.totalScore += lineScore;
      }
    }

    board[row][col] = null; // Khôi phục

    // Xác định mức độ đe dọa
    if (result.maxCount >= 4 || result.lines.filter((l) => l.count >= 3 && l.openEnds >= 1).length >= 2) {
      result.isCritical = true;
    } else if (result.maxCount >= 3 && result.openEnds >= 2) {
      result.isMajor = true;
    } else if (result.maxCount >= 2) {
      result.isMinor = true;
    }

    return result;
  }

  /**
   * Kiểm tra xem một nước đi có thể chặn được một mối đe dọa không
   */
  canBlockThreat(board, blockRow, blockCol, threat, opponent) {
    // Kiểm tra xem vị trí chặn có nằm trong vùng ảnh hưởng của threat không
    const distance = Math.abs(blockRow - threat.row) + Math.abs(blockCol - threat.col);
    if (distance > 4) return false;

    // Thử đặt quân chặn và kiểm tra
    board[blockRow][blockCol] = opponent === "X" ? "O" : "X";
    const stillThreatening = this.analyzeThreatAtPosition(board, threat.row, threat.col, opponent);
    board[blockRow][blockCol] = null;

    return !stillThreatening.isCritical;
  }

  /**
   * Phân tích các mối đe dọa phức tạp (patterns đặc biệt)
   */
  analyzeComplexThreats(board, opponent) {
    const threats = [];

    // Patterns đặc biệt cần chặn
    const specialPatterns = [
      { pattern: [opponent, opponent, opponent], name: "triple" },
      { pattern: [opponent, opponent, null, opponent], name: "gapped-triple" },
      { pattern: [opponent, null, opponent, opponent], name: "gapped-triple-2" },
      { pattern: [null, opponent, opponent, opponent, null], name: "open-triple" },
    ];

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        for (const [dr, dc] of this.directions) {
          for (const { pattern, name } of specialPatterns) {
            const match = this.findPatternMatch(board, row, col, dr, dc, pattern);
            if (match) {
              for (const pos of match.blockPositions) {
                if (board[pos.row][pos.col] === null) {
                  threats.push({
                    row: pos.row,
                    col: pos.col,
                    type: name,
                    priority: match.priority || 1,
                  });
                }
              }
            }
          }
        }
      }
    }

    return threats;
  }

  /**
   * Tìm pattern match và trả về vị trí cần chặn
   */
  findPatternMatch(board, startRow, startCol, dr, dc, pattern) {
    const line = [];
    const positions = [];

    for (let i = 0; i < pattern.length; i++) {
      const r = startRow + dr * i;
      const c = startCol + dc * i;
      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        line.push(board[r][c]);
        positions.push({ row: r, col: c });
      } else {
        return null;
      }
    }

    // Kiểm tra pattern match
    let matches = true;
    const blockPositions = [];

    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i] === null) {
        blockPositions.push(positions[i]);
      } else if (pattern[i] !== line[i]) {
        matches = false;
        break;
      }
    }

    if (matches && blockPositions.length > 0) {
      return {
        blockPositions,
        priority: pattern.length >= 3 ? 2 : 1,
      };
    }

    return null;
  }

  /**
   * Phân tích mối đe dọa lân cận (proximity threats)
   */
  analyzeProximityThreats(board, opponent, botSymbol) {
    const threats = [];
    const occupiedPositions = [];

    // Tìm tất cả vị trí đã có quân cờ
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col] !== null) {
          occupiedPositions.push({ row, col, symbol: board[row][col] });
        }
      }
    }

    // Phân tích các vị trí lân cận với quân đối thủ
    for (const pos of occupiedPositions) {
      if (pos.symbol === opponent) {
        const nearbyThreats = this.findNearbyThreats(board, pos.row, pos.col, opponent, botSymbol);
        threats.push(...nearbyThreats);
      }
    }

    return threats;
  }

  /**
   * Tìm các mối đe dọa lân cận từ một vị trí
   */
  findNearbyThreats(board, centerRow, centerCol, opponent, botSymbol) {
    const threats = [];
    const radius = 3; // Bán kính tìm kiếm

    for (let row = centerRow - radius; row <= centerRow + radius; row++) {
      for (let col = centerCol - radius; col <= centerCol + radius; col++) {
        if (row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE && board[row][col] === null) {
          // Đánh giá mối đe dọa tại vị trí này
          const threatScore = this.evaluateProximityThreat(board, row, col, centerRow, centerCol, opponent);

          if (threatScore > 0) {
            threats.push({
              row,
              col,
              threatScore,
              distance: Math.abs(row - centerRow) + Math.abs(col - centerCol),
            });
          }
        }
      }
    }

    return threats;
  }

  /**
   * Đánh giá mối đe dọa lân cận
   */
  evaluateProximityThreat(board, row, col, centerRow, centerCol, opponent) {
    let score = 0;
    const distance = Math.abs(row - centerRow) + Math.abs(col - centerCol);

    // Càng gần thì càng nguy hiểm
    score += (4 - distance) * 10;

    // Kiểm tra xem có tạo thành đường thẳng với quân trung tâm không
    const dr = Math.sign(row - centerRow);
    const dc = Math.sign(col - centerCol);

    if (dr !== 0 || dc !== 0) {
      let lineCount = 1; // Bắt đầu với quân trung tâm

      // Đếm quân cùng hướng
      for (let i = 1; i < 5; i++) {
        const r = centerRow + dr * i;
        const c = centerCol + dc * i;
        if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
          if (board[r][c] === opponent) {
            lineCount++;
          } else {
            break;
          }
        }
      }

      // Đếm quân hướng ngược
      for (let i = 1; i < 5; i++) {
        const r = centerRow - dr * i;
        const c = centerCol - dc * i;
        if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
          if (board[r][c] === opponent) {
            lineCount++;
          } else {
            break;
          }
        }
      }

      if (lineCount >= 2) {
        score += lineCount * 50;
      }
    }

    return score;
  }

  /**
   * Kiểm tra pattern có khớp không và trả về vị trí các ô null
   */
  checkPatternMatch(board, startRow, startCol, dr, dc, pattern) {
    const result = {
      isMatch: true,
      nullPositions: [],
    };

    for (let i = 0; i < pattern.length; i++) {
      const r = startRow + dr * i;
      const c = startCol + dc * i;

      if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) {
        result.isMatch = false;
        break;
      }

      const cellValue = board[r][c];

      if (pattern[i] === null) {
        if (cellValue === null) {
          result.nullPositions.push({ row: r, col: c });
        } else {
          result.isMatch = false;
          break;
        }
      } else if (pattern[i] !== cellValue) {
        result.isMatch = false;
        break;
      }
    }

    return result;
  }

  /**
   * Phân tích đường line từ một vị trí theo hướng cụ thể
   */
  analyzeLineFromPosition(board, row, col, dr, dc, symbol, botSymbol) {
    let count = 1; // Bắt đầu với quân hiện tại
    let leftBlocked = false;
    let rightBlocked = false;

    // Đếm quân liên tiếp theo hướng dương
    for (let i = 1; i < WIN_CONDITION; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        if (board[r][c] === symbol) {
          count++;
        } else if (board[r][c] === botSymbol) {
          rightBlocked = true;
          break;
        } else {
          break; // Ô trống
        }
      } else {
        rightBlocked = true; // Ra ngoài biên
        break;
      }
    }

    // Đếm quân liên tiếp theo hướng âm
    for (let i = 1; i < WIN_CONDITION; i++) {
      const r = row - dr * i;
      const c = col - dc * i;
      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        if (board[r][c] === symbol) {
          count++;
        } else if (board[r][c] === botSymbol) {
          leftBlocked = true;
          break;
        } else {
          break; // Ô trống
        }
      } else {
        leftBlocked = true; // Ra ngoài biên
        break;
      }
    }

    return {
      count,
      leftBlocked,
      rightBlocked,
      blockedBothEnds: leftBlocked && rightBlocked,
      unblockedBothEnds: !leftBlocked && !rightBlocked,
    };
  }

  /**
   * Lấy candidate moves (ô trống gần các quân cờ hiện có)
   */
  getCandidateMoves(board, radius = 2) {
    const candidates = new Set();

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col] !== null) {
          // Thêm các ô trống xung quanh quân cờ này
          for (let dr = -radius; dr <= radius; dr++) {
            for (let dc = -radius; dc <= radius; dc++) {
              const r = row + dr;
              const c = col + dc;
              if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === null) {
                candidates.add(this.coordToPosition(r, c));
              }
            }
          }
        }
      }
    }

    return Array.from(candidates);
  }

  /**
   * Kiểm tra tình trạng bàn cờ và cơ hội tấn công
   * @param {Array} board - Bàn cờ hiện tại
   * @param {String} botSymbol - Ký hiệu của bot
   * @returns {Number|null} Vị trí tốt nhất để tấn công hoặc null nếu không thể tấn công
   */
  checkBoardStateAndAttackOpportunity(board, botSymbol) {
    const opponent = botSymbol === "X" ? "O" : "X";

    this.debugLog(`=== BOARD STATE AND ATTACK OPPORTUNITY CHECK ===`);

    // BƯỚC 0.1: Kiểm tra mối đe dọa tiềm ẩn của địch
    const criticalBlockMove = this.checkCriticalOpponentThreats(board, opponent, botSymbol);
    if (criticalBlockMove !== null) {
      this.debugLog(
        `Found critical opponent threat at ${this.positionToCoord(criticalBlockMove)} - must block immediately`
      );
      return criticalBlockMove;
    }

    // BƯỚC 0.2: Kiểm tra mối đe dọa tiềm ẩn của ta để tấn công
    const criticalWinMove = this.checkCriticalOpponentThreats(board, botSymbol, opponent);
    if (criticalWinMove !== null) {
      this.debugLog(
        `Found critical win opportunity at ${this.positionToCoord(criticalWinMove)} - must win immediately`
      );
      return criticalWinMove;
    }

    // BƯỚC 1.1: Tấn công 4 quân liên tiếp
    const fourMove = this.findCreateFourMove(board, botSymbol);
    if (fourMove !== null) {
      this.debugLog(`Found four-line attack opportunity at ${this.positionToCoord(fourMove)}`);
      return fourMove;
    }

    // BƯỚC 2.2: Tìm cơ hội tấn công - hai đường có thể tạo ra ba đường
    const attackMove = this.findAttackOpportunity(board, botSymbol, opponent);
    if (attackMove !== null) {
      this.debugLog(`Found double-line attack opportunity at ${this.positionToCoord(attackMove)}`);
      return attackMove;
    }

    this.debugLog(`No attack opportunity found`);
    return null;
  }

  /**
   * Kiểm tra mối đe dọa tiềm ẩn nghiêm trọng của địch
   * @param {Array} board - Bàn cờ hiện tại
   * @param {String} opponent - Ký hiệu của địch
   * @param {String} botSymbol - Ký hiệu của bot
   * @returns {Number|null} Vị trí cần chặn ngay lập tức hoặc null
   */
  checkCriticalOpponentThreats(board, botSymbol) {
    this.debugLog(`=== CHECK CRITICAL OPPONENT THREATS ===`);
    const opponent = botSymbol === "X" ? "O" : "X";

    // Tối ưu performance: Chỉ quét các ô trống gần quân cờ đã có (candidate moves)
    const candidatePositions = this.getCandidateMoves(board, 3); // Bán kính 3

    let criticalThreats = [];

    // Duyệt qua các vị trí candidate để tìm mối đe dọa nghiêm trọng
    for (const position of candidatePositions) {
      const row = Math.floor(position / BOARD_SIZE);
      const col = position % BOARD_SIZE;

      // Thử đặt quân tại vị trí này
      board[row][col] = opponent;

      let threatLevel = 0;
      let dangerScore = 0;
      const threatDetails = [];

      // Quét 4 hướng chính: ngang, dọc, chéo chính, chéo phụ
      for (const [dr, dc] of this.directions) {
        const lineInfo = this.scanFragmentedLineFromPosition(board, row, col, dr, dc, botSymbol);
        threatLevel += lineInfo.threatLevel;
        dangerScore += lineInfo.dangerScore;
      }

      board[row][col] = null; // Khôi phục

      // Nếu có từ 2 mối đe dọa trở lên, đây là vị trí cần chặn ngay
      if (threatLevel >= 2) {
        criticalThreats.push({
          position: position,
          row: row,
          col: col,
          threatLevel: threatLevel,
          details: threatDetails,
          dangerScore: dangerScore,
        });

        this.debugLog(`Found critical threat at ${this.positionToCoord(position)} with level ${threatLevel}`);
        this.debugLog(`Threat details: ${threatDetails.join(", ")}`);
      }
    }

    if (criticalThreats.length > 0) {
      criticalThreats.sort((a, b) => b.dangerScore - a.dangerScore);
      return criticalThreats[0].position;
    }

    // Nếu không tìm thấy mối đe dọa nghiêm trọng, trả về null
    this.debugLog(`No critical opponent threats found`);
    return null;
  }

  /**
   * Quét toàn bộ line từ -4 đến +4 từ vị trí hiện tại theo một hướng
   * @param {Array} board - Bàn cờ hiện tại
   * @param {Number} row - Hàng
   * @param {Number} col - Cột
   * @param {Number} dr - Hướng hàng (-1, 0, 1)
   * @param {Number} dc - Hướng cột (-1, 0, 1)
   * @param {String} symbol - Ký hiệu cần phân tích
   * @param {String} botSymbol - Ký hiệu của bot (để xác định blocking)
   * @returns {Object} Thông tin về line: count, leftBlocked, rightBlocked, blockedBothEnds
   */
  scanFullLineFromPosition(board, row, col, dr, dc, symbol, botSymbol) {
    // Tạo mảng chứa 9 ô từ -4 đến +4
    const lineData = [];
    const positions = [];

    for (let i = -4; i <= 4; i++) {
      const r = row + dr * i;
      const c = col + dc * i;

      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        lineData.push(board[r][c]);
        positions.push({ row: r, col: c, isCenter: i === 0 });
      } else {
        lineData.push("BOUNDARY"); // Đánh dấu ra ngoài biên
        positions.push(null);
      }
    }

    // Vị trí center (index 4) chứa quân symbol (đã đặt giả tưởng)
    const centerIndex = 4;

    // Đếm quân liên tiếp xung quanh vị trí center
    let count = 1; // Bắt đầu với quân ở center

    // Đếm về phía trái (index giảm dần từ 3, 2, 1, 0)
    let leftCount = 0;
    for (let i = centerIndex - 1; i >= 0; i--) {
      if (lineData[i] === symbol) {
        leftCount++;
        count++;
      } else {
        break;
      }
    }

    // Đếm về phía phải (index tăng dần từ 5, 6, 7, 8)
    let rightCount = 0;
    for (let i = centerIndex + 1; i < lineData.length; i++) {
      if (lineData[i] === symbol) {
        rightCount++;
        count++;
      } else {
        break;
      }
    }

    // Kiểm tra blocking
    let leftBlocked = false;
    let rightBlocked = false;

    // Kiểm tra left blocking (vị trí ngay trước dãy quân liên tiếp)
    const leftBlockIndex = centerIndex - leftCount - 1;
    if (leftBlockIndex >= 0) {
      const leftBlockCell = lineData[leftBlockIndex];
      if (leftBlockCell === botSymbol || leftBlockCell === "BOUNDARY") {
        leftBlocked = true;
      }
    } else {
      leftBlocked = true; // Ra ngoài biên
    }

    // Kiểm tra right blocking (vị trí ngay sau dãy quân liên tiếp)
    const rightBlockIndex = centerIndex + rightCount + 1;
    if (rightBlockIndex < lineData.length) {
      const rightBlockCell = lineData[rightBlockIndex];
      if (rightBlockCell === botSymbol || rightBlockCell === "BOUNDARY") {
        rightBlocked = true;
      }
    } else {
      rightBlocked = true; // Ra ngoài biên
    }

    const result = {
      count,
      leftCount,
      rightCount,
      leftBlocked,
      rightBlocked,
      blockedBothEnds: leftBlocked && rightBlocked,
      unblockedBothEnds: !leftBlocked && !rightBlocked,
      lineData, // Debug: dữ liệu line thô
      centerIndex, // Debug: vị trí center
    };

    // Debug thông tin chi tiết
    if (this.config.enableDebug && count >= 3) {
      this.debugLog(
        `scanFullLine at (${row},${col}) [${dr},${dc}]: count=${count}, left=${leftCount}, right=${rightCount}, leftBlocked=${leftBlocked}, rightBlocked=${rightBlocked}`
      );
      this.debugLog(
        `Line data: [${lineData.map((cell) => (cell === null ? "_" : cell === "BOUNDARY" ? "B" : cell)).join(",")}]`
      );
    }

    return result;
  }

  /**
   * Quét line ngắt khúc từ -5 đến +5 từ vị trí hiện tại theo một hướng
   * Hàm này có thể đếm quân cờ có ô trống ở giữa (fragmented line)
   * @param {Array} board - Bàn cờ hiện tại
   * @param {Number} row - Hàng
   * @param {Number} col - Cột
   * @param {Number} dr - Hướng hàng (-1, 0, 1)
   * @param {Number} dc - Hướng cột (-1, 0, 1)
   * @param {String} symbol - Ký hiệu cần phân tích
   * @param {String} botSymbol - Ký hiệu của bot (để xác định blocking)
   * @returns {Object} Thông tin về fragmented line: count, leftBlocked, rightBlocked, blockedBothEnds
   */
  scanFragmentedLineFromPosition(board, row, col, dr, dc, botSymbol) {
    const lineData = [];
    const positions = [];
    const opponent = botSymbol === "X" ? "O" : "X";
    let tempSymbol;

    for (let i = -4; i <= 4; i++) {
      const r = row + dr * i;
      const c = col + dc * i;

      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        lineData.push(board[r][c]);
        positions.push({ row: r, col: c, isCenter: i === 0 });
      } else {
        lineData.push("BOUNDARY"); // Đánh dấu ra ngoài biên
        positions.push(null);
      }
    }

    // Vị trí center (index 5) chứa quân symbol (đã đặt giả tưởng)
    const centerIndex = 4;

    // Đếm tổng số quân symbol trong phạm vi -5 đến +5 (bao gồm cả ô center)
    let count = 1; // Bắt đầu với quân ở center
    let leftCount = 0;
    let rightCount = 0;
    let centerCount = 0;
    let threatLevel = 0;
    let leftLineIndex = 0;
    let rightLineIndex = 0;
    let pointCheckIndex = true;

    // Kiểm tra blocking ở hai đầu
    let leftBeforeBlocked = false;
    let leftAfterBlocked = false;
    let rightBeforeBlocked = false;
    let rightAfterBlocked = false;
    let centerBeforeBlocked = false;
    let centerAfterBlocked = false;

    tempSymbol = lineData[centerIndex + 1];
    if (tempSymbol === botSymbol || tempSymbol === "BOUNDARY") {
      leftAfterBlocked = true;
    }

    // Đếm về phía trái (index giảm dần từ 4, 3, 2, 1, 0)
    for (let i = centerIndex - 1; i >= 0; i--) {
      const symbolPosition = lineData[i];
      if (symbolPosition === opponent) {
        leftCount++;
        count++;
        if (pointCheckIndex) {
          leftLineIndex += 1;
        }
      } else if (symbolPosition === botSymbol || symbolPosition === "BOUNDARY") {
        leftBeforeBlocked = true;
        break;
      } else {
        pointCheckIndex = false;
      }
    }

    tempSymbol = lineData[centerIndex - 1];
    if (tempSymbol === botSymbol || tempSymbol === "BOUNDARY") {
      rightBeforeBlocked = true;
    }
    pointCheckIndex = true;

    // Đếm về phía phải (index tăng dần từ 6, 7, 8, 9, 10)
    for (let i = centerIndex + 1; i < lineData.length; i++) {
      const symbolPosition = lineData[i];
      if (symbolPosition === opponent) {
        rightCount++;
        count++;
        if (pointCheckIndex) {
          rightLineIndex += 1;
        }
      } else if (symbolPosition === botSymbol || symbolPosition === "BOUNDARY") {
        rightAfterBlocked = true;
        break;
      } else {
        pointCheckIndex = false;
      }
    }

    // Đếm từ giữa ra 5 phần tử: 2 3 4 5 6 (centerIndex = 4)
    for (let i = centerIndex - 2; i <= centerIndex + 2; i++) {
      const symbolPosition = lineData[i];
      if (symbolPosition === opponent) {
        centerCount++;
        count++;
      } else if (symbolPosition === botSymbol || symbolPosition === "BOUNDARY") {
        if (i > centerIndex) {
          centerAfterBlocked = true;
        } else {
          centerBeforeBlocked = true;
        }
        break;
      }
    }

    const leftBlocked = leftBeforeBlocked && leftAfterBlocked;
    const rightBlocked = rightBeforeBlocked && rightAfterBlocked;

    if (leftCount >= 2 || rightCount >= 2) {
      if (leftCount >= 3 && (!leftBeforeBlocked || !leftAfterBlocked)) {
        threatLevel += 1;
      } else if (leftCount >= 2 && !leftBeforeBlocked && !leftAfterBlocked) {
        threatLevel += 1;
      }
      if (rightCount >= 3 && (!rightBeforeBlocked || !rightAfterBlocked)) {
        threatLevel += 1;
      } else if (rightCount >= 2 && !rightBeforeBlocked && !rightAfterBlocked) {
        threatLevel += 1;
      }
    } else if (centerCount >= 3) {
      if (centerCount >= 4 && (!centerBeforeBlocked || !centerAfterBlocked)) {
        threatLevel += 1;
      } else if (centerCount >= 3 && !centerBeforeBlocked && !centerAfterBlocked) {
        threatLevel += 1;
      }
    }

    let dangerScore = 0;

    if (leftCount >= 2 || rightCount >= 2) {
      if (leftCount >= 2) {
        if (leftCount >= 3) {
          if (leftBeforeBlocked || leftAfterBlocked) {
            dangerScore += 200;
          } else {
            dangerScore += 1000;
          }
        } else if (leftCount >= 2) {
          if (leftBeforeBlocked || leftAfterBlocked) {
            dangerScore += 200;
          } else {
            dangerScore += 1000;
          }
        }
        dangerScore += leftLineIndex * 100;
      }
      if (rightCount >= 2) {
        if (rightCount >= 3) {
          if (rightBeforeBlocked || rightAfterBlocked) {
            dangerScore += 200;
          } else {
            dangerScore += 1000;
          }
        } else if (rightCount >= 2) {
          if (rightBeforeBlocked || rightAfterBlocked) {
            dangerScore += 200;
          } else {
            dangerScore += 1000;
          }
        }
        dangerScore += rightLineIndex * 100;
      }
    } else if (centerCount >= 3) {
      if (centerCount >= 4) {
        if (centerBeforeBlocked || centerAfterBlocked) {
          dangerScore += 200;
        } else {
          dangerScore += 1000;
        }
      } else if (centerCount >= 3) {
        if (centerBeforeBlocked || centerAfterBlocked) {
          dangerScore += 300;
        } else {
          dangerScore += 1300;
        }
      }
    }

    const result = {
      count,
      leftCount,
      rightCount,
      leftBlocked,
      rightBlocked,
      blockedBothEnds: leftBlocked && rightBlocked,
      unblockedBothEnds: !leftBlocked && !rightBlocked,
      lineData, // Debug: dữ liệu line thô
      centerIndex,
      threatLevel,
      dangerScore,
    };

    // Debug thông tin chi tiết
    if (count >= 3) {
      this.debugLog(
        `scanFragmentedLine at (${row},${col}) [${dr},${dc}]: count=${count}, left=${leftCount}, right=${rightCount}, leftBlocked=${leftBeforeBlocked}, rightBlocked=${rightAfterBlocked}`
      );
      this.debugLog(
        `Line data: [${lineData.map((cell) => (cell === null ? "_" : cell === "BOUNDARY" ? "B" : cell)).join(",")}]`
      );
    }

    return result;
  }

  /**
   * Kiểm tra xem địch có đường 3 liên tiếp chưa bị chặn hai đầu không
   * @param {Array} board - Bàn cờ hiện tại
   * @param {String} opponent - Ký hiệu của địch
   * @param {String} botSymbol - Ký hiệu của bot
   * @returns {Boolean} True nếu địch có đường 3 chưa bị chặn hai đầu
   */
  hasUnblockedOpponentThreats(board, opponent, botSymbol) {
    // Kiểm tra patterns nguy hiểm: _XXX_ và _X_XX, _XX_X
    const dangerousPatterns = [
      { pattern: [null, opponent, opponent, opponent, null], name: "_XXX_" },
      { pattern: [null, opponent, null, opponent, opponent, null], name: "_X_XX_" },
      { pattern: [null, opponent, opponent, null, opponent, null], name: "_XX_X_" },
    ];

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        for (const [dr, dc] of this.directions) {
          for (const { pattern, name } of dangerousPatterns) {
            const match = this.checkPatternMatch(board, row, col, dr, dc, pattern);
            if (match.isMatch) {
              this.debugLog(
                `Found unblocked opponent threat: ${name} at ${this.positionToCoord(this.coordToPosition(row, col))}`
              );
              return true;
            }
          }
        }
      }
    }

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col] === opponent) {
          for (const [dr, dc] of this.directions) {
            const threatInfo = this.analyzeLineFromPosition(board, row, col, dr, dc, opponent, botSymbol);
            if (threatInfo.count >= 3 && threatInfo.unblockedBothEnds) {
              this.debugLog(`Found unblocked 3-line threat at ${this.positionToCoord(this.coordToPosition(row, col))}`);
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  /**
   * Tìm cơ hội tấn công hai đường có thể tạo ra ba đường
   * @param {Array} board - Bàn cờ hiện tại
   * @param {String} botSymbol - Ký hiệu của bot
   * @param {String} opponent - Ký hiệu của địch
   * @returns {Number|null} Vị trí tốt nhất để tấn công hoặc null
   */
  findAttackOpportunity(board, botSymbol, opponent) {
    this.debugLog(`=== FIND ATTACK OPPORTUNITY ===`);

    const attackMoves = [];
    const candidatePositions = this.getCandidateMoves(board, 3); // Tối ưu performance

    for (const position of candidatePositions) {
      const row = Math.floor(position / BOARD_SIZE);
      const col = position % BOARD_SIZE;

      // Thử đặt quân bot tại vị trí này
      board[row][col] = botSymbol;

      // Phân tích khả năng tạo đường 2+ và chặn đối thủ
      const attackAnalysis = this.analyzeAttackPotential(board, row, col, botSymbol, opponent);

      board[row][col] = null; // Khôi phục

      // Xem xét các nước có potential attack hoặc block hiệu quả
      if (attackAnalysis.shouldConsider) {
        const attackScore = this.evaluateImprovedAttackPosition(board, row, col, botSymbol, opponent, attackAnalysis);
        attackMoves.push({
          position: position,
          score: attackScore,
          analysis: attackAnalysis,
        });

        this.debugLog(
          `Attack candidate at ${this.positionToCoord(position)}: ` +
            `lines=${attackAnalysis.potentialLines}, blocks=${attackAnalysis.blocksOpponent}, ` +
            `score=${attackScore}`
        );
      }
    }

    // Sắp xếp theo score giảm dần và trả về vị trí tốt nhất
    if (attackMoves.length > 0) {
      attackMoves.sort((a, b) => b.score - a.score);
      this.debugLog(
        `Best attack move: ${this.positionToCoord(attackMoves[0].position)} with score ${attackMoves[0].score}`
      );
      return attackMoves[0].position;
    }

    this.debugLog(`No attack opportunity found`);
    return null;
  }

  /**
   * Đếm số đường có thể tạo ra 3 quân từ vị trí này
   * @param {Array} board - Bàn cờ hiện tại
   * @param {Number} row - Hàng
   * @param {Number} col - Cột
   * @param {String} botSymbol - Ký hiệu của bot
   * @param {String} opponent - Ký hiệu của địch
   * @returns {Number} Số đường có thể tạo ra 3 quân
   */
  countPotentialThreeLines(board, row, col, botSymbol, opponent) {
    let count = 0;

    for (const [dr, dc] of this.directions) {
      const lineInfo = this.analyzeLineFromPosition(board, row, col, dr, dc, botSymbol, opponent);

      // Đếm các đường có thể tạo thành 3 quân (hiện tại có 2+ quân và có thể mở rộng)
      if (lineInfo.count >= 2 && !lineInfo.blockedBothEnds) {
        count++;
      }
    }

    return count;
  }

  /**
   * Kiểm tra xem vị trí có bị chặn hai đầu trong phạm vi không
   * @param {Array} board - Bàn cờ hiện tại
   * @param {Number} row - Hàng
   * @param {Number} col - Cột
   * @param {String} botSymbol - Ký hiệu của bot
   * @param {String} opponent - Ký hiệu của địch
   * @param {Number} range - Phạm vi kiểm tra
   * @returns {Boolean} True nếu không bị chặn hai đầu
   */
  checkUnblockedInRange(board, row, col, botSymbol, opponent, range) {
    // Kiểm tra trong phạm vi range có bị chặn bởi quân địch không
    for (const [dr, dc] of this.directions) {
      let blockedCount = 0;

      // Kiểm tra hai đầu của đường line
      for (let i = 1; i <= range; i++) {
        const r1 = row + dr * i;
        const c1 = col + dc * i;
        const r2 = row - dr * i;
        const c2 = col - dc * i;

        if (r1 >= 0 && r1 < BOARD_SIZE && c1 >= 0 && c1 < BOARD_SIZE && board[r1][c1] === opponent) {
          blockedCount++;
        }
        if (r2 >= 0 && r2 < BOARD_SIZE && c2 >= 0 && c2 < BOARD_SIZE && board[r2][c2] === opponent) {
          blockedCount++;
        }
      }

      // Nếu có ít nhất 1 hướng không bị chặn hai đầu thì OK
      if (blockedCount < 2) {
        return true;
      }
    }

    return false;
  }

  /**
   * Đánh giá vị trí tấn công
   * @param {Array} board - Bàn cờ hiện tại
   * @param {Number} row - Hàng
   * @param {Number} col - Cột
   * @param {String} botSymbol - Ký hiệu của bot
   * @param {String} opponent - Ký hiệu của địch
   * @param {Number} potentialLines - Số đường tiềm năng
   * @returns {Number} Điểm số đánh giá
   */
  evaluateAttackPosition(board, row, col, botSymbol, opponent, potentialLines) {
    let score = 0;

    // Thử đặt quân bot tại vị trí này để đánh giá
    board[row][col] = botSymbol;

    // BƯỚC 1: Ưu tiên cao nhất cho vị trí tạo 3 với hai đầu không bị chặn
    const openThreeBonus = this.evaluateOpenThreeCreation(board, row, col, botSymbol, opponent);
    score += openThreeBonus;

    // BƯỚC 2: Bonus cho chặn hai nước xéo (chặn địch nhưng không bị chặn đầu)
    const blockDiagonalBonus = this.evaluateBlockDiagonalMoves(board, row, col, botSymbol, opponent);
    score += blockDiagonalBonus;

    // BƯỚC 3: Bonus cho tạo đường 2 không bị chặn ở hai đầu
    const openTwoBonus = this.evaluateOpenTwoCreation(board, row, col, botSymbol, opponent);
    score += openTwoBonus;

    // BƯỚC 4: Điểm cơ bản cho số đường tiềm năng
    score += potentialLines * 200;

    // BƯỚC 5: Bonus cho vị trí trung tâm
    const distanceFromCenter = this.getDistanceFromCenter(row, col);
    score += Math.max(0, 10 - distanceFromCenter) * 15;

    // BƯỚC 6: Bonus cho connectivity với các quân bot có sẵn
    const nearbyBotPieces = this.countNearbyPieces(board, row, col, botSymbol, 3);
    score += nearbyBotPieces * 30;

    // BƯỚC 7: Penalty cho vị trí quá gần quân địch
    const nearbyOpponentPieces = this.countNearbyPieces(board, row, col, opponent, 2);
    score -= nearbyOpponentPieces * 15;

    // BƯỚC 8: Bonus cho khả năng tạo fork trong tương lai
    score += this.evaluateForkPotential(board, row, col, botSymbol) * 80;

    board[row][col] = null; // Khôi phục

    this.debugLog(
      `Attack position evaluation at ${this.positionToCoord(this.coordToPosition(row, col))}: 
      Open3=${openThreeBonus}, BlockDiag=${blockDiagonalBonus}, Open2=${openTwoBonus}, 
      Total=${score}`
    );

    return score;
  }

  /**
   * Đánh giá việc tạo đường 3 có hai đầu không bị chặn
   * @param {Array} board - Bàn cờ hiện tại
   * @param {Number} row - Hàng
   * @param {Number} col - Cột
   * @param {String} botSymbol - Ký hiệu của bot
   * @param {String} opponent - Ký hiệu của địch
   * @returns {Number} Điểm bonus cho đường 3 mở
   */
  evaluateOpenThreeCreation(board, row, col, botSymbol, opponent) {
    let bonus = 0;

    for (const [dr, dc] of this.directions) {
      const lineInfo = this.analyzeLineFromPosition(board, row, col, dr, dc, botSymbol, opponent);

      if (lineInfo.count >= 3) {
        if (lineInfo.unblockedBothEnds) {
          // Đường 3 có hai đầu mở - ưu tiên cao nhất
          bonus += 1000;
          this.debugLog(
            `Open three found at ${this.positionToCoord(this.coordToPosition(row, col))} 
            in direction [${dr},${dc}] with ${lineInfo.count} pieces`
          );
        } else if (!lineInfo.leftBlocked || !lineInfo.rightBlocked) {
          // Đường 3 có một đầu mở
          bonus += 500;
        }
      }
    }

    return bonus;
  }

  /**
   * Đánh giá việc chặn hai nước xéo (chặn địch nhưng không bị chặn đầu)
   * @param {Array} board - Bàn cờ hiện tại
   * @param {Number} row - Hàng
   * @param {Number} col - Cột
   * @param {String} botSymbol - Ký hiệu của bot
   * @param {String} opponent - Ký hiệu của địch
   * @returns {Number} Điểm bonus cho chặn xéo
   */
  evaluateBlockDiagonalMoves(board, row, col, botSymbol, opponent) {
    let bonus = 0;

    // Kiểm tra 8 hướng xung quanh vị trí này
    for (const [dr, dc] of this.eightDirections) {
      // Kiểm tra xem có 2 quân địch liên tiếp theo hướng này không
      const r1 = row + dr;
      const c1 = col + dc;
      const r2 = row + dr * 2;
      const c2 = col + dc * 2;

      if (
        r1 >= 0 &&
        r1 < BOARD_SIZE &&
        c1 >= 0 &&
        c1 < BOARD_SIZE &&
        r2 >= 0 &&
        r2 < BOARD_SIZE &&
        c2 >= 0 &&
        c2 < BOARD_SIZE &&
        board[r1][c1] === opponent &&
        board[r2][c2] === opponent
      ) {
        // Tìm thấy 2 quân địch liên tiếp, kiểm tra xem có thể chặn mà không bị chặn không
        const r3 = row + dr * 3;
        const c3 = col + dc * 3;
        const rBefore = row - dr;
        const cBefore = col - dc;

        // Kiểm tra xem có bị chặn không
        let isBlocked = false;
        if (rBefore >= 0 && rBefore < BOARD_SIZE && cBefore >= 0 && cBefore < BOARD_SIZE) {
          if (board[rBefore][cBefore] === opponent) {
            isBlocked = true;
          }
        }

        if (r3 >= 0 && r3 < BOARD_SIZE && c3 >= 0 && c3 < BOARD_SIZE) {
          if (board[r3][c3] === opponent) {
            isBlocked = true;
          }
        }

        if (!isBlocked) {
          bonus += 300;
          this.debugLog(
            `Block diagonal move found at ${this.positionToCoord(this.coordToPosition(row, col))} 
            blocking [${r1},${c1}] and [${r2},${c2}]`
          );
        }
      }
    }

    return bonus;
  }

  /**
   * Đánh giá việc tạo đường 2 có hai đầu không bị chặn
   * @param {Array} board - Bàn cờ hiện tại
   * @param {Number} row - Hàng
   * @param {Number} col - Cột
   * @param {String} botSymbol - Ký hiệu của bot
   * @param {String} opponent - Ký hiệu của địch
   * @returns {Number} Điểm bonus cho đường 2 mở
   */
  evaluateOpenTwoCreation(board, row, col, botSymbol, opponent) {
    let bonus = 0;

    for (const [dr, dc] of this.directions) {
      const lineInfo = this.analyzeLineFromPosition(board, row, col, dr, dc, botSymbol, opponent);

      if (lineInfo.count === 2) {
        if (lineInfo.unblockedBothEnds) {
          // Đường 2 có hai đầu mở - có thể phát triển thành 3 hoặc 4
          bonus += 150;
          this.debugLog(
            `Open two found at ${this.positionToCoord(this.coordToPosition(row, col))} 
            in direction [${dr},${dc}]`
          );
        } else if (!lineInfo.leftBlocked || !lineInfo.rightBlocked) {
          // Đường 2 có một đầu mở
          bonus += 50;
        }
      }
    }

    return bonus;
  }

  /**
   * Đánh giá tiềm năng tạo fork
   * @param {Array} board - Bàn cờ hiện tại
   * @param {Number} row - Hàng
   * @param {Number} col - Cột
   * @param {String} botSymbol - Ký hiệu của bot
   * @returns {Number} Điểm fork potential (0-5)
   */
  evaluateForkPotential(board, row, col, botSymbol) {
    let potential = 0;

    // Kiểm tra xem từ vị trí này có thể tạo ra bao nhiêu đường 3+ trong tương lai
    for (const [dr, dc] of this.directions) {
      const lineInfo = this.analyzeLineFromPosition(board, row, col, dr, dc, botSymbol, null);

      if (lineInfo.count >= 2) {
        potential++;
      }
    }

    return Math.min(potential, 5); // Giới hạn tối đa 5
  }

  /**
   * Tìm kiếm các nước đi tạo ra đường 3 không bị chặn
   * @param {Array} board - Bàn cờ hiện tại
   * @param {String} symbol - Ký hiệu của bot
   * @returns {Array} Danh sách các nước đi tạo ra đường 3 không bị chặn
   */
  findUnblockedTheardAttackMoves(board, symbol, numberFilter) {
    let unblockedMoves = [];
    const opponent = symbol === "X" ? "O" : "X";

    // Tối ưu performance: chỉ kiểm tra các vị trí gần quân cờ đã có
    const candidatePositions = this.getCandidateMoves(board, 3);

    for (const position of candidatePositions) {
      const row = Math.floor(position / BOARD_SIZE);
      const col = position % BOARD_SIZE;

      // Thử đặt quân bot tại vị trí này
      board[row][col] = symbol;

      let unblockedThreeCount = 0;
      let maxLineCount = 0;
      const threeDirections = [];

      // Kiểm tra tất cả 4 hướng chính
      for (const [dr, dc] of this.directions) {
        const lineInfo = this.scanFullLineFromPosition(board, row, col, dr, dc, symbol, opponent);

        // Kiểm tra xem có tạo ra đường 3+ không bị chặn không
        if (lineInfo.count >= 3) {
          maxLineCount = Math.max(maxLineCount, lineInfo.count);

          // Ưu tiên đường 3 không bị chặn cả hai đầu
          if (lineInfo.unblockedBothEnds) {
            unblockedThreeCount++;
            threeDirections.push({ dr, dc, ...lineInfo, priority: 3 });
            this.debugLog(
              `Found unblocked-both-ends 3-line at ${this.positionToCoord(position)} direction [${dr},${dc}] with ${
                lineInfo.count
              } pieces`
            );
          }
          // Tính cả đường 3 chỉ bị chặn một đầu
          else if (!lineInfo.leftBlocked || !lineInfo.rightBlocked) {
            unblockedThreeCount++;
            threeDirections.push({ dr, dc, ...lineInfo, priority: 2 });
            this.debugLog(
              `Found partially-blocked 3-line at ${this.positionToCoord(position)} direction [${dr},${dc}] with ${
                lineInfo.count
              } pieces`
            );
          }
        }
      }

      board[row][col] = null; // Khôi phục

      // Nếu tạo được ít nhất 1 đường 3 không bị chặn
      if (unblockedThreeCount > 0) {
        const attackScore = this.evaluateUnblockedThreeAttackMove(
          board,
          row,
          col,
          symbol,
          opponent,
          unblockedThreeCount,
          maxLineCount,
          threeDirections
        );

        unblockedMoves.push({
          position: position,
          score: attackScore,
          unblockedThreeCount: unblockedThreeCount,
          maxLineCount: maxLineCount,
          threeDirections: threeDirections,
        });

        this.debugLog(
          `Unblocked three attack move at ${this.positionToCoord(
            position
          )}: ${unblockedThreeCount} unblocked lines, max count: ${maxLineCount}, score: ${attackScore}`
        );
      }
    }

    // Sắp xếp theo score giảm dần
    if (numberFilter) {
      unblockedMoves = unblockedMoves.filter((move) => move.maxLineCount >= numberFilter);
    }

    unblockedMoves.sort((a, b) => b.score - a.score);

    return unblockedMoves;
  }

  /**
   * Đánh giá nước đi tạo ra đường 3 không bị chặn
   * @param {Array} board - Bàn cờ hiện tại
   * @param {Number} row - Hàng
   * @param {Number} col - Cột
   * @param {String} botSymbol - Ký hiệu của bot
   * @param {String} opponent - Ký hiệu của địch
   * @param {Number} unblockedThreeCount - Số đường 3 không bị chặn
   * @param {Number} maxLineCount - Số quân tối đa trong đường
   * @param {Array} threeDirections - Danh sách các hướng có đường 3
   * @returns {Number} Điểm số đánh giá
   */
  evaluateUnblockedThreeAttackMove(
    board,
    row,
    col,
    botSymbol,
    opponent,
    unblockedThreeCount,
    maxLineCount,
    threeDirections
  ) {
    let score = 0;

    // Điểm cơ bản cho số đường 3 không bị chặn
    score += unblockedThreeCount * 1000;

    // Bonus cao cho đường 4+
    if (maxLineCount >= 4) score += (maxLineCount - 3) * 500;

    // Bonus cho priority của các đường
    let highPriorityCount = 0;
    for (const direction of threeDirections) {
      if (direction.priority === 3) {
        // Đường 3 không bị chặn cả hai đầu
        score += 1500;
        highPriorityCount++;
      } else if (direction.priority === 2) {
        // Đường 3 chỉ bị chặn một đầu
        score += 800;
      }
    }

    // Bonus đặc biệt cho multiple high-priority lines
    if (highPriorityCount >= 2) {
      score += 2000; // Bonus rất cao cho fork opportunity
    }

    // Bonus cho vị trí trung tâm
    const distanceFromCenter = this.getDistanceFromCenter(row, col);
    score += Math.max(0, 10 - distanceFromCenter) * 50;

    // Bonus cho connectivity với các quân bot có sẵn
    const nearbyBotPieces = this.countNearbyPieces(board, row, col, botSymbol, 3);
    score += nearbyBotPieces * 100;

    // Penalty cho vị trí quá gần quân địch
    const nearbyOpponentPieces = this.countNearbyPieces(board, row, col, opponent, 2);
    score -= nearbyOpponentPieces * 50;

    return score;
  }

  /**
   * Tìm nước đi tốt nhất tạo đường 2 không bị chặn và có thể chặn đối thủ
   * Ưu tiên: 1) Tạo 2 thẳng + chặn chéo/ngang đối thủ, 2) Tạo nhiều đường 2 nhất
   * @param {Array} board - Bàn cờ hiện tại
   * @param {String} botSymbol - Ký hiệu của bot
   * @param {String} opponent - Ký hiệu của đối thủ
   * @returns {Number|null} Vị trí tốt nhất hoặc null nếu không tìm thấy
   */
  findTwoBestMove(board, botSymbol, opponent) {
    this.debugLog(`=== FIND TWO BEST MOVE ===`);

    const candidatePositions = this.getCandidateMoves(board, 3);
    const twoMoves = [];

    for (const position of candidatePositions) {
      const row = Math.floor(position / BOARD_SIZE);
      const col = position % BOARD_SIZE;

      // Thử đặt quân bot tại vị trí này
      board[row][col] = botSymbol;

      // Phân tích khả năng tạo đường 2 không bị chặn
      const twoLineAnalysis = this.analyzeTwoLineCreation(board, row, col, botSymbol, opponent);

      // Phân tích khả năng chặn đối thủ
      const blockAnalysis = this.analyzeOpponentBlocking(board, row, col, botSymbol, opponent);

      board[row][col] = null; // Khôi phục

      // Chỉ xem xét các nước tạo được ít nhất 1 đường 2
      if (twoLineAnalysis.unblockedTwoCount > 0) {
        const moveScore = this.evaluateTwoBestMove(
          row,
          col,
          twoLineAnalysis,
          blockAnalysis,
          botSymbol,
          opponent,
          board
        );

        twoMoves.push({
          position: position,
          row: row,
          col: col,
          score: moveScore,
          unblockedTwoCount: twoLineAnalysis.unblockedTwoCount,
          totalTwoCount: twoLineAnalysis.totalTwoCount,
          blocksStraightAndDiagonal: blockAnalysis.blocksStraightAndDiagonal,
          blocksOpponentLines: blockAnalysis.blocksOpponentLines,
          details: {
            twoLineAnalysis,
            blockAnalysis,
          },
        });

        this.debugLog(
          `Two-line move at ${this.positionToCoord(position)}: ` +
            `${twoLineAnalysis.unblockedTwoCount} unblocked twos, ` +
            `blocks straight+diagonal: ${blockAnalysis.blocksStraightAndDiagonal}, ` +
            `score: ${moveScore}`
        );
      }
    }

    if (twoMoves.length === 0) {
      this.debugLog(`No valid two-line moves found`);
      return null;
    }

    // Sắp xếp theo score giảm dần
    twoMoves.sort((a, b) => b.score - a.score);

    this.debugLog(`Best two-line move: ${this.positionToCoord(twoMoves[0].position)} with score ${twoMoves[0].score}`);
    return twoMoves[0].position;
  }

  /**
   * Tìm nước đi tạo đường 2 không bị chặn đồng thời chặn patterns đối thủ
   * @param {Array} board - Bàn cờ hiện tại
   * @param {String} botSymbol - Ký hiệu của bot
   * @param {String} opponent - Ký hiệu của đối thủ
   * @returns {Number|null} Vị trí tốt nhất hoặc null nếu không tìm thấy
   */
  findTwoMoveBlockThread(board, botSymbol, opponent) {
    this.debugLog(`=== FIND TWO MOVE BLOCK THREAD ===`);

    const candidatePositions = this.getCandidateMoves(board, 3);
    const validMoves = [];

    // Patterns cần chặn: [opponent, null, opponent], [opponent, opponent, null], [null, opponent, opponent]
    const threateningPatterns = [
      { pattern: [opponent, null, opponent], blockIndex: 1, name: "O_O" },
      { pattern: [opponent, opponent, null], blockIndex: 2, name: "OO_" },
      { pattern: [null, opponent, opponent], blockIndex: 0, name: "_OO" },
    ];

    for (const position of candidatePositions) {
      const row = Math.floor(position / BOARD_SIZE);
      const col = position % BOARD_SIZE;

      // Thử đặt quân bot tại vị trí này
      board[row][col] = botSymbol;

      // Kiểm tra xem có tạo được đường 2 không bị chặn không
      const twoLineAnalysis = this.analyzeTwoLineCreation(board, row, col, botSymbol, opponent);

      if (twoLineAnalysis.unblockedTwoCount > 0) {
        // Khôi phục để kiểm tra patterns đối thủ
        board[row][col] = null;

        // Kiểm tra xem vị trí này có chặn được patterns đối thủ không
        const blockInfo = this.checkOpponentPatternsBlocking(board, row, col, threateningPatterns);

        if (blockInfo.blocksPattern) {
          // Đặt lại để tính score
          board[row][col] = botSymbol;

          const moveScore = this.evaluateTwoMoveBlockThread(
            board,
            row,
            col,
            botSymbol,
            opponent,
            twoLineAnalysis,
            blockInfo
          );

          validMoves.push({
            position: position,
            row: row,
            col: col,
            score: moveScore,
            twoLineAnalysis: twoLineAnalysis,
            blockInfo: blockInfo,
          });

          this.debugLog(
            `Two-move-block-thread at ${this.positionToCoord(position)}: ` +
              `creates ${twoLineAnalysis.unblockedTwoCount} unblocked twos, ` +
              `blocks ${blockInfo.blockedPatterns.length} opponent patterns, ` +
              `score: ${moveScore}`
          );
        }

        board[row][col] = null; // Khôi phục
      } else {
        board[row][col] = null; // Khôi phục
      }
    }

    if (validMoves.length === 0) {
      this.debugLog(`No two-move-block-thread found`);
      return null;
    }

    // Sắp xếp theo score giảm dần
    validMoves.sort((a, b) => b.score - a.score);

    this.debugLog(
      `Best two-move-block-thread: ${this.positionToCoord(validMoves[0].position)} ` +
        `with score ${validMoves[0].score}`
    );
    return validMoves[0].position;
  }

  /**
   * Kiểm tra xem vị trí có chặn được patterns đối thủ không
   * @param {Array} board - Bàn cờ hiện tại
   * @param {Number} row - Hàng
   * @param {Number} col - Cột
   * @param {Array} patterns - Danh sách patterns cần kiểm tra
   * @returns {Object} Thông tin về việc chặn patterns
   */
  checkOpponentPatternsBlocking(board, row, col, patterns) {
    const blockedPatterns = [];
    let totalBlockScore = 0;

    for (const [dr, dc] of this.directions) {
      for (const { pattern, blockIndex, name } of patterns) {
        // Kiểm tra pattern bắt đầu từ các vị trí khác nhau
        for (let startOffset = -pattern.length + 1; startOffset <= 0; startOffset++) {
          const startRow = row + dr * startOffset;
          const startCol = col + dc * startOffset;

          // Vị trí null trong pattern phải khớp với vị trí (row, col)
          const nullPositionInPattern = blockIndex;
          const expectedNullRow = startRow + dr * nullPositionInPattern;
          const expectedNullCol = startCol + dc * nullPositionInPattern;

          if (expectedNullRow === row && expectedNullCol === col) {
            const match = this.checkPatternMatch(board, startRow, startCol, dr, dc, pattern);

            if (match.isMatch) {
              blockedPatterns.push({
                direction: [dr, dc],
                patternName: name,
                startPosition: { row: startRow, col: startCol },
                blockPosition: { row: row, col: col },
                priority: this.getPatternPriority(name),
              });

              totalBlockScore += this.getPatternPriority(name);

              this.debugLog(
                `Found blockable pattern ${name} at ${this.positionToCoord(
                  this.coordToPosition(startRow, startCol)
                )} ` + `direction [${dr},${dc}], blocked at ${this.positionToCoord(this.coordToPosition(row, col))}`
              );
            }
          }
        }
      }
    }

    return {
      blocksPattern: blockedPatterns.length > 0,
      blockedPatterns: blockedPatterns,
      totalBlockScore: totalBlockScore,
      highPriorityBlocks: blockedPatterns.filter((p) => p.priority >= 200).length,
    };
  }

  /**
   * Lấy độ ưu tiên của pattern
   * @param {String} patternName - Tên pattern
   * @returns {Number} Độ ưu tiên
   */
  getPatternPriority(patternName) {
    const priorities = {
      O_O: 300, // Pattern O null O - nguy hiểm nhất vì tạo 2 cửa thắng
      OO_: 200, // Pattern OO null - nguy hiểm vì sắp thành 3
      _OO: 200, // Pattern null OO - nguy hiểm vì sắp thành 3
    };
    return priorities[patternName] || 100;
  }

  /**
   * Đánh giá nước đi tạo đường 2 và chặn patterns đối thủ
   * @param {Array} board - Bàn cờ hiện tại
   * @param {Number} row - Hàng
   * @param {Number} col - Cột
   * @param {String} botSymbol - Ký hiệu bot
   * @param {String} opponent - Ký hiệu đối thủ
   * @param {Object} twoLineAnalysis - Phân tích đường 2
   * @param {Object} blockInfo - Thông tin chặn patterns
   * @returns {Number} Điểm số đánh giá
   */
  evaluateTwoMoveBlockThread(board, row, col, botSymbol, opponent, twoLineAnalysis, blockInfo) {
    let score = 0;

    // TIER 1: Ưu tiên cao nhất - Tạo nhiều đường 2 + chặn pattern O_O
    const hasHighPriorityBlock = blockInfo.highPriorityBlocks > 0;
    const hasMultipleUnblockedTwo = twoLineAnalysis.unblockedTwoCount >= 2;

    if (hasMultipleUnblockedTwo && hasHighPriorityBlock) {
      score += 15000;
      this.debugLog(`TIER 1 at (${row},${col}): Multiple unblocked twos + high priority block`);
    }
    // TIER 2: Tạo đường 2 + chặn pattern O_O
    else if (twoLineAnalysis.unblockedTwoCount > 0 && hasHighPriorityBlock) {
      score += 12000;
      this.debugLog(`TIER 2 at (${row},${col}): Unblocked two + high priority block`);
    }
    // TIER 3: Tạo nhiều đường 2 + chặn pattern thường
    else if (hasMultipleUnblockedTwo && blockInfo.blocksPattern) {
      score += 10000;
      this.debugLog(`TIER 3 at (${row},${col}): Multiple unblocked twos + normal block`);
    }
    // TIER 4: Tạo đường 2 + chặn pattern thường
    else if (twoLineAnalysis.unblockedTwoCount > 0 && blockInfo.blocksPattern) {
      score += 8000;
      this.debugLog(`TIER 4 at (${row},${col}): Unblocked two + normal block`);
    }

    // Bonus cơ bản cho số đường 2 không bị chặn
    score += twoLineAnalysis.unblockedTwoCount * 1000;

    // Bonus cho tổng số đường 2
    score += twoLineAnalysis.totalTwoCount * 400;

    // Bonus cho đường dài hơn 2
    if (twoLineAnalysis.maxLineCount > 2) {
      score += (twoLineAnalysis.maxLineCount - 2) * 600;
    }

    // Bonus cho việc chặn patterns theo độ ưu tiên
    score += blockInfo.totalBlockScore;

    // Bonus đặc biệt cho việc chặn nhiều patterns
    if (blockInfo.blockedPatterns.length >= 2) {
      score += 500 * blockInfo.blockedPatterns.length;
    }

    // Bonus cho vị trí trung tâm
    const distanceFromCenter = this.getDistanceFromCenter(row, col);
    score += Math.max(0, 8 - distanceFromCenter) * 100;

    // Bonus cho connectivity với quân bot
    const nearbyBotPieces = this.countNearbyPieces(board, row, col, botSymbol, 2);
    score += nearbyBotPieces * 150;

    // Penalty nhẹ cho vị trí gần đối thủ (vì đang chặn nên ít penalty hơn)
    const nearbyOpponentPieces = this.countNearbyPieces(board, row, col, opponent, 2);
    score -= nearbyOpponentPieces * 25;

    return score;
  }

  /**
   * Phân tích khả năng tạo đường 2 từ một vị trí
   * @param {Array} board - Bàn cờ hiện tại
   * @param {Number} row - Hàng
   * @param {Number} col - Cột
   * @param {String} botSymbol - Ký hiệu của bot
   * @param {String} opponent - Ký hiệu của đối thủ
   * @returns {Object} Thông tin về đường 2 có thể tạo ra
   */
  analyzeTwoLineCreation(board, row, col, botSymbol, opponent) {
    let unblockedTwoCount = 0;
    let totalTwoCount = 0;
    let maxLineCount = 0;
    const twoDirections = [];

    for (const [dr, dc] of this.directions) {
      const lineInfo = this.analyzeLineFromPosition(board, row, col, dr, dc, botSymbol, opponent);

      if (lineInfo.count >= 2) {
        totalTwoCount++;
        maxLineCount = Math.max(maxLineCount, lineInfo.count);

        const directionInfo = {
          dr,
          dc,
          count: lineInfo.count,
          leftBlocked: lineInfo.leftBlocked,
          rightBlocked: lineInfo.rightBlocked,
          unblockedBothEnds: lineInfo.unblockedBothEnds,
        };

        if (lineInfo.count === 2 && lineInfo.unblockedBothEnds) {
          unblockedTwoCount++;
          directionInfo.isUnblockedTwo = true;
          this.debugLog(`Found unblocked 2-line at (${row},${col}) direction [${dr},${dc}]`);
        }

        twoDirections.push(directionInfo);
      }
    }

    return {
      unblockedTwoCount,
      totalTwoCount,
      maxLineCount,
      twoDirections,
    };
  }

  /**
   * Phân tích khả năng chặn đối thủ từ một vị trí
   * @param {Array} board - Bàn cờ hiện tại
   * @param {Number} row - Hàng
   * @param {Number} col - Cột
   * @param {String} botSymbol - Ký hiệu của bot
   * @param {String} opponent - Ký hiệu của đối thủ
   * @returns {Object} Thông tin về khả năng chặn đối thủ
   */
  analyzeOpponentBlocking(board, row, col, botSymbol, opponent) {
    let blocksOpponentLines = 0;
    let blocksStraightAndDiagonal = false;
    let blocksStraight = false;
    let blocksDiagonal = false;
    const blockedDirections = [];

    // Kiểm tra việc chặn trong 4 hướng chính
    for (const [dr, dc] of this.directions) {
      const blockInfo = this.checkDirectionBlocking(board, row, col, dr, dc, opponent);

      if (blockInfo.blocksOpponent) {
        blocksOpponentLines++;
        blockedDirections.push({
          dr,
          dc,
          opponentCount: blockInfo.opponentCount,
          isEffectiveBlock: blockInfo.isEffectiveBlock,
        });

        // Phân loại hướng: thẳng (ngang/dọc) hay chéo
        if (dr === 0 || dc === 0) {
          blocksStraight = true; // Ngang hoặc dọc
        } else {
          blocksDiagonal = true; // Chéo
        }

        this.debugLog(
          `Blocks opponent at (${row},${col}) direction [${dr},${dc}] ` +
            `with ${blockInfo.opponentCount} opponent pieces`
        );
      }
    }

    // Kiểm tra xem có chặn cả thẳng và chéo không
    blocksStraightAndDiagonal = blocksStraight && blocksDiagonal;

    return {
      blocksOpponentLines,
      blocksStraightAndDiagonal,
      blocksStraight,
      blocksDiagonal,
      blockedDirections,
    };
  }

  /**
   * Kiểm tra việc chặn đối thủ theo một hướng cụ thể
   * @param {Array} board - Bàn cờ hiện tại
   * @param {Number} row - Hàng
   * @param {Number} col - Cột
   * @param {Number} dr - Hướng hàng
   * @param {Number} dc - Hướng cột
   * @param {String} opponent - Ký hiệu đối thủ
   * @returns {Object} Thông tin về việc chặn theo hướng này
   */
  checkDirectionBlocking(board, row, col, dr, dc, opponent) {
    let opponentCount = 0;
    let blocksOpponent = false;
    let isEffectiveBlock = false;

    // Kiểm tra 2 hướng từ vị trí hiện tại
    const leftOpponents = this.countConsecutiveOpponents(board, row, col, -dr, -dc, opponent);
    const rightOpponents = this.countConsecutiveOpponents(board, row, col, dr, dc, opponent);

    opponentCount = leftOpponents + rightOpponents;

    // Coi là chặn nếu có ít nhất 1 quân đối thủ liên tiếp
    if (opponentCount >= 1) {
      blocksOpponent = true;

      // Coi là chặn hiệu quả nếu có 2+ quân hoặc chặn được đường có thể thắng
      if (opponentCount >= 2) {
        isEffectiveBlock = true;
      }
    }

    return {
      blocksOpponent,
      opponentCount,
      isEffectiveBlock,
      leftOpponents,
      rightOpponents,
    };
  }

  /**
   * Đếm số quân đối thủ liên tiếp theo một hướng
   * @param {Array} board - Bàn cờ hiện tại
   * @param {Number} row - Hàng bắt đầu
   * @param {Number} col - Cột bắt đầu
   * @param {Number} dr - Hướng hàng
   * @param {Number} dc - Hướng cột
   * @param {String} opponent - Ký hiệu đối thủ
   * @returns {Number} Số quân đối thủ liên tiếp
   */
  countConsecutiveOpponents(board, row, col, dr, dc, opponent) {
    let count = 0;

    for (let i = 1; i <= 4; i++) {
      const r = row + dr * i;
      const c = col + dc * i;

      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        if (board[r][c] === opponent) {
          count++;
        } else {
          break; // Dừng khi gặp ô trống hoặc quân khác
        }
      } else {
        break; // Ra ngoài biên
      }
    }

    return count;
  }

  /**
   * Đánh giá nước đi tạo đường 2 tốt nhất
   * @param {Number} row - Hàng
   * @param {Number} col - Cột
   * @param {Object} twoLineAnalysis - Phân tích đường 2
   * @param {Object} blockAnalysis - Phân tích chặn đối thủ
   * @param {String} botSymbol - Ký hiệu bot
   * @param {String} opponent - Ký hiệu đối thủ
   * @param {Array} board - Bàn cờ hiện tại
   * @returns {Number} Điểm số đánh giá
   */
  evaluateTwoBestMove(row, col, twoLineAnalysis, blockAnalysis, botSymbol, opponent, board) {
    let score = 0;

    // TIER 1: Ưu tiên cao nhất - Tạo 2 thẳng + chặn chéo/ngang
    if (twoLineAnalysis.unblockedTwoCount > 0 && blockAnalysis.blocksStraightAndDiagonal) {
      score += 10000; // Điểm rất cao cho combo này
      this.debugLog(`TIER 1 move at (${row},${col}): Creates unblocked 2-line + blocks straight&diagonal`);
    }

    // TIER 2: Tạo đường 2 không bị chặn + chặn ít nhất 1 hướng đối thủ
    else if (twoLineAnalysis.unblockedTwoCount > 0 && blockAnalysis.blocksOpponentLines > 0) {
      score += 5000;
      score += blockAnalysis.blocksOpponentLines * 500; // Bonus cho số hướng chặn được
      this.debugLog(
        `TIER 2 move at (${row},${col}): Creates unblocked 2-line + blocks ${blockAnalysis.blocksOpponentLines} directions`
      );
    }

    // TIER 3: Chỉ tạo nhiều đường 2 (không chặn hoặc chặn không hiệu quả)
    else {
      score += 1000;
      this.debugLog(`TIER 3 move at (${row},${col}): Creates multiple 2-lines without effective blocking`);
    }

    // Bonus cơ bản cho số đường 2 không bị chặn
    score += twoLineAnalysis.unblockedTwoCount * 800;

    // Bonus cho tổng số đường 2
    score += twoLineAnalysis.totalTwoCount * 300;

    // Bonus cho đường dài hơn 2
    if (twoLineAnalysis.maxLineCount > 2) {
      score += (twoLineAnalysis.maxLineCount - 2) * 400;
    }

    // Bonus cho chặn hiệu quả đối thủ
    const effectiveBlocks = blockAnalysis.blockedDirections.filter((d) => d.isEffectiveBlock).length;
    score += effectiveBlocks * 600;

    // Bonus cho vị trí trung tâm
    const distanceFromCenter = this.getDistanceFromCenter(row, col);
    score += Math.max(0, 8 - distanceFromCenter) * 50;

    // Bonus cho connectivity
    const nearbyBotPieces = this.countNearbyPieces(board, row, col, botSymbol, 2);
    score += nearbyBotPieces * 100;

    // Penalty cho vị trí quá gần đối thủ (trừ khi đang chặn)
    if (blockAnalysis.blocksOpponentLines === 0) {
      const nearbyOpponentPieces = this.countNearbyPieces(board, row, col, opponent, 2);
      score -= nearbyOpponentPieces * 50;
    }

    return score;
  }

  /**
   * Phân tích tiềm năng tấn công của một vị trí (tái sử dụng logic từ các hàm hiện có)
   * @param {Array} board - Bàn cờ hiện tại
   * @param {Number} row - Hàng
   * @param {Number} col - Cột
   * @param {String} botSymbol - Ký hiệu của bot
   * @param {String} opponent - Ký hiệu đối thủ
   * @returns {Object} Thông tin phân tích tấn công
   */
  analyzeAttackPotential(board, row, col, botSymbol, opponent) {
    // Sử dụng lại hàm phân tích đường 2 từ findTwoBestMove
    const twoLineAnalysis = this.analyzeTwoLineCreation(board, row, col, botSymbol, opponent);

    // Sử dụng lại hàm đếm đường tiềm năng từ countPotentialThreeLines
    const potentialLines = this.countPotentialThreeLines(board, row, col, botSymbol, opponent);

    // Sử dụng lại hàm phân tích chặn đối thủ từ findTwoBestMove
    const blockAnalysis = this.analyzeOpponentBlocking(board, row, col, botSymbol, opponent);

    // Phân tích đặc biệt: kiểm tra xem có chặn đường 3 của đối thủ không
    const blocksOpponentThreats = this.checkBlocksOpponentThreats(board, row, col, opponent, botSymbol);

    // Xác định xem có nên xem xét vị trí này không
    const shouldConsider =
      twoLineAnalysis.unblockedTwoCount > 0 || // Tạo được đường 2 không bị chặn
      potentialLines >= 2 || // Có thể tạo nhiều đường
      blockAnalysis.blocksOpponentLines > 0 || // Chặn được đối thủ
      blocksOpponentThreats; // Chặn mối đe dọa nghiêm trọng

    return {
      shouldConsider,
      potentialLines,
      twoLineAnalysis,
      blockAnalysis,
      blocksOpponentThreats,
      // Thông tin tổng hợp
      createsUnblockedTwo: twoLineAnalysis.unblockedTwoCount > 0,
      blocksOpponent: blockAnalysis.blocksOpponentLines > 0,
      blocksStraightAndDiagonal: blockAnalysis.blocksStraightAndDiagonal,
    };
  }

  /**
   * Kiểm tra xem vị trí có chặn mối đe dọa của đối thủ không
   * @param {Array} board - Bàn cờ hiện tại
   * @param {Number} row - Hàng
   * @param {Number} col - Cột
   * @param {String} opponent - Ký hiệu đối thủ
   * @param {String} botSymbol - Ký hiệu bot
   * @returns {Boolean} True nếu chặn được mối đe dọa
   */
  checkBlocksOpponentThreats(board, row, col, opponent, botSymbol) {
    // Thử đặt quân bot tại vị trí này
    board[row][col] = botSymbol;

    // Kiểm tra xem có chặn được đường 3 liên tiếp của đối thủ không
    for (const [dr, dc] of this.directions) {
      // Kiểm tra 2 hướng từ vị trí này xem có đường 3+ của đối thủ bị chặn không
      const threat1 = this.scanThreatInDirection(board, row, col, dr, dc, opponent);
      const threat2 = this.scanThreatInDirection(board, row, col, -dr, -dc, opponent);

      if (threat1.count + threat2.count >= 3) {
        board[row][col] = null; // Khôi phục
        return true;
      }
    }

    board[row][col] = null; // Khôi phục
    return false;
  }

  /**
   * Quét mối đe dọa theo một hướng cụ thể
   * @param {Array} board - Bàn cờ hiện tại
   * @param {Number} row - Hàng bắt đầu
   * @param {Number} col - Cột bắt đầu
   * @param {Number} dr - Hướng hàng
   * @param {Number} dc - Hướng cột
   * @param {String} opponent - Ký hiệu đối thủ
   * @returns {Object} Thông tin về mối đe dọa
   */
  scanThreatInDirection(board, row, col, dr, dc, opponent) {
    let count = 0;
    let gaps = 0;

    // Quét tối đa 4 ô theo hướng đã cho
    for (let i = 1; i <= 4; i++) {
      const r = row + dr * i;
      const c = col + dc * i;

      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        if (board[r][c] === opponent) {
          count++;
        } else if (board[r][c] === null && gaps === 0) {
          gaps++; // Cho phép 1 khoảng trống
        } else {
          break; // Dừng khi gặp quân bot hoặc khoảng trống thứ 2
        }
      } else {
        break; // Ra ngoài biên
      }
    }

    return { count, gaps };
  }

  /**
   * Đánh giá vị trí tấn công được cải thiện (tái sử dụng logic hiện có)
   * @param {Array} board - Bàn cờ hiện tại
   * @param {Number} row - Hàng
   * @param {Number} col - Cột
   * @param {String} botSymbol - Ký hiệu của bot
   * @param {String} opponent - Ký hiệu của địch
   * @param {Object} attackAnalysis - Kết quả phân tích từ analyzeAttackPotential
   * @returns {Number} Điểm số đánh giá
   */
  evaluateImprovedAttackPosition(board, row, col, botSymbol, opponent, attackAnalysis) {
    let score = 0;

    // Thử đặt quân bot để đánh giá
    board[row][col] = botSymbol;

    // Phân tích chi tiết về việc chặn: ưu tiên chặn tập trung hơn chặn phân tán
    let totalOpponentPiecesBlocked = 0;
    let maxOpponentInSingleDirection = 0;
    let highValueDirections = 0; // Số hướng có 2+ quân liên tiếp

    for (const direction of attackAnalysis.blockAnalysis.blockedDirections) {
      totalOpponentPiecesBlocked += direction.opponentCount;
      maxOpponentInSingleDirection = Math.max(maxOpponentInSingleDirection, direction.opponentCount);
      if (direction.opponentCount >= 2) {
        highValueDirections++;
      }
    }

    // TIER 1: Ưu tiên cao nhất - Chặn mối đe dọa nghiêm trọng + tạo cơ hội tấn công
    if (attackAnalysis.blocksOpponentThreats && attackAnalysis.createsUnblockedTwo) {
      score += 10000;
      this.debugLog(`TIER 1 at (${row},${col}): Blocks opponent threats + creates unblocked two`);
    }

    // TIER 2: Chặn đường 2+ quân liên tiếp + tạo nhiều đường 2
    else if (maxOpponentInSingleDirection >= 2 && attackAnalysis.potentialLines >= 2) {
      score += 9000;
      this.debugLog(
        `TIER 2 at (${row},${col}): Blocks ${maxOpponentInSingleDirection} consecutive pieces + creates ${attackAnalysis.potentialLines} lines`
      );
    }

    // TIER 3: Chặn mối đe dọa nghiêm trọng
    else if (attackAnalysis.blocksOpponentThreats) {
      score += 8000;
      this.debugLog(`TIER 3 at (${row},${col}): Blocks opponent threats`);
    }

    // TIER 4: Chặn đường 2+ quân liên tiếp + tạo đường 2
    else if (maxOpponentInSingleDirection >= 2 && attackAnalysis.createsUnblockedTwo) {
      score += 7500;
      this.debugLog(
        `TIER 4 at (${row},${col}): Blocks ${maxOpponentInSingleDirection} consecutive pieces + creates unblocked two`
      );
    }

    // TIER 5: Chặn đường 2+ quân liên tiếp
    else if (maxOpponentInSingleDirection >= 2) {
      score += 7000;
      this.debugLog(`TIER 5 at (${row},${col}): Blocks ${maxOpponentInSingleDirection} consecutive opponent pieces`);
    }

    // TIER 6: Tạo nhiều đường tiềm năng + chặn tổng 3+ quân phân tán
    else if (attackAnalysis.potentialLines >= 2 && totalOpponentPiecesBlocked >= 3) {
      score += 6000;
      this.debugLog(
        `TIER 6 at (${row},${col}): Multiple potential lines + blocks ${totalOpponentPiecesBlocked} scattered pieces`
      );
    }

    // TIER 7: Tạo đường 2 không bị chặn + chặn đường thẳng/chéo (1 quân)
    else if (attackAnalysis.createsUnblockedTwo && attackAnalysis.blocksStraightAndDiagonal) {
      score += 5500;
      this.debugLog(`TIER 7 at (${row},${col}): Creates unblocked two + blocks straight&diagonal`);
    }

    // TIER 8: Tạo nhiều đường tiềm năng + chặn ít nhất 1 hướng
    else if (attackAnalysis.potentialLines >= 2 && attackAnalysis.blocksOpponent) {
      score += 5000;
      this.debugLog(`TIER 8 at (${row},${col}): Multiple potential lines + blocks opponent`);
    }

    // TIER 9: Chỉ tạo đường 2 không bị chặn
    else if (attackAnalysis.createsUnblockedTwo) {
      score += 4000;
      this.debugLog(`TIER 9 at (${row},${col}): Creates unblocked two only`);
    }

    // TIER 10: Chặn tổng 3+ quân phân tán mà không tạo đường 2
    else if (totalOpponentPiecesBlocked >= 3) {
      score += 3000;
      this.debugLog(`TIER 10 at (${row},${col}): Blocks ${totalOpponentPiecesBlocked} scattered opponent pieces only`);
    }

    // TIER 11: Chỉ chặn đối thủ (1-2 quân)
    else if (attackAnalysis.blocksOpponent) {
      score += 2000;
      this.debugLog(`TIER 11 at (${row},${col}): Blocks opponent only`);
    }

    // Bonus cơ bản từ phân tích đường 2 (tái sử dụng logic từ evaluateTwoBestMove)
    score += attackAnalysis.twoLineAnalysis.unblockedTwoCount * 500;
    score += attackAnalysis.twoLineAnalysis.totalTwoCount * 200;

    // Bonus cho số đường tiềm năng
    score += attackAnalysis.potentialLines * 300;

    // Sử dụng lại logic đánh giá từ evaluateOpenThreeCreation
    const openThreeBonus = this.evaluateOpenThreeCreation(board, row, col, botSymbol, opponent);
    score += openThreeBonus;

    // Sử dụng lại logic đánh giá từ evaluateOpenTwoCreation
    const openTwoBonus = this.evaluateOpenTwoCreation(board, row, col, botSymbol, opponent);
    score += openTwoBonus;

    // Bonus cho chặn hiệu quả - ưu tiên chặn nhiều quân liên tiếp
    for (const direction of attackAnalysis.blockAnalysis.blockedDirections) {
      if (direction.opponentCount >= 2) {
        score += direction.opponentCount * 400; // Bonus cao cho chặn nhiều quân liên tiếp
      } else {
        score += direction.opponentCount * 100; // Bonus thấp cho chặn 1 quân
      }
    }

    // Sử dụng lại các hàm đánh giá khác
    const distanceFromCenter = this.getDistanceFromCenter(row, col);
    score += Math.max(0, 8 - distanceFromCenter) * 30;

    const nearbyBotPieces = this.countNearbyPieces(board, row, col, botSymbol, 2);
    score += nearbyBotPieces * 80;

    // Penalty cho vị trí quá gần đối thủ (trừ khi đang chặn)
    if (!attackAnalysis.blocksOpponent) {
      const nearbyOpponentPieces = this.countNearbyPieces(board, row, col, opponent, 2);
      score -= nearbyOpponentPieces * 40;
    }

    board[row][col] = null; // Khôi phục

    return score;
  }
}
