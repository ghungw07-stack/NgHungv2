/**
 * Area.js
 * Module xử lý logic liên quan đến khu vực
 */

import { Entity } from '../core/Entity.js';
import Player from './Player.js';

export class Area extends Entity {
  constructor(areaData) {
    super(areaData.id, areaData.name, areaData.description || '');
    this.type = areaData.type || 'normal'; // normal, dungeon, town, etc.
    this.level = areaData.level || 1;
    this.monsters = areaData.monsters || [];
    this.npcs = areaData.npcs || [];
    this.items = areaData.items || [];
    this.connections = areaData.connections || [];
    this.requirements = areaData.requirements || {
      level: 1,
      quests: []
    };
    this.data = areaData; // Lưu trữ dữ liệu gốc
  }

  /**
   * Chuyển đổi đối tượng thành dạng JSON để lưu trữ
   * @returns {Object} - Dữ liệu JSON
   */
  toJSON() {
    return {
      id: this.getId(),
      name: this.getName(),
      description: this.getDescription(),
      type: this.type,
      level: this.level,
      monsters: this.monsters,
      npcs: this.npcs,
      items: this.items,
      connections: this.connections,
      requirements: this.requirements
    };
  }

  /**
   * Tạo một khu vực mới
   * @param {Object} areaData - Dữ liệu khu vực
   * @returns {Area} - Đối tượng khu vực mới
   */
  static create(areaData) {
    return new Area(areaData);
  }

  /**
   * Kiểm tra xem người chơi có thể vào khu vực không
   * @param {Player} player - Đối tượng người chơi
   * @returns {boolean} - Kết quả kiểm tra
   */
  canPlayerEnter(player) {
    // Kiểm tra cấp độ
    if (player.level < this.requirements.level) return false;
    
    // Kiểm tra nhiệm vụ
    if (this.requirements.quests.length > 0) {
      const completedQuests = player.quests.filter(q => q.status === 'completed');
      const hasRequiredQuests = this.requirements.quests.every(questId => 
        completedQuests.some(q => q.id === questId)
      );
      if (!hasRequiredQuests) return false;
    }
    
    return true;
  }

  /**
   * Lấy danh sách quái vật trong khu vực
   * @returns {Array} - Danh sách quái vật
   */
  getMonsters() {
    return [...this.monsters];
  }

  /**
   * Lấy danh sách NPC trong khu vực
   * @returns {Array} - Danh sách NPC
   */
  getNpcs() {
    return [...this.npcs];
  }

  /**
   * Lấy danh sách vật phẩm trong khu vực
   * @returns {Array} - Danh sách vật phẩm
   */
  getItems() {
    return [...this.items];
  }

  /**
   * Lấy danh sách kết nối với các khu vực khác
   * @returns {Array} - Danh sách kết nối
   */
  getConnections() {
    return [...this.connections];
  }

  /**
   * Kiểm tra xem khu vực có kết nối với khu vực khác không
   * @param {string} areaId - ID khu vực cần kiểm tra
   * @returns {boolean} - Kết quả kiểm tra
   */
  isConnectedTo(areaId) {
    return this.connections.some(conn => conn.id === areaId);
  }

  /**
   * Thêm quái vật vào khu vực
   * @param {Object} monster - Thông tin quái vật
   * @returns {boolean} - Kết quả thêm
   */
  addMonster(monster) {
    if (!monster || !monster.id) return false;
    
    this.monsters.push(monster);
    return true;
  }

  /**
   * Thêm NPC vào khu vực
   * @param {Object} npc - Thông tin NPC
   * @returns {boolean} - Kết quả thêm
   */
  addNpc(npc) {
    if (!npc || !npc.id) return false;
    
    this.npcs.push(npc);
    return true;
  }

  /**
   * Thêm vật phẩm vào khu vực
   * @param {Object} item - Thông tin vật phẩm
   * @returns {boolean} - Kết quả thêm
   */
  addItem(item) {
    if (!item || !item.id) return false;
    
    this.items.push(item);
    return true;
  }

  /**
   * Thêm kết nối với khu vực khác
   * @param {Object} connection - Thông tin kết nối
   * @returns {boolean} - Kết quả thêm
   */
  addConnection(connection) {
    if (!connection || !connection.id) return false;
    
    this.connections.push(connection);
    return true;
  }

  /**
   * Xóa quái vật khỏi khu vực
   * @param {string} monsterId - ID quái vật
   * @returns {boolean} - Kết quả xóa
   */
  removeMonster(monsterId) {
    const index = this.monsters.findIndex(m => m.id === monsterId);
    if (index === -1) return false;
    
    this.monsters.splice(index, 1);
    return true;
  }

  /**
   * Xóa NPC khỏi khu vực
   * @param {string} npcId - ID NPC
   * @returns {boolean} - Kết quả xóa
   */
  removeNpc(npcId) {
    const index = this.npcs.findIndex(n => n.id === npcId);
    if (index === -1) return false;
    
    this.npcs.splice(index, 1);
    return true;
  }

  /**
   * Xóa vật phẩm khỏi khu vực
   * @param {string} itemId - ID vật phẩm
   * @returns {boolean} - Kết quả xóa
   */
  removeItem(itemId) {
    const index = this.items.findIndex(i => i.id === itemId);
    if (index === -1) return false;
    
    this.items.splice(index, 1);
    return true;
  }

  /**
   * Xóa kết nối với khu vực khác
   * @param {string} areaId - ID khu vực
   * @returns {boolean} - Kết quả xóa
   */
  removeConnection(areaId) {
    const index = this.connections.findIndex(c => c.id === areaId);
    if (index === -1) return false;
    
    this.connections.splice(index, 1);
    return true;
  }
} 