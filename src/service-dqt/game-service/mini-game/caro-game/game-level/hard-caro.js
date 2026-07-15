import { BOARD_SIZE } from "../core/game-manager.js";
// Constants
const Value = {
  SIZE: BOARD_SIZE,
  AI_VALUE: 2,
  USER_VALUE: 1,
  MAX_NUM_OF_HIGHEST_CELL_LIST: 15,
  MAX_DEPTH: 8,
};

export default class HardCaro {
  constructor() {
    this.nextX = 0;
    this.nextY = 0;
    this.rand = Math.random;

    // Khởi tạo state
    this.root = new State();

    // Khởi tạo các hướng đi
    this.directions = [
      [0, 1], // ngang
      [1, 0], // dọc
      [1, 1], // chéo chính
      [1, -1], // chéo phụ
    ];

    this.eightDirections = [
      [0, -1], // Trái
      [0, 1], // Phải
      [-1, 0], // Trên
      [1, 0], // Dưới
      [-1, -1], // Trên-trái
      [-1, 1], // Trên-phải
      [1, -1], // Dưới-trái
      [1, 1], // Dưới-phải
    ];

    // Khởi tạo các pattern và điểm
    this.point = [
      4, 4, 4, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 500, 500, 500, 500, 500, 500, 500, 1000, 1000, 1000, 1000, 1000, 1000,
      100000,
    ];

    this.caseUser = [
      "11001",
      "10101",
      "10011",
      "00110",
      "01010",
      "01100",
      "11100",
      "11010",
      "10110",
      "01101",
      "01011",
      "00111",
      "01110",
      "011100",
      "011010",
      "010110",
      "001110",
      "1010101",
      "1011001",
      "1001101",
      "01111",
      "10111",
      "11011",
      "11101",
      "11101",
      "11110",
      "11111",
    ];

    this.caseAI = [
      "22002",
      "20202",
      "20022",
      "00220",
      "02020",
      "02200",
      "22200",
      "22020",
      "20220",
      "02202",
      "02022",
      "00222",
      "02220",
      "022200",
      "022020",
      "020220",
      "002220",
      "2020202",
      "2022002",
      "2002202",
      "02222",
      "20222",
      "22022",
      "22202",
      "22202",
      "22220",
      "22222",
    ];

    this.defenseScore = [0, 1, 9, 81, 729, 6534];
    this.attackScore = [0, 3, 24, 192, 1536, 12288];
    this.evalState = Array(Value.SIZE)
      .fill(null)
      .map(() => Array(Value.SIZE).fill(0));
  }

  /**
   * Quét toàn bộ board và trả về danh sách các moves đã đi
   * @param {Array} board - Bàn cờ hiện tại với ký hiệu X/O
   * @returns {Array} moves - Danh sách các nước đã đi dạng { position, symbol }
   */
  getMoves(board) {
    const moves = [];
    for (let row = 0; row < Value.SIZE; row++) {
      for (let col = 0; col < Value.SIZE; col++) {
        const cell = board[row][col];
        if (cell === "X" || cell === "O") {
          moves.push({ position: row * Value.SIZE + col, symbol: cell });
        }
      }
    }
    return moves;
  }

  /**
   * Nước đi đầu tiên - Chọn vị trí trung tâm
   */
  getInitialMove(board) {
    const center = Math.floor(Value.SIZE / 2);
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
      if (row >= 0 && row < Value.SIZE && col >= 0 && col < Value.SIZE && board[row][col] === null) {
        return this.coordToPosition(row, col);
      }
    }

    // Fallback nếu các vị trí ưu tiên đều đã bị chiếm
    return this.coordToPosition(center, center);
  }

  /**
   * Nước đi thứ hai - Phản ứng với nước đi đầu của đối thủ
   * @param {Array} board - Bàn cờ hiện tại
   * @param {number} firstPosition - Vị trí nước đi đầu tiên của đối thủ
   * @returns {number} position - Vị trí nước đi thứ hai
   */
  getSecondMove(board, firstPosition) {
    const firstRow = Math.floor(firstPosition / Value.SIZE);
    const firstCol = firstPosition % Value.SIZE;

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

    //Xáo trộn ngẫu nhiên vị trí
    for (let i = adjacent.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [adjacent[i], adjacent[j]] = [adjacent[j], adjacent[i]];
    }

    for (const [row, col] of adjacent) {
      if (row >= 0 && row < Value.SIZE && col >= 0 && col < Value.SIZE && board[row][col] === null) {
        return this.coordToPosition(row, col);
      }
    }
  }

  getThirdMove(board, botSymbol, moves) {
    if (botSymbol !== "X") return null;

    const firstMove = moves.find((move) => move.symbol === botSymbol);
    if (!firstMove) return null;

    const list = [];

    const [firstRow, firstCol] = this.positionToCoord(firstMove.position);
    const playerSymbol = botSymbol === "X" ? "O" : "X";

    for (const [dx, dy] of this.eightDirections) {
      const row = firstRow + dx;
      const col = firstCol + dy;
      if (this.checkPositionInBoard(row, col) && board[row][col] === playerSymbol) {
        const isLRTU = Math.abs(dx) !== Math.abs(dy);

        if (isLRTU) {
          if (dx === 0) {
            list.push(this.coordToPosition(row + 1, col), this.coordToPosition(row - 1, col));
          } else {
            list.push(this.coordToPosition(row, col + 1), this.coordToPosition(row, col - 1));
          }
        } else {
          const [newRow1, newCol1] =
            dx === dy
              ? dx === -1
                ? [row - dx + 1, col]
                : [row, col - dy - 1]
              : dx === -1
              ? [row - dx + 1, col]
              : [row - dx - 1, col];
          const [newRow2, newCol2] =
            dx === dy
              ? dx === -1
                ? [row, col - dy + 1]
                : [row - dx - 1, col]
              : dx === -1
              ? [row, col - dy - 1]
              : [row, col - dy + 1];

          list.push(this.coordToPosition(newRow1, newCol1), this.coordToPosition(newRow2, newCol2));
        }

        return list.length > 0 ? list[Math.floor(Math.random() * list.length)] : null;
      }
    }

    const twoMove = moves.find((move) => move.symbol === playerSymbol);
    const [twoRow, twoCol] = this.positionToCoord(twoMove.position);

    if (firstCol === twoCol) {
      if (firstRow < twoRow) {
        list.push(this.coordToPosition(firstRow + 1, firstCol + 1));
        list.push(this.coordToPosition(firstRow + 1, firstCol - 1));
      } else {
        list.push(this.coordToPosition(firstRow - 1, firstCol + 1));
        list.push(this.coordToPosition(firstRow - 1, firstCol - 1));
      }
    } else if (firstRow === twoRow) {
      if (firstCol < twoCol) {
        list.push(this.coordToPosition(firstRow + 1, firstCol + 1));
        list.push(this.coordToPosition(firstRow - 1, firstCol + 1));
      } else {
        list.push(this.coordToPosition(firstRow + 1, firstCol - 1));
        list.push(this.coordToPosition(firstRow - 1, firstCol - 1));
      }
    }

    if (list.length > 0) return list[Math.floor(Math.random() * list.length)];

    return null;
  }

  /**
   * Tính toán nước đi tối ưu
   * @param {Array} board - Bàn cờ hiện tại
   * @param {string} botSymbol - Ký tự của bot (X hoặc O)
   * @param {Array} moves - Danh sách các nước đã đi
   * @returns {number} position - Vị trí của nước đi tối ưu
   */
  makeMove(board, botSymbol, moves) {
    // Xác định playerSymbol (cờ của người chơi) dựa trên botSymbol

    if (!moves) moves = this.getMoves(board);

    // 0. Khởi Tạo Nước Đi Đầu Tiên Và Thứ Hai
    if (moves.length === 0) return this.getInitialMove(board);
    if (moves.length === 1) return this.getSecondMove(board, moves[0].position);
    if (moves.length === 2) {
      const thirdMove = this.getThirdMove(board, botSymbol, moves);
      if (thirdMove) return thirdMove;
    }

    // Chuyển đổi board với botSymbol được xác định rõ ràng
    const convertedBoard = this.convertBoard(board, botSymbol);
    this.root = new State(convertedBoard);

    // 1. Kiểm tra xem bot có thể tạo ra đường 5 liên tiếp không
    const winMove = this.checkWinMove();
    if (winMove !== null) {
      console.log("=> Bot tìm thấy nước đi thắng cuộc!");
      const [row, col] = this.positionToCoord(winMove);
      this.nextX = row;
      this.nextY = col;
      return winMove;
    }

    // Tính toán nước đi tiếp theo
    const choice = this.alphaBeta();
    if (!choice) {
      console.log("~ Lỗi! Không tìm thấy nước đi!");
      return null;
    }

    this.nextX = choice.getX();
    this.nextY = choice.getY();

    // Chuyển đổi vị trí thành position
    return this.coordToPosition(this.nextX, this.nextY);
  }

  /**
   * Kiểm tra xem bot có thể tạo ra đường 5 liên tiếp không
   * @param {Array} board - Bàn cờ hiện tại
   * @param {string} botSymbol - Ký hiệu của bot (X hoặc O)
   * @returns {number|null} position - Vị trí để tạo đường 5, null nếu không có
   */
  checkWinMove() {
    // Kiểm tra tất cả các ô trống
    for (let row = 0; row < Value.SIZE; row++) {
      for (let col = 0; col < Value.SIZE; col++) {
        if (this.root.getState()[row][col] === 0) {
          // Thử đánh vào ô này
          this.update(row, col, Value.AI_VALUE);

          // Kiểm tra xem có tạo ra đường 5 không
          if (this.checkWinInBoard(Value.AI_VALUE)) return this.coordToPosition(row, col);

          // Khôi phục lại ô trống
          this.update(row, col, 0);
        }
      }
    }

    return null;
  }

  /**
   * Kiểm tra xem có đường 5 liên tiếp trong board không
   * @param {Array} board - Bàn cờ với hệ số nội bộ
   * @param {number} player - Người chơi cần kiểm tra (AI_VALUE hoặc USER_VALUE)
   * @returns {boolean} true nếu có đường 5
   */
  checkWinInBoard(player) {
    for (let row = 0; row < Value.SIZE; row++) {
      for (let col = 0; col < Value.SIZE; col++) {
        if (this.root.getState()[row][col] === player) {
          for (const [dx, dy] of this.directions) {
            let count = 1;

            // Đếm về phía trước
            for (let i = 1; i < 5; i++) {
              const newRow = row + dx * i;
              const newCol = col + dy * i;
              if (newRow < 0 || newRow >= Value.SIZE || newCol < 0 || newCol >= Value.SIZE) break;
              if (this.root.getState()[newRow][newCol] === player) count++;
              else break;
            }

            // Đếm về phía sau
            for (let i = 1; i < 5; i++) {
              const newRow = row - dx * i;
              const newCol = col - dy * i;
              if (newRow < 0 || newRow >= Value.SIZE || newCol < 0 || newCol >= Value.SIZE) break;
              if (this.root.getState()[newRow][newCol] === player) count++;
              else break;
            }

            if (count >= 5) return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Chuyển đổi board từ ký hiệu X/O sang hệ số nội bộ
   * @param {Array} board - Bàn cờ với ký hiệu X/O
   * @param {string} botSymbol - Ký hiệu của bot (X hoặc O)
   * @returns {Array} convertedBoard - Bàn cờ với hệ số nội bộ
   */
  convertBoard(board, botSymbol) {
    const convertedBoard = Array(Value.SIZE)
      .fill(null)
      .map(() => Array(Value.SIZE).fill(0));

    for (let i = 0; i < Value.SIZE; i++) {
      for (let j = 0; j < Value.SIZE; j++) {
        const cell = board[i][j];
        if (cell === botSymbol) convertedBoard[i][j] = Value.AI_VALUE;
        else if (cell === "X" || cell === "O") convertedBoard[i][j] = Value.USER_VALUE;
      }
    }
    return convertedBoard;
  }

  coordToPosition(row, col) {
    return row * Value.SIZE + col;
  }

  positionToCoord(position) {
    return [Math.floor(position / Value.SIZE), position % Value.SIZE];
  }

  checkPositionInBoard(row, col) {
    return row >= 0 && row < Value.SIZE && col >= 0 && col < Value.SIZE;
  }

  isClickable(x, y) {
    return this.root.isClickable(x, y);
  }

  checkWinner(player) {
    return this.root.checkWinner(player);
  }

  isOver() {
    return this.root.isOver();
  }

  evaluateState() {
    let rem = ";";
    const cell = this.root.getState();

    // Check hàng và cột
    for (let i = 0; i < Value.SIZE; i++) {
      for (let j = 0; j < Value.SIZE; j++) {
        rem += cell[i][j];
      }
      rem += ";";
      for (let j = 0; j < Value.SIZE; j++) {
        rem += cell[j][i];
      }
      rem += ";";
    }

    // Check nửa trên đường chéo phải
    for (let i = 0; i < Value.SIZE - 4; i++) {
      for (let j = 0; j < Value.SIZE - i; j++) {
        rem += cell[j][i + j];
      }
      rem += ";";
    }

    // Check nửa dưới đường chéo phải
    for (let i = Value.SIZE - 5; i > 0; i--) {
      for (let j = 0; j < Value.SIZE - i; j++) {
        rem += cell[i + j][j];
      }
      rem += ";";
    }

    // Check nửa trên đường chéo trái
    for (let i = 4; i < Value.SIZE; i++) {
      for (let j = 0; j <= i; j++) {
        rem += cell[i - j][j];
      }
      rem += ";";
    }

    // Check nửa dưới đường chéo trái
    for (let i = Value.SIZE - 5; i > 0; i--) {
      for (let j = Value.SIZE - 1; j >= i; j--) {
        rem += cell[j][i + Value.SIZE - j - 1];
      }
      rem += ";\n";
    }

    let diem = 0;
    // Tính điểm của trạng thái
    for (let i = 0; i < this.caseUser.length; i++) {
      const find1 = this.caseAI[i];
      const find2 = this.caseUser[i];
      diem += this.point[i] * this.count(rem, find1);
      diem -= this.point[i] * this.count(rem, find2);
    }

    return diem;
  }

  count(text, find) {
    const regex = new RegExp(find, "g");
    const matches = text.match(regex);
    return matches ? matches.length : 0;
  }

  resetValue() {
    for (let i = 0; i < Value.SIZE; i++) {
      for (let j = 0; j < Value.SIZE; j++) {
        this.evalState[i][j] = 0;
      }
    }
  }

  evaluateEachCell(player) {
    this.resetValue();
    const cell = this.root.getState();

    // Kiểm tra theo hàng
    for (let x = 0; x < Value.SIZE; x++) {
      for (let y = 0; y < Value.SIZE - 4; y++) {
        let countAI = 0,
          countUser = 0;
        for (let i = 0; i < 5; i++) {
          if (cell[x][y + i] === Value.AI_VALUE) countAI++;
          else if (cell[x][y + i] === Value.USER_VALUE) countUser++;
        }
        if (countAI * countUser === 0 && countAI !== countUser) {
          for (let i = 0; i < 5; i++) {
            if (cell[x][y + i] === 0) {
              if (countAI === 0) {
                if (player === Value.AI_VALUE) {
                  this.evalState[x][y + i] += this.defenseScore[countUser];
                } else {
                  this.evalState[x][y + i] += this.attackScore[countUser];
                }
              } else if (countUser === 0) {
                if (player === Value.USER_VALUE) {
                  this.evalState[x][y + i] += this.defenseScore[countAI];
                } else {
                  this.evalState[x][y + i] += this.attackScore[countAI];
                }
              }
              if (countAI === 4 || countUser === 4) {
                this.evalState[x][y + i] *= 2;
              }
            }
          }
        }
      }
    }

    // Kiểm tra theo cột
    for (let x = 0; x < Value.SIZE - 4; x++) {
      for (let y = 0; y < Value.SIZE; y++) {
        let countAI = 0,
          countUser = 0;
        for (let i = 0; i < 5; i++) {
          if (cell[x + i][y] === Value.AI_VALUE) countAI++;
          else if (cell[x + i][y] === Value.USER_VALUE) countUser++;
        }
        if (countAI * countUser === 0 && countAI !== countUser) {
          for (let i = 0; i < 5; i++) {
            if (cell[x + i][y] === 0) {
              if (countAI === 0) {
                if (player === Value.AI_VALUE) {
                  this.evalState[x + i][y] += this.defenseScore[countUser];
                } else {
                  this.evalState[x + i][y] += this.attackScore[countUser];
                }
              } else if (countUser === 0) {
                if (player === Value.USER_VALUE) {
                  this.evalState[x + i][y] += this.defenseScore[countAI];
                } else {
                  this.evalState[x + i][y] += this.attackScore[countAI];
                }
              }
              if (countAI === 4 || countUser === 4) {
                this.evalState[x + i][y] *= 2;
              }
            }
          }
        }
      }
    }

    // Kiểm tra theo đường chéo chính
    for (let x = 0; x < Value.SIZE - 4; x++) {
      for (let y = 0; y < Value.SIZE - 4; y++) {
        let countAI = 0,
          countUser = 0;
        for (let i = 0; i < 5; i++) {
          if (cell[x + i][y + i] === Value.AI_VALUE) countAI++;
          else if (cell[x + i][y + i] === Value.USER_VALUE) countUser++;
        }
        if (countAI * countUser === 0 && countAI !== countUser) {
          for (let i = 0; i < 5; i++) {
            if (cell[x + i][y + i] === 0) {
              if (countAI === 0) {
                if (player === Value.AI_VALUE) {
                  this.evalState[x + i][y + i] += this.defenseScore[countUser];
                } else {
                  this.evalState[x + i][y + i] += this.attackScore[countUser];
                }
              } else if (countUser === 0) {
                if (player === Value.USER_VALUE) {
                  this.evalState[x + i][y + i] += this.defenseScore[countAI];
                } else {
                  this.evalState[x + i][y + i] += this.attackScore[countAI];
                }
              }
              if (countAI === 4 || countUser === 4) {
                this.evalState[x + i][y + i] *= 2;
              }
            }
          }
        }
      }
    }

    // Kiểm tra theo đường chéo phụ
    for (let x = 4; x < Value.SIZE; x++) {
      for (let y = 0; y < Value.SIZE - 4; y++) {
        let countAI = 0,
          countUser = 0;
        for (let i = 0; i < 5; i++) {
          if (cell[x - i][y + i] === Value.AI_VALUE) countAI++;
          else if (cell[x - i][y + i] === Value.USER_VALUE) countUser++;
        }
        if (countAI * countUser === 0 && countAI !== countUser) {
          for (let i = 0; i < 5; i++) {
            if (cell[x - i][y + i] === 0) {
              if (countAI === 0) {
                if (player === Value.AI_VALUE) {
                  this.evalState[x - i][y + i] += this.defenseScore[countUser];
                } else {
                  this.evalState[x - i][y + i] += this.attackScore[countUser];
                }
              } else if (countUser === 0) {
                if (player === Value.USER_VALUE) {
                  this.evalState[x - i][y + i] += this.defenseScore[countAI];
                } else {
                  this.evalState[x - i][y + i] += this.attackScore[countAI];
                }
              }
              if (countAI === 4 || countUser === 4) {
                this.evalState[x - i][y + i] *= 2;
              }
            }
          }
        }
      }
    }
  }

  getOptimalList() {
    const size = Value.MAX_NUM_OF_HIGHEST_CELL_LIST;
    const maxValueList = new Array(size).fill(Number.MIN_SAFE_INTEGER);
    const maxCellList = new Array(size).fill(null).map(() => new Cell());

    for (let x = 0; x < Value.SIZE; x++) {
      for (let y = 0; y < Value.SIZE; y++) {
        const value = this.evalState[x][y];
        for (let i = size - 1; i >= 0; i--) {
          if (maxValueList[i] <= value && value !== 0) {
            for (let j = 0; j < i; j++) {
              maxValueList[j] = maxValueList[j + 1];
              maxCellList[j].setLocation(maxCellList[j + 1].getX(), maxCellList[j + 1].getY());
            }
            maxValueList[i] = value;
            maxCellList[i].setLocation(x, y);
            break;
          }
        }
      }
    }

    const maxLength = this.lengthNum(maxValueList[size - 1]);
    const difference = [0, 2, 8, 32, 128, 512];

    const list = [];
    list.push(new EvalCell(maxCellList[size - 1], maxValueList[size - 1]));

    for (let i = size - 2; i >= 0; i--) {
      if (maxValueList[size - 1] - maxValueList[i] <= difference[maxLength]) {
        list.push(new EvalCell(maxCellList[i], maxValueList[i]));
      } else break;
    }

    return list;
  }

  lengthNum(a) {
    if (a === 0) return 1;
    if (a < 0) a *= -1;
    let dem = 0;
    while (a > 0) {
      a = Math.floor(a / 10);
      dem++;
    }
    return dem;
  }

  alphaBeta() {
    this.evaluateEachCell(Value.AI_VALUE);
    const list = this.getOptimalList();

    let maxValue = Number.MIN_SAFE_INTEGER;
    const n = list.length;
    const ListChoose = [];

    for (let i = 0; i < n; i++) {
      this.root.getState()[list[i].getX()][list[i].getY()] = Value.AI_VALUE;
      const value = this.minValue(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 0);
      if (maxValue < value) {
        maxValue = value;
        ListChoose.length = 0;
        ListChoose.push(list[i]);
      } else if (maxValue === value) {
        ListChoose.push(list[i]);
      }
      this.root.getState()[list[i].getX()][list[i].getY()] = 0;
    }

    // const choiceIndex = Math.floor(Math.random() * ListChoose.length);
    // return ListChoose[choiceIndex].getCell();

    // Trả về EvalCell có value lớn nhất trong danh sách ListChoose
    if (ListChoose.length === 0) return null;
    // Nếu có nhiều EvalCell có cùng điểm cao nhất, chọn ngẫu nhiên một trong số đó
    let maxValueChoose = ListChoose[0].getValue();
    let maxCells = [ListChoose[0]];
    for (let i = 1; i < ListChoose.length; i++) {
      if (ListChoose[i].getValue() > maxValueChoose) {
        maxValueChoose = ListChoose[i].getValue();
        maxCells = [ListChoose[i]];
      } else if (ListChoose[i].getValue() === maxValueChoose) {
        maxCells.push(ListChoose[i]);
      }
    }
    const randomIndex = Math.floor(Math.random() * maxCells.length);
    return maxCells[randomIndex].getCell();
  }

  maxValue(alpha, beta, depth) {
    if (depth >= Value.MAX_DEPTH || this.checkWinner(Value.AI_VALUE) || this.isOver()) {
      return this.evaluateState();
    }

    this.evaluateEachCell(Value.AI_VALUE);
    const list = this.getOptimalList();

    for (let i = 0; i < list.length; i++) {
      this.root.getState()[list[i].getCell().getX()][list[i].getCell().getY()] = Value.AI_VALUE;
      alpha = Math.max(alpha, this.minValue(alpha, beta, depth + 1));
      this.root.getState()[list[i].getCell().getX()][list[i].getCell().getY()] = 0;
      if (alpha >= beta) break;
    }

    return alpha;
  }

  minValue(alpha, beta, depth) {
    if (depth >= Value.MAX_DEPTH || this.checkWinner(Value.USER_VALUE) || this.isOver()) {
      return this.evaluateState();
    }

    this.evaluateEachCell(Value.USER_VALUE);
    const list = this.getOptimalList();

    for (let i = 0; i < list.length; i++) {
      this.root.getState()[list[i].getCell().getX()][list[i].getCell().getY()] = Value.USER_VALUE;
      beta = Math.min(beta, this.maxValue(alpha, beta, depth + 1));
      this.root.getState()[list[i].getCell().getX()][list[i].getCell().getY()] = 0;
      if (alpha >= beta) break;
    }

    return beta;
  }

  /**
   * Cập nhật ma trận (tương đương với CaroAI.update())
   * @param {number} x - Vị trí hàng
   * @param {number} y - Vị trí cột
   * @param {number} value - USER_VALUE: 1, AI_VALUE: 2
   */
  update(x, y, value) {
    this.root.update(x, y, value);
  }

  /**
   * Lấy vị trí X tiếp theo (tương đương với CaroAI.getNextX())
   * @returns {number} Vị trí X
   */
  getNextX() {
    return this.nextX;
  }

  /**
   * Lấy vị trí Y tiếp theo (tương đương với CaroAI.getNextY())
   * @returns {number} Vị trí Y
   */
  getNextY() {
    return this.nextY;
  }

  /**
   * Tìm bước đi tiếp theo (tương đương với CaroAI.nextStep())
   */
  nextStep() {
    const choice = this.alphaBeta();
    if (!choice) {
      console.log("~ Lỗi! Không tìm thấy nước đi!");
    } else {
      this.nextX = choice.getX();
      this.nextY = choice.getY();
      console.log("=> Nước đi của AI: " + this.nextX + " " + this.nextY);
      if (!this.isClickable(this.nextX, this.nextY)) {
        console.log("~ Lỗi! nước đi bị trùng!");
      } else {
        this.update(this.nextX, this.nextY, Value.AI_VALUE);
      }
    }
  }
}

/**
 * Class State - Quản lý trạng thái trò chơi
 */
class State {
  constructor(cell = null) {
    this.steps = 0;
    this.moveSteps = [];
    this.cell = Array(Value.SIZE)
      .fill(null)
      .map(() => Array(Value.SIZE).fill(0));

    if (cell) {
      for (let i = 0; i < Value.SIZE; i++) {
        for (let j = 0; j < Value.SIZE; j++) {
          this.cell[i][j] = cell[i][j];
          if (cell[i][j] !== 0) {
            this.moveSteps.push(new Cell(i, j, cell[i][j]));
            this.steps++;
          }
        }
      }
    }
  }

  /**
   * Cập nhật nước đi mới
   * @param {number} x - Vị trí hàng
   * @param {number} y - Vị trí cột
   * @param {number} player - Người chơi (USER_VALUE hoặc AI_VALUE)
   */
  update(x, y, player) {
    this.cell[x][y] = player;
    this.moveSteps.push(new Cell(x, y, player));
    this.steps++;
  }

  /**
   * Lấy trạng thái hiện tại
   * @returns {Array} Ma trận trạng thái
   */
  getState() {
    return this.cell;
  }

  /**
   * Thiết lập trạng thái
   * @param {Array} cell - Ma trận trạng thái mới
   */
  setState(cell) {
    for (let i = 0; i < Value.SIZE; i++) {
      for (let j = 0; j < Value.SIZE; j++) {
        this.cell[i][j] = cell[i][j];
      }
    }
  }

  /**
   * In trạng thái ra console (debug)
   */
  printState() {
    for (let i = 0; i < Value.SIZE; i++) {
      let row = "";
      for (let j = 0; j < Value.SIZE; j++) {
        if (this.cell[i][j] === Value.AI_VALUE) row += "- ";
        else if (this.cell[i][j] === Value.USER_VALUE) row += "+ ";
        else row += this.cell[i][j] + " ";
      }
      console.log(row);
    }
  }

  /**
   * Kiểm tra người thắng cuộc
   * @param {number} player - Người chơi cần kiểm tra
   * @returns {boolean} true nếu player thắng
   */
  checkWinner(player) {
    const lineX = [1, 1, 0, 1]; // Các đường cần kiểm tra (ngang, dọc, chéo xuống trái, chéo xuống phải)
    const lineY = [0, 1, 1, -1]; // Để tìm người thắng

    for (let x = 0; x < Value.SIZE; x++) {
      for (let y = 0; y < Value.SIZE; y++) {
        if (this.cell[x][y] === player) {
          // Nếu ô này đã được player chọn => kiểm tra
          for (let i = 0; i < 4; i++) {
            // kiểm tra 4 đường
            let count = 1; // count = 5 => player chiến thắng
            for (let j = 1; j <= 4; j++) {
              // kiểm tra 4 ô tiếp theo
              const vtx = x + lineX[i] * j; // vị trí x của ô tiếp theo cần check
              const vty = y + lineY[i] * j; // vị trí y của ô tiếp theo cần check
              // vtx hoặc vty < 0 hoặc > Value.SIZE, hoặc ô này != ô đầu => khỏi ktra
              if (vtx < 0 || vty < 0 || vtx >= Value.SIZE || vty >= Value.SIZE) break;
              if (this.cell[vtx][vty] === player) count++;
              else break;
            }
            if (count === 5) return true; // Player thắng
          }
        }
      }
    }
    return false; // Không ai thắng cả
  }

  /**
   * Kiểm tra một ô đã có ai đánh chưa
   * @param {number} x - Vị trí hàng
   * @param {number} y - Vị trí cột
   * @returns {boolean} true nếu có thể click
   */
  isClickable(x, y) {
    if (x >= 0 && x < Value.SIZE && y >= 0 && y < Value.SIZE) {
      if (this.cell[x][y] === 0) return true;
    }
    return false;
  }

  /**
   * Hết ô để đánh
   * @returns {boolean} true nếu hết ô
   */
  isOver() {
    return this.steps === Value.SIZE * Value.SIZE;
  }
}

/**
 * Class Cell - Quản lý vị trí ô đánh
 */
class Cell {
  constructor(x = 0, y = 0, selected = 0) {
    this.x = x;
    this.y = y;
    this.selected = selected; // người đã đánh ô này USER_VALUE: 1, AI_VALUE: 2
  }

  setLocation(x, y) {
    this.x = x;
    this.y = y;
  }

  getX() {
    return this.x;
  }

  getY() {
    return this.y;
  }

  getSelected() {
    return this.selected;
  }

  setSelected(selected) {
    this.selected = selected;
  }

  isClickable() {
    return this.selected === 0;
  }
}

/**
 * Class EvalCell - Quản lý vị trí ô đánh và điểm số
 */
class EvalCell {
  constructor(cell, value) {
    this.cell = cell;
    this.value = value;
  }

  getCell() {
    return this.cell;
  }

  getValue() {
    return this.value;
  }

  getX() {
    return this.cell.getX();
  }

  getY() {
    return this.cell.getY();
  }
}
