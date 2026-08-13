/**
 * CraftService.js
 * Service xử lý các thao tác liên quan đến chế tạo vật phẩm
 */

import { getGameDataInstance } from '../core/GameData.js';
import { getGameManagerInstance } from '../core/GameManager.js';
import { getServiceRegistry } from './ServiceRegistry.js';

export class CraftService {
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
   * Lấy ItemService
   * @returns {import('./ItemService.js').ItemService}
   */
  get itemService() {
    return this.getService('ItemService');
  }
  
  /**
   * Xử lý lệnh chế tạo vật phẩm
   * @param {Object} player - Đối tượng người chơi
   * @param {Array} args - Tham số lệnh
   * @returns {Promise<Object>} - Kết quả xử lý
   */
  async handleCraftCommand(player, args) {
    // TODO: Thực hiện logic chế tạo vật phẩm ở đây
    return {
      success: false,
      message: "🚧 Tính năng chế tạo đang được phát triển.",
    };
  }
}