import fs from "fs";
import path from "path";
import { createCanvas } from "canvas";
import { tempDir } from "../../../../../utils/io-json.js";
import { WIN_CONDITION } from "../core/game-manager.js";
import { capitalizeEachWord } from "../../../../../utils/format-util.js";

/**
 * Draw a Caro game board with current state
 * @param {Array<Array>} board - 2D array representing the board state
 * @param {string} player1Id - ID of player X
 * @param {string} player1Name - Name of player X
 * @param {string} player2Id - ID of player O
 * @param {string} player2Name - Name of player O
 * @param {Array} moves - Array of moves made so far
 * @param {Map} players - Map of player info
 * @param {Array} winningLine - Array of coordinates forming the winning line (optional)
 * @param {string} difficulty - Bot difficulty level (optional)
 * @returns {Promise<string>} - Path to the image file
 */
export async function drawCaroBoard(
  board,
  player1Id,
  player1Name,
  player2Id,
  player2Name,
  moves,
  players,
  winningLine = null,
  difficulty = null
) {
  // Board configuration
  const BOARD_SIZE = board.length;
  const CELL_SIZE = 30;
  const PADDING = 20;
  const LINE_WIDTH = 1;
  const BORDER_WIDTH = 2;
  const NUMBER_SIZE = 12; // Tăng kích thước số từ 10 lên 12

  // Calculate canvas dimensions
  const boardWidth = CELL_SIZE * BOARD_SIZE;
  const boardHeight = CELL_SIZE * BOARD_SIZE;
  const canvasWidth = boardWidth + 2 * PADDING;
  const canvasHeight = boardHeight + 3 * PADDING + 60; // Extra space for player info

  // Create canvas and get context
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");

  // Fill background
  ctx.fillStyle = "#f5f5f5";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Draw header with player info
  ctx.font = "bold 14px Arial";
  ctx.fillStyle = "#1a1a1a";
  ctx.textAlign = "center";
  // Hiển thị độ khó nếu có
  if (difficulty) {
    ctx.fillText(`Caro - ${BOARD_SIZE}x${BOARD_SIZE} - ${capitalizeEachWord(difficulty)}`, canvasWidth / 2, PADDING);
  } else {
    ctx.fillText(`Caro - ${BOARD_SIZE}x${BOARD_SIZE}`, canvasWidth / 2, PADDING);
  }

  // Draw player info
  const lastMove = moves.length > 0 ? moves[moves.length - 1] : null;

  // Get player symbols and determine positions
  const player1Symbol = players.get(player1Id)?.symbol || "X";
  const player2Symbol = players.get(player2Id)?.symbol || "O";
  
  // Determine which player is X and which is O
  let xPlayerId, xPlayerName, oPlayerId, oPlayerName;
  if (player1Symbol === "X") {
    xPlayerId = player1Id;
    xPlayerName = player1Name;
    oPlayerId = player2Id;
    oPlayerName = player2Name;
  } else {
    xPlayerId = player2Id;
    xPlayerName = player2Name;
    oPlayerId = player1Id;
    oPlayerName = player1Name;
  }

  // Player X (always on the left)
  ctx.textAlign = "left";
  ctx.font = "bold 12px Arial";
  ctx.fillStyle = "#c0392b"; // Red for X
  const xPlayerText = `X: ${xPlayerName}`;
  ctx.fillText(xPlayerText, PADDING, PADDING + 20);

  // Player O (always on the right)
  ctx.textAlign = "right";
  ctx.fillStyle = "#2980b9"; // Blue for O
  const oPlayerText = `O: ${oPlayerName}`;
  ctx.fillText(oPlayerText, canvasWidth - PADDING, PADDING + 20);

  // Highlight current player
  if (lastMove) {
    const currentPlayerId = lastMove.player === xPlayerId ? oPlayerId : xPlayerId;
    const currentPlayerX = currentPlayerId === xPlayerId ? PADDING : canvasWidth - PADDING;
    const currentPlayerAlign = currentPlayerId === xPlayerId ? "left" : "right";
    ctx.textAlign = currentPlayerAlign;
    ctx.fillStyle = "#f39c12"; // Orange highlight
    ctx.fillText("⮕", currentPlayerX - (currentPlayerId === xPlayerId ? 15 : -15), PADDING + 20);
  }

  // Draw the board
  ctx.save();
  ctx.translate(PADDING, PADDING + 40);

  // Draw border
  ctx.strokeStyle = "#333";
  ctx.lineWidth = BORDER_WIDTH;
  ctx.strokeRect(0, 0, boardWidth, boardHeight);

  // Draw grid lines
  ctx.lineWidth = LINE_WIDTH;
  ctx.strokeStyle = "#aaa";

  // Vertical lines
  for (let i = 1; i < BOARD_SIZE; i++) {
    ctx.beginPath();
    ctx.moveTo(i * CELL_SIZE, 0);
    ctx.lineTo(i * CELL_SIZE, boardHeight);
    ctx.stroke();
  }

  // Horizontal lines
  for (let i = 1; i < BOARD_SIZE; i++) {
    ctx.beginPath();
    ctx.moveTo(0, i * CELL_SIZE);
    ctx.lineTo(boardWidth, i * CELL_SIZE);
    ctx.stroke();
  }

  ctx.font = `bold ${NUMBER_SIZE}px Arial`;
  ctx.fillStyle = "#555";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const cellNumber = row * BOARD_SIZE + col + 1;
      const x = col * CELL_SIZE + CELL_SIZE / 2;
      const y = row * CELL_SIZE + CELL_SIZE / 2;
      if (!board[row][col]) {
        ctx.fillText(cellNumber.toString(), x, y);
      }
    }
  }

  // Draw X and O markers
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const cellValue = board[row][col];
      if (!cellValue) continue;

      const x = col * CELL_SIZE + CELL_SIZE / 2;
      const y = row * CELL_SIZE + CELL_SIZE / 2;

      if (cellValue === "X") {
        ctx.strokeStyle = "#c0392b";
        ctx.lineWidth = 3;
        const offset = CELL_SIZE * 0.35;

        ctx.beginPath();
        ctx.moveTo(x - offset, y - offset);
        ctx.lineTo(x + offset, y + offset);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x + offset, y - offset);
        ctx.lineTo(x - offset, y + offset);
        ctx.stroke();
      } else if (cellValue === "O") {
        ctx.strokeStyle = "#2980b9";
        ctx.lineWidth = 3;
        const radius = CELL_SIZE * 0.35;

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  if (lastMove) {
    const lastMovePosition = lastMove.position;
    const lastMoveRow = Math.floor(lastMovePosition / BOARD_SIZE);
    const lastMoveCol = lastMovePosition % BOARD_SIZE;

    const x = lastMoveCol * CELL_SIZE + CELL_SIZE / 2;
    const y = lastMoveRow * CELL_SIZE + CELL_SIZE / 2;

    ctx.strokeStyle = "#f39c12";
    ctx.lineWidth = 2;
    const radius = CELL_SIZE * 0.45;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (winningLine && winningLine.length >= WIN_CONDITION) {
    winningLine.sort((a, b) => {
      if (a.row === b.row) {
        return a.col - b.col;
      }
      return a.row - b.row;
    });

    const firstCell = winningLine[0];
    const lastCell = winningLine[winningLine.length - 1];

    const startX = firstCell.col * CELL_SIZE + CELL_SIZE / 2;
    const startY = firstCell.row * CELL_SIZE + CELL_SIZE / 2;
    const endX = lastCell.col * CELL_SIZE + CELL_SIZE / 2;
    const endY = lastCell.row * CELL_SIZE + CELL_SIZE / 2;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);

    ctx.strokeStyle = "#1abc9c";
    ctx.lineWidth = 5;
    ctx.setLineDash([5, 3]);
    ctx.stroke();

    ctx.setLineDash([]);
  }

  ctx.restore();

  ctx.font = "12px Arial";
  ctx.fillStyle = "#555";
  ctx.textAlign = "center";
  ctx.fillText(`Nước đi: ${moves.length} / ${BOARD_SIZE * BOARD_SIZE}`, canvasWidth / 2, canvasHeight - PADDING / 2);

  const fileName = `caro_board_${Date.now()}.png`;
  const filePath = path.join(tempDir, fileName);
  fs.writeFileSync(filePath, canvas.toBuffer());
  return filePath;
}
