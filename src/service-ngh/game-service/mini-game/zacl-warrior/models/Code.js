/**
 * Code.js
 * Module xử lý logic liên quan đến mã khuyến mãi/giftcode
 */

import { Entity } from '../core/Entity.js';

export class Code extends Entity {
  constructor(codeData) {
    super(codeData.id, codeData.name || codeData.id, codeData.description || '');
    this.code = codeData.code || codeData.id;
    this.rewards = codeData.rewards || {
      gold: 0,
      exp: 0,
      items: []
    };
    this.maxUses = codeData.maxUses || 1; // Số lần sử dụng tối đa (-1 là không giới hạn)
    this.currentUses = codeData.currentUses || 0; // Số lần đã sử dụng
    this.userLimit = codeData.userLimit || 1; // Số lần sử dụng tối đa của mỗi người chơi
    this.expireDate = codeData.expireDate || null; // Thời gian hết hạn (null là không giới hạn)
    this.isActive = codeData.isActive !== undefined ? codeData.isActive : true; // Trạng thái kích hoạt
    this.requiredLevel = codeData.requiredLevel || 0; // Yêu cầu cấp độ tối thiểu
    this.usedUsers = codeData.usedUsers || {}; // Lưu trữ người chơi đã sử dụng và số lần sử dụng
    this.createdAt = codeData.createdAt || Date.now();
    this.data = codeData; // Lưu trữ dữ liệu gốc
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
      code: this.code,
      rewards: this.rewards,
      maxUses: this.maxUses,
      currentUses: this.currentUses,
      userLimit: this.userLimit,
      expireDate: this.expireDate,
      isActive: this.isActive,
      requiredLevel: this.requiredLevel,
      usedUsers: this.usedUsers,
      createdAt: this.createdAt
    };
  }

  /**
   * Kiểm tra xem mã code có hợp lệ và có thể sử dụng không
   * @returns {boolean} - Kết quả kiểm tra
   */
  isValid() {
    // Kiểm tra trạng thái kích hoạt
    if (!this.isActive) return false;
    
    // Kiểm tra số lần sử dụng
    if (this.maxUses !== -1 && this.currentUses >= this.maxUses) return false;
    
    // Kiểm tra thời gian hết hạn
    if (this.expireDate && Date.now() > this.expireDate) return false;
    
    return true;
  }

  /**
   * Kiểm tra xem người chơi có thể sử dụng mã code không
   * @param {string} userId - ID người chơi
   * @param {number} playerLevel - Cấp độ người chơi
   * @returns {Object} - Kết quả kiểm tra và lý do
   */
  canUse(userId, playerLevel) {
    // Kiểm tra trạng thái mã code
    if (!this.isValid()) {
      return {
        canUse: false,
        reason: 'Mã code không hợp lệ hoặc đã hết hạn.'
      };
    }
    
    // Kiểm tra cấp độ người chơi
    if (playerLevel < this.requiredLevel) {
      return {
        canUse: false,
        reason: `Cần đạt cấp độ ${this.requiredLevel} để sử dụng mã code này.`
      };
    }
    
    // Kiểm tra số lần sử dụng của người chơi
    const userUses = this.usedUsers[userId] || 0;
    if (userUses >= this.userLimit) {
      return {
        canUse: false,
        reason: 'Bạn đã sử dụng hết số lần cho phép của mã code này.'
      };
    }
    
    return {
      canUse: true,
      reason: 'Bạn có thể sử dụng mã code này.'
    };
  }

  /**
   * Sử dụng mã code cho người chơi
   * @param {string} userId - ID người chơi
   * @returns {Object} - Phần thưởng từ mã code
   */
  use(userId) {
    // Tăng số lần sử dụng chung
    this.currentUses += 1;
    
    // Tăng số lần sử dụng của người chơi
    if (!this.usedUsers[userId]) {
      this.usedUsers[userId] = 0;
    }
    this.usedUsers[userId] += 1;
    
    // Trả về phần thưởng
    return { ...this.rewards };
  }

  /**
   * Lấy mô tả chi tiết về mã code
   * @returns {string} - Mô tả chi tiết
   */
  getDetailedDescription() {
    let desc = `📋 Mã Code: ${this.code}\n\n`;
    
    if (this.getName() !== this.code) {
      desc += `Tên: ${this.getName()}\n`;
    }
    
    if (this.getDescription()) {
      desc += `${this.getDescription()}\n\n`;
    }
    
    // Trạng thái
    desc += `Trạng thái: ${this.isActive ? '✅ Đang hoạt động' : '❌ Không hoạt động'}\n`;
    
    // Thời gian hết hạn
    if (this.expireDate) {
      const expireDate = new Date(this.expireDate);
      const isExpired = Date.now() > this.expireDate;
      
      desc += `Hết hạn: ${expireDate.toLocaleString()}`;
      if (isExpired) {
        desc += ' (Đã hết hạn)';
      }
      desc += '\n';
    } else {
      desc += 'Hết hạn: Không giới hạn\n';
    }
    
    // Số lần sử dụng
    if (this.maxUses === -1) {
      desc += `Sử dụng: ${this.currentUses} (Không giới hạn)\n`;
    } else {
      desc += `Sử dụng: ${this.currentUses}/${this.maxUses}\n`;
    }
    
    // Giới hạn người chơi
    desc += `Giới hạn mỗi người: ${this.userLimit} lần\n`;
    
    // Yêu cầu cấp độ
    if (this.requiredLevel > 0) {
      desc += `Yêu cầu cấp độ: ${this.requiredLevel}\n`;
    }
    
    // Phần thưởng
    desc += `\n🎁 Phần thưởng:\n`;
    if (this.rewards.gold > 0) {
      desc += `- Vàng: ${this.rewards.gold}\n`;
    }
    if (this.rewards.exp > 0) {
      desc += `- Kinh nghiệm: ${this.rewards.exp}\n`;
    }
    if (this.rewards.items && this.rewards.items.length > 0) {
      desc += `- Vật phẩm:\n`;
      this.rewards.items.forEach(item => {
        desc += `  • ${item.itemId} x${item.amount || 1}\n`;
      });
    }
    
    return desc;
  }
} 