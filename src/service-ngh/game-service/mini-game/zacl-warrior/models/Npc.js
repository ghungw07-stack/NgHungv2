/**
 * Npc.js
 * Module xử lý logic liên quan đến NPC
 */

import { Entity } from '../core/Entity.js';
import { getGameDataInstance } from '../core/GameData.js';

export class Npc extends Entity {
  constructor(npcData) {
    super(npcData.id, npcData.name, npcData.description || '');
    this.role = npcData.role || 'general'; // general, quest, shop, skill, inn, etc.
    this.location = npcData.location || '';
    this.dialogs = npcData.dialogs || [];
    this.dialogIndex = 0; // Vị trí hiện tại trong mảng đối thoại
    this.questDialogs = npcData.questDialogs || {}; // Đối thoại riêng cho từng nhiệm vụ
    this.quests = npcData.quests || [];
    this.shopId = npcData.shopId || null;
    this.services = npcData.services || [];
    this.defaultDialog = npcData.defaultDialog || `${this.getName()} không nói gì cả.`;
    this.data = npcData; // Lưu trữ dữ liệu gốc
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
      role: this.role,
      location: this.location,
      dialogs: this.dialogs,
      questDialogs: this.questDialogs,
      quests: this.quests,
      shopId: this.shopId,
      services: this.services,
      defaultDialog: this.defaultDialog
    };
  }

  /**
   * Lấy lời thoại của NPC
   * @param {string} dialogId - ID lời thoại
   * @param {Object} params - Các tham số để thay thế trong lời thoại
   * @returns {string} - Lời thoại
   */
  getDialog(dialogId = 'default', params = {}) {
    let text = '';
    
    if (dialogId === 'default') {
      // Sử dụng lời thoại mặc định từ mảng dialogs
      if (Array.isArray(this.dialogs) && this.dialogs.length > 0) {
        text = this.dialogs[Math.floor(Math.random() * this.dialogs.length)];
      } else {
        text = this.defaultDialog;
      }
    } else {
      // Tìm lời thoại theo ID
      if (this.questDialogs && this.questDialogs[dialogId]) {
        text = this.questDialogs[dialogId];
      } else {
        text = this.defaultDialog;
      }
    }
    
    // Thay thế các tham số trong lời thoại
    Object.keys(params).forEach(key => {
      const regex = new RegExp(`{${key}}`, 'g');
      text = text.replace(regex, params[key]);
    });
    
    return text;
  }

  /**
   * Lấy lời thoại tuần tự của NPC
   * @param {Object} playerProgress - Tiến trình đối thoại với NPC của người chơi
   * @param {Object} params - Các tham số để thay thế trong lời thoại
   * @returns {string} - Lời thoại
   */
  getSequentialDialog(playerProgress, params = {}) {
    if (!Array.isArray(this.dialogs) || this.dialogs.length === 0) {
      return this.defaultDialog;
    }
    
    // Lấy chỉ số đối thoại hiện tại từ tiến trình người chơi hoặc giá trị mặc định
    let dialogIndex = 0;
    
    if (playerProgress && playerProgress.npcDialogs && 
        playerProgress.npcDialogs[this.getId()] !== undefined) {
      dialogIndex = playerProgress.npcDialogs[this.getId()];
    }
    
    // Lấy lời thoại theo chỉ số
    let text = this.dialogs[dialogIndex % this.dialogs.length];
    
    // Thay thế các tham số trong lời thoại
    Object.keys(params).forEach(key => {
      const regex = new RegExp(`{${key}}`, 'g');
      text = text.replace(regex, params[key]);
    });
    
    return text;
  }

  /**
   * Lấy lời thoại liên quan đến nhiệm vụ
   * @param {string} questId - ID của nhiệm vụ
   * @param {string} stage - Không sử dụng, giữ cho tương thích ngược
   * @param {Object} params - Các tham số để thay thế trong lời thoại
   * @returns {string} - Lời thoại
   */
  getQuestDialog(questId, stage, params = {}) {
    if (!this.questDialogs || !this.questDialogs[questId]) {
      return this.getDialog('default', params);
    }
    
    // Sử dụng default hoặc lời thoại mặc định, bỏ qua stage
    let text;
    const questDialog = this.questDialogs[questId];
    
    if (typeof questDialog === 'string') {
      text = questDialog;
    } else if (questDialog.default) {
      text = questDialog.default;
    } else {
      text = this.getDialog('default', params);
    }
    
    // Thay thế các tham số trong lời thoại
    Object.keys(params).forEach(key => {
      const regex = new RegExp(`{${key}}`, 'g');
      text = text.replace(regex, params[key]);
    });
    
    return text;
  }

  /**
   * Cập nhật chỉ số đối thoại trong tiến trình người chơi
   * @param {Object} playerProgress - Tiến trình đối thoại với NPC của người chơi
   * @returns {Object} - Tiến trình đã cập nhật
   */
  updateDialogIndex(playerProgress) {
    if (!playerProgress.npcDialogs) {
      playerProgress.npcDialogs = {};
    }
    
    // Khởi tạo hoặc tăng chỉ số đối thoại
    if (playerProgress.npcDialogs[this.getId()] === undefined) {
      playerProgress.npcDialogs[this.getId()] = 0;
    } else {
      playerProgress.npcDialogs[this.getId()] = 
        (playerProgress.npcDialogs[this.getId()] + 1) % this.dialogs.length;
    }
    
    return playerProgress;
  }

  /**
   * Kiểm tra xem NPC có cung cấp dịch vụ cụ thể không
   * @param {string} serviceType - Loại dịch vụ
   * @returns {boolean} - Kết quả
   */
  providesService(serviceType) {
    return this.services.includes(serviceType);
  }

  /**
   * Lấy danh sách nhiệm vụ của NPC
   * @returns {Array} - Danh sách ID nhiệm vụ
   */
  getQuestIds() {
    return [...this.quests];
  }

  /**
   * Lấy ID cửa hàng của NPC
   * @returns {string|null} - ID cửa hàng
   */
  getShopId() {
    return this.shopId;
  }

  /**
   * Lấy mô tả chi tiết về NPC
   * @returns {string} - Mô tả chi tiết
   */
  getDetailedDescription() {
    let desc = `${this.getName()}\n\n`;
    
    if (this.getDescription()) {
      desc += `${this.getDescription()}\n\n`;
    }
    
    // Vai trò và vị trí
    desc += `Vai trò: ${this.getRoleName()}\n`;
    if (this.location) {
      desc += `Vị trí: ${this.location}\n`;
    }
    
    // Dịch vụ
    if (this.services.length > 0) {
      desc += `\nDịch vụ:\n`;
      this.services.forEach(service => {
        desc += `- ${this.getServiceName(service)}\n`;
      });
    }
    
    // Nhiệm vụ
    if (this.quests.length > 0) {
      desc += `\nNhiệm vụ:\n`;
      desc += `- ${this.quests.length} nhiệm vụ có sẵn\n`;
    }
    
    // Cửa hàng
    if (this.shopId) {
      desc += `\nCửa hàng: #${this.shopId}\n`;
    }
    
    return desc;
  }

  /**
   * Lấy tên hiển thị của vai trò NPC
   * @returns {string} - Tên vai trò
   */
  getRoleName() {
    const roleNames = {
      'general': 'NPC thường',
      'quest': 'Người cung cấp nhiệm vụ',
      'shop': 'Chủ cửa hàng',
      'skill': 'Người dạy kỹ năng',
      'inn': 'Chủ nhà trọ',
      'blacksmith': 'Thợ rèn',
      'guard': 'Lính gác',
      'healer': 'Người chữa trị',
      'banker': 'Nhân viên ngân hàng',
      'guild': 'Nhân viên guild',
      'stable': 'Người giữ ngựa'
    };
    
    return roleNames[this.role] || this.role;
  }

  /**
   * Lấy tên hiển thị của dịch vụ
   * @param {string} service - Mã dịch vụ
   * @returns {string} - Tên dịch vụ
   */
  getServiceName(service) {
    const serviceNames = {
      'heal': 'Chữa trị',
      'sell': 'Mua bán',
      'repair': 'Sửa chữa',
      'enchant': 'Phù phép',
      'storage': 'Kho đồ',
      'bank': 'Ngân hàng',
      'travel': 'Di chuyển',
      'learn': 'Học kỹ năng',
      'rest': 'Nghỉ ngơi',
      'quest': 'Nhiệm vụ',
      'craft': 'Chế tạo',
      'identify': 'Nhận dạng vật phẩm'
    };
    
    return serviceNames[service] || service;
  }
}

export default Npc; 