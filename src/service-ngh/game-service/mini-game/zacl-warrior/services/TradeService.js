/**
 * TradeService.js
 * Service xử lý các thao tác liên quan đến giao dịch
 */

import { getGameDataInstance } from '../core/GameData.js';
import { getGameManagerInstance } from '../core/GameManager.js';
import { getServiceRegistry } from './ServiceRegistry.js';

export class TradeService {
  constructor() {
    /** @type {import('../core/GameData.js').GameData} */
    this.gameData = getGameDataInstance();
    
    /** @type {import('../core/GameManager.js').GameManager} */
    this.gameManager = getGameManagerInstance();

    // Lấy registry để truy cập các service khi cần
    this._registry = getServiceRegistry();

    /** @type {Map<string, Object>} Lưu trữ trạng thái giao dịch */
    this.tradeStates = new Map();
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
   * Lấy ItemService
   * @returns {import('./ItemService.js').ItemService}
   */
  get itemService() {
    return this.getService('ItemService');
  }

  /**
   * Xử lý lệnh giao dịch
   * @param {Player} player - Đối tượng người chơi
   * @param {Array} args - Tham số lệnh
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async handleTrade(player, args = []) {
    if (!args.length) {
      return this.showTradeHelp();
    }

    const subCommand = args[0].toLowerCase();
    const targetName = args.slice(1).join(" ");

    switch (subCommand) {
      case "offer":
        return await this.handleTradeOffer(player, targetName);
      case "accept":
        return await this.handleTradeAccept(player, targetName);
      case "decline":
        return await this.handleTradeDecline(player, targetName);
      case "cancel":
        return await this.handleTradeCancel(player);
      case "add":
        return await this.handleTradeAddItem(player, args.slice(1));
      case "remove":
        return await this.handleTradeRemoveItem(player, args.slice(1));
      case "confirm":
        return await this.handleTradeConfirm(player);
      default:
        return {
          success: false,
          message: "❌ Lệnh không hợp lệ! Sử dụng: trade [offer/accept/decline/cancel/add/remove/confirm] [tham số]"
        };
    }
  }

  /**
   * Hiển thị hướng dẫn giao dịch
   * @returns {Object} Thông tin hướng dẫn
   */
  showTradeHelp() {
    return {
      success: true,
      message: "💰 HƯỚNG DẪN GIAO DỊCH 💰\n\n" +
        "- trade offer <người chơi>: Đề xuất giao dịch\n" +
        "- trade accept <người chơi>: Chấp nhận đề xuất\n" +
        "- trade decline <người chơi>: Từ chối đề xuất\n" +
        "- trade cancel: Hủy giao dịch hiện tại\n" +
        "- trade add <vật phẩm> [số lượng]: Thêm vật phẩm vào giao dịch\n" +
        "- trade remove <vật phẩm> [số lượng]: Bớt vật phẩm khỏi giao dịch\n" +
        "- trade confirm: Xác nhận giao dịch"
    };
  }

  /**
   * Xử lý đề xuất giao dịch
   * @param {Object} player - Thông tin người chơi
   * @param {string} targetName - Tên người chơi mục tiêu
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async handleTradeOffer(player, targetName) {
    // TODO: Implement trade offer logic
    return {
      success: false,
      message: "⚠️ Tính năng đang được phát triển!"
    };
  }

  /**
   * Xử lý chấp nhận giao dịch
   * @param {Object} player - Thông tin người chơi
   * @param {string} targetName - Tên người chơi mục tiêu
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async handleTradeAccept(player, targetName) {
    // TODO: Implement trade accept logic
    return {
      success: false,
      message: "⚠️ Tính năng đang được phát triển!"
    };
  }

  /**
   * Xử lý từ chối giao dịch
   * @param {Object} player - Thông tin người chơi
   * @param {string} targetName - Tên người chơi mục tiêu
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async handleTradeDecline(player, targetName) {
    // TODO: Implement trade decline logic
    return {
      success: false,
      message: "⚠️ Tính năng đang được phát triển!"
    };
  }

  /**
   * Xử lý hủy giao dịch
   * @param {Object} player - Thông tin người chơi
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async handleTradeCancel(player) {
    // TODO: Implement trade cancel logic
    return {
      success: false,
      message: "⚠️ Tính năng đang được phát triển!"
    };
  }

  /**
   * Xử lý thêm vật phẩm vào giao dịch
   * @param {Object} player - Thông tin người chơi
   * @param {Array} args - Tham số lệnh
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async handleTradeAddItem(player, args) {
    // TODO: Implement add item logic
    return {
      success: false,
      message: "⚠️ Tính năng đang được phát triển!"
    };
  }

  /**
   * Xử lý bớt vật phẩm khỏi giao dịch
   * @param {Object} player - Thông tin người chơi
   * @param {Array} args - Tham số lệnh
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async handleTradeRemoveItem(player, args) {
    // TODO: Implement remove item logic
    return {
      success: false,
      message: "⚠️ Tính năng đang được phát triển!"
    };
  }

  /**
   * Xử lý xác nhận giao dịch
   * @param {Object} player - Thông tin người chơi
   * @returns {Promise<Object>} Kết quả xử lý
   */
  async handleTradeConfirm(player) {
    // TODO: Implement trade confirm logic
    return {
      success: false,
      message: "⚠️ Tính năng đang được phát triển!"
    };
  }
}

let instance = null;

export function getTradeServiceInstance() {
  if (!instance) {
    instance = new TradeService();
  }
  return instance;
}