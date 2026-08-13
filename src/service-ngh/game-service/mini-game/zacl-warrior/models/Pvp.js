/**
 * Pvp.js
 * Module xử lý logic liên quan đến PvP
 */

import { getGameDataInstance } from '../core/GameData.js';

export class PvpMatch {
  constructor(matchData) {
    this.id = matchData.id;
    this.player1Id = matchData.player1Id;
    this.player1Name = matchData.player1Name;
    this.player1Data = matchData.player1Data;
    this.player2Id = matchData.player2Id;
    this.player2Name = matchData.player2Name;
    this.player2Data = matchData.player2Data;
    this.type = matchData.type || 'normal';
    this.startTime = matchData.startTime || Date.now();
    this.endTime = matchData.endTime || null;
    this.status = matchData.status || 'pending'; // pending, active, finished
    this.winner = matchData.winner || 0; // 0: no winner, 1: player1, 2: player2
    this.logs = matchData.logs || [];
    this.spectators = matchData.spectators || [];
    this.turn = matchData.turn || 0;
    this.currentPlayer = matchData.currentPlayer || 1;
  }

  /**
   * Chuyển đổi đối tượng thành dạng JSON để lưu trữ
   * @returns {Object} - Dữ liệu JSON
   */
  toJSON() {
    return {
      id: this.id,
      player1Id: this.player1Id,
      player1Name: this.player1Name,
      player1Data: { ...this.player1Data },
      player2Id: this.player2Id,
      player2Name: this.player2Name,
      player2Data: { ...this.player2Data },
      type: this.type,
      startTime: this.startTime,
      endTime: this.endTime,
      status: this.status,
      winner: this.winner,
      logs: [...this.logs],
      spectators: [...this.spectators],
      turn: this.turn,
      currentPlayer: this.currentPlayer
    };
  }

  /**
   * Thêm thông báo vào lịch sử trận đấu
   * @param {string} message - Nội dung thông báo
   */
  addLog(message) {
    if (!message) return;
    
    this.logs.push({
      time: Date.now(),
      message
    });
  }

  /**
   * Thêm người xem vào trận đấu
   * @param {string} playerId - ID người chơi
   * @param {string} playerName - Tên người chơi
   * @returns {boolean} - Kết quả thêm người xem
   */
  addSpectator(playerId, playerName) {
    if (!playerId || !playerName) return false;
    
    // Kiểm tra xem người xem đã tồn tại chưa
    const existingSpectator = this.spectators.find(s => s.id === playerId);
    if (existingSpectator) return false;
    
    // Kiểm tra xem người xem có phải là một trong hai người chơi không
    if (this.player1Id === playerId || this.player2Id === playerId) return false;
    
    // Thêm người xem
    this.spectators.push({
      id: playerId,
      name: playerName,
      joinedAt: Date.now()
    });
    
    // Thêm thông báo
    this.addLog(`${playerName} bắt đầu xem trận đấu`);
    
    return true;
  }

  /**
   * Bắt đầu trận đấu
   * @returns {boolean} - Kết quả bắt đầu trận đấu
   */
  startMatch() {
    if (this.status !== 'pending') return false;
    
    this.status = 'active';
    this.startTime = Date.now();
    this.turn = 1;
    
    // Xác định người chơi đi trước (player có speed cao hơn)
    if (this.player1Data.speed < this.player2Data.speed) {
      this.currentPlayer = 2;
    } else if (this.player1Data.speed === this.player2Data.speed) {
      // Nếu speed bằng nhau, ngẫu nhiên
      this.currentPlayer = Math.random() < 0.5 ? 1 : 2;
    }
    
    const startMessage = `Trận đấu giữa ${this.player1Name} và ${this.player2Name} bắt đầu!\n${this.currentPlayer === 1 ? this.player1Name : this.player2Name} đi trước.`;
    this.addLog(startMessage);
    
    return true;
  }

  /**
   * Kết thúc trận đấu
   * @param {number} winner - Người chiến thắng (0: hòa, 1: người chơi 1, 2: người chơi 2)
   * @param {Object} resultData - Dữ liệu kết quả trận đấu
   * @returns {boolean} - Kết quả kết thúc trận đấu
   */
  endMatch(winner, resultData = {}) {
    if (this.status === 'finished') return false;
    
    this.status = 'finished';
    this.endTime = Date.now();
    this.winner = winner || 0;
    
    let endMessage = '';
    if (this.winner === 0) {
      endMessage = `Trận đấu kết thúc với kết quả HÒA!`;
    } else if (this.winner === 1) {
      endMessage = `${this.player1Name} đã chiến thắng!`;
    } else if (this.winner === 2) {
      endMessage = `${this.player2Name} đã chiến thắng!`;
    }
    
    this.addLog(endMessage);
  }
}

export default PvpMatch; 