/**
 * GameManager.js
 * Lớp quản lý trạng thái và vòng đời của trò chơi
 */

import { getGameDataInstance } from "./GameData.js";
import schedule from "node-schedule";
import chalk from "chalk";
import { gameTypeZaclWarrior } from "../index.js";
import { addPlayer, removePlayer } from "../../../mini-game/index.js";
import Player from "../models/Player.js";
import { getServiceRegistry } from "../services/ServiceRegistry.js";

export class GameManager {
  constructor() {
    /** @type {import('./GameData.js').GameData} */
    this.gameData = getGameDataInstance();

    // Lấy registry để truy cập các service khi cần
    this._registry = getServiceRegistry();

    /** @type {import('../command/CommandHandler.js').CommandHandler} */
    this.commandHandler = null;

    this.globalStateGameZaclWarrior = new Map();
    this.gameType = gameTypeZaclWarrior;
    this.TIME_TO_LIVE = 86400000;
    this.VALID_COMMANDS = [
      "help",
      "stats",
      "inventory",
      "inv",
      "equipment",
      "eqm",
      "equip",
      "unequip",
      "use",
      "move",
      "attack",
      "skill",
      "learn",
      "area",
      "check",
      "quest",
      "respawn",
      "shop",
      "talk",
      "list",
      "code",
      "trade",
      "craft",
      "rank",
      "clan",
      "worldboss",
      "wb",
      "target",
      "combat",
      "flee",
    ];
    this.activeJobs = {};
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
   * Khởi tạo game manager và tải dữ liệu
   */
  async initialize() {
    console.log(chalk.blue(`[${this.gameType}] Đang khởi tạo GameManager...`));

    // Tải dữ liệu từ các file JSON
    const loaded = await this.gameData.loadAllData();
    if (!loaded) {
      console.error(chalk.red(`[${this.gameType}] Khởi tạo game thất bại: Không thể tải dữ liệu từ file`));
      return false;
    }

    // Lập lịch tự động lưu dữ liệu
    this.scheduleAutoSave();
    return true;
  }

  /**
   * Thiết lập lịch tự động lưu dữ liệu
   */
  scheduleAutoSave() {
    this.activeJobs.autoSave = schedule.scheduleJob("*/15 * * * * *", async () => {
      try {
        await this.gameData.saveChangedData();
      } catch (error) {
        console.error(chalk.red(`[${this.gameType}] Lỗi khi tự động lưu dữ liệu:`, error));
      }
    });

    // this.activeJobs.inactiveCheck = schedule.scheduleJob("*/1 * * * *", () => {
    //   this.checkInactivePlayers();
    // });
  }

  /**
   * Hủy tất cả các job đã lập lịch
   */
  cancelAllJobs() {
    Object.values(this.activeJobs).forEach((job) => {
      if (job) job.cancel();
    });
    this.activeJobs = {};
  }

  /**
   * Tắt game manager và lưu dữ liệu
   */
  async shutdown() {
    console.log(chalk.blue(`[${this.gameType}] Đang đóng game...`));
    this.cancelAllJobs();
    await this.gameData.saveChangedData();
    console.log(chalk.green(`[${this.gameType}] Đã đóng game an toàn!`));
  }

  /**
   * Lấy trạng thái toàn cục của game
   * @returns {Map} Map chứa trạng thái game
   */
  getGlobalState() {
    return this.globalStateGameZaclWarrior;
  }

  /**
   * Lấy dữ liệu người chơi
   * @returns {Object<string, Player>} - Dữ liệu người chơi
   */
  getPlayerData() {
    return this.gameData.getPlayerData();
  }

  setPlayerState(playerId) {
    if (!this.globalStateGameZaclWarrior.has(playerId)) {
      this.globalStateGameZaclWarrior.set(playerId, { lastCommand: Date.now() });
    } else {
      this.globalStateGameZaclWarrior.get(playerId).lastCommand = Date.now();
    }
  }

  addPlayerToGame(inputData) {
    try {
      const { playerId, globalId } = inputData;
      this.gameData.setPlayerIdMap(playerId, globalId);
      this.setPlayerState(playerId);
      return true;
    } catch (error) {
      console.error(chalk.red(`[${this.gameType}] Lỗi khi thêm người chơi vào game:`, error));
      return false;
    }
  }

  removePlayerFromGame(inputData) {
    const { playerId, threadId } = inputData;
    try {
      const player = this.gameData.getPlayerByPlayerId(playerId);
      if (player) {
        player.status = "offline";
        player.save();
      }
      this.globalStateGameZaclWarrior.delete(playerId);
      if (threadId) {
        removePlayer(threadId, this.gameType, playerId);
      }
      return true;
    } catch (error) {
      console.error(chalk.red(`[${this.gameType}] Lỗi khi xóa người chơi khỏi game:`, error));
      return false;
    }
  }

  /**
   * Kiểm tra người chơi có đang trong game hay không
   * @param {string} playerId - ID của người chơi
   * @returns {boolean} - Trả về true nếu người chơi đang trong game, ngược lại false
   */
  isPlayerInGame(playerId) {
    return this.globalStateGameZaclWarrior.has(playerId);
  }

  /**
   * Lấy thông tin người chơi từ playerId
   * @param {string} playerId - ID của người chơi
   * @returns {Player|null} - Thông tin người chơi hoặc null nếu không tìm thấy
   */
  getPlayerFromId(playerId) {
    return this.gameData.getPlayerByPlayerId(playerId);
  }

  /**
   * Lấy dữ liệu vật phẩm
   * @returns {Object} - Dữ liệu vật phẩm
   */
  getItemsData() {
    return this.gameData.getItemsData();
  }

  /**
   * Lấy dữ liệu quái vật
   * @returns {Object} - Dữ liệu quái vật
   */
  getMonstersData() {
    return this.gameData.getMonstersData();
  }

  /**
   * Lấy dữ liệu khu vực
   * @returns {Object} - Dữ liệu khu vực
   */
  getAreasData() {
    return this.gameData.getAreasData();
  }

  /**
   * Lấy dữ liệu cửa hàng
   * @returns {Object} - Dữ liệu cửa hàng
   */
  getShopsData() {
    return this.gameData.getShopsData();
  }

  /**
   * Lấy dữ liệu kỹ năng
   * @returns {Object} - Dữ liệu kỹ năng
   */
  getSkillsData() {
    return this.gameData.getSkillsData();
  }

  /**
   * Lấy dữ liệu nhiệm vụ
   * @returns {Object} - Dữ liệu nhiệm vụ
   */
  getQuestsData() {
    return this.gameData.getQuestsData();
  }

  /**
   * Lấy dữ liệu bang hội
   * @returns {Object} - Dữ liệu bang hội
   */
  getClansData() {
    return this.gameData.getClansData();
  }

  /**
   * Lấy dữ liệu mã code
   * @returns {Object} - Dữ liệu mã code
   */
  getCodesData() {
    return this.gameData.getCodesData();
  }

  /**
   * Lấy dữ liệu thành tựu
   * @returns {Object} - Dữ liệu thành tựu
   */
  getAchievementsData() {
    return this.gameData.getAchievementsData();
  }

  /**
   * Lấy lịch sử giao dịch
   * @returns {Array} - Dữ liệu lịch sử giao dịch
   */
  getTradeHistoryData() {
    return this.gameData.getTradeHistoryData();
  }

  /**
   * Lấy dữ liệu NPC
   * @returns {Object} - Dữ liệu NPC
   */
  getNpcsData() {
    return this.gameData.getNpcsData();
  }

  /**
   * Khởi tạo tham chiếu đến CommandHandler instance
   * @param {Object} commandHandlerInstance
   */
  setCommandHandler(commandHandlerInstance) {
    this.commandHandler = commandHandlerInstance;
  }

  // Các phương thức đánh dấu thay đổi dữ liệu
  markPlayerDataChanged() {
    this.gameData.markPlayerDataChanged();
  }

  markItemsDataChanged() {
    this.gameData.markItemsDataChanged();
  }

  markMonstersDataChanged() {
    this.gameData.markMonstersDataChanged();
  }

  markAreasDataChanged() {
    this.gameData.markAreasDataChanged();
  }

  markShopsDataChanged() {
    this.gameData.markShopsDataChanged();
  }

  markSkillsDataChanged() {
    this.gameData.markSkillsDataChanged();
  }

  markQuestsDataChanged() {
    this.gameData.markQuestsDataChanged();
  }

  markAchievementsDataChanged() {
    this.gameData.markAchievementsDataChanged();
  }

  markClansDataChanged() {
    this.gameData.markClansDataChanged();
  }

  markCodesDataChanged() {
    this.gameData.markCodesDataChanged();
  }

  markNpcsDataChanged() {
    this.gameData.markNpcsDataChanged();
  }

  markTradeHistoryDataChanged() {
    this.gameData.markTradeHistoryDataChanged();
  }

  /**
   * Đánh dấu dữ liệu đã thay đổi và lưu ngay nếu cần
   * @param {string} dataType - Loại dữ liệu cần đánh dấu
   * @param {boolean} saveImmediately - Có lưu ngay hay không
   */
  async markDataChanged(dataType, saveImmediately = false) {
    return await this.gameData.markDataChanged(dataType, saveImmediately);
  }
}

let instance = null;

export function getGameManagerInstance() {
  if (!instance) {
    instance = new GameManager();
  }
  return instance;
}
