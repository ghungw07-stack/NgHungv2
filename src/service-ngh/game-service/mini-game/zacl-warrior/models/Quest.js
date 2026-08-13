/**
 * Quest.js
 * Module xử lý logic liên quan đến nhiệm vụ
 */

import { Entity } from '../core/Entity.js';

export class Quest extends Entity {
  constructor(questData) {
    super(questData.id, questData.name, questData.description || '');
    this.type = questData.type || 'main'; // main, side, daily, weekly
    this.level = questData.level || 1;
    this.requirements = questData.requirements || {
      level: 1,
      prerequisiteQuests: []
    };
    this.objectives = questData.objectives || [];
    this.rewards = questData.rewards || {
      exp: 0,
      gold: 0,
      items: []
    };
    this.status = questData.status || 'available'; // available, active, completed, failed
    this.progress = questData.progress || {};
    this.startedAt = questData.startedAt || null;
    this.completedAt = questData.completedAt || null;
    this.expiresAt = questData.expiresAt || null;
    this.dropChances = questData.dropChances || {}; // Tỉ lệ rơi vật phẩm của quái cho nhiệm vụ này
    this.data = questData; // Lưu trữ dữ liệu gốc
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
      requirements: this.requirements,
      objectives: this.objectives,
      rewards: this.rewards,
      status: this.status,
      progress: this.progress,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      expiresAt: this.expiresAt,
      dropChances: this.dropChances
    };
  }

  /**
   * Tạo một quest mới
   * @param {Object} questData - Dữ liệu quest
   * @returns {Quest} - Đối tượng quest mới
   */
  static create(questData) {
    return new Quest(questData);
  }

  /**
   * Kiểm tra xem quest có khả dụng không
   * @returns {boolean} - Kết quả kiểm tra
   */
  isAvailable() {
    return this.status === 'available';
  }

  /**
   * Kiểm tra xem quest có đang hoạt động không
   * @returns {boolean} - Kết quả kiểm tra
   */
  isActive() {
    return this.status === 'active';
  }

  /**
   * Kiểm tra xem quest đã hoàn thành chưa
   * @returns {boolean} - Kết quả kiểm tra
   */
  isCompleted() {
    return this.status === 'completed';
  }

  /**
   * Kiểm tra xem quest đã thất bại chưa
   * @returns {boolean} - Kết quả kiểm tra
   */
  isFailed() {
    return this.status === 'failed';
  }

  /**
   * Kiểm tra xem quest đã hết hạn chưa
   * @returns {boolean} - Kết quả kiểm tra
   */
  isExpired() {
    return this.expiresAt && this.expiresAt < Date.now();
  }

  /**
   * Bắt đầu quest
   * @returns {boolean} - Kết quả bắt đầu quest
   */
  start() {
    if (!this.isAvailable()) return false;
    
    this.status = 'active';
    this.startedAt = Date.now();
    
    // Khởi tạo tiến trình cho các mục tiêu
    if (this.objectives && this.objectives.length > 0) {
      this.objectives.forEach(objective => {
        if (!objective.progress) objective.progress = 0;
        if (objective.completed === undefined) objective.completed = false;
      });
    }
    
    return true;
  }

  /**
   * Hoàn thành quest
   * @returns {boolean} - Kết quả hoàn thành quest
   */
  complete() {
    if (!this.isActive()) return false;
    
    this.status = 'completed';
    this.completedAt = Date.now();
    return true;
  }

  /**
   * Đánh dấu quest thất bại
   * @returns {boolean} - Kết quả đánh dấu thất bại
   */
  fail() {
    if (!this.isActive()) return false;
    
    this.status = 'failed';
    return true;
  }

  /**
   * Cập nhật tiến độ quest
   * @param {string} type - Loại mục tiêu (kill, collect, talk, explore)
   * @param {string} targetId - ID mục tiêu
   * @param {number} amount - Số lượng tiến độ
   * @returns {Object} - Kết quả cập nhật tiến độ
   */
  updateProgress(type, targetId, amount = 1) {
    if (!this.isActive()) return { success: false, message: "Nhiệm vụ không hoạt động" };
    
    // Tìm tất cả mục tiêu phù hợp với loại và ID
    const matchingObjectives = this.objectives.filter(obj => 
      obj.type === type && 
      (obj.targetId === targetId || 
       (Array.isArray(obj.targetId) && obj.targetId.includes(targetId)))
    );
    
    if (matchingObjectives.length === 0) {
      return { 
        success: false, 
        message: "Không tìm thấy mục tiêu phù hợp",
        updated: false
      };
    }
    
    let updated = false;
    
    // Cập nhật tiến trình cho tất cả mục tiêu phù hợp
    matchingObjectives.forEach(objective => {
      if (objective.completed) return; // Bỏ qua mục tiêu đã hoàn thành
      
      // Khởi tạo tiến trình nếu chưa có
      if (!objective.progress) objective.progress = 0;
      
      // Tăng tiến trình
      objective.progress += amount;
      
      // Kiểm tra hoàn thành
      if (objective.progress >= (objective.required || 1)) {
        objective.progress = objective.required || 1;
        objective.completed = true;
      }
      
      updated = true;
    });
    
    // Kiểm tra hoàn thành tất cả mục tiêu
    const allCompleted = this.checkObjectivesCompleted();
    
    return {
      success: true,
      updated,
      allCompleted,
      type,
      targetId,
      amount
    };
  }

  /**
   * Kiểm tra tỉ lệ rơi vật phẩm khi tiêu diệt quái
   * @param {string} monsterId - ID của quái vật
   * @returns {Array} - Danh sách vật phẩm nhận được
   */
  checkDropItems(monsterId) {
    if (!this.dropChances || !this.dropChances[monsterId]) {
      return []; // Không có vật phẩm rơi cho quái này
    }
    
    const droppedItems = [];
    const dropTable = this.dropChances[monsterId];
    
    for (const [itemId, chance] of Object.entries(dropTable)) {
      // Tạo số ngẫu nhiên từ 0 đến 100
      const randomValue = Math.random() * 100;
      
      // Nếu số ngẫu nhiên nhỏ hơn cơ hội rơi, thêm vào danh sách
      if (randomValue < chance) {
        droppedItems.push({
          id: itemId,
          amount: 1 // Có thể mở rộng để hỗ trợ số lượng ngẫu nhiên
        });
      }
    }
    
    return droppedItems;
  }

  /**
   * Kiểm tra xem quest đã hoàn thành tất cả mục tiêu chưa
   * @returns {boolean} - Kết quả kiểm tra
   */
  checkObjectivesCompleted() {
    if (!this.objectives || this.objectives.length === 0) return true;
    
    return this.objectives.every(objective => objective.completed === true);
  }

  /**
   * Lấy tiến độ hiện tại của quest
   * @returns {Object} - Thông tin tiến độ
   */
  getProgress() {
    return {
      objectives: this.objectives.map(objective => ({
        id: objective.id || `${objective.type}_${objective.targetId}`,
        type: objective.type,
        targetId: objective.targetId,
        targetName: objective.targetName,
        required: objective.required || 1,
        current: objective.progress || 0,
        completed: objective.completed || false,
        description: objective.description || ''
      })),
      completed: this.checkObjectivesCompleted()
    };
  }

  /**
   * Lấy phần thưởng của quest
   * @returns {Object} - Thông tin phần thưởng
   */
  getRewards() {
    return { ...this.rewards };
  }
  
  /**
   * Kiểm tra và cập nhật tiến trình cho mục tiêu thu thập
   * @param {string} itemId - ID vật phẩm
   * @param {number} amount - Số lượng
   * @returns {Object} - Kết quả cập nhật
   */
  updateCollectionProgress(itemId, amount = 1) {
    return this.updateProgress('collect', itemId, amount);
  }
  
  /**
   * Kiểm tra và cập nhật tiến trình cho mục tiêu tiêu diệt quái
   * @param {string} monsterId - ID quái vật
   * @param {number} amount - Số lượng
   * @returns {Object} - Kết quả cập nhật
   */
  updateKillProgress(monsterId, amount = 1) {
    return this.updateProgress('kill', monsterId, amount);
  }
  
  /**
   * Kiểm tra và cập nhật tiến trình cho mục tiêu nói chuyện với NPC
   * @param {string} npcId - ID NPC
   * @returns {Object} - Kết quả cập nhật
   */
  updateTalkProgress(npcId) {
    return this.updateProgress('talk', npcId, 1);
  }
  
  /**
   * Kiểm tra và cập nhật tiến trình cho mục tiêu khám phá khu vực
   * @param {string} locationId - ID khu vực
   * @returns {Object} - Kết quả cập nhật
   */
  updateExploreProgress(locationId) {
    return this.updateProgress('explore', locationId, 1);
  }
  
  /**
   * Lấy mục tiêu theo loại
   * @param {string} type - Loại mục tiêu (kill, collect, talk, explore)
   * @returns {Array} - Danh sách mục tiêu thuộc loại đã chọn
   */
  getObjectivesByType(type) {
    if (!this.objectives) return [];
    
    return this.objectives.filter(objective => objective.type === type);
  }
}

export default Quest; 