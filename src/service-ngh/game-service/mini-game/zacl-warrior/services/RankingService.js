/**
 * RankingService.js
 * Service xử lý các thao tác liên quan đến bảng xếp hạng
 */

import { getGameDataInstance } from '../core/GameData.js';
import { getGameManagerInstance } from '../core/GameManager.js';
import Player from '../models/Player.js';
import { getServiceRegistry } from './ServiceRegistry.js';

export class RankingService {
  constructor() {
    /** @type {import('../core/GameData.js').GameData} */
    this.gameData = getGameDataInstance();
    
    /** @type {import('../core/GameManager.js').GameManager} */
    this.gameManager = getGameManagerInstance();
    
    // Lấy registry để truy cập các service khi cần
    this._registry = getServiceRegistry();
  }
  
  /**
   * Lấy một service từ registry
   * @param {string} serviceName - Tên service
   * @returns {Object} Service instance
   */
  getService(serviceName) {
    return this._registry.getService(serviceName);
  }
  
  /**
   * Lấy PlayerService
   * @returns {import('./PlayerService.js').PlayerService}
   */
  get playerService() {
    return this.getService('PlayerService');
  }
  
  /**
   * Lấy ClanService
   * @returns {import('./ClanService.js').ClanService}
   */
  get clanService() {
    return this.getService('ClanService');
  }

  /**
   * Lấy bảng xếp hạng theo cấp độ
   * @returns {Array} - Danh sách người chơi xếp hạng theo cấp độ
   */
  getLevelRanking() {
    const playersData = this.gameData.getPlayerData();
    const players = Object.values(playersData);
    
    return players
      .sort((a, b) => {
        // Sắp xếp theo cấp độ giảm dần
        const aLevel = a.stat?.level || 1;
        const bLevel = b.stat?.level || 1;
        if (bLevel !== aLevel) {
          return bLevel - aLevel;
        }
        // Nếu cùng cấp độ, sắp xếp theo exp giảm dần
        const aExp = a.stat?.exp?.current || 0;
        const bExp = b.stat?.exp?.current || 0;
        return bExp - aExp;
      })
      .map((player, index) => ({
        rank: index + 1,
        name: player.name,
        level: player.stat?.level || 1,
        exp: player.stat?.exp?.current || 0
      }));
  }

  /**
   * Lấy bảng xếp hạng theo tài sản
   * @returns {Array} - Danh sách người chơi xếp hạng theo tài sản
   */
  getWealthRanking() {
    const playersData = this.gameData.getPlayerData();
    const players = Object.values(playersData);
    
    return players
      .sort((a, b) => {
        // Quy đổi tài sản thành vàng
        const aGold = a.money?.gold || 0;
        const aDiamond = a.money?.diamond || 0;
        const bGold = b.money?.gold || 0;
        const bDiamond = b.money?.diamond || 0;
        
        const aWealth = aGold + (aDiamond * 1000);
        const bWealth = bGold + (bDiamond * 1000);
        return bWealth - aWealth;
      })
      .map((player, index) => ({
        rank: index + 1,
        name: player.name,
        gold: player.money?.gold || 0,
        diamond: player.money?.diamond || 0,
        totalWealth: (player.money?.gold || 0) + ((player.money?.diamond || 0) * 1000)
      }));
  }

  /**
   * Lấy bảng xếp hạng theo sức mạnh
   * @returns {Array} - Danh sách người chơi xếp hạng theo sức mạnh
   */
  getPowerRanking() {
    const playersData = this.gameData.getPlayerData();
    const players = Object.values(playersData);
    
    return players
      .sort((a, b) => {
        // Tính tổng chỉ số
        const aPower = this.calculatePower(a);
        const bPower = this.calculatePower(b);
        return bPower - aPower;
      })
      .map((player, index) => ({
        rank: index + 1,
        name: player.name,
        level: player.stat?.level || 1,
        power: this.calculatePower(player)
      }));
  }

  /**
   * Tính toán sức mạnh của người chơi
   * @param {Player} player - Thông tin người chơi
   * @returns {number} - Chỉ số sức mạnh
   */
  calculatePower(player) {
    const stats = player.stat || {};
    return (
      (stats.attack || 0) * 2 +
      (stats.defense || 0) * 1.5 +
      (stats.speed || 0) +
      (stats.intelligence || 0) * 1.5 +
      (stats.vitality || 0) +
      (stats.hp?.max || 0) * 0.1 +
      (stats.mp?.max || 0) * 0.1 +
      (stats.critRate || 0) * 2 +
      (stats.critDmg || 0) * 0.5 +
      (stats.dodge || 0) +
      (stats.accuracy || 0)
    );
  }

  /**
   * Xử lý lệnh xem bảng xếp hạng
   * @param {Player} player - Đối tượng người chơi
   * @param {Array} args - Tham số lệnh
   * @returns {Object} - Kết quả xử lý
   */
  handleRanking(player, args = []) {
    const type = args[0]?.toLowerCase() || 'level';
    let ranking;
    let title;
    let message;

    switch (type) {
      case 'level':
      case 'lv':
        ranking = this.getLevelRanking();
        title = '🏆 BẢNG XẾP HẠNG CẤP ĐỘ 🏆';
        message = ranking
          .slice(0, 10)
          .map(p => `${p.rank}. ${p.name} - Cấp ${p.level} (${p.exp} EXP)`)
          .join('\n');
        break;

      case 'wealth':
      case 'money':
      case 'gold':
        ranking = this.getWealthRanking();
        title = '🏆 BẢNG XẾP HẠNG TÀI SẢN 🏆';
        message = ranking
          .slice(0, 10)
          .map(p => `${p.rank}. ${p.name} - ${p.gold} vàng, ${p.diamond} kim cương`)
          .join('\n');
        break;

      case 'power':
      case 'attack':
        ranking = this.getPowerRanking();
        title = '🏆 BẢNG XẾP HẠNG SỨC MẠNH 🏆';
        message = ranking
          .slice(0, 10)
          .map(p => `${p.rank}. ${p.name} - Sức mạnh: ${p.power}`)
          .join('\n');
        break;

      default:
        return {
          success: false,
          message: '❌ Loại bảng xếp hạng không hợp lệ!\nSử dụng: ranking [level/wealth/power]'
        };
    }

    if (player) {
      const playerRank = ranking.find(p => p.name === player.name);
      if (playerRank && playerRank.rank > 10) {
        message += `\n...\n${playerRank.rank}. ${player.name}`;
      }
    }

    return {
      success: true,
      message: `${title}\n\n${message}`
    };
  }
}

let instance = null;

export function getRankingServiceInstance() {
  if (!instance) {
    instance = new RankingService();
  }
  return instance;
}