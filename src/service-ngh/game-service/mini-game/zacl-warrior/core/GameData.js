/**
 * GameData.js
 * Lớp quản lý dữ liệu game và tương tác với các file JSON
 */

import fs from "fs/promises";
import path from "path";
import { JSON_DATA_PATH } from "../../../../../utils/io-json.js";
import Player from '../models/Player.js';

export class GameData {
  constructor() {
    this.dataPath = path.join(JSON_DATA_PATH, "zacl-warrior");
    this.playerData = {};
    this.itemsData = { items: [] };
    this.monstersData = { monsters: [] };
    this.areasData = { areas: [] };
    this.shopsData = { shops: [] };
    this.skillsData = { skills: [] };
    this.questsData = { quests: [] };
    this.achievementsData = { achievements: [] };
    this.clansData = { clans: [] };
    this.codesData = { codes: [] };
    this.npcsData = { npcs: [] };
    this.tradeHistoryData = [];
    this.worldBossData = null;
    this.playerIdMap = new Map();

    this.dataChanged = {
      playerData: false,
      itemsData: false,
      monstersData: false,
      areasData: false,
      shopsData: false,
      skillsData: false,
      questsData: false,
      achievementsData: false,
      clansData: false,
      codesData: false,
      npcsData: false,
      tradeHistoryData: false,
      worldBossData: false,
    };
  }

  /**
   * Đọc file JSON từ đường dẫn
   * @param {string} filename - Tên file cần đọc
   * @returns {Object|null} - Dữ liệu từ file hoặc null nếu có lỗi
   */
  async readJsonFile(filename) {
    try {
      const filePath = path.join(this.dataPath, filename);
      const data = await fs.readFile(filePath, "utf8");
      return JSON.parse(data);
    } catch (error) {
      console.error(`Lỗi khi đọc file ${filename}:`, error);
      return null;
    }
  }

  /**
   * Ghi dữ liệu vào file JSON
   * @param {string} filename - Tên file cần ghi
   * @param {Object} data - Dữ liệu cần ghi
   * @returns {boolean} - Kết quả ghi file (thành công/thất bại)
   */
  async writeJsonFile(filename, data) {
    try {
      const filePath = path.join(this.dataPath, filename);
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
      return true;
    } catch (error) {
      console.error(`Lỗi khi ghi file ${filename}:`, error);
      return false;
    }
  }

  /**
   * Tải toàn bộ dữ liệu từ file JSON vào bộ nhớ cache
   * @returns {Promise<boolean>} Kết quả tải dữ liệu (thành công/thất bại)
   */
  async loadAllData() {
    try {
      const playerDataJson = (await this.readJsonFile("player-data.json")) || {};
      
      this.playerData = {};
      Object.entries(playerDataJson).forEach(([globalId, playerJson]) => {
        this.playerData[globalId] = new Player(playerJson);
        if (playerJson && playerJson.knownIds) {
          playerJson.knownIds.forEach((playerId) => {
            this.playerIdMap.set(playerId, globalId);
          });
        }
      });
      
      this.itemsData = (await this.readJsonFile("items.json")) || { items: [] };
      this.monstersData = (await this.readJsonFile("monsters.json")) || { monsters: [] };
      this.areasData = (await this.readJsonFile("areas.json")) || { areas: [] };
      this.shopsData = (await this.readJsonFile("shops.json")) || { shops: [] };
      this.skillsData = (await this.readJsonFile("skills.json")) || { skills: [] };
      this.questsData = (await this.readJsonFile("quests.json")) || { quests: [] };
      this.achievementsData = (await this.readJsonFile("achievements.json")) || { achievements: [] };
      this.clansData = (await this.readJsonFile("clans.json")) || { clans: [] };
      this.codesData = (await this.readJsonFile("codes.json")) || { codes: [] };
      this.npcsData = (await this.readJsonFile("npcs.json")) || { npcs: [] };
      this.tradeHistoryData = (await this.readJsonFile("trade-history.json")) || [];
      this.worldBossData = (await this.readJsonFile("worldBossData.json")) || { activeBoss: null, bossHistory: [] };

      return true;
    } catch (error) {
      console.error("Lỗi khi tải dữ liệu:", error);
      return false;
    }
  }

  /**
   * Lưu các dữ liệu đã thay đổi vào file
   * @returns {Promise<boolean>} Kết quả lưu dữ liệu
   */
  async saveChangedData() {
    try {
      if (this.dataChanged.playerData) {
        // Chuyển đổi đối tượng Player thành JSON trước khi lưu
        const playerDataJson = {};
        Object.entries(this.playerData).forEach(([globalId, player]) => {
          playerDataJson[globalId] = player.toJSON();
        });
        
        await this.writeJsonFile("player-data.json", playerDataJson);
        this.dataChanged.playerData = false;
      }
      
      if (this.dataChanged.itemsData) {
        await this.writeJsonFile("items.json", this.itemsData);
        this.dataChanged.itemsData = false;
      }
      if (this.dataChanged.monstersData) {
        await this.writeJsonFile("monsters.json", this.monstersData);
        this.dataChanged.monstersData = false;
      }
      if (this.dataChanged.areasData) {
        await this.writeJsonFile("areas.json", this.areasData);
        this.dataChanged.areasData = false;
      }
      if (this.dataChanged.shopsData) {
        await this.writeJsonFile("shops.json", this.shopsData);
        this.dataChanged.shopsData = false;
      }
      if (this.dataChanged.skillsData) {
        await this.writeJsonFile("skills.json", this.skillsData);
        this.dataChanged.skillsData = false;
      }
      if (this.dataChanged.questsData) {
        await this.writeJsonFile("quests.json", this.questsData);
        this.dataChanged.questsData = false;
      }
      if (this.dataChanged.achievementsData) {
        await this.writeJsonFile("achievements.json", this.achievementsData);
        this.dataChanged.achievementsData = false;
      }
      if (this.dataChanged.clansData) {
        await this.writeJsonFile("clans.json", this.clansData);
        this.dataChanged.clansData = false;
      }
      if (this.dataChanged.codesData) {
        await this.writeJsonFile("codes.json", this.codesData);
        this.dataChanged.codesData = false;
      }
      if (this.dataChanged.npcsData) {
        await this.writeJsonFile("npcs.json", this.npcsData);
        this.dataChanged.npcsData = false;
      }
      if (this.dataChanged.tradeHistoryData) {
        await this.writeJsonFile("trade-history.json", this.tradeHistoryData);
        this.dataChanged.tradeHistoryData = false;
      }
      if (this.dataChanged.worldBossData) {
        await this.writeJsonFile("worldBossData.json", this.worldBossData);
        this.dataChanged.worldBossData = false;
      }
      return true;
    } catch (error) {
      console.error("Lỗi khi lưu dữ liệu:", error);
      return false;
    }
  }

  // GETTER METHODS

  getPlayerData() {
    return this.playerData;
  }

  getItemsData() {
    return this.itemsData;
  }

  getMonstersData() {
    return this.monstersData;
  }

  getAreasData() {
    return this.areasData;
  }

  getShopsData() {
    return this.shopsData;
  }

  getSkillsData() {
    return this.skillsData;
  }

  getQuestsData() {
    return this.questsData;
  }

  getAchievementsData() {
    return this.achievementsData;
  }

  getClansData() {
    return this.clansData;
  }

  getCodesData() {
    return this.codesData;
  }

  getNpcsData() {
    return this.npcsData;
  }

  getTradeHistoryData() {
    return this.tradeHistoryData;
  }

  getWorldBossData() {
    return this.worldBossData;
  }

  getGlobalIdByPlayerId(playerId) {
    return this.playerIdMap.get(playerId);
  }

  /**
   * Lấy thông tin người chơi từ Global ID
   * @param {string} globalId - Global ID của người chơi
   * @returns {Player|null} Thông tin người chơi hoặc null nếu không tìm thấy
   */
  getPlayerByGlobalId(globalId) {
    if (!globalId) return null;
    return this.playerData[globalId] || null;
  }

  /**
   * Lấy thông tin người chơi từ Player ID
   * @param {string} playerId - ID của người chơi
   * @returns {Player|null} Thông tin người chơi hoặc null nếu không tìm thấy
   */
  getPlayerByPlayerId(playerId) {
    if (!playerId) return null;
    const globalId = this.playerIdMap.get(playerId);
    if (!globalId) return null;
    return this.getPlayerByGlobalId(globalId);
  }

  setPlayerIdMap(playerId, globalId) {
    this.playerIdMap.set(playerId, globalId);
  }

  /**
   * Lưu đối tượng Player vào bộ nhớ
   * @param {string} globalId - Global ID của người chơi
   * @param {Player|Object} playerData - Đối tượng Player hoặc dữ liệu JSON
   */
  setPlayerData(globalId, playerData) {
    if (!(playerData instanceof Player)) {
      this.playerData[globalId] = new Player(playerData);
    } else {
      this.playerData[globalId] = playerData;
    }
    
    this.dataChanged.playerData = true;
  }

  markPlayerDataChanged() {
    this.dataChanged.playerData = true;
  }

  markItemsDataChanged() {
    this.dataChanged.itemsData = true;
  }

  markMonstersDataChanged() {
    this.dataChanged.monstersData = true;
  }

  markAreasDataChanged() {
    this.dataChanged.areasData = true;
  }

  markShopsDataChanged() {
    this.dataChanged.shopsData = true;
  }

  markSkillsDataChanged() {
    this.dataChanged.skillsData = true;
  }

  markQuestsDataChanged() {
    this.dataChanged.questsData = true;
  }

  markAchievementsDataChanged() {
    this.dataChanged.achievementsData = true;
  }

  markClansDataChanged() {
    this.dataChanged.clansData = true;
  }

  markCodesDataChanged() {
    this.dataChanged.codesData = true;
  }

  markNpcsDataChanged() {
    this.dataChanged.npcsData = true;
  }

  markTradeHistoryDataChanged() {
    this.dataChanged.tradeHistoryData = true;
  }

  markWorldBossDataChanged() {
    this.dataChanged.worldBossData = true;
  }

  /**
   * Đánh dấu dữ liệu đã thay đổi và lưu nếu cần
   * @param {string} dataType - Loại dữ liệu cần đánh dấu
   * @param {boolean} saveImmediately - Có lưu ngay hay không
   */
  async markDataChanged(dataType, saveImmediately = false) {
    if (this.dataChanged.hasOwnProperty(dataType)) {
      this.dataChanged[dataType] = true;

      if (saveImmediately) {
        await this.saveData(dataType);
      }
    }
  }

  /**
   * Lưu một loại dữ liệu cụ thể
   * @param {string} dataType - Loại dữ liệu cần lưu
   * @returns {Promise<boolean>} - Kết quả lưu dữ liệu
   */
  async saveData(dataType) {
    try {
      switch (dataType) {
        case "playerData":
          // Chuyển đổi đối tượng Player thành JSON trước khi lưu
          const playerDataJson = {};
          Object.entries(this.playerData).forEach(([globalId, player]) => {
            playerDataJson[globalId] = player.toJSON();
          });
          
          await this.writeJsonFile("player-data.json", playerDataJson);
          this.dataChanged.playerData = false;
          break;
        case "itemsData":
          await this.writeJsonFile("items.json", this.itemsData);
          this.dataChanged.itemsData = false;
          break;
        case "monstersData":
          await this.writeJsonFile("monsters.json", this.monstersData);
          this.dataChanged.monstersData = false;
          break;
        case "areasData":
          await this.writeJsonFile("areas.json", this.areasData);
          this.dataChanged.areasData = false;
          break;
        case "shopsData":
          await this.writeJsonFile("shops.json", this.shopsData);
          this.dataChanged.shopsData = false;
          break;
        case "skillsData":
          await this.writeJsonFile("skills.json", this.skillsData);
          this.dataChanged.skillsData = false;
          break;
        case "questsData":
          await this.writeJsonFile("quests.json", this.questsData);
          this.dataChanged.questsData = false;
          break;
        case "achievementsData":
          await this.writeJsonFile("achievements.json", this.achievementsData);
          this.dataChanged.achievementsData = false;
          break;
        case "clans":
        case "clansData":
          await this.writeJsonFile("clans.json", this.clansData);
          this.dataChanged.clansData = false;
          break;
        case "codesData":
          await this.writeJsonFile("codes.json", this.codesData);
          this.dataChanged.codesData = false;
          break;
        case "npcsData":
          await this.writeJsonFile("npcs.json", this.npcsData);
          this.dataChanged.npcsData = false;
          break;
        case "tradeHistoryData":
          await this.writeJsonFile("trade-history.json", this.tradeHistoryData);
          this.dataChanged.tradeHistoryData = false;
          break;
        case "worldBossData":
          await this.writeJsonFile("worldBossData.json", this.worldBossData);
          this.dataChanged.worldBossData = false;
          break;
        default:
          return false;
      }
      return true;
    } catch (error) {
      console.error(`Lỗi khi lưu dữ liệu ${dataType}:`, error);
      return false;
    }
  }

  setWorldBossData(data) {
    this.worldBossData = data;
    this.dataChanged.worldBossData = true;
  }

}

let instance = null;

export function getGameDataInstance() {
  if (!instance) {
    instance = new GameData();
  }
  return instance;
}
