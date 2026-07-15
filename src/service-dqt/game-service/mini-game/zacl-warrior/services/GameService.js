/**
 * GameService.js
 * Lớp quản lý và kết nối các module khác nhau
 */

import { getGameManagerInstance } from '../core/GameManager.js';
import { getGameDataInstance } from '../core/GameData.js';
import { getCommandHandlerInstance } from '../command/CommandHandler.js';
import { getServiceRegistry } from './ServiceRegistry.js';
import chalk from 'chalk';

export class GameService {
  constructor() {
    /** @type {import('../core/GameManager.js').GameManager} */
    this.gameManager = getGameManagerInstance();
    
    /** @type {import('../core/GameData.js').GameData} */
    this.gameData = getGameDataInstance();
    
    /**
     * CommandHandler needs to be initialized last, after GameManager
     * because it sets itself in the GameManager
     * @type {import('../command/CommandHandler.js').CommandHandler}
     */
    this.commandHandler = getCommandHandlerInstance();
    
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
   * Lấy CombatService
   * @returns {import('./CombatService.js').CombatService}
   */
  get combatService() {
    return this.getService('CombatService');
  }

  /**
   * Khởi tạo trò chơi
   */
  async initialize() {
    console.log(chalk.blue(`[${this.gameManager.gameType}] Đang khởi tạo GameService...`));
    
    // Khởi tạo GameManager (quản lý trạng thái game)
    await this.gameManager.initialize();
    
    // Tải dữ liệu item
    const itemService = this.getService('ItemService');
    itemService.loadItems();
    
    return true;
  }

  /**
   * Xử lý tin nhắn từ người chơi
   * @param {Object} api - API object
   * @param {Object} message - Message object
   * @returns {Promise<boolean>} - Kết quả xử lý tin nhắn
   */
  async handleMessage(api, message) {
    return await this.commandHandler.handleMessage(api, message);
  }

  /**
   * Xử lý lệnh từ người dùng
   * @param {Object} api - API object
   * @param {Object} message - Message object
   * @param {string} aliasCommand - Lệnh đã gọi (join, leave, help, ...)
   * @param {Object} groupSettings - Cài đặt nhóm
   */
  async handleZaclWarriorCommand(api, message, aliasCommand) {
    return await this.commandHandler.handleZaclWarriorCommand(api, message, aliasCommand);
  }

  /**
   * Tắt và lưu dữ liệu trò chơi
   */
  async shutdown() {
    console.log(chalk.blue(`[${this.gameManager.gameType}] Đang lưu dữ liệu và tắt GameService...`));
    await this.gameManager.shutdown();
    console.log(chalk.green(`[${this.gameManager.gameType}] Đã tắt GameService!`));
  }
}

let instance = null;

export function getGameServiceInstance() {
  if (!instance) {
    instance = new GameService();
  }
  return instance;
}

export default {
  GameService,
  getGameServiceInstance
};