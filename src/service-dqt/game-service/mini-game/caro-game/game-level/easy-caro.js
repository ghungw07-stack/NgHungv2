// Expert Bot - AI chơi cờ Caro với trình độ cao cấp
// Tập hợp tất cả các thuật toán trong một class độc lập

import { BOARD_SIZE, WIN_CONDITION } from "../core/game-manager.js";

class EasyBot {
  constructor() {
    // Khởi tạo bảng transposition
    this.transpositionTable = new TranspositionTable();

    // Các hằng số cho đánh giá
    this.SYMBOLS = [null, "X", "O"];
    this.ZOBRIST_TABLE = [];

    // Khởi tạo bảng Zobrist với các giá trị ngẫu nhiên
    this.initZobristTable();

    // Cấu hình mặc định
    this.config = {
      maxThinkingTime: 8000,
      depth: 6,
      maxMoveSearch: 15,
      debug: false,
    };
  }

  /**
   * Khởi tạo bảng Zobrist
   */
  initZobristTable() {
    this.ZOBRIST_TABLE = [];
    for (let row = 0; row < BOARD_SIZE; row++) {
      this.ZOBRIST_TABLE[row] = [];
      for (let col = 0; col < BOARD_SIZE; col++) {
        this.ZOBRIST_TABLE[row][col] = [];
        for (let s = 0; s < this.SYMBOLS.length; s++) {
          // Tạo số ngẫu nhiên 32-bit
          this.ZOBRIST_TABLE[row][col][s] = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
        }
      }
    }
  }

  /**
   * Tính hash của bàn cờ sử dụng Zobrist hashing
   */
  computeZobristHash(board) {
    let hash = 0;

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const cell = board[row][col];
        const symbolIndex = cell === null ? 0 : cell === "X" ? 1 : 2;
        hash ^= this.ZOBRIST_TABLE[row][col][symbolIndex];
      }
    }

    return hash;
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
    const startTime = Date.now();
    const playerSymbol = botSymbol === "X" ? "O" : "X";
    this.transpositionTable.clear();

    // console.log(`\n=== PHÂN TÍCH LƯỢT ĐI CỦA ${botSymbol} ===`);

    if (moves.length === 0) {
      return this.getInitialMove(board);
    }
    if (moves.length === 1 && moves[0].symbol === playerSymbol) {
      return this.getSecondMove(board, moves[0].position, botSymbol);
    }

    // LOGIC NƯỚC ĐI ƯU TIÊN - Từ cao xuống thấp

    // 1. THẮNG NGAY - Ưu tiên tuyệt đối
    const winMove = this.findWinningMove(board, botSymbol);
    if (winMove !== null) {
      // console.log(`[${botSymbol}] THẮNG NGAY tại: ${this.positionToCoord(winMove)}`);
      return winMove;
    }

    // 2. CHẶN THẮNG NGAY - Ưu tiên cao nhất
    const blockMove = this.findWinningMove(board, playerSymbol);
    if (blockMove !== null) {
      // console.log(`[${botSymbol}] CHẶN THẮNG NGAY tại: ${this.positionToCoord(blockMove)}`);
      return blockMove;
    }

    // 3. CHẶN 4 QUÂN LIÊN TIẾP (Rất nguy hiểm)
    const block4Move = this.findBlockFourMove(board, playerSymbol);
    if (block4Move !== null) {
      // console.log(`[${botSymbol}] CHẶN 4 QUÂN tại: ${this.positionToCoord(block4Move)}`);
      return block4Move;
    }

    // 4. TẠO 4 QUÂN LIÊN TIẾP (Ưu tiên hơn chặn 3 thường)
    const create4Move = this.findCreateFourMove(board, botSymbol);
    if (create4Move !== null) {
      // console.log(`[${botSymbol}] TẠO 4 QUÂN tại: ${this.positionToCoord(create4Move)}`);
      return create4Move;
    }

    // 5. CHẶN 3 QUÂN MỞ HAI ĐẦU (Rất nguy hiểm - ưu tiên cao hơn tạo 4)
    const blockOpen3Move = this.findBlockOpenThreeMove(board, playerSymbol);
    if (blockOpen3Move !== null) {
      // console.log(`[${botSymbol}] CHẶN 3 MỞ HAI ĐẦU tại: ${this.positionToCoord(blockOpen3Move)}`);
      return blockOpen3Move;
    }

    // 6. CHẶN 3 QUÂN THƯỜNG (Ưu tiên cao, cải tiến: chọn hướng tốt nhất)
    const block3Move = this.findBestBlockThreeMove(board, playerSymbol, botSymbol);
    if (block3Move !== null) {
      // console.log(`[${botSymbol}] CHẶN 3 QUÂN tại: ${this.positionToCoord(block3Move)}`);
      return block3Move;
    }

    // 7. CHẶN 3 QUÂN GIÁN ĐOẠN (Pattern đặc biệt)
    const blockBroken3Move = this.findBlockBrokenThreeMove(board, playerSymbol);
    if (blockBroken3Move !== null) {
      // console.log(`[${botSymbol}] CHẶN 3 GIÁN ĐOẠN tại: ${this.positionToCoord(blockBroken3Move)}`);
      return blockBroken3Move;
    }

    // 8. TẠO 3 QUÂN MỞ HAI ĐẦU
    const createOpen3Move = this.findCreateOpenThreeMove(board, botSymbol);
    if (createOpen3Move !== null) {
      // console.log(`[${botSymbol}] TẠO 3 MỞ HAI ĐẦU tại: ${this.positionToCoord(createOpen3Move)}`);
      return createOpen3Move;
    }

    // 9. CHẶN VÀ MỞ ĐƯỜNG ĐỒNG THỜI
    const blockAndCreateMove = this.findBlockAndCreateMove(board, botSymbol, playerSymbol);
    if (blockAndCreateMove !== null) {
      // console.log(`[${botSymbol}] CHẶN VÀ TẠO ĐỒNG THỜI tại: ${this.positionToCoord(blockAndCreateMove)}`);
      return blockAndCreateMove;
    }

    // ========== CHIẾN THUẬT CAO CẤP ==========
    const strategicMove = this.findStrategicMove(board, moves, botSymbol, playerSymbol);
    if (strategicMove !== null) {
      // console.log(`[${botSymbol}] CHIẾN THUẬT CAO CẤP tại: ${this.positionToCoord(strategicMove)}`);
      return strategicMove;
    }

    const counterAttackMove = this.findCounterAttackMove(board, moves, botSymbol, playerSymbol);
    if (counterAttackMove !== null) {
      // console.log(`[${botSymbol}] PHẢN CÔNG tại: ${this.positionToCoord(counterAttackMove)}`);
      return counterAttackMove;
    }

    // console.log(`[${botSymbol}] SỬ DỤNG MINIMAX`);
    const bestMove = this.findBestMove(board, botSymbol, playerSymbol);
    return bestMove;
  }

  // =================================================================
  // CÁC HÀM CƠ BẢN VÀ TIỆN ÍCH
  // =================================================================

  /**
   * Tạo bản sao sâu của board
   */
  deepCopyBoard(board) {
    return board.map((row) => [...row]);
  }

  /**
   * Lấy một ô trống ngẫu nhiên
   */
  getRandomEmptyCell(board) {
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
   * Kiểm tra người thắng cuộc
   */
  checkWinner(board, lastRow, lastCol) {
    const symbol = board[lastRow][lastCol];
    if (!symbol) return false;

    // Kiểm tra 4 hướng: ngang, dọc, chéo xuống, chéo lên
    const directions = [
      [0, 1], // Ngang
      [1, 0], // Dọc
      [1, 1], // Chéo xuống
      [1, -1], // Chéo lên
    ];

    for (const [dr, dc] of directions) {
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
   * Lấy dãy quân cờ theo một hướng
   */
  getLine(board, row, col, dr, dc, length) {
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
  matchPattern(line, pattern) {
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
   * In thông tin debug (có thể tắt/bật)
   */
  debugLog(message) {
    if (this.config.debug) {
      // console.log(`[ExpertBotVIP] ${message}`);
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
      // console.log(`[KHỞI ĐẦU] Chọn vị trí trung tâm (${center},${center})`);
      return this.coordToPosition(center, center);
    }

    // Nếu không chọn vị trí ngẫu nhiên từ danh sách
    for (const [row, col] of centerPositions) {
      if (row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE && board[row][col] === null) {
        // console.log(`[KHỞI ĐẦU] Chọn vị trí ngẫu nhiên (${row},${col})`);
        return this.coordToPosition(row, col);
      }
    }

    // Fallback nếu các vị trí ưu tiên đều đã bị chiếm
    return this.coordToPosition(center, center);
  }

  /**
   * Nước đi thứ hai - Phản ứng với nước đi đầu của đối thủ
   */
  getSecondMove(board, firstPosition, botSymbol) {
    const firstRow = Math.floor(firstPosition / BOARD_SIZE);
    const firstCol = firstPosition % BOARD_SIZE;
    const center = Math.floor(BOARD_SIZE / 2);

    // Nếu đối thủ đánh trung tâm, đánh ở góc gần
    if (firstRow === center && firstCol === center) {
      const cornerMoves = [
        [center - 2, center - 2],
        [center - 2, center + 2],
        [center + 2, center - 2],
        [center + 2, center + 2],
      ];

      for (const [row, col] of cornerMoves) {
        if (row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE && board[row][col] === null) {
          return this.coordToPosition(row, col);
        }
      }
    }

    // Nếu đối thủ đánh gần trung tâm, đánh ở vị trí đối xứng hoặc gần đó
    const candidates = [
      [firstRow - 1, firstCol - 1],
      [firstRow - 1, firstCol + 1],
      [firstRow + 1, firstCol - 1],
      [firstRow + 1, firstCol + 1],
      [firstRow - 2, firstCol],
      [firstRow + 2, firstCol],
      [firstRow, firstCol - 2],
      [firstRow, firstCol + 2],
    ];

    for (const [row, col] of candidates) {
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
    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];

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
   * Tìm nước đi chặn 4 quân liên tiếp
   */
  findBlockFourMove(board, playerSymbol) {
    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col] !== null) continue;

        for (const [dr, dc] of directions) {
          // Kiểm tra pattern: _XXXX hoặc XXXX_
          let count = 0;
          let hasSpace = false;

          // Kiểm tra về phía trước
          for (let i = 1; i <= 4; i++) {
            const r = row + dr * i;
            const c = col + dc * i;
            if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
              if (board[r][c] === playerSymbol) {
                count++;
              } else {
                break;
              }
            } else {
              break;
            }
          }

          // Kiểm tra về phía sau
          for (let i = 1; i <= 4; i++) {
            const r = row - dr * i;
            const c = col - dc * i;
            if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
              if (board[r][c] === playerSymbol) {
                count++;
              } else {
                break;
              }
            } else {
              break;
            }
          }

          // Nếu có 4 quân liên tiếp, chặn ngay
          if (count >= 4) {
            return this.coordToPosition(row, col);
          }
        }
      }
    }

    return null;
  }

  /**
   * Tìm nước đi tạo 4 quân liên tiếp
   */
  findCreateFourMove(board, botSymbol) {
    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col] !== null) continue;

        for (const [dr, dc] of directions) {
          let count = 0;

          // Đếm quân của bot theo hướng này
          for (let i = 1; i <= 4; i++) {
            const r = row + dr * i;
            const c = col + dc * i;
            if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === botSymbol) {
              count++;
            } else {
              break;
            }
          }

          for (let i = 1; i <= 4; i++) {
            const r = row - dr * i;
            const c = col - dc * i;
            if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === botSymbol) {
              count++;
            } else {
              break;
            }
          }

          // Nếu có thể tạo 4 quân
          if (count >= 3) {
            return this.coordToPosition(row, col);
          }
        }
      }
    }

    return null;
  }

  /**
   * Tìm nước đi chặn 3 quân mở hai đầu
   */
  findBlockOpenThreeMove(board, playerSymbol) {
    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];

    const threats = []; // Lưu các mối đe dọa tìm thấy

    // Kiểm tra các pattern chuẩn của 3 quân mở hai đầu
    const patterns = [
      [null, playerSymbol, playerSymbol, playerSymbol, null], // _XXX_
      [null, playerSymbol, null, playerSymbol, playerSymbol, null], // _X_XX_
      [null, playerSymbol, playerSymbol, null, playerSymbol, null], // _XX_X_
    ];

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col] !== playerSymbol) continue; // Chỉ xét các ô có quân đối thủ

        for (const [dr, dc] of directions) {
          const line = this.getLine(board, row, col, dr, dc, 5); // Lấy 5 ô mỗi bên

          // Kiểm tra từng pattern
          for (const pattern of patterns) {
            for (let start = 0; start + pattern.length <= line.length; start++) {
              let match = true;
              for (let i = 0; i < pattern.length; i++) {
                if (pattern[i] !== null && pattern[i] !== line[start + i]) {
                  match = false;
                  break;
                }
              }

              if (match) {
                // Tìm vị trí cần chặn (vị trí của null trong pattern)
                for (let i = 0; i < pattern.length; i++) {
                  if (pattern[i] === null) {
                    const blockRow = row + dr * (start + i - 5); // Điều chỉnh vị trí từ line
                    const blockCol = col + dc * (start + i - 5);

                    if (
                      blockRow >= 0 &&
                      blockRow < BOARD_SIZE &&
                      blockCol >= 0 &&
                      blockCol < BOARD_SIZE &&
                      board[blockRow][blockCol] === null
                    ) {
                      // Tính điểm ưu tiên cho vị trí chặn
                      let priority = 100; // Ưu tiên cơ bản cho việc chặn 3 mở hai đầu

                      // Thêm ưu tiên nếu chặn gần trung tâm bàn cờ
                      const centerDist = Math.abs(blockRow - BOARD_SIZE / 2) + Math.abs(blockCol - BOARD_SIZE / 2);
                      priority += Math.max(0, 30 - centerDist * 2);

                      threats.push({
                        row: blockRow,
                        col: blockCol,
                        priority: priority,
                        pattern: pattern.map((p) => (p === null ? "_" : p)).join(""),
                      });
                    }
                  }
                }
              }
            }
          }

          // Kiểm tra thêm các trường hợp đặc biệt với khoảng trống
          const customPatterns = [
            // Các pattern phức tạp hơn có thể bổ sung ở đây
            [null, playerSymbol, playerSymbol, playerSymbol, null, null], // _XXX__
            [null, null, playerSymbol, playerSymbol, playerSymbol, null], // __XXX_
          ];

          for (const pattern of customPatterns) {
            for (let start = 0; start + pattern.length <= line.length; start++) {
              let match = true;
              for (let i = 0; i < pattern.length; i++) {
                if (pattern[i] !== null && pattern[i] !== line[start + i]) {
                  match = false;
                  break;
                }
              }

              if (match) {
                // Xác định vị trí cần chặn ưu tiên cao nhất
                let bestBlockIdx = -1;
                for (let i = 0; i < pattern.length; i++) {
                  if (pattern[i] === null) {
                    // Ưu tiên chặn ở vị trí giữa chuỗi hoặc gần các quân của đối thủ
                    if (
                      bestBlockIdx === -1 ||
                      Math.abs(i - pattern.length / 2) < Math.abs(bestBlockIdx - pattern.length / 2)
                    ) {
                      bestBlockIdx = i;
                    }
                  }
                }

                if (bestBlockIdx !== -1) {
                  const blockRow = row + dr * (start + bestBlockIdx - 5);
                  const blockCol = col + dc * (start + bestBlockIdx - 5);

                  if (
                    blockRow >= 0 &&
                    blockRow < BOARD_SIZE &&
                    blockCol >= 0 &&
                    blockCol < BOARD_SIZE &&
                    board[blockRow][blockCol] === null
                  ) {
                    threats.push({
                      row: blockRow,
                      col: blockCol,
                      priority: 90, // Ưu tiên thấp hơn pattern chuẩn
                      pattern: pattern.map((p) => (p === null ? "_" : p)).join(""),
                    });
                  }
                }
              }
            }
          }
        }
      }
    }

    // Kiểm tra thêm các trường hợp đặc biệt - Nằm giữa 2 dãy 2
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col] !== null) continue; // Chỉ xét các ô trống

        for (const [dr, dc] of directions) {
          const line = this.getLine(board, row, col, dr, dc, 4);

          // Kiểm tra pattern: XX_XX hoặc các biến thể
          let leftCount = 0;
          let rightCount = 0;

          // Đếm quân bên trái
          for (let i = 1; i <= 3; i++) {
            const idx = 4 - i; // Di chuyển từ giữa ra trái
            if (idx >= 0 && line[idx] === playerSymbol) {
              leftCount++;
            } else {
              break;
            }
          }

          // Đếm quân bên phải
          for (let i = 1; i <= 3; i++) {
            const idx = 4 + i; // Di chuyển từ giữa ra phải
            if (idx < line.length && line[idx] === playerSymbol) {
              rightCount++;
            } else {
              break;
            }
          }

          // Nếu có 2 quân mỗi bên, đây là một đường 3 mở hai đầu tiềm năng rất nguy hiểm
          if (leftCount >= 2 && rightCount >= 2) {
            threats.push({
              row: row,
              col: col,
              priority: 150, // Ưu tiên rất cao cho trường hợp này
              pattern: "XX_XX",
            });
          }
        }
      }
    }

    if (threats.length > 0) {
      // Sắp xếp theo ưu tiên giảm dần và chọn cao nhất
      threats.sort((a, b) => b.priority - a.priority);
      const bestThreat = threats[0];

      // console.log(`[CHẶN 3 MỞ HAI ĐẦU] Đã tìm thấy ${threats.length} mối đe dọa`);
      // console.log(`[CHẶN 3 MỞ HAI ĐẦU] Chọn chặn tại (${bestThreat.row}, ${bestThreat.col}) với pattern ${bestThreat.pattern}, ưu tiên ${bestThreat.priority}`);

      return this.coordToPosition(bestThreat.row, bestThreat.col);
    }

    return null;
  }

  /**
   * Tìm nước đi tạo 3 quân mở hai đầu
   */
  findCreateOpenThreeMove(board, botSymbol) {
    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col] !== null) continue;

        for (const [dr, dc] of directions) {
          let count = 0;
          let leftFree = false;
          let rightFree = false;

          // Kiểm tra khả năng tạo 3 mở
          let forwardCount = 0;
          let backwardCount = 0;

          // Đếm về phía trước
          for (let i = 1; i <= 2; i++) {
            const r = row + dr * i;
            const c = col + dc * i;
            if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === botSymbol) {
              forwardCount++;
            } else {
              break;
            }
          }

          // Đếm về phía sau
          for (let i = 1; i <= 2; i++) {
            const r = row - dr * i;
            const c = col - dc * i;
            if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === botSymbol) {
              backwardCount++;
            } else {
              break;
            }
          }

          count = forwardCount + backwardCount;

          // Kiểm tra ô trống ở hai đầu
          const leftR = row - dr * (backwardCount + 1);
          const leftC = col - dc * (backwardCount + 1);
          const rightR = row + dr * (forwardCount + 1);
          const rightC = col + dc * (forwardCount + 1);

          if (leftR >= 0 && leftR < BOARD_SIZE && leftC >= 0 && leftC < BOARD_SIZE && board[leftR][leftC] === null) {
            leftFree = true;
          }
          if (
            rightR >= 0 &&
            rightR < BOARD_SIZE &&
            rightC >= 0 &&
            rightC < BOARD_SIZE &&
            board[rightR][rightC] === null
          ) {
            rightFree = true;
          }

          // Nếu có thể tạo 3 mở
          if (count >= 2 && leftFree && rightFree) {
            return this.coordToPosition(row, col);
          }
        }
      }
    }

    return null;
  }

  /**
   * Tìm nước đi vừa chặn vừa mở đường
   */
  findBlockAndCreateMove(board, botSymbol, playerSymbol) {
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col] !== null) continue;

        let blockValue = this.evaluateBlockValue(board, row, col, playerSymbol);
        let createValue = this.evaluateCreateValue(board, row, col, botSymbol);

        // Nếu có giá trị cao ở cả chặn và tạo
        if (blockValue >= 50 && createValue >= 30) {
          return this.coordToPosition(row, col);
        }
      }
    }

    return null;
  }

  /**
   * Tìm nước đi chặn 3 quân thường - được cải thiện
   */
  findBlockThreeMove(board, playerSymbol) {
    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];
    const criticalMoves = [];

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col] !== null) continue;

        for (const [dr, dc] of directions) {
          let forwardCount = 0;
          let backwardCount = 0;
          let forwardFree = 0;
          let backwardFree = 0;

          // Đếm về phía trước
          for (let i = 1; i <= 4; i++) {
            const r = row + dr * i;
            const c = col + dc * i;
            if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
              if (board[r][c] === playerSymbol) {
                forwardCount++;
              } else if (board[r][c] === null) {
                forwardFree++;
                break;
              } else {
                break;
              }
            } else {
              break;
            }
          }

          // Đếm về phía sau
          for (let i = 1; i <= 4; i++) {
            const r = row - dr * i;
            const c = col - dc * i;
            if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
              if (board[r][c] === playerSymbol) {
                backwardCount++;
              } else if (board[r][c] === null) {
                backwardFree++;
                break;
              } else {
                break;
              }
            } else {
              break;
            }
          }

          const totalCount = forwardCount + backwardCount;
          const totalFree = forwardFree + backwardFree;

          // Ưu tiên chặn các threat nghiêm trọng
          if (totalCount >= 3) {
            // 3 quân liên tiếp -> Rất nguy hiểm
            criticalMoves.push({
              position: this.coordToPosition(row, col),
              priority: 100 + totalCount * 10 + totalFree * 5,
              type: `3-consecutive`,
            });
          } else if (totalCount >= 2 && totalFree >= 2) {
            // 2 quân có thể mở rộng -> Nguy hiểm trung bình
            criticalMoves.push({
              position: this.coordToPosition(row, col),
              priority: 50 + totalCount * 10 + totalFree * 5,
              type: `2-expandable`,
            });
          }
        }
      }
    }

    if (criticalMoves.length > 0) {
      // Sắp xếp theo độ ưu tiên giảm dần
      criticalMoves.sort((a, b) => b.priority - a.priority);
      // console.log(`[CHẶN 3 - ${criticalMoves[0].type}] Ưu tiên: ${criticalMoves[0].priority}`);
      return criticalMoves[0].position;
    }

    return null;
  }

  /**
   * Tìm nước đi chặn 3 quân gián đoạn (patterns đặc biệt)
   */
  findBlockBrokenThreeMove(board, playerSymbol) {
    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];
    const threatMoves = [];

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col] !== null) continue;

        for (const [dr, dc] of directions) {
          // Kiểm tra các pattern nguy hiểm như: XX_X, X_XX, X_X_X
          const patterns = this.checkBrokenThreePatterns(board, row, col, dr, dc, playerSymbol);

          if (patterns.length > 0) {
            let maxThreat = Math.max(...patterns.map((p) => p.threat));
            threatMoves.push({
              position: this.coordToPosition(row, col),
              threat: maxThreat,
              patterns: patterns,
            });
          }
        }
      }
    }

    if (threatMoves.length > 0) {
      threatMoves.sort((a, b) => b.threat - a.threat);
      // console.log(`[CHẶN 3 GIÁN ĐOẠN] Threat: ${threatMoves[0].threat}, Patterns: ${threatMoves[0].patterns.length}`);
      return threatMoves[0].position;
    }

    return null;
  }

  /**
   * Kiểm tra các pattern 3 quân gián đoạn
   */
  checkBrokenThreePatterns(board, row, col, dr, dc, playerSymbol) {
    const patterns = [];

    // Lấy pattern 7 ô: 3 trước + vị trí hiện tại + 3 sau
    const line = [];
    for (let i = -3; i <= 3; i++) {
      const r = row + dr * i;
      const c = col + dc * i;

      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
        if (i === 0) {
          line.push("_"); // Vị trí sẽ đánh
        } else {
          line.push(board[r][c] === playerSymbol ? "X" : board[r][c] === null ? "_" : "O");
        }
      } else {
        line.push("#"); // Ngoài biên
      }
    }

    const lineStr = line.join("");

    // Pattern XX_X hoặc X_XX (3 quân có 1 gap)
    if (lineStr.includes("XX_X") || lineStr.includes("X_XX")) {
      patterns.push({ pattern: "XX_X", threat: 80 });
    }

    // Pattern X_X_X (3 quân có 2 gap nhưng đều có thể nối)
    if (lineStr.includes("X_X_X")) {
      patterns.push({ pattern: "X_X_X", threat: 70 });
    }

    // Pattern _XXX_ (3 quân liên tiếp 2 đầu mở)
    if (lineStr.includes("_XXX_")) {
      patterns.push({ pattern: "_XXX_", threat: 90 });
    }

    // Pattern _XX_X hoặc X_XX_ (2+1 hoặc 1+2)
    if (lineStr.includes("_XX_X") || lineStr.includes("X_XX_")) {
      patterns.push({ pattern: "_XX_X", threat: 60 });
    }

    return patterns;
  }

  /**
   * Đánh giá giá trị chặn của một vị trí
   */
  evaluateBlockValue(board, row, col, playerSymbol) {
    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];
    let totalValue = 0;

    for (const [dr, dc] of directions) {
      let count = 0;
      let blocked = 0;

      // Đếm quân đối thủ và ô bị chặn
      for (let i = 1; i <= 4; i++) {
        const r = row + dr * i;
        const c = col + dc * i;
        if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
          if (board[r][c] === playerSymbol) {
            count++;
          } else if (board[r][c] !== null) {
            blocked++;
            break;
          } else {
            break;
          }
        } else {
          blocked++;
          break;
        }
      }

      for (let i = 1; i <= 4; i++) {
        const r = row - dr * i;
        const c = col - dc * i;
        if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
          if (board[r][c] === playerSymbol) {
            count++;
          } else if (board[r][c] !== null) {
            blocked++;
            break;
          } else {
            break;
          }
        } else {
          blocked++;
          break;
        }
      }

      // Tính điểm dựa trên số quân và mức độ bị chặn
      if (count >= 4) totalValue += 1000;
      else if (count >= 3 && blocked === 0) totalValue += 100;
      else if (count >= 3) totalValue += 50;
      else if (count >= 2) totalValue += 20;
    }

    return totalValue;
  }

  /**
   * Đánh giá giá trị tạo của một vị trí
   */
  evaluateCreateValue(board, row, col, botSymbol) {
    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];
    let totalValue = 0;

    for (const [dr, dc] of directions) {
      let count = 0;
      let free = 0;

      // Đếm quân của bot và ô trống
      for (let i = 1; i <= 4; i++) {
        const r = row + dr * i;
        const c = col + dc * i;
        if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
          if (board[r][c] === botSymbol) {
            count++;
          } else if (board[r][c] === null) {
            free++;
            break;
          } else {
            break;
          }
        } else {
          break;
        }
      }

      for (let i = 1; i <= 4; i++) {
        const r = row - dr * i;
        const c = col - dc * i;
        if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
          if (board[r][c] === botSymbol) {
            count++;
          } else if (board[r][c] === null) {
            free++;
            break;
          } else {
            break;
          }
        } else {
          break;
        }
      }

      // Tính điểm dựa trên số quân và ô trống
      if (count >= 3) totalValue += 80;
      else if (count >= 2 && free >= 2) totalValue += 40;
      else if (count >= 2) totalValue += 20;
      else if (count >= 1) totalValue += 10;
    }

    return totalValue;
  }

  /**
   * Chiến thuật tấn công chủ động
   */
  findAggressiveMove(board, botSymbol, playerSymbol) {
    const candidates = [];

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col] !== null) continue;

        const aggressiveValue = this.evaluateAggressiveValue(board, row, col, botSymbol, playerSymbol);

        if (aggressiveValue > 60) {
          candidates.push({
            position: this.coordToPosition(row, col),
            value: aggressiveValue,
            type: "aggressive",
          });
        }
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.value - a.value);
      // console.log("[TẤn CÔNG] Giá trị:", candidates[0].value, "- Chủ động tấn công");
      return candidates[0].position;
    }

    return null;
  }

  /**
   * Đánh giá giá trị tấn công
   */
  evaluateAggressiveValue(board, row, col, botSymbol, playerSymbol) {
    let value = 0;
    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];

    for (const [dr, dc] of directions) {
      let botCount = 0;
      let freeCount = 0;
      let connectionPotential = 0;

      // Kiểm tra khả năng mở rộng theo hướng này
      for (let i = 1; i <= 4; i++) {
        const r1 = row + dr * i;
        const c1 = col + dc * i;
        const r2 = row - dr * i;
        const c2 = col - dc * i;

        // Hướng thuận
        if (r1 >= 0 && r1 < BOARD_SIZE && c1 >= 0 && c1 < BOARD_SIZE) {
          if (board[r1][c1] === botSymbol) {
            botCount++;
            connectionPotential += 15;
          } else if (board[r1][c1] === null) {
            freeCount++;
            connectionPotential += 5;
          } else {
            break;
          }
        }

        // Hướng nghịch
        if (r2 >= 0 && r2 < BOARD_SIZE && c2 >= 0 && c2 < BOARD_SIZE) {
          if (board[r2][c2] === botSymbol) {
            botCount++;
            connectionPotential += 15;
          } else if (board[r2][c2] === null) {
            freeCount++;
            connectionPotential += 5;
          } else {
            break;
          }
        }
      }

      // Tính điểm tấn công
      if (botCount >= 2 && freeCount >= 2) {
        value += 50 + connectionPotential;
      } else if (botCount >= 1 && freeCount >= 3) {
        value += 30 + connectionPotential;
      }
    }

    return value;
  }

  /**
   * Chiến thuật đánh chéo bất ngờ
   */
  findDiagonalAttackMove(board, moves, botSymbol) {
    const diagonalDirections = [
      [1, 1],
      [1, -1],
    ];
    const candidates = [];

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col] !== null) continue;

        for (const [dr, dc] of diagonalDirections) {
          let botCount = 0;
          let freeCount = 0;

          // Kiểm tra đường chéo
          for (let i = 1; i <= 3; i++) {
            const r1 = row + dr * i;
            const c1 = col + dc * i;
            const r2 = row - dr * i;
            const c2 = col - dc * i;

            if (r1 >= 0 && r1 < BOARD_SIZE && c1 >= 0 && c1 < BOARD_SIZE) {
              if (board[r1][c1] === botSymbol) botCount++;
              else if (board[r1][c1] === null) freeCount++;
            }

            if (r2 >= 0 && r2 < BOARD_SIZE && c2 >= 0 && c2 < BOARD_SIZE) {
              if (board[r2][c2] === botSymbol) botCount++;
              else if (board[r2][c2] === null) freeCount++;
            }
          }

          // Ưu tiên vị trí có tiềm năng chéo cao
          if (botCount >= 1 && freeCount >= 2) {
            candidates.push({
              position: this.coordToPosition(row, col),
              value: 40 + botCount * 10 + freeCount * 5,
              type: "diagonal",
            });
          }
        }
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.value - a.value);
      // console.log("[CHÉO] Giá trị:", candidates[0].value, "- Tấn công chéo");
      return candidates[0].position;
    }

    return null;
  }

  /**
   * Chiến thuật đánh lạc hướng
   */
  findDeceptionMove(board, moves, botSymbol, playerSymbol) {
    // Phân tích pattern của đối thủ
    const playerPattern = this.analyzePlayerPattern(board, moves, playerSymbol);
    const candidates = [];

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col] !== null) continue;

        const deceptionValue = this.evaluateDeceptionValue(board, row, col, playerPattern, botSymbol, playerSymbol);

        if (deceptionValue > 50) {
          candidates.push({
            position: this.coordToPosition(row, col),
            value: deceptionValue,
            type: "deception",
          });
        }
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.value - a.value);
      // console.log("[LẠC HƯỚNG] Giá trị:", candidates[0].value, "- Đánh lạc hướng");
      return candidates[0].position;
    }

    return null;
  }

  /**
   * Phân tích pattern của đối thủ
   */
  analyzePlayerPattern(board, moves, playerSymbol) {
    const pattern = {
      preferredDirections: [],
    };

    // Phân tích các nước đi của đối thủ
    const playerMoves = moves.filter((move) => move.symbol === playerSymbol);

    if (playerMoves.length >= 2) {
      const directions = [
        [0, 1],
        [1, 0],
        [1, 1],
        [1, -1],
      ];
      let directionCount = [0, 0, 0, 0];

      for (let i = 1; i < playerMoves.length; i++) {
        const prev = playerMoves[i - 1];
        const curr = playerMoves[i];

        const prevRow = Math.floor(prev.position / BOARD_SIZE);
        const prevCol = prev.position % BOARD_SIZE;
        const currRow = Math.floor(curr.position / BOARD_SIZE);
        const currCol = curr.position % BOARD_SIZE;

        const dr = currRow - prevRow;
        const dc = currCol - prevCol;

        // Xác định hướng ưa thích
        for (let d = 0; d < directions.length; d++) {
          if (Math.abs(dr - directions[d][0]) <= 1 && Math.abs(dc - directions[d][1]) <= 1) {
            directionCount[d]++;
          }
        }
      }

      // Tìm hướng được ưa thích nhất
      const maxCount = Math.max(...directionCount);
      pattern.preferredDirections = directions.filter((_, i) => directionCount[i] === maxCount);
    }

    return pattern;
  }

  /**
   * Đánh giá giá trị lạc hướng
   */
  evaluateDeceptionValue(board, row, col, playerPattern, botSymbol, playerSymbol) {
    let value = 0;

    // Bonus cho việc đánh vào vùng đối thủ không chú ý
    const distanceFromPlayerMoves = this.getDistanceFromPlayerMoves(board, row, col, playerSymbol);
    if (distanceFromPlayerMoves >= 3) {
      value += 30; // Đánh xa khu vực đối thủ tập trung
    }

    // Bonus cho việc tạo threat ngầm
    const hiddenThreatValue = this.evaluateCreateValue(board, row, col, botSymbol);
    if (hiddenThreatValue > 20 && hiddenThreatValue < 50) {
      value += 25; // Threat ẩn, không quá rõ ràng
    }

    // Bonus cho việc disruption pattern đối thủ
    if (playerPattern.preferredDirections.length > 0) {
      const disruptValue = this.evaluateDisruptValue(board, row, col, playerSymbol);
      value += disruptValue * 0.5;
    }

    return value;
  }

  /**
   * Tính khoảng cách từ vị trí đến các nước đi của đối thủ
   */
  getDistanceFromPlayerMoves(board, row, col, playerSymbol) {
    let minDistance = BOARD_SIZE * 2;

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (board[r][c] === playerSymbol) {
          const distance = Math.abs(r - row) + Math.abs(c - col);
          minDistance = Math.min(minDistance, distance);
        }
      }
    }

    return minDistance;
  }

  /**
   * Chiến thuật bao vây và kết nối
   */
  findEncirclementMove(board, botSymbol, playerSymbol) {
    const candidates = [];

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col] !== null) continue;

        const encirclementValue = this.evaluateEncirclementValue(board, row, col, botSymbol, playerSymbol);

        if (encirclementValue > 55) {
          candidates.push({
            position: this.coordToPosition(row, col),
            value: encirclementValue,
            type: "encirclement",
          });
        }
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.value - a.value);
      // console.log("[BAO VÂY] Giá trị:", candidates[0].value, "- Bao vây kết nối");
      return candidates[0].position;
    }

    return null;
  }

  /**
   * Đánh giá giá trị bao vây
   */
  evaluateEncirclementValue(board, row, col, botSymbol, playerSymbol) {
    let value = 0;
    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];

    // Đánh giá khả năng kết nối với quân hiện có
    const connectionPotential = this.evaluateConnectionPotential(board, row, col, botSymbol);
    value += connectionPotential;

    // Đánh giá khả năng ngăn chặn đối thủ
    const blockPotential = this.evaluateBlockValue(board, row, col, playerSymbol);
    value += blockPotential * 0.7;

    // Bonus cho vị trí có thể tạo nhiều hướng phát triển
    let developmentDirections = 0;
    for (const [dr, dc] of directions) {
      let canDevelop = true;
      for (let i = 1; i <= 2; i++) {
        const r = row + dr * i;
        const c = col + dc * i;
        if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE || board[r][c] === playerSymbol) {
          canDevelop = false;
          break;
        }
      }
      if (canDevelop) developmentDirections++;
    }

    value += developmentDirections * 8;

    return value;
  }

  /**
   * Đánh giá tiềm năng kết nối
   */
  evaluateConnectionPotential(board, row, col, botSymbol) {
    let potential = 0;
    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];

    for (const [dr, dc] of directions) {
      let nearbyBotPieces = 0;
      let freeSpaces = 0;

      // Kiểm tra 3 ô gần nhất theo mỗi hướng
      for (let i = 1; i <= 3; i++) {
        const r1 = row + dr * i;
        const c1 = col + dc * i;
        const r2 = row - dr * i;
        const c2 = col - dc * i;

        if (r1 >= 0 && r1 < BOARD_SIZE && c1 >= 0 && c1 < BOARD_SIZE) {
          if (board[r1][c1] === botSymbol) nearbyBotPieces++;
          else if (board[r1][c1] === null) freeSpaces++;
        }

        if (r2 >= 0 && r2 < BOARD_SIZE && c2 >= 0 && c2 < BOARD_SIZE) {
          if (board[r2][c2] === botSymbol) nearbyBotPieces++;
          else if (board[r2][c2] === null) freeSpaces++;
        }
      }

      // Tính điểm kết nối
      if (nearbyBotPieces >= 1) {
        potential += 20 + nearbyBotPieces * 10 + freeSpaces * 3;
      }
    }

    return potential;
  }

  /**
   * Chiến thuật nước đôi (Double Trap)
   */
  findDoubleTrapMove(board, botSymbol, playerSymbol) {
    const candidates = [];

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col] !== null) continue;

        const doubleTrapValue = this.evaluateDoubleTrapValue(board, row, col, botSymbol, playerSymbol);

        if (doubleTrapValue > 70) {
          candidates.push({
            position: this.coordToPosition(row, col),
            value: doubleTrapValue,
            type: "doubleTrap",
          });
        }
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.value - a.value);
      // console.log("[NƯỚC ĐÔI] Giá trị:", candidates[0].value, "- Tạo bẫy kép");
      return candidates[0].position;
    }

    return null;
  }

  /**
   * Đánh giá giá trị nước đôi
   */
  evaluateDoubleTrapValue(board, row, col, botSymbol, playerSymbol) {
    let value = 0;
    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];
    let threatDirections = [];

    // Kiểm tra mỗi hướng để tìm threats
    for (const [dr, dc] of directions) {
      let botCount = 0;
      let freeCount = 0;
      let blocked = false;

      // Kiểm tra 4 ô theo mỗi hướng
      for (let i = 1; i <= 4; i++) {
        const r1 = row + dr * i;
        const c1 = col + dc * i;
        const r2 = row - dr * i;
        const c2 = col - dc * i;

        // Hướng thuận
        if (r1 >= 0 && r1 < BOARD_SIZE && c1 >= 0 && c1 < BOARD_SIZE) {
          if (board[r1][c1] === botSymbol) {
            botCount++;
          } else if (board[r1][c1] === null) {
            freeCount++;
          } else {
            blocked = true;
          }
        }

        // Hướng nghịch
        if (r2 >= 0 && r2 < BOARD_SIZE && c2 >= 0 && c2 < BOARD_SIZE) {
          if (board[r2][c2] === botSymbol) {
            botCount++;
          } else if (board[r2][c2] === null) {
            freeCount++;
          } else {
            blocked = true;
          }
        }
      }

      // Nếu có thể tạo threat ở hướng này
      if (botCount >= 2 && freeCount >= 1 && !blocked) {
        threatDirections.push({
          direction: [dr, dc],
          strength: botCount * 10 + freeCount * 5,
        });
      }
    }

    // Tính điểm dựa trên số lượng threats có thể tạo
    if (threatDirections.length >= 2) {
      value += 80; // Double threat

      // Bonus cho multiple threats
      if (threatDirections.length >= 3) {
        value += 50; // Triple threat
      }

      // Tính tổng strength
      const totalStrength = threatDirections.reduce((sum, t) => sum + t.strength, 0);
      value += totalStrength;

      // Kiểm tra xem đối thủ có thể chặn tất cả không
      const canBlockAll = this.canPlayerBlockAllThreats(board, row, col, threatDirections, botSymbol, playerSymbol);
      if (!canBlockAll) {
        value += 100; // Không thể chặn hết -> thắng chắc
      }
    }

    return value;
  }

  /**
   * Kiểm tra liệu đối thủ có thể chặn hết tất cả threats không
   */
  canPlayerBlockAllThreats(board, row, col, threatDirections, botSymbol, playerSymbol) {
    // Đặt quân bot vào vị trí để test
    board[row][col] = botSymbol;

    let blockableThreats = 0;

    for (const threat of threatDirections) {
      const [dr, dc] = threat.direction;

      // Tìm vị trí cần chặn cho threat này
      let blockPositions = [];

      // Kiểm tra các vị trí có thể chặn
      for (let i = 1; i <= 4; i++) {
        const r1 = row + dr * i;
        const c1 = col + dc * i;
        const r2 = row - dr * i;
        const c2 = col - dc * i;

        if (r1 >= 0 && r1 < BOARD_SIZE && c1 >= 0 && c1 < BOARD_SIZE && board[r1][c1] === null) {
          blockPositions.push([r1, c1]);
        }
        if (r2 >= 0 && r2 < BOARD_SIZE && c2 >= 0 && c2 < BOARD_SIZE && board[r2][c2] === null) {
          blockPositions.push([r2, c2]);
        }
      }

      // Nếu có ít nhất 1 vị trí để chặn
      if (blockPositions.length > 0) {
        blockableThreats++;
      }
    }

    // Khôi phục bàn cờ
    board[row][col] = null;

    // Đối thủ chỉ có thể chặn 1 threat mỗi lượt
    return blockableThreats <= 1;
  }

  /**
   * Phân tích tình thế trận đấu
   */
  analyzeGameState(board, moves, botSymbol, playerSymbol) {
    let botThreats = 0;
    let playerThreats = 0;
    let botPotential = 0;
    let playerPotential = 0;

    // Phân tích toàn bộ bàn cờ
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col] === null) {
          // Đánh giá potential của bot
          const botValue = this.evaluateCreateValue(board, row, col, botSymbol);
          const playerValue = this.evaluateCreateValue(board, row, col, playerSymbol);

          if (botValue > 50) botThreats++;
          if (playerValue > 50) playerThreats++;

          botPotential += botValue;
          playerPotential += playerValue;
        }
      }
    }

    const isDisadvantage = playerThreats > botThreats || playerPotential > botPotential * 1.3;

    return {
      isDisadvantage,
      botThreats,
      playerThreats,
      botPotential,
      playerPotential,
      threatDifference: playerThreats - botThreats,
    };
  }

  /**
   * Đánh giá giá trị phản công
   */
  evaluateCounterValue(board, row, col, gameState, botSymbol, playerSymbol) {
    let value = 0;

    // Đánh giá khả năng phá vỡ kế hoạch đối thủ
    const disruptValue = this.evaluateDisruptValue(board, row, col, playerSymbol);

    // Đánh giá khả năng tạo cơ hội mới
    const createValue = this.evaluateCreateValue(board, row, col, botSymbol);

    // Bonus đặc biệt khi ở thế bất lợi
    const desperateBonus = gameState.isDisadvantage ? 20 : 0;

    // Bonus cho nước đi đảo ngược tình thế
    const reversalBonus = disruptValue > 40 && createValue > 30 ? 25 : 0;

    value = disruptValue + createValue + desperateBonus + reversalBonus;

    return value;
  }

  /**
   * Đánh giá khả năng phá vỡ kế hoạch đối thủ
   */
  evaluateDisruptValue(board, row, col, playerSymbol) {
    let value = 0;
    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];

    for (const [dr, dc] of directions) {
      let playerCount = 0;
      let freeSpaces = 0;
      let pattern = [];

      // Lấy pattern 7 ô (3 trước + vị trí hiện tại + 3 sau)
      for (let i = -3; i <= 3; i++) {
        const r = row + dr * i;
        const c = col + dc * i;

        if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
          if (i === 0) {
            pattern.push("_"); // Vị trí sẽ đánh
          } else {
            pattern.push(board[r][c] === playerSymbol ? "P" : board[r][c] === null ? "_" : "B");
          }
        } else {
          pattern.push("X"); // Ngoài biên
        }
      }

      // Kiểm tra các pattern nguy hiểm của đối thủ bị phá vỡ
      const patternString = pattern.join("");

      // Pattern 3 mở: _PPP_ -> _PPB_ (phá vỡ)
      if (patternString.includes("_PPP_")) value += 50;

      // Pattern 3 + 1: PPP_ -> PPPB (chặn)
      if (patternString.includes("PPP_") || patternString.includes("_PPP")) value += 40;

      // Pattern 2 + gap + 1: PP_P -> PP_B (phá vỡ nối)
      if (patternString.includes("PP_P") || patternString.includes("P_PP")) value += 30;

      // Pattern khác
      const pCount = (patternString.match(/P/g) || []).length;
      if (pCount >= 2) value += 10 + pCount * 5;
    }

    return value;
  }

  /**
   * Tìm nước đi tốt nhất (fallback)
   */
  findBestMove(board, botSymbol, playerSymbol) {
    const candidates = [];

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col] !== null) continue;

        // Đánh giá tổng hợp
        const totalValue = this.evaluateTotalValue(board, row, col, botSymbol, playerSymbol);

        // Thêm yếu tố ngẫu nhiên nhỏ vào mỗi nước đi để tạo sự đa dạng
        const randomFactor = Math.floor(Math.random() * 15);

        candidates.push({
          position: this.coordToPosition(row, col),
          value: totalValue + randomFactor,
          baseValue: totalValue,
          randomFactor: randomFactor,
        });
      }
    }

    if (candidates.length === 0) {
      return this.getRandomEmptyCell(board);
    }

    // Sắp xếp và chọn nước đi tốt nhất
    candidates.sort((a, b) => b.value - a.value);

    // Tạo sự đa dạng bằng cách chọn ngẫu nhiên trong top 5 nước đi
    const topCount = Math.min(5, candidates.length);
    const topCandidates = candidates.slice(0, topCount);

    // Ưu tiên các nước đi có giá trị cao hơn bằng cách tính toán xác suất chọn
    // dựa trên giá trị của nước đi
    const totalWeight = topCandidates.reduce((sum, candidate) => sum + candidate.baseValue, 0);
    const weights = topCandidates.map((candidate) => candidate.baseValue / totalWeight);

    // Chọn nước đi ngẫu nhiên dựa trên trọng số
    let randomValue = Math.random();
    let cumulativeWeight = 0;
    let selectedIndex = 0;

    for (let i = 0; i < weights.length; i++) {
      cumulativeWeight += weights[i];
      if (randomValue <= cumulativeWeight) {
        selectedIndex = i;
        break;
      }
    }

    const selected = topCandidates[selectedIndex];

    return selected.position;
  }

  /**
   * Đánh giá tổng hợp một vị trí
   */
  evaluateTotalValue(board, row, col, botSymbol, playerSymbol) {
    let value = 0;

    // Giá trị tấn công
    const attackValue = this.evaluateCreateValue(board, row, col, botSymbol);

    // Giá trị phòng thủ
    const defenseValue = this.evaluateBlockValue(board, row, col, playerSymbol);

    // Giá trị vị trí chiến lược
    const strategicValue = this.evaluateStrategicPositionValue(row, col, board);

    // Trọng số
    value = attackValue * 1.2 + defenseValue * 1.0 + strategicValue * 0.8;

    return value;
  }

  /**
   * Đánh giá giá trị vị trí chiến lược
   */
  evaluateStrategicPositionValue(row, col, board) {
    let value = 0;
    const center = Math.floor(BOARD_SIZE / 2);

    // Bonus cho vị trí gần trung tâm
    const distanceFromCenter = Math.abs(row - center) + Math.abs(col - center);
    value += Math.max(0, 15 - distanceFromCenter);

    // Bonus cho vị trí có nhiều hướng mở
    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];
    let openDirections = 0;

    for (const [dr, dc] of directions) {
      let canExtend = true;

      for (let i = 1; i <= 2; i++) {
        const r1 = row + dr * i;
        const c1 = col + dc * i;
        const r2 = row - dr * i;
        const c2 = col - dc * i;

        if (
          r1 < 0 ||
          r1 >= BOARD_SIZE ||
          c1 < 0 ||
          c1 >= BOARD_SIZE ||
          r2 < 0 ||
          r2 >= BOARD_SIZE ||
          c2 < 0 ||
          c2 >= BOARD_SIZE ||
          board[r1][c1] !== null ||
          board[r2][c2] !== null
        ) {
          canExtend = false;
          break;
        }
      }

      if (canExtend) openDirections++;
    }

    value += openDirections * 5;

    return value;
  }

  /**
   * Tìm nước đi chiến thuật tổng hợp
   */
  findStrategicMove(board, moves, botSymbol, playerSymbol) {
    // Lưu lại tất cả các nước đi chiến lược tiềm năng để đánh giá
    const candidates = [];

    // 1. Chiến thuật tấn công chủ động
    const aggressiveMove = this.findAggressiveMove(board, botSymbol, playerSymbol);
    if (aggressiveMove !== null) {
      candidates.push({
        position: aggressiveMove,
        type: "aggressive",
        priority: 5,
        // Đánh giá thêm để đảm bảo nước đi này thực sự tốt
        value: this.evaluatePositionComprehensive(board, aggressiveMove, botSymbol, playerSymbol, "aggressive"),
      });
    }

    // 2. Chiến thuật đánh chéo bất ngờ
    const diagonalAttack = this.findDiagonalAttackMove(board, moves, botSymbol);
    if (diagonalAttack !== null) {
      candidates.push({
        position: diagonalAttack,
        type: "diagonal",
        priority: 4,
        value: this.evaluatePositionComprehensive(board, diagonalAttack, botSymbol, playerSymbol, "diagonal"),
      });
    }

    // 3. Chiến thuật đánh lạc hướng
    const deceptionMove = this.findDeceptionMove(board, moves, botSymbol, playerSymbol);
    if (deceptionMove !== null) {
      candidates.push({
        position: deceptionMove,
        type: "deception",
        priority: 3,
        value: this.evaluatePositionComprehensive(board, deceptionMove, botSymbol, playerSymbol, "deception"),
      });
    }

    // 4. Chiến thuật bao vây và kết nối
    const encirclementMove = this.findEncirclementMove(board, botSymbol, playerSymbol);
    if (encirclementMove !== null) {
      candidates.push({
        position: encirclementMove,
        type: "encirclement",
        priority: 4,
        value: this.evaluatePositionComprehensive(board, encirclementMove, botSymbol, playerSymbol, "encirclement"),
      });
    }

    // 5. Chiến thuật nước đôi
    const doubleTrapMove = this.findDoubleTrapMove(board, botSymbol, playerSymbol);
    if (doubleTrapMove !== null) {
      candidates.push({
        position: doubleTrapMove,
        type: "doubleTrap",
        priority: 5,
        value: this.evaluatePositionComprehensive(board, doubleTrapMove, botSymbol, playerSymbol, "doubleTrap"),
      });
    }

    // Kiểm tra độ liên quan của nước đi
    if (candidates.length > 0) {
      // Thêm yếu tố ngẫu nhiên vào mỗi ứng viên
      candidates.forEach((candidate) => {
        candidate.randomFactor = Math.floor(Math.random() * 20);
        candidate.finalValue = candidate.value + candidate.randomFactor;
      });

      // Sắp xếp theo giá trị thực tế (không chỉ dựa vào priority)
      candidates.sort((a, b) => {
        if (Math.abs(b.finalValue - a.finalValue) < 10) {
          // Nếu điểm gần bằng nhau trong phạm vi 10
          return b.priority - a.priority;
        }
        return b.finalValue - a.finalValue;
      });

      // Chọn ngẫu nhiên từ top 3 nước đi chiến lược
      const topCount = Math.min(3, candidates.length);
      const selectedIndex = Math.floor(Math.random() * topCount);
      const bestMove = candidates[selectedIndex];

      // Kiểm tra xem nước đi này có liên quan đến game state hiện tại không
      if (this.validateStrategicMove(board, bestMove.position, botSymbol, playerSymbol)) {
        return bestMove.position;
      } else {
        // console.log(`[CHIẾN THUẬT] Bỏ qua nước đi không liên quan ${this.positionToCoord(bestMove.position)}`);
        return null;
      }
    }

    return null;
  }

  /**
   * Đánh giá toàn diện một vị trí theo nhiều tiêu chí
   */
  evaluatePositionComprehensive(board, position, botSymbol, playerSymbol, moveType) {
    const row = Math.floor(position / BOARD_SIZE);
    const col = position % BOARD_SIZE;
    let value = 0;

    // Kiểm tra các tiêu chí cơ bản

    // 1. Khoảng cách tới quân gần nhất
    const proximityValue = this.evaluateProximityToExistingPieces(board, row, col);

    // 2. Giá trị tấn công
    board[row][col] = botSymbol;
    const attackValue = this.evaluateCreateValue(board, row, col, botSymbol);

    // 3. Giá trị phòng thủ
    board[row][col] = playerSymbol;
    const defenseValue = this.evaluateCreateValue(board, row, col, playerSymbol);
    board[row][col] = null;

    // 4. Đánh giá vị trí chiến lược
    const strategicValue = this.evaluatePositionStrategic(board, row, col);

    // Tính tổng giá trị với các trọng số phù hợp
    value = attackValue * 1.5 + defenseValue * 0.7 + strategicValue + proximityValue;

    return value;
  }

  /**
   * Đánh giá vị trí chiến lược
   */
  evaluatePositionStrategic(board, row, col) {
    let value = 0;

    // 1. Ưu tiên vị trí gần trung tâm bàn cờ
    const centerRow = Math.floor(BOARD_SIZE / 2);
    const centerCol = Math.floor(BOARD_SIZE / 2);
    const distanceToCenter = Math.abs(row - centerRow) + Math.abs(col - centerCol);
    value += Math.max(0, 10 - distanceToCenter);

    // 2. Ưu tiên vị trí có nhiều khoảng trống xung quanh
    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
      [0, -1],
      [-1, 0],
      [-1, -1],
      [-1, 1],
    ];
    let emptySpaces = 0;

    for (const [dr, dc] of directions) {
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === null) {
        emptySpaces++;
      }
    }

    value += emptySpaces * 3;

    return value;
  }

  /**
   * Đánh giá khoảng cách tới quân cờ gần nhất
   */
  evaluateProximityToExistingPieces(board, row, col) {
    const maxDistance = 2; // Chỉ xét trong phạm vi 2 ô
    let minDistance = Infinity;

    // Duyệt bảng tìm quân cờ gần nhất
    for (let r = Math.max(0, row - maxDistance); r <= Math.min(BOARD_SIZE - 1, row + maxDistance); r++) {
      for (let c = Math.max(0, col - maxDistance); c <= Math.min(BOARD_SIZE - 1, col + maxDistance); c++) {
        if (board[r][c] !== null) {
          const distance = Math.abs(r - row) + Math.abs(c - col);
          minDistance = Math.min(minDistance, distance);
        }
      }
    }

    // Ưu tiên các ô gần với quân cờ hiện có (nhưng không quá gần)
    if (minDistance === 1) return 10;
    if (minDistance === 2) return 5;
    return 0;
  }

  /**
   * Xác thực xem nước đi chiến lược có thực sự tốt không
   */
  validateStrategicMove(board, position, botSymbol, playerSymbol) {
    const row = Math.floor(position / BOARD_SIZE);
    const col = position % BOARD_SIZE;

    // Kiểm tra xem nước đi này có liên quan đến thế cờ hiện tại không

    // 1. Phải gần với ít nhất một quân cờ hiện có
    let hasNearbyPiece = false;
    for (let r = Math.max(0, row - 3); r <= Math.min(BOARD_SIZE - 1, row + 3); r++) {
      for (let c = Math.max(0, col - 3); c <= Math.min(BOARD_SIZE - 1, col + 3); c++) {
        if (board[r][c] !== null) {
          hasNearbyPiece = true;
          break;
        }
      }
      if (hasNearbyPiece) break;
    }

    if (!hasNearbyPiece) return false;

    // 2. Phải tạo được giá trị tấn công hoặc phòng thủ
    board[row][col] = botSymbol;
    const attackValue = this.evaluateCreateValue(board, row, col, botSymbol);
    board[row][col] = playerSymbol;
    const defenseValue = this.evaluateCreateValue(board, row, col, playerSymbol);
    board[row][col] = null;

    // Nếu không tạo được giá trị đáng kể, bỏ qua nước đi này
    if (attackValue < 20 && defenseValue < 20) return false;

    return true;
  }

  /**
   * Chiến thuật hóa giải và đảo ngược tình thế
   */
  findCounterAttackMove(board, moves, botSymbol, playerSymbol) {
    // Phân tích tình thế hiện tại
    const gameState = this.analyzeGameState(board, moves, botSymbol, playerSymbol);

    if (gameState.isDisadvantage) {
      const candidates = [];

      for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          if (board[row][col] !== null) continue;

          const counterValue = this.evaluateCounterValue(board, row, col, gameState, botSymbol, playerSymbol);

          if (counterValue > 45) {
            candidates.push({
              position: this.coordToPosition(row, col),
              value: counterValue,
              type: "counter",
            });
          }
        }
      }

      if (candidates.length > 0) {
        candidates.sort((a, b) => b.value - a.value);
        // console.log("[HÓA GIẢI] Giá trị:", candidates[0].value, "- Đảo ngược tình thế");
        return candidates[0].position;
      }
    }

    return null;
  }

  /**
   * Chặn 3 nhưng chọn hướng tối ưu cho tấn công
   */
  findBestBlockThreeMove(board, playerSymbol, botSymbol) {
    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];
    let best = null;
    let bestScore = -Infinity;
    const candidates = []; // Debug: lưu tất cả ứng viên
    const threeLinesFound = []; // Lưu các đường 3 quân đã tìm thấy

    // Hàm kiểm tra nếu một đường 3 quân tạo thành mối đe dọa thực sự
    const isRealThreeThreat = (line) => {
      // Pattern: null-playerSymbol-playerSymbol-playerSymbol-null
      // hoặc các biến thể có chính xác 3 quân liên tiếp
      let playerCount = 0;
      let maxConsecutiveCount = 0;
      let openEnds = 0;
      let consecutiveStart = -1;

      // Tìm đoạn liên tiếp dài nhất của người chơi
      for (let i = 0; i < line.length; i++) {
        if (line[i] === playerSymbol) {
          if (playerCount === 0) {
            consecutiveStart = i;
          }
          playerCount++;
          maxConsecutiveCount = Math.max(maxConsecutiveCount, playerCount);
        } else {
          // Kiểm tra hai đầu mở
          if (playerCount >= 3 && playerCount === maxConsecutiveCount) {
            // Kiểm tra đầu trái
            if (consecutiveStart > 0 && line[consecutiveStart - 1] === null) {
              openEnds++;
            }
            // Kiểm tra đầu phải
            if (i < line.length && line[i] === null) {
              openEnds++;
            }
          }
          playerCount = 0;
        }
      }

      // Kiểm tra nếu chuỗi kết thúc ở cuối dòng
      if (playerCount >= 3 && playerCount === maxConsecutiveCount) {
        if (consecutiveStart > 0 && line[consecutiveStart - 1] === null) {
          openEnds++;
        }
      }

      return maxConsecutiveCount === 3 && openEnds > 0;
    };

    // Bước 1: Tìm tất cả các đường 3 quân của đối thủ trong bảng
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col] !== playerSymbol) continue;

        // Kiểm tra 4 hướng
        for (const [dr, dc] of directions) {
          // Xây dựng line 9 ô (4 mỗi bên + ô hiện tại)
          const line = this.getLine(board, row, col, dr, dc, 4);

          // Chỉ xét các đường có ít nhất 3 quân playerSymbol liên tiếp
          let count = 0;
          let maxCount = 0;
          let maxStartIdx = -1;

          // Tìm dãy dài nhất
          for (let i = 0; i < line.length; i++) {
            if (line[i] === playerSymbol) {
              if (count === 0) maxStartIdx = i;
              count++;
              if (count > maxCount) {
                maxCount = count;
              }
            } else {
              // Nếu tìm thấy dãy 3 quân liên tiếp khi gặp ký tự khác
              if (count === 3) {
                // Kiểm tra xem đây có phải là đoạn liên tục không bị gián đoạn
                const startIdx = maxStartIdx;
                const endIdx = i - 1;

                // Kiểm tra hai đầu mở
                const hasLeftOpen = startIdx > 0 && line[startIdx - 1] === null;
                const hasRightOpen = i < line.length && line[i] === null;

                if (hasLeftOpen || hasRightOpen) {
                  // Tính toán vị trí thực tế các quân và vị trí chặn
                  const baseRow = row - dr * 4;
                  const baseCol = col - dc * 4;

                  const threatInfo = {
                    startPos: this.coordToPosition(baseRow + dr * startIdx, baseCol + dc * startIdx),
                    endPos: this.coordToPosition(baseRow + dr * endIdx, baseCol + dc * endIdx),
                    hasLeftOpen,
                    hasRightOpen,
                    blockLeftPos: hasLeftOpen
                      ? this.coordToPosition(baseRow + dr * (startIdx - 1), baseCol + dc * (startIdx - 1))
                      : null,
                    blockRightPos: hasRightOpen ? this.coordToPosition(baseRow + dr * i, baseCol + dc * i) : null,
                    openEndsCount: (hasLeftOpen ? 1 : 0) + (hasRightOpen ? 1 : 0), // Số đầu mở
                  };

                  threeLinesFound.push(threatInfo);
                }
              }
              count = 0;
            }
          }

          // Kiểm tra trường hợp dãy kết thúc ở cuối line
          if (count === 3) {
            const startIdx = maxStartIdx;
            const endIdx = line.length - 1;

            // Kiểm tra đầu mở bên trái
            const hasLeftOpen = startIdx > 0 && line[startIdx - 1] === null;

            if (hasLeftOpen) {
              // Tính toán vị trí thực tế các quân và vị trí chặn
              const baseRow = row - dr * 4;
              const baseCol = col - dc * 4;

              const threatInfo = {
                startPos: this.coordToPosition(baseRow + dr * startIdx, baseCol + dc * startIdx),
                endPos: this.coordToPosition(baseRow + dr * endIdx, baseCol + dc * endIdx),
                hasLeftOpen: true,
                hasRightOpen: false,
                blockLeftPos: this.coordToPosition(baseRow + dr * (startIdx - 1), baseCol + dc * (startIdx - 1)),
                blockRightPos: null,
                openEndsCount: 1, // Chỉ có 1 đầu mở
              };

              threeLinesFound.push(threatInfo);
            }
          }
        }
      }
    }

    const potentialBlocks = new Set();

    // Thêm vị trí chặn từ các đường 3 đã tìm thấy
    threeLinesFound.forEach((threat) => {
      if (threat.blockLeftPos !== null) potentialBlocks.add(threat.blockLeftPos);
      if (threat.blockRightPos !== null) potentialBlocks.add(threat.blockRightPos);
    });

    // Đánh giá từng vị trí chặn
    const topCandidates = [];

    potentialBlocks.forEach((pos) => {
      const row = Math.floor(pos / BOARD_SIZE);
      const col = pos % BOARD_SIZE;

      if (board[row][col] !== null) return; // Bỏ qua nếu đã có quân

      // Kiểm tra xem vị trí này chặn bao nhiêu đường 3
      const blockedThreats = threeLinesFound.filter(
        (threat) => threat.blockLeftPos === pos || threat.blockRightPos === pos
      );

      if (blockedThreats.length === 0) return; // Bỏ qua nếu không chặn đường nào

      // Xác thực lại vị trí chặn bằng cách kiểm tra trên bàn cờ thực tế
      let isValidBlock = false;
      let totalOpenEnds = 0;
      for (const threat of blockedThreats) {
        // Lấy vị trí của 3 quân trong đường
        const startRow = Math.floor(threat.startPos / BOARD_SIZE);
        const startCol = threat.startPos % BOARD_SIZE;
        const endRow = Math.floor(threat.endPos / BOARD_SIZE);
        const endCol = threat.endPos % BOARD_SIZE;

        // Xác định hướng
        const dr = startRow === endRow ? 0 : endRow > startRow ? 1 : -1;
        const dc = startCol === endCol ? 0 : endCol > startCol ? 1 : -1;

        // Kiểm tra xem có đúng 3 quân liên tiếp không
        let count = 0;
        for (let i = 0; i <= 2; i++) {
          const checkRow = startRow + i * dr;
          const checkCol = startCol + i * dc;
          if (checkRow >= 0 && checkRow < BOARD_SIZE && checkCol >= 0 && checkCol < BOARD_SIZE) {
            if (board[checkRow][checkCol] === playerSymbol) {
              count++;
            }
          }
        }

        if (count === 3) {
          isValidBlock = true;
          totalOpenEnds += threat.openEndsCount;
        }
      }

      if (!isValidBlock) return; // Bỏ qua nếu không phải vị trí chặn hợp lệ

      // Đánh giá tiềm năng tấn công nếu chặn tại đây
      board[row][col] = botSymbol;

      // CẢI THIỆN: Tính điểm chặn 3 quân
      // Ưu tiên chặn các đường có 2 đầu mở so với các đường chỉ có 1 đầu mở
      const twoEndsOpenThreats = blockedThreats.filter((threat) => threat.openEndsCount === 2);
      const oneEndOpenThreats = blockedThreats.filter((threat) => threat.openEndsCount === 1);

      // Đường 2 đầu mở có giá trị gấp 3 lần đường 1 đầu mở
      const blockValue = twoEndsOpenThreats.length * 150 + oneEndOpenThreats.length * 50;

      // Đánh giá giá trị tấn công của nước đi
      const attackScore = this.evaluateCreateValue(board, row, col, botSymbol);

      // Thêm điểm thưởng cho việc tạo ra nhiều hướng tấn công
      const multiDirectionBonus = this.evaluateMultiDirectionPotential(board, row, col, botSymbol);

      // Thêm điểm thưởng cho việc chặn ở vị trí có thể tạo ra đòn phản công
      const counterAttackBonus = this.evaluateCounterAttackPotential(board, row, col, botSymbol, playerSymbol);

      board[row][col] = null;

      // Thêm yếu tố ngẫu nhiên nhỏ để tạo sự đa dạng trong quyết định
      const randomFactor = Math.floor(Math.random() * 10);

      // Tổng điểm = giá trị chặn + giá trị tấn công + yếu tố ngẫu nhiên
      const totalScore = blockValue + attackScore + multiDirectionBonus + counterAttackBonus + randomFactor;

      // Debug: lưu thông tin ứng viên
      const candidate = {
        pos,
        coord: `(${row}, ${col})`,
        score: totalScore,
        blockValue,
        twoEndsOpenThreats: twoEndsOpenThreats.length,
        oneEndOpenThreats: oneEndOpenThreats.length,
        attackScore,
        multiDirectionBonus,
        counterAttackBonus,
        randomFactor,
        blockedThreatsCount: blockedThreats.length,
        blockedThreats: blockedThreats.map((t) => `${t.startPos + 1}-${t.endPos + 1}`),
      };

      candidates.push(candidate);

      // Lưu lại các ứng viên top để sau đó chọn ngẫu nhiên trong số chúng
      if (totalScore > bestScore - 20) {
        // Lưu các ứng viên có điểm gần với điểm cao nhất
        topCandidates.push(candidate);
      }

      // Ưu tiên score cao nhất
      if (totalScore > bestScore) {
        bestScore = totalScore;
        best = pos;
      }
    });

    // Debug: in ra tất cả ứng viên
    if (candidates.length > 0) {
      // console.log(`[DEBUG CHẶN 3] Các ứng viên:`, candidates.sort((a, b) => b.score - a.score).slice(0, 5));
    }

    if (topCandidates.length > 0) {
      // Chọn ngẫu nhiên trong top 3 nước đi tốt nhất để tạo đa dạng
      const numTopChoices = Math.min(3, topCandidates.length);
      const topChoice = topCandidates[Math.floor(Math.random() * numTopChoices)];
      return topChoice.pos;
    }

    if (best !== null) {
      return best;
    }
    return null;
  }

  /**
   * Đánh giá tiềm năng tạo ra nhiều hướng tấn công từ một vị trí
   */
  evaluateMultiDirectionPotential(board, row, col, botSymbol) {
    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];
    let activeDirections = 0;
    let totalPotential = 0;

    for (const [dr, dc] of directions) {
      let canExtend = false;
      let extensionCount = 0;

      // Kiểm tra cả 2 hướng
      for (let direction of [1, -1]) {
        for (let i = 1; i <= 3; i++) {
          const r = row + dr * i * direction;
          const c = col + dc * i * direction;
          if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
            if (board[r][c] === null) {
              canExtend = true;
              extensionCount++;
            } else if (board[r][c] === botSymbol) {
              extensionCount += 2; // Quân của mình có giá trị cao hơn
            } else {
              break; // Bị chặn bởi đối thủ
            }
          } else {
            break; // Ra ngoài bảng
          }
        }
      }

      if (canExtend && extensionCount >= 2) {
        activeDirections++;
        totalPotential += extensionCount;
      }
    }

    // Thưởng cao cho vị trí có nhiều hướng phát triển
    return activeDirections * 15 + totalPotential * 5;
  }

  /**
   * Đánh giá tiềm năng phản công
   */
  evaluateCounterAttackPotential(board, row, col, botSymbol, playerSymbol) {
    const directions = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];
    let counterValue = 0;

    // Đặt quân tạm thời để đánh giá
    board[row][col] = botSymbol;

    for (const [dr, dc] of directions) {
      let myCount = 1; // Bắt đầu với quân vừa đặt
      let openEnds = 0;

      // Đếm về phía trước
      let i = 1;
      while (i <= 4) {
        const r = row + dr * i;
        const c = col + dc * i;
        if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
          if (board[r][c] === botSymbol) {
            myCount++;
            i++;
          } else if (board[r][c] === null) {
            openEnds++;
            break;
          } else {
            break;
          }
        } else {
          break;
        }
      }

      // Đếm về phía sau
      i = 1;
      while (i <= 4) {
        const r = row - dr * i;
        const c = col - dc * i;
        if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE) {
          if (board[r][c] === botSymbol) {
            myCount++;
            i++;
          } else if (board[r][c] === null) {
            openEnds++;
            break;
          } else {
            break;
          }
        } else {
          break;
        }
      }

      // Tính điểm dựa trên số quân và số đầu mở
      if (myCount >= 3 && openEnds >= 1) {
        counterValue += 50; // Có thể tạo 4 ngay lập tức
      } else if (myCount >= 2 && openEnds >= 2) {
        counterValue += 30; // 3 mở 2 đầu
      } else if (myCount >= 2) {
        counterValue += 15; // 3 mở 1 đầu
      }
    }

    board[row][col] = null; // Gỡ quân tạm thời
    return counterValue;
  }
}

// TranspositionTable class
class TranspositionTable {
  constructor(maxSize = 1000000) {
    this.table = new Map();
    this.maxSize = maxSize;
  }

  // Lưu kết quả vào bảng
  store(hash, depth, score, type, bestMove, alpha, beta) {
    // Nếu bảng đầy, xóa bớt 10% entries cũ nhất
    if (this.table.size >= this.maxSize) {
      const entries = Array.from(this.table.entries());
      // Lấy 90% entries mới nhất
      const newEntries = entries.slice(Math.floor(this.maxSize * 0.1));
      this.table = new Map(newEntries);
    }

    this.table.set(hash, {
      depth,
      score,
      type, // 'exact', 'lower', hoặc 'upper'
      bestMove,
      alpha,
      beta,
    });
  }

  // Tìm kiếm kết quả trong bảng
  lookup(hash, depth, alpha, beta) {
    const entry = this.table.get(hash);
    if (!entry || entry.depth < depth) {
      return null;
    }

    if (entry.type === "exact") {
      return entry;
    } else if (entry.type === "lower" && entry.score <= alpha) {
      return entry;
    } else if (entry.type === "upper" && entry.score >= beta) {
      return entry;
    }

    return null;
  }

  // Xóa bảng khi bắt đầu ván mới
  clear() {
    this.table.clear();
  }

  // Lấy kích thước hiện tại
  size() {
    return this.table.size;
  }
}

// Export để sử dụng từ bên ngoài
export default EasyBot;
